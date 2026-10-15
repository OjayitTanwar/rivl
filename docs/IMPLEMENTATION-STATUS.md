# RIVL implementation and evidence

Current work (14 October): [FEATURE-EXPANSION.md](FEATURE-EXPANSION.md) tracks the active UI/fitness/health/nutrition goal and current checks. The older dated evidence below is historical: MapLibre/3D were removed, demo data is disabled, and later UI/features are not in the earlier phone build. Production community processing and hardware validation remain unfinished.

Latest expansion (10 October): see [STRAVA-EXPANSION.md](STRAVA-EXPANSION.md) for 125 tests, eight SQL suites, phone/watch target builds, simulator terrain playback and free route-request checks. The latest Release build was installed and launched on the connected iPhone 15 / iOS 26.0.1; its process remained running. Free provisioning expires 15 October 2026. Installation/startup does not establish sensor, watch or locked-screen navigation validation. The application remains native; only the terrain map component uses a locally bundled WebView/WebGL renderer. Older evidence below is historical.


Updated 10 October 2026. The deliverable is a native iPhone application, with an Android target using the same domain and UI code. There is no WebView application shell.

## Verified locally

- Strict TypeScript compilation.
- 91 automated tests across activity processing, privacy, recording recovery, sync, remote adapters, health calculations and bounded display data.
- Recording tests cover concurrent pause/GPS delivery, failed atomic writes, restart, missing GPS, stale fixes, sensor enrichment and saving.
- Sync tests cover network failure/retry, process restart, account isolation, stale revision acknowledgements, explicit retry, simulated activity isolation, server time cursors and 1,203 paginated records.
- A four-hour, one-second GPS fixture processes correctly. An 86,400-reading chart stays within 512 display points and preserves spikes. These are functional scalability checks, not device energy or frame-rate measurements.
- Expo native iOS project generation.
- CocoaPods installation: 126 pods, including SQLCipher, MapLibre, HealthKit and RivlPrivateFiles.
- Xcode 27 Debug and Release simulator builds succeeded. The Release test binary has development fixtures enabled; it is not a distribution build.
- Four migrations and the three existing SQL suites passed against disposable PostgreSQL 17/PostGIS 3.6.4 with minimal Supabase Auth/Storage schema fixtures. This does not validate Supabase HTTP services.
- Hermes iOS and Android bundle exports. This is JavaScript bytecode, not a signed iPhone binary.
- Expo Doctor: 20 of 20 checks passed.

## Recording and route-planning repair

See [RECORDING-AND-ROUTES.md](RECORDING-AND-ROUTES.md) for the latest implementation and native verification. The route planner, offline route outbox, virtualized feed, simplified dashboards and iOS scene lifecycle migration are implemented.

## Earlier continuation

Recording state transitions now share one queue with GPS ingestion. SQLite atomically commits samples, counters and session state. Failed source restarts return to paused state; same-athlete recordings recover when the app returns. Simulations remain on-device and do not award progression or challenge distance.

Cloud metadata edits retain previously uploaded raw tracks. Raw tracks download on demand for analysis on a second device. Sync uses stable timestamp/ID pagination and a server-generated cursor. Private photos upload through the owner-scoped Storage bucket. Cloud profiles/settings load at sign-in; privacy-zone changes republish existing shared routes.

The second migration preserves comments and reactions when updating a shared activity. It blocks direct writes to verification flags, tracks and privacy zones, and limits friendship acceptance to the status column. Public geometry removes endpoints and privacy zones, including edges crossing zones between sparse fixes.

Community feed, reactions, comments, saved routes, challenge membership, friend requests/acceptance, club membership and Realtime refresh have Supabase adapters. Local development fixtures remain explicitly labeled. Failed remote actions show errors; successful feed reads replace the account-scoped cache.

Today displays available health signals. HRV baselines weight each day equally, stale HRV does not drive today's explanation, and overlapping sleep sources are deduplicated. iOS Increase Contrast now uses the native iOS accessibility setting.

## Security continuation

See [PRODUCTION-SECURITY-GUIDE.md](PRODUCTION-SECURITY-GUIDE.md) for research, implementation steps, full new module code and submission gates. Added protected credential storage, SQLCipher opening and plaintext migration guards, native file/backup protection, configurable SPKI pin policy, request cancellation/timeouts, validation, server bounds, safe error surfaces and telemetry minimization. Native module discovery and podspec parsing pass. Production configuration preflight correctly rejects this unconfigured development workspace.

## Physical iPhone setup, 8 October 2026

A Debug arm64 build was compiled, provisioned with the signed-in Apple Personal Team, and installed on the connected iPhone 15 running iOS 26.0.1. Developer Mode is confirmed enabled. Signature verification passed and the profile includes this device, HealthKit and application-identifier. Remote push is omitted only from this Personal Team test build; normal entitlements remain unchanged. The profile expires on 15 October 2026 at 17:27 IST and needs renewal by rebuilding/installing.

The first Debug phone launch was refused pending on-device developer trust. At the user’s request, a signed standalone Release build subsequently replaced it. Its embedded JavaScript bundle is present, signature verification passed, installation succeeded, and iOS launched the app and evaluated the embedded bundle with both Metro servers stopped. The app no longer needs the development launcher or live-edit server. Visual confirmation is pending; physical GPS, cloud sync and full E2E validation remain outstanding. Generated native build folders are excluded from Metro’s watcher for future development sessions. The startup log contains duplicate RCTSwiftUI class warnings from the prebuilt React framework; these require investigation before production release. The receipt is saved in build/standalone-install-receipt.json.

## Not yet verified

Xcode 27 is installed. The standalone Release simulator app now launches on iPhone 18 Pro / iOS 27 and local signup succeeds. The iOS scene lifecycle migration resolved the earlier launch crash; encrypted storage initializes successfully. Maestro's iOS password-prompt accessibility issue was bypassed using its observed button position. The full signup, simulated recording, pause, termination/relaunch, resume, finish, save and activity-detail flow passed on 10 October after repairing separately keyed SQLCipher transactions and save-screen keyboard dismissal. Route and navigation validation is continuing. The simulator binary enables development fixtures and is not a distribution build.

No Supabase project has been supplied. The existing SQL suites passed on real local PostgreSQL/PostGIS with fixture schemas. All five SQL suites, including account_safety.sql, passed on a fresh disposable PostgreSQL 17/PostGIS cluster on 10 October. Cloud Auth, Storage, Edge Functions and Realtime remain unverified. Edge Functions passed Deno type checking. Deletion/report/block policies and worker code are implemented but not deployed; retries need an operated scheduler.

HealthKit authorization/read behavior, background GPS under lock, location-permission changes, Liquid Glass behavior, Dynamic Type layouts and physical-device energy usage require native validation. Dependency advisories remain a release gate. Available uuid and decode-uri-component patches were installed. npm audit still reports 28 affected dependency entries (23 high, 5 moderate), originating from braces, node-forge and sprintf-js advisories. The queried latest versions had no fixes. Do not force a major Expo/React Native downgrade to silence them; investigate runtime/build reachability and upstream patches.

## Remaining product work before production release

- Finish validation/deployment of the implemented in-app/server deletion, reporting and blocking. Configure deletion retries/monitoring and moderator operations. Build Play’s public web deletion entrypoint, prepublication content filtering and privacy/support/disclosure flows.
- Indexed local history paging, bounded image import/EXIF removal and full remote JSON decoders.
- Native SQLCipher migration, TLS pin coverage across transports, backup exclusion and key-loss device tests.

- Server-side segment-effort verification/processing; current cloud leaderboards read verified efforts but do not produce them automatically. Development leaderboards use labeled seed efforts.
- Real club league enrollment/scoring. The existing league screen demonstrates improvement ranking over available efforts.
- Ghost racing currently uses the target activity's average moving pace; route-position-matched friend and segment ghosts remain to be implemented.
- The personal map currently overlays historical routes; density rendering and offline tile downloads are not implemented.
- Native Trace completion/PR motion and image share-card export; route-derived artwork and text sharing exist.
- Full native accessibility/visual review and design-system documentation after simulator capture.
- End-to-end backend/device validation, dependency review, signing and store submission configuration.

RIVL is an implementation under active validation. These gaps prevent a production-complete claim.

See [FEATURE-COVERAGE.md](FEATURE-COVERAGE.md) for the ordered feature roadmap, implementation steps and acceptance criteria for broader Strava coverage and RIVL-specific improvements.

## Free path discovery — 10 October 2026

Per the user’s zero-budget constraint, retained MapLibre/OpenStreetMap and added bounded, on-demand walking/cycling overlays to the native and web route planner. No Google SDK, keys or billing added. TypeScript and 101 tests pass; a live query and native walking show/hide flow pass. See [FREE-MAPS.md](FREE-MAPS.md) for coverage, service limits and remaining checks. Public services are not an unlimited production backend.
