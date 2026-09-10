# Valley Shuttle

Phone-first Fehren ↔ Skyway shuttle POC with a locally rendered Three.js scene. This replaces the earlier streamed Cesium environment.

## Run

```sh
npm install
npm run dev -- --port 4173 --strictPort
```

Open http://localhost:4173. No Cesium token or map-service account is required. All runtime scenery assets are served from this project.

```sh
npm run build
npm run preview -- --port 4174
```

The production base path is `/BusTrackr/`.

## Scene

Three.js renders a USGS elevation mesh clipped to the bus corridor and campus, using a local grid that blends measured lidar ground around campus into the retained route terrain (`public/local-scene/terrain-source.md`), with locally hosted public-domain NAIP aerial imagery. OSM building footprints become locally textured walls and inferred pitched or flat roofs. Nearby roadside buildings receive windows, doors, gutters and estimated rooftop equipment; `public/local-scene/buildings-source.md` documents the height handling and inference limits. Three main campus roofs use authored architectural forms with elevations guided by USGS lidar. Raw point-derived roof meshes were rejected after close views exposed stepped artifacts; facade forms and sparse window groups remain approximate. Authored landmarks include the Conservatory glass canopy and stone entry, the quad tower, veranda and cross, stadium seating and lights, the competition pool, baseball fencing and dugouts, and parked vehicles. Ground placements are documented in `public/local-scene/grounds-source.md`. Trees are instanced from vegetation-colored imagery areas; buildings, fields, and the route are excluded. Route road surfaces now include estimated full carriageway widths, meter-scale asphalt, lane paint and curbs. `public/local-scene/roads-source.md` records the estimates and missing junction detail.

The original detailed bus GLB is reused for three simulated shuttles. Campus, Conservatory, quad, sports, Fehren, full-route, overhead, follow, and close-up cameras are available. Pause and speed controls affect the eight-minute demo trip cycles. No positions or ETAs are live.

This is a working independent reconstruction, not photogrammetry-quality scenery. Ground detail is limited by aerial resolution, with a separate 2048×1200 campus export; facades are approximate; route alignment, widths, elevations, and service access need school confirmation. This is a React web POC, not an Expo native build.

## Performance

The moving scene targets 30 FPS. Paused scenes render only while a view changes, and hidden tabs suspend rendering and the simulation clock. Geometry is merged by material; vegetation is instanced in spatial cells with simpler foliage once the camera is more than 240 meters from the entire batch bounding sphere; only buildings wholly inside the clipped area render. Resolution caps are 1 pixel per CSS pixel on phones and 1.4 on desktop. Shadows cover a local area at 1024/2048 pixels. Actual phone hardware still needs profiling.

Inspect the `.world` element's `data-diagnostics` attribute for measured FPS, a rolling 30-sample average/minimum, draw calls, triangles, geometry/texture counts, and rendered building/tree counts. These browser measurements are not physical-device benchmarks.

## Regenerate assets

- `npm run fetch:local-aerial`: download the bounded public-domain NAIP image and preserve the returned geographic extent.
- `npm run build:local-footprints`: filter bundled OSM buildings and vegetation exclusions.
- `python3 scripts/build-road-profiles.py`: match route segments to bundled OSM names/classes and regenerate estimated road widths.
- `npm run build:corridor`: regenerate route corridor polygons after changing route data.
- `.venv-lidar/bin/python scripts/fetch-campus-lidar.py`: fetch and validate the fixed public-domain campus lidar tile.
- `.venv-lidar/bin/python scripts/build-roadside-roofs.py`: regenerate measured roadside roof-level profiles after changing footprints; roof forms and facade openings remain inferred.
- `.venv-lidar/bin/python scripts/build-local-terrain.py`: regenerate the runtime elevation grid from the retained DEM and downloaded class-2 lidar ground points.
- `.venv-lidar/bin/python scripts/build-campus-roofs.py`: regenerate the experimental point-derived roofs (retained for reference, not loaded by the renderer); requires numpy, scipy, laspy[lazrs], and pyproj in the Python environment.
- `npx tsx scripts/build-bus.ts`: rebuild the original bus GLB.

## Sources and licenses

- USDA/USGS NAIP aerial imagery: public domain, downloaded from the [National Map image service](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer). Exact provenance is in `public/local-scene/README.md`.
- USGS 3DEP elevation: public domain; bundled grid retains its geographic reference.
- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL: routes and building footprints. Attribution remains visible in the UI. Generating our own meshes does not remove the underlying data attribution.
- Original synthetic stone, shingle, broadleaf and ground-detail materials were generated with the built-in image tool; complete prompts and limitations are in `public/local-scene/stone-source.md`, `public/local-scene/shingles-source.md` and `public/local-scene/broadleaf-source.md`, and `public/local-scene/grass-detail-source.md`. The distant tree texture is rendered locally from the same near-tree crown; its alpha-edge treatment and abrupt batch transition remain approximate.
- Original bus geometry; mesh lettering uses the Three.js Helvetiker example font, with its embedded license in `scripts/helvetiker.json`.
- The historical [school shuttle map](https://resources.finalsite.net/images/v1700598195/vcsanjose/dl7ylcazkn69aup72dro/VCS_Shuttle_Map.pdf) helped identify Fehren; its timetable is not presented as current.

Legacy Cesium scripts and reference assets remain in the branch history/source, but the scene does not import Cesium or request Google tiles. The old Esri aerial reference is not used by this renderer.

## Controls

Drag to pan by default. The Pan/Orbit toggle switches one-finger or left-mouse dragging to orbit; right-mouse dragging rotates in either mode. Pinch or scroll to zoom. Campus views use a compact phone panel; expand it to choose another shuttle or scrub the demo trip.

## POC release limits

The scenery is an authored approximation, with original detailed bus models and reference-informed campus landmarks. It is not photogrammetry. Bus positions and ETAs are simulated. Real GPS, school-verified routing, native packaging, accessibility review and physical-phone profiling are later production work. Some small roadside buildings have documented terrain/eave conflicts, aerial textures blur close to the ground, and transparent glazing uses a simplified material. See `docs/performance.md` for measured preview results and limitations.
