# Route road surfaces

The renderer uses the existing local OpenStreetMap shuttle centerlines. `scripts/build-road-profiles.py` assigns nearby OSM road names and classes to each route segment, then writes `road-profiles.json`. OSM attribution and its ODbL notice remain in the application.

Road widths, lane counts, lane positions, curbs and material appearances are authored visual estimates. They are not lane-level navigation data or a street survey. The public-domain aerial image provides context; it does not establish exact curb dimensions. Monterey is modeled as a 24 m six-lane road, secondary Senter segments as an 18 m four-lane road, Skyway as a 7.2 m two-lane road, and narrower service roads as 6.5 m. Local variations, medians, parking lanes, turn pockets and junction markings still need closer reconstruction.

`src/local/roads.ts` constructs meter-scale asphalt, center/edge paint, dashed lane separators and curb faces. Asphalt grain and sealed-crack marks are original procedural texture work. Curbs and longitudinal paint stop before sharp route turns and are masked within an estimated junction radius at road-name changes; they do not fully reconstruct every intersecting side street. Duplicate shared route segments are drawn once. Bus lane offsets are visual approximations within the estimated carriageways, preserving the original route centerlines.

This scenery does not assert that either shuttle route or the rear campus connector is currently authorized or in service. Vehicles remain simulated.

Rendering rounds each corner within at most 6 m of its adjacent straight segments, and no more than 24% of either segment length. The canonical routes JSON is unchanged. Roads are tessellated both along and across their widths so the elevated asphalt follows the underlying terrain without exposing large triangular holes.

The generated profile records the SHA-256 of its route input. The production build checks that hash, both segment counts and the fields the renderer consumes; stale profiles fail with a regeneration instruction.

## Visual streetscape pass

The user requested convincing detail without survey-level accuracy. Concrete sidewalk slabs (approximately 1.86 m wide), illustrative lowered driveway sections and narrow gravel shoulders now provide ground scale beside the routes. Seventy-seven authored streetlights have tapered shafts, arms, luminaires, access panels and concrete bases. Their positions, spacing and construction are visual estimates, not a record of actual street infrastructure. They are batched by material and do not add dynamic point lights.

Road tops, paint, sidewalk slabs and shoulder surfaces are split at the rendered terrain grid's cell edges and diagonals. This fixes road interiors crossing terrain even though their original vertices were above it; it does not improve surveyed road elevations. `scripts/check-road-contact.ts` exercises the actual road builder on folded terrain, where the earlier mesh penetrated by 1.22 m. Runtime diagnostics also report sampled minimum clearance on the actual routes. These samples are diagnostic evidence, not a proof that no other scene geometry intersects a road.

Gravel shoulders taper from 14 cm above the sampled terrain at the road edge to 1.5 cm at their outer edge, where a vertex-driven alpha fade blends into the ground. Asphalt, paint, sidewalk and shoulder surfaces weld coincident vertices within 0.1 mm before computing smooth normals. The concrete curb batch retains flat normals on both its vertical faces and horizontal tops, so small curb-top facets remain possible. Both changes are for coherent shading and appearance, not geographic accuracy. The road-clearance diagnostic samples only asphalt; other materials and scene intersections are outside its coverage.
