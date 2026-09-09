#!/usr/bin/env python3
"""Build the illustrative BusTrackr routes from the bundled OSM extract.

The route corridors are deliberately bounded to the named roads in ROUTE_SECTIONS.
This is a small, offline generator for the proof of concept; it does not attempt to
model turn restrictions, traffic direction, or verified transit service.
"""

from __future__ import annotations

import heapq
import json
import math
from pathlib import Path
from typing import Iterable, Mapping, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OSM_PATH = PROJECT_ROOT / "public" / "data" / "osm.json"
ROUTES_PATH = PROJECT_ROOT / "public" / "data" / "routes.json"

Point = tuple[float, float]
Edge = tuple[float, Point]

CONNECTOR_LIMIT_M = 25.0

POINTS: Mapping[str, Point] = {
    "campus": (37.2753852, -121.8262493),
    "skyway_monterey": (37.272509, -121.8289484),
    "fehren_monterey": (37.2841543, -121.841415),
    "lot": (37.2843319, -121.8410603),
    "senter_west": (37.2779575, -121.835084),
    "senter_east": (37.2781695, -121.824235),
    "diamond_end": (37.2756465, -121.8223017),
}

REAR_CONNECTOR_WAYS = (94499751, 643481632, 94499728, 1191185342, 94417072)

ROUTE_SECTIONS: Mapping[str, tuple[tuple[str, str, str], ...]] = {
    "outbound": (
        ("Skyway Drive", "campus", "skyway_monterey"),
        ("Monterey Road", "skyway_monterey", "fehren_monterey"),
        ("Fehren Drive", "fehren_monterey", "lot"),
    ),
    "inbound": (
        ("Fehren Drive", "lot", "fehren_monterey"),
        ("Monterey Road", "fehren_monterey", "senter_west"),
        ("Senter Road", "senter_west", "senter_east"),
        ("Diamond Heights Drive", "senter_east", "diamond_end"),
    ),
}


def distance_m(first: Point, second: Point) -> float:
    """Return the approximate great-circle distance between two lat/lon points."""

    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    mean_lat = (lat1 + lat2) / 2.0
    east = dlon * math.cos(mean_lat)
    north = dlat
    # A local equirectangular approximation is accurate enough at this scale.
    return 6_371_000.0 * math.hypot(east, north)


class NamedRoadGraph:
    """Undirected graph containing geometry nodes for one named OSM road."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.nodes: set[Point] = set()
        self.adjacency: dict[Point, list[Edge]] = {}

    def add_way(self, geometry: Iterable[Mapping[str, object]]) -> None:
        points: list[Point] = []
        for raw_point in geometry:
            try:
                point = (float(raw_point["lat"]), float(raw_point["lon"]))
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError(
                    f"Invalid geometry point in {self.name!r}: {raw_point!r}"
                ) from error
            points.append(point)
            self.nodes.add(point)
            self.adjacency.setdefault(point, [])

        for first, second in zip(points, points[1:]):
            if first == second:
                continue
            weight = distance_m(first, second)
            self.adjacency[first].append((weight, second))
            self.adjacency[second].append((weight, first))

    def connect_tiny_gaps(self, limit_m: float = CONNECTOR_LIMIT_M) -> None:
        """Bridge disconnected same-road components when their gap is tiny."""

        components = self._components()
        for index, component in enumerate(components):
            for other in components[:index]:
                gap, first, second = min(
                    (distance_m(a, b), a, b)
                    for a in component
                    for b in other
                )
                if gap <= limit_m:
                    self.adjacency[first].append((gap, second))
                    self.adjacency[second].append((gap, first))

    def _components(self) -> list[set[Point]]:
        remaining = set(self.nodes)
        components: list[set[Point]] = []
        while remaining:
            start = min(remaining)
            remaining.remove(start)
            component = {start}
            stack = [start]
            while stack:
                current = stack.pop()
                for _, neighbor in self.adjacency[current]:
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        component.add(neighbor)
                        stack.append(neighbor)
            components.append(component)
        return components

    def snap(self, requested: Point) -> Point:
        if not self.nodes:
            raise ValueError(f"No geometry nodes found for {self.name!r}")
        return min(self.nodes, key=lambda point: (distance_m(requested, point), point))

    def shortest_path(self, requested_start: Point, requested_end: Point) -> list[Point]:
        start = self.snap(requested_start)
        end = self.snap(requested_end)
        distances: dict[Point, float] = {start: 0.0}
        previous: dict[Point, Point] = {}
        queue: list[tuple[float, Point]] = [(0.0, start)]

        while queue:
            cost, current = heapq.heappop(queue)
            if cost != distances.get(current):
                continue
            if current == end:
                break
            for weight, neighbor in self.adjacency[current]:
                next_cost = cost + weight
                if next_cost < distances.get(neighbor, math.inf):
                    distances[neighbor] = next_cost
                    previous[neighbor] = current
                    heapq.heappush(queue, (next_cost, neighbor))

        if end not in distances:
            raise ValueError(
                f"No {self.name!r} path between snapped nodes {start!r} and {end!r}"
            )

        path = [end]
        while path[-1] != start:
            path.append(previous[path[-1]])
        path.reverse()
        return path


def load_named_graphs(payload: Mapping[str, object]) -> dict[str, NamedRoadGraph]:
    graphs = {name: NamedRoadGraph(name) for sections in ROUTE_SECTIONS.values() for name, _, _ in sections}
    elements = payload.get("elements")
    if not isinstance(elements, list):
        raise ValueError("OSM extract must contain an elements list")

    for element in elements:
        if not isinstance(element, dict):
            continue
        tags = element.get("tags")
        geometry = element.get("geometry")
        if not isinstance(tags, dict) or not isinstance(geometry, list):
            continue
        name = tags.get("name")
        if name in graphs:
            graphs[name].add_way(geometry)

    for graph in graphs.values():
        graph.connect_tiny_gaps()
    return graphs


def load_way_geometries(
    payload: Mapping[str, object], way_ids: Iterable[int]
) -> dict[int, list[Point]]:
    wanted = set(way_ids)
    geometries: dict[int, list[Point]] = {}
    elements = payload.get("elements")
    if not isinstance(elements, list):
        raise ValueError("OSM extract must contain an elements list")

    for element in elements:
        if not isinstance(element, dict) or element.get("type") != "way":
            continue
        way_id = element.get("id")
        geometry = element.get("geometry")
        if way_id not in wanted or not isinstance(geometry, list):
            continue
        geometries[way_id] = [
            (float(point["lat"]), float(point["lon"]))
            for point in geometry
            if isinstance(point, dict)
        ]

    missing = wanted - geometries.keys()
    if missing:
        raise ValueError(f"OSM extract is missing connector ways: {sorted(missing)}")
    return geometries


def way_segment(
    geometries: Mapping[int, Sequence[Point]],
    way_id: int,
    start: Point,
    end: Point,
    *,
    reverse: bool = False,
) -> list[Point]:
    points = list(geometries[way_id])
    if reverse:
        points.reverse()
    try:
        start_index = points.index(start)
        end_index = points.index(end)
    except ValueError as error:
        raise ValueError(
            f"Connector way {way_id} does not contain requested endpoints "
            f"{start!r} and {end!r}"
        ) from error
    if start_index > end_index:
        raise ValueError(
            f"Connector way {way_id} endpoints are out of order for "
            f"{start!r} -> {end!r}"
        )
    return points[start_index : end_index + 1]


def append_deduplicated(target: list[Point], points: Iterable[Point]) -> None:
    for point in points:
        if not target or point != target[-1]:
            target.append(point)


def join_sections(
    graphs: Mapping[str, NamedRoadGraph],
    sections: Sequence[tuple[str, str, str]],
) -> list[Point]:
    route: list[Point] = []
    for road_name, start_key, end_key in sections:
        section = graphs[road_name].shortest_path(
            POINTS[start_key], POINTS[end_key]
        )
        append_deduplicated(route, section)
    return route


def as_json_points(points: Iterable[Point]) -> list[dict[str, float]]:
    return [{"lat": lat, "lon": lon} for lat, lon in points]


def build_routes() -> dict[str, object]:
    with OSM_PATH.open("r", encoding="utf-8") as source:
        osm_payload = json.load(source)

    graphs = load_named_graphs(osm_payload)
    outbound = join_sections(graphs, ROUTE_SECTIONS["outbound"])
    inbound = join_sections(graphs, ROUTE_SECTIONS["inbound"])
    connector_geometries = load_way_geometries(osm_payload, REAR_CONNECTOR_WAYS)
    rear_connector: list[Point] = []
    append_deduplicated(
        rear_connector,
        way_segment(
            connector_geometries,
            94499751,
            POINTS["diamond_end"],
            (37.2754437, -121.8235157),
            reverse=True,
        ),
    )
    append_deduplicated(
        rear_connector,
        way_segment(
            connector_geometries,
            643481632,
            (37.2754437, -121.8235157),
            (37.2753893, -121.8249265),
        ),
    )
    append_deduplicated(
        rear_connector,
        way_segment(
            connector_geometries,
            94499728,
            (37.2753893, -121.8249265),
            (37.2753354, -121.8249924),
        ),
    )
    append_deduplicated(
        rear_connector,
        way_segment(
            connector_geometries,
            1191185342,
            (37.2753354, -121.8249924),
            (37.2751212, -121.8251462),
        ),
    )
    append_deduplicated(
        rear_connector,
        way_segment(
            connector_geometries,
            94417072,
            (37.2751212, -121.8251462),
            POINTS["campus"],
            reverse=True,
        ),
    )
    append_deduplicated(inbound, rear_connector)

    osm_metadata = osm_payload.get("osm3s")
    osm_copyright = (
        osm_metadata.get("copyright")
        if isinstance(osm_metadata, dict)
        else None
    )
    return {
        "outbound": as_json_points(outbound),
        "inbound": as_json_points(inbound),
        "metadata": {
            "attribution": osm_copyright
            or "OpenStreetMap contributors; data available under the ODbL.",
            "source": "OpenStreetMap geometry supplied via the Overpass API.",
            "status": "Routes are illustrative; service is not verified.",
            "modeledConnector": {
                "description": "Rear connector follows OSM campus service roads; school access/service is unverified.",
                "ways": list(REAR_CONNECTOR_WAYS),
                "points": as_json_points(rear_connector),
            },
        },
    }


def main() -> None:
    routes = build_routes()
    with ROUTES_PATH.open("w", encoding="utf-8") as destination:
        json.dump(routes, destination, indent=2)
        destination.write("\n")
    print(f"Wrote {ROUTES_PATH}")


if __name__ == "__main__":
    main()
