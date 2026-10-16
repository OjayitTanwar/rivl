begin;
-- Derived OSM support only. Raw samples remain in the existing private track.
create table public.track_mapping_budget(id boolean primary key default true check(id),day date not null default current_date,claims integer not null default 0,last_claim timestamptz);
insert into public.track_mapping_budget(id)values(true);
alter table public.track_mapping_budget enable row level security;
revoke all on public.track_mapping_budget from public,anon,authenticated;
create table public.track_mapping_jobs(
 activity_id uuid primary key references public.track_contributions on delete cascade,
 owner_id uuid not null references public.profiles on delete cascade,
 revision integer not null,preference_revision integer not null,
 state text not null default 'pending' check(state in ('pending','processing','done','failed')),
 attempts integer not null default 0,lease uuid,locked_at timestamptz,retry_at timestamptz not null default now());
create index track_mapping_jobs_pending on public.track_mapping_jobs(state,retry_at);
create table public.track_osm_ways(
 way_id bigint primary key check(way_id>0),version integer not null check(version>0),
 points jsonb not null,tags jsonb not null,node_ids jsonb not null,
 path extensions.geometry(LineString,4326) not null,
 fetched_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',
 source text not null default 'OpenStreetMap' check(source='OpenStreetMap'),
 license text not null default 'ODbL-1.0' check(license='ODbL-1.0'));
create index track_osm_ways_region on public.track_osm_ways using gist((path::extensions.geography));
create table public.track_candidate_evidence(
 activity_id uuid not null references public.track_contributions on delete cascade,
 way_id bigint not null references public.track_osm_ways on delete cascade,
 way_version integer not null,start_fraction integer not null,end_fraction integer not null,
 algorithm text not null check(algorithm='track-reconstruction-v1'),fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 check(start_fraction>=0 and end_fraction<=1000 and start_fraction<end_fraction),
 primary key(activity_id,way_id,start_fraction,end_fraction));
create index track_candidate_evidence_way on public.track_candidate_evidence(way_id,way_version);
alter table public.track_mapping_jobs enable row level security;
alter table public.track_osm_ways enable row level security;
alter table public.track_candidate_evidence enable row level security;
revoke all on public.track_mapping_jobs,public.track_osm_ways,public.track_candidate_evidence from public,anon,authenticated;
create function public.queue_track_mapping_job() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(73725199021033);
 delete from track_candidate_evidence where activity_id=new.activity_id;
 delete from track_mapping_jobs where activity_id in(select activity_id from track_mapping_jobs where state in ('done','failed')order by retry_at limit 100);
 -- Saturation leaves coarse contribution intact; never grow an unbounded queue.
 if (select count(*) from track_mapping_jobs where state in ('pending','processing'))>=100 then return new;end if;
 insert into track_mapping_jobs(activity_id,owner_id,revision,preference_revision)
 values(new.activity_id,new.owner_id,new.source_revision,new.preference_revision)
 on conflict(activity_id)do update set revision=excluded.revision,preference_revision=excluded.preference_revision,state='pending',attempts=0,lease=null,locked_at=null,retry_at=now();
 return new;
end $$;
create trigger track_reconstruction_queue after insert or update on public.track_contributions for each row execute function public.queue_track_mapping_job();
create function public.track_mapping_source_eligible(p_activity uuid,p_revision integer,p_preference integer) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from track_contributions c join activities a on a.id=c.activity_id
 join track_mapping_settings s on s.owner_id=c.owner_id
 where c.activity_id=p_activity and c.source_revision=p_revision and a.revision=p_revision and a.owner_id=c.owner_id
 and c.preference_revision=p_preference and s.revision=p_preference and s.enabled
 and c.expires_at>now() and not exists(select 1 from account_deletions d where d.owner_id=c.owner_id)
 and not exists(select 1 from track_mapping_quarantines q where q.owner_id=c.owner_id and q.quarantined)
 and not public.content_hidden('activity',a.id))
$$;
create function public.claim_track_mapping_job() returns table(activity_id uuid,owner_id uuid,revision integer,preference_revision integer,lease uuid)
language plpgsql security definer set search_path=public,extensions as $$
declare j public.track_mapping_jobs;b public.track_mapping_budget;
begin
 select * into b from track_mapping_budget where id=true for update;
 if b.day<>current_date then update track_mapping_budget set day=current_date,claims=0 where id=true;b.claims:=0;end if;
 if b.claims>=100 or b.last_claim>clock_timestamp()-interval '10 seconds' then return;end if;
 update track_mapping_jobs set state='failed',lease=null,locked_at=null where attempts>=5 and state='processing' and locked_at<now()-interval '5 minutes';
 select * into j from track_mapping_jobs t where t.attempts<5 and ((t.state='pending' and t.retry_at<=now())or(t.state='processing' and t.locked_at<now()-interval '5 minutes')) order by t.retry_at for update skip locked limit 1;
 if not found then return;end if;
 update track_mapping_budget set claims=claims+1,last_claim=clock_timestamp()where id=true;
 update track_mapping_jobs t set state='processing',attempts=t.attempts+1,lease=gen_random_uuid(),locked_at=now() where t.activity_id=j.activity_id returning * into j;
 return query select j.activity_id,j.owner_id,j.revision,j.preference_revision,j.lease;
end $$;
create function public.track_mapping_job_input(p_activity uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare j public.track_mapping_jobs;a public.activities;raw jsonb;areas jsonb;origin text;
begin
 select * into j from track_mapping_jobs where activity_id=p_activity;
 if j.state is distinct from 'processing' or j.lease is distinct from p_lease or j.locked_at<now()-interval '5 minutes' or not track_mapping_source_eligible(p_activity,j.revision,j.preference_revision) then return null;end if;
 select * into a from activities where id=p_activity;
 select samples into raw from activity_tracks where activity_id=p_activity and owner_id=j.owner_id;
 if raw is null or jsonb_typeof(raw)<>'array' or jsonb_array_length(raw)>100000 or octet_length(raw::text)>20000000 then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('lat',st_y(center::geometry),'lng',st_x(center::geometry),'radius',radius)),'[]')into areas from privacy_zones where owner_id=j.owner_id;
 if jsonb_array_length(areas)>50 then return null;end if;
 select c.origin into origin from track_contributions c where c.activity_id=p_activity;
 return jsonb_build_object('sport',a.sport,'startedAt',extract(epoch from a.started_at)*1000,'endedAt',extract(epoch from a.ended_at)*1000,'raw',raw,'privacy',areas,'origin',origin);
end $$;
create function public.complete_track_mapping_job(p_activity uuid,p_lease uuid,p_revision integer,p_algorithm text,p_ways jsonb,p_support jsonb,p_fingerprint text default null) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare j public.track_mapping_jobs;w jsonb;p jsonb;e jsonb;g geometry;vertices integer:=0;way_count integer;existing_version integer;
begin
 select * into j from track_mapping_jobs where activity_id=p_activity;
 if j.activity_id is null then return false;end if;
 -- Same owner-before-job lock order as submission avoids a completion deadlock.
 perform pg_advisory_xact_lock(hashtextextended(j.owner_id::text,47));
 select * into j from track_mapping_jobs where activity_id=p_activity for update;
 perform 1 from track_contributions where activity_id=p_activity for update;
 if j.state is distinct from 'processing' or j.lease is distinct from p_lease or j.revision is distinct from p_revision or j.locked_at<now()-interval '5 minutes' or not track_mapping_source_eligible(p_activity,p_revision,j.preference_revision) then return false;end if;
 if p_algorithm is distinct from 'track-reconstruction-v1' or jsonb_typeof(p_ways) is distinct from 'array' or jsonb_typeof(p_support) is distinct from 'array' or jsonb_array_length(p_ways)>64 or jsonb_array_length(p_support)>128 or octet_length(p_ways::text)>2000000 or octet_length(p_support::text)>40000 then raise exception 'Invalid mapping result';end if;
 if jsonb_array_length(p_support)>0 and (p_fingerprint is null or p_fingerprint!~'^[a-f0-9]{64}$')then raise exception 'Invalid support fingerprint';end if;
 -- Lock a bounded cache budget; stale entries cascade away their obsolete support.
 perform pg_advisory_xact_lock(73725199021032);
 delete from track_osm_ways where way_id in(select way_id from track_osm_ways where expires_at<=now() order by expires_at limit 100);
 select count(*) into way_count from track_osm_ways;
 for w in select value from jsonb_array_elements(p_ways) loop
  if jsonb_typeof(w->'wayId') is distinct from 'number' or jsonb_typeof(w->'version') is distinct from 'number' or not coalesce((w->>'wayId')::numeric between 1 and 9007199254740991 and (w->>'wayId')::numeric=trunc((w->>'wayId')::numeric) and (w->>'version')::numeric between 1 and 2147483647 and (w->>'version')::numeric=trunc((w->>'version')::numeric),false) or jsonb_typeof(w->'points') is distinct from 'array' or jsonb_array_length(w->'points') not between 2 and 2000 or jsonb_typeof(w->'tags') is distinct from 'object' or octet_length((w->'tags')::text)>10000 or jsonb_typeof(w->'nodeIds') is distinct from 'array' or jsonb_array_length(w->'nodeIds')<>jsonb_array_length(w->'points') then raise exception 'Invalid OSM snapshot';end if;
  vertices:=vertices+jsonb_array_length(w->'points');if vertices>20000 then raise exception 'Map vertex bound';end if;
  for p in select value from jsonb_array_elements(w->'points') loop
   if jsonb_typeof(p->'lat') is distinct from 'number' or jsonb_typeof(p->'lng') is distinct from 'number' or not coalesce((p->>'lat')::float8 between -85 and 85 and (p->>'lng')::float8 between -180 and 180,false) then raise exception 'Invalid map coordinate';end if;
  end loop;
  for p in select value from jsonb_array_elements(w->'nodeIds') loop
   if jsonb_typeof(p) is distinct from 'number' or (p#>>'{}')::numeric<>trunc((p#>>'{}')::numeric) or (p#>>'{}')::numeric<=0 then raise exception 'Invalid OSM node';end if;
  end loop;
  select st_makeline(st_setsrid(st_makepoint((v->>'lng')::float8,(v->>'lat')::float8),4326)order by n)into g from jsonb_array_elements(w->'points')with ordinality q(v,n);
  if exists(select 1 from (select (v->>'lng')::float8 lng,lag((v->>'lng')::float8)over(order by n)prev from jsonb_array_elements(w->'points')with ordinality q(v,n))coords where abs(lng-prev)>180)then raise exception 'Unsupported map wrap';end if;
  if st_length(g::geography)>50000 or st_length(g::geography)<1 then raise exception 'Invalid map extent';end if;
  select version into existing_version from track_osm_ways where way_id=(w->>'wayId')::bigint;
  if existing_version>(w->>'version')::integer then return false;end if;
  if existing_version is null then way_count:=way_count+1;if way_count>10000 then raise exception 'Map cache capacity';end if;end if;
  -- Version identifies immutable OSM geometry; same-version conflicting payload fails.
  if existing_version=(w->>'version')::integer and exists(select 1 from track_osm_ways where way_id=(w->>'wayId')::bigint and (points<>w->'points' or tags<>w->'tags' or node_ids<>w->'nodeIds'))then raise exception 'Conflicting OSM version';end if;
  insert into track_osm_ways(way_id,version,points,tags,node_ids,path)values((w->>'wayId')::bigint,(w->>'version')::integer,w->'points',w->'tags',w->'nodeIds',g)
  on conflict(way_id)do update set version=excluded.version,points=excluded.points,tags=excluded.tags,node_ids=excluded.node_ids,path=excluded.path,fetched_at=now(),expires_at=now()+interval '30 days';
 end loop;
 if (select coalesce(sum(pg_column_size(points)+pg_column_size(tags)+pg_column_size(node_ids)+pg_column_size(path)+512),0)from track_osm_ways)>20000000 then raise exception 'Map cache byte capacity';end if;
 delete from track_candidate_evidence where activity_id=p_activity;
 for e in select value from jsonb_array_elements(p_support) loop
  if jsonb_typeof(e->'wayId') is distinct from 'number' or jsonb_typeof(e->'version') is distinct from 'number' or not coalesce((e->>'wayId')::numeric between 1 and 9007199254740991 and (e->>'wayId')::numeric=trunc((e->>'wayId')::numeric) and (e->>'version')::numeric between 1 and 2147483647 and (e->>'version')::numeric=trunc((e->>'version')::numeric),false) or jsonb_typeof(e->'start') is distinct from 'number' or jsonb_typeof(e->'end') is distinct from 'number' or not coalesce((e->>'start')::numeric=trunc((e->>'start')::numeric) and (e->>'end')::numeric=trunc((e->>'end')::numeric) and (e->>'start')::integer>=0 and (e->>'end')::integer<=1000 and (e->>'end')::integer>(e->>'start')::integer,false) or not exists(select 1 from track_osm_ways where way_id=(e->>'wayId')::bigint and version=(e->>'version')::integer and expires_at>now())then raise exception 'Invalid support interval';end if;
  insert into track_candidate_evidence values(p_activity,(e->>'wayId')::bigint,(e->>'version')::integer,(e->>'start')::integer,(e->>'end')::integer,p_algorithm,p_fingerprint)on conflict do nothing;
 end loop;
 update track_mapping_jobs set state='done',lease=null,locked_at=null where activity_id=p_activity;
 return true;
end $$;
create function public.retry_track_mapping_job(p_activity uuid,p_lease uuid)returns void language sql security definer set search_path=public as $$
 update track_mapping_jobs set state=case when attempts>=5 then 'failed' else 'pending' end,lease=null,locked_at=null,retry_at=now()+interval '1 minute'*power(2,least(attempts,5))where activity_id=p_activity and lease=p_lease and state='processing'
$$;
create function public.list_track_candidates(p_lat double precision,p_lng double precision)
returns table(way_id bigint,version integer,start_fraction integer,end_fraction integer,points jsonb,tags jsonb,source text,license text,expires_at timestamptz)
language plpgsql stable security definer set search_path=public,extensions as $$
declare center geography;cx integer;cy integer;
begin
 if not public.account_active()then raise exception 'Not authorized';end if;
 if not coalesce(p_lat between -85 and 85 and p_lng between -180 and 180,false)then raise exception 'Invalid map center';end if;
 cx:=floor(p_lng*100);cy:=floor(p_lat*100);center:=st_setsrid(st_makepoint((cx+.5)/100,(cy+.5)/100),4326)::geography;
 return query with nearby as(select w.* from track_osm_ways w where w.expires_at>now() and st_dwithin(w.path::geography,center,1200)order by w.way_id limit 64),
 eligible as(select e.*,c.owner_id,c.observed_day from track_candidate_evidence e join track_contributions c on c.activity_id=e.activity_id join nearby w on w.way_id=e.way_id and w.version=e.way_version where public.track_mapping_source_eligible(c.activity_id,c.source_revision,c.preference_revision)),
 -- One deterministic owner vote per portion; repeat outings cannot manufacture day diversity.
 votes as(select e.way_id,b.bin,e.owner_id,min(e.observed_day)observed_day,min(e.fingerprint)fingerprint from eligible e cross join lateral generate_series(((e.start_fraction+9)/10)*10,e.end_fraction-10,10)b(bin)group by e.way_id,b.bin,e.owner_id),
 bins as(select e.way_id,e.bin from votes e group by e.way_id,e.bin having count(distinct e.owner_id)>=5 and count(distinct e.fingerprint)>=5 and count(distinct e.observed_day)>=3),
 bounded as(select b.*,w.version,w.tags,w.source,w.license,piece.geom from bins b join nearby w on w.way_id=b.way_id cross join lateral(select st_linesubstring(w.path,b.bin/1000.0,(b.bin+10)/1000.0)geom)piece where st_coveredby(piece.geom,st_buffer(center,1200)::geometry) order by b.way_id,b.bin limit 200)
 select b.way_id,b.version,b.bin,b.bin+10,(select jsonb_agg(jsonb_build_object('lat',st_y(d.geom),'lng',st_x(d.geom))order by d.path)from st_dumppoints(b.geom)d),b.tags,b.source,b.license,date_trunc('day',now())+interval '1 day' from (select bounded.*,sum(st_npoints(geom))over(order by bounded.way_id,bounded.bin)vertex_total from bounded)b where b.vertex_total<=20000;
end $$;
revoke all on function public.queue_track_mapping_job(),public.track_mapping_source_eligible(uuid,integer,integer),public.claim_track_mapping_job(),public.track_mapping_job_input(uuid,uuid),public.complete_track_mapping_job(uuid,uuid,integer,text,jsonb,jsonb,text),public.retry_track_mapping_job(uuid,uuid),public.list_track_candidates(double precision,double precision)from public,anon,authenticated;
grant execute on function public.claim_track_mapping_job(),public.track_mapping_job_input(uuid,uuid),public.complete_track_mapping_job(uuid,uuid,integer,text,jsonb,jsonb,text),public.retry_track_mapping_job(uuid,uuid)to service_role;
grant execute on function public.list_track_candidates(double precision,double precision)to authenticated;
commit;
