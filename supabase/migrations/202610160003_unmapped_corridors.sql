begin;
-- Private reconstructed hypotheses. Only reviewed, currently corroborated
-- geometry is discoverable; neither proposals nor reviews enable routing.
create table public.track_reviewers(owner_id uuid primary key references public.profiles on delete cascade);
create table public.track_corridors(
 id uuid primary key default gen_random_uuid(),signature text unique not null check(signature~'^[a-f0-9]{64}$'),
 revision integer not null default 1,sport public.activity_sport not null,
 points jsonb not null,path extensions.geometry(LineString,4326)not null,width_meters double precision not null check(width_meters between .5 and 20),
 state text not null default 'proposed' check(state in('proposed','reviewed','disputed','withdrawn')),
 review_reason text not null default '',reviewed_by uuid references public.profiles on delete set null,
 updated_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days');
create index track_corridors_geo on public.track_corridors using gist((path::extensions.geography));
create table public.track_corridor_support(
 corridor_id uuid references public.track_corridors on delete cascade,
 activity_id uuid references public.track_contributions on delete cascade,
 source_revision integer not null,preference_revision integer not null,
 fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),primary key(corridor_id,activity_id));
create table public.track_corridor_reports(
 corridor_id uuid references public.track_corridors on delete cascade,
 reporter_id uuid references public.profiles on delete cascade,
 reason text not null check(reason in('privacy','access','geometry','other')),
 state text not null default 'open' check(state in('open','resolved')),
 updated_at timestamptz not null default now(),primary key(corridor_id,reporter_id));
alter table public.track_reviewers enable row level security;
alter table public.track_corridors enable row level security;
alter table public.track_corridor_support enable row level security;
alter table public.track_corridor_reports enable row level security;
revoke all on public.track_reviewers,public.track_corridors,public.track_corridor_support,public.track_corridor_reports from public,anon,authenticated;
grant all on public.track_reviewers,public.track_corridors,public.track_corridor_support,public.track_corridor_reports to service_role;
create function public.is_track_reviewer()returns boolean language sql stable security definer set search_path=public as $$
 select public.account_active()and exists(select 1 from track_reviewers where owner_id=auth.uid())
$$;
create function public.track_corridor_supported(p_id uuid)returns boolean language sql stable security definer set search_path=public as $$
 with votes as(select distinct on(c.owner_id)c.owner_id,c.observed_day,s.fingerprint
 from track_corridor_support s join track_contributions c on c.activity_id=s.activity_id
 where s.corridor_id=p_id and public.track_mapping_source_eligible(c.activity_id,s.source_revision,s.preference_revision)
 order by c.owner_id,c.observed_day,s.fingerprint)
 select count(*)>=5 and count(distinct observed_day)>=3 and count(distinct fingerprint)>=5 from votes
$$;
-- Re-read existing owner-only sources; no second trace collection/upload.
create function public.track_mapping_neighbor_input(p_activity uuid,p_lease uuid)returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare j public.track_mapping_jobs;r record;items jsonb:='[]';bytes integer:=0;areas jsonb;
begin
 select * into j from track_mapping_jobs where activity_id=p_activity;
 if j.state is distinct from 'processing'or j.lease is distinct from p_lease or j.locked_at<now()-interval '5 minutes'or not track_mapping_source_eligible(p_activity,j.revision,j.preference_revision)then return '[]';end if;
 for r in
  select distinct on(c.owner_id)c.*,a.sport,a.started_at,a.ended_at,t.samples
  from track_contributions c join activities a on a.id=c.activity_id join activity_tracks t on t.activity_id=a.id and t.owner_id=c.owner_id
  where c.owner_id<>j.owner_id and a.sport=(select sport from activities where id=p_activity)
   and public.track_mapping_source_eligible(c.activity_id,c.source_revision,c.preference_revision)
   and jsonb_array_length(t.samples)between 6 and 5000 and octet_length(t.samples::text)<=1000000
   and exists(select 1 from track_observation_cells x join track_observation_cells y on x.x=y.x and x.y=y.y where x.activity_id=p_activity and y.activity_id=c.activity_id)
  order by c.owner_id,c.observed_day,c.activity_id limit 12
 loop
  bytes:=bytes+octet_length(r.samples::text);if bytes>4000000 then exit;end if;
  select coalesce(jsonb_agg(jsonb_build_object('lat',st_y(center::geometry),'lng',st_x(center::geometry),'radius',radius)),'[]')into areas from privacy_zones where owner_id=r.owner_id;
  if jsonb_array_length(areas)>50 then continue;end if;
  items:=items||jsonb_build_array(jsonb_build_object('activity_id',r.activity_id,'owner_id',r.owner_id,'revision',r.source_revision,'preference_revision',r.preference_revision,
   'input',jsonb_build_object('sport',r.sport,'startedAt',extract(epoch from r.started_at)*1000,'endedAt',extract(epoch from r.ended_at)*1000,'raw',r.samples,'origin',r.origin,'privacy',areas)));
 end loop;
 return items;
end $$;
create function public.complete_track_mapping_result(p_activity uuid,p_lease uuid,p_revision integer,p_algorithm text,p_ways jsonb,p_support jsonb,p_fingerprint text,p_corridors jsonb default '[]')returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare candidate jsonb;point jsonb;support jsonb;g geometry;cid uuid;sig text;existing public.track_corridors;total integer:=0;previous jsonb;refs integer;
begin
 if jsonb_typeof(p_corridors)is distinct from 'array'or jsonb_array_length(p_corridors)>8 or octet_length(p_corridors::text)>250000 then raise exception 'Corridor result bound';end if;
 if not public.complete_track_mapping_job(p_activity,p_lease,p_revision,p_algorithm,p_ways,p_support,p_fingerprint)then return false;end if;
 perform pg_advisory_xact_lock(73725199021034);
 delete from track_corridors where id in(select id from track_corridors where expires_at<=now()order by expires_at limit 50);
 for candidate in select value from jsonb_array_elements(p_corridors)loop
  if jsonb_typeof(candidate->'geometry')is distinct from 'array'or jsonb_array_length(candidate->'geometry')not between 11 and 256
    or jsonb_typeof(candidate->'support')is distinct from 'array'or jsonb_array_length(candidate->'support')not between 5 and 13
    or candidate->>'sport'not in('run','ride','walk','hike')or not coalesce((candidate->>'widthMeters')::float8 between .5 and 20,false)then raise exception 'Invalid corridor';end if;
  previous:=null;
  for point in select value from jsonb_array_elements(candidate->'geometry')loop
   if jsonb_typeof(point->'lat')is distinct from 'number'or jsonb_typeof(point->'lng')is distinct from 'number'or not coalesce((point->>'lat')::float8 between -85 and 85 and(point->>'lng')::float8 between -180 and 180,false)then raise exception 'Invalid corridor coordinate';end if;
   if previous is not null and(abs((point->>'lng')::float8-(previous->>'lng')::float8)>180 or st_distance(st_setsrid(st_makepoint((point->>'lng')::float8,(point->>'lat')::float8),4326)::geography,st_setsrid(st_makepoint((previous->>'lng')::float8,(previous->>'lat')::float8),4326)::geography)>25)then raise exception 'Corridor gap';end if;previous:=point;
  end loop;
  select st_makeline(st_setsrid(st_makepoint((p->>'lng')::float8,(p->>'lat')::float8),4326)order by n)into g from jsonb_array_elements(candidate->'geometry')with ordinality x(p,n);
  if st_length(g::geography)not between 95 and 2500 then raise exception 'Corridor extent';end if;
  sig:=encode(digest(least(st_asewkb(st_snaptogrid(g,.0001)),st_asewkb(st_snaptogrid(st_reverse(g),.0001)))||convert_to(candidate->>'sport','UTF8'),'sha256'),'hex');
  select * into existing from track_corridors where signature=sig for update;
  if existing.id is null then
   if(select count(*)from track_corridors)>=500 then continue;end if;
   insert into track_corridors(signature,sport,points,path,width_meters)values(sig,(candidate->>'sport')::activity_sport,candidate->'geometry',g,(candidate->>'widthMeters')::float8)returning id into cid;
  else
   cid:=existing.id;
   -- A reviewed shape is immutable; new shape evidence becomes a new review.
   if existing.points is distinct from candidate->'geometry'then
    update track_corridors set points=candidate->'geometry',path=g,width_meters=(candidate->>'widthMeters')::float8,revision=revision+1,state='proposed',reviewed_by=null,review_reason='',updated_at=now(),expires_at=now()+interval '30 days'where id=cid;
    delete from track_corridor_support where corridor_id=cid;
   end if;
  end if;
  -- Replace this hypothesis' evidence, not merely a total count. Every member
  -- must independently cover the entire returned centerline in trusted code.
  for support in select value from jsonb_array_elements(candidate->'support')loop
   if support->>'fingerprint'!~'^[a-f0-9]{64}$'or not public.track_mapping_source_eligible((support->>'activityId')::uuid,(support->>'revision')::integer,(support->>'preferenceRevision')::integer)
    or not exists(select 1 from activities where id=(support->>'activityId')::uuid and sport=(candidate->>'sport')::activity_sport)then raise exception 'Stale corridor support';end if;
   insert into track_corridor_support values(cid,(support->>'activityId')::uuid,(support->>'revision')::integer,(support->>'preferenceRevision')::integer,support->>'fingerprint')on conflict(corridor_id,activity_id)do update set source_revision=excluded.source_revision,preference_revision=excluded.preference_revision,fingerprint=excluded.fingerprint;
  end loop;
  if not public.track_corridor_supported(cid)then raise exception 'Insufficient independent corridor support';end if;
  total:=total+jsonb_array_length(candidate->'geometry');if total>1500 then raise exception 'Corridor vertex bound';end if;
 end loop;
 return true;
end $$;
create function public.list_community_corridors(p_lat double precision,p_lng double precision)returns table(id uuid,revision integer,sport public.activity_sport,points jsonb,width_meters double precision,expires_at timestamptz)
language plpgsql stable security definer set search_path=public,extensions as $$declare center geography;
begin
 if not public.account_active()or not coalesce(p_lat between -85 and 85 and p_lng between -180 and 180,false)then raise exception 'Not authorized'using errcode='42501';end if;
 center:=st_setsrid(st_makepoint((floor(p_lng*100)+.5)/100,(floor(p_lat*100)+.5)/100),4326)::geography;
 return query select c.id,c.revision,c.sport,c.points,c.width_meters,least(c.expires_at,date_trunc('day',now())+interval '1 day')from track_corridors c
 where c.state='reviewed'and c.expires_at>now()and st_coveredby(c.path,st_buffer(center,1200)::geometry)and public.track_corridor_supported(c.id)order by c.id limit 30;
end $$;
create function public.list_track_corridor_reviews()returns table(id uuid,revision integer,sport public.activity_sport,points jsonb,state text,width_meters double precision)
language plpgsql stable security definer set search_path=public as $$begin
 if not public.is_track_reviewer()then raise exception 'Not authorized'using errcode='42501';end if;
 return query select c.id,c.revision,c.sport,c.points,c.state,c.width_meters from track_corridors c where c.state in('proposed','disputed')and c.expires_at>now()and public.track_corridor_supported(c.id)order by c.updated_at,c.id limit 20;
end $$;
create function public.review_track_corridor(p_id uuid,p_revision integer,p_publish boolean,p_reason text)returns void language plpgsql security definer set search_path=public as $$begin
 if not public.is_track_reviewer()then raise exception 'Not authorized'using errcode='42501';end if;
 if p_publish is null or not public.valid_athlete_text(p_reason,500,true)then raise exception 'Enter a review reason';end if;
 perform 1 from track_corridors where id=p_id and revision=p_revision for update;if not found then raise exception 'Corridor changed';end if;
 if p_publish and not public.track_corridor_supported(p_id)then raise exception 'Support has changed';end if;
 update track_corridors set state=case when p_publish then 'reviewed'else 'withdrawn'end,review_reason=p_reason,reviewed_by=auth.uid(),updated_at=now()where id=p_id;
 update track_corridor_reports set state='resolved'where corridor_id=p_id;
end $$;
create function public.report_track_corridor(p_id uuid,p_reason text)returns void language plpgsql security definer set search_path=public as $$begin
 if not public.account_active()or not exists(select 1 from track_corridors where id=p_id and state='reviewed'and expires_at>now()and public.track_corridor_supported(p_id))then raise exception 'Corridor unavailable'using errcode='42501';end if;
 if p_reason is null or p_reason not in('privacy','access','geometry','other')then raise exception 'Choose a report reason';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,93));
 if(select count(*)from track_corridor_reports where reporter_id=auth.uid()and updated_at>now()-interval '1 day')>=10 then raise exception 'Report limit reached';end if;
 insert into track_corridor_reports values(p_id,auth.uid(),p_reason,'open',now())on conflict(corridor_id,reporter_id)do update set state='open',reason=excluded.reason,updated_at=now();
 update track_corridors set state='disputed',revision=revision+1,updated_at=now()where id=p_id;
end $$;
revoke all on function public.is_track_reviewer(),public.track_corridor_supported(uuid),public.track_mapping_neighbor_input(uuid,uuid),public.complete_track_mapping_result(uuid,uuid,integer,text,jsonb,jsonb,text,jsonb),public.list_community_corridors(double precision,double precision),public.list_track_corridor_reviews(),public.review_track_corridor(uuid,integer,boolean,text),public.report_track_corridor(uuid,text)from public,anon,authenticated;
grant execute on function public.track_mapping_neighbor_input(uuid,uuid),public.complete_track_mapping_result(uuid,uuid,integer,text,jsonb,jsonb,text,jsonb)to service_role;
grant execute on function public.is_track_reviewer(),public.list_community_corridors(double precision,double precision),public.list_track_corridor_reviews(),public.review_track_corridor(uuid,integer,boolean,text),public.report_track_corridor(uuid,text)to authenticated;
commit;
