# Roadside buildings

`src/local/buildings.ts` constructs local geometry from the bundled OpenStreetMap footprints. The footprint export records whether each height came from a numeric `height`, `building:levels`, or a fallback estimate. OpenStreetMap attribution remains required. No Google or Cesium building meshes are used by this module.

Roof styles, facade openings, colors and equipment are authored approximations, not surveyed features. Small footprints between 45 and 310 square meters with heights below 8 meters and bounds below 32 meters are treated as residential; explicit houses and static caravans also receive residential treatment. This heuristic can misclassify buildings with unspecified use. Complex pitched roofs use a tessellated distance-to-footprint-edge surface, not an exact architectural roof plan.

OSM heights remain stored in the footprint data and are used when no suitable lidar roof profile is available. For that fallback, recorded overall heights are preserved. Inferred pitched-roof rise is limited to leave at least 2.45 meters of wall where the source height permits it; short recorded buildings are not silently raised. Low heights can therefore produce unusually shallow roofs. Static caravans with fallback heights use an authored 3.2-meter height. Flat roofs have a small added parapet. Foundations use the lowest footprint terrain sample, which can still bury facades on steep grades; this needs further reference-based correction.

Openings are added to buildings whose footprint vertex-mean center is within 48 meters of a shuttle centerline. This center-based approximation can omit a nearby facade on a large or elongated building. Window heights adapt to available wall space. Doors and garages reserve space only when they actually fit. Original procedural stucco, simple glass, frames, sills, gutters and downspouts provide local facade detail. Large nearby nonresidential buildings receive estimated rooftop equipment. Their placement and count do not document actual installed equipment.

The repeating shingle image was generated with the built-in image tool; its complete prompt is in `shingles-source.md`. It is synthetic material imagery, not a capture of these buildings. Walls and roofs remain approximate and do not constitute photogrammetry.

Static geometry is merged by material and 180-meter spatial cell so distant cells can be culled. This trades a larger number of meshes for useful camera culling. Sustained rendering measurements are recorded separately in `docs/performance.md`; these do not establish startup time, peak memory, or physical-phone performance.

Facade openings and rooftop equipment are batched separately from roof/wall structure. Detail batches are hidden when their bounding sphere is more than 240 meters from the camera. This avoids drawing small openings from the whole-route camera while retaining nearby ride-along detail. It does not reduce asset construction cost or resident geometry memory, and transitions are a simple visibility switch.

## Measured roof elevations

`build-roadside-roofs.py` extracts class-6 building-point heights from the same 2020 USGS LAZ tile. `roadside-roofs.json` records source and footprint hashes, datum, sample counts and the 5th/95th height percentiles. The file currently contains 126 qualifying profiles. These percentiles approximate lower/upper roof levels; they are not surveyed eave or ridge lines, and the roof topology is still inferred from the footprint.

For included roadside buildings, the renderer accepts a profile when its lower roof level is between 2 and 20 meters above the modeled base and its percentile spread is at most 4 meters. Of 126 emitted profiles, 91 are encountered in the constructed roadside set: the current scene accepts 88 and rejects three. Accepted levels replace the generic vertical roof estimate. OSM height supplies the fallback vertical levels and still participates with kind/footprint size in residential-versus-flat classification. The renderer retains its inferred style and material; it does not reconstruct every plane or capture photographic facade textures. Flat profiles use the lower roof level as their cap, with authored parapets/equipment.

Auxiliary campus roof caps also use a local rough roof material instead of projecting the aerial ground image onto a raised cap. Their exact materials and roof equipment are not surveyed.
