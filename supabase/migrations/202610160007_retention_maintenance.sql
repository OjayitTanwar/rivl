begin;
create table rivl_private.maintenance_state(id boolean primary key default true check(id),last_run timestamptz);
insert into rivl_private.maintenance_state(id)values(true);
revoke all on rivl_private.maintenance_state from public,anon,authenticated,service_role;
create function rivl_private.maintain_retention()returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare removed integer:=0;n integer;
begin
 if not pg_try_advisory_xact_lock(73725199021035)then return 0;end if;
 if exists(select 1 from rivl_private.maintenance_state where last_run>now()-interval '1 day')then return 0;end if;
 -- Independent of optional reconstruction budget: revocation and expiry still
 -- progress when the queue is empty, saturated or a map provider is unavailable.
 removed:=public.prune_track_contributions(200);
 delete from public.track_corridors where id in(select id from public.track_corridors where expires_at<=now()order by expires_at limit 100);
 get diagnostics n=row_count;removed:=removed+n;
 delete from public.track_osm_ways where way_id in(select way_id from public.track_osm_ways where expires_at<=now()order by expires_at limit 200);
 get diagnostics n=row_count;removed:=removed+n;
 delete from public.track_mapping_jobs where activity_id in(select activity_id from public.track_mapping_jobs where state in('done','failed')and retry_at<now()-interval '7 days'order by retry_at limit 200);
 get diagnostics n=row_count;removed:=removed+n;
 -- Live session expiry is already enforced at reads; remove expired latest
 -- points and recipient grants as well, using only the known table if present.
 if to_regclass('public.live_shares')is not null then
  execute 'delete from public.live_shares where id in(select id from public.live_shares where expires_at<=now()order by expires_at limit 200)';
  get diagnostics n=row_count;removed:=removed+n;
 end if;
 if to_regclass('cron.job_run_details')is not null then
  execute 'delete from cron.job_run_details where runid in(select d.runid from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname=$1 and d.end_time<now()-interval ''7 days'' order by d.runid limit 2000)'using 'rivl-workers';
 end if;
 update rivl_private.maintenance_state set last_run=now()where id=true;
 return removed;
end $$;
revoke all on function rivl_private.maintain_retention()from public,anon,authenticated,service_role;
-- Scheduler activation is an operator step. Hosted migration roles may not own
-- cron.job, so keep this migration independent of pg_cron administration.
commit;
