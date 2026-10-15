# RIVL feature coverage roadmap

Updated 10 October 2026. This is a product roadmap, not a claim of complete Strava parity. The goal is to cover the core jobs athletes use Strava for, then make RIVL better at evidence-based coaching, measurable progression and fair competition. Strava's paid feature list and supported sport types are useful moving baselines; they change over time and do not define RIVL's entire scope: [subscription features](https://support.strava.com/en-us/articles/15402044-what-features-are-included-in-a-strava-subscription) · [supported sport types](https://support.strava.com/en-us/articles/15402005-what-sport-types-does-strava-support).

## How to read status

- **Implemented; locally checked** means code exists and the documented local unit/integration or SQL checks passed. It does not establish operation in a deployed service or on a physical phone.
- **Implemented; native/cloud validation pending** means adapters, native modules or server policies exist, but the corresponding real device or hosted environment has not been verified.
- **Gap** means the described user capability is missing, partial, fixture-backed or materially different from the intended product behavior.

The current baseline is 125 passing tests across 23 files, eight locally checked SQL migrations and suites, development security preflight and successful iPhone simulator / Apple Watch target compilation. Recording recovery and the new feature-screen walkthrough have simulator evidence. Hosted services, physical devices and Android remain unverified. See [the latest expansion and its limits](STRAVA-EXPANSION.md), [implementation evidence](IMPLEMENTATION-STATUS.md), and [iOS validation](IOS-VALIDATION.md). Local evidence is not production approval.

The roadmap below retains the intended acceptance criteria. The expansion now implements segment-worker code and cohort queries, deeper power/range/lap analysis, terrain rendering, personal density, bounded path downloads, route suggestions, Bluetooth HR/power and watch companion code. Read STRAVA-EXPANSION.md before treating older gap wording as the current inventory. Full offline tile packs, direct Garmin delivery, hosted operation and physical-device validation are still gaps.

## Working foundation

RIVL already has native activity recording and recovery paths, local SQLite journaling, route planning and durable route edits, private-by-default settings and route redaction logic, activity processing and analytics, history and progress views, health-data adapters, social/feed and route-library adapters, clubs/challenges, segment and league screens, reporting/blocking/deletion code, and a coach that narrates computed facts. The implementation docs describe the limits of the verification. In particular, development fixtures are not real community data; displayed segments/leaderboards do not imply an automatic server verifier; and a coach narration is not itself a validated training recommendation.

## Ordered roadmap

Each step names a concrete result and acceptance evidence. Keep real athlete data private by default, make sync retryable and idempotent, and keep estimates and development fixtures visibly labeled throughout.

### 1. Close the validation loop on recording, accounts and cloud

**Why first:** Later features depend on trustworthy activity records and identity boundaries.

**Work:** Resolve the current iOS password-prompt accessibility issue in Maestro and complete signup, recording, pause/resume, restart recovery, save, detail, account cleanup and route flows. Run on a physical iPhone with screen lock, permission changes and extended recording; run Android equivalents. Deploy a disposable Supabase project and exercise Auth, RLS, Storage, Realtime, account deletion and report/block workers end to end. Configure operational retries and moderator handling before enabling these flows for real users.

**Data flow:** native recorder → durable local journal → idempotent sync queue → owner-scoped activity/raw-track storage → redacted social projection → Realtime refresh. Deletion must cover local and remote copies, media and queued work.

**Accept when:** named simulator and physical-device scenarios pass; interrupted sessions recover without losing committed samples; account A cannot read or mutate account B data; privacy-zone edits republish the expected public route; deletion is confirmed across all stores and retries after a simulated worker failure. Report simulator, device and hosted-service evidence separately.

### 2. Make activity management and data portability complete

**Gap:** History and sync exist, but indexed local paging, robust imports/exports, manual activities and editing/deleting saved activity details remain incomplete.

**Work:** Add owner-scoped edit, delete/undo and manual-entry flows; page large local histories; implement bounded GPX/FIT/TCX import with validation, duplicate detection and timestamp/time-zone handling; implement GPX/FIT/TCX export and account archive export. Strip image EXIF/location metadata on import and give the athlete an explicit choice before attaching media.

**Data flow:** import file → size/format validation → parse into canonical samples and sport-specific summary → preview/warnings → local transaction → normal sync. Export from the athlete's canonical record with privacy settings applied; archive export includes an inventory and clear date range.

**Accept when:** malformed, oversized, duplicate and timezone-boundary files produce safe actionable errors; imported totals match a known fixture; edits survive restart and sync races; deleting an activity removes it from personal and social projections; exports round-trip within documented precision and never expose a private route beyond user settings.

### 3. Produce verified segment efforts and fair rankings

**Gap:** Segment discovery and ranking interfaces exist, but the server does not automatically process and verify uploaded efforts. Current demo rankings can be fixture-backed.

**Work:** Version segment geometry and sport/eligibility rules; build a server worker that matches eligible activity tracks against segments, accounts for direction, GPS quality, pauses and privacy zones, and stores derived efforts with provenance. Prevent clients from writing verification results. Add anti-abuse review signals and a correction/appeal path before public rankings. Clearly label provisional and verified results.

**Data flow:** private raw track upload → server-only matching job → eligibility/quality checks → immutable effort candidate with algorithm version → review/status transition → leaderboard query. Only verified efforts count toward official ranks or awards.

**Accept when:** SQL and worker tests cover reversed direction, partial overlap, sparse/noisy GPS, pauses, privacy-zone cuts, duplicate sync and edited/deleted source activity; client attempts to forge effort status fail; repeated processing is idempotent; a known set of tracks yields deterministic results and auditable provenance. Do not award standings from development fixtures.

### 4. Turn leagues into real competitions

**Gap:** League enrollment and scoring are not a real end-to-end system; the current screen ranks available improvements.

**Work:** Define league season, sport, eligibility, enrollment window, scoring formula, tie-breakers, privacy rules and withdrawal behavior. Store membership and score snapshots server-side; derive scores only from eligible verified activities. Add standings history and explain every score contribution. Keep personal improvement leagues separate from raw-volume leaderboards.

**Data flow:** athlete opts in → server records season membership → verified eligible activity event → versioned scoring worker → immutable score ledger → standings/read model. Recalculate on source correction with an audit trail.

**Accept when:** concurrent enrollment is safe, duplicate events do not double-score, withdrawals stop future inclusion, corrected/deleted efforts trigger bounded recalculation, and two clients see the same standings. Product copy explains scoring and data visibility before joining.

### 5. Add route-matched ghost racing and segment comparisons

**Gap:** Existing ghost racing compares average moving pace for a target activity; it is not a route-position-matched friend ghost.

**Work:** Align activities by route distance and direction, preserve GPS gaps, interpolate safely, and compare pace/speed at matching positions. Let the athlete choose a prior effort or consented friend's eligible activity. Add segment-specific comparison and clear handling for mismatched routes and sports.

**Data flow:** selected private/authorized activity pair → normalized distance samples with discontinuities → aligned pace deltas and split projections → local comparison visualization. Friend route access follows current visibility and redaction rules.

**Accept when:** synthetic tracks with different sampling rates, pauses and date-line crossings align within a stated tolerance; gaps are shown rather than bridged; wrong-direction or materially different routes are rejected; users can revoke friend visibility and the comparison disappears.

### 6. Finish maps: density, offline tiles and turn guidance

**Gap:** The personal map overlays prior routes; there is no density heatmap or offline tile cache. Foreground turn guidance, spoken prompts and route rerouting now work for a searched destination, but background/lock-screen guidance and physical earphone validation remain. Route planning and path lookup require managed providers for scale.

**Work:** Build privacy-filtered activity density aggregation at suitable zoom levels; add downloadable bounded map regions with storage management and map attribution; support route-following guidance with reroute/off-route indicators, voice/haptics and battery-aware location sampling. Add explicit offline route and tile availability states.

**Data flow:** eligible visible activities → privacy filtering before aggregation → zoom-bucketed density tiles; map download request → licensed tile provider → bounded local cache; saved route → offline route geometry → location matcher → guidance events.

**Accept when:** density never reveals private starts, finishes or zones; tile cache enforces size/expiry and provider terms; a downloaded route remains legible offline after app restart; guidance tolerates GPS gaps and does not claim turn-by-turn availability without route instructions; locked-screen and battery behavior pass physical-device trials.

### 7. Expand the training and coaching product

**Gap:** RIVL has analytics and a fact-narrating coach, but structured plans, adaptive progression and performance-progression evidence are not complete.

**Work:** Add athlete goals, baseline/experience context, weekly availability and preferred sports; create editable plans with sessions, target ranges, rest and recovery weeks; let users mark completion and record session RPE. Coach explanations must cite the athlete's observed data, distinguish measured facts from estimates, avoid invented readiness, and let users correct the inputs. Introduce progression indicators only when enough comparable history exists.

**Data flow:** consented health/activity signals → quality and recency checks → transparent trend calculations → plan suggestion with assumptions → athlete approval/edit → calendar sessions → completion/RPE → progression review. Keep medical advice and unsupported predictions out of the product.

**Accept when:** sparse, stale or conflicting data yields an explicit insufficient-evidence state; rest days remain represented; every recommendation exposes its inputs and uncertainty; plan edits do not silently rewrite history; coach output is checked against adversarial and boundary fixtures and reviewed by qualified training experts before broad release.

### 8. Complete social groups and club operations

**Gap:** Feed, reactions, comments, friendships, route saves, challenges and membership adapters exist, but real hosted behavior is unverified and club detail, events and messaging are incomplete.

**Work:** Validate existing cloud adapters first. Add club profiles, roles, join/invite controls, event creation/RSVP/capacity/time-zone handling and moderation. Prefer event threads or activity comments over open-ended direct messaging unless abuse reporting, blocking, retention and deletion are ready. Respect private profiles and activity visibility in every query and notification.

**Data flow:** authenticated command → authorization/RLS → durable event → account-scoped cached read model → Realtime invalidation; reports feed a moderator queue. Notifications carry minimal sensitive content and honor user controls.

**Accept when:** membership role changes take effect immediately, blocked users cannot interact through alternate endpoints, event times survive DST changes, reports reach an operable review queue, and hosted tests prove every visibility combination across feed, search, club, event and notification surfaces.

### 9. Broaden sensors, sports, equipment and safety

**Gap:** HealthKit/Health Connect adapters need device validation. Watch companion, Bluetooth sensor pairing, third-party imports, broad sport-specific metrics, gear tracking and richer safety sharing are not complete.

**Work:** Prioritize watch recording/remote controls and HR/cadence sensors; document supported sport types and metric availability rather than implying all sports have equivalent analytics. Add gear assignment and distance/time maintenance with athlete-controlled reminders. Add live location sharing only with explicit time-bounded consent, visible sharing state and one-tap stop. Build provider import integrations only after reviewing availability, rate limits, scopes and duplicate ownership behavior.

**Data flow:** platform sensor/provider → permission and provenance record → normalized sport-specific samples → quality checks → activity processing → athlete-visible source attribution. Safety sharing expires server-side even if a client goes offline.

**Accept when:** each sensor is tested across disconnect/reconnect and background conditions; unsupported metrics stay absent rather than fabricated; gear totals reconcile after activity edits/deletions; safety shares expire on the server and have clear recipient/revocation behavior; provider failures never erase the canonical local activity.

### 10. Polish sharing, accessibility and release readiness

**Gap:** Text sharing and route artwork exist; native share-card export and full accessibility/visual review remain open. Store and production gates are tracked separately in the implementation docs.

**Work:** Create privacy-safe activity/route share cards with preview and explicit redaction; complete VoiceOver/TalkBack, Dynamic Type, contrast, localization and motion review; finish dependency and device profiling; configure production credentials, map quotas, support/privacy disclosures and store deletion flows.

**Accept when:** share previews match exported images and omit hidden data; screen-reader journeys complete all core tasks; large text does not truncate critical controls; physical devices meet agreed recording battery and map performance budgets; the release owner records each operational/store gate as passed without turning a local test into a production claim.

## RIVL product bar

Feature breadth alone is not a differentiator. Every added analytics or competition feature should meet three bars:

1. **Evidence-based coaching:** show the data, time window, assumptions and uncertainty behind a statement; use an insufficient-evidence state when the history cannot support it.
2. **Measurable progression:** track comparable efforts and athlete-chosen goals over time, preserve history, and distinguish observed change from prediction.
3. **Fair ranking:** use server-derived eligible efforts, published rules, repeatable scoring, privacy-aware participation and a correction path. Never let a client or demo fixture silently award an official result.

Use these bars during product review and acceptance. They are product requirements, not proof that the current implementation already meets them.
