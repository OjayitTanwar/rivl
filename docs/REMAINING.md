# What remains

Updated 16 October 2026. Source implementation, hosted deployment and device validation are separate milestones.

## First: Community GPS tracks (latest user priority)

Build reliable path-level evidence from contributed running, cycling, walking and hiking journeys. The new source slice adds private bounded reconstruction, versioned OSM section support, service-only leased jobs, revocation-aware public reads and client decoding. The first mapped-path slice is deployed and hosted SQL checks passed; unmapped trail reconstruction and field validation remain unfinished. See COMMUNITY-TRACK-MAPPING-PLAN.md. Existing coarse observed-use cells do not identify a particular path.

## Online foundation

- Done on the dedicated hosted project: 14 migrations, four functions, private queue-only worker scheduling every two minutes, and protected Vault credentials. Both app env files now target this project following explicit user approval. Installed phone releases still need rebuilding to adopt it.
- Passed live: two actual password logins/token refreshes; private read/update and forged-owner denial; friendship request/immutable endpoints/accept/remove; logout. Both temporary accounts were deleted and deletion verified. Email confirmation delivery/recovery mail, signup experience and full application account-switching remain separate gates.
- Still needed: backups/restore, capacity monitoring, moderation operations, richer clubs/comments/blocking/reporting and sync retry device flows. Apple/Google OAuth are currently disabled on the hosted project.
- Creator Studio and GPS contribution RPCs are deployed with their schemas; full publication/contribution flows still need application-level validation.

## Features still to build or expand

- Community track reconstruction: dedicated cycling/running track detection from corroborated traces plus map topology and moderated evidence. Current coarse observed-use cells do not establish a dedicated or safe track. New OSM candidate comparison distinguishes mapped cycleways/running/shared paths and road junctions; it is not physical track reconstruction.
- Guided training: richer strength/power targets, validated adaptive coaching and importable licensed course content remain. Opt-in foreground spoken cues and explicit progressive multiweek creator drafts are now implemented; device audio remains unverified.
- Nutrition: camera barcode scanning, wider nutrient coverage and optional photo/voice intake. Current diary, search, typed barcode, recipes, goals, plans and groceries exist. Recipe URL import now previews structured ingredients and requires matching logged foods plus confirmed grams. Live website/native transport checks remain.
- Health: additional HRV/readiness trends, blood pressure/cycle/medication experiences and supported device alerts. Current steps, sleep, hydration, weight, stairs, active energy and recorded HR peaks have source support.
- Shared routes: a browsable public route publishing/saving library is still missing; personal route planning, saving, navigation and GPX exchange already exist.
- Maps/safety: licensed offline maps, operated live safety sharing and delivery, richer verified terrain and community route data.
- Advanced competition: remaining leaderboard filters, Local Legend and integrity checks on real hosted workouts.

## Release work

- Physical GPS/locked-screen recovery, Watch, BLE sensors and Health imports; populated flows and keyboard/accessibility checks; Android builds and devices.
- Hosted quotas and load, backup restoration, moderation operations and third-party provider/licence checks.
- Store-ready signed distribution, TestFlight/App Store/Play setup and disclosures. GitHub source publication is not store distribution.

See [feature expansion](FEATURE-EXPANSION.md) and [developer reference](DEVELOPER-REFERENCE.md) for detailed implementation history. No whole-app completion or error-free claim is made.
