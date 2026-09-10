#!/usr/bin/env python3
"""Print bounded metadata and classification counts for the campus LAZ tile."""

from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

import laspy
import numpy as np
from pyproj import Transformer


CHUNK_SIZE = 1_000_000


def classification_counts(reader: laspy.LasReader) -> dict[int, int]:
    counts: Counter[int] = Counter()
    for points in reader.chunk_iterator(CHUNK_SIZE):
        values, frequencies = np.unique(np.asarray(points.classification), return_counts=True)
        counts.update({int(value): int(frequency) for value, frequency in zip(values, frequencies)})
    return dict(sorted(counts.items()))


def format_tuple(values: tuple[float, ...]) -> str:
    return "(" + ", ".join(f"{value:.12f}" for value in values) + ")"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "path",
        nargs="?",
        type=Path,
        default=Path(".cache-local-scene/campus.laz"),
        help="LAS/LAZ file to inspect (default: .cache-local-scene/campus.laz)",
    )
    args = parser.parse_args()

    path = args.path
    with laspy.open(path) as reader:
        header = reader.header
        point_count = int(header.point_count)
        dimension_names = [str(name) for name in header.point_format.dimension_names]
        minimum = tuple(float(value) for value in header.mins)
        maximum = tuple(float(value) for value in header.maxs)
        crs = header.parse_crs()
        counts = classification_counts(reader) if "classification" in dimension_names else {}

    print(f"file: {path}")
    print(f"file_size_bytes: {path.stat().st_size}")
    print(f"crs: {crs.to_wkt() if crs is not None else 'None'}")
    print(f"bounds_min_xyz: {format_tuple(minimum)}")
    print(f"bounds_max_xyz: {format_tuple(maximum)}")
    print(f"point_count: {point_count}")
    print(f"dimension_names: {dimension_names}")
    print(f"classification_counts: {counts}")

    if crs is None:
        print("bounds_lon_lat: unavailable (header CRS missing)")
        return

    try:
        transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        corners = (
            ("min_x,min_y", minimum[0], minimum[1]),
            ("min_x,max_y", minimum[0], maximum[1]),
            ("max_x,min_y", maximum[0], minimum[1]),
            ("max_x,max_y", maximum[0], maximum[1]),
        )
        print("bounds_lon_lat:")
        for label, x, y in corners:
            longitude, latitude = transformer.transform(x, y)
            print(f"  {label}: ({longitude:.12f}, {latitude:.12f})")
    except Exception as error:
        print(f"bounds_lon_lat: unavailable ({error})")


if __name__ == "__main__":
    main()
