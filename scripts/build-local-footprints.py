#!/usr/bin/env python3
"""Build the small offline footprint set used by the local scene.

The source extract is intentionally kept out of the browser bundle.  This
script selects the building and field polygons needed around the routes and
campus, and writes a compact, renderer-friendly JSON file.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable, Mapping, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OSM_PATH = PROJECT_ROOT / "public" / "data" / "osm.json"
ROUTES_PATH = PROJECT_ROOT / "public" / "data" / "routes.json"
OUTPUT_PATH = PROJECT_ROOT / "public" / "local-scene" / "footprints.json"

Point = tuple[float, float]
Ring = list[Point]

# Bboxes are (minimum longitude, minimum latitude, maximum longitude,
# maximum latitude).  The first one controls the full campus selection; the
# second marks the closer school grounds for the campus flag.
CAMPUS_BBOX = (-121.8293, 37.2740, -121.8217, 37.2773)
SCHOOL_BBOX = (-121.8282, 37.2754, -121.8248, 37.2767)
CAMPUS_CENTER: Point = (-121.8257, 37.2758)

ROUTE_BUILDING_RADIUS_M = 85.0
EXCLUSION_RADIUS_M = 400.0

# The local scene uses this equirectangular scale for its x/z coordinates.
METERS_PER_LON = 88_400.0
METERS_PER_LAT = 111_000.0

EXCLUSION_LEISURE = {"pitch", "sports_centre", "swimming_pool"}
FALLBACK_HEIGHTS = {
    "school": 12.0,
    "house": 5.0,
    "commercial": 7.0,
    "roof": 3.0,
}
DEFAULT_HEIGHT = 6.0


def point_from_geometry(raw_point: Mapping[str, object]) -> Point:
    """Read an OSM geometry point as (longitude, latitude)."""

    return (float(raw_point["lon"]), float(raw_point["lat"]))


def ring_from_geometry(geometry: object) -> Ring | None:
    """Convert OSM geometry to an open ring, or return None if invalid."""

    if not isinstance(geometry, list):
        return None

    try:
        ring = [
            point_from_geometry(point)
            for point in geometry
            if isinstance(point, dict)
        ]
    except (KeyError, TypeError, ValueError):
        return None

    if len(ring) > 1 and ring[0] == ring[-1]:
        ring.pop()
    return ring if len(ring) >= 3 else None


def polygon_centroid(ring: Sequence[Point]) -> Point:
    """Return the planar centroid, falling back to the vertex mean."""

    twice_area = 0.0
    centroid_lon = 0.0
    centroid_lat = 0.0
    for first, second in zip(ring, (*ring[1:], ring[0])):
        cross = first[0] * second[1] - second[0] * first[1]
        twice_area += cross
        centroid_lon += (first[0] + second[0]) * cross
        centroid_lat += (first[1] + second[1]) * cross

    if abs(twice_area) > 1e-12:
        return (
            centroid_lon / (3.0 * twice_area),
            centroid_lat / (3.0 * twice_area),
        )

    return (
        sum(point[0] for point in ring) / len(ring),
        sum(point[1] for point in ring) / len(ring),
    )


def in_bbox(point: Point, bbox: tuple[float, float, float, float]) -> bool:
    lon, lat = point
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def local_point(point: Point) -> tuple[float, float]:
    """Project (longitude, latitude) to the requested local x/z scale."""

    return (point[0] * METERS_PER_LON, point[1] * METERS_PER_LAT)


def point_segment_distance(point: Point, start: Point, end: Point) -> float:
    """Return local equirectangular distance from a point to a segment."""

    px, pz = local_point(point)
    sx, sz = local_point(start)
    ex, ez = local_point(end)
    dx = ex - sx
    dz = ez - sz
    length_squared = dx * dx + dz * dz
    if length_squared == 0.0:
        return math.hypot(px - sx, pz - sz)

    projection = ((px - sx) * dx + (pz - sz) * dz) / length_squared
    projection = max(0.0, min(1.0, projection))
    nearest_x = sx + projection * dx
    nearest_z = sz + projection * dz
    return math.hypot(px - nearest_x, pz - nearest_z)


def route_segments(routes_payload: Mapping[str, object]) -> list[tuple[Point, Point]]:
    """Collect adjacent point pairs from each route in routes.json."""

    segments: list[tuple[Point, Point]] = []
    for value in routes_payload.values():
        if not isinstance(value, list):
            continue
        points: list[Point] = []
        for raw_point in value:
            if not isinstance(raw_point, dict):
                continue
            try:
                points.append(point_from_geometry(raw_point))
            except (KeyError, TypeError, ValueError):
                continue
        segments.extend(zip(points, points[1:]))
    return segments


def near_route(point: Point, segments: Sequence[tuple[Point, Point]]) -> bool:
    return any(
        point_segment_distance(point, start, end) <= ROUTE_BUILDING_RADIUS_M
        for start, end in segments
    )


def finite_number(value: object) -> float | None:
    """Parse a finite numeric OSM tag value."""

    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def building_height(tags: Mapping[str, object], kind: str) -> float:
    height = finite_number(tags.get("height"))
    if height is not None:
        return height

    levels = finite_number(tags.get("building:levels"))
    if levels is not None:
        level_height = levels * 3.2
        if math.isfinite(level_height):
            return level_height

    return FALLBACK_HEIGHTS.get(kind, DEFAULT_HEIGHT)


def ring_json(ring: Iterable[Point]) -> list[list[float]]:
    return [[lon, lat] for lon, lat in ring]


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as source:
        return json.load(source)


def build_footprints(
    osm_payload: Mapping[str, object],
    routes_payload: Mapping[str, object],
) -> dict[str, object]:
    elements = osm_payload.get("elements")
    if not isinstance(elements, list):
        raise ValueError("OSM extract must contain an elements list")

    segments = route_segments(routes_payload)
    buildings: list[dict[str, object]] = []
    exclusions: list[list[list[float]]] = []

    for element in elements:
        if not isinstance(element, dict) or element.get("type") != "way":
            continue
        tags = element.get("tags")
        ring = ring_from_geometry(element.get("geometry"))
        if not isinstance(tags, dict) or ring is None:
            continue

        centroid = polygon_centroid(ring)

        building_tag = tags.get("building")
        if building_tag is not None:
            kind = str(building_tag)
            if in_bbox(centroid, CAMPUS_BBOX) or near_route(centroid, segments):
                buildings.append(
                    {
                        "id": element.get("id"),
                        "ring": ring_json(ring),
                        "height": building_height(tags, kind),
                        "heightSource": "height" if finite_number(tags.get("height")) is not None else "levels" if finite_number(tags.get("building:levels")) is not None else "estimate",
                        "kind": kind,
                        "campus": (
                            kind == "school"
                            or str(tags.get("name", "")) == "Conservatory"
                            or in_bbox(centroid, SCHOOL_BBOX)
                        ),
                    }
                )

        leisure = tags.get("leisure")
        is_exclusion = (
            leisure in EXCLUSION_LEISURE
            or tags.get("landuse") == "cemetery"
            or tags.get("natural") == "water"
        )
        if is_exclusion and point_segment_distance(
            centroid, CAMPUS_CENTER, CAMPUS_CENTER
        ) <= EXCLUSION_RADIUS_M:
            exclusions.append(ring_json(ring))

    return {
        "buildings": buildings,
        "exclusions": exclusions,
        "attribution": "© OpenStreetMap contributors",
    }


def main() -> None:
    osm_payload = load_json(OSM_PATH)
    routes_payload = load_json(ROUTES_PATH)
    if not isinstance(osm_payload, dict) or not isinstance(routes_payload, dict):
        raise ValueError("OSM and routes files must contain JSON objects")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    footprints = build_footprints(osm_payload, routes_payload)
    with OUTPUT_PATH.open("w", encoding="utf-8") as destination:
        json.dump(footprints, destination, indent=2, ensure_ascii=False)
        destination.write("\n")

    print(
        f"Wrote {OUTPUT_PATH} "
        f"({len(footprints['buildings'])} buildings, "
        f"{len(footprints['exclusions'])} exclusions)"
    )


if __name__ == "__main__":
    main()
