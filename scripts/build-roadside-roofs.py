#!/usr/bin/env python3
"""Extract measured roadside roof levels from the cached class-6 LiDAR tile."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile

import laspy
import numpy as np
from pyproj import Transformer


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / ".cache-local-scene" / "campus.laz"
FOOTPRINTS_PATH = ROOT / "public" / "local-scene" / "footprints.json"
OUTPUT_PATH = ROOT / "public" / "local-scene" / "roadside-roofs.json"
SOURCE_URL = (
    "https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/LPC/Projects/"
    "CA_SantaClaraCounty_2020_A20/CA_SantaClaraCounty_2020/LAZ/"
    "USGS_LPC_CA_SantaClaraCounty_2020_A20_17509250.laz"
)
ORIGIN_LON = -121.832
ORIGIN_LAT = 37.278
METERS_PER_LON = 88400.0
METERS_PER_LAT = 111000.0
US_SURVEY_FOOT_TO_METER = 0.3048006096012192
CHUNK_SIZE = 1_000_000


def localize(ring: np.ndarray) -> np.ndarray:
    return np.column_stack(
        ((ring[:, 0] - ORIGIN_LON) * METERS_PER_LON,
         (ORIGIN_LAT - ring[:, 1]) * METERS_PER_LAT)
    )


def points_in_polygon(points: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    previous = np.roll(polygon, 1, axis=0)
    current_x, current_y = polygon[:, 0], polygon[:, 1]
    previous_x, previous_y = previous[:, 0], previous[:, 1]
    denominator = previous_y - current_y
    crosses = (current_y[None, :] > points[:, 1, None]) != (
        previous_y[None, :] > points[:, 1, None]
    )
    numerator = (previous_x - current_x)[None, :] * (
        points[:, 1, None] - current_y[None, :]
    )
    intersections = np.zeros_like(numerator)
    np.divide(
        numerator,
        denominator[None, :],
        out=intersections,
        where=denominator[None, :] != 0.0,
    )
    intersections += current_x[None, :]
    return np.count_nonzero(crosses & (points[:, 0, None] < intersections), axis=1) % 2 == 1


def horizontal_crs(crs):
    candidate = crs
    vertical = None
    if crs is not None and crs.is_compound:
        candidate = next(
            (part for part in crs.sub_crs_list if part.to_epsg() == 6420),
            None,
        )
        vertical = next(
            (part for part in crs.sub_crs_list if part.to_epsg() == 6360),
            None,
        )
    if candidate is None or candidate.to_epsg() != 6420 or vertical is None:
        actual = crs.to_string() if crs is not None else "missing CRS"
        raise RuntimeError(
            "LAZ header must use horizontal EPSG:6420 and vertical EPSG:6360 "
            "(US survey feet); "
            f"found {actual}"
        )
    return candidate


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_candidates(path: Path, to_source: Transformer, source_min, source_max):
    payload = json.loads(path.read_text(encoding="utf-8"))
    candidates = []
    for building in payload.get("buildings", []):
        if building.get("campus") or building.get("kind") == "roof":
            continue
        try:
            ring = np.asarray(building["ring"], dtype=np.float64)
            if len(ring) > 1 and np.array_equal(ring[0], ring[-1]):
                ring = ring[:-1]
            if ring.ndim != 2 or ring.shape[1] != 2 or len(ring) < 3:
                continue
            source_x, source_y = to_source.transform(ring[:, 0], ring[:, 1])
            source_ring = np.column_stack((source_x, source_y))
            if not np.isfinite(source_ring).all():
                continue
            if (
                source_ring[:, 0].min() < source_min[0]
                or source_ring[:, 0].max() > source_max[0]
                or source_ring[:, 1].min() < source_min[1]
                or source_ring[:, 1].max() > source_max[1]
            ):
                continue
            local_ring = localize(ring)
            area = abs(
                np.dot(local_ring[:, 0], np.roll(local_ring[:, 1], -1))
                - np.dot(local_ring[:, 1], np.roll(local_ring[:, 0], -1))
            ) * 0.5
            if not np.isfinite(area) or area <= 0.0:
                continue
            candidates.append(
                {
                    "id": int(building["id"]),
                    "ring": local_ring,
                    "area": float(area),
                    "bbox": (
                        local_ring[:, 0].min(),
                        local_ring[:, 1].min(),
                        local_ring[:, 0].max(),
                        local_ring[:, 1].max(),
                    ),
                    "heights": [],
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return candidates


def extract(path: Path):
    with laspy.open(path) as reader:
        source = horizontal_crs(reader.header.parse_crs())
        source_min = np.asarray(reader.header.mins[:2], dtype=np.float64)
        source_max = np.asarray(reader.header.maxs[:2], dtype=np.float64)
        to_lonlat = Transformer.from_crs(source, "EPSG:4326", always_xy=True)
        to_source = Transformer.from_crs("EPSG:4326", source, always_xy=True)
        candidates = load_candidates(FOOTPRINTS_PATH, to_source, source_min, source_max)
        class6_count = 0
        for points in reader.chunk_iterator(CHUNK_SIZE):
            selected = np.asarray(points.classification) == 6
            class6_count += int(np.count_nonzero(selected))
            if not np.any(selected):
                continue
            source_x = np.asarray(points.x, dtype=np.float64)[selected]
            source_y = np.asarray(points.y, dtype=np.float64)[selected]
            source_z = np.asarray(points.z, dtype=np.float64)[selected]
            longitude, latitude = to_lonlat.transform(source_x, source_y)
            local_points = localize(np.column_stack((longitude, latitude)))
            finite = np.isfinite(local_points).all(axis=1) & np.isfinite(source_z)
            local_points = local_points[finite]
            heights = source_z[finite] * US_SURVEY_FOOT_TO_METER
            if not len(local_points):
                continue
            chunk_bbox = (
                local_points[:, 0].min(), local_points[:, 1].min(),
                local_points[:, 0].max(), local_points[:, 1].max(),
            )
            for candidate in candidates:
                min_x, min_y, max_x, max_y = candidate["bbox"]
                if (
                    chunk_bbox[2] < min_x or chunk_bbox[0] > max_x
                    or chunk_bbox[3] < min_y or chunk_bbox[1] > max_y
                ):
                    continue
                bbox_mask = (
                    (local_points[:, 0] >= min_x) & (local_points[:, 0] <= max_x)
                    & (local_points[:, 1] >= min_y) & (local_points[:, 1] <= max_y)
                )
                indices = np.flatnonzero(bbox_mask)
                if not len(indices):
                    continue
                inside = points_in_polygon(local_points[indices], candidate["ring"])
                if np.any(inside):
                    candidate["heights"].append(heights[indices[inside]])

    profiles = []
    for candidate in candidates:
        if not candidate["heights"]:
            continue
        heights = np.concatenate(candidate["heights"])
        count = len(heights)
        if count < 200 or count / candidate["area"] < 2.0:
            continue
        eave, ridge = np.percentile(heights, (5, 95))
        if not np.isfinite([eave, ridge]).all() or ridge < eave or ridge - eave > 8.0:
            continue
        profiles.append(
            {
                "id": candidate["id"],
                "pointCount": int(count),
                "eave": float(f"{eave:.3f}"),
                "ridge": float(f"{ridge:.3f}"),
            }
        )
    profiles.sort(key=lambda profile: profile["id"])
    return profiles, len(candidates), class6_count


def write_atomic(payload, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as output:
            temporary = Path(output.name)
            json.dump(payload, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    args = parser.parse_args()
    profiles, candidate_count, class6_count = extract(args.input)
    payload = {
        "source": SOURCE_URL,
        "sourceDate": "2020",
        "acquisitionYear": 2020,
        "verticalDatum": "NAVD88 meters",
        "method": "Class-6 LiDAR points inside eligible OSM footprint polygons; eave and ridge are measured 5th and 95th height percentiles in meters.",
        "limitations": "Profiles are emitted only with dense measured coverage and a <=8 m percentile spread; no wall or base heights are inferred.",
        "footprintsSha256": hashlib.sha256(FOOTPRINTS_PATH.read_bytes()).hexdigest(),
        "sourceLazSha256": sha256(args.input),
        "candidateFootprintCount": candidate_count,
        "class6PointCount": class6_count,
        "profiles": profiles,
    }
    write_atomic(payload, OUTPUT_PATH)
    print(json.dumps({
        "candidateFootprints": candidate_count,
        "class6Points": class6_count,
        "profiles": len(profiles),
        "output": str(OUTPUT_PATH),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
