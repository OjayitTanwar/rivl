# Hosted backend, without an always-on computer

RIVL uses hosted Supabase Auth, PostgreSQL/PostGIS, private Storage, Realtime and Edge Functions. The phone talks directly to these services. No home computer needs to stay on.

## Free plan boundaries

As checked on 14 October 2026, Supabase Free includes 50,000 monthly active users, a 500 MB database, 1 GB file storage and 5 GB uncached egress. Projects can pause after a week of inactivity; automatic backups are not included. These are provider policies, not a promise of free service forever. GPS traces/media and chatty feed queries can reach limits long before the login allowance.

Sources: [pricing](https://supabase.com/pricing), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

Keep the project on Free, monitor usage and reduce optional uploads before capacity is exhausted. Do not enable billing or fabricate traffic to bypass pausing. Maintain portable migrations and export/restore procedures so a provider change does not trap the app.

## Setup

1. Create or use a Supabase **Free** project. Store admin credentials only in server/dashboard secrets.
2. Use the Supabase CLI's migration runner to apply **all** files in `supabase/migrations` in order. Never use `scripts/sql/local-bootstrap.sql` on a hosted database: it is only a disposable fixture.
3. Configure Auth redirects `rivl://auth-callback` and the deployed app's required redirects. Email confirmation exchanges PKCE codes at this callback. Confirm mail delivery to actual users; the built-in mail service is not a production delivery guarantee. Configure OAuth only for providers actually registered and tested.
4. Deploy the functions in `supabase/functions`. The worker endpoints verify their own long random bearer secrets; `verify_jwt=false` does not make them public-access workers. Configure `RIVL_DELETION_WORKER_SECRET` and `RIVL_SEGMENT_WORKER_SECRET` server-side, then operate bounded scheduling using those secrets. A scheduler is still a deployment task; merely uploading functions does not process queued retries.
5. Configure only the HTTPS URL and public anon/publishable key in the app's `.env`, then build. RLS authenticates the actual athlete. Never bundle a service-role key.
6. Run the read-only reachability check:

```sh
npm run backend:check
```

This requests Auth settings and zero-row table headers. It does not create accounts, fetch user records, test login, establish policy isolation, verify functions/migrations or inspect billing.

## Gates before calling it reliable

Use two dedicated test accounts for confirmation/sign-in/session refresh, sign-out/account switch, activity upload retry, friend acceptance, clubs/comments/reactions, private-data isolation, blocking/reporting and deletion. Verify database policies with the SQL suites on a disposable migrated database. Run worker retries, backup/restore and quota checks. Test Creator Studio and GPS contributions separately.

Deployed project: **`xsfxptlnmcxtrsudjkdq`** (`rivl`, ap-south-1, free plan), deployed 15 October 2026 — 13 migrations, four edge functions, the two custom-scheme redirect URLs, and both worker secrets. The env files still point at the older `vcbglcugsitmvlujwual`, which is not manageable by the deploying account; repointing is a user decision because the old project may hold real accounts and workouts.

Password recovery and an OAuth-compatible reauthentication path for account deletion now exist in source (15 October 2026). The reset email and the deletion email both flow through hosted Supabase auth; the redirect URLs are now configured on the deployed project, but email deliverability, the 8-digit `auth.email.otp_length` setting and two-account end-to-end flows are still unverified. Worker scheduling is still a deployment task: uploading `process-deletions` and `process-segments` does not process queued work until a scheduler calls them with the worker secrets.
