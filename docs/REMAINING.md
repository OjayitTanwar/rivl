# What remains

Updated 14 October 2026. Source implementation, hosted deployment and device validation are separate milestones.

## First: make the online foundation reliable

- Apply all current database migrations to the hosted project and deploy account deletion, deletion retry, segment processing and optional route-intent functions.
- Operate bounded worker scheduling, backups, usage monitoring and moderation. Verify signup confirmation/recovery redirects, real email delivery, session expiry and account switching.
- Test with two real accounts: private data isolation, invitations/acceptance, clubs, comments, blocking/reporting, sync retries and deletion. Reachability checks do not prove these flows.
- Deploy and validate Creator Studio publication and community GPS contributions. Both have source code; hosted end-to-end operation is pending.

## Features still to build or expand

- Community track reconstruction: dedicated cycling/running track detection from corroborated traces plus map topology and moderated evidence. Current coarse observed-use cells do not establish a dedicated or safe track.
- Guided training: spoken sessions, adaptive multi-week coaching, richer strength/power targets and verified importable open-source course content. Creator-authored interval programs and attributed JSON sharing exist.
- Nutrition: camera barcode scanning, recipe URL imports, wider nutrient coverage and optional photo/voice intake. Current diary, search, typed barcode, recipes, goals, plans and groceries exist.
- Health: additional HRV/readiness trends, blood pressure/cycle/medication experiences and supported device alerts. Current steps, sleep, hydration, weight, stairs, active energy and recorded HR peaks have source support.
- Maps/safety: licensed offline maps, operated live safety sharing and delivery, richer verified terrain and community route data.
- Advanced competition: remaining leaderboard filters, Local Legend and integrity checks on real hosted workouts.

## Release work

- Physical GPS/locked-screen recovery, Watch, BLE sensors and Health imports; populated flows and keyboard/accessibility checks; Android builds and devices.
- Hosted quotas and load, backup restoration, moderation operations and third-party provider/licence checks.
- Store-ready signed distribution, TestFlight/App Store/Play setup and disclosures. GitHub source publication is not store distribution.

See [feature expansion](FEATURE-EXPANSION.md) and [developer reference](DEVELOPER-REFERENCE.md) for detailed implementation history. No whole-app completion or error-free claim is made.
