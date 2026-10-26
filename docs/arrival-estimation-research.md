# Shuttle arrival estimation research and design decisions

Updated October 16, 2026. This design turns camera email observations into estimates for the Fehren–Skyway shuttle. The first model uses a confirmed timetable and a rolling median of observed checkpoint delays. XGBoost is a candidate replacement once labelled travel times exist, not a requirement for launch.

## What the camera establishes

The supplied alert shows a sender of `Avigilonalerts@vcs.net` and body text in this form:

```text
[2026-Oct-16 02:06:43 PM (PDT)] BEI Bus has arrived.
```

The body timestamp is the observation time. The email Date header and IMAP internal delivery time describe different events and are retained separately. A body timestamp is sender-reported evidence, not proof of a correctly synchronized camera clock. The meaning and geographic placement of BEI, whether the zone sees both travel directions, whether the camera distinguishes buses from other vehicles, and whether several buses serve the route remain to be confirmed.

A single checkpoint history can train expected crossing time, lateness and headway. It cannot independently label onward travel time or exact positions. A second checkpoint, driver arrival/departure records, or a temporary GPS collection period can supply those labels. A return sighting identifies a cycle duration only when bus identity and run pairing are established; loading and waiting remain mixed into that duration.

Published results must be interpreted with that difference in mind. [BusTime](https://arxiv.org/html/2003.10373v1) evaluated 4,311 processed bus trips from approximately 30-second GPS records, not anonymous email sightings. Its comparison illustrates accuracy/computation tradeoffs and chronological evaluation; its reported errors are not an accuracy forecast for this app. The newer [hybrid Markov bus travel-time paper](https://arxiv.org/abs/2503.05907) supports considering probabilistic travel times, but does not establish the best model for this route.

## First version implemented

The source of truth is camera event history, not an animated bus. Each distinct email retains a hashed message identity, checkpoint, camera event time, delivery time, email header time and timestamp provenance. Raw email bodies, attachments, addresses and mailbox credentials are not returned by the public status API. Reprocessing the same message does not create another event. Distinct notifications within a configurable 30-second window at the same checkpoint are preserved with `duplicateOf`, then excluded from estimator inputs. This is a provisional grouping assumption: two buses within the window may be grouped. Keep the raw event records so grouping can be revised when real camera identifiers become available.

Each schedule entry defines run ID, weekdays, local checkpoint crossing time, direction, total journey duration and checkpoint progress along the route. Production has no invented timetable: `server/schedule.json` starts unconfirmed and empty. The example file is illustrative. Enabling it requires confirming the route, checkpoint, direction, timing and duration. Explicit excluded service dates cover known school closures; calendar synchronization is not implemented. Runs are associated by the local date of their checkpoint crossing; overnight run matching across service dates is not implemented.

At inference time:

1. Convert times using America/Los_Angeles, including daylight saving changes. Reject ambiguous or nonexistent scheduled times at DST transitions.
2. Match nonduplicate camera events to scheduled checkpoint crossings within 15 minutes. More than one possible run stays ambiguous. Multiple distinct arrivals matching the same run/date also stay ambiguous.
3. For a run, take up to 20 previous service dates with a unique matched observation. The median difference between observed and planned crossing time is its learned delay. No observations means zero correction. We pool weekdays within that run until evidence justifies splitting the data further.
4. Shift today's scheduled crossing by that median. A unique camera observation for today's run replaces the scheduled crossing as the anchor.
5. Infer journey start and finish from checkpoint progress and the configured duration. Interpolate distance progress uniformly between them. No trip or return journey is invented after that interval ends.
6. Hide the position if active runs overlap, observations are ambiguous, the timetable is unconfirmed, or the feed is offline/stale. A missed detection does not itself establish a cancellation or an arrival.

Only observations both occurring and delivered by the prediction time are available to the model. This prevents retrospective evaluation from using emails that arrived later. The map uses an amber estimated marker and route band, visually separate from the three simulated buses. The UI labels the anchor as camera or timetable and marks sample data explicitly.

The displayed range is a heuristic, not a confidence claim: two minutes plus 20% of elapsed time from a camera anchor, or four minutes without a camera anchor. The heuristic is an engineering placeholder, not a measured error distribution. Uniform distance progress is also an assumption; the model has no measured segment speeds, dwell times or current traffic in this version. Observations at a terminal do not prove departure afterward. If a camera only observes arrival before a variable layover, do not configure it as an onward-departure anchor without modelling or measuring that layover.

## Why this architecture

| Decision | Reason | Alternative and upgrade trigger |
| --- | --- | --- |
| Retain events separately from estimates | Predictions must not become training labels; repeated email deliveries must not inflate data | Add confirmed departure/arrival labels and model evaluation records as they become available |
| Start with a rolling median | Inspectable, robust to isolated late runs, useful with little data | Compare EWMA, regression and boosted trees with forward tests |
| Learn checkpoint lateness first | It is directly observable with the current sensor | Learn trip/segment duration only after paired ground truth exists |
| Keep the timetable operator supplied | One email does not establish direction or the operating schedule | Infer service patterns as suggestions for an operator to verify |
| Suppress ambiguous positions | Anonymous sightings cannot reliably identify multiple shuttles | Use camera direction, vehicle ID, a second sensor or driver/GPS data |
| Keep rendering independent of the model | A future model should change predictions without changing map geometry | Retain the estimate API contract when replacing the predictor |
| Use one Node worker and local atomic state | Small, inspectable deployment that survives ordinary restarts | Move to transactional SQLite/Postgres when history size, querying or multiple workers warrant it |

The JSON history is intended for the initial single-worker pilot. Every successful write replaces the complete state file atomically. It is not an append-only audit store, does not enforce multi-process locking, and has linear history scans. Keep one worker per file, persistent disk, restrictive permissions and backups. A database migration should preserve original event identities and timestamps.

## Traffic data

Traffic should estimate travel on the confirmed bus corridor, not on an API-selected shortcut. Driving-time estimates omit bus loading, school access and layovers. A useful later baseline is traffic travel time plus the median measured bus-specific correction. Historical training features must be snapshots available at prediction time, never later revised traffic or the eventual arrival.

[Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/) provides a driving-traffic profile, typical duration and segment duration/congestion annotations. It is a technical candidate, not a settled procurement choice: confirm coverage on this corridor, display requirements, retention rights and explicit model-training rights before building a feature archive. Cache or persist provider responses only as permitted by the applicable agreement. Share server-side estimates between viewers rather than making one traffic request per viewer.

[Google Routes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes) also exposes traffic-aware travel times, but [Google Maps standard terms section 3.2.3(c)](https://cloud.google.com/maps-platform/terms) prohibit using Maps content to train, test, validate or fine-tune ML/AI models. Its [Routes display policies](https://developers.google.com/maps/documentation/routes/policies) also matter for a custom map. Do not assume Google traffic can be archived as training features or displayed on this Three.js map under standard terms. Provider selection remains open.

## Model upgrade path

| Candidate | Intended use |
| --- | --- |
| Rolling median or EWMA | Low-data calendar/lateness baseline; compare smoothness and responsiveness |
| Linear model or generalized additive model | Interpretable calendar/traffic effects and a useful benchmark |
| XGBoost | First nonlinear candidate for trip-duration or traffic-baseline residual prediction |
| CatBoost | Challenger when run ID, direction and other categorical inputs are important |
| LSTM or Transformer | Later experiment only if substantial sequential trajectory data justifies the added complexity |

For XGBoost, train one row per measured journey or labelled segment. Suggested features: service direction, run ID, local departure time, weekday, school-calendar category, checkpoint delay, recent completed journeys, and licensed traffic snapshots. Predict actual duration or the error of the baseline. Avoid exact week number as an initial feature; school calendar and recent history have clearer meaning, and a small dataset cannot support fine seasonal categories.

[XGBoost quantile regression](https://xgboost.readthedocs.io/en/release_3.1.0/python/examples/quantile_regression.html) supports 10th, 50th and 90th percentile outputs. These can form an estimated arrival window; quantile crossing and actual coverage need testing. [CatBoost](https://catboost.ai/docs/en/features/categorical-features) supports categorical inputs directly. Neither library establishes a winner for this dataset.

[Conformalized quantile regression](https://arxiv.org/abs/1905.03222) is a possible calibration layer. Its usual guarantees depend on assumptions such as exchangeability; changing school schedules, incidents and serially correlated trips require empirical coverage monitoring rather than unconditional guarantees. A complex state-space or particle-filter layer may later track competing direction/location hypotheses, but cannot create missing observations.

## Evidence required before upgrading

Use earlier weeks to train and later weeks to validate/test. Keep all records from a journey and service day together. Historical rolling features must use only data available then, and model selection must not repeatedly tune against the final test period. [Time-series cross-validation documentation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html) explains the future-data leakage problem; service-day splits are more suitable here than blindly splitting irregular email rows.

Compare schedule-only, median-delay and candidate ML estimates on identical held-out journeys. Report MAE in seconds, median absolute error, 90th-percentile absolute error, optimistic errors that could make riders miss a bus, interval coverage and width, and the fraction of journeys where the system abstains. Break results down by direction and prediction horizon. Avoid relying on percentage error when remaining time approaches zero.

No fixed sample count guarantees readiness. Promote a model only when it repeatedly improves forward-held-out performance and retains acceptable range coverage. Retraining weekly after labelled data arrives is a starting operational choice, not a research-backed optimum. Keep the baseline available for missing features, traffic outages or model regressions. A second observation point may improve this app more than changing ML libraries.

## Gmail ingestion decisions

The worker polls Gmail IMAP over TLS, opens the mailbox read-only, backfills seven days of matching mail on its first connection, and persists a UID cursor scoped to mailbox identity and UID validity. Historical events retain historical times; importing them does not make them current arrivals. `IMAP_BACKFILL_DAYS=0` preserves the original future-mail-only behavior.

A browser account password is not the Gmail IMAP credential. [Google's app-password guidance](https://support.google.com/accounts/answer/185833?hl=en) requires 2-Step Verification and describes availability restrictions. [Gmail XOAUTH2 documentation](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol) specifies token authentication and the full-mail IMAP OAuth scope. The worker supports an app password, a supplied access token, or automatic access-token refresh using preauthorized Google OAuth client/refresh credentials. OAuth consent setup and token issuance are not implemented. A Gmail API integration with a narrower read scope is a future alternative.

Sender/body matching is an allowlist, not cryptographic sender verification. Confirm provider spam/authentication policy before treating alerts as authoritative. Live mailbox processing remains unverified until Google verification and an app credential or OAuth grant are completed. Production deployment also needs an always-on host; GitHub Pages can serve the UI only.
