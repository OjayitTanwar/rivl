begin;
alter table public.segments add column revision integer not null default 1 check(revision>0);
alter table public.segment_efforts
  add column source_revision integer,
  add column segment_revision integer,
  add column algorithm_version text,
  add column start_ms bigint,
  add column end_ms bigint,
  add column quality jsonb,
  add column weight_group integer;
-- Existing unproven results are not official algorithm-checked efforts.
update public.segment_efforts set verified=false where algorithm_version is null;
create table public.segment_processing_jobs(
  activity_id uuid primary key references public.activities on delete cascade,
  owner_id uuid not null references public.profiles on delete cascade,
  revision integer not null,
  state text not null default 'pending' check(state in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  lease uuid, locked_at timestamptz,
  retry_at timestamptz not null default now()
);
alter table public.segment_processing_jobs enable row level security;
revoke all on public.segment_processing_jobs from anon,authenticated;
grant all on public.segment_processing_jobs to service_role;
create index segment_jobs_pending on public.segment_processing_jobs(retry_at) where state in ('pending','processing');

create function public.enqueue_segment_activity(p_id uuid) returns void
language plpgsql security definer set search_path=public,extensions as $$
begin
  delete from segment_efforts where activity_id=p_id;
  insert into segment_processing_jobs(activity_id,owner_id,revision)
  select id,owner_id,revision from activities where id=p_id
  on conflict(activity_id) do update set revision=excluded.revision,state='pending',attempts=0,lease=null,locked_at=null,retry_at=now();
end $$;
revoke all on function public.enqueue_segment_activity(uuid) from public,anon,authenticated;
create function public.queue_segment_source() returns trigger
language plpgsql security definer set search_path=public,extensions as $$
begin
  if tg_table_name='activities' then perform enqueue_segment_activity(new.id);
  else perform enqueue_segment_activity(new.activity_id); end if;
  return new;
end $$;
create trigger segment_activity_changed after insert or update of revision,visibility,sport on public.activities for each row execute function public.queue_segment_source();
create trigger segment_track_changed after insert or update of samples,points on public.activity_tracks for each row execute function public.queue_segment_source();
create function public.queue_segment_privacy() returns trigger
language plpgsql security definer set search_path=public,extensions as $$
declare owner uuid; aid uuid;
begin
  owner:=case when tg_op='DELETE' then old.owner_id else new.owner_id end;
  for aid in select id from activities where owner_id=owner loop perform enqueue_segment_activity(aid); end loop;
  return null;
end $$;
create trigger segment_privacy_changed after insert or update or delete on public.privacy_zones for each row execute function public.queue_segment_privacy();
create trigger segment_settings_changed after insert or update of settings on public.athlete_settings for each row execute function public.queue_segment_privacy();
create function public.queue_segment_geometry() returns trigger
language plpgsql security definer set search_path=public,extensions as $$
declare aid uuid;
begin
  if tg_op='UPDATE' then new.revision:=old.revision+1; end if;
  delete from segment_efforts where segment_id=new.id;
  for aid in select a.id from activities a join athlete_settings s on s.owner_id=a.owner_id
    where a.visibility='public' and s.settings->>'segmentParticipation'='true'
  loop perform enqueue_segment_activity(aid); end loop;
  return new;
end $$;
create trigger segment_geometry_changed before insert or update of path,sport on public.segments for each row execute function public.queue_segment_geometry();

create function public.claim_segment_job() returns table(activity_id uuid,owner_id uuid,revision integer,lease uuid)
language plpgsql security definer set search_path=public,extensions as $$
declare job public.segment_processing_jobs;
begin
  update segment_processing_jobs set state='failed',lease=null,locked_at=null where attempts>=5 and state='processing' and locked_at<now()-interval '5 minutes';
  select * into job from segment_processing_jobs j where
    ((j.state='pending' and j.retry_at<=now()) or (j.state='processing' and j.locked_at<now()-interval '5 minutes'))
    and j.attempts<5 order by j.retry_at for update skip locked limit 1;
  if not found then return; end if;
  update segment_processing_jobs j set state='processing',attempts=j.attempts+1,lease=extensions.gen_random_uuid(),locked_at=now()
    where j.activity_id=job.activity_id returning * into job;
  return query select job.activity_id,job.owner_id,job.revision,job.lease;
end $$;
create function public.segment_job_input(p_activity uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare a public.activities; tr public.activity_tracks; prefs jsonb; candidates jsonb; areas jsonb; footprint extensions.geography;
begin
  if not exists(select 1 from segment_processing_jobs where activity_id=p_activity and lease=p_lease and state='processing' and locked_at>now()-interval '5 minutes') then return null; end if;
  select * into a from activities where id=p_activity;
  select * into tr from activity_tracks where activity_id=p_activity and owner_id=a.owner_id;
  select settings into prefs from athlete_settings where owner_id=a.owner_id;
  if a.visibility<>'public' or coalesce(prefs->>'segmentParticipation','false')<>'true' or tr.activity_id is null then
    return jsonb_build_object('sport',a.sport,'public',false,'optedIn',false,'raw',null,'segments','[]'::jsonb,'privacy','[]'::jsonb);
  end if;
  if tr.encoding<>'delta-e7-ms-v1' then raise exception 'Unsupported track encoding'; end if;
  select extensions.st_collect(extensions.st_setsrid(extensions.st_makepoint((p->>'lng')::float8,(p->>'lat')::float8),4326))::extensions.geography
    into footprint from jsonb_array_elements(tr.points) p;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'sport',s.sport,'points',
    (select jsonb_agg(jsonb_build_object('lat',extensions.st_y(d.geom),'lng',extensions.st_x(d.geom)) order by d.path)
      from extensions.st_dumppoints(s.path::extensions.geometry) d))), '[]'::jsonb)
    into candidates from (select * from segments s where s.sport=a.sport and extensions.st_dwithin(s.path,footprint,100) order by s.id limit 201) s;
  select coalesce(jsonb_agg(jsonb_build_object('lat',extensions.st_y(center::extensions.geometry),'lng',extensions.st_x(center::extensions.geometry),'radius',radius)),'[]'::jsonb)
    into areas from privacy_zones where owner_id=a.owner_id;
  return jsonb_build_object('sport',a.sport,'public',true,'optedIn',true,'raw',tr.samples,'segments',candidates,'privacy',areas);
end $$;
create function public.complete_segment_job(p_activity uuid,p_lease uuid,p_revision integer,p_efforts jsonb,p_algorithm text) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare a public.activities; job public.segment_processing_jobs; prefs jsonb; effort jsonb;
begin
  select * into job from segment_processing_jobs where activity_id=p_activity for update;
  select * into a from activities where id=p_activity for update;
  if job.state<>'processing' or job.lease is distinct from p_lease or job.revision is distinct from p_revision or a.revision is distinct from p_revision or job.locked_at<now()-interval '5 minutes' then return false; end if;
  if p_algorithm<>'gps-corridor-v1' or jsonb_typeof(p_efforts)<>'array' or jsonb_array_length(p_efforts)>200 then raise exception 'Invalid worker result'; end if;
  select settings into prefs from athlete_settings where owner_id=a.owner_id;
  delete from segment_efforts where activity_id=p_activity;
  if a.visibility='public' and prefs->>'segmentParticipation'='true' then
    for effort in select value from jsonb_array_elements(p_efforts) loop
      if not exists(select 1 from segments where id=(effort->>'segment_id')::uuid and revision=(effort->>'segment_revision')::integer and sport=a.sport) then
        perform enqueue_segment_activity(p_activity); return false;
      end if;
      if not coalesce((effort->>'seconds')::float8 between 5 and 86400,false)
        or not coalesce((effort->>'start_ms')::bigint>=(extract(epoch from a.started_at)*1000)::bigint,false)
        or not coalesce((effort->>'end_ms')::bigint<=(extract(epoch from a.ended_at)*1000)::bigint,false)
        or not coalesce((effort->>'end_ms')::bigint>(effort->>'start_ms')::bigint,false)
        then raise exception 'Invalid effort timing'; end if;
      insert into segment_efforts(segment_id,athlete_id,activity_id,seconds,verified,source_revision,segment_revision,algorithm_version,start_ms,end_ms,quality,created_at,age_group,weight_group)
      values((effort->>'segment_id')::uuid,a.owner_id,a.id,(effort->>'seconds')::float8,true,a.revision,(effort->>'segment_revision')::integer,p_algorithm,
        (effort->>'start_ms')::bigint,(effort->>'end_ms')::bigint,effort->'quality',to_timestamp((effort->>'start_ms')::float8/1000),
        case when prefs->>'shareLeaderboardAge'='true' and (prefs->>'birthYear')~'^\d{4}$' then floor((extract(year from a.started_at)-(prefs->>'birthYear')::int)/10)*10 else null end,
        case when prefs->>'shareLeaderboardWeight'='true' and (prefs->>'weightKg')~'^\d+(\.\d+)?$' then floor((prefs->>'weightKg')::numeric/5)*5 else null end);
    end loop;
  end if;
  update segment_processing_jobs set state='done',lease=null,locked_at=null where activity_id=p_activity;
  return true;
end $$;
create function public.retry_segment_job(p_activity uuid,p_lease uuid) returns void
language sql security definer set search_path=public,extensions as $$
  update segment_processing_jobs set state=case when attempts>=5 then 'failed' else 'pending' end,lease=null,locked_at=null,retry_at=now()+interval '1 minute'*power(2,least(attempts,5))
  where activity_id=p_activity and lease=p_lease and state='processing'
$$;
revoke all on function public.claim_segment_job(),public.segment_job_input(uuid,uuid),public.complete_segment_job(uuid,uuid,integer,jsonb,text),public.retry_segment_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_segment_job(),public.segment_job_input(uuid,uuid),public.complete_segment_job(uuid,uuid,integer,jsonb,text),public.retry_segment_job(uuid,uuid) to service_role;
revoke all on function public.queue_segment_source(),public.queue_segment_privacy(),public.queue_segment_geometry() from public,anon,authenticated;

drop policy efforts_read on public.segment_efforts;
create function public.segment_effort_visible(p_activity uuid,p_revision integer) returns boolean
language sql stable security definer set search_path=public,extensions as $$
  select exists(select 1 from activities a join athlete_settings s on s.owner_id=a.owner_id where a.id=p_activity and a.visibility='public' and a.revision=p_revision and s.settings->>'segmentParticipation'='true'
    and not public.content_hidden('activity',a.id) and not exists(select 1 from account_deletions d where d.owner_id=a.owner_id))
$$;
revoke all on function public.segment_effort_visible(uuid,integer) from public,anon;
grant execute on function public.segment_effort_visible(uuid,integer) to authenticated;
create policy efforts_read on public.segment_efforts for select to authenticated using(
  athlete_id=auth.uid() or (verified and algorithm_version='gps-corridor-v1' and public.segment_effort_visible(activity_id,source_revision))
);
create function public.segment_leaderboard(p_segment uuid,p_filter text default 'overall',p_since timestamptz default null,p_age integer default null,p_weight integer default null,p_club uuid default null)
returns table(id uuid,segment_id uuid,athlete_id uuid,athlete text,seconds double precision,previous double precision,age integer,weight integer,date timestamptz,friend boolean,expected double precision)
language plpgsql stable security definer set search_path=public,extensions as $$
begin
  if auth.uid() is null or not public.account_active() or p_filter not in ('overall','friends','age','weight','club') then raise exception 'Invalid leaderboard request'; end if;
  if p_filter='club' and not exists(select 1 from club_members member where member.club_id=p_club and member.athlete_id=auth.uid()) then raise exception 'Join the club first'; end if;
  return query with eligible as (
    select e.*,p.name,exists(select 1 from friendships f where f.status='accepted' and ((f.requester_id=auth.uid() and f.recipient_id=e.athlete_id) or(f.recipient_id=auth.uid() and f.requester_id=e.athlete_id))) as is_friend
    from segment_efforts e join profiles p on p.id=e.athlete_id join activities a on a.id=e.activity_id join segments s on s.id=e.segment_id join athlete_settings prefs on prefs.owner_id=e.athlete_id
    where e.segment_id=p_segment and e.verified and e.algorithm_version='gps-corridor-v1' and a.revision=e.source_revision and s.revision=e.segment_revision
      and a.visibility='public' and prefs.settings->>'segmentParticipation'='true' and not public.is_blocked(e.athlete_id) and not public.content_hidden('activity',a.id)
      and not exists(select 1 from account_deletions d where d.owner_id=e.athlete_id)
      and (p_since is null or e.created_at>=p_since)
  ), filtered as (
    select * from eligible e where p_filter='overall'
      or p_filter='friends' and (e.is_friend or e.athlete_id=auth.uid())
      or p_filter='age' and e.age_group=p_age
      or p_filter='weight' and e.weight_group=p_weight
      or p_filter='club' and exists(select 1 from club_members m where m.club_id=p_club and m.athlete_id=e.athlete_id)
  ), best as (select distinct on(e.athlete_id) * from filtered e order by e.athlete_id,e.seconds,e.created_at,e.id)
  select b.id,b.segment_id,b.athlete_id,b.name,b.seconds,
    (select min(prior.seconds) from segment_efforts prior where prior.segment_id=b.segment_id and prior.athlete_id=b.athlete_id and prior.verified and prior.algorithm_version='gps-corridor-v1' and prior.created_at<b.created_at),
    b.age_group,b.weight_group,b.created_at,b.is_friend,null::float8 from best b order by b.seconds,b.created_at,b.id limit 250;
end $$;
revoke all on function public.segment_leaderboard(uuid,text,timestamptz,integer,integer,uuid) from public,anon;
grant execute on function public.segment_leaderboard(uuid,text,timestamptz,integer,integer,uuid) to authenticated;
commit;
