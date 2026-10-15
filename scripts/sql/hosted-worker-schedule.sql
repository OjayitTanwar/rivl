-- Run as the database owner AFTER applying all migrations and securely adding
-- these Vault secrets: rivl_worker_project_url, rivl_deletion_worker_secret,
-- rivl_segment_worker_secret. Worker secrets must match hosted Edge secrets.
-- Never paste credentials into a migration, cron command or committed file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Stable job name makes activation idempotent. This is queue processing, not a
-- keep-alive: an empty queue makes no outbound request or Edge invocation.
select cron.schedule('rivl-workers', '*/2 * * * *',
  'select rivl_private.dispatch_workers();');
