# Creator training — 14 October 2026

Training is a complete root-sibling workspace with Plans, Session, Creators and History tabs. It replaces the main global bar while open; the labeled RIVL header action returns to Home. Authentication, owner storage and the existing recording engine remain shared. Opening a workspace, previewing/importing a program or saving a draft starts no recording or training session.

## Programs and local storage

Creators supports original user-authored multi-week programs with creator name, title, description, sport, level and explicit CC BY 4.0 or CC0 1.0 license. A program has up to 24 weeks and 100 scheduled sessions; an owner can save up to 50 local programs. Each session supplies week/day, title, notes and the existing warmup/work/recovery/repeats/cooldown interval structure. Explicit Start launches the selected session through the existing guided timer. Programs are not adaptive coaching or licensed videos.

`CreatorTrainingRepository` stores owner-scoped drafts, serializes per-owner changes, checks session/cleanup state, rejects stale expected records and requires exactly one revision increment. Account cleanup purges the owner’s programs. Active timers retain their own session copy, independent of later program edits/deletion.

## JSON sharing and attribution

RIVL program JSON uses schema `rivl-training-program`, version 1, with a 200,000-byte import/export bound. Preview shows program sessions and licensing before explicitly saving a copy. Exports remove local program/account identifiers and replace session identifiers with public slots. Imported copies retain creator/title/revision/license and prior attribution; CC BY origin licensing cannot be silently removed by local edits. Import does not start a session. The importer accepts RIVL JSON, not arbitrary repository formats, videos or ZWO workouts.

## Public library boundary

The source adapter provides bounded browse (up to 20 programs), original-only publish and unpublish RPCs with a 15-second cancellation/deadline. Publication requires a valid cloud identity, at least one session and an explicit confirmation that public content is original or authorized under the chosen license. Imported copies cannot be published as the athlete’s original work. Unpublish removes a listing; copies already shared remain usable under their license. Local delete does not imply unpublish. Local drafts remain unchanged on connection failure.

The creator-training migration and policies exist in source; hosted deployment and live multi-account operation are not established. Published-library loading, error/retry and confirmed-empty states must remain distinct. The requested loading-state correction is implemented: compact Library/My programs segmented choices separate loading, error/retry and confirmed-empty states. The settled Studio entry and blank-draft round trip passed native capture checks; final reviewer scoring remains pending.

## Open resources

The UI opens the original projects below. These are external links, not bundled training templates or converted programs:

- [OpenHIIT](https://github.com/a-mabe/OpenHIIT): MIT interval-tool project reference.
- [wger](https://github.com/wger-project/wger): exercise/routine reference; exercise content licensing must be checked per entry rather than assuming one repository license covers all content.
- [Zwift workouts](https://github.com/robiningelbrecht/zwift-workouts): MIT project reference; RIVL does not convert ZWO or preserve cycling power targets through this importer.

## Verification and limits

Final whole-project TypeScript, 407 tests across 62 suites and development security preflight passed; all 12 migrations and 12 SQL suites passed locally. Hosted deployment is not established.

All 12 workspace pages were reached with separate contextual bars in `.impeccable/review/workspace-apps-oct14/`. Final corrected settled Sleep and Studio captures passed. Studio uses compact Library/My programs segmented choices with distinct loading, retry/error and confirmed-empty states. An unsaved blank Studio form survived Creators → History → Creators, and the RIVL exit passed. Three enlarged frames—Health Overview, Nutrition Insights Goals and Studio form—passed, then normal text was restored. No populated-flow, keyboard-avoidance, hardware, Android or full HIG claim follows from these entry/form captures. Final reviewer scoring remains pending.

No populated native creator flow, hardware prompts, Android operation, hosted library, full HIG certification or all-features-complete claim is made. The user explicitly authorized physical installation, superseding the earlier restriction. The latest Release build was installed in place on the connected iPhone 15 (`00008120-000E05E00C81A01E`), bundle `app.rivl.training`, and launched successfully as process 1237; a subsequent process check confirmed it remained running. The current workspace apps and Creator Studio are in this installed build. Its JavaScript bundle is embedded and requires no Metro server. Free provisioning expires 15 October 2026 at 17:27:25 IST (11:57:25 UTC). Installation and launch do not validate physical sensors, Watch, HealthKit imports, locked-screen operation or hosted services. No billing or hosted publication occurred. Keep logo01, Record-led tokens, actual data and explicit provenance.
