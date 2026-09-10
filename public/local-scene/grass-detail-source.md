# Original ground detail material

`grass-detail-albedo.png` was generated with the built-in image-generation tool on 2026-09-09. It is original illustrative material artwork, not a photograph or geographic measurement of campus. The generated 1254 × 1254 PNG is copied unchanged into the project.

SHA-256: `50f6cbf0777803634e3738371e18a973d9e0cb679ed95f6d794cd3755c6a8a10`

Prompt: square seamless PBR base-color ground texture; orthographic overhead view of short dry grass, olive-green blades, straw, tan sandy soil and fine grit; low saturation; even diffuse lighting; no cast shadows, specular highlights, objects, text, border or watermark; no large distinctive repeated clumps. Requested 1024 × 1024; tool returned 1254 × 1254.

## Renderer use

The aerial photographs retain their colors and geographic layout. A color heuristic selects warm or green terrain, then blends normalized detail luminance into it. The same texture supplies a small bump response. World-space mapping repeats every 2.8 meters; detail fades from 80 to 280 meters from the camera. When the camera is at least 500 meters from its orbit target, a uniform shader branch skips both the detail color and bump samples. In closer views the samples still execute for all terrain fragments; the color mask and distance fade only scale their contribution. These thresholds and dimensions are artistic choices. The heuristic is not a land-cover classification and may texture unmodeled warm-toned paving or miss gray vegetation. Separate road, building and plaza materials are unaffected.

Mean linear luminance, measured from the generated RGB pixels with the sRGB transfer function and Rec.709 weights, is 0.2512482676653683. The shader uses 0.25125 for normalization. Estimated RGBA8 GPU storage with mipmaps is approximately 8.0 MiB, shared between color detail and bump sampling. The PNG is approximately 3.8 MiB on disk; decoded CPU image backing and driver allocations are additional. No separate normal map is loaded.

Seamless tiling was requested but not quantitatively guaranteed by the generator. Repeat seams and the aerial image's preexisting shadows remain visual review items.

The initial 0.028 bump strength and 0.72 color modulation were reduced to 0.008 and 0.55 after the first rear-lane screenshot looked excessively grainy.
