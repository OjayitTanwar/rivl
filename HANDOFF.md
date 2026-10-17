# RIVL — development handoff

Updated: 16 October 2026, Asia/Kolkata.
Project: `/Users/ojayitsinghtanwar/Desktop/rivl`

## 1. Read this first

### Shared text fields — 17 October 2026

All 86 Field instances across 30 screens/components now use the Strava-informed shared treatment: plain surface, thin neutral outline, 8-unit corners, 50-unit minimum height, 17-unit body text and quiet labels. Focus strengthens the neutral outline; errors/caret remain themed. Native passwords/clear/multiline/keyboard options remain, with Done default only for single-line inputs. No app-level raw TextInput exists outside the shared primitive. Evidence ledger: docs/STRAVA-REA-INSPECTION.md (three focused REA/JADX methods; static Android evidence plus retained visualreference, not iOS runtime equivalence). TypeScript passes. Simulator native typing, clearing and password Show/Hide passed without submitting a login. Creator walkthrough blocked by simulator SecureStore missing entitlement with the unsigned Debug artifact, not a field failure; no full multiline/whole-app visual certification. Phone installation recorded after completion.


### Completion batch and phone build — 16 October 2026

Dedicated hosted project now has 23 migrations through 202610160009. Seven new transactional hosted suites passed with rolled-back fixtures: unmapped corridors, shared routes, training targets, live sharing, retention, club events and moderation. Full local database regression: 23 suites passed. Final app regression: 605 tests / 88 suites, TypeScript, development security and Deno worker checks passed. Backup manifest tests: two passed. GPS integration covers real-source preparation, neighbor privacy, stale completion and split-way ambiguity.

Community GPS now includes bounded private unmapped centerline proposals from five independent owners and three days, continuous common-source support, privacy revalidation, versioned reviewer decisions, immediate disputed suppression and live revocation-aware reads. Split/adjacent mapped OSM ambiguity cannot become a new-path proposal. Worker redeployed. Public results are discovery evidence, never routing or safety certification; genuine multi-athlete field validation and appointed reviewers remain required.

Other additions: shared route publish/browse/save/report with trimmed endpoints and CC BY attribution; clubs with roles/events/capacity-safe RSVP; explicit foreground friend live sharing; app moderation console with server-provisioned staff roles; training targets/recovery feedback/original CC0 starters; health HRV/BP/cycle/medication logs; micronutrients, camera barcode scanning and reviewed photo/voice food drafts. Offline rerouting uses fresh versioned node topology and mode/access/direction restrictions; full licensed offline basemaps remain absent.

Existing approved cron now invokes bounded once-daily retention before queue dispatch, updated with cron.alter_job through the Management API. Migration007 deliberately does not modify cron.job: hosted migration roles lack that privilege. Fresh deployments still require operator scheduler activation. No new Vault credentials or paid provider were enabled.

Encrypted hosted-runner backup tooling is dormant until an operator configures a recipient/destination and performs a disposable restore. SMTP/OAuth, named moderation/support, genuine GPS/health/Watch/BLE testing, load capacity and store distribution remain launch gates. Do not claim everything complete. Latest standalone Release build succeeded and was installed in place on physical iPhone 00008120-000E05E00C81A01E, preserving its container. Camera/microphone/speech permission descriptions verified in the signed artifact. Evidence: /private/tmp/rivl-phone-completion-build.log and rivl-phone-completion-install.json. Launch verification is pending unlock: CoreDevice explicitly returned Locked; this is not an app crash.

### Current priority, UI delivery and Community GPS — 16 October 2026

Latest user direction: Community GPS tracks takes first priority, ahead of further UI polish. User also asked to download more reference apps and use REA. OpenTracks, Organic Maps and OsmAnd packages were acquired, hashed, inspected including focused decompiled methods, then temporary packages removed; evidence/report docs/COMMUNITY-MAPPING-REA.md. Original implementations/assets only.

UI source batch: Activity-led flat sections and less visible copy across workspaces/support pages; details behind disclosures; Health/Nutrition/Training no longer register global fullscreen refresh jobs and retain same-owner restored content/drafts on refocus. Their NativeTabs minimizeBehavior is never. Record fullscreen loading remains. Header title/action alignment fixed; collapsed Settings HR editor remains mounted to preserve drafts. Fifteen actual dark simulator captures: artifacts/screenshots/activity-polish-oct16. Full contextual tab walkthrough passed after clean app launch. Earlier walkthroughs started underneath the prior screenshot Settings modal and failed; those are not proof of a physical app freeze. No physical FPS certification and this UI batch is not yet installed on phone.

Community GPS mapped-path slice: migrations 202610160001_track_reconstruction and 202610160002_track_worker_dispatch deployed to xsfxptlnmcxtrsudjkdq; process-track-mapping deployed. Existing queue-only scheduler active, extends approved existing GPS worker credential (no new Vault secret). New worker accepts optional RIVL_TRACK_WORKER_SECRET override, falling back to existing RIVL_SEGMENT_WORKER_SECRET. Private reference jobs, current source/preference/lease checks, endpoint/zone/gap filtering, ambiguity against sparse parallel alternatives, per-section OSM support, inward planar-fraction conversion, normalized fingerprints, live read eligibility and withdrawal cascades. Discovery only, not routing. Pilot100claims/day,100queuedjobs,5attempts,20MB map-payload cap. See latest mapping plan for exact limits. Entirely unmapped path centerlines/review, mode-aware graph/routing and offline revocation remain real gaps; do not claim full track reconstruction complete.

Checks: TypeScript,505tests/73suites, development security and Deno function check passed. Existing community and new reconstruction SQL passed locally; reconstruction lifecycle suite also passed hosted inside guarded rolled-back transaction (no committed fixtures). New worker missingsecret401/GET405; anonymous candidate read401/clientclaim401. Live Auth+seven data reachability probes all200; hosted project ACTIVE_HEALTHY, database21MB. These are not load tests or a supported-user guarantee. Existing free Supabase limits were checked against official docs:50k authMAU,500MB database,1GB files,5GBuncachedegress,200Realtime connections. Authentication quota is not RIVL athletecapacity. Authenticated hosted worker smoke returned200, state idle, no timeout/transporterror. Hosted fixture-user residue verified0. Main-phone build remains prior accent/freeze candidate.

Shared-route status clarified: planning/saving/navigation/GPXexchange exist; a public publish/save/browse route library is missing. Personal records/milestone/exploration achievements exist. Segment/LocalLegend source is present but real workout E2E remains a gate. Preserve these distinctions in status answers.

### Accent colours — 15 October 2026

Added optional validated Profile.accentColor, preserving orange for old profiles. Six named choices in Settings → Display & accessibility: Orange, Blue, Purple, Green, Teal, Pink. Theme exposes readable light/dark accent plus bright primary fill; native tabs, shared controls, Record actions, switches, default charts/progress follow the choice. Existing profile storage/cloud settings persist it without a schema migration. Brand logo and semantic multi-colour zone series remain unchanged. Source palette: src/domain/appearance.ts.

TypeScript, all 469 tests / 70 suites and development security passed. Simulator selected Blue then Purple, captured themed controls and selected swatch, restored Orange. Screenshot proof is under /private/tmp/rivl-accent-check. Release build succeeded; installed in place on physical iPhone, preserving container, evidence /private/tmp/rivl-phone-accent-build.log and /private/tmp/rivl-phone-accent-install.json. Launch outcome is separate from installation.


### Recurrent physical touch freeze, candidate correction — 15 October 2026

User reported ALL touches stop and narrowed a repeatable trigger to Training → Creators → Import a shared program. Captured the physical app on Home while reported frozen. RIVL remained a live process; a hang-thread diagnosis was not obtained: CoreDevice capture/process services worked, but Instruments saw the device offline and LLDB never attached. Initial app-switcher screenshot incidentally included other apps; private temporary evidence only, do not publish it.

Removed the global UIKit/RN Modal loading presentation in favor of conditionally mounted iOS FullWindowOverlay and root overlay elsewhere, preserving job identity/Continue, accessibility isolation and Android Back. Choice now commits a selected value after iOS onDismiss, guards reopening, and cancels pending effects on route blur; Recording’s Devices navigation also waits for popup dismissal. JSON import disables spellcheck/autocorrection. These correct concrete native-presentation hazards; actual original freeze cause is not yet proven.

TypeScript, 469 tests / 70 suites and development security passed. New standalone build succeeded and installed in place (`/private/tmp/rivl-phone-touch-freeze-build.log`, `/private/tmp/rivl-touch-freeze-install.json`). Launch attempt was blocked solely because the phone had locked. User unlocked/opened the new build, repeated the requested import expansion/tab-switching check, and explicitly confirmed “It works now.” This validates the reported trigger on the phone, not every possible app freeze. Simulator exact-flow check initially reached Expo launcher, then restored Creators rather than expected Home; those bootstrap assertions do not prove an app regression or a passing import flow. The corrected simulator exact flow passed repeated import expansion/collapse, typing/clearing, Home return, re-entry and Run → Ride → Run selector dismissal/selection plus final Home return. No program was saved or published.


### Stability corrections and current phone build — 15 October 2026

User reported intermittent stuck screens and unresponsive buttons and explicitly requested physical installation. Fixed: authenticated navigator now stays mounted during refresh errors, with matching-profile hydration required for initial gates; load revisions reject out-of-order same-owner cache snapshots; Field clear slots reserve width; keyboard-open selector taps persist and whole-form switch motion is suppressed while typing. LoadingJourney loops are non-interaction animations, and hidden full-screen loader children are unmounted so invisible loops do not keep the interaction queue active. Backend fetch and body consumers now have actual rejection deadlines even when cancellation is ignored, including clones and post-header abort.

Checks: whole-project TypeScript, 469 tests in 70 suites and development security passed; final hydration-gate refinement passed TypeScript and diff checks. Native flow passed Creators draft typing → History → Creators retention → clear → RIVL → Nutrition → Health → Record, without saving or starting recording. Simulator shut down after this check. Device/audio/GPS/Health/Watch and every-screen certification are not implied.

Standalone Release build succeeded from current source. Embedded bundle includes only the selected new RIVL backend, not the old project reference. Installed in place on iPhone 15 (`00008120-000E05E00C81A01E`), bundle `app.rivl.training`; no uninstall/purge. Signing expires 22 October 2026 at 21:54:41 IST. Evidence: `/private/tmp/rivl-phone-stability-build.log`, `/private/tmp/rivl-phone-stability-install.json`, `/private/tmp/rivl-phone-stability-launch.json`. Launch was rejected by iOS security/trust. codesign --verify --deep --strict passes; the renewed profile includes this UDID and allows the app entitlement keys. User trusted/verified the developer in Settings; retry launched and activated successfully as PID 4375, and a subsequent process query confirmed RIVL remained running. Retry evidence: `/private/tmp/rivl-phone-stability-launch-retry.json`, `/private/tmp/rivl-phone-stability-processes.json`. This confirms installation/launch, not all physical interactions.


### Latest backend, feature and input batch — 15 October 2026

User explicitly chose the new RIVL backend and approved storing existing worker credentials in its Vault plus activating the queue-only scheduler. Both ignored app env files now target `xsfxptlnmcxtrsudjkdq`. Fourteen migrations are deployed; worker scheduler `rivl-workers` is active every two minutes, ran successfully and dispatches zero Edge calls for empty queues. Private dispatch ACL and public-table RLS checks passed. Neither app environment nor current native plist had API pins, so no pin was changed/disabled. Existing installed phone build still uses its previously embedded configuration until rebuilt.

Live two-account smoke passed actual password login/refresh, private read/update isolation, forged-owner rejection and friendship request/immutable endpoint/accept/remove; both ephemeral users were removed with deletion verified. Email delivery is not proven; hosted Apple/Google providers are disabled. Password-reset retry no longer re-exchanges a consumed PKCE code; deletion reauthentication verifies the current owner before committing.

Larger source additions: opt-in foreground spoken interval cues sharing the selected voice with ownership-safe cancellation; transparent progressive multiweek programs saved privately to Creator Studio; bounded structured recipe URL preview with every ingredient matched to a logged food and confirmed grams before save; actual OSM mapped-path candidate comparison with nearby coarse evidence and road-node topology kept separate. No physical track separation/safety inference or automatic medical coaching. Native recipe transport cannot enforce streaming transfer bounds when RN supplies only response.text; decoded bound and deadline remain enforced.

Shared Field now has quieter filled 52-unit controls, thin focus/error outlines, muted labels, 12-unit radius, password visibility and clear actions. Simulator blank/focused Creator screenshots are in `.impeccable/review/fields-oct15/`; typing/clear passed after fixing label-to-input focus. No program saved. Light/enlarged snapshots were unsettled and are not validation. Normal text and dark simulator appearance restored. No physical installation or full HIG/accessibility claim this batch.

Latest source validation: TypeScript, 464 tests / 70 suites, development security check and diff whitespace check passed. Worker migration/live ACL checks are separate evidence; no all-15-SQL-suite claim for this batch. New-feature native populated flows, real voice/provider checks, health/Watch/BLE hardware, store distribution and the broader remaining queue remain in docs/REMAINING.md.


### Hosted reliability and GitHub source preview — 14 October 2026

The user clarified that the backend must remain hosted; no always-on personal computer. Read-only public-key probes reached hosted Auth settings and zero-row headers for profiles, activities, published activities, clubs, memberships, comments and friendships. These establish reachability only, not login/RLS/migration/function verification. Hosted administrator/deployment access is not configured in this environment.

Hosted backend deployed — 15 October 2026. The previous target `vcbglcugsitmvlujwual` (in both `.env.local` and `.env.production.local`) is NOT manageable by the account that owns this work: its project list exposes only `ieqthlbjxyisvgxagvfv` ("Fun") and `hwqdpvcwanpgyleddoxd` ("Rev Circle"). The user therefore asked for a dedicated project, and a new free project was created and deployed to: **`xsfxptlnmcxtrsudjkdq`** (name `rivl`, org `rfddotzcfrexzcpuexdw` Rajput, region ap-south-1), linked locally with `supabase link`. All 13 migrations were pushed (`db push`, exit 0) and the remote history now matches local for all 13. All four edge functions were deployed with server-side bundling (`functions deploy --use-api`): delete-account, process-deletions, process-segments, route-intent. `auth.additional_redirect_urls` was pushed to exactly `["rivl://auth-callback","rivl://password-reset"]` via `supabase config push` (declared in `supabase/config.toml`; undeclared remote properties were left unchanged — a final `config diff` reports 0 updates). `RIVL_DELETION_WORKER_SECRET` and `RIVL_SEGMENT_WORKER_SECRET` were generated and set as hosted secrets; Supabase's default secrets (service role, DB URL, keys) are auto-injected. `route-intent` intentionally answers `{"configured":false}` because `TYPESAFE_API_KEY`/`RIVL_TYPESAFE_SPENDING_ENABLED` are unset, preserving the zero-cost rule.

Remote verification (read-only SQL over the linked pooler connection and live endpoint probes): 13 rows in `supabase_migrations.schema_migrations`; 33 public tables and all 33 with RLS enabled; `friendship_endpoints_immutable` trigger present; all four social-integrity indexes present; 4 `track_*` tables, 3 `creator_training_*` tables and `account_deletions` present; PostGIS installed. Functions: `process-deletions`/`process-segments` return 401 `{"error":"unauthorized"}` without the worker secret and 200 `{"state":"idle"}` with the deployed secret, so the secret wiring is proven end-to-end (a wrong secret still returns 401); `delete-account` returns 401 `{"error":"sign_in_required"}` without a JWT; `route-intent` returns 200 `{"configured":false}`. REST probes: `profiles`/`activities`/`published_activities` 200, `track_contributions`/`creator_training_programs`/`account_deletions`/`segment_processing_jobs` 401 [42501] (present, RLS-denied to anon).

Security rules enforced — 15 October 2026. Four standing rules were audited against the repo and the live hosted database, and the two real gaps were closed. (1) No placeholder secrets, JWTs or service-role keys exist in code: a repo-wide scan for `sb_secret_*` and JWT-shaped literals is clean; real values live only in gitignored `.env.local` / `.env.production.local` and in hosted function secrets. (2) `.gitignore` gained explicit `.env`, `.env.local`, `.env.production` and `docker-compose.override.yml` lines (previously only the `.env.*` glob existed). (3) RLS is enforced: new `supabase/tests/rls_coverage.sql` fails the build if any public table lacks RLS, if a blanket `using (true)` policy appears outside the five reviewed public reference tables (`profiles`, `clubs`, `club_members`, `segments`, `challenges`), or if a client-granted table has no policy. It passes against the live project and all 14 SQL suites pass on a fresh local PostGIS database. Live audit result: 33 tables, all with RLS; 69 policies, 22 tables using `auth.uid()`; the nine no-policy tables (`track_*`, `creator_training_*`, `segment_processing_jobs`, `route_intent_budget`, `hidden_content`) have zero grants to `anon`/`authenticated`, so they are deny-by-default and reachable only by `service_role` inside edge functions; the five `using (true)` policies are SELECT-only, `authenticated`-only, on public reference data. (4) `scripts/security-preflight.mjs` now also fails when any of the four ignore entries is missing or when `app/`, `src/` or `plugins/` reference `service_role`, `SERVICE_ROLE_KEY` or `sb_secret_`; the pre-existing `EXPO_PUBLIC_` scan already blocked bundling those into the client. Both new guards were negative-tested (deliberately removing the ignore line and adding a `service_role` literal each failed the check with exit 1), and the repo was restored clean afterwards.

Hosted `auth.email.otp_length` is **8**, not 6 — the deletion OTP client check was corrected to accept the server-configurable 6–10 digit range instead of hardcoding six, with a regression test for the 8-digit case.

The app has NOT been repointed: both env files still target `vcbglcugsitmvlujwual`, pending the user's decision (that project may hold existing accounts/workouts). Secrets and the DB password were generated to `/private/tmp/rivl-new-project.env` (mode 600, outside the repo) and must be moved to the user's own password manager. Email deliverability, worker scheduling (pg_cron or equivalent), and two-account end-to-end validation remain outstanding.

Pre-deploy local gate — 15 October 2026: all 13 migrations applied in order and all 13 SQL suites passed against a fresh disposable PostGIS database (PostgreSQL 17.11, Homebrew `postgresql@17`, private socket, no TCP listener). An earlier attempt on PostgreSQL 16 failed only because no PostGIS build exists for it, not because of a migration defect. Disposable cluster removed.

Source auth fixes cover PKCE email confirmation callback, shared account/profile hydration, cached OAuth owner/session validation and stale sign-out guards. Community fixes pin requests to the current owner, bound reads, preserve real aggregate totals with paged comments and prohibit rewriting friendship participants. See the new social-integrity migration. Password recovery and OAuth-only deletion reauthentication are now source complete (15 October 2026): "Forgot password" sends a PKCE reset email to `rivl://password-reset`, `app/password-reset.tsx` exchanges the code and saves the new password before hydration, and Apple/Google-only accounts reconfirm deletion with a 6-digit emailed OTP (`verifyOtp` type "email"), which the hosted `delete-account` function already accepts via its `amr` check. Both paths replace the password-only `requestDeletion` reauthentication; hosted deployment and two-account end-to-end validation remain required.

GitHub source packaging adds portable per-installer signing, a standalone Release iPhone helper, hosted setup and remaining-feature guides, a custom SVG README banner and public CI source checks. The source preview includes no universal IPA or verified Android APK. The previously installed phone build predates these source-only auth/community fixes. Source publication does not deploy the hosted backend.


### Latest contextual workspaces and Creator Studio — 14 October 2026

This supersedes the persistent-global-bar workspace architecture below. Health, Nutrition and Guided training are root-sibling authenticated workspaces with one contextual bottom bar each: Health Overview/Sleep/Log/Connect; Nutrition Diary/Plan/Recipes/Insights; Training Plans/Session/Creators/History. A labeled RIVL header action returns to the main Home/Maps/Record/Groups app. Identity, session, storage and the core recording engine remain shared. Opening or importing starts no session.

Creator Studio source supports original multi-week programs (up to 24 weeks, 100 scheduled sessions and 50 local programs), personal drafts, reusable intervals, JSON export/import preview and attributed copies. CC BY 4.0/CC0 are explicit sharing choices; imported copies preserve origin and cannot publish as original work. Cloud browse/publish/unpublish adapter and migration exist in source without hosted deployment. External OpenHIIT/wger/Zwift resources are links, not imported templates or converted ZWO. See `docs/CREATOR-TRAINING.md`.

Final whole-project TypeScript, 443 tests across 67 suites and development security preflight passed. All 13 migrations and all 13 SQL suites passed against a fresh disposable local PostGIS database on 15 October 2026. Hosted deployment is not established.

All 12 workspace pages were reached with separate contextual bars in `.impeccable/review/workspace-apps-oct14/`. Final corrected settled Sleep and Studio captures passed. Studio uses compact Library/My programs segmented choices with distinct loading, retry/error and confirmed-empty states. An unsaved blank Studio form survived Creators → History → Creators, and the RIVL exit passed. Three enlarged frames—Health Overview, Nutrition Insights Goals and Creator Library error state—passed, then normal text was restored. No populated-flow, keyboard-avoidance, hardware, Android or full HIG claim follows from these entry/form captures. The final reviewer approved this bounded native composition; populated flows, hardware and full Apple conformance remain unverified.

The user explicitly authorized physical installation, superseding the earlier restriction. The latest Release build was installed in place on the connected iPhone 15 (`00008120-000E05E00C81A01E`), bundle `app.rivl.training`, and launched successfully as process 1237; a subsequent process check confirmed it remained running. The current workspace apps and Creator Studio are in this installed build. Its JavaScript bundle is embedded and requires no Metro server. Free provisioning expires 15 October 2026 at 17:27:25 IST (11:57:25 UTC). Installation and launch do not validate physical sensors, Watch, HealthKit imports, locked-screen operation or hosted services. Build evidence: `/private/tmp/rivl-phone-current-build.log`; install `/private/tmp/rivl-phone-install-current.json`; launch `/private/tmp/rivl-phone-launch-current.json`.

### Earlier workspace status — superseded navigation, 14 October 2026

This section supersedes the dated continuation and stopped-work notes below. Development was resumed by the user. The app is not production complete and the broader wishlist remains partly queued.

- One cohesive Home hub opens Activity, Health, Nutrition and Guided training. Sleep is inside Health; You/profile and Settings are Home destinations. Four persistent global tabs—Home, Maps, Record and Groups—remain visible through the nested, index-anchored Home stack and on Record entry. Existing moved URLs remain valid. Choosing a workspace does not start or change GPS recording.
- Activity retains workouts, routes, progress and exploration. Health provides consent-based platform imports, manual fallback, fasting and history; Sleep adds supplied 7/30-day stages and recorded-session trends with unknown/conflicting values preserved. No invented readings, sleep scores or diagnosis.
- Nutrition includes the date/meal gram diary, public packaged-food search and printed-barcode lookup, personal calorie/macro targets, seven-day actual report/export, measured-ingredient recipes, seven-day planning and derived grocery grams. Planned meals are separate from actual intake. Camera/photo/voice estimates, recipe URL imports, broader nutrients and live provider release checks remain outstanding.
- Guided training supports user-authored interval plans, explicit session Start, persisted pause/resume/skip/end, foreground text/haptic prompts and bounded history. GPS recording is independent; spoken/adaptive workouts remain queued.
- Same-owner editor drafts survive focus changes; owner changes reset them. A native Nutrition draft survived Groups → Home and scrolling. Shared LabelValueRow stacks nutrition labels/values at fontScale >= 1.3 or width < 320, including diary, report/recipe macros and groceries. The corrected enlarged goals capture (`nutrition-goals-large.png`, 21:03) passed the workspace fix reviewer, which returned ship for the two scored documentation/navigation and macro-layout fixes only.
- Community GPS is a source pilot: eligible genuine GPS/Watch saves queue by default, reference-only outbox ingestion follows workout sync, and owner/revision checks, privacy clipping, coarse corroboration, quarantine, expiry and retraction are implemented. No hosted deployment, GPS attestation or dedicated track reconstruction is established.
- Latest automated checks at 21:09: whole-project TypeScript, **388 tests across 60 suites** and development security preflight all passed; **11 migrations and 11 SQL suites passed locally**. These checks do not establish hosted operation or hardware readiness.
- Workspace captures are in `.impeccable/review/workspaces-oct14/`: dark/light entry and empty-form states plus iOS accessibility-medium enlarged screens, then normal text restored. The corrected enlarged goals capture and two-fix review are complete; that narrow ship verdict does not approve all workspace states. The Health movement empty-state capture (`health-movement.png`, 21:08) passed without imports, permissions or created records. Keyboard avoidance, populated flows, Android, sensors/Watch/health hardware, natural voice and full HIG certification are outside this evidence. No physical-phone installation, billing or publishing occurred. Keep logo01 and Record-led styling.

- Subsequent slices are source complete: imported HealthKit flights/Health Connect floors climbed and active energy, plus measured cycling-power rows in existing Activity analysis for 5/30/60/300/1200-second windows. Missing coverage stays unavailable; real zero watts are retained. Final whole-project checks passed at 21:09; the reviewer returned ship for the power deadline/cancellation source fix only. No populated native power, imported health hardware or full HIG claim. Current sensor acquisition holds the latest actual BLE watts up to five seconds; raw Sample lacks the original notification timestamp, so the strict sample curve cannot retrospectively prove BLE freshness.
- Waistline REA inspection completed for three selected packaged JavaScript files, using static analysis without installation; see `docs/WAISTLINE-REA-NUTRITION.md`. All three parsed, semantic relationships remain partial, and no competitor code/assets or runtime correctness were adopted. Retained evidence: `/private/tmp/rivl-waistline-rea-evidence.json` and `/private/tmp/rivl-waistline-extraction-provenance.json`. Temporary downloaded APK and extracted source paths were removed after the selected investigation completed.

### Earlier resumed work — historical snapshot, 14 October 2026

The user has now authorized resuming development, requested ten subagents, and added a Groups Challenges-selector fix plus nicer shared text inputs informed by REA. The earlier stop-development instruction below is historical. Three subagents can run concurrently alongside the parent; ten distinct scoped agents were dispatched in successive waves.

Earlier continuation — automatic health and easier access:

- Home now links directly to Health log; You retains its entry. Explicit HealthKit/Health Connect connection enables automatic refresh on Health-log focus/foreground, with daily steps, overlap-unioned last-24-hour sleep, weight, and real dietary-water records where available. Imported records are read-only; manual records remain available. Stable provider/day IDs prevent duplicate totals. Incomplete/malformed reads preserve existing data, and owner/session guards plus queued purge protect account changes. Connected water records take precedence over manual intake for the same day.
- Automatic recorded heart-rate log derives supported peaks from saved raw samples (at least three readings within 5 bpm over ten seconds, no long gaps or pauses). Demo/simulation/other-owner evidence is excluded; edits/deletion recompute it. This is a recorded peak, not physiological maximum. Zone maximum changes only through the explicit apply action, and past summaries stay unchanged.
- Settings now uses compact flat sections and optional detail disclosures; custom-zone defaults follow saved maximum unless actively edited. Recording uses the shared full-screen loader for restore/start/review/save, while live recording controls stay available.
- Navigation has one automatically selected installed English voice, serialized prompts and bounded discovery; no ElevenLabs billing/assets were created. Actual voice quality on hardware remains unverified.
- GPS community mapping has typed OSM provenance/access/direction plus conservative bounded fragment preparation and a detailed rollout plan. Automatic contribution is the chosen future default, but collection, hosted corroboration and publication are NOT implemented.
- Shared inputs and choices were finished using REA-supported interaction patterns; recovered Strava evidence establishes structure, not exact pixels. Corrected dark/light screenshots live in `.impeccable/review/resume-oct14/`. Keyboard avoidance and enlarged text are not certified.

Earlier validation: TypeScript, **296 tests across 47 suites**, and development security preflight passed. The existing iOS simulator flow passed Home shortcut → Health log → blank-entry validation → Settings heart-rate log without writing health records or requesting permission. Captures live in `.impeccable/review/resume-oct14/health/`; the final repeat waits for settled native presentation and includes the shorter helper copy plus draft-preserving validation error. Permission prompts and populated imported records are outside this simulator check. The independent finish reviewer returned ship only for the settled Settings and final blank-validation capture corrections; this is not whole-surface or hardware approval. Existing local migration/SQL checks below remain valid; actual health permissions, Android hydration and sensor hardware remain unverified. Android hydration permission is in app.json and needs a future native build, which was not performed or installed.

Earlier source batch:

- Loading-lifecycle correction received `ship` at the listed source/reducer-fix scope. The native same-request refocus scenario remains inconclusive. `DESIGN.md` and its sidecar were merged from implemented controls/loading.
- Optional self-selected gender category, private-by-default sharing consent, and segment gender filters are implemented. A compatible ninth-argument RPC overload in `202610140002_segment_gender.sql` applies consent/category filtering before the 250-athlete limit; the original eight-argument API is retained. Hosted deployment remains outstanding.
- Personal four-boundary heart-rate zones are configurable in Settings. Recording and Watch import snapshot the profile supplied at save/import; changing settings does not rewrite saved zone totals/load. Legacy totals retain their original values and disclose missing original maximum.
- Recording save atomically commits activity metadata and removes the active session. Health enrichment rejects nonfinite timestamps/readings instead of attaching invalid samples across a recording.
- Routing now uses bounded JSON transport: timeout and cancellation span headers/body, 4 MB byte bounds, streaming and native fallback, and safe malformed-response errors.
- Owner activity sync validates complete pages, metrics/routes/media paths and pagination progress before returning an advancing cursor. Invalid data stops sync rather than silently skipping records.
- Groups uses compact shared selectors. Active pills animate actual width instead of stretched corners; horizontal scrolling happens only when a choice is offscreen. Challenge actions show loading and errors and prevent overlap.
- Shared input refinement/REA investigation is implemented; see latest continuation and native evidence limits above.

Checks so far: TypeScript and **247 tests across 41 suites** passed after the domain/service changes. All **10 migrations and 10 SQL suites** passed against fresh local database `rivl_resume_oct14`, socket `/private/tmp/rivl-pg-oct14-socket`, port 56614, no TCP listener. Development security preflight passed. This does not validate hosted Supabase, hardware, or the latest UI changes.

The earlier restriction on physical-phone installation is historical; the latest explicit installation authorization above supersedes it. Preserve zero-cost behavior, logo01, no-demo policy and native Record-led design.

Historical stop: the user previously requested a handoff and stopped feature work. That stop was superseded by the subsequent resume authorization above. The earlier physical-phone installation restriction was superseded by the latest explicit user request above.

RIVL is a native Expo/React Native fitness app being expanded into a coherent fitness, exploration, health and nutrition product. It is NOT production complete and does not have full Strava parity. Many screens and adapters exist, but source implementation, simulator checks, hosted operation and physical-device verification are different statuses.

The user wants:

- A small, fast, feature-rich app; reuse suitable existing code and permissively licensed libraries without adding large unnecessary dependencies.
- Zero-cost operation wherever possible. Do not enable billing, paid AI or subscriptions without new authorization.
- One intuitive visual language based on RIVL’s Record page, informed by Strava’s interaction patterns. Preserve RIVL identity instead of shipping competitor assets.
- Google Maps as the primary map, nearby-area loading, an optional Mapbox fallback, natural spoken navigation and easy destination suggestions.
- Exploration and personal improvement as the distinctive experience, with useful activity highlights, story overlays and cosmetic rewards.
- No fake/demo community, activities, rankings, sensor data, health readings or nutrition facts.
- Large implementation batches before compilation. Use live refresh for ordinary JS/UI edits. Do not repeatedly compile the native app for small changes.
- Brief, candid updates. The user is frustrated by repeated verification loops and slow delivery.
- Physical installation was previously restricted. The user has now explicitly authorized installing the current build first; use the latest status above and do not infer success from build authorization.

The earlier stop-and-handoff request is historical; use the current workspace status above for the active state.

## 2. Earlier controls/loading state and resume point (historical)

### Latest work: shared buttons, selectors and full-screen loading

Implemented in source:

- Rounded outlined secondary buttons instead of filled dark rectangles.
- Coral active pill that slides between Overview/Analysis and other shared segmented options.
- Run/Ride/Walk/Hike choices with Lucide sport icons. All four fit the reviewed normal-size phone capture.
- Primary button radius 18; secondary and selector radius 24. Cards and fields retain the existing 14-unit treatment.
- Shared button, icon-button and list-row press feedback inside stable touch frames.
- Small shared content-switch motion; native navigation transitions remain native.
- Reduce Motion paths preserve meaningful state without spatial animation.
- Full-screen opaque theme-colored loading overlay, enlarged lightweight cycling/footsteps/navigation animation and “Continue while it loads.”
- Continue dismisses presentation of current visible requests without cancelling work. New work can show a new loader. Completion/unmount cleans up.
- Last task label remains during the modal exit instead of briefly switching to generic copy.
- Modal accessibility isolation moved to the entire overlay, including Continue. It was previously on the central content and hid the sibling button from accessibility automation.
- Maps location lookup, route opening/location/routing, nearby path discovery, initial account/preferences and interactive map loading use the full-screen presentation. Search suggestions and ongoing sensor scans remain inline.

Most recent independent review accepted the appearance but found one material lifecycle defect: inactive mounted screens could cover another page, and map blur/refocus could erase a prior Continue dismissal.

That correction is now implemented:

- `src/ui/loading-state.tsx` observes optional `NavigationContext` focus using `useSyncExternalStore`.
- Request registration follows actual `active` lifetime, independent of focus and label changes.
- Separate update calls change label/foreground eligibility.
- `src/domain/loading-jobs.ts` tracks background eligibility separately from dismissed IDs.
- Continue dismisses visible jobs only; background jobs are not accidentally suppressed.
- Blur/refocus preserves Continue for the same pending request; actual completion removes the identity.
- Google/Mapbox native and web renderers no longer fold focus into the request’s active flag.

### What remains for this batch

1. Obtain the final reviewer verdict on the lifecycle correction, with bounded evidence. Do not restart a general visual redesign.
2. Update `DESIGN.md` and `.impeccable/design.json` from the corrected implementation using the required documenter. They currently describe the preceding UI batch and explicitly say this newer control/loading phase is pending.
3. Make one useful navigation check if necessary; do not repeat the same timing-sensitive capture loop.
4. Record the actual limits of the result. Android, light appearance, large text, physical-device motion/audio and populated backend states are not certified by these captures.

### Verification — exact facts

- Latest TypeScript check passed.
- Latest unit run passed **185 tests across 36 files** using `npm test -- --maxWorkers=1`.
- New tests cover overlapping loading jobs, Continue without cancellation, new work after dismissal, foreground/background eligibility, suppression surviving blur/refocus, unrelated background requests and preventing ended jobs from being resurrected by updates.
- Earlier parallel test run timed out starting eight workers. A single-worker rerun completed in about 6–7 seconds. Do not characterize that earlier run as passing; use the later successful run.
- Native full-screen location flow passed: loader visible, Continue accessible/tappable, destination search available while work continued, eventual unavailable-location recovery.
- Settled native controls flow passed for Overview, Analysis, sport choices and planner.
- Latest focus-navigation flow was NOT a full pass. It showed the loader, tapped Continue, opened Progress without the overlay, returned to Maps and found destination search. It then failed an assertion that the location request was still pending. The real location request times out after 12 seconds and the driver consumed roughly that interval before the assertion. Screenshot showed a normal completed/unavailable-location state, not a trapped overlay. This is inconclusive evidence of same-request refocus suppression; unit tests cover the intended state behavior. Do not claim this native scenario passed.
- The simulator was returned to Progress after the check.

### Latest relevant files

- `src/ui/primitives.tsx`
- `src/ui/FullScreenLoading.tsx`
- `src/ui/loading-state.tsx`
- `src/ui/LoadingJourney.tsx`
- `src/domain/loading-jobs.ts`
- `tests/loading-jobs.test.ts`
- `src/ui/GoogleRouteMap.tsx` and `.web.tsx`
- `src/ui/MapboxRouteMap.tsx` and `.web.tsx`
- `src/ui/google-map-document.ts`
- `app/_layout.tsx`
- `app/(tabs)/maps.tsx`
- `app/route-planner.tsx`
- `app/auto-record.tsx`
- `.maestro/controls-finish.yaml`
- `.maestro/full-loading-location.yaml`
- `.maestro/loading-focus.yaml`

### Evidence and reviewer

- Current captures: `.impeccable/review/controls-oct14/` — `overview.png`, `analysis.png`, `sports.png`, `planner-loaded.png`, `full-loading.png`, `loading-dismissed.png`, `loading-finished.png`.
- Valid earlier unified batch: `.impeccable/review/unified-oct14/`.
- Latest focus test logs: `/private/tmp/rivl-loading-focus/.maestro/tests/2026-10-14_121032/`.
- Successful recovery logs: `/private/tmp/rivl-loading-recovery/.maestro/tests/2026-10-14_112623/`.
- Successful settled selector logs: `/private/tmp/rivl-controls-settled/.maestro/tests/2026-10-14_112707/`.
- Fresh reviewer agent: `/root/controls_loading_finish`, role `impeccable-finish-reviewer`. Its disposition was `fix` for the foreground-lifetime issue only. It was informed of the correction and passing tests, but no final correction verdict was obtained before the user requested this handoff.
- Prior `/root/unified_finish` review returned ship for its listed fixes only: Groups recovery, loading ground/motion and documentation. It does not approve all pages or the newer lifecycle correction.

## 3. Environment, simulator and builds

### Stack

- Expo 55, React Native 0.83.10, React 19.2, TypeScript, Expo Router.
- Native iOS and Android app architecture. Maps use embedded map renderers; the app itself is not a WebView shell.
- Encrypted SQLite/SQLCipher local data; Supabase adapters for cloud identity/data/social operations.
- Existing dependencies include Expo Location/Speech, HealthKit/Health Connect, BLE, notifications, sharing, SVG, native screenshots and secure storage.
- At last inspection this workspace was not a Git repository. Do not assume a branch, clean diff, commits or a remote exist.

### Current live simulator

- Device Hub app: `/Applications/Xcode.app/Contents/Applications/DeviceHub.app`.
- iPhone 18 Pro, iOS 27.
- UDID: `401F0520-128A-4353-9FF2-5423EEF334A8`.
- App identifier: `app.rivl.training`.
- Scheme: `rivl://`.
- Latest source was visibly running on this simulator. When the user said they could not see it, Device Hub was raised and `rivl://progress` opened; coral Overview and rounded controls were verified on screen.
- Other simulator entries exist, including iPhone 15 Pro / iOS 17.2. Do not confuse them with the updated iPhone 18 Pro instance.
- The connected physical phone may appear under the user’s nickname “Ramesh’s Oppo 5G,” but the device shown is an iPhone 15 / iOS 26.0.1.

### Live server and app

- Last known Metro session: 84397, port 8081, localhost dev client. Check whether it is alive before starting another server.
- Dev URL: `exp+rivl://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`.
- Cold opening that URL may first show the dev-client launcher; opening the same URL again connected the app. Do not mistake the launcher for the latest RIVL UI.
- Debug simulator app: `/private/tmp/rivl-derived-live/Build/Products/Debug-iphonesimulator/RIVL.app`.
- Fast Refresh was enabled. Source-only UI changes do not require another native build.
- Most recent native Debug rebuild was for a Watch bridge correction. It succeeded with `ENABLE_USER_SCRIPT_SANDBOXING=NO` on that build invocation only; no project-wide security setting was changed. Log: `/private/tmp/rivl-watch-build.log`.
- Historical phone provisioning expires 15 October 2026 according to prior installation records. Verify current signing before a future authorized install; do not silently reinstall now.

### Useful commands after resume

```sh
cd /Users/ojayitsinghtanwar/Desktop/rivl
npm run typecheck
npm test -- --maxWorkers=1
```

Only start Metro if necessary:

```sh
npx expo start --dev-client --localhost --port 8081
```

Open a known screen on the correct simulator:

```sh
xcrun simctl openurl 401F0520-128A-4353-9FF2-5423EEF334A8 'rivl://progress'
```

Use purpose-built native test tooling or CUA for UI checks. Do not interact with the physical phone as incidental testing. Leave the updated simulator visible when the user is reviewing it.

## 4. Product and visual contract

### Identity

- Preserve selected logo concept **01**, organic trail ribbons, and the associated RIVL app identity. The user rejected earlier logos and explicitly requested logo-design/brand skills.
- Do not regenerate the logo as unrelated polish. Alternate app icons are a future feature, not authorization to replace the selected main icon.
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `src/ui/theme.tsx` and `.impeccable/surfaces/record-system.md` are relevant.
- Latest user control direction overrides older documentation that gave every button a 14-unit corner.

### Whole-app interface requirements

- Home, Maps, Record, Groups and You remain the five primary tabs.
- Use Record’s typography, Ink/Coral palette, solid surfaces, drawn icons, readable numbers and clear actions throughout.
- Use flat meaningful groups and progressive disclosure. Avoid black rectangular text blocks and stacks of decorative cards.
- Gear must be easy to find: You → Gear, alongside Automatic recording and Devices & sensors. Settings must have a text label.
- Plan route, Add/Saved routes, Groups, Automatic start, Progress, Personal heatmap, Home and You were explicitly named for revamp.
- The same system must reach remaining details, activity analysis, sharing, navigation, account/auth, privacy/safety, notifications, people, challenges and leagues, and all new health/nutrition pages.
- Sport, period and analysis switches need selected state, icons where useful, press feedback, smooth interruptible transitions, adequate hit targets and Reduce Motion handling.
- Loading screens cover the entire screen for major initial work, with varied running/cycling/route motion and a way to continue. Never add fake delay just to display animation.
- Maps should look calm and stable, preserve camera while GPS updates, avoid flashing white in dark mode, preserve attribution and avoid reloading the renderer on each sample.
- Both themes, enlarged text, screen readers, small screens and Android still need bounded representative verification.

### Completed prior UI batch

Structural revisions exist for Home, You, Maps, Groups, route planner, routes, Automatic start, Progress, Heatmap, offline guidance, Gear, Settings, Devices and Watch. Fourteen dark iPhone entry-state captures passed. This is not proof that every populated screen and interaction is complete.

The existing Impeccable context script was already run once in this session; do not rerun it automatically. The direction is a user-pinned incumbent extension, not a new design-world exercise. No roll seed or approved image comp is claimed. Native HTML/CSS detector is not applicable; the reviewer uses native conventions. Required fresh reviewer/documenter steps may be used under the skill, but do not launch general parallel workers without authorization.

## 5. Status vocabulary for all features

- **Existing source:** implementation is present; inspect/reuse it before rebuilding.
- **Locally checked:** named unit, SQL, bundle or simulator checks passed; this does not establish physical or hosted operation.
- **Partial:** some intended behavior exists, but listed work remains.
- **Queued:** not delivered as an integrated user feature.
- **External gate:** requires credentials, entitlement, provider approval, actual hardware, rights, a valid data source or operational deployment. Continue independent work without pretending the gate is solved.

The following is the complete consolidated product backlog. Competitor names describe inspiration, not licensed access, a partnership, a verified current competitor specification or a requirement to copy their pricing tiers word for word.

## 6. Complete feature backlog — core fitness and activity management

### F01. Reliable activity recording — existing source, physical validation pending

- GPS recording for Run, Ride, Walk and Hike.
- Elapsed/moving time, distance, pace, average/current speed, splits and elevation gain/loss.
- Consistent km/h or mph alongside pace, including rides, navigation, analysis and stories.
- Start, pause, resume, auto-pause, lap, finish, review, save and discard.
- Atomic local sample/session journaling, restart recovery, interruption handling and account ownership.
- Screen-lock/background continuation for an already-started recording; verify on actual iPhone and Android.
- Validate GPS denial/revocation, stale/noisy fixes, gaps, long sessions, battery and memory.
- Do not derive official records from simulated/manual tracks or silently publish recordings.
- Main files: `src/services/recording.ts`, `recorder-engine.ts`, `src/domain/processing.ts`, `app/(tabs)/record.tsx`.

### F02. Automatic exercise detection — partial

- User explicitly wants automatic recording when exercise is detected, as automatic as practical.
- Current implementation is opt-in and starts after 90 seconds of sustained movement while RIVL is open.
- iOS Core Motion bridge rejects vehicle/unknown signals; Android remains a GPS-only selected-sport pilot.
- First detection interval is not a completed recording. Current UI explains foreground and battery limitations.
- Add/validate reliable activity classification, false-positive rejection, notification/review and cancellation.
- Closed-app automatic starts are not implemented. Investigate supported OS background mechanisms without promising unrestricted background execution.
- Keep detection consent separate from public sharing and preserve private review-before-save.
- Files: `app/auto-record.tsx`, `src/domain/exercise-detection.ts`, `src/services/motion.ts`, `auto-record-preferences.ts`, `modules/rivl-motion/`, `docs/AUTOMATIC-RECORDING.md`.

### F03. Activity history and management — partial

- Owner-scoped history with performant paging and search/filtering.
- Edit title, notes, perceived effort and privacy without rewriting recorded measurements.
- Existing edit flow uses serial writes, atomic cloud/outbox enqueue and rejects stale revisions.
- Effort edits update duration-RPE load; measured HR load remains based on readings.
- Complete delete/recovery behavior and removal from rankings, public projections, heatmaps and exploration where applicable.
- Add coherent manual activities; mark provenance and exclude them from GPS-verified competition/exploration awards.
- Validate restart, sync conflicts, offline edits and large histories.
- Files: `app/history.tsx`, `activity-edit.tsx`, `activity/[id].tsx`, `src/domain/activity-edit.ts`, store/repository/sync modules.

### F04. Import/export and portability — partial

- Bounded GPX route import and route/own-activity export exist.
- Complete activity import preview, malformed/oversized input handling, duplicate detection, timezone/timestamp handling and sport mapping.
- FIT and TCX import/export remain open; use suitable reviewed libraries only where needed.
- Account data export/archive should include inventory and explicit scope.
- Preserve gaps, source provenance and privacy choices in exports.
- Media import should strip unnecessary EXIF/location metadata and use bounded dimensions/file sizes.
- Files: `src/domain/gpx.ts`, `src/services/gpx.ts`, `account-data.ts`, `media.ts`, `media.web.ts`.

### F05. Gear — existing local implementation

- Shoes and bikes, names/types, initial mileage, default equipment, per-activity assignment.
- Add/edit, retire/restore, mileage and activity count.
- Gear failure must not prevent saving an activity.
- Private owner-scoped encrypted local records; account deletion covers gear and assignments.
- Cloud gear sync and large-history completeness remain to implement/validate.
- Files: `app/gear.tsx`, `src/domain/gear.ts`, `src/services/gear.ts`, `gear-repository.ts`.

## 7. Complete feature backlog — competition and social

### C01. Automatic verified segment efforts — worker source exists, hosted operation pending

- Match actual eligible tracks to versioned segment geometry, direction and sport.
- Reject incomplete overlaps, poor accuracy, inappropriate speeds, gaps, pauses and privacy-cut geometry.
- Lease/retry/idempotency, immutable provenance and source/algorithm revisions.
- Client cannot write verification flags or create official results directly.
- Recompute/retract on source edits, privacy changes, deletion, moderation and geometry changes.
- Deploy `supabase/functions/process-segments` with server-only worker secret and a bounded trusted scheduler.
- Validate hosted two-account RLS, raw-track handling, queue leases, backlog, retries and moderation.
- GPS consistency is not proof against spoofing. Add review signals, appeals and correction handling before claiming trusted global competition.
- Files: `supabase/functions/_shared/segment-verification.ts`, `process-segments/index.ts`, migrations/tests, `src/services/segment-rankings.ts`.

### C02. Full leaderboard filters and comparison — partial

- Global/overall, friends, age, weight, gender, club, historical dates, rolling periods and custom timeline pairs.
- Age/weight consent and current visibility must be rechecked server-side; do not expose private demographic values.
- Gender filtering is still outstanding. Add optional consented profile/filter modeling without inventing user demographics.
- Current segment history migration applies date bounds BEFORE selecting an athlete’s best effort.
- Compare best efforts between periods with missing-data handling and clear improvement/time units.
- Preserve the current cap: up to 250 returned athletes; do not label the comparison an exhaustive global improvement ranking.
- Local results remain owner-only, explicitly unverified and cannot award official crowns.
- New files: `src/domain/segment-history.ts`, `src/services/segment-history.ts`, `app/segments.tsx`, migration `202610140001_segment_history.sql`.
- This ninth migration passed local SQL checks but has NOT been verified as deployed to the hosted project.

### C03. Local Legend / repeated-effort competition — source added, hosted validation pending

- Rolling 90-day distinct eligible activity count, deterministic ties, current public verified efforts only.
- Version/visibility/participation/block/moderation/deletion checks.
- Retract crown eligibility when a source becomes private or invalid.
- No crown for local unverified/simulated data.
- Finish populated remote UI, server worker/scheduler and operational verification.

### C04. Social community — adapters/screens exist, end-to-end work remains

- Public activity feed with actual route summaries, descriptions and photos.
- Follow/friend discovery, requests/acceptance, profiles and authorized activity visibility.
- Kudos/reactions and comments with reliable optimistic/retry states.
- Club discovery/join/leave/member activity; coherent Groups hub.
- Real notifications and Realtime updates with account-scoped caches.
- Report/block/moderation and private-by-default projections.
- No fake people, posts or rankings to populate empty screens.
- Files: `app/(tabs)/community.tsx`, `people.tsx`, `notifications.tsx`, `src/services/social.ts`, `community.ts`, `remote.ts`.

### C05. Challenges, badges and leagues — partial

- Public distance/elevation challenges, explicit joining, progress and earned trophies/badges.
- Personal weekly targets and exploration missions usable without a large network.
- Real club leagues: seasons, sport/eligibility, enrollment windows, scoring formula, tie-breakers, withdrawal and score history.
- Versioned score ledger derived from eligible activities; duplicate events must not double-score.
- Corrections/deletions trigger recalculation; explain each score contribution.
- Separate personal-improvement contests from raw volume rankings.
- Files: `app/challenges.tsx`, `leagues.tsx`, `src/domain/competition.ts`.

### C06. Ghost racing and richer comparisons — partial

- Existing ghost baseline uses average moving pace of the target activity.
- Add route-position/distance matched replay against own prior effort or an authorized friend/segment effort.
- Preserve pauses/gaps; reject wrong-direction/different routes and sports.
- Respect revoked visibility and privacy-redacted routes.
- Do not imply current average-pace ghost is a full route-matched live competitor.

## 8. Complete feature backlog — advanced analysis and training

### A01. Activity analysis — substantial source exists, verify integrations

- Pace, speed, heart rate, elevation and power charts linked to map position.
- Arbitrary chart-range selection with range stats and highlighted map section.
- Recorded laps, lap inspection and detailed comparisons; kilometre/mile splits.
- Measured time-weighted power curves through long durations, excluding discontinuities.
- FTP-based power zones, 25-watt distribution and watts/kg with clear weight provenance.
- Historical power comparison currently bounded to the latest 50 eligible powered activities; explain that scope.
- Do not estimate absent measured power or bridge sensor gaps.
- Files: `src/domain/power-analysis.ts`, `activity-chart.ts`, `activity-ranges.ts`, `src/services/power-history.ts`, `app/activity/[id].tsx`.

### A02. Relative effort, strain, zones and fitness/freshness — partial

- Transparent effort/load calculation using measured heart-rate time where available and duration/RPE fallback otherwise.
- Daily/weekly cumulative strain, training history and fitness/fatigue/form trends.
- Current HR zone calculation uses maximum heart rate; configurable custom zone boundaries/methods remain a next gap.
- Let athletes see which data and method produced a score; unknown/missing readings remain unknown.
- Make historical recalculation/version policy explicit when zone settings change.
- Files: `src/domain/processing.ts`, `analytics.ts`, `app/progress.tsx`, `app/settings.tsx`.

### A03. Plans and adaptive coaching — queued/partial foundation

- Original structured training plans and interval sessions, targets, reminders and completion history.
- Adapt upcoming workload after missed sessions, travel or reported limitations, with conservative explanations and athlete control.
- Use real load/recovery inputs; do not fabricate readiness or diagnose injuries.
- Coach should explain computed facts and data quality, not imply a validated personalized medical prescription.
- Optional conversational assistance must respect zero-budget preference and explicit data-sharing consent.
- Existing `src/services/coach.ts` and route-intent parsing are starting points, not a full AI health coach.

### A04. Original recovery and guided content — queued

- RIVL-owned warm-up, mobility, recovery, cooldown, strength and mindfulness routines.
- Original audio walk/run/interval guidance with optional licensed or user-controlled music.
- Candidate workout categories from the wishlist: HIIT, strength, yoga, Pilates, kickboxing, dance, core, cycling, rowing, treadmill walk/run and mindful cooldown. Build useful original sessions incrementally; no claim of thousands of studio videos.
- Recover Athletics, Les Mills, Apple celebrity stories and partner libraries are not included without rights/agreements.

## 9. Complete feature backlog — maps, routes and navigation

### M01. Google Maps primary map — implemented with prototype configuration

- Google Maps renderer across Record, Maps, planner, saved routes, activity, navigation, exploration, heatmaps and community previews.
- Google Places destination suggestions in a dropdown/list with useful names and location context.
- Walking/cycling route choices, alternatives and external Google Maps handoff.
- Nearby initial viewport, bounded overlays, retained camera during GPS changes, follow pause on manual pan and explicit recenter.
- Unknown location shows a locate/search state instead of loading a world overview.
- Do not confuse map viewport loading with downloading the world to disk.
- Current locally configured Google Demo Key is prototype/quota-limited; no production billing was enabled. Handle quota/network failure honestly.
- Verify current provider terms and credential restrictions before production. Never copy keys into handoff files or logs.
- Files: `src/ui/GoogleRouteMap*`, `google-map-document.ts`, `src/domain/google-maps.ts`, `src/services/route-location.ts`, `app/map-search.tsx`.

### M02. Optional Mapbox fallback — source integrated, no live token

- Shared controller can switch only for eligible device/user/open-map geometry after actual Google failure or missing configuration.
- Google/unknown place provenance remains on Google; do not silently move restricted provider content to another map.
- Disclose active fallback and provide Retry Google; retain provider attribution.
- Uses CDN GL JS rather than a second native SDK to control size.
- No Mapbox token is configured/live-validated. Public token validation rejects secret tokens.
- Assess free allowance/licensing at activation; do not enable a paid plan by assumption.
- Files: `src/ui/RouteMapController.tsx`, `MapboxRouteMap*`, `mapbox-map-document.ts`, `src/domain/map-provider.ts`.

### M03. Route builder and saved/add route pages — partial

- Intuitive Strava-informed route composition using RIVL controls, map taps/stops, search, undo, reverse, sport and save.
- Durable local drafts and route outbox/sync; explicit straight/unverified geometry when not routed.
- Saved route library, import/export, edit/delete and offline availability.
- Navigate an existing route forward/reverse; map-selected detours/ways around a route.
- Suggested loops with distance/sport controls; personalize toward unexplored territory and community popularity when eligible data exists.
- Route surface/terrain metrics remain incomplete: pavement/gravel/trail, access, climb profile and unknown-data coverage need honest source-backed summaries.
- User said revamp Plan route and Add route before new features; preserve those priorities.
- Files: `app/route-planner.tsx`, `routes.tsx`, `suggested-routes.tsx`, `src/domain/route-planning.ts`, `src/services/route-planning.ts`, `route-repository.ts`.

### M04. Path discovery and infrastructure — partial

- On-demand mapped walking/cycling paths around selected/current area.
- Current public path discovery is bounded near 1.2 km, with limits around 500 ways / 20,000 vertices and incomplete coverage disclosure.
- Preserve mode restrictions and conditional/private access conservatively.
- User asked for paths in every city: build scalable local discovery, not a claim of complete worldwide coverage.
- Improve route finding, disconnected-graph handling and mode-safe alternatives.
- Distinguish dedicated tracks, marked lanes, shared roads and unknown infrastructure when reliable data supports it.
- Files: `src/services/path-network.ts`, `src/domain/offline-routing.ts`, `infrastructure-warning.ts`.

### M05. Spoken navigation — foreground implementation exists

- Destination entry and suggestions, route alternatives, turn instructions, left/right cues, off-route state and rerouting.
- Saved-route following, reverse direction, detours and fallback to stored directions/path network where supported.
- Earphone-friendly natural speech, selectable/previewable voice, mute/repeat and audio interruption handling.
- Current implementation uses installed phone voices, prioritizes enhanced English voices and filters novelty voices.
- User requested Kitten TTS 2 or a better natural voice. No Kitten integration is delivered. Evaluate quality, license, offline runtime, model download size, latency/battery and cost before choosing an alternative; native enhanced voices remain the no-cost baseline.
- Cautious infrastructure prompts such as “mapped cycling infrastructure cannot be confirmed.” Absence of map data is not proof of no lane, no footpath, danger or legal access.
- Complete background/locked-screen navigation and physical headphone/audio routing verification; current guidance is foreground-only.
- Files: `app/navigate.tsx`, `src/services/navigation-voice.ts`, `src/domain/navigation.ts`, `navigation-stops.ts`, `infrastructure-warning.ts`.

### M06. Offline use — partial geometry/guidance, no full tile packs

- Encrypted bounded downloaded road/path geometry and route instructions exist.
- Separate walking/cycling networks; connected-path fallback declines disconnected/out-of-area requests.
- Current retained areas are bounded; older implementation retained five areas. Confirm current constants before changing product copy.
- Full offline basemap packs with labels/terrain are NOT implemented. Google basemaps in this implementation require connectivity.
- A future offline source needs compatible licensing, region selection, size estimates, quotas, pause/resume, update/delete controls and attribution.
- Do not bulk download public tiles or claim saved geometry is a complete offline map.
- Files: `app/offline-maps.tsx`, `src/services/offline-maps.ts`, `src/domain/offline-routing.ts`.

### M07. Replay and 3D — intentional scope change

- Keep flat 2D activity replay tied to recorded timestamps, including relative pauses and speed changes.
- User later explicitly requested removing the 3D Flyover option. It is retired; `app/flyover.tsx` is an old-link redirect.
- MapLibre/terrain dependencies were removed. Do not restore 3D because older roadmap documents describe it as implemented/requested.
- This is a superseded requirement, not an unfinished feature to re-add.

### M08. Personal/community heatmaps and Wanderer-style exploration — partial

- Personal route density and history.
- Artistic exploration atlas: fine route-following blue/coral ribbons, not blocky visible reward tiles.
- Latest outing distinguishable from older traces; preserve GPS gaps and bounded rendering.
- Community popularity aggregation requires real opt-in, privacy-filtered data. Existing coarse cells require multiple distinct athletes; do not display fabricated global popularity.
- Make exploration a central product loop: territory coverage, new ground, streaks, weekly quests, badges, levels and cosmetic/story unlocks.
- Current rewards use approximate 150 m cells internally; display does not need blocky squares.
- Core recording, navigation and safety must remain available; cosmetic rewards should not lock safety features.
- No rewards from demos/simulations. Handle corrections/deletions consistently.
- Files: `app/heatmap.tsx`, `app/(tabs)/maps.tsx`, `src/domain/exploration.ts`, `heatmap.ts`, `src/services/popularity.ts`, `.impeccable/surfaces/explore-atlas.md`.

### M09. Community mapping of dedicated tracks — explicitly queued for later

- Let consenting walkers/riders contribute evidence of running/cycling infrastructure.
- GPS traces alone cannot prove separation from a main road.
- Combine map topology, repeated independent traces, accuracy/distance confidence and optional user evidence with moderated review.
- Distinguish proposed, unverified, corroborated and approved infrastructure.
- Remove private endpoints; do not publish raw precise traces by default.
- Explain coverage/confidence, allow corrections/reports and prevent road-adjacent false claims.
- Build after the core mapping/fitness work, not before the current UI/segment/analysis priorities.

## 10. Complete feature backlog — sharing, safety, devices and accounts

### S01. Activity story sharing — source exists, broader validation pending

- 9:16 story cards plus transparent PNG overlays usable over the user’s photos.
- Distance, time, pace, speed in km/h or mph, elevation and route artwork.
- Privacy-redacted trace: start/finish and configured privacy zones removed.
- Export/share with native sheet and clear preview; validate images on real devices and downstream apps.
- Cosmetic story styles can unlock through exploration.
- Files: `app/story.tsx`, `src/services/media.ts`, related exploration/share docs.

### S02. Map highlights after exercise — source exists

- Fastest sustained 30-second stretch, largest climb over 30 seconds and highest recorded altitude where valid samples exist.
- Different colors on the map with understandable icons/labels and selected-highlight state.
- Add useful segment/split comparisons without false precision; GPS elevation is an estimate.
- Never invent a highlight for missing/insufficient samples.
- File: `src/domain/activity-highlights.ts` and activity detail integration.

### S03. Beacon-like safety sharing — partial/needs integration validation

- Up to three user-selected safety contacts.
- Deliberate opt-in before sharing precise live location; visible sharing status and stop control.
- Expiring/revocable session link, last-update time, stale/offline state and recipient access rules.
- Phone and supported Watch integration.
- SMS via explicit system composer is a possible zero-cost user action; automatic delivery needs a real service. Do not claim sending/delivery from a local screen.
- Verify background sharing behavior, expiry, revocation, account deletion and no unauthorized recipient access.
- Existing `src/services/safety.ts` is a starting point; inspect its actual current behavior before claiming end-to-end safety operation.

### D01. Bluetooth sensors — native source exists, physical checks pending

- Heart-rate and cycling-power pairing, readings, freshness, disconnect/reconnect and owner-bound recording enrichment.
- Cadence or other supported sensor fields only when supplied/implemented accurately.
- Permission denial, Bluetooth off, connection loss, multiple sensors, stale readings and battery usage.
- Do not show stale readings as live.
- Files: `app/devices.tsx`, `src/services/sensors.ts`, `src/domain/sensor-measurements.ts`.

### D02. Apple Watch — companion/bridge source exists, hardware checks pending

- Watch GPS/heart-rate workout recording, pause/lap, durable transfer, owner validation and import acknowledgement.
- Saved route preview and future navigation/safety integration.
- Validate paired/unpaired/uninstalled/unreachable states and account-switch/delete behavior.
- Recent bridge fix sends context only when supported, activated, paired and the Watch app is installed; latest owner/logout context is still persisted and sent on later activation/state change.
- Physical Watch exercise, locked-screen behavior, offline transfers, duplicates, deletion and pairing changes remain unverified.
- Files: `targets/watch/RIVLWatchApp.swift`, `modules/rivl-watch/ios/RivlWatchModule.swift`, `src/services/watch.ts`, `src/domain/watch-workout.ts`, `app/watch.tsx`.

### D03. Device ecosystem — external gates

- Garmin Connect workout delivery/import, Fitbit, Coros and other supported partners.
- Live Segments and supported Watch route delivery.
- Use provider-approved APIs/OAuth and document permissions/revocation; do not impersonate unavailable integrations with logos/buttons.
- Prefer platform health imports or file imports where direct partner access is unavailable.

### D04. Live sensor workout overlay — queued

- Heart rate, calories/energy estimates and interval countdown over an active guided workout.
- Phone/tablet first; Apple TV/external display requires its own supported target or delivery mechanism.
- Synchronize timestamps and clearly distinguish missing/stale sensor readings.
- Do not claim Apple TV support merely because a phone overlay exists.

### D05. Anonymous effort comparison / Burn Bar-like feature — queued

- Only compare the same original workout/session protocol with real opt-in aggregate data.
- Minimum cohort/privacy thresholds, transparent normalization and no invented anonymous competitors.
- Missing cohort produces a meaningful personal-effort view, not fake averages.

### U01. Accounts, login and cloud sync — partial

- Local device account remains usable offline and without cloud setup.
- Free Supabase project exists and optional email cloud accounts are connected.
- Google and Apple sign-in source/PKCE callback exist; provider buttons remain disabled until provider configuration and validation are complete.
- Validate email confirmation, sign-in/out, account switching, callback errors, credential storage, upload/download, retries and conflict handling.
- Google/Apple OAuth configuration and Apple service entitlements are separate from having a Supabase project.
- Files: `app/auth.tsx`, `auth-callback.tsx`, `src/services/provider-signin.ts`, `src/domain/oauth-callback.ts`, `sync-engine.ts`, `supabase.ts`.

### U02. Add-ons — mixed queued/external

- Alternate app icons consistent with logo01.
- Localized weather snapshots; WeatherKit is requested but requires verified entitlement/configuration. Evaluate a legitimate no-cost alternative if unavailable.
- Original RIVL recovery content, as above.
- Partner discount codes only from actual agreements; no invented codes or bundled third-party subscriptions.

## 11. Complete feature backlog — health and recovery (after core fitness)

### H01. Health foundation and automatic imports — partial foundation

- Owner-scoped encrypted health/wellness records, edit/delete, chronological history and account deletion coverage.
- Opt-in HealthKit/Health Connect ingestion; supported device workout history.
- Daily steps, stairs/flights, active energy, resting/current heart rate, HRV, heart-rate recovery, exercise minutes and standing time where supplied.
- Environmental sound levels only from an authorized supported source; no covert continuous microphone recording.
- Background/periodic refresh within platform limits; display last synchronization and data source.
- Deduplicate overlapping sources and avoid double-counting imported workouts and phone recordings.
- Existing health logic includes daily HRV baseline weighting and sleep-source overlap handling; inspect tests before replacing it.
- Files: `src/services/health.ts`, `health.web.ts`, `health-types.ts`, `health-enrichment.ts`, `wellness-repository.ts`, `src/domain/wellness.ts`, `tests/health.test.ts`, `wellness.test.ts`.

### H02. Intuitive health dashboard and insights — queued integrated UI

- Dashboard entries requested in the screenshot: Sleep, Resting heart rate, Steps, Weight, Fasting, Water intake and Bowel movements.
- Organize insights into understandable overview/trends, longer-term wellness and Browse/detail sections, inspired by Insights/Longevity/Browse.
- Fit within the existing RIVL navigation; do not add an unexplained competing navigation system.
- Clear empty/permission/unavailable/stale states and direct entry to manual logs or import setup.

### H03. Sleep — partial data foundation, richer UI queued

- Total duration, bedtime/wake time, nightly timeline and restlessness/disruptions where actually available.
- Core/REM/Deep/awake stages only from supported source records.
- Proposed 100-point quality breakdown: duration 50, consistency 30, disruptions 20, only if implemented transparently with sufficient data and explicit missing-data handling. It is a product score, not a clinical diagnosis.
- Monthly/30-day patterns and optional original sleep-profile labels/coaching; do not imply a validated competitor algorithm or copy branded animals.
- Historical trends, source conflicts, timezone changes and overnight date boundaries.

### H04. Daily readiness and recovery trends — queued

- Explain available sleep, recent HRV/resting HR and activity/load trends.
- Require adequate baseline and freshness; show insufficient data instead of arbitrary scores.
- Clear factors, uncertainty and manual override of planned training.
- No diagnosis, injury prediction or guarantee that an athlete is safe to train intensely.

### H05. Health age / longevity — research gate

- User requested an estimate comparing health metrics to chronological age.
- No validated biological-age model is integrated. Do not create a numerical age from arbitrary thresholds.
- Deliver useful longitudinal trends first. Any age estimate needs an appropriate validated model, input coverage, calibration, limitations and review.
- No claim that RIVL measures actual biological age merely by combining sleep/steps/HRV.

### H06. Manual health logs — queued integrated flows

- Water/hydration, weight, blood pressure and bowel records.
- Menstrual cycle tracking with privacy-sensitive storage and export/deletion controls.
- Medication schedules/reminders and taken/skipped history; no prescribing or dose recommendations.
- Fasting start/stop/history with optional user-selected windows, not medical prescriptions.
- Useful units, edit/delete, timestamps, timezone handling, configurable reminders and no fabricated defaults.

### H07. Movement goals and gamification — queued/partial fitness foundation

- Daily active energy, exercise minutes and standing hours from valid available sources.
- RIVL-styled ring/progress presentation; personal goals, streaks and optional peer challenges.
- Standard step/cardio activity-point concept can be based on documented guidelines, but no WHO partnership branding or endorsement without an agreement.
- Avoid double-counting workout energy and imported total energy.
- User controls targets and reminders; missing standing-time data must remain unavailable.

### H08. Health vault and EHR connections — external/provider gate

- Permission-based health records and source history.
- Regional clinic/lab EHR sync only through supported interfaces and explicit consent.
- Provider availability, authentication, record normalization, revocation/export/deletion and security need actual integration work.
- Do not claim universal clinic access or create synthetic lab results.

### H09. Device-generated health alerts — external/validation gate

- High/low heart-rate, irregular rhythm/AFib and loss-of-pulse notifications were requested.
- Only surface validated supported device/platform events with correct provenance and permissions.
- Do not infer AFib or loss of pulse from GPS, gaps, generic BLE values or an unvalidated algorithm.
- RIVL must not promise emergency monitoring or guaranteed alert delivery.

### H10. Conversational health/nutrition coach — queued, cost/privacy gate

- User wants conversational questions, summaries of records and meal feedback.
- Start with transparent local fact summaries and original guidance.
- Optional AI service needs explicit data scope, privacy, budget controls, validated typed outputs and graceful offline failure.
- TypeSafe was requested earlier and exists as an optional route-intent path, not a delivered general health coach.
- Google Gemini or another branded provider is not mandatory; use the best feasible authorized no-cost approach and do not promise free unlimited inference.
- Photo/text meals are estimates requiring user confirmation, not medical advice.

## 12. Complete feature backlog — nutrition (after health)

### N01. Food diary — queued

- Breakfast, Lunch, Dinner and Snacks, with date navigation, add/edit/delete and repeat/recent foods.
- Portions in grams and sensible serving units; preserve source serving conversions.
- Daily calories and macronutrient totals; configurable calorie target and percentage or exact-gram macro goals.
- Owner-scoped storage, offline persistence, account deletion and export.
- No fake seeded meals presented as the athlete’s history.

### N02. Food search and reliable database — queued, data-source decision required

- Search whole foods and branded products with clear source/provenance and serving size.
- Choose a legitimate public/licensed database; handle duplicates, inconsistent units and missing nutrients.
- Do not copy competitors’ proprietary databases or claim a million vetted entries without verified source coverage and rights.
- Cache bounded recent results for speed/offline use; do not bundle a huge unnecessary database into the app.

### N03. Free barcode scanning — queued

- Camera UPC/EAN lookup into the chosen food source.
- Permission denial, unsupported/no-result barcode and manual-entry fallback.
- User confirms serving amount before adding to diary.
- Keep scanning free in RIVL’s intended feature model.

### N04. Micronutrients and targets — queued

- Vitamins, minerals, lipids and amino-acid profiles where provided by the source.
- Custom macro/micronutrient targets and caps with units and provenance.
- Unknown values must not be converted to zero.
- Do not advertise “84 nutrients” until actual database/normalization coverage supports it.
- Avoid unsafe automatic supplement/dose advice from apparent logging gaps.

### N05. Reports and export — queued

- Rolling 7-day averages and historical daily/weekly/monthly trends.
- Custom nutrient/chart views, missing-data/coverage indicators and printable/exportable reports.
- History should not be arbitrarily limited to seven days in the data model.
- Validate energy/portion arithmetic, timezone boundaries, incomplete days and user edits.

### N06. Voice/photo meal logging — queued, model/cost gate

- Natural voice description and food-photo parsing into editable ingredient/portion estimates.
- Show uncertainty, source matches and editable quantities before saving.
- No silent automatic diary writes or claims of exact calories from a picture.
- Microphone/camera/photo privacy, bounded media processing, offline/manual fallback and explicit external upload consent.

### N07. Recipe creation and URL import — queued

- Manual ingredients, servings, preparation notes and per-serving nutrient calculation.
- Import recipe URL into a proposed ingredient list, then require review of amounts/servings/matches.
- Treat external pages as untrusted content; bounded fetch/parser, unsupported-site fallback and source attribution.
- Do not reproduce unrelated copyrighted article text or invent missing nutrition data.

### N08. Fasting engine — queued integrated feature

- Start/stop timer, history and optional custom windows such as 12:12, 14:10 or 16:8 chosen by the user.
- Integrate timing with food-log graphs and reminders.
- Persist correctly across app restarts/time changes and allow correction.
- Present as tracking, not a prescribed medically appropriate schedule for everyone.

### N09. Macro scheduler — queued

- Different goals for training/cycling days, rest days and chosen weekdays.
- Optional meal-specific exact-gram targets.
- Show which schedule applies today, allow override and preserve historical targets for reports.

### N10. Seven-day meal planner and groceries — queued

- User preferences, dietary constraints, available ingredients and chosen goals.
- Original/reusable meal plans, recipe serving adjustment and consolidated grocery list.
- Meal-prep steps and checkable/synchronizable grocery items.
- Instacart/Walmart or other delivery integration requires actual supported APIs and explicit purchase authorization; not a prerequisite for useful free planning.

### N11. Nutrient food suggestions — queued

- Suggest actual foods from the selected database that contribute nutrients underrepresented in the current log.
- Account for incomplete logging, source coverage, user preferences/allergies and serving size.
- Do not equate a single day’s logged shortfall with a diagnosed deficiency.

### N12. Health/partner synchronization and ad-free workflow — queued

- Supported step/energy imports and weight updates with explicit direction, conflict and duplicate policy.
- Permissions and revocation by data type; prevent sync loops.
- Keep diary/scanning/planning free of banner/programmatic advertising.
- Preserve explicit distinction between measured activity energy, estimated energy and user-entered intake.

## 13. Backend, credentials, security and operations

### Current external configuration

- An optional free Supabase project was created previously. Eight earlier migrations were applied according to the October 12 record and a public read endpoint returned HTTP 200.
- This is NOT proof of full Auth/Storage/Realtime/sync/worker operation.
- Ninth migration `202610140001_segment_history.sql` is locally checked; hosted deployment/verification remains pending.
- Segment worker and recurring scheduler are not deployed/operated end to end.
- Google Demo Key is configured in ignored local environment configuration. Prototype only; do not publish its value.
- Mapbox public token is absent. Google/Apple OAuth providers are not fully configured/validated.
- User previously pasted a password in chat. Do not repeat, store in handoff, log or hard-code it. No secret values belong in this file.

### Feature flags and server-side spending

- `src/services/config.ts` owns public configuration lookup.
- Relevant names include `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_BASE_URL`, `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `EXPO_PUBLIC_GOOGLE_SIGNIN_ENABLED`, `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED`.
- Optional TypeSafe route parsing has client and server spending gates; keep paid behavior disabled under the zero-cost constraint.
- `TYPESAFE_API_KEY`, `RIVL_TYPESAFE_SPENDING_ENABLED` and `RIVL_SEGMENT_WORKER_SECRET` must remain server-only where applicable. Never put service-role or worker secrets in the client.
- Inspect current code/settings without dumping environment values into outputs.

### Existing security work to preserve

- Owner scoping, secure credential storage, encrypted local database and native file protection.
- Atomic writes, retry/idempotent sync, bounded remote decoding and safe error surfaces.
- Endpoint/privacy-zone redaction including sparse edges crossing zones.
- Public sharing consent, age/weight cohort consent, block/moderation/deletion checks.
- Account deletion across local data, raw tracks, media, public projections and queued work.
- Production deletion retries, moderation operations, public deletion/support/privacy flows and dependency review remain release work.
- Historical dependency audits had upstream advisories; rerun a current audit before release rather than treating old counts as current.
- No production-ready claim based only on development preflight.

### SQL evidence

Nine migration/policy suites passed in a disposable local PostgreSQL 17/PostGIS fixture, including segment history date bounds, private-effort crown retraction and anonymous denial. This was not hosted Supabase validation.

Scratch database was stopped. Its directory was `/private/tmp/rivl-pg-oct14`, socket `/private/tmp/rivl-pg-oct14-socket`, port 56614, with no TCP listener. Recreate safely if needed rather than assuming it still runs.

## 14. REA, references and cleanup

- User requested Reverse Engineer Anything for Strava where useful; use it only for specific shipped-artifact/runtime questions, not ordinary source analysis.
- Strava package/reference inventory exists under `artifacts/references/strava/`; see `docs/STRAVA-REA-INSPECTION.md`.
- Official screenshot references cover public examples, not every authenticated/subscription screen.
- Package/class/method inspection succeeded previously; wider UI/runtime investigation remains unfinished.
- Do not copy proprietary assets/code into RIVL or claim complete reverse engineering.
- Keep the acquired package while there is a concrete outstanding investigation. Delete acquired test packages after the investigation is complete, as the user requested, but do not delete the user’s installed apps/accounts as incidental cleanup.
- Do not reinstall unrelated competitor apps merely to keep exploring style.

## 15. Implementation order after the user resumes

1. Close only the pending shared loading lifecycle review/documentation; no new style workshop or repeated whole-app screenshot cycle.
2. Check current source/hosted state and finish verified segment history/filter/Local Legend deployment and operational integrity. Gender filter remains a concrete source gap.
3. Finish advanced analysis gaps, especially configurable HR zones, coherent load/strain explanations and remaining populated analysis validation.
4. Complete route surface metadata, robust route alternatives/detours, offline guidance and appropriate offline-map provider decision.
5. Complete deliberate safety sharing and validate real Watch/BLE recording/navigation. Keep unavailable partner integrations explicitly gated.
6. Original interval/training/recovery features and remaining consistent UI pages.
7. Community track contribution system after the core mapping/fitness work, with confidence/moderation and privacy.
8. Integrated health dashboard, consented imports, manual logs, sleep/readiness/movement goals and supported original guided experiences.
9. Nutrition diary/database/barcode/targets first; then reports, recipes, fasting, macro scheduling and meal planning; optional photo/voice/AI only with valid cost/privacy design.
10. Representative physical-device and hosted end-to-end release checks; install only when the user authorizes it.

Dependencies may justify building independent local pieces while an external gate remains unavailable. Do not spend days waiting on a provider before building the remaining authorized local product. Do not mark externally blocked features complete.

## 16. Definition of done and delivery discipline

A feature is complete only when its actual user flow works, real data/provenance and account boundaries are correct, failure/empty/loading states are usable, relevant tests pass, its UI matches the shared system, and any required hosted/hardware behavior is verified or explicitly excluded from the delivered scope.

For efficient continuation:

- Read this file and the relevant source first; do not repeat broad discovery already recorded here.
- Batch related code changes, then typecheck and run appropriate tests once. Use single-worker Vitest on this machine to avoid the observed startup stalls.
- Rebuild native only for native dependency/configuration/module changes, not every UI edit.
- Use bounded representative native capture batches. Do not repeatedly assert a transient loader remains visible after a real request has already completed.
- Separate product bugs from test timing. The latest 12-second location test is an example: slow driver steps exhausted the real wait.
- Finish-review corrections should be narrow. After the final correction, document what actually shipped.
- Keep screenshots and verification scope honest; a dark empty iPhone screen does not approve Android, large text, populated remote data or physical Watch behavior.
- Never add production delays, fake workouts or demo users to make screenshots convenient.
- Keep the live updated simulator identifiable and visible to the user. Restore their review page after automated navigation.
- Provide short progress updates with completed work and the next concrete gap, not repeated promises that everything is almost done.

## 17. Documentation index and precedence

Current source and the latest dated evidence take precedence over older historical prose. Several older documents still mention removed MapLibre/3D, demo fixtures or missing capabilities that later gained source code.

- `docs/FEATURE-EXPANSION.md`: consolidated active sequence and chronological implementation notes.
- `docs/EXPLORATION-AND-SHARING.md`: stories, exploration, Google demo configuration, OAuth status and newer offline/replay behavior.
- `docs/MAPS-AND-UI-REFRESH.md`: Google maps, stable camera and RIVL differentiation.
- `docs/STRAVA-EXPANSION.md`: October 10 source/backend work; its 3D section is superseded.
- `docs/FEATURE-COVERAGE.md`: broader roadmap and acceptance criteria; historical gap wording needs current-source reconciliation.
- `docs/IMPLEMENTATION-STATUS.md`: historical evidence with a current warning banner, not an authoritative all-features-complete list.
- `docs/RECORDING-AND-ROUTES.md`, `docs/AUTOMATIC-RECORDING.md`, `docs/NAVIGATION-AND-ANALYSIS.md`: component history and limits.
- `docs/IPHONE-LIVE-EDITS.md`, `docs/IOS-VALIDATION.md`: simulator/phone workflow.
- `docs/PRODUCTION-SECURITY-GUIDE.md`: security/deployment work.
- `docs/STRAVA-REA-INSPECTION.md`: competitor artifact investigation.
- `.impeccable/surfaces/record-system.md`: latest user-pinned interface contract.
- `.impeccable/surfaces/explore-atlas.md`, `maps-refresh.md`, `fitness-expansion.md`: specific surface context.

Original broad feature attachment:
`/Users/ojayitsinghtanwar/.codex/attachments/9dfe0872-e4e7-4980-86bc-9b870c68845a/Pasted text.txt`

Earlier copy:
`/Users/ojayitsinghtanwar/.codex/attachments/3d74d6dd-a066-4cb6-bb35-7c9f46b1e592/Pasted text.txt`

Treat competitor prices, affiliations, clinical capability and feature descriptions in those attachments as user-supplied inspiration requiring verification if discussed as current facts.

## 18. Ready-to-use continuation prompt

Read `/Users/ojayitsinghtanwar/Desktop/rivl/HANDOFF.md` and the relevant current source. Continue the RIVL project only within my latest authorization. Preserve the zero-cost preference, logo01, Record-led UI and no-demo policy. Do not install on my physical iPhone unless I ask. First close the narrowly pending loading lifecycle review/documentation, then implement substantial batches in the feature order recorded here. Reuse existing implementations, distinguish local/source evidence from hosted/hardware delivery, and avoid repeated simulator/compile loops. Keep updates short and tell me precisely which features now work and which remain.
