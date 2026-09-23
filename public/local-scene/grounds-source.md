# Campus grounds reconstruction

`src/local/grounds.ts` contains authored geometry positioned against `campus.jpg`, the locally hosted public-domain NAIP orthophoto documented in `campus-source.md`.

Placement coordinates were traced in the 2048 × 1200 image. They map linearly to longitude −121.8294 through −121.8216 and latitude 37.2774 through 37.2738. The code records the traced points so placement can be reviewed against the source.

Modeled elements include perimeter fencing and backstops for the two ballfields, four small dugout shelters, bases, football uprights, and four parking rows. Separate terrain-conforming meshes now supply the ground beneath these structures. Fence heights, shelter proportions, base placement, and vehicle designs are estimates. They are visual reconstruction details, not a survey. The 57 parked cars occupy a shared layout of 62 complete paved bays, clipped to the lot boundaries and kept clear of pedestrian paths. They illustrate parking rows; they do not represent current occupancy or specific real vehicles.

Chain-link material, vehicle geometry, and paint colors are authored procedurally. The image is an offline placement reference only. The runtime field surfaces, dirt fans, paths, parking lots, bay markings, practice-field goals, and tennis pads are modeled in `src/local/landscape.ts` and `src/local/grounds.ts`. No school reference photograph, Google tile, or Apple 3D asset is redistributed as part of these models.

The quad shrubs use original procedurally drawn leaf textures and authored clipped envelopes. They approximate the photographed planters, not individual surveyed plants. Campus roof plates use authored solid materials so the overhead image does not duplicate roof detail beneath the modeled roof planes.
