# Valley Shuttle

Phone-first shuttle-tracking proof of concept for Fehren ↔ Valley Christian’s Skyway campus in San Jose.

## Run

```sh
npm install
cp .env.example .env.local
# Set VITE_CESIUM_ION_TOKEN in .env.local.
npm run dev
```

Open http://localhost:5173. Vite also prints a Network URL for a phone on the same Wi-Fi. The server binds to all interfaces for that purpose.

The token must have `assets:read` access to Google Photorealistic 3D Tiles (Cesium asset 2275207). Use a dedicated client-side token restricted to this asset and the local preview origins. Never use a token with account-management/write scopes. `.env.local` is ignored by Git. Client tokens are visible to browsers by design.

As checked September 9, 2026, Cesium’s free Community plan includes 1,000 Google 3D root-tile requests monthly for individual projects/evaluation. This is not unlimited production hosting. See [current plan details](https://cesium.com/platform/cesium-ion/pricing/). The app never purchases additional quota or upgrades a plan.

```sh
npm run build
npm run preview
node scripts/verify-assets.mjs
```

## The new scene

- Actual Google Photorealistic 3D Tiles streamed through Cesium ion, including captured roads, buildings, vegetation, and terrain.
- Detailed scenery is limited to the campus boundary, Fehren pickup area, and a 30 m buffer along each road. A separate coarse layer supplies context out to 95 m from the routes. An offline priority mask excludes that coarse layer from detailed interiors; its edge overlap prevents cracks. Other scenery stays clipped away.
- Campus, Fehren, full-route, overhead, following, and close-up views.
- Physically scaled custom bus model with rounded body panels, tires and wheel hardware, mirrors, grille, entry door, roof hatches, lights, stop paddle, and mesh lettering. Body length about 10.4 m; total width including mirrors about 3.8 m.
- Three simulated buses, eight-minute trip cycles, pause, speed control, and fleet selection.
- Visible Google/data-provider attribution supplied by Cesium. OSM attribution and route caveats in the About dialog.

Scenery requires internet and account access. There is deliberately no switch back to stylized untextured extrusions when photogrammetry fails; an explicit connection/error state is shown.

## What remains approximate

The rear Diamond Heights connector follows OSM campus service-road geometry, but school access and service still need transportation-staff confirmation. Named-road paths are illustrative and do not validate turn restrictions or current service schedules. Buses restart their assigned path at the end of an eight-minute demo trip. Positions and ETAs are not live GPS or traffic estimates.

Bus height uses sampled visible photogrammetry surfaces, with USGS DEM data and an approximate local geoid offset while tiles are loading. This is not surveyed lane-level vehicle localization. Captured imagery may be older than current buildings/road conditions.

This is a React/TypeScript web app, not a native Expo binary. Physical iOS/Android performance still needs testing. The renderer targets 30 FPS while buses move. Paused scenes render on demand, and hidden tabs stop the render loop and freeze the demo clock. Phone views cap resolution at 1 device pixel per CSS pixel, with 160 MB for priority tiles and 32 MB for coarse context; desktop views use 1.25 pixels, 224 MB for priority tiles, and 48 MB for context. Each view additionally allows 32 MB priority and 16 MB context overflow. Context uses a 24-pixel screen-space-error threshold (32 on phones), compared with 6 (8 on phones) for priority scenery; bus close-ups use 4 (6 on phones). These are Cesium cache budgets, not limits on total browser memory. Close-ups retain higher detail and bus shadows. Road-height sampling skips distant buses and reuses samples until the bus moves or tiles refine. Physical-device frame rates still vary.

## Development

- `src/world.ts`: Cesium scene, corridor clipping, road-surface sampling, simulated vehicles and cameras.
- `src/main.tsx`, `src/style.css`: phone-first controls and scene UI.
- `scripts/build-corridor.mjs`: precompute route clipping polygons, priority zones, and the compact background mask; runs before production builds so Turf does not ship to the browser. Run `npm run build:corridor` after changing route data during development.
- `scripts/build-bus.ts`: procedural bus geometry and self-contained GLB writer. Run with `npx tsx scripts/build-bus.ts`.
- `bus-preview.html`: isolated model inspection during development.
- `scripts/build-routes.py`: regenerate routes from the bundled OSM source.
- `scripts/verify-assets.mjs`: check generated GLB structure, physical dimensions, route endpoints, clipping buffers, and elevation data.
- `window.__valleyDiagnostics()`: read-only runtime checks for loaded state, tile cache, clipping count, bus positions and heights, and frame rate. It does not expose the token.

## Data and licenses

- [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles), accessed through Cesium ion. Runtime streaming only; tiles are not downloaded for redistribution. Google/Cesium attribution is retained.
- [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, ODbL. Route source extract retrieved September 9, 2026 from `https://www.openstreetmap.org/api/0.6/map?bbox=-121.844,37.271,-121.823,37.285`.
- [USGS 3DEP](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services), public-domain elevation data sampled via the 3DEPElevation ImageServer. The exported grid’s actual georeferencing is retained.
- [VCS shuttle map](https://resources.finalsite.net/images/v1700598195/vcsanjose/dl7ylcazkn69aup72dro/VCS_Shuttle_Map.pdf), November 21, 2023 revision, used to identify Fehren. Its historical schedule is not presented as current service.
- The generated bus is original geometry. Its mesh lettering uses the Three.js Helvetiker example font, originally Helvetiker by the Magenta Ltd typeface project; see `scripts/helvetiker.json` for embedded attribution/license details.

The early Esri aerial-image export is retained as reference material and is not displayed by the photogrammetry renderer.
