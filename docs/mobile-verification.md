# Native verification

Verified on October 26, 2026 with Expo SDK 57, React Native 0.86.3, and an iPhone 17 simulator running iOS 26.5.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run test:alerts` | 12 worker tests passed |
| `npm run build` | Web production build and scene geometry checks passed |
| `npm --prefix mobile test` | 12 mobile tests passed, including actual sample-worker HTTP contract |
| `npm --prefix mobile run typecheck` | Passed |
| `npm --prefix mobile run lint` | Passed |
| `npx expo-doctor` in `mobile/` | 21 of 21 checks passed |
| `npm --prefix mobile run export:native` | iOS and Android Hermes bundles exported |

The new CI workflow repeats worker tests, the web build, mobile tests, typecheck, lint, and both native exports. Exporting a bundle does not establish native runtime behavior.

## Actual native interface

The app ran inside Expo Go in the iOS simulator. The following interactions were exercised through the native interface:

- Both sample directions display an arrival range and dashed estimated route zone.
- No timetable, ambiguous runs, stale feed, unavailable feed, loading, and empty observations hide the position estimate.
- Scheduled mode labels the future checkpoint crossing as a schedule, not an observation.
- Connection settings connect to the real local sample worker over HTTP in development mode.
- A worker response labelled `sample` retains the yellow sample banner even when selected as an API connection.
- Stopping the worker and pressing Refresh removes the range and marker while retaining the last camera timestamp and saved-email count.
- Returning to built-in sample mode works without the worker.

[Arrival and observation screenshot](images/mobile-arrival.png) and [route screenshot](images/mobile-route.png) show the running native app. Expo Go's blue developer-tool button is part of the test host, not BusTrackr.

The local decision trail and raw outputs are in ignored `.audit/mobile-decisions.tsv`, `.audit/*-tests.txt`, `.audit/web-build.txt`, `.audit/mobile-typecheck.txt`, `.audit/mobile-lint.txt`, and `.audit/native/`. They contain sample data only.

## Review

Claude proposed the visual design from a generic product brief. Automatic approval review blocked sending repository contents to Claude; no repository files were supplied. Its design included assumptions unsupported by the API, so unconfirmed timetables and ambiguous runs suppress all estimates in the implemented app.

Independent Codex reviewers inspected the native app, worker, and web integration. Review fixes restrict development HTTP exceptions to actual local hosts, retain observations after failed manual refreshes, exclude ambiguous historical dates from estimator training, expire stale web estimates, and stop displaying delivery timestamps as camera times. The final reviewer returned PASS+NOTES after checking the fixes, captured results, and native failure screenshot. Cursor-specific cloud verifier and alternate model-family tools prescribed by Poteto Mode were unavailable; the review was local, not a cloud or cross-model source review.

## Limits

Android runtime, physical phones, standalone native binaries, signing, and store submission were not verified. Local iOS verification used Expo Go. VoiceOver reading order, large-text layouts, and background/resume behavior need further device testing; freshness and cancellation rules are covered by automated model and HTTP tests.

Live Gmail processing remains blocked on account-owner verification and credentials. The production timetable remains unconfirmed. No accurate operational ETA, GPS tracking, or confirmed departure is claimed.

The SDK 57 dependency audit reports eight transitive advisory entries. Five high entries are in the Expo CLI toolchain through `node-forge` and its Zod 3 dependency. Three moderate entries concern Expo Router's `query-string` decoder chain. The available decoder fix changes CommonJS to ESM, and the CLI's Zod fix requires a major version change. No incompatible forced overrides or SDK downgrade were applied. Recheck upstream SDK patches before public distribution. The application uses a current direct Zod version for its own API validation.

Fast mode could not be enabled or verified through the available app settings tools.
