#!/usr/bin/env python3
"""Build the bounded local terrain grid from the cached campus LiDAR tile."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
from typing import Any

import laspy
import numpy as np
from pyproj import CRS, Transformer
from scipy.interpolate import LinearNDInterpolator
from scipy.spatial import cKDTree


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / ".cache-local-scene" / "campus.laz"
LEGACY_PATH = PROJECT_ROOT / "public" / "terrain" / "elevation.json"
BOUNDS_PATH = PROJECT_ROOT / "public" / "local-scene" / "ground-bounds.json"
OUTPUT_PATH = PROJECT_ROOT / "public" / "local-scene" / "elevation.json"
METADATA_PATH = PROJECT_ROOT / "public" / "local-scene" / "terrain-source.json"

SOURCE_URL = (
    "https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/LPC/Projects/"
    "CA_SantaClaraCounty_2020_A20/CA_SantaClaraCounty_2020/LAZ/"
    "USGS_LPC_CA_SantaClaraCounty_2020_A20_17509250.laz"
)

GRID_WIDTH = 640
GRID_HEIGHT = 512
GROUND_CELL_SIZE_METERS = 1.5
LIDAR_MAX_DISTANCE_METERS = 15.0
BLEND_WIDTH_METERS = 10.0
ORIGIN_LON = -121.832
ORIGIN_LAT = 37.278
METERS_PER_LON = 88400.0
METERS_PER_LAT = 111000.0
US_SURVEY_FOOT_TO_METER = 0.3048006096012192
CHUNK_SIZE = 1_000_000


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as source:
        return json.load(source)


def require_finite_number(payload: dict[str, Any], key: str, path: Path) -> float:
    try:
        value = float(payload[key])
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError(f"{path} is missing a valid {key!r}") from error
    if not math.isfinite(value):
        raise RuntimeError(f"{path} contains a non-finite {key!r}")
    return value


def validate_legacy_dem(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    if not isinstance(payload, dict):
        raise RuntimeError(f"{path} must contain a DEM object")
    try:
        width = int(payload["width"])
        height = int(payload["height"])
        values = np.asarray(payload["values"], dtype=np.float64)
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError(f"{path} is missing valid DEM dimensions or values") from error
    if width < 2 or height < 2 or values.size != width * height:
        raise RuntimeError(f"{path} has inconsistent DEM dimensions")
    if not np.isfinite(values).all():
        raise RuntimeError(f"{path} contains non-finite elevation samples")
    west = require_finite_number(payload, "west", path)
    north = require_finite_number(payload, "north", path)
    dx = require_finite_number(payload, "dx", path)
    dy = require_finite_number(payload, "dy", path)
    if dx <= 0.0 or dy <= 0.0:
        raise RuntimeError(f"{path} must use positive dx and dy")
    return {
        "width": width,
        "height": height,
        "west": west,
        "north": north,
        "dx": dx,
        "dy": dy,
        "values": values,
    }


def load_target_bounds(path: Path) -> dict[str, float]:
    payload = load_json(path)
    if not isinstance(payload, dict):
        raise RuntimeError(f"{path} must contain a bounds object")
    bounds = {
        key: require_finite_number(payload, key, path)
        for key in ("xmin", "ymin", "xmax", "ymax")
    }
    if not bounds["xmin"] < bounds["xmax"] or not bounds["ymin"] < bounds["ymax"]:
        raise RuntimeError(f"{path} must contain increasing x and y bounds")
    return bounds


def get_horizontal_crs(crs: CRS | None) -> CRS:
    """Return the EPSG:6420 horizontal part of a compound LAS CRS."""

    horizontal_crs = crs
    vertical_crs = None
    if crs is not None and crs.is_compound:
        horizontal_crs = next(
            (component for component in crs.sub_crs_list if component.to_epsg() == 6420),
            None,
        )
        vertical_crs = next(
            (component for component in crs.sub_crs_list if component.to_epsg() == 6360),
            None,
        )
    if horizontal_crs is None or horizontal_crs.to_epsg() != 6420 or vertical_crs is None:
        actual = crs.to_string() if crs is not None else "missing CRS"
        raise RuntimeError(
            "LAZ header must use horizontal EPSG:6420 and vertical EPSG:6360 "
            "(US survey feet); "
            f"found {actual}"
        )
    return horizontal_crs


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_ground_points(path: Path) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Read finite class-2 points and return local [x, z] plus height meters."""

    local_xy: list[np.ndarray] = []
    heights: list[np.ndarray] = []
    raw_class2_count = 0

    with laspy.open(path) as reader:
        source_crs = reader.header.parse_crs()
        horizontal_crs = get_horizontal_crs(source_crs)
        to_lonlat = Transformer.from_crs(horizontal_crs, "EPSG:4326", always_xy=True)
        source_min = np.asarray(reader.header.mins[:2], dtype=np.float64)
        source_max = np.asarray(reader.header.maxs[:2], dtype=np.float64)
        if not np.isfinite(source_min).all() or not np.isfinite(source_max).all():
            raise RuntimeError("LAZ header has non-finite horizontal bounds")
        if not np.all(source_min < source_max):
            raise RuntimeError("LAZ header has invalid horizontal bounds")

        for points in reader.chunk_iterator(CHUNK_SIZE):
            classification = np.asarray(points.classification)
            class_two = classification == 2
            class_two_count = int(np.count_nonzero(class_two))
            raw_class2_count += class_two_count
            if class_two_count == 0:
                continue

            source_x = np.asarray(points.x, dtype=np.float64)[class_two]
            source_y = np.asarray(points.y, dtype=np.float64)[class_two]
            source_z = np.asarray(points.z, dtype=np.float64)[class_two]
            longitude, latitude = to_lonlat.transform(source_x, source_y)
            local_x = (np.asarray(longitude, dtype=np.float64) - ORIGIN_LON) * METERS_PER_LON
            local_z = (ORIGIN_LAT - np.asarray(latitude, dtype=np.float64)) * METERS_PER_LAT
            height_meters = source_z * US_SURVEY_FOOT_TO_METER
            finite = (
                np.isfinite(local_x)
                & np.isfinite(local_z)
                & np.isfinite(height_meters)
            )
            if not np.any(finite):
                continue
            local_xy.append(np.column_stack((local_x[finite], local_z[finite])))
            heights.append(height_meters[finite])

    if not local_xy:
        raise RuntimeError("No finite classification-2 LiDAR points found")
    xy = np.concatenate(local_xy)
    z_values = np.concatenate(heights)
    return xy, z_values, {
        "class2PointCount": raw_class2_count,
        "finiteClass2PointCount": int(len(z_values)),
        "horizontalCrs": "EPSG:6420",
        "horizontalUnits": "US survey feet",
        "sourceBoundsFeet": {
            "xmin": float(source_min[0]),
            "ymin": float(source_min[1]),
            "xmax": float(source_max[0]),
            "ymax": float(source_max[1]),
        },
    }


def thin_ground_points(
    local_xy: np.ndarray,
    heights: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Average XYZ values within deterministic 1.5 m XY cells."""

    cell_indices = np.floor(local_xy / GROUND_CELL_SIZE_METERS).astype(np.int64)
    _, inverse = np.unique(cell_indices, axis=0, return_inverse=True)
    cell_count = int(inverse.max()) + 1
    counts = np.bincount(inverse, minlength=cell_count).astype(np.float64)
    mean_x = np.bincount(inverse, weights=local_xy[:, 0], minlength=cell_count) / counts
    mean_z = np.bincount(inverse, weights=local_xy[:, 1], minlength=cell_count) / counts
    mean_height = np.bincount(inverse, weights=heights, minlength=cell_count) / counts
    return np.column_stack((mean_x, mean_z)), mean_height


def sample_legacy_dem(
    dem: dict[str, Any],
    longitudes: np.ndarray,
    latitudes: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Sample with the historical renderer's width-2/height-2 boundary clamp."""

    width = int(dem["width"])
    height = int(dem["height"])
    xx_unclamped = (longitudes - float(dem["west"])) / float(dem["dx"])
    yy_unclamped = (float(dem["north"]) - latitudes) / float(dem["dy"])
    outside = (
        (longitudes < float(dem["west"]))
        | (longitudes > float(dem["west"]) + (width - 1) * float(dem["dx"]))
        | (latitudes < float(dem["north"]) - (height - 1) * float(dem["dy"]))
        | (latitudes > float(dem["north"]))
    )
    clamped = (
        (xx_unclamped < 0.0)
        | (xx_unclamped > width - 2)
        | (yy_unclamped < 0.0)
        | (yy_unclamped > height - 2)
    )

    # This matches the historical src/world.ts behavior: coordinates clamp to
    # the last interpolation cell (width - 2 / height - 2).
    xx = np.clip(xx_unclamped, 0.0, width - 2)
    yy = np.clip(yy_unclamped, 0.0, height - 2)
    ix = np.floor(xx).astype(np.int64)
    iy = np.floor(yy).astype(np.int64)
    fx = xx - ix
    fy = yy - iy
    values = np.asarray(dem["values"], dtype=np.float64)
    top_left = values[iy * width + ix]
    top_right = values[iy * width + ix + 1]
    bottom_left = values[(iy + 1) * width + ix]
    bottom_right = values[(iy + 1) * width + ix + 1]
    top = top_left * (1.0 - fx) + top_right * fx
    bottom = bottom_left * (1.0 - fx) + bottom_right * fx
    return top * (1.0 - fy) + bottom * fy, outside, clamped


def target_grid(bounds: dict[str, float]) -> tuple[np.ndarray, dict[str, float]]:
    dx = (bounds["xmax"] - bounds["xmin"]) / (GRID_WIDTH - 1)
    dy = (bounds["ymax"] - bounds["ymin"]) / (GRID_HEIGHT - 1)
    longitudes = np.linspace(bounds["xmin"], bounds["xmax"], GRID_WIDTH)
    latitudes = np.linspace(bounds["ymax"], bounds["ymin"], GRID_HEIGHT)
    grid_lon, grid_lat = np.meshgrid(longitudes, latitudes, indexing="xy")
    return np.column_stack((grid_lon.ravel(), grid_lat.ravel())), {
        "width": GRID_WIDTH,
        "height": GRID_HEIGHT,
        "west": bounds["xmin"],
        "north": bounds["ymax"],
        "dx": dx,
        "dy": dy,
    }


def blend_lidar(
    target_lonlat: np.ndarray,
    baseline: np.ndarray,
    thinned_xy: np.ndarray,
    thinned_heights: np.ndarray,
    source_bounds_feet: dict[str, float],
    horizontal_crs: CRS,
) -> tuple[np.ndarray, dict[str, int]]:
    """Blend accepted interpolated LiDAR heights into the legacy baseline."""

    local_queries = np.column_stack(
        (
            (target_lonlat[:, 0] - ORIGIN_LON) * METERS_PER_LON,
            (ORIGIN_LAT - target_lonlat[:, 1]) * METERS_PER_LAT,
        )
    )
    interpolator = LinearNDInterpolator(thinned_xy, thinned_heights, fill_value=np.nan)
    interpolated = np.asarray(interpolator(local_queries), dtype=np.float64)
    nearest_distance = cKDTree(thinned_xy).query(local_queries, k=1)[0]
    finite_accepted = np.isfinite(interpolated) & (
        nearest_distance <= LIDAR_MAX_DISTANCE_METERS
    )

    to_source = Transformer.from_crs("EPSG:4326", horizontal_crs, always_xy=True)
    source_x_feet, source_y_feet = to_source.transform(
        target_lonlat[:, 0], target_lonlat[:, 1]
    )
    source_x_meters = np.asarray(source_x_feet, dtype=np.float64) * US_SURVEY_FOOT_TO_METER
    source_y_meters = np.asarray(source_y_feet, dtype=np.float64) * US_SURVEY_FOOT_TO_METER
    rectangle_min_x = source_bounds_feet["xmin"] * US_SURVEY_FOOT_TO_METER
    rectangle_min_y = source_bounds_feet["ymin"] * US_SURVEY_FOOT_TO_METER
    rectangle_max_x = source_bounds_feet["xmax"] * US_SURVEY_FOOT_TO_METER
    rectangle_max_y = source_bounds_feet["ymax"] * US_SURVEY_FOOT_TO_METER
    inside_rectangle = (
        (source_x_meters >= rectangle_min_x)
        & (source_x_meters <= rectangle_max_x)
        & (source_y_meters >= rectangle_min_y)
        & (source_y_meters <= rectangle_max_y)
    )
    boundary_distance = np.minimum.reduce(
        (
            source_x_meters - rectangle_min_x,
            rectangle_max_x - source_x_meters,
            source_y_meters - rectangle_min_y,
            rectangle_max_y - source_y_meters,
        )
    )
    blend_weight = np.clip(boundary_distance / BLEND_WIDTH_METERS, 0.0, 1.0)
    accepted = finite_accepted & inside_rectangle
    influenced = accepted & (blend_weight > 0.0)

    result = baseline.copy()
    result[accepted] = (
        baseline[accepted] * (1.0 - blend_weight[accepted])
        + interpolated[accepted] * blend_weight[accepted]
    )
    return result, {
        "interpolatedFiniteAndNearestWithin15m": int(np.count_nonzero(finite_accepted)),
        "gridPointsAcceptedWithinLidarRectangle": int(np.count_nonzero(accepted)),
        "gridPointsLidarInfluenced": int(np.count_nonzero(influenced)),
    }


def round_values(values: np.ndarray) -> list[float]:
    rounded = np.round(np.asarray(values, dtype=np.float64), 3)
    if not np.isfinite(rounded).all():
        raise RuntimeError("Generated terrain contains non-finite elevation values")
    return [float(value) for value in rounded]


def write_atomic(payload: Any, path: Path) -> None:
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
            json.dump(payload, destination, indent=2 if path == METADATA_PATH else None)
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

    dem = validate_legacy_dem(LEGACY_PATH)
    bounds = load_target_bounds(BOUNDS_PATH)
    target_lonlat, grid = target_grid(bounds)
    baseline, legacy_outside, legacy_clamped = sample_legacy_dem(
        dem,
        target_lonlat[:, 0],
        target_lonlat[:, 1],
    )
    local_xy, heights, lidar_metadata = read_ground_points(args.input)
    thinned_xy, thinned_heights = thin_ground_points(local_xy, heights)
    source_bounds_feet = lidar_metadata["sourceBoundsFeet"]
    horizontal_crs = CRS.from_epsg(6420)
    values, lidar_counts = blend_lidar(
        target_lonlat,
        baseline,
        thinned_xy,
        thinned_heights,
        source_bounds_feet,
        horizontal_crs,
    )
    rounded_values = round_values(values)

    elevation = {
        "width": grid["width"],
        "height": grid["height"],
        "west": grid["west"],
        "north": grid["north"],
        "dx": grid["dx"],
        "dy": grid["dy"],
        "values": rounded_values,
    }
    legacy_east = float(dem["west"]) + (int(dem["width"]) - 1) * float(dem["dx"])
    legacy_south = float(dem["north"]) - (int(dem["height"]) - 1) * float(dem["dy"])
    total_grid_points = GRID_WIDTH * GRID_HEIGHT
    lidar_influenced = lidar_counts["gridPointsLidarInfluenced"]
    metadata = {
        "sourceUrl": SOURCE_URL,
        "sourceLazSha256": sha256(args.input),
        "sourceFile": str(args.input.relative_to(PROJECT_ROOT))
        if args.input.is_relative_to(PROJECT_ROOT)
        else str(args.input),
        "horizontalCrs": lidar_metadata["horizontalCrs"],
        "horizontalSourceUnits": lidar_metadata["horizontalUnits"],
        "usSurveyFootToMeter": US_SURVEY_FOOT_TO_METER,
        "dimensions": {
            "width": GRID_WIDTH,
            "height": GRID_HEIGHT,
            "gridPointCount": total_grid_points,
        },
        "units": {
            "gridCoordinates": "longitude/latitude degrees",
            "elevation": "meters NAVD88",
            "lidarHorizontalCoordinates": "local meters for interpolation; source EPSG:6420 feet converted to meters for boundary distance",
        },
        "method": {
            "baseline": "Legacy DEM sampled bilinearly with the historical renderer clamp to width-2 and height-2 interpolation cells",
            "groundClass": 2,
            "thinning": "Class-2 points averaged by 1.5 m local XY grid cell with numpy unique/bincount",
            "interpolation": "scipy LinearNDInterpolator over thinned local XY means",
            "nearestDistance": "cKDTree nearest thinned ground sample; accepted at <=15 m",
            "blend": "Inside the LAZ horizontal rectangle, linear 10 m boundary strip from weight 0 at the boundary to weight 1 at 10 m; outside keeps the legacy baseline",
        },
        "limitation": "This is an offline interpolation of existing USGS class-2 LiDAR and the legacy DEM; no new survey was performed.",
        "targetBounds": bounds,
        "grid": grid,
        "sourceLidar": {
            **lidar_metadata,
            "pointsBeforeThinning": lidar_metadata["finiteClass2PointCount"],
            "pointsAfterThinning": int(len(thinned_xy)),
            "rectangleBoundsMeters": {
                "xmin": source_bounds_feet["xmin"] * US_SURVEY_FOOT_TO_METER,
                "ymin": source_bounds_feet["ymin"] * US_SURVEY_FOOT_TO_METER,
                "xmax": source_bounds_feet["xmax"] * US_SURVEY_FOOT_TO_METER,
                "ymax": source_bounds_feet["ymax"] * US_SURVEY_FOOT_TO_METER,
            },
        },
        "gridCounts": {
            "targetGridPoints": total_grid_points,
            "gridPointsLidarInfluenced": lidar_influenced,
            **lidar_counts,
            "gridPointsBaselineOnly": total_grid_points - lidar_influenced,
            "legacyOutsideBounds": int(np.count_nonzero(legacy_outside)),
            "legacyClamped": int(np.count_nonzero(legacy_clamped)),
        },
        "legacyDem": {
            "path": "public/terrain/elevation.json",
            "width": int(dem["width"]),
            "height": int(dem["height"]),
            "west": float(dem["west"]),
            "north": float(dem["north"]),
            "east": legacy_east,
            "south": legacy_south,
            "targetPointsOutsideBounds": int(np.count_nonzero(legacy_outside)),
        },
    }
    write_atomic(elevation, OUTPUT_PATH)
    write_atomic(metadata, METADATA_PATH)

    validation = {
        "grid": f"{GRID_WIDTH}x{GRID_HEIGHT}",
        "values": len(rounded_values),
        "finite": bool(np.isfinite(values).all()),
        "range": [min(rounded_values), max(rounded_values)],
        "legacyOutsideBounds": int(np.count_nonzero(legacy_outside)),
        "legacyClamped": int(np.count_nonzero(legacy_clamped)),
        "pointsBeforeThinning": int(len(local_xy)),
        "pointsAfterThinning": int(len(thinned_xy)),
        "gridPointsLidarInfluenced": lidar_influenced,
    }
    print(json.dumps(validation, sort_keys=True))
    print(f"Wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size} bytes)")
    print(f"Wrote {METADATA_PATH} ({METADATA_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
