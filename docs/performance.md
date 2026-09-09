# Performance check — September 9, 2026

The table records the first performance pass, before the subsequent campus/route detail split. Measured in the Codex Chromium browser on the development computer, using the campus camera after tile loading settled. Phone-sized viewport measurements are not physical-phone benchmarks. Tile memory below is Cesium's reported tile memory, not total browser/GPU memory.

| Check | Before | After |
| --- | --- | --- |
| Desktop campus, 1101 × 908 CSS pixels, DPR 2 | ~27 FPS, ~374 MB tiles | 30 FPS target reached, ~309 MB tiles |
| Paused desktop | Continued drawing at ~27 FPS | 0 rendered FPS; render counter stayed at 556 and height-sample counter at 43 across consecutive observations |
| Desktop drawing buffer | 1651 × 1362 | 1376 × 1135 |
| Phone campus, 390 × 844 viewport | No comparable settled baseline recorded | 30 FPS target reached; ~162 MB tiles; 390 × 584 drawing buffer |

These samples are illustrative, not a statistically controlled speedup claim. Network conditions, cached tiles, camera location, and device hardware affect results.

## Repeat the check

1. Run `npm run dev`, open the campus view, and let scenery finish refining.
2. Inspect `.world`'s `data-diagnostics` attribute. It reports actual rendered FPS, total rendered frames, height samples, tile memory, pixel ratio, and tile error threshold.
3. Pause. Once tile requests finish and heights settle, confirm totalFrames and heightSamples stop increasing.
4. While paused, select another camera, zoom, and inspect a bus. Confirm those interactions draw the changed view. Resume and confirm buses move.
5. Repeat at 390 × 844, including a close-up. Restore the viewport afterwards.

The renderer targets 30 FPS; it does not promise a 30 FPS minimum. It uses on-demand rendering when paused, suspends the loop when the document is hidden, avoids sampling distant/stationary buses, uses FXAA without duplicate MSAA, and reserves shadows for close-up views. Phone views use lower pixel density and tile-detail budgets. Corridor polygons are generated at build time; the browser no longer imports Turf. The interface renders before the asynchronously loaded Cesium scene is ready.

Validation: production TypeScript/Vite build and `node scripts/verify-assets.mjs`, including exact agreement between generated and stored corridor polygons.

## Geographic detail priorities

The campus outline, a 70 m Fehren pickup area, and 30 m road buffers use the detailed tileset. The remaining corridor context uses a separate coarse tileset at screen-space error 24 (desktop) or 32 (phone), independent of close-up detail. A precomputed texture masks coarse interiors, while geometric clipping limits where detailed tiles refine. The background remains restricted to the original 95 m road corridor. A small boundary overlap avoids gaps between different mesh resolutions.

Verified the split in the running campus view: priority error threshold 6 and background 24, with 30 rendered FPS after loading. Phone close-up used priority 6 versus background 32; the bus, road surface, and shadow remained visible. The new full-campus priority area adds coverage, so these changes are not claimed as a further total-memory reduction. `node scripts/verify-detail-zones.mjs` checks campus/road/Fehren mask coverage and exclusion of unrelated exterior points. The production build and both data verifiers pass.
