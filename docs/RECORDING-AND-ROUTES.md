# Recording and route planning repair — 9 October 2026

## Implementation

The recorder requests foreground/precise location, writes the active workout before attaching the native location service, and exposes permission/start progress immediately. The installed Expo 55 native implementation supports user-initiated background recording with foreground permission. Failed or timed-out attachment pauses the durable workout. An unresolved native start is never overlapped by another start; the screen explains when restarting RIVL is necessary. Pause/resume clears stale speed and error state. Controls remain separate from scrolling workout content.

The route planner supports run, ride, walk and hike; native address search or coordinates; current location; map stops; undo/clear; path routing; and private local drafts. Find paths is an explicit request to separate walking/cycling routing services. A direct line remains clearly labeled as unverified if paths are unavailable. Save, edit, delete and use-route flows are implemented. The public provider is suitable for low-volume development; configure managed routing endpoints before a scaled launch.

Route mutations write the route and outbox entry in one transaction. Upload acknowledgement checks its mutation token so an earlier response cannot discard a newer edit. Delete tombstones survive restarts. Reconciliation preserves pending edits, rejects stale snapshots, and fetches every remote page before removing absent routes. Cloud queries carry the captured owner's token and recheck the active account before applying results. Cloud behavior is tested through adapters; no hosted Supabase environment is configured here.

Community and route libraries use virtualized lists. Feed previews no longer mount native maps. Route preview geometry is memoized and bounded to 256 points, retains segment breaks, and handles the date line. The theme context stays stable across unrelated store updates. Today, Progress, You and sign-up have simpler hierarchy and memoized derivations.

## Native startup

`plugins/with-scene-lifecycle.js` makes scene adoption reproducible during native project generation. The scene owns the window and forwards lifecycle/deep-link events to the existing Expo application delegate. This fixes the immediate iOS 27 launch failure observed in the simulator. The existing AppDelegate continues to own background services.

Reference: [Apple's scene lifecycle migration](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle).

## Verification

- Strict TypeScript check and 91 unit/integration tests pass.
- Five migrations and `supabase/tests/route_planning.sql` pass against a fresh disposable PostgreSQL 17/PostGIS database with Auth/Storage schema fixtures. Tests cover waypoint bounds and owner-only read/delete behavior. This does not validate hosted Supabase services.
- A walking-provider smoke request returned an actual 469.9 m path with 68 coordinates.
- Signed Release simulator build succeeds with an embedded Hermes bundle; no development server is required.
- Native E2E results are recorded below after execution. A simulator pass does not establish locked-screen physical-device GPS reliability or battery usage.

## Native flows

- `.maestro/recording.yaml`: signup, simulated recording, pause, app restart, resume, save and activity detail.
- `.maestro/gps.yaml`: native location-service start, pause, restart, resume and save. Run while the simulator receives a moving location scenario; it does not use RIVL's in-app simulation toggle.
- `.maestro/routes.yaml`: create a direct route, restart, edit and delete it.
- `.maestro/navigation.yaml`: primary navigation and dark-mode settings.

## Still required for release

Physical iPhone testing under screen lock, extended recording and real permission changes; energy/frame profiling; Android execution; hosted backend deployment; and the outstanding security/distribution gates in `IMPLEMENTATION-STATUS.md`. The simulator test build enables local development accounts. It is not App Store approval or proof of zero security flaws.

## Storage repair — 10 October 2026

The recording blocker came from Expo SQLite's exclusive transaction helper opening a new connection without the SQLCipher key. The main database could initialize and read, while atomic workout/sample writes failed. RIVL now opens and keys a dedicated connection before beginning each write transaction, retains full synchronous durability, rolls back failures, and closes the transaction connection. Encryption and existing-key recovery guards remain enabled. Schema initialization also closes its connection on failure so retry can start cleanly.

New regression tests cover atomic metadata/sample writes through independently keyed connections, keychain-unavailable retry without key replacement, and rollback/connection cleanup. TypeScript and all 94 tests across 16 files pass. All five migrations and five SQL suites (including account safety) pass against a fresh disposable PostgreSQL 17/PostGIS instance with fixture Auth/Storage schemas. Development security preflight passes. npm audit remains at 28 affected entries (23 high, 5 moderate); no dependency upgrades were made.

Native testing confirmed start → pause → process termination → relaunch → resume → finish. The first save attempt exposed keyboard obstruction; title entry now has a Done action and dragging dismisses the keyboard. Full save and further flow results are recorded below.

The complete native recording E2E now passes, including signup, simulated recording, pause, termination/relaunch, resume, finish, title entry, save and activity detail. Evidence: `build/maestro-recording-fixed/2026-10-10_010021/`. This is simulator coverage; the physical phone was not updated.

Route tests confirmed create/save, persistence after restart, and edit/save. Automated scrolling must start in the page margin to avoid panning the native map. The delete confirmation has two matching labels (background action and alert); the test now waits for the alert and selects its second matching button. Full combined route flow has not yet been rerun with those selector repairs.

Latest route continuation: delete succeeded, but the post-relaunch persistence check tapped Record before startup navigation settled. Added a wait for Today’s “This week” before selecting Record in restart tests. A full route rerun is still needed; do not claim the combined flow passed.

Native navigation/theme flow passed: Today → Progress → Community → You → Settings → Dark. Evidence: `build/maestro-navigation-oct10/`. Next: full route rerun with repaired gestures/selectors/startup waits, then OS-injected GPS. Physical-device and hosted-backend checks remain outstanding.
