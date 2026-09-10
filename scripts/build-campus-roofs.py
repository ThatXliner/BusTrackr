#!/usr/bin/env python3
"""Build measured campus roof meshes from classified USGS LiDAR points."""

from __future__ import annotations

import argparse
from collections import Counter
import json
import math
import os
from pathlib import Path
import tempfile
from dataclasses import dataclass
from typing import Any

import laspy
import numpy as np
from pyproj import Transformer
from scipy.spatial import Delaunay, cKDTree


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / ".cache-local-scene" / "campus.laz"
FOOTPRINTS_PATH = PROJECT_ROOT / "public" / "local-scene" / "footprints.json"
ELEVATION_PATH = PROJECT_ROOT / "public" / "terrain" / "elevation.json"
OUTPUT_PATH = PROJECT_ROOT / "public" / "local-scene" / "campus-roofs.json"

SOURCE_URL = (
    "https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/LPC/Projects/"
    "CA_SantaClaraCounty_2020_A20/CA_SantaClaraCounty_2020/LAZ/"
    "USGS_LPC_CA_SantaClaraCounty_2020_A20_17509250.laz"
)

TARGET_BUILDINGS = ("250869139", "643481605", "643481608")
CAMPUS_BOUNDS = (-121.828, 37.2754, -121.8248, 37.2767)
ORIGIN_LON = -121.832
ORIGIN_LAT = 37.278
METERS_PER_LON = 88400.0
METERS_PER_LAT = 111000.0
US_SURVEY_FOOT_TO_METER = 0.3048006096012192
CHUNK_SIZE = 1_000_000
GRID_SPACING = 1.5
BOUNDARY_TOLERANCE = 1e-4
NEIGHBOR_COUNT = 8
CELL_SIZE = 0.5
PLANE_RANSAC_CANDIDATES = 300
PLANE_SLOPE_LIMIT = 1.2
PLANE_RESIDUAL_TOLERANCE = 0.20
MIN_PLANE_SUPPORT_CELLS = 400
MAX_PLANES = 20
PLANE_NEIGHBOR_RADIUS = 5.0
FALLBACK_NEIGHBOR_COUNT = 32
RANSAC_SEED = 42
RISER_HEIGHT_THRESHOLD = 0.05

Point = np.ndarray


@dataclass(frozen=True)
class RoofPlane:
    """A refit roof plane and the downsampled XY cells supporting it."""

    coefficients: np.ndarray
    inlier_points: Point


@dataclass(frozen=True)
class RoofReconstruction:
    """Downsampled roof observations and the planes reconstructed from them."""

    cells: Point
    heights: np.ndarray
    planes: list[RoofPlane]
    cell_tree: cKDTree
    plane_trees: list[cKDTree]


@dataclass(frozen=True)
class TriangleSurface:
    """One retained Delaunay triangle with a single surface plane."""

    candidate_indices: tuple[int, int, int]
    plane_id: int
    heights: np.ndarray
    center: Point


@dataclass(frozen=True)
class EdgeUse:
    """One triangle's oriented use of an edge."""

    triangle_index: int
    start: int
    end: int
    start_height: float
    end_height: float
    center: Point


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as source:
        return json.load(source)


def load_target_rings(path: Path) -> dict[str, Point]:
    payload = load_json(path)
    if not isinstance(payload, dict) or not isinstance(payload.get("buildings"), list):
        raise RuntimeError(f"{path} must contain a buildings list")

    rings: dict[str, Point] = {}
    for building in payload["buildings"]:
        if not isinstance(building, dict):
            continue
        building_id = str(building.get("id"))
        if building_id not in TARGET_BUILDINGS:
            continue
        if building_id in rings:
            raise RuntimeError(f"Duplicate footprint for building {building_id}")
        raw_ring = building.get("ring")
        if not isinstance(raw_ring, list):
            raise RuntimeError(f"Building {building_id} footprint has no ring")
        try:
            ring_lonlat = np.asarray(raw_ring, dtype=np.float64)
        except (TypeError, ValueError) as error:
            raise RuntimeError(f"Building {building_id} footprint ring is invalid") from error
        if ring_lonlat.ndim != 2 or ring_lonlat.shape[1] != 2:
            raise RuntimeError(f"Building {building_id} footprint ring must contain [lon, lat] pairs")
        if len(ring_lonlat) > 1 and np.array_equal(ring_lonlat[0], ring_lonlat[-1]):
            ring_lonlat = ring_lonlat[:-1]
        if len(ring_lonlat) < 3 or not np.isfinite(ring_lonlat).all():
            raise RuntimeError(f"Building {building_id} footprint ring is invalid")
        rings[building_id] = localize_lonlat(ring_lonlat)

    missing = [building_id for building_id in TARGET_BUILDINGS if building_id not in rings]
    if missing:
        raise RuntimeError(
            "Missing required campus footprint(s): " + ", ".join(missing)
        )
    return rings


def validate_elevation(path: Path) -> None:
    """Validate the bundled DEM used by the renderer's NAVD88 scene surface."""

    payload = load_json(path)
    if not isinstance(payload, dict):
        raise RuntimeError(f"{path} must contain a DEM object")
    try:
        width = int(payload["width"])
        height = int(payload["height"])
        values = np.asarray(payload["values"], dtype=np.float64)
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError(f"{path} is missing a valid width, height, or values array") from error
    for field in ("west", "north", "dx", "dy"):
        try:
            value = float(payload[field])
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError(f"{path} is missing valid DEM field {field!r}") from error
        if not math.isfinite(value):
            raise RuntimeError(f"{path} contains non-finite DEM field {field!r}")
    if width < 2 or height < 2 or values.size != width * height:
        raise RuntimeError(f"{path} has inconsistent DEM dimensions")
    if not np.isfinite(values).all():
        raise RuntimeError(f"{path} contains non-finite elevation samples")


def localize_lonlat(lonlat: Point) -> Point:
    """Convert [longitude, latitude] rows to renderer [x, z] rows."""

    local = np.empty_like(lonlat, dtype=np.float64)
    local[:, 0] = (lonlat[:, 0] - ORIGIN_LON) * METERS_PER_LON
    local[:, 1] = (ORIGIN_LAT - lonlat[:, 1]) * METERS_PER_LAT
    return local


def points_in_polygon(points: Point, polygon: Point, batch_size: int = 250_000) -> np.ndarray:
    """Return a vectorized ray-crossing result for [x, z] points."""

    if points.ndim != 2 or points.shape[1] != 2:
        raise ValueError("points must be an [n, 2] array")
    if polygon.ndim != 2 or polygon.shape[1] != 2 or len(polygon) < 3:
        raise ValueError("polygon must contain at least three [x, z] vertices")

    result = np.zeros(len(points), dtype=bool)
    previous = np.roll(polygon, 1, axis=0)
    current_x = polygon[:, 0]
    current_z = polygon[:, 1]
    previous_x = previous[:, 0]
    previous_z = previous[:, 1]
    denominator = previous_z - current_z

    for start in range(0, len(points), batch_size):
        batch = points[start : start + batch_size]
        x = batch[:, 0, None]
        z = batch[:, 1, None]
        crosses = (current_z[None, :] > z) != (previous_z[None, :] > z)
        numerator = (previous_x - current_x)[None, :] * (z - current_z[None, :])
        intersections = np.empty_like(numerator)
        np.divide(
            numerator,
            denominator[None, :],
            out=intersections,
            where=denominator[None, :] != 0.0,
        )
        intersections += current_x[None, :]
        result[start : start + len(batch)] = (
            np.count_nonzero(crosses & (x < intersections), axis=1) % 2 == 1
        )
    return result


def distance_to_polygon(points: Point, polygon: Point) -> np.ndarray:
    """Return each point's distance to the nearest polygon edge in meters."""

    minimum_squared = np.full(len(points), np.inf, dtype=np.float64)
    for start, end in zip(polygon, np.roll(polygon, -1, axis=0)):
        delta = end - start
        length_squared = float(np.dot(delta, delta))
        if length_squared == 0.0:
            distance_squared = np.sum((points - start) ** 2, axis=1)
        else:
            projection = np.clip(
                ((points - start) @ delta) / length_squared,
                0.0,
                1.0,
            )
            nearest = start + projection[:, None] * delta
            distance_squared = np.sum((points - nearest) ** 2, axis=1)
        minimum_squared = np.minimum(minimum_squared, distance_squared)
    return np.sqrt(minimum_squared)


def inside_with_tolerance(points: Point, polygon: Point, tolerance: float) -> np.ndarray:
    inside = points_in_polygon(points, polygon)
    outside = np.flatnonzero(~inside)
    if len(outside):
        inside[outside] = distance_to_polygon(points[outside], polygon) <= tolerance
    return inside


def read_lidar(path: Path) -> tuple[Point, np.ndarray]:
    """Read class-6 points in the fixed campus lon/lat bounds from LAZ chunks."""

    minimum_lon, minimum_lat, maximum_lon, maximum_lat = CAMPUS_BOUNDS
    local_points: list[Point] = []
    heights_meters: list[np.ndarray] = []

    with laspy.open(path) as reader:
        crs = reader.header.parse_crs()
        horizontal_crs = crs
        if crs is not None and crs.is_compound:
            horizontal_crs = next(
                (component for component in crs.sub_crs_list if component.to_epsg() == 6420),
                None,
            )
        if horizontal_crs is None or horizontal_crs.to_epsg() != 6420:
            actual = crs.to_string() if crs is not None else "missing CRS"
            raise RuntimeError(
                "LAZ header must use horizontal EPSG:6420 (US survey feet); "
                f"found {actual}"
            )
        transformer = Transformer.from_crs(horizontal_crs, "EPSG:4326", always_xy=True)

        for points in reader.chunk_iterator(CHUNK_SIZE):
            classification = np.asarray(points.classification)
            class_six = classification == 6
            if not np.any(class_six):
                continue

            source_x = np.asarray(points.x, dtype=np.float64)[class_six]
            source_y = np.asarray(points.y, dtype=np.float64)[class_six]
            source_z = np.asarray(points.z, dtype=np.float64)[class_six]
            longitude, latitude = transformer.transform(source_x, source_y)
            in_bounds = (
                (longitude >= minimum_lon)
                & (longitude <= maximum_lon)
                & (latitude >= minimum_lat)
                & (latitude <= maximum_lat)
            )
            if not np.any(in_bounds):
                continue

            lonlat = np.column_stack((longitude[in_bounds], latitude[in_bounds]))
            local_points.append(localize_lonlat(lonlat))
            heights_meters.append(source_z[in_bounds] * US_SURVEY_FOOT_TO_METER)

    if not local_points:
        raise RuntimeError(
            "No classification-6 LiDAR points found in the campus lon/lat bounds"
        )
    return np.concatenate(local_points), np.concatenate(heights_meters)


def grid_points(polygon: Point) -> Point:
    minimum = polygon.min(axis=0)
    maximum = polygon.max(axis=0)
    start_x = math.floor(minimum[0] / GRID_SPACING) * GRID_SPACING
    end_x = math.ceil(maximum[0] / GRID_SPACING) * GRID_SPACING
    start_z = math.floor(minimum[1] / GRID_SPACING) * GRID_SPACING
    end_z = math.ceil(maximum[1] / GRID_SPACING) * GRID_SPACING
    x_values = np.arange(start_x, end_x + GRID_SPACING * 0.5, GRID_SPACING)
    z_values = np.arange(start_z, end_z + GRID_SPACING * 0.5, GRID_SPACING)
    grid_x, grid_z = np.meshgrid(x_values, z_values, indexing="xy")
    candidates = np.column_stack((grid_x.ravel(), grid_z.ravel()))
    return candidates[points_in_polygon(candidates, polygon)]


def unique_points(points: Point) -> Point:
    """Drop exact duplicate vertices while retaining first-seen order."""

    _, first_indices = np.unique(points, axis=0, return_index=True)
    return points[np.sort(first_indices)]


def downsample_roof_points(
    roof_points: Point,
    roof_heights: np.ndarray,
) -> tuple[Point, np.ndarray]:
    """Reduce class-6 observations to half-meter XY cells with median heights."""

    cell_indices = np.floor(roof_points / CELL_SIZE).astype(np.int64)
    unique_cells, inverse = np.unique(
        cell_indices,
        axis=0,
        return_inverse=True,
    )
    order = np.argsort(inverse, kind="stable")
    sorted_groups = inverse[order]
    boundaries = np.flatnonzero(
        np.r_[True, sorted_groups[1:] != sorted_groups[:-1], True]
    )
    cell_heights = np.empty(len(unique_cells), dtype=np.float64)
    for start, end in zip(boundaries[:-1], boundaries[1:]):
        group = sorted_groups[start]
        cell_heights[group] = np.median(roof_heights[order[start:end]])

    # Cell centers give the plane fit a stable, regular XY support grid.
    cell_points = (unique_cells.astype(np.float64) + 0.5) * CELL_SIZE
    return cell_points, cell_heights


def plane_from_three_points(points: Point, heights: np.ndarray) -> np.ndarray | None:
    """Fit a plane through three cells, or return None for a degenerate sample."""

    matrix = np.column_stack((points, np.ones(3, dtype=np.float64)))
    if abs(float(np.linalg.det(matrix))) <= 1e-12:
        return None
    try:
        coefficients = np.linalg.solve(matrix, heights)
    except np.linalg.LinAlgError:
        return None
    if not np.isfinite(coefficients).all():
        return None
    return coefficients


def refit_plane(points: Point, heights: np.ndarray) -> np.ndarray | None:
    """Refit a plane by least squares over its current inlier cells."""

    matrix = np.column_stack((points, np.ones(len(points), dtype=np.float64)))
    coefficients, _, rank, _ = np.linalg.lstsq(matrix, heights, rcond=None)
    if rank < 3 or not np.isfinite(coefficients).all():
        return None
    return coefficients


def plane_slope(coefficients: np.ndarray) -> float:
    return float(np.hypot(coefficients[0], coefficients[1]))


def fit_roof_planes(cell_points: Point, cell_heights: np.ndarray) -> list[RoofPlane]:
    """Extract up to twenty deterministic RANSAC planes from roof cells."""

    rng = np.random.default_rng(RANSAC_SEED)
    remaining = np.arange(len(cell_points), dtype=np.int64)
    planes: list[RoofPlane] = []

    while len(remaining) >= MIN_PLANE_SUPPORT_CELLS and len(planes) < MAX_PLANES:
        remaining_points = cell_points[remaining]
        remaining_heights = cell_heights[remaining]
        best_inliers: np.ndarray | None = None
        best_coefficients: np.ndarray | None = None
        best_count = 0
        best_residual_score = math.inf

        for _ in range(PLANE_RANSAC_CANDIDATES):
            sample_indices = rng.choice(len(remaining), size=3, replace=False)
            coefficients = plane_from_three_points(
                remaining_points[sample_indices],
                remaining_heights[sample_indices],
            )
            if coefficients is None or plane_slope(coefficients) > PLANE_SLOPE_LIMIT:
                continue
            predicted = (
                remaining_points[:, 0] * coefficients[0]
                + remaining_points[:, 1] * coefficients[1]
                + coefficients[2]
            )
            residual = np.abs(remaining_heights - predicted)
            inliers = residual <= PLANE_RESIDUAL_TOLERANCE
            count = int(np.count_nonzero(inliers))
            if count < MIN_PLANE_SUPPORT_CELLS:
                continue
            residual_score = float(np.sum(np.square(residual[inliers])))
            if count > best_count or (
                count == best_count and residual_score < best_residual_score
            ):
                best_inliers = inliers
                best_coefficients = coefficients
                best_count = count
                best_residual_score = residual_score

        if best_inliers is None or best_coefficients is None:
            break

        coefficients = refit_plane(
            remaining_points[best_inliers],
            remaining_heights[best_inliers],
        )
        if coefficients is None or plane_slope(coefficients) > PLANE_SLOPE_LIMIT:
            break

        predicted = (
            remaining_points[:, 0] * coefficients[0]
            + remaining_points[:, 1] * coefficients[1]
            + coefficients[2]
        )
        inliers = np.abs(remaining_heights - predicted) <= PLANE_RESIDUAL_TOLERANCE
        if np.count_nonzero(inliers) < MIN_PLANE_SUPPORT_CELLS:
            break

        planes.append(RoofPlane(coefficients, remaining_points[inliers].copy()))
        remaining = remaining[~inliers]

    return planes


def observed_median_heights(
    query_points: Point,
    roof_tree: cKDTree,
    roof_heights: np.ndarray,
) -> np.ndarray:
    """Return the current raw-observation median-8 height at each XY query."""

    _, nearest = roof_tree.query(query_points, k=NEIGHBOR_COUNT)
    return np.median(roof_heights[nearest], axis=1)


def reconstruct_heights(
    query_points: Point,
    roof_tree: cKDTree,
    roof_heights: np.ndarray,
    reconstruction: RoofReconstruction,
) -> tuple[np.ndarray, np.ndarray]:
    """Evaluate the nearest compatible plane, with a local cell median fallback."""

    observed = observed_median_heights(query_points, roof_tree, roof_heights)
    heights = np.empty(len(query_points), dtype=np.float64)
    assigned_plane = np.full(len(query_points), -1, dtype=np.int64)

    if reconstruction.planes:
        plane_distances = np.column_stack(
            [tree.query(query_points)[0] for tree in reconstruction.plane_trees]
        )
        plane_values = np.column_stack(
            [
                query_points[:, 0] * plane.coefficients[0]
                + query_points[:, 1] * plane.coefficients[1]
                + plane.coefficients[2]
                for plane in reconstruction.planes
            ]
        )
        plane_error = np.abs(plane_values - observed[:, None])
        plane_error[plane_distances > PLANE_NEIGHBOR_RADIUS] = math.inf
        chosen_plane = np.argmin(plane_error, axis=1).astype(np.int64)
        has_plane = np.isfinite(
            plane_error[np.arange(len(query_points)), chosen_plane]
        )
        assigned_plane[has_plane] = chosen_plane[has_plane]
        heights[has_plane] = plane_values[
            np.arange(len(query_points))[has_plane], assigned_plane[has_plane]
        ]
    else:
        has_plane = np.zeros(len(query_points), dtype=bool)

    fallback = np.flatnonzero(~has_plane)
    if len(fallback):
        count = min(FALLBACK_NEIGHBOR_COUNT, len(reconstruction.cells))
        _, nearest = reconstruction.cell_tree.query(query_points[fallback], k=count)
        if count == 1:
            nearest = nearest[:, None]
        heights[fallback] = np.median(reconstruction.heights[nearest], axis=1)

    return heights, assigned_plane


def evaluate_plane(coefficients: np.ndarray, points: Point) -> np.ndarray:
    return (
        points[:, 0] * coefficients[0]
        + points[:, 1] * coefficients[1]
        + coefficients[2]
    )


def choose_triangle_plane(
    candidate_plane_ids: tuple[int, int, int],
    center_plane_id: int,
) -> int:
    """Choose a shared face plane from vertex assignments and center compatibility."""

    available = [plane_id for plane_id in candidate_plane_ids if plane_id >= 0]
    if not available:
        return -1
    counts = Counter(available)
    plane_id, count = counts.most_common(1)[0]
    if count >= 2 or len(available) == 1:
        return plane_id
    return center_plane_id if center_plane_id >= 0 else -1


def edge_heights(use: EdgeUse, start: int, end: int) -> tuple[float, float]:
    if use.start == start and use.end == end:
        return use.start_height, use.end_height
    if use.start == end and use.end == start:
        return use.end_height, use.start_height
    raise ValueError("edge use does not contain the requested edge")


def roof_mesh(
    polygon: Point,
    roof_points: Point,
    roof_heights: np.ndarray,
    building_id: str,
) -> dict[str, Any]:
    if len(roof_points) < 100:
        raise RuntimeError(
            f"Building {building_id} has only {len(roof_points)} classification-6 "
            "LiDAR points inside its footprint; need at least 100. "
            "No fallback roof data was generated."
        )

    cell_points, cell_heights = downsample_roof_points(roof_points, roof_heights)
    planes = fit_roof_planes(cell_points, cell_heights)
    reconstruction = RoofReconstruction(
        cell_points,
        cell_heights,
        planes,
        cKDTree(cell_points),
        [cKDTree(plane.inlier_points) for plane in planes],
    )
    roof_tree = cKDTree(roof_points)
    candidates = np.vstack((grid_points(polygon), polygon))
    candidates = unique_points(candidates)
    candidate_heights, candidate_planes = reconstruct_heights(
        candidates,
        roof_tree,
        roof_heights,
        reconstruction,
    )
    outline_heights, outline_planes = reconstruct_heights(
        polygon,
        roof_tree,
        roof_heights,
        reconstruction,
    )

    # Suppress isolated equipment-sized label patches without averaging roof heights.
    # The principal levels remain planar; small rooftop details are deliberately omitted.
    candidate_tree = cKDTree(candidates)
    nearby = candidate_tree.query_ball_point(candidates, r=4.5)
    for _ in range(3):
        smoothed = candidate_planes.copy()
        for index, neighbors in enumerate(nearby):
            labels = [int(candidate_planes[n]) for n in neighbors if candidate_planes[n] >= 0]
            if labels:
                smoothed[index] = Counter(labels).most_common(1)[0][0]
        candidate_planes = smoothed
    for plane_id, plane in enumerate(planes):
        selected = candidate_planes == plane_id
        candidate_heights[selected] = evaluate_plane(plane.coefficients, candidates[selected])
    _, outline_nearest = candidate_tree.query(polygon)
    outline_planes = candidate_planes[outline_nearest]
    for index, plane_id in enumerate(outline_planes):
        if plane_id >= 0:
            outline_heights[index] = evaluate_plane(planes[plane_id].coefficients, polygon[index:index+1])[0]

    try:
        triangulation = Delaunay(candidates)
    except Exception as error:
        raise RuntimeError(f"Could not triangulate roof for building {building_id}") from error

    retained_triangles: list[tuple[tuple[int, int, int], Point]] = []
    for simplex in triangulation.simplices:
        a, b, c = (int(value) for value in simplex)
        triangle = candidates[[a, b, c]]
        tests = np.vstack(
            (
                triangle.mean(axis=0),
                (triangle[0] + triangle[1]) * 0.5,
                (triangle[1] + triangle[2]) * 0.5,
                (triangle[2] + triangle[0]) * 0.5,
            )
        )
        if not np.all(inside_with_tolerance(tests, polygon, BOUNDARY_TOLERANCE)):
            continue

        orientation = (
            (triangle[1, 0] - triangle[0, 0]) * (triangle[2, 1] - triangle[0, 1])
            - (triangle[1, 1] - triangle[0, 1]) * (triangle[2, 0] - triangle[0, 0])
        )
        if abs(orientation) <= 1e-12:
            continue
        oriented = (a, c, b) if orientation > 0.0 else (a, b, c)
        retained_triangles.append((oriented, triangle.mean(axis=0)))

    if not retained_triangles:
        raise RuntimeError(f"No in-footprint roof triangles generated for building {building_id}")

    triangle_centers = np.asarray(
        [center for _, center in retained_triangles],
        dtype=np.float64,
    )
    _, center_planes = reconstruct_heights(
        triangle_centers,
        roof_tree,
        roof_heights,
        reconstruction,
    )

    surfaces: list[TriangleSurface] = []
    for triangle_index, (oriented, center) in enumerate(retained_triangles):
        vertex_planes = tuple(candidate_planes[index] for index in oriented)
        plane_id = choose_triangle_plane(vertex_planes, int(center_planes[triangle_index]))
        triangle_points = candidates[list(oriented)]
        if plane_id >= 0:
            triangle_heights = evaluate_plane(
                reconstruction.planes[plane_id].coefficients,
                triangle_points,
            )
        else:
            triangle_heights = candidate_heights[list(oriented)]
        surfaces.append(
            TriangleSurface(
                oriented,
                plane_id,
                triangle_heights,
                center,
            )
        )

    positions: list[float] = []
    indices: list[int] = []
    surface_plane_vertex_count = 0
    edge_uses: dict[tuple[int, int], list[EdgeUse]] = {}
    for triangle_index, surface in enumerate(surfaces):
        base = len(positions) // 3
        triangle_indices = surface.candidate_indices
        triangle_points = candidates[list(triangle_indices)]
        for (x, z), height in zip(triangle_points, surface.heights):
            positions.extend((round_number(x), round_number(height), round_number(z)))
        indices.extend((base, base + 1, base + 2))
        if surface.plane_id >= 0:
            surface_plane_vertex_count += 3
        for edge_index in range(3):
            start_index = triangle_indices[edge_index]
            end_index = triangle_indices[(edge_index + 1) % 3]
            key = tuple(sorted((start_index, end_index)))
            edge_uses.setdefault(key, []).append(
                EdgeUse(
                    triangle_index,
                    start_index,
                    end_index,
                    float(surface.heights[edge_index]),
                    float(surface.heights[(edge_index + 1) % 3]),
                    surface.center,
                )
            )

    riser_quad_count = 0
    riser_vertex_count = 0
    for (start_index, end_index), uses in edge_uses.items():
        # A boundary edge has one retained triangle and stays with the renderer's
        # existing outlineHeights wall contract. Only two-sided interior edges
        # receive a riser between different planar faces.
        if len(uses) != 2:
            continue
        first, second = uses
        first_surface = surfaces[first.triangle_index]
        second_surface = surfaces[second.triangle_index]
        if first_surface.plane_id < 0 or second_surface.plane_id < 0:
            continue
        if first_surface.plane_id == second_surface.plane_id:
            continue

        first_start_height, first_end_height = edge_heights(
            first,
            start_index,
            end_index,
        )
        second_start_height, second_end_height = edge_heights(
            second,
            start_index,
            end_index,
        )
        if max(
            abs(first_start_height - second_start_height),
            abs(first_end_height - second_end_height),
        ) < RISER_HEIGHT_THRESHOLD:
            continue

        start_point = candidates[start_index]
        end_point = candidates[end_index]
        quad = np.asarray(
            [
                [start_point[0], first_start_height, start_point[1]],
                [end_point[0], first_end_height, end_point[1]],
                [end_point[0], second_end_height, end_point[1]],
                [start_point[0], second_start_height, start_point[1]],
            ],
            dtype=np.float64,
        )
        normal = np.cross(quad[1] - quad[0], quad[2] - quad[0])
        first_mean_height = (first_start_height + first_end_height) * 0.5
        second_mean_height = (second_start_height + second_end_height) * 0.5
        center_delta = (
            second_surface.center - first_surface.center
            if first_mean_height > second_mean_height
            else first_surface.center - second_surface.center
        )
        base = len(positions) // 3
        for x, height, z in quad:
            positions.extend((round_number(x), round_number(height), round_number(z)))
        if normal[0] * center_delta[0] + normal[2] * center_delta[1] < 0.0:
            indices.extend(
                (
                    base,
                    base + 2,
                    base + 1,
                    base,
                    base + 3,
                    base + 2,
                )
            )
        else:
            indices.extend(
                (
                    base,
                    base + 1,
                    base + 2,
                    base,
                    base + 2,
                    base + 3,
                )
            )
        riser_quad_count += 1
        riser_vertex_count += 4

    return {
        "positions": positions,
        "indices": indices,
        "outlineHeights": [round_number(height) for height in outline_heights],
        "pointCount": int(len(roof_points)),
        "roofMin": round_number(float(min(surface.heights.min() for surface in surfaces))),
        "roofMax": round_number(float(max(surface.heights.max() for surface in surfaces))),
        "_vertexCount": int(len(positions) // 3),
        "_triangleCount": int(len(indices) // 3),
        "_surfaceVertexCount": int(len(surfaces) * 3),
        "_surfacePlaneVertexCount": int(surface_plane_vertex_count),
        "_riserVertexCount": int(riser_vertex_count),
        "_riserQuadCount": int(riser_quad_count),
        "_cellCount": int(len(cell_points)),
        "_planeCount": int(len(planes)),
        "_planeSupportCells": int(
            sum(len(plane.inlier_points) for plane in planes)
        ),
        "_meshPlaneVertexCount": int(surface_plane_vertex_count),
        "_outlinePlaneVertexCount": int(np.count_nonzero(outline_planes >= 0)),
    }


def round_number(value: float) -> float:
    return float(f"{float(value):.3f}")


def write_atomic(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as destination:
            temporary_path = Path(destination.name)
            json.dump(payload, destination, indent=2, ensure_ascii=False)
            destination.write("\n")
            destination.flush()
            os.fsync(destination.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"LAS/LAZ input (default: {DEFAULT_INPUT})",
    )
    args = parser.parse_args()

    rings = load_target_rings(FOOTPRINTS_PATH)
    validate_elevation(ELEVATION_PATH)
    lidar_points, lidar_heights = read_lidar(args.input)

    buildings: dict[str, dict[str, Any]] = {}
    summary: dict[str, dict[str, Any]] = {}
    for building_id in TARGET_BUILDINGS:
        ring = rings[building_id]
        inside = points_in_polygon(lidar_points, ring)
        building_points = lidar_points[inside]
        building_heights = lidar_heights[inside]
        measured = roof_mesh(ring, building_points, building_heights, building_id)
        summary[building_id] = {
            "pointCount": measured["pointCount"],
            "cellCount": measured.pop("_cellCount"),
            "planeCount": measured.pop("_planeCount"),
            "planeSupportCells": measured.pop("_planeSupportCells"),
            "vertices": measured.pop("_vertexCount"),
            "triangles": measured.pop("_triangleCount"),
            "surfaceVertices": measured.pop("_surfaceVertexCount"),
            "surfacePlaneVertices": measured.pop("_surfacePlaneVertexCount"),
            "riserVertices": measured.pop("_riserVertexCount"),
            "riserQuads": measured.pop("_riserQuadCount"),
            "meshPlaneVertices": measured.pop("_meshPlaneVertexCount"),
            "outlinePlaneVertices": measured.pop("_outlinePlaneVertexCount"),
            "roofMin": measured["roofMin"],
            "roofMax": measured["roofMax"],
        }
        buildings[building_id] = measured

    total_planes = sum(item["planeCount"] for item in summary.values())
    reconstruction_metadata = {
        "description": (
            "Class-6 LiDAR roof points are reduced to 0.5 m XY cells by median "
            "height, reconstructed with seeded RANSAC planes, and emitted as "
            "planar triangle faces after three 4.5 m neighborhood majority passes remove isolated roof patches. Interior transitions between different planes "
            "receive riser quads; boundary edges retain the outline wall contract. "
            "A robust median of the nearest 32 cells is used where no compatible "
            "plane is within 5 m."
        ),
        "cellSizeMeters": CELL_SIZE,
        "ransacSeed": RANSAC_SEED,
        "maxCandidatesPerPlane": PLANE_RANSAC_CANDIDATES,
        "maxPlaneSlope": PLANE_SLOPE_LIMIT,
        "inlierResidualMeters": PLANE_RESIDUAL_TOLERANCE,
        "minSupportCells": MIN_PLANE_SUPPORT_CELLS,
        "maxPlanesPerBuilding": MAX_PLANES,
        "planeNeighborRadiusMeters": PLANE_NEIGHBOR_RADIUS,
        "fallbackNeighborCount": FALLBACK_NEIGHBOR_COUNT,
        "riserHeightThresholdMeters": RISER_HEIGHT_THRESHOLD,
        "planeCount": total_planes,
        "planeCounts": {
            building_id: item["planeCount"] for building_id, item in summary.items()
        },
        "coverage": {
            building_id: {
                "cellCount": item["cellCount"],
                "planeSupportCells": item["planeSupportCells"],
                "planeSupportFraction": round_number(
                    item["planeSupportCells"] / item["cellCount"]
                ),
                "meshVertices": item["vertices"],
                "meshPlaneVertices": item["meshPlaneVertices"],
                "surfaceVertices": item["surfaceVertices"],
                "surfacePlaneVertices": item["surfacePlaneVertices"],
                "riserVertices": item["riserVertices"],
                "riserQuads": item["riserQuads"],
                "meshPlaneFraction": round_number(
                    item["meshPlaneVertices"] / item["surfaceVertices"]
                ),
                "outlineVertices": len(buildings[building_id]["outlineHeights"]),
                "outlinePlaneVertices": item["outlinePlaneVertices"],
                "outlinePlaneFraction": round_number(
                    item["outlinePlaneVertices"]
                    / len(buildings[building_id]["outlineHeights"])
                ),
            }
            for building_id, item in summary.items()
        },
    }
    payload = {
        "source": SOURCE_URL,
        "verticalDatum": "NAVD88 meters",
        "origin": {"lon": ORIGIN_LON, "lat": ORIGIN_LAT},
        "reconstruction": reconstruction_metadata,
        "buildings": buildings,
    }
    write_atomic(payload, OUTPUT_PATH)

    print(json.dumps({"buildings": summary}, sort_keys=True))
    print(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
