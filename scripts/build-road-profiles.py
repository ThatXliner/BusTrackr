#!/usr/bin/env python3
"""Build the authored road profiles used by the local scene.

The route points and OSM centerlines are local inputs.  Each route segment is
matched to the nearest compatible OSM way segment in a small planar projection;
the dimensions in the emitted profile are authored scenery estimates.
"""

from __future__ import annotations

import json
import hashlib
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OSM_PATH = PROJECT_ROOT / "public" / "data" / "osm.json"
ROUTES_PATH = PROJECT_ROOT / "public" / "data" / "routes.json"
OUTPUT_PATH = PROJECT_ROOT / "public" / "local-scene" / "road-profiles.json"

METERS_PER_LON = 88_400.0
METERS_PER_LAT = 111_000.0
MAX_MATCH_DISTANCE_M = 12.0
MIN_HEADING_ALIGNMENT = 0.85

EXCLUDED_HIGHWAYS = frozenset(
    {
        "pedestrian",
        "footway",
        "cycleway",
        "path",
        "steps",
        "construction",
        "motorway",
    }
)

CAVEAT = (
    "Widths, lane counts and curbs are visual estimates; OSM supplies "
    "centerlines and names, not verified lane geometry."
)

# Values are authored estimates, in metres and lanes.  Keep integer estimates
# as integers in the JSON so the source values remain easy to audit.
ROAD_DIMENSIONS: Mapping[str, tuple[int | float, int]] = {
    "Monterey Road": (24, 6),
    "Skyway Drive": (7.2, 2),
    "Diamond Heights Drive": (8, 2),
    "Fehren Drive": (10, 2),
}

FALLBACK_DIMENSIONS: Mapping[str, tuple[int | float, int]] = {
    "primary": (24, 6),
    "secondary": (18, 4),
    "tertiary": (10, 2),
    "residential": (8, 2),
    "unclassified": (8, 2),
    "service": (6.5, 2),
    "unknown": (6.5, 2),
}

Point = tuple[float, float]


@dataclass(frozen=True)
class RoadSegment:
    """One adjacent pair from an OSM way, in the local metre projection."""

    way_id: int
    segment_index: int
    name: str
    highway: str
    start: Point
    end: Point
    heading: Point


def project_point(raw_point: Mapping[str, object]) -> Point:
    """Project an OSM or route point to (x, y) metre coordinates."""

    return (
        float(raw_point["lon"]) * METERS_PER_LON,
        float(raw_point["lat"]) * METERS_PER_LAT,
    )


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as source:
        return json.load(source)


def load_osm_segments(payload: Mapping[str, object]) -> list[RoadSegment]:
    elements = payload.get("elements")
    if not isinstance(elements, list):
        raise ValueError("OSM extract must contain an elements list")

    segments: list[RoadSegment] = []
    for element in elements:
        if not isinstance(element, dict) or element.get("type") != "way":
            continue

        tags = element.get("tags")
        geometry = element.get("geometry")
        if not isinstance(tags, dict) or not isinstance(geometry, list):
            continue

        raw_highway = tags.get("highway")
        if not isinstance(raw_highway, str) or raw_highway in EXCLUDED_HIGHWAYS:
            continue

        try:
            way_id = int(element["id"])
            points = [
                project_point(point)
                for point in geometry
                if isinstance(point, dict)
            ]
        except (KeyError, TypeError, ValueError):
            continue
        if len(points) < 2:
            continue

        raw_name = tags.get("name")
        name = raw_name.strip() if isinstance(raw_name, str) else ""
        name = name or "unknown"

        for segment_index, (start, end) in enumerate(zip(points, points[1:])):
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            length = math.hypot(dx, dy)
            if length == 0.0:
                continue
            segments.append(
                RoadSegment(
                    way_id=way_id,
                    segment_index=segment_index,
                    name=name,
                    highway=raw_highway,
                    start=start,
                    end=end,
                    heading=(dx / length, dy / length),
                )
            )

    # Input order is already stable, but sorting makes tie resolution
    # independent of the extract's way ordering.
    segments.sort(key=lambda segment: (segment.way_id, segment.segment_index))
    return segments


def point_segment_distance(point: Point, segment: RoadSegment) -> float:
    """Distance from a projected point to a projected OSM segment."""

    dx = segment.end[0] - segment.start[0]
    dy = segment.end[1] - segment.start[1]
    length_squared = dx * dx + dy * dy
    if length_squared == 0.0:
        return math.hypot(
            point[0] - segment.start[0], point[1] - segment.start[1]
        )

    projection = (
        (point[0] - segment.start[0]) * dx
        + (point[1] - segment.start[1]) * dy
    ) / length_squared
    projection = max(0.0, min(1.0, projection))
    nearest = (
        segment.start[0] + projection * dx,
        segment.start[1] + projection * dy,
    )
    return math.hypot(point[0] - nearest[0], point[1] - nearest[1])


def closest_match(start: Point, end: Point, segments: Sequence[RoadSegment]) -> RoadSegment | None:
    """Return the closest OSM segment with a compatible heading."""

    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.hypot(dx, dy)
    if length == 0.0:
        return None

    route_heading = (dx / length, dy / length)
    midpoint = ((start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0)
    best: tuple[float, int, int, RoadSegment] | None = None

    for segment in segments:
        alignment = abs(
            route_heading[0] * segment.heading[0]
            + route_heading[1] * segment.heading[1]
        )
        if alignment < MIN_HEADING_ALIGNMENT:
            continue

        distance = point_segment_distance(midpoint, segment)
        if distance > MAX_MATCH_DISTANCE_M:
            continue

        candidate = (distance, segment.way_id, segment.segment_index, segment)
        if best is None or candidate[:3] < best[:3]:
            best = candidate

    return best[3] if best is not None else None


def dimensions(name: str, highway: str) -> tuple[int | float, int]:
    if name == "Senter Road":
        return (18, 4) if highway == "secondary" else (10, 2)
    if name in ROAD_DIMENSIONS:
        return ROAD_DIMENSIONS[name]
    return FALLBACK_DIMENSIONS.get(highway, FALLBACK_DIMENSIONS["unknown"])


def profile_for(segment: RoadSegment | None) -> dict[str, object]:
    if segment is None:
        name = "unknown"
        highway = "unknown"
        way_id: int | None = None
    else:
        name = segment.name
        highway = segment.highway
        way_id = segment.way_id

    width, lanes = dimensions(name, highway)
    return {
        "name": name,
        "highway": highway,
        "wayId": way_id,
        "width": width,
        "lanes": lanes,
        "curb": highway != "service" and name != "unknown",
    }


def route_points(payload: Mapping[str, object], direction: str) -> list[Point]:
    raw_points = payload.get(direction)
    if not isinstance(raw_points, list):
        raise ValueError(f"routes.json must contain a {direction} list")

    points: list[Point] = []
    for index, raw_point in enumerate(raw_points):
        if not isinstance(raw_point, dict):
            raise ValueError(f"Invalid {direction} route point at index {index}")
        try:
            points.append(project_point(raw_point))
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(
                f"Invalid {direction} route point at index {index}: {raw_point!r}"
            ) from error
    return points


def build_profiles() -> dict[str, object]:
    osm_payload = load_json(OSM_PATH)
    routes_payload = load_json(ROUTES_PATH)
    if not isinstance(osm_payload, dict) or not isinstance(routes_payload, dict):
        raise ValueError("Input JSON roots must be objects")

    osm_segments = load_osm_segments(osm_payload)
    output: dict[str, object] = {
        "source": "OpenStreetMap geometry supplied via the Overpass API.",
        "caveat": CAVEAT,
        "routesSha256": hashlib.sha256(ROUTES_PATH.read_bytes()).hexdigest(),
    }
    for direction in ("inbound", "outbound"):
        points = route_points(routes_payload, direction)
        output[direction] = [
            profile_for(closest_match(start, end, osm_segments))
            for start, end in zip(points, points[1:])
        ]
    return output


def main() -> None:
    profiles = build_profiles()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as destination:
        json.dump(profiles, destination, indent=2)
        destination.write("\n")

    inbound = profiles["inbound"]
    outbound = profiles["outbound"]
    if not isinstance(inbound, list) or not isinstance(outbound, list):
        raise ValueError("Generated profile arrays are invalid")
    unknown = sum(
        profile.get("name") == "unknown"
        for profile in (*inbound, *outbound)
        if isinstance(profile, dict)
    )
    print(
        f"Wrote {OUTPUT_PATH} ({len(inbound)} inbound, "
        f"{len(outbound)} outbound; {unknown} unknown names)"
    )


if __name__ == "__main__":
    main()
