# Camera alert setup

The camera sends email to an existing Gmail mailbox. No Resend account or domain is needed. Node 22+ runs a separate read-only IMAP worker and status API; GitHub Pages serves only the frontend.

## Local sample

```sh
npm install
npm run alerts:sample
# In another terminal
npm run dev -- --port 4173 --strictPort
```

Open http://localhost:4173. Camera estimates is the default mode. The sample parses an Avigilon-format fixture with a recent synthetic event time, stores it in `.data/sample-alerts.json`, and uses an explicitly illustrative schedule. The amber map marker and route band show estimated progress; Scene demo switches back to the simulated fleet. A sample event is created only for an empty sample state. After its journey ends the marker disappears; use a new `ALERT_STATE_FILE` for a fresh demo.

The dev server proxies `/api` to port 8787. Production requires `VITE_ALERT_API_URL` pointing to the worker's HTTPS `/api/shuttle` endpoint at frontend build time. `.env.example` documents this public setting. Without it, production shows a configuration notice and hides estimates.

## Connect Gmail

Copy `.env.server.example` to `.env.server` and fill `IMAP_USER`. Use one authentication option:

- A Google **app password** in `IMAP_PASSWORD`, not the normal Google account password.
- A short-lived OAuth access token in `IMAP_ACCESS_TOKEN`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`; the worker exchanges the refresh token for an access token on each polling cycle. Authorize the appropriate Gmail IMAP scope first; OAuth consent setup is outside this scaffold.

Leave sender `Avigilonalerts@vcs.net` and body marker `BEI Bus has arrived.` unless real alerts differ. The screenshot did not establish the email subject, so `CAMERA_SUBJECT` is optional. Both plain-text and HTML-only emails are parsed. The bracketed camera date must be valid Pacific time with the correct PST/PDT offset; missing, malformed or more-than-five-minute future camera times are rejected. Camera/body, email-header and mailbox-delivery timestamps stay separate.

```sh
npm run alerts:check
npm run alerts
```

The check command scans once and exits, returning failure if connection/processing fails. On first connection (or UID validity reset), seven days of sender-matching mail are backfilled. Set `IMAP_BACKFILL_DAYS=0` before the first run for future-only ingestion. Subsequent checks fetch newer UIDs. Opening is read-only: the worker never marks mail read, moves it or deletes it. Large messages over 2 MB are skipped. Errors retry after 30 seconds by default. Only use one worker per state file.

Credentials are ignored by Git. Never copy them into `VITE_*`, screenshots, documentation or commit history. The local `.env.server` is intentionally separate from the frontend's environment.

## Configure a real timetable

`server/schedule.json` deliberately starts with `confirmed:false` and no runs. Copy the structure of `server/schedule.example.json`, replace every illustrative value with confirmed service details, then set `confirmed:true`. Restart the worker after changes. Required values per run:

- A unique stable run ID and operating weekdays (0 Sunday through 6 Saturday).
- Scheduled checkpoint crossing time in America/Los_Angeles, as `HH:mm`.
- Checkpoint name exactly matching the camera configuration.
- `direction`: inbound means Fehren → campus; outbound means campus → Fehren.
- `durationSeconds`: assumed complete journey duration, not a value learned from one checkpoint.
- `checkpointProgress`: fraction of distance along that direction's route, from 0 to 1.

Use `excludedDates` for known school holidays and `matchWindowSeconds` to tune association (default 900). Runs are dated by their checkpoint crossing date; overnight service is not supported. A camera arrival before a variable stop/layover cannot establish subsequent departure; leave estimates disabled until the intended anchor is confirmed.

## API and history

`GET /api/shuttle` and the compatible `/api/detections/latest` return worker `status`, `lastCheckedAt`, `latest`, `eventCount`, and `prediction`. A prediction includes its model/schedule versions and generation time; active estimates include anchor type, range, estimated arrival time and a marker with direction, progress and lower/upper progress bounds. A missing marker means no usable position estimate. Worker states are connecting, connected, disconnected and sample. Prediction states include unconfigured, scheduled, estimated, ambiguous, unknown and offline. Ranges are labelled heuristic, not calibrated probabilities.

History and UID cursor live together in `.data/alerts.json` and survive restart. Every distinct matching email is retained, including delayed/out-of-order arrivals. Message-ID retries are deduplicated; nearby separate emails have `duplicateOf` set, using a provisional 30-second grouping window. This can merge two nearby buses; raw history remains available to revise grouping. No email body/attachment is stored in history. No public history endpoint is exposed.

Export local event history as JSON lines:

```sh
npm run --silent alerts:export > .data/camera-events.jsonl
```

Set `ALERT_STATE_FILE` explicitly to export another state file. Legacy latest-only state is migrated into history on load; records without a camera event time are preserved but excluded from estimation.

## Verify and host

`npm run test:alerts` covers timestamp parsing, HTML email, filtering, persistent history, duplicates, schedule estimation, ambiguity, DST, delayed delivery, mocked IMAP scanning and the real sample HTTP server. `npm run build` checks the frontend and scene assets. Live IMAP requires separate credential verification.

Deploy the worker on an always-on host with persistent storage and backups. Its default bind is loopback; place a TLS reverse proxy in front. Configure an exact `ALERT_ALLOWED_ORIGIN` for a separately hosted frontend. CORS is not authentication: the status API is public, so add deployment access controls if operational status should be private. API responses contain no-store headers. Feed failure hides estimated positions while retaining the timestamped last observation. The JSON store requires a single writer; move to a transactional database when scale or multiple workers require it.

See [arrival estimation research and design decisions](arrival-estimation-research.md) for the evidence, assumptions, ML upgrade path and traffic-provider restrictions.
