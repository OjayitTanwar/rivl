# RIVL expansion — 10 October 2026

This records the 10 October native expansion. For later Google Maps, cloud, exploration and replay work, see `EXPLORATION-AND-SHARING.md`. It does not establish complete Strava parity or production readiness.

## Implemented

- **Segments:** queued, leased server processing; directional full-route matching; accuracy, gap, speed, pause and privacy checks; versioned provenance; client write restrictions; rankings by global, friends, age, weight, club and period. Existing unchecked efforts do not become official rankings. GPS checks cannot prove that a track is genuine; anti-spoofing, appeals and operational moderation remain open.
- **Analysis:** time-weighted power curves through two hours, zones, 25-watt distribution, current-weight watts/kg, earlier-activity comparisons (latest 50 eligible powered activities), arbitrary two-tap chart ranges linked to the map, durable recorded laps and lap inspection. Missing power is not estimated. Historical comparisons separate measured and simulated records.
- **3D:** locally bundled MapLibre WebGL renderer with terrain elevation from Mapterhorn, route gaps, moving marker and camera flyover. Activities, saved routes and segments link to it. This is a 45-second route preview; playback is not synchronized to original elapsed time. Terrain requires connectivity.
- **Maps:** actual personal activity density, coarse privacy-filtered community cells, three bounded suggested loops, encrypted downloaded road/path geometry and saved route instructions. Offline areas cover a requested 1.2 km radius, at most 500 ways / 20,000 vertices; dense regions can be partial. Five areas are retained. These are simple vector maps, without terrain, street labels or complete access information. They are not full offline tile packs. Public OSM tiles are not bulk downloaded.
- **Navigation:** existing foreground turn guidance and device speech can use cached instructions when starting near the saved route's beginning. Offline rerouting, locked-screen navigation and natural-voice/earphone behavior on a physical phone remain unverified. Path metadata can be incomplete; it cannot guarantee the presence or safety of a cycle lane or footway.
- **Devices:** Bluetooth heart-rate and cycling-power pairing, fresh owner-bound readings in recordings, disconnect cleanup; Apple Watch GPS/heart-rate workouts with pause/lap controls, durable transfers, owner checks and import acknowledgement; saved route previews on watch. Physical sensor/watch testing and Android checks remain pending. Direct Garmin workout delivery and Live Segments are not implemented.
- **Portability:** bounded GPX route import, route export and privacy-redacted own-activity export. FIT/TCX and direct provider integrations remain open.

## Optional TypeSafe route requests

`Describe an activity and distance` fills the sport and distance controls. Free local parsing is the default. TypeSafe is prepared behind both a client feature flag and a server spending switch; no live AI calls have been made.

Leave `EXPO_PUBLIC_ENABLE_ROUTE_INTENT=false` and omit `TYPESAFE_API_KEY` / `RIVL_TYPESAFE_SPENDING_ENABLED` for the zero-cost behavior. Enabling the service requires an authenticated backend, a server-only API key and `RIVL_TYPESAFE_SPENDING_ENABLED=true`. The server limits requests to eight per athlete per day and 100 globally, sends only the request text, and falls back after failure or timeout. Confidence 0.85 is an initial uncalibrated threshold, not established accuracy. Validate real examples and current pricing before enabling spending.

## Backend activation

A free hosted Supabase project was created on 12 October and the eight migrations were applied. The segment worker and recurring scheduler are still not deployed; official automatic rankings remain inactive. The steps below remain the activation checklist.

1. Apply every migration in filename order to the chosen Supabase project, including the three `20261010000*` migrations. Run the SQL suites against a disposable project before exposing real accounts.
2. Configure the app's existing Supabase URL and public client key; keep service-role and worker secrets exclusively on the server.
3. Deploy `process-segments`. It uses its own authorization check (JWT gateway verification is disabled in `supabase/config.toml`). Set `RIVL_SEGMENT_WORKER_SECRET` to an independently generated secret of at least 32 characters. POST to `/functions/v1/process-segments` with `Authorization: Bearer <worker secret>` from a trusted scheduler. Do not place this secret in the app or a checked-in scheduler file.
4. Each call handles one leased activity. Schedule bounded calls at a rate suitable for the queue and hosting allowance. Inspect `private.segment_jobs` with administrative access for failed jobs, expired leases and backlog; investigate failures before retrying them. Processing retries are bounded. Public eligible uploads, source/privacy edits and segment geometry changes queue work automatically.
5. Validate two-account privacy, block/moderation behavior, corrected/deleted activities, expired leases, concurrent processing, opt-in cohorts and current geometry revisions in the hosted environment. Community popularity also needs enough real opted-in public routes: cells require three distinct athletes.

TypeSafe activation is independent and unnecessary for segment processing. Never enable it merely to make route suggestions work; local sport/distance controls remain functional.

## Evidence and limits

- TypeScript, 125 tests across 23 files, development security preflight, Deno function checks, all eight migrations and eight SQL suites passed locally.
- Xcode Release simulator build includes the phone bridge and Apple Watch target. iPhone 18 Pro / iOS 27 walkthrough checks devices, unpaired watch state, downloaded paths, segment screen, activity entry, heatmap and suggestions. Downloading London yielded 485 road/path lines, explicitly partial coverage.
- 3D loading and Play → Pause state pass on the simulator after bundling the renderer directly (`.maestro/terrain.yaml`). Free text request “A 7 km walk around me” fills the distance control as 7.00 (`.maestro/route-request.yaml`). These flows assume the existing demo athlete is open; the terrain fixture remains labeled simulated. The finish reviewer scored six listed usability fixes and the picker-icon correction resolved, disposition ship, within the captured iPhone simulator scope. DESIGN.md and .impeccable/design.json record the shipped incumbent design. Screenshots: `artifacts/native/`. Brand concept and exact embedded generation prompt: `artifacts/brand/`; this is a concept board, not a newly adopted app logo.
- Latest Release build was signed, installed and launched on the connected iPhone 15 / iOS 26.0.1 after the user confirmed developer trust. The RIVL process remained running. This is installation/startup evidence only; watch/Bluetooth, Android, hosted backend, locked-screen battery, VoiceOver/TalkBack and store release validation remain unverified. Free development provisioning expires 15 October 2026; rebuild/reinstall is required thereafter. Remote push is omitted because the personal Apple team does not support it; local reminders remain implemented. Watch account deletion removes phone-owned inbox files; previously saved watch files still require watch-side removal.
- Public mapping services have coverage and capacity limits. Complete walking/cycling paths in every city are not guaranteed. Dependency audit still has existing/upstream advisories; development preflight is not production security approval.

## Next substantive work

Deploy and operate the segment worker; test actual sensors and paired watch transfer; finish locked-screen navigation and offline rerouting; license an appropriate offline tile source; add timestamp-based replay, richer segment comparisons, anti-abuse review/appeals, and provider-approved Garmin integrations. Keep deployment and physical-device evidence separate from local simulation.
