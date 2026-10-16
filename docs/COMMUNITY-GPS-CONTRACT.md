# Community GPS pilot source contract

Latest, 16 October 2026: the contribution foundation and new mapped-path reconstruction are deployed to the dedicated hosted RIVL backend. See COMMUNITY-TRACK-MAPPING-PLAN.md for the exact bounded scope, hosted checks and remaining unmapped-path work. Historical “nothing deployed” statements below refer to the original 14 October pilot.


Implemented in source on 14 October 2026. This is a bounded observed-use pilot, not a completed infrastructure-mapping service. Nothing was deployed to hosted Supabase. No real community observations or simulated app data were added.

## Collection and sync

New genuine device/watch running, cycling, walking and hiking recordings may prepare a conservative redacted evidence fragment. The automatic setting defaults on; an existing cloud-disabled preference is preserved. The local durable outbox contains only activity identity, revision, origin, preference/deletion generations, retry state and acknowledgement. No second raw GPS upload is created. Recording/watch integration atomically stores the reference with the activity; cloud contribution flushing follows activity sync.

Local history is limited to 200 recent receipts/backlog entries. Acknowledged old receipts may be pruned; pending submissions and withdrawals are retained. A full unacknowledged backlog declines new enrollment instead of dropping old intent. Ten work items per flush and bounded exponential retries avoid unbounded network work. Opt-out cancels uncommitted references through durable withdrawals; previously acknowledged observations remain until the separate deletion action, source deletion/revision, zone change or expiry. Preference and deletion generation snapshots reject stale recording commits after disable/re-enable. Owner/session cleanup guards stop asynchronous writes from restoring account data during deletion.

No automatic historical backfill, file import, manual source or demo source is enrolled by the recording lifecycle. Device/watch origin is an authenticated client declaration; there is no hardware GPS attestation. Malicious clients and multiple accounts can manufacture apparent support. Five owners are not five verified people.

## Trusted server processing

`202610150001_community_tracks.sql` reads the already private owner activity track. It checks ownership, current source/preference revisions, account freeze and moderation; validates bounded coordinates, timestamps, accuracy and segments; preserves temporal/source gaps; rejects impossible sport speeds; applies endpoint and privacy-zone exclusion on the server again. Intermediate consecutive same-cell observations are compacted; gaps never become infrastructure edges. Private retained evidence is only coarse cell identities and a UTC observation day.

The pilot projects fixed approximately 222 m latitude grid cells, not an individual's route or an infrastructure centerline. Entire cells must clear endpoint/privacy-zone exclusion with a conservative cell-radius buffer. Public cells require at least five distinct owner accounts and observations on three UTC dates. These are heuristics, not calibrated confidence, legal access or safety guarantees. Counts, contributor IDs, activity IDs, individual timestamps and sport/time filters are absent from public output.

The indexed projection uses a stable spatial query bucket, a 1.2 km bucket-center radius, a maximum of 200 cells and fixed next-day cache expiry. It intentionally provides incomplete bounded coverage. Mapped OSM path identity, type, access and license provenance remain separate; community GPS does not upgrade a road or cycleway into protected infrastructure. There is no automatic OSM editing.

Source revisions and privacy-zone changes retract old contributions through triggers; activity/account deletion cascades remove retained evidence. Public reads recompute support so withdrawal below threshold removes the public cell. Account deletion requests and hidden activities are excluded immediately. Service-only owner quarantine prevents publication and ingestion until review; clients cannot read or override it. Reasons are bounded to abuse, privacy, suspected spoofing and review completion. Moderator operational access and reporting UI are not deployed.

Expiry is 90 days. Submission cleans expired rows for the current owner. `prune_track_contributions(limit)` is a service-only bounded sweep for all expired data; **hosted rollout must schedule this sweep**, verify authenticated gateway behavior, quotas/rate limits and revocation cache behavior before production use. A local PostgreSQL replay does not prove any of those operations.

## Verification

Sixteen repository/adapter unit tests cover atomic-reference preparation, retries, stale revisions, opt-out acknowledgement loss, deletion generations, owner purge, history limits, malformed public reads and safe server errors. Transactional PostgreSQL/PostGIS fixtures cover minimum corroboration, private-table isolation, ownership, preferences, deletion/revision/zone retraction, moderation and pending account deletion. Eleven migrations and eleven SQL suites passed in a fresh disposable local database; final accumulator optimization passed the community suite again. The test server was stopped afterward.

Precise corroborated path geometry, map matching/topology, infrastructure review, contribution reports, abuse calibration, offline snapshots and hosted maintenance remain additional work described in `COMMUNITY-TRACK-MAPPING-PLAN.md`.
