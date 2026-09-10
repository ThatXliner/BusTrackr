# Local terrain reconstruction

The runtime reads `elevation.json` in this directory. It is generated offline by `scripts/build-local-terrain.py` from the retained legacy elevation grid and the downloaded public-domain USGS 2020 Santa Clara County LAZ tile. Exact source URL, coordinate system, conversion, dimensions and sample counts are in `terrain-source.json`.

The legacy 512-square grid ends at longitude -121.8225400390625. Some houses rendered east of that boundary were being assigned heights from its last interpolation cell. The replacement 640 × 512 grid covers the aerial ground bounds. Within the LAZ tile, classified ground points (class 2) are averaged into 1.5-meter cells and linearly interpolated. Values require a ground sample within 15 meters and blend with the baseline across a 10-meter tile-boundary strip. Elsewhere the legacy baseline is retained; this is not new lidar coverage of the entire route.

The generator converts US survey feet to meters and validates the horizontal CRS. Lidar heights use NAVD88. The original grid is retained unchanged. Source measurements date to 2020; interpolation, the ground classification and subsequent site changes all limit fidelity. This is a visual reconstruction, not a new site survey.

The replacement removes the false multi-meter grade across the three checked eastern house footprints. The renderer's coarse terrain triangles and its lowest-corner building anchor still cause some terrain/facade conflicts elsewhere. The diagnostic `terrainIntrusionIds` only checks footprint corners against the modeled eave; it is not a complete mesh intersection test. The manually authored quad terrace remains applied after elevation sampling.

The new grid does not increase the terrain mesh resolution. Runtime geometry still uses the existing 300 × 256 terrain grid and samples road contact heights on the rendered triangles. More accurate parcel grading, foundations, and fine retaining-wall geometry remain unfinished.
