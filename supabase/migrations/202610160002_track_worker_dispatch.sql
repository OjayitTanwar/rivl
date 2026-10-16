begin;
-- Reuse the already provisioned bounded GPS worker credential; no new secret,
-- cron job, raw GPS upload, paid service or background keep-alive is created.
alter table rivl_private.worker_dispatch drop constraint worker_dispatch_worker_check;
alter table rivl_private.worker_dispatch add constraint worker_dispatch_worker_check check(worker in ('deletions','segments','tracks'));
create or replace function rivl_private.dispatch_workers() returns integer
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
    union all
    select 'tracks', 'process-track-mapping', 'rivl_segment_worker_secret'
    where exists(select 1 from public.track_mapping_jobs j where j.attempts<5
      and ((j.state='pending' and j.retry_at<=now())
        or (j.state='processing' and j.locked_at<now()-interval '5 minutes')))
      and exists(select 1 from public.track_mapping_budget b where b.id=true
        and (b.day<>current_date or b.claims<100))
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
      body := '{}'::jsonb, timeout_milliseconds := 85000
    ) into request_id;
    insert into rivl_private.worker_dispatch as d(worker,requested_at,request_id)
      values(worker.name,now(),request_id)
      on conflict(worker) do update set requested_at=excluded.requested_at,request_id=excluded.request_id;
    dispatched := dispatched+1;
  end loop;
  return dispatched;
end $$;
revoke all on function rivl_private.dispatch_workers() from public,anon,authenticated,service_role;
comment on function rivl_private.dispatch_workers() is 'Admin-only queue dispatch: deletions, segments and bounded community mapping. Empty queues make no outbound call. Mapping is capped at 100 claims/day.';
commit;
