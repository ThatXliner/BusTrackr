# Independent-scene performance checks

The table below records the earlier roof experiment. It predates the added grounds, tower and final authored roof forms. It is historical evidence, not a current-scene benchmark.

September 9, 2026. These measurements apply to the Three.js worktree, not the Cesium version on main. They were collected in the Codex Chromium browser on the development computer. A phone-sized viewport is not a physical-phone benchmark.

| View / action | Evidence | Result |
| --- | --- | --- |
| Conservatory, 390 × 844, moving simulation | `.audit/evidence/phone-architecture-sustained.json` | 30 one-second samples: 30.0 FPS average, 29.7 minimum sample; 44 draw calls, 98,199 triangles |
| Conservatory, 1280 × 720, refined planar roofs | `.audit/evidence/desktop-architecture-sustained.json` | 30 samples: 30.0 FPS average, 29.7 minimum; 57 draw calls, 113,881 triangles |
| Conservatory, 390 × 844, refined planar roofs | `.audit/evidence/phone-refined-sustained.json` | 30 samples: 30.0 FPS average, 29.7 minimum; 51 draw calls, 162,701 triangles |
| Full route, 390 × 844 | `.audit/evidence/phone-route-sustained.json` | 30 samples: 30.0 FPS average, 29.7 minimum; measured before the last roof and line-overlay changes |
| Same view, paused and settled | `.audit/evidence/phone-pause.json` | 0 FPS; total rendered frames remained 1,448 across two observations |

These measurements include 200 leaf sprays per nearby tree, branching trunks, and spatial foliage LOD. The refined-roof desktop and phone samples include the geometry of that earlier roof experiment. The earlier phone overview and paused samples preceded that refinement. Ride-along, bus close-up, a repeat of the final full-route geometry, and real mobile hardware still need equivalent sustained evidence.

## Grounds and quad pass before road reconstruction

Measured after adding the terrace, tower/veranda, authored roof forms, ballfield fences, parked cars, and shrub leaves. All rows below use pixel ratio 1. Phone viewport 390 × 844 renders a 390 × 584 canvas above the shuttle sheet; desktop viewport/canvas are 1280 × 720. These remain desktop-browser tests.

| View / action | Evidence | Result |
| --- | --- | --- |
| Quad, desktop | `.audit/evidence/quad-material-desktop.json` | 30 samples, 30.0 FPS average, 29.7 minimum; 76 calls, 192,641 triangles |
| Sports, desktop | `.audit/evidence/sports-current-desktop.json` | 30 samples, 30.0 FPS average, 29.7 minimum; 82 calls, 244,969 triangles |
| Sports, phone | `.audit/evidence/sports-current-phone.json` | 30 samples, 30.0 FPS average, 29.7 minimum; 56 calls, 162,929 triangles |
| Quad, phone | `.audit/evidence/quad-material-phone.json` | 30 samples, 30.0 FPS average, 29.7 minimum; 58 calls, 183,255 triangles |
| Quad paused, phone | `.audit/evidence/quad-current-phone-paused.json` | Both observations: 0 FPS, totalFrames 4,215 |
| Zoom while paused, phone | `.audit/evidence/quad-current-phone-paused-zoom.json` | View updated with one frame (totalFrames 4,216), then returned to 0 FPS |

Draw calls and triangle counts are the instantaneous final sample; moving buses and visibility can change them during a run. Screenshots with the same view names show the tested composition. The Buildings menu opened and selected the quad at phone width. Resume was exercised before the desktop sports check.

Scene construction time, peak memory, real-device performance, and equivalent current measurements for the route, Fehren, ride-along, and detailed bus remain unverified. In particular, the shrub builder merges 3,000 temporary leaf planes during initialization; steady-state frame rate does not measure that cost.

## Road reconstruction pass

The carriageway and contact-shadow changes landed after the grounds/quad table above. The four rows below predate the final junction marking mask; a targeted check of that final reduction follows separately. Those earlier values remain historical measurements, not measurements of this road geometry.

| View | Evidence | Result |
| --- | --- | --- |
| Bus close-up, phone | `.audit/evidence/road-bus-phone.json` | 30 samples, 30.0 FPS average, 29.7 minimum; 23 calls, 241,410 triangles |
| Ride-along, phone | `.audit/evidence/road-follow-phone.json` | 30 samples, 30.0 FPS average, 29.7 minimum; 32 calls, 244,298 triangles |
| Ride-along, desktop | `.audit/evidence/road-follow-desktop.json` | 30 samples, 30.0 FPS average, 29.7 minimum; 36 calls, 263,418 triangles |
| Bus close-up, desktop | `.audit/evidence/road-bus-desktop.json` | 30 samples, 30.0 FPS average, 29.8 minimum; 26 calls, 243,686 triangles |

Desktop uses a 1280 × 720 viewport/canvas, phone a 390 × 844 viewport and 390 × 584 canvas; both use pixel ratio 1. Screenshots show the actual camera position; counts are the final instantaneous sample. Physical-device, initialization-memory, and full-route coverage remain open. Road widths/lane positions remain approximate even when performance passes. Paused desktop follow remained at 0 FPS and 2,385 total frames in two observations (`.audit/evidence/road-follow-paused.json`); simulation was then resumed and the temporary viewport reset.

Final junction-mask check: `.audit/evidence/road-junction-follow-desktop.json` records 30 samples at 30.0 FPS average / 29.7 minimum, 39 calls and 253,728 triangles, with a 1280 × 720 viewport/canvas and pixel ratio 1. The targeted paused image `road-junction-cleanup-desktop.png` shows the removed curb/paint spike; it is a separate observation from this moving performance run. Broader junction shape, median and crossing details remain approximate.

## Repeat

1. Open a camera view and let the 1.2-second transition finish.
2. Read `.world`'s `data-diagnostics` attribute. It includes `fpsSamples`, `averageFps`, `minimumFps`, `totalFrames`, draw calls, triangles and asset counts. Wait for 30 samples in that camera mode.
3. Pause, wait for camera damping to settle, then record two observations several seconds apart. FPS should be zero and totalFrames should stay unchanged.
4. While paused, zoom or switch cameras. The changed view should render and then settle again. Resume and confirm the shuttles move.
5. Repeat the camera checks at desktop and 390 × 844. Reset temporary viewport overrides afterwards.

## Rendering controls

The renderer caps moving scenes at 30 FPS while retaining the timing remainder between frames. It draws on demand while paused and suspends the animation loop in hidden tabs. Materials batch static geometry; trees are instanced in 100 m cells, with simpler foliage beyond 240 m. Pixel ratio caps are 1 on phone layouts and 1.4 on desktop. Shadows use 1024/2048 maps covering a local area.

Scene assets are locally hosted. The `sceneSource` diagnostic describes that configuration; it is not a network-request measurement. Google Fonts remain an external UI font dependency. No HAR-based zero-network claim has been verified.

Production checks use `npm run build`. Passing compilation does not verify appearance, route accuracy, memory consumption, or physical-device performance.

## Roadside buildings pass

All earlier tables predate the roadside roof/facade module. The first measurement covers the initial module before facade distance culling, including 180-meter material batches and openings near routes. They are desktop-browser measurements; phone dimensions do not establish physical-phone performance.

| View | Evidence | Result |
| --- | --- | --- |
| Ride-along, desktop, 1280 × 720 | `.audit/evidence/buildings-follow-desktop.json` | 30 samples, 30.0 FPS average, 29.7 minimum; final sample 97 calls, 368,277 triangles, pixel ratio 1 |

The build passes. The Senter oblique inspection shows facade openings that previously disappeared under the roof-height allocation. The screenshot does not prove correct roof styles or height surveys. Full camera coverage, real hardware, startup cost and memory remain open.

Final facade-culling check: `.audit/evidence/buildings-cull-overview-phone.json` records 30 samples at 30.0 FPS average / 29.0 minimum in the 390 × 844 desktop-browser viewport (390 × 584 canvas, DPR 1). The final sample draws 373 calls and 607,477 triangles. Before detail culling, the same portrait overview recorded 458 calls and 695,245 triangles in `buildings-overview-phone-final.json`: approximately 19% fewer calls and 13% fewer triangles. Geometry objects increase from 274 to 298 because detail batches are separate; this is a rendering reduction, not a memory reduction. The matching screenshot shows both stop labels within the portrait composition.

`buildings-overview-phone.json/png` precedes the portrait framing fix; `buildings-follow-phone.json/png` is an incomplete 16-sample observation before the final camera/culling changes. Neither is current sustained-performance evidence.

The final phone ride-along sample (`buildings-cull-follow-phone.json`) records 30 samples at 30.0 FPS average / 29.7 minimum, 38 calls and 232,586 triangles. The matching screenshot covers the observed Fehren-side section, not every route segment. After pausing and settling, two observations both recorded 0 FPS and 2,846 total frames (`buildings-cull-paused-phone.json`). Resuming was exercised before the desktop overview check.

The final desktop overview (`buildings-cull-overview-desktop.json/png`, 1280 × 720, DPR 1) also records 30 samples at 30.0 FPS average / 29.7 minimum, with 376 calls and 607,483 triangles at capture. Its screenshot exposes a remaining composition issue: the shuttle card partly covers the Fehren endpoint label. The phone portrait fix does not establish desktop overlay clearance. The viewport override was reset and the preview returned to Campus.

## Broadleaf foliage and current terrain pass

The final foliage material, baked far crown, bounds-based detail selection and render-target cleanup were active for these checks. These replace the earlier performance tables as evidence for the current renderer. Desktop is 1280 × 720; phone is a 390 × 844 desktop-browser viewport with a 390 × 584 canvas. Both use pixel ratio 1. No physical-phone claim is implied.

| View | Viewport | FPS average / minimum | Calls / triangles | Evidence |
| --- | --- | --- | --- | --- |
| campus | desktop | 30.0 / 29.7 | 195 / 416,117 | `.audit/evidence/foliage-final-campus-desktop.json` |
| overview | desktop | 30.0 / 29.7 | 376 / 608,635 | `.audit/evidence/foliage-final-overview-desktop.json` |
| follow | desktop | 30.0 / 29.8 | 116 / 395,634 | `.audit/evidence/foliage-final-follow-desktop.json` |
| bus | desktop | 30.0 / 29.8 | 86 / 336,251 | `.audit/evidence/foliage-final-bus-desktop.json` |
| campus | phone | 30.0 / 29.7 | 126 / 321,768 | `.audit/evidence/foliage-final-campus-phone.json` |
| overview | phone | 30.0 / 29.8 | 373 / 608,629 | `.audit/evidence/foliage-final-overview-phone.json` |
| follow | phone | 30.0 / 29.7 | 46 / 280,284 | `.audit/evidence/foliage-final-follow-phone.json` |
| bus | phone | 30.0 / 29.7 | 26 / 232,383 | `.audit/evidence/foliage-final-bus-phone.json` |

Each row has 30 rolling samples; call and triangle counts are the final instantaneous observation and can vary with bus position. Matching PNGs were visually inspected. Both overview endpoints are visible. The bus-phone screenshot also exposes a hard-edged raised surface alongside the rear access road; it is an unresolved visual defect, not a passing geographic-accuracy check.

An additional close conservatory check (`foliage-final-conservatory-desktop.json/png`) records 30 FPS average / 29 minimum, 97 calls and 321,044 triangles. It verifies near-tree appearance only. Whole-batch detail transitions and far-crown filtered edges still need targeted examination. Startup time, peak memory, GPU allocations and transition-frame spikes are not measured. Estimated texture memory is documented in `public/local-scene/broadleaf-source.md`.

The earlier `foliage-overview-desktop.json/png` showed an unsettled/incorrectly close camera and is excluded as overview evidence. Other files without the `foliage-final-` prefix predate the final material, distance or cleanup changes and are historical only.

Paused phone bus rendering recorded 0 FPS and 13,973 total frames in both observations (`foliage-final-paused-phone.json`). Switching to Campus while paused rendered the camera transition, then a Zoom in action produced exactly one frame (14,011 → 14,012) and returned to 0 FPS (`foliage-final-paused-zoom-phone.json`). Simulation was resumed and the temporary viewport reset. The browser error-log query returned no entries at this checkpoint.

## Streetscape and road contact pass

These targeted measurements supersede earlier tables for the current code. They include terrain-conforming road meshes, sidewalks, 77 streetlights, feathered shoulders and brighter lighting. Canonical routes are unchanged. Pixel ratio is 1; phone dimensions are a desktop-browser viewport, not physical hardware.

| View | Samples | Average / minimum FPS | Calls / triangles | Evidence |
| --- | --- | --- | --- | --- |
| bus, phone 390 × 844 (390 × 584 canvas) | 30 | 30.0 / 29.7 | 61 / 467,045 | `.audit/evidence/streets-final-bus-phone.json` |
| overview, phone 390 × 844 (390 × 584 canvas) | 30 | 30.0 / 29.7 | 378 / 793,439 | `.audit/evidence/streets-final-overview-phone.json` |

Matching PNGs were inspected. The overview keeps both endpoint labels clear. The matching fixed-position rear-lane view is `streets-final-rear-lane-phone.png`; earlier `road-contact-after-84.png` predates the lighter feathered shoulder and smooth normal refinement. `streets-bus-phone` also predates those final refinements and is historical evidence only.

The detail pass adds approximately 185,000 submitted triangles to the phone overview (608,629 in the previous final foliage overview versus 793,439 now), while both observed averages remain 30 FPS. This comparison is a scene-cost indication, not a controlled GPU benchmark; buses move between captures. Road geometry is still batched across the corridor, so close views submit off-camera parts of those batches. Startup cost, peak memory and physical-phone performance remain unmeasured.

The final desktop campus check (`streets-final-campus-desktop.json/png`, 1280 × 720, pixel ratio 1) records 30 samples at 30.0 FPS average / 29.7 minimum, with 209 calls and 663,361 triangles at capture. It verifies the brighter composition at that camera, not every close campus view. The demo seek control was exercised at 84% inbound and 50% outbound while paused; `streets-seek-return-phone.png` shows the return route at the selected position.

Final paused desktop campus observations both report 0 FPS and 6,842 total frames (`streets-final-paused.json`). The browser error-log query returned no entries. Simulation was resumed and the viewport override reset after verification. These targeted checks do not replace a full physical-device or all-location sweep.

## Campus facade and composition pass

Current targeted checks include layered campus windows, shared procedural roof texture, closer campus camera and compact desktop controls. DPR is 1 throughout. Phone checks use a desktop browser viewport, not physical hardware.

| View | Viewport | Samples | Average / minimum FPS | Calls / triangles | Evidence prefix |
| --- | --- | --- | --- | --- | --- |
| quad | 1280 × 720 | 30 | 30.0 / 29.8 | 148 / 703,224 | `campus-details-quad-desktop` |
| campus | 390 × 844 (390 × 584 canvas) | 30 | 30.0 / 29.7 | 138 / 597,923 | `campus-details-campus-phone` |
| quad | 390 × 844 (390 × 584 canvas) | 30 | 30.0 / 29.7 | 102 / 668,685 | `campus-details-quad-phone` |

JSON and inspected matching PNG files are in `.audit/evidence/`. Calls and triangles are instantaneous counts. Tablet screenshots at 690 × 800 verify collapsed-card clearance and expanded fleet controls; the mini-map is hidden in that width band. Browser error logs returned no entries. This pass does not remeasure startup, memory, physical phones or unrestricted shadow-frustum panning. Earlier paused-render measurements remain historical; rendering-loop code was unchanged.

The additional conservatory preset (`campus-details-conservatory-desktop.json/png`, 1280 × 720, DPR 1) records 30 samples at 30.0 FPS average / 29.8 minimum, with 114 calls and 657,950 triangles. Its screenshot was inspected for canopy, facade and roof appearance; no unrestricted panning claim is made. The temporary viewport override was reset and the moving preview returned to Campus.

The reviewer caught a second tablet collision in the earlier expanded screenshot: the fleet card covered play/pause. The final 651–1000 px expanded-state rule moves the simulation bar to the right. `campus-details-tablet-expanded-fixed.png` supersedes that expanded screenshot. At 690 × 800 the card ends at x=329 and the simulation bar starts at x=488.375; pause and resume were both exercised successfully.

## Daylight and varied paving pass

The final renderer uses daylight in close views and the earlier dark background in overview/map mode. The reflection probe captures the daylight environment once; paving now contains sixteen varied slabs per texture tile. Both use locally generated textures. DPR is 1. Desktop is 1280 × 720; phone is a 390 × 844 desktop-browser viewport with a 390 × 584 drawing buffer.

| View | Samples | Average / minimum FPS | Calls / triangles | Evidence prefix |
| --- | --- | --- | --- | --- |
| overview, desktop | 30 | 30 / 28.8 | 385 / 883,109 | `daylight-final-overview-desktop` |
| campus, phone | 30 | 30 / 29.7 | 140 / 597,937 | `daylight-final-campus-phone` |
| follow, phone | 30 | 30 / 29.7 | 50 / 509,449 | `daylight-final-follow-phone` |
| bus, phone | 30 | 30 / 29.8 | 71 / 558,501 | `daylight-final-bus-phone` |

Matching JSON and inspected PNG files are under `.audit/evidence/`. Instantaneous geometry counts depend on camera and bus position. The 28.8 FPS minimum in the desktop overview is retained, not discarded; its thirty-sample average is 30 FPS. The earlier `daylight-quad-desktop` capture predates the map-background refinement and is historical close-view evidence.

Pausing the phone bus view produced 0 FPS and 5,623 total frames in both observations (`daylight-final-paused-phone.json`). Switching to the full route while paused updated the background and camera, then settled at 0 FPS and 5,661 frames. Simulation was resumed afterward.

These are steady-state observations, not startup or memory benchmarks. Estimated paving texture storage is 5.3 MiB with mipmaps and the source panorama is 0.67 MiB; renderer cubemaps, CPU canvas backing and other allocations are additional. No physical-phone performance claim is implied.

The final quad desktop check (`daylight-final-quad-desktop.json/png`) records thirty samples at 30.0 FPS average / 29.7 minimum, 141 calls and 640,804 triangles. The screenshot was inspected for slab variation and daylight composition. Browser error logs returned no entries, and the viewport override was reset. Background/fog changes occur at the start of the 1.2-second camera flight, so switching between overview and close modes has an immediate atmosphere change rather than a crossfade.

## Close ground material pass

The terrain now adds a generated grass/soil detail texture and restrained bump. Detail is visually weighted by color and distance; close views still execute those texture samples across their terrain fragments. A uniform branch skips both detail and bump sampling when camera-to-orbit-target distance reaches 500 m. It adds no scene geometry. The final treatment uses bump strength 0.008 and color modulation 0.55, reduced after the first rear-lane screenshot looked too grainy.

Phone viewport is 390 × 844 with a 390 × 584 drawing buffer, DPR 1.

| View | Samples | Average / minimum FPS | Calls / triangles | Evidence prefix |
| --- | --- | --- | --- | --- |
| bus, phone | 30 | 30 / 29.7 | 58 / 607,270 | `ground-detail-final-bus-phone` |
| overview, phone | 30 | 30 / 29.7 | 382 / 883,103 | `ground-detail-final-overview-phone` |

Matching JSON and PNG files are under `.audit/evidence/`. The final fixed-position 84% inbound screenshots are `ground-detail-final-rear-lane-phone.png` and `ground-detail-final-rear-lane-desktop.png`. The earlier `ground-detail-rear-lane-desktop.png` contains the stronger treatment and is historical only. Separate road and plaza surfaces retain their own materials. Blurry paved aerial regions remain visible.

These JSON observations report `worldFirstRenderMs: 3201` from the local hot-reload initialization. The metric runs from entry into `createWorld` through return from the first scheduled main-scene `renderer.render` call, including local asset loading, mesh construction, texture preparation, earlier foliage/reflection bake renders and initial shader work. It excludes earlier page/module startup and does not wait for GPU completion. This is one local-session observation, not a cold-cache, network or physical-device benchmark. The generated texture adds approximately 8 MiB GPU storage with mipmaps; source-image/driver allocations are additional.

The final desktop quad check (`ground-detail-final-quad-desktop.json/png`, 1280 × 720, DPR 1) records thirty samples at 30.0 FPS average / 29.7 minimum, 149 calls and 703,236 triangles. Its screenshot confirms grass detail beside the unchanged concrete surface. The browser error query returned no entries.

A subsequent browser page reload reached the first scheduled main-scene frame in 2,742 ms (`ground-detail-reload-desktop.json`), with Campus loaded successfully. Browser/HTTP caches were not cleared, so this is a local reload observation. The viewport override was reset afterward.

## Campus furniture and entrance camera pass

Eight benches, four bins and five bicycle stands join existing campus material batches, plus two new wood/recycling-bin material batches. The Conservatory camera is lower and closer. These are illustrative scene details; route geometry is unchanged. Desktop is 1280 × 720, phone is a 390 × 844 desktop-browser viewport with a 390 × 584 canvas, DPR 1.

| View | Samples | Average / minimum FPS | Calls / triangles | Evidence prefix |
| --- | --- | --- | --- | --- |
| conservatory, desktop | 30 | 29.9 / 28.8 | 108 / 600,148 | `furniture-final-conservatory-desktop` |
| quad, phone | 30 | 30 / 29.8 | 98 / 610,981 | `furniture-final-quad-phone` |

Matching PNG/JSON evidence is in `.audit/evidence/`. The 29.9 FPS average and 28.8 minimum on desktop are retained. The earlier `furniture-quad-desktop` capture precedes the final bike-stand color and camera changes and is historical. The final screenshots show furniture on the paving and the modeled door approach unobstructed, but do not establish surveyed placement or all-angle collision freedom.

The final phone Conservatory check (`furniture-final-conservatory-phone.json/png`) records thirty samples at 30.0 FPS average / 29.7 minimum, 81 calls and 573,700 triangles. The lower camera keeps the entrance, canopy and nearby furniture visible in portrait. Browser error logs returned no entries. The viewport override was reset and the preview remains on Conservatory. Physical-device performance and all-angle furniture inspection remain unverified.

## Conservatory corner and interaction correction

Replaced the incorrectly tall single glass facade with a lower two-face glazed lobby, a transparent canopy, raking columns, stone wings and an illustrative stair. Removed the repeated campus window grid in favor of sparse grouped openings. Transparent lobby/canopy surfaces do not cast opaque shadows and use alpha blending rather than transmission. The preset now frames the whole corner on a phone.

Current browser captures (moving simulation, 30 rolling samples, DPR 1):

| View | Viewport / canvas | Average / minimum FPS | Draw calls | Triangles |
| --- | --- | --- | --- | --- |
| Conservatory phone | 390×844 / 390×584 | 30.0 / 29.7 | 78 | 469,410 |
| Conservatory desktop | 1280×720 / 1280×720 | 30.0 / 29.7 | 117 | 558,986 |

Evidence: `.audit/evidence/conservatory-corner-final-{phone,desktop}.{png,json}`. The new views use a different camera and much fewer windows, so these are current costs rather than an isolated canopy benchmark. Phone results are a desktop browser at phone dimensions, not measurements on physical phone hardware.

Pan is the default mouse/one-finger action. The visible Pan/Orbit toggle changes left-drag and one-finger behavior; desktop right-drag stays rotation. Both touch modes retain two-finger dolly/pinch support through OrbitControls. Mouse pan and orbit were exercised at phone dimensions and screenshots saved as `controls-phone-{pan,orbit}.png`. Native touch and pinch were not physically tested. No browser error logs were recorded. Full build, route-profile validation, local-scene validation, road-contact check, TypeScript, and diff whitespace checks passed.

Sol review found no blocking defect and confirmed the metrics. The pale glass and dominant canopy grid remain stylized; the stair exists inside the lobby but is not clearly discernible in the final preset screenshots. Source and acceptance wording now distinguish modeled detail from visually verified detail.

## Clearer conservatory glazing

The next material pass reduces glass opacity/reflection, adds recessed interior walls and stair supports, and makes the canopy smaller/lower with thinner grid members. Two emissive ceiling strips are geometry only; there are no additional lights, transmission buffers, or new textures. Evidence is `conservatory-clear-glass-{native,phone}.{png,json}`.

| View | Viewport / canvas | DPR | Average / minimum FPS | Draw calls | Triangles |
| --- | --- | --- | --- | --- | --- |
| Native preview | 832×908 / 1164×1271 | 1.4 | 30.0 / 27.8 | 85 | 475,054 |
| Phone dimensions | 390×844 / 390×584 | 1 | 30.0 / 29.8 | 81 | 469,474 |

Both captures use 30 rolling samples with moving buses. Relative to the previous phone preset, the pass adds 3 draw calls and 64 triangles; texture count remains 29. The native result includes a 27.8 FPS dip, so it does not prove an uninterrupted 30 FPS floor. This session's first main-scene render was 5861 ms after initialization; that run began at native DPR 1.4 and is not directly comparable to the earlier DPR 1 run. No browser errors were recorded. Existing build/data/contact checks and diff whitespace checks pass. Physical-device performance remains unmeasured.

Paused verification: two settled observations retain totalFrames=3201 and FPS=0 (`conservatory-clear-glass-paused.json`), confirming the static interior does not force continuous redraw. The preview was resumed and the temporary phone viewport override reset afterward.

## POC release check

The phone campus/architecture/sports panel is now compact when collapsed; expanding restores the full fleet and trip slider. In those views, the canvas at 390×844 grows from 390×584 to 390×699 (19.7% more height), and the route inset is hidden. Navigation also fits a 320px screen. Expanded fleet and transition into Ride along were exercised. The Conservatory phone camera was widened to preserve framing.

Final compact conservatory: 30-sample average 30.0 FPS, minimum 29.7, 82 calls, 461,230 triangles, DPR 1 (`ship-campus-compact-phone.json`). Final production campus preset: 29.9 average, 28.0 minimum, 150 calls, 560,487 triangles, DPR 1 (`release-production-campus-phone.json`). This is close to the target, not an uninterrupted 30 FPS guarantee. Phone dimensions still run on desktop hardware.

The production preview under `/BusTrackr/` returned all 36 built files with HTTP 200 and content hashes matching the build outputs. The old Cesium runtime/development dependencies, static-copy plugin, token example/workflow variable, detail-mask generator and obsolete validation script were removed. Route and corridor artifacts were preserved. Sol's release review found no blocking missing asset, base-path inconsistency or phone UI regression. The user selected a shippable POC as the release threshold; known approximation and hardware limits are retained in README rather than represented as finished photogrammetry or real tracking.

## Structural roof fix

`check-building-surfaces.ts` initially failed on two independent defects: a caravan wall shell contained two duplicate roof-level triangles, and its pitched roof had 20 shared vertices with inconsistent UV coordinates. The corrected shared generator removes only the extrusion's upper cap, retains walls/undersides, and uses continuous roof UVs. Convex/concave fixtures now pass cap ownership, footprint coverage, UV agreement and underside checks; the check is part of every build. A browser fixture uses the actual roadside builder (`roof-regression-before.png`, `roof-regression-after.png`), and the full route was inspected from an overhead orbit (`roof-fix-montery-overhead.png`).

The same pass addresses six existing terrain/eave conflicts with documented inferred height adjustments, exposed as `terrainAdjustedIds`; `terrainIntrusionIds` is now empty for sampled corners. The source data is unchanged. Campus capture at 832×908, DPR1.4: 30-sample average30.0/minimum29.7FPS, 142draw calls, 509471triangles (`roof-fix-campus-performance.json`). Different camera state/culling prevents an isolated performance comparison. No new texture or rendering pass is added. All build/data/contact checks pass.
