# RIVL expansion

Requested on 2026-10-13. The supplied comparison is a feature wishlist, not verified information about competitors, pricing or medical capability.

## Latest status — 14 October 2026

The latest user direction supersedes global-bar persistence inside workspaces. Health, Nutrition and Guided training now use authenticated root-sibling groups with contextual bottom bars: Overview/Sleep/Log/Connect; Diary/Plan/Recipes/Insights; Plans/Session/Creators/History. Each shows one bar and a labeled RIVL header return action. Main Home/Maps/Record/Groups, session, storage, identity and Record engine are shared. Entering a workspace or importing a program starts no workout.

Creator Studio source now supports original programs up to 24 weeks/100 sessions/50 local programs, personal drafts, scheduled intervals, JSON preview and attributed copies. Cloud original-only publish/browse/unpublish source is not hosted deployment. External open-source resources are links, not shipped templates or ZWO imports. Final whole-project TypeScript, 407 tests across 62 suites and development security preflight passed; all 12 migrations and 12 SQL suites passed locally. Hosted deployment is not established. All 12 workspace pages were reached with separate contextual bars in `.impeccable/review/workspace-apps-oct14/`. Final corrected settled Sleep and Studio captures passed. Studio uses compact Library/My programs segmented choices with distinct loading, retry/error and confirmed-empty states. An unsaved blank Studio form survived Creators → History → Creators, and the RIVL exit passed. Three enlarged frames—Health Overview, Nutrition Insights Goals and Creator Library error state—passed, then normal text was restored. No populated-flow, keyboard-avoidance, hardware, Android or full HIG claim follows from these entry/form captures. The final reviewer approved this bounded native composition; populated flows, hardware and full Apple conformance remain unverified. The user explicitly authorized physical installation, superseding the earlier restriction. The latest Release build was installed in place on the connected iPhone 15 (`00008120-000E05E00C81A01E`), bundle `app.rivl.training`, and launched successfully as process 1237; a subsequent process check confirmed it remained running. The current workspace apps and Creator Studio are in this installed build. Its JavaScript bundle is embedded and requires no Metro server. Free provisioning expires 15 October 2026 at 17:27:25 IST (11:57:25 UTC). Installation and launch do not validate physical sensors, Watch, HealthKit imports, locked-screen operation or hosted services. The earlier checks below apply to their recorded revision. See `CREATOR-TRAINING.md`.

- Community GPS source pilot: new eligible genuine GPS/Watch workouts queue automatically by default; reference-only outbox, post-workout-sync ingestion, source/revision/owner checks, endpoint/zone clipping, coarse corroboration, moderation quarantine, expiry and retraction are implemented. All eleven migrations and eleven SQL suites passed locally. No hosted deployment, GPS attestation or dedicated-track reconstruction is claimed. See COMMUNITY-GPS-CONTRACT.md and COMMUNITY-TRACK-MAPPING-PLAN.md.
- Nutrition: date/meal diary with gram portions and source-aware calories/macros; real public food search and printed-barcode lookup; personal targets; seven-day actual report/export; measured-ingredient recipes with prepared yield; seven-day plans and derived grocery grams. Missing values stay unavailable, plans never count as eaten automatically. Provider contact/registration and live lookup need release checks. Camera scanning, photo/voice estimation, recipe URL imports and micronutrient coverage remain queued.
- Guided Training: user-authored warmup/work/recovery/cooldown interval plans, persisted pause/resume/skip/end/recovery timer, text/haptic foreground prompts, atomic bounded history. GPS recording remains independent. Spoken workouts and broader adaptive plans remain queued.
- Health/Sleep: platform steps, last24h sleep, weight, recorded water, flights/floors climbed and active energy; manual fallback/fasting/history/export; stable recorded heart-rate peaks; detailed7/30day supplied sleep stages, overlapping-source union, conflict/unknown preservation, recorded-session trends and owner-bound cache. No invented sleep score/diagnosis; hardware integration remains unverified. Additional health categories remain queued.
- Earlier source work retained: shared input/selector/Settings refinements; recording full-screen lifecycle; gear; configurable zones; one installed English navigation voice; routing/sync bounds; segment filters and local SQL. Hosted community/segment operations, partner-device APIs, live safety sharing, offline/device tests and optional Mapbox deployment remain outstanding.
- Current automated checks: Final whole-project TypeScript, 388 tests across 60 suites and development security preflight all passed at 21:09. Dark/light entry and empty-form plus iOS accessibility-medium captures are recorded in `.impeccable/review/workspaces-oct14/`. Shared responsive LabelValueRow fixes enlarged nutrition macro overlap in source, also covering diary/report/grocery rows; the corrected enlarged goals capture (21:03) and workspace reviewer ship for the two scored documentation/navigation and macro-layout fixes are complete. Health movement empty-state capture passed (21:08) without imports, permissions or data creation; this is not hardware approval. Same-owner drafts persist across focus, with a native Nutrition Groups → Home round trip captured. Keyboard avoidance, populated flows, Android, hardware and voice remain unverified. No physical-phone installation, new native SDK, billing or external publishing.

- Latest additional source slices: imported stairs (HealthKit flights/Health Connect floors) and active energy, plus measured cycling-power rows at 5/30/60/300/1200 seconds in existing Activity analysis. Final whole-project checks passed and the reviewer returned ship for the power deadline/cancellation source fix only; no native populated-power, health hardware or full HIG certification is claimed. Latest actual BLE watts are held for up to five seconds and raw Sample lacks the original notification timestamp; the strict sample curve cannot retrospectively prove BLE freshness.
- Static Waistline REA inspection completed for three selected packaged JS files without installation; all parsed, semantic relationships remain partial. See `WAISTLINE-REA-NUTRITION.md`; no competitor code/assets were copied. Evidence/provenance were retained while the temporary APK and extracted sources were removed.

## Install first

- Selected identity: generated Brandkit concept 01, organic trail ribbons.
- Install the current map/Record/atlas build before adding health features. Do not imply later features are in that installed version.

## Current priority: core fitness

- Gear tracking is implemented in source: add/edit shoes and bikes, starting distance, defaults for new real recordings, per-activity assignment, retirement/restoration and mileage totals. Entry points: You → Gear and Activity → Activity gear.
- Records are private, owner-scoped and local to this device; gear cloud sync is not implemented. Gear failures never block a saved workout. Account deletion removes both gear and assignments.
- Validation: TypeScript and 14 targeted gear, wellness and account-safety tests pass. The iPhone light empty/form review fixes are resolved; populated gear and other appearances remain unreviewed. This feature is not in the previously installed phone build.
- Continue activity management/imports, navigation and training analysis before expanding the health dashboard.

## Automation and size (source implemented, native validation pending)

- Opt-in automatic recording starts after sustained movement in a chosen sport. Source, Release simulator build and settings/form UI flow pass;157 tests pass. iPhone uses a small Core Motion bridge to reject vehicle/unknown signals; Android remains a GPS-only selected-sport pilot. Detection while closed is not implemented.
- Existing recorder, auto-pause, analysis and gear defaults are reused. Starts never publish automatically. See AUTOMATIC-RECORDING.md for limits and validation.
- Removed unused MapLibre dependencies and retired the removed 3D renderer. Release simulator build passes; measured uncompressed reduction is about 16.5 MB with MapLibre.framework absent. Phone download size is not yet measured.

## Original health foundation brief (now partly implemented; see latest status)

- Dashboard with sleep, resting heart rate, steps, weight, fasting, water and bowel records.
- Owner-scoped encrypted local records, edit/delete, chronological history, account deletion coverage.
- HealthKit/Health Connect readings remain opt-in and show unavailable readings honestly.
- Fasting is a start/stop record, without prescribed schedules. No biological-age, diagnostic, AFib or loss-of-pulse claims.

## Remaining expansion tracks

- Gear: cloud sync and large-history completeness remain to be validated; local profiles and activity assignments are implemented.
- Training: historical power curves, recorded laps, linked charts, fitness/load trends and configurable zones.
- Community: real posts/photos, follows, comments, kudos, clubs, global challenges and verified segment worker deployment.
- Navigation: route surface metadata, offline guidance, configurable safety contacts and deliberate live location-sharing consent.
- Devices: validate watch recording/routes and sensor pairing; external Garmin/Fitbit/Coros connections require supported partner APIs and their authorization.
- Nutrition: the diary, printed-barcode lookup, targets, recipes, seven-day report/export and meal/grocery planning are implemented in source. Remaining work includes live provider release checks, camera/photo/voice logging, recipe URL imports, broader nutrients and service integrations; retain measured/unknown semantics.
- Guided workouts: original user-authored intervals, persisted timer and foreground text/haptic prompts are implemented in source; spoken prompts and broader adaptive plans remain queued. Competitors' paid videos, branded recovery programs and partner discounts cannot be represented as RIVL content.
- Coaching: explicit data sources, conservative trend summaries, configurable plans; no fabricated sensor readings or medical diagnoses.

## REA and cleanup

Use REA only when a question needs shipped-app or runtime evidence. Strava's downloaded archive has been inventoried; package/class/method inspection now succeeds with the verified Android engine, while the wider UI/runtime investigation is unfinished. Retain it while there is an outstanding investigation. Do not install unrelated apps merely to imitate their screens. Remove acquired test packages when their investigations finish; do not remove the user's installed apps or account data as incidental cleanup.

## Earlier ordered implementation queue (partly implemented; current status above governs)

1. Validate automatic starts and current recording/account boundaries on physical devices.
2. Complete activity import, manual entry, editing/deletion and exports.
3. Finish verified segment processing and real community/challenge deployment.
4. Complete routing surfaces, offline guidance and consent-based safety sharing.
5. Validate watch/sensor flows; add supported partner connections without bundling unnecessary SDKs.
6. Fill analysis gaps and add original guided intervals/training plans.
7. Health dashboard and opt-in biometric/sleep/recovery records.
8. Nutrition diary, food lookup/barcodes, recipes, macro targets and reports; photo/voice estimates need explicit labels.

Competitor content, partner discounts, clinical diagnostics and universal device access are not features that can be supplied by copying a repository. Free service limits, partner permissions and native capability govern availability. Prefer existing dependencies, small platform bridges and reviewed permissively licensed code; track actual bundle/native sizes.

## Activity editing (source implemented, native visual validation pending)

Activity → Edit activity supports title, notes, whole-number perceived effort and privacy. It preserves route/recorded measurements, updates duration-based load and rejects stale versions. Writes share a serial queue; cloud activity and outbox enqueue is atomic. Shared cards, fields, buttons and badges now use Record’s14-unit rounding. Ride summaries show selected km/h or mph. TypeScript,161 tests and iOS bundle export pass; populated editor, global native styling review and hosted sync need validation. No phone installation in this step.

## Queued by user — 13 October 2026

After the current Maps / Home / You update:
- Evaluate Mapbox as an optional Google Maps fallback. Keep credentials/provider selection isolated; compare current free allowance and offline licensing before implementing. Do not add a second mapping SDK until the benefit and size cost are clear.
- Community mapping of dedicated cycling and running tracks from consented exercise traces. GPS alone is not proof of a dedicated facility: require road/track topology checks, multiple independent traces, confidence-aware separation from adjacent main roads, optional user evidence and moderated review. Preserve private endpoints and do not publish raw precise traces. Show uncertain contributions as unverified; no safety claim from a single ride.
- Batch related implementation changes before compilation. Use live refresh for JS/UI; native rebuilds only when native dependencies or configuration change.

Next priority order requested after Mapbox fallback:
1. Segment leaderboards: gender/age/weight/club/date/custom comparison filters and Local Legend. Existing screens/local filters are not evidence of production verification; deploy and validate integrity worker before authoritative rankings.
2. Advanced analysis: transparent relative effort/strain, custom heart-rate zones, historical power curves, fitness/freshness.
3. Routes: route builder, opt-in privacy-preserving community heatmaps, offline guidance/map-provider-compatible offline packs, measured surface/terrain details. Unknown surface and elevation stay unknown.
4. Safety: up to three consented contacts, expiring live location sharing and watch integration. SMS requires an actual delivery service or explicit system composer action; never promise delivery from a local screen.
5. Add-ons: RIVL recovery routines, alternate icons, WeatherKit with account entitlement verification. Recover Athletics access and partner discount codes require third-party agreements and cannot be generated by RIVL.

After fitness: health work requested 13 October 2026
- Consent-based platform imports of steps, stairs, energy, heart rate/HRV/recovery and supported device sound levels. No invented continuous readings or background microphone monitoring.
- Insights / Longevity / Browse organization; sleep stages and clearly labeled duration/consistency/disruption score with missing-data handling. Any health-age estimate needs a validated model; do not present an arbitrary score as biological age.
- Health logs: hydration, weight, blood pressure, cycle tracking, medication reminders, device workout history and daily movement goals. EHR integration depends on supported regional providers and consent.
- Watch/sensor overlays; original audio workouts; aggregate effort comparisons only with real anonymous opt-in data. Licensed celebrity music/stories and third-party video libraries require rights.
- Readiness trends, adaptive plans and optional coach. AFib/loss-of-pulse/high-low alerts only from compatible validated device sources, never inference from GPS. No WHO partnership branding without agreement; any guideline-based points must accurately cite guidance.

Then nutrition work requested 13 October 2026
- Breakfast/lunch/dinner/snacks diary; licensed/public food database search with provenance, calories and percentage/gram macro goals; supported health synchronization.
- Free barcode scanner; photo and voice estimated meal logs requiring confirmation; fasting timers and configurable windows, meal-specific/day-specific macro scheduling.
- Seven-day meal planning and grocery lists; retailer connections require actual APIs and explicit purchase actions.
- Micronutrient tracking, seven-day averages and historical reports/export; recipe URL imports and food suggestions. Preserve source completeness, nutrient units and unknown values; do not claim 84 nutrients or a million vetted entries without database coverage and rights.
- Keep features ad-free. No copying competitors' proprietary food databases, licensed content, or inferred nutrition facts.

## Current UI batch — source implemented, verification in progress (14 October 2026)

Home/You/Maps/Groups/Plan route/Saved routes/Automatic start/Progress/Heatmap/Offline guidance have structural Record-led revisions, not only corner changes. Added local Maps overlays/zoom, map-area place selection, Map layers/sport/period controls, segment and community-density entries, scoped loop suggestions, manual-route dashed lines, real-loading animations, robust location cache fallback and a shared safe-area correction. Typecheck passed after a missing Groups Pill import was corrected; 166 tests passed before the final shared safe-area correction. Native review confirms You -> Gear, and Google map initialized locally at a declared synthetic simulator test area. Full combined UI review is still underway; no phone install and no all-features/parity claim.

Global follow-up: apply this same UI system to the remaining existing detail, device, account, privacy/safety, notification, challenge/league, navigation and activity analysis/sharing screens. Existing/future screens must stay consistent. Do not mark app-wide redesign complete from a subset of captures.

### Mapbox fallback and device/settings batch — 14 October 2026

Optional fallback source is integrated through a shared native/web controller, using CDN GL JS rather than a second native SDK. Only explicitly eligible device/user/open-map geometry can switch after an actual Google load failure or absent Google configuration. Google/unknown place provenance stays on Google. The Maps place-selection link now carries provenance. Missing Mapbox configuration keeps Google; no live Mapbox token is configured or service validation claimed. Public-token checks reject secret tokens. Google/Mapbox attributions remain provider-owned.

177 tests across 34 files, TypeScript and development security checks pass for the map integration. Settings uses flat expandable groups; Devices/Watch use the same task grouping and meaningful connection/loading states. Those additional UI changes typecheck; native captures/review are pending. Simplified existing page titles for notifications, people, challenges and leagues, without claiming their larger redesign complete.

The startup warning was traced to the watch connection. Native context transfer now requires an activated, paired watch with RIVL installed; current owner/logout context is still persisted and sent on watch-state changes. UUID validation remains intact. Debug simulator build succeeds with a per-invocation Xcode script sandbox override; no project security setting changed. A real paired/unpaired watch test remains required. No physical phone installation.

### Segment history & UI review — 14 October 2026

The 14-screen dark iPhone simulator batch passed native navigation/capture checks. The independent reviewer accepted their evidence and found three material fixes: Groups recovery actions/copy, distinct loading movement, and updated design documentation. Groups now separates local account, unavailable service and offline states with actual recovery actions. LoadingJourney has cycling/crank, stepping/tilt and route-corner progress variants; Reduce Motion remains static. A correction flow passed Groups action, Segments empty entry, and two screenshots during a real Google tile-loading wait followed by its settled map. Verdict/documentation handoff remains in progress; populated/light/enlarged-text/Android/hardware states are not certified.

Segments now has a flat Record-styled screen with Fastest, Most efforts and Compare views. Custom UTC date ranges apply before best-effort selection. Period comparisons preserve missing data; age/weight/friends/club filters remain available. Most efforts uses distinct server-checked public activities over a rolling 90 days and deterministic ties. Local account results are owner-scoped, labeled unverified, and do not award an official crown. Responses are masked by current owner/filter key and stale queries cannot replace newer results. Gender filtering, production processing/deployment, populated remote UI and operated scheduler remain outstanding.

New migration `202610140001_segment_history.sql` rechecks public visibility, source/segment revisions, privacy participation, blocking, moderation, deletion, and age/weight sharing consent. It returns at most 250 athletes; comparison covers the returned best-effort tables and is not an exhaustive global ranking of improvement. 180 automated tests/35 suites and nine PostgreSQL/PostGIS policy suites pass in a disposable local fixture, including date boundaries, best-time selection within period, rolling counts, private-effort crown retraction and anonymous access denial. This is not hosted Supabase verification. No phone install.

### New immediate design priority — 14 October 2026

Before the next feature work, improve shared button/selector appearance (Overview/Analysis and sport options specifically), add smooth press/selection transitions across shared controls and full-screen real-loading presentation. Honor Reduce Motion and keep recovery/cancellation possible for slow maps. Prior correction reviewer returned `ship` for its scored fixes only (Groups recovery, loading ground, persistence); that evidence does not approve this newly requested controls/loading batch.

Controls/loading implementation and validation: rounded outlined secondary buttons, coral sliding segmented selections with sport icons, shared press/switch feedback and a root full-screen loading overlay are implemented. A native accessibility defect was corrected by putting modal isolation on the full overlay including Continue, rather than its central content alone. Continue dismisses current job presentation without cancelling work; completed/unmounted jobs unregister and new work can appear. Last task label persists through modal exit. Real iPhone simulator location-request flow passes full-screen presentation, Continue accessibility/tap, destination access while work continues and eventual unavailable-location recovery. Settled dark iPhone captures cover Overview/Analysis, all four sport choices and planner. 183 tests across 36 suites and TypeScript pass, including concurrent/dismissed/restarted loading lifecycle. An earlier parallel test run timed out starting workers; the bounded single-worker run passed. Independent finish review/documentation for this addition are pending; no phone install or Android/light/enlarged-text approval.

Independent controls/loading review accepts the captured composition and four-choice fit, with one material fix: separate pending request lifetime from foreground eligibility, and preserve Continue suppression through blur/refocus. That correction now observes screen focus centrally, updates visibility without cancelling or re-registering the request, and keeps background requests out of the overlay. Google and optional Mapbox share the corrected hook. 185 automated tests pass, including foreground eligibility, refocus suppression and background isolation. Native navigation correction evidence/verdict remains pending. Updated live app was brought forward in Device Hub's iPhone 18 Pro simulator on Progress when the user couldn't see it.
