# Local scene aerial image

`campus.jpg` is a downloaded public-domain NAIP aerial image. It is source imagery, not a photograph created by this project.

- Service: https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer
- Retrieved: 2026-09-09T21:35:13+00:00
- Image dimensions: 2048 × 1200 pixels
- Requested export: bbox `-121.8294,37.2738,-121.8216,37.2774`, size `2048,1200`, JPEG, RGB bands `0,1,2`
- The renderer should use `campus-bounds.json`, which preserves the extent returned by the service.

Source service description: https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer

## Authored facade and roof detail

Campus window surrounds, projecting sills, mullions, base bands and three glass shades are original illustrative geometry. The shared metal roof material is a deterministic 256-square procedural canvas texture with fine grain and panel seams, used as color and bump maps. Neither openings nor panel spacing were surveyed. These details prioritize visual depth and performance under the user's relaxed accuracy requirement.

## Daylight and concrete finish

`src/local/daylight.ts` paints a 512 × 256 equirectangular daylight gradient locally. It is an authored backdrop, not photography or a reconstruction of the hills beyond campus. Close views use it; full-route and overhead-map views retain the dark background for contrast. The reflection probe captures the daylight version once.

The quad's original procedural paving now uses a 1024 × 1024 texture containing sixteen subtly varied concrete slabs, with fine aggregate, edge staining and expansion joints. A 9.6 m UV period makes each slab 2.4 m square. The same texture supplies a small bump response. Dimensions, staining and joints are illustrative. Estimated RGBA8 GPU storage including mipmaps is about 5.3 MiB for paving and 0.67 MiB for the source sky; renderer-generated cubemaps and CPU canvas backing are additional, unmeasured costs.

## Illustrative campus furniture

Eight benches, four open-top bins and five inverted-U bicycle stands are original geometry added for human scale. Their placement is illustrative rather than surveyed: four benches flank the quad planters, two sit on the veranda deck and two on the conservatory entry apron. Paired bins sit by the quad and entry; bicycle stands use the outer portion of the entry apron, away from the modeled door openings.

Benches include individual timber seat/back slats, metal legs and armrests. A small 256 × 64 procedural wood texture is shared. Bins have open shells, ring rims and recessed dark openings. All parts join the existing material batches; no per-furniture animation, external asset or network request is added. Quad bases use the modeled slab elevation, and entry/veranda pieces use their respective modeled deck tops.

The Conservatory preset uses a lower, closer camera to show the entrance furniture and curtain wall. Bicycle stands use dark painted metal for legibility against the pale apron. The wider Campus preset remains available for context.

## Conservatory correction and sparse academic openings

The previous flat, tall glass facade and repeated academic-window grid were rejected by the user. The replacement uses an approximately two-story glazed corner, two perpendicular curtain walls, largely solid stone wings with three small horizontal openings, a translucent gridded canopy, raking columns, and an illustrative interior lobby staircase. The opaque footprint is notched at the entrance so it does not fill the glazed lobby. The stone texture now uses a 5 m UV period rather than 2 m, with less bump relief.

Reference photographs were viewed for architectural form only; none are shipped as textures:

- Official gallery: https://www.vcs.net/k-12-programs/conservatory-of-the-arts/conservatory-facilities
- Front corner: https://resources.finalsite.net/images/f_auto,q_auto,t_image_size_5/v1589568034/vcsanjose/nvpbn75a8vvkri9jjy9r/Website-69_web.jpg
- Side: https://resources.finalsite.net/images/f_auto,q_auto,t_image_size_5/v1589568034/vcsanjose/kg2tvtknltnjume968mh/Website-70_web.jpg
- Academic facade: https://resources.finalsite.net/images/f_auto,q_auto/v1591219846/vcsanjose/tinblv1jvruthfhzoedt/campusphotos-19-of-20_web.jpg
- Quad arcade: https://resources.finalsite.net/images/f_auto,q_auto/v1591219845/vcsanjose/vzh5vvqqcrfmk2yo5b2y/campusphotos-15-of-20_web.jpg

Ordinary academic walls now have only a few grouped horizontal openings on selected elevations. Exact dimensions, unseen elevations, opening counts, staircase layout, and canopy framing remain approximations. This is an authored interpretation, not a surveyed reconstruction. Transparent glass uses alpha blending without transmission/refraction to keep the mobile rendering cost bounded.

### Glass and canopy material refinement

The canopy is now approximately 24 m square at 11.5 m above the entrance deck, with a thinner 2.4 m grid and a stronger perimeter. Its size and height are illustrative adjustments based on the reference silhouette, not measurements. Lobby glazing uses a cooler tint, lower opacity and weaker reflections; recessed gray interior wall finishes, two emissive ceiling strips and dark stair supports add depth without extra light sources or expensive transmission. The emissive strips do not illuminate other geometry.
