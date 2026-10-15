-- Hosted scheduler support. No job, extension or credential is enabled by a
-- migration alone: see scripts/sql/hosted-worker-schedule.sql for activation.
begin;
create schema if not exists rivl_private;
revoke all on schema rivl_private from public,anon,authenticated,service_role;
create table rivl_private.worker_dispatch (
  worker text primary key check(worker in ('deletions','segments')),
  requested_at timestamptz not null,
  request_id bigint not null
);
revoke all on rivl_private.worker_dispatch from public,anon,authenticated,service_role;
create function rivl_private.dispatch_workers() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare
  target text;
  worker record;
  token text;
  request_id bigint;
  dispatched integer := 0;
begin
  -- One transaction wins even if an administrator manually overlaps cron.
  if not pg_try_advisory_xact_lock(73725199021031) then return 0; end if;
  if not exists(select 1 from pg_extension where extname='pg_net')
     or not exists(select 1 from pg_extension where extname='supabase_vault') then return 0; end if;
  select decrypted_secret into target from vault.decrypted_secrets where name='rivl_worker_project_url';
  if target is null or target !~ '^https://[a-z0-9]{20}\.supabase\.co$' then
    raise exception 'RIVL worker URL is not configured';
  end if;
  for worker in
    select 'deletions'::text as name, 'process-deletions'::text as endpoint,
      'rivl_deletion_worker_secret'::text as secret_name
    where exists(select 1 from public.account_deletions d where d.state<>'completed'
      and d.retry_after<=now() and (d.lease_until is null or d.lease_until<now()))
    union all
    select 'segments', 'process-segments', 'rivl_segment_worker_secret'
    where exists(select 1 from public.segment_processing_jobs j where j.attempts<5
      and ((j.state='pending' and j.retry_at<=now())
        or (j.state='processing' and j.locked_at<now()-interval '5 minutes')))
  loop
    if exists(select 1 from rivl_private.worker_dispatch d where d.worker=worker.name
      and d.requested_at>now()-interval '110 seconds') then continue; end if;
    select decrypted_secret into token from vault.decrypted_secrets where name=worker.secret_name;
    if token is null or length(token)<32 or length(token)>200 then
      raise exception 'RIVL worker credential is not configured';
    end if;
    select net.http_post(
      url := target || '/functions/v1/' || worker.endpoint,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || token),
      body := '{}'::jsonb, timeout_milliseconds := 55000
    ) into request_id;
    insert into rivl_private.worker_dispatch as d(worker,requested_at,request_id)
      values(worker.name,now(),request_id)
      on conflict(worker) do update set requested_at=excluded.requested_at,request_id=excluded.request_id;
    dispatched := dispatched+1;
  end loop;
  return dispatched;
end $$;
revoke all on function rivl_private.dispatch_workers() from public,anon,authenticated,service_role;
comment on function rivl_private.dispatch_workers() is
  'Admin-only bounded dispatch: at most one deletion and one segment invocation per two minutes, only while eligible jobs exist. Credentials are read from Vault.';
commit;
