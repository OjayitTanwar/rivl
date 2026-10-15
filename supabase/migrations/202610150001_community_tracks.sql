begin;
-- Pilot observation cells, never infrastructure lines or safety claims. Private
-- evidence is derived from the existing owner-only track, not uploaded twice.
create table public.track_mapping_settings(owner_id uuid primary key references public.profiles on delete cascade,enabled boolean not null default true,revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now());
create table public.track_contributions(activity_id uuid primary key references public.activities on delete cascade,owner_id uuid not null references public.profiles on delete cascade,source_revision integer not null,preference_revision integer not null,origin text not null check(origin in ('device-gps','watch-gps')),observed_day date not null,cells jsonb not null check(jsonb_typeof(cells)='array' and jsonb_array_length(cells)<=500),expires_at timestamptz not null default now()+interval '90 days',updated_at timestamptz not null default now());
create index track_contributions_owner on public.track_contributions(owner_id);
create index track_contributions_expiry on public.track_contributions(expires_at);
create table public.track_observation_cells(activity_id uuid references public.track_contributions(activity_id) on delete cascade,x integer not null,y integer not null,primary key(activity_id,x,y));
create index track_observation_cells_region on public.track_observation_cells(x,y,activity_id);
alter table public.track_observation_cells enable row level security;
revoke all on public.track_observation_cells from public,anon,authenticated;
create table public.track_mapping_quarantines(owner_id uuid primary key references public.profiles on delete cascade,quarantined boolean not null,reason text not null check(reason in ('abuse','privacy','suspected_spoofing','review_complete')),updated_at timestamptz not null default now());
alter table public.track_mapping_quarantines enable row level security;
revoke all on public.track_mapping_quarantines from public,anon,authenticated;
create function public.quarantine_track_mapping_owner(p_owner uuid,p_quarantined boolean,p_reason text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_owner is null or p_quarantined is null or p_reason is null or p_reason not in ('abuse','privacy','suspected_spoofing','review_complete') then raise exception 'Invalid quarantine';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,47));
 insert into track_mapping_quarantines(owner_id,quarantined,reason)values(p_owner,p_quarantined,p_reason)on conflict(owner_id)do update set quarantined=excluded.quarantined,reason=excluded.reason,updated_at=now();
end $$;
revoke all on function public.quarantine_track_mapping_owner(uuid,boolean,text)from public,anon,authenticated;
grant execute on function public.quarantine_track_mapping_owner(uuid,boolean,text)to service_role;
alter table public.track_mapping_settings enable row level security;
alter table public.track_contributions enable row level security;
revoke all on public.track_mapping_settings,public.track_contributions from public,anon,authenticated;
grant select on public.track_mapping_settings to authenticated;
create policy track_mapping_owner on public.track_mapping_settings for select to authenticated using(owner_id=auth.uid() and public.account_active());
create function public.track_mapping_preference() returns table(enabled boolean,revision integer)
language plpgsql security definer set search_path=public,extensions as $$
begin
 if not public.account_active() then raise exception 'Not authorized'; end if;
 insert into track_mapping_settings(owner_id) values(auth.uid()) on conflict do nothing;
 return query select s.enabled,s.revision from track_mapping_settings s where s.owner_id=auth.uid();
end $$;
create function public.set_track_mapping_preference(p_enabled boolean) returns table(enabled boolean,revision integer)
language plpgsql security definer set search_path=public,extensions as $$
begin
 if not public.account_active() or p_enabled is null then raise exception 'Not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,47));
 insert into track_mapping_settings(owner_id,enabled) values(auth.uid(),p_enabled)
 on conflict(owner_id) do update set enabled=excluded.enabled,revision=track_mapping_settings.revision+1,updated_at=now();
 return query select s.enabled,s.revision from track_mapping_settings s where s.owner_id=auth.uid();
end $$;
create function public.submit_track_contribution(p_activity_id uuid,p_revision integer,p_origin text,p_preference_revision integer) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare uid uuid:=auth.uid();a public.activities;s public.track_mapping_settings;raw jsonb;p jsonb;prev jsonb;first_pt geography;last_pt geography;pt geography;edge geography;line jsonb:='[]';lines jsonb:='[]';good boolean;secs double precision;meters double precision:=0;limit_speed double precision;cell_values jsonb;line_samples integer:=0;cell jsonb;
begin
 if not public.account_active() or p_origin not in ('device-gps','watch-gps') or p_origin is null then raise exception 'Not authorized';end if;
 -- Serialize one owner's submissions, preferences and retractions.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,47));
 delete from track_contributions where owner_id=uid and expires_at<=now();
 if exists(select 1 from track_mapping_quarantines q where q.owner_id=uid and q.quarantined)then raise exception 'Contribution paused for review';end if;
 select * into s from track_mapping_settings where owner_id=uid for update;
 if s.owner_id is null or not s.enabled or s.revision<>p_preference_revision then raise exception 'Contribution disabled or preference changed';end if;
 select * into a from activities where id=p_activity_id for share;
 if a.id is null or a.owner_id<>uid or a.revision<>p_revision or public.content_hidden('activity',a.id) then raise exception 'Source not synced or source changed';end if;
 if a.ended_at<a.started_at or a.ended_at>now()+interval '5 minutes' or a.started_at<now()-interval '90 days' then raise exception 'Source outside contribution window';end if;
 if exists(select 1 from track_contributions c where c.activity_id=a.id and c.source_revision=p_revision and c.origin<>p_origin) then raise exception 'Conflicting source origin';end if;
 if exists(select 1 from track_contributions c where c.activity_id=a.id and c.source_revision=p_revision and c.preference_revision=p_preference_revision and c.origin=p_origin) then return;end if;
 if (select count(*) from track_contributions c where c.owner_id=uid and c.updated_at>=date_trunc('day',now()))>=10 then raise exception 'Contribution daily limit';end if;
 select samples into raw from activity_tracks where activity_id=a.id and owner_id=uid;
 if raw is null or jsonb_typeof(raw)<>'array' or jsonb_array_length(raw)<6 or jsonb_array_length(raw)>100000 then raise exception 'Unsupported source track';end if;
 -- Validate before numeric casts; malformed GPS never produces a partial result.
 for p in select value from jsonb_array_elements(raw) loop
  if jsonb_typeof(p->'lat')<>'number' or jsonb_typeof(p->'lng')<>'number' or jsonb_typeof(p->'t')<>'number' or jsonb_typeof(p->'accuracy')<>'number' or jsonb_typeof(p->'segment')<>'number' or not coalesce((p->>'lat')::float8 between -85 and 85 and (p->>'lng')::float8 between -180 and 180 and (p->>'accuracy')::float8>=0 and (p->>'segment')::numeric>=0 and (p->>'segment')::numeric=trunc((p->>'segment')::numeric),false) then raise exception 'Invalid GPS evidence';end if;
 end loop;
 first_pt:=st_setsrid(st_makepoint((raw->0->>'lng')::float8,(raw->0->>'lat')::float8),4326)::geography;
 last_pt:=st_setsrid(st_makepoint((raw->-1->>'lng')::float8,(raw->-1->>'lat')::float8),4326)::geography;
 limit_speed:=case a.sport when 'ride' then 35 when 'run' then 12 when 'walk' then 4 else 6 end;
 for p in select value from jsonb_array_elements(raw) loop
  pt:=st_setsrid(st_makepoint((p->>'lng')::float8,(p->>'lat')::float8),4326)::geography;
  good:=(p->>'accuracy')::float8<=20 and (p->>'t')::numeric between extract(epoch from a.started_at)*1000 and extract(epoch from a.ended_at)*1000
    and not st_dwithin(pt,first_pt,200) and not st_dwithin(pt,last_pt,200)
    and not exists(select 1 from privacy_zones z where z.owner_id=uid and st_dwithin(pt,z.center,z.radius));
  if prev is not null then
   secs:=((p->>'t')::numeric-(prev->>'t')::numeric)/1000;
   edge:=st_makeline(st_setsrid(st_makepoint((prev->>'lng')::float8,(prev->>'lat')::float8),4326),pt::geometry)::geography;
   if secs<=0 or secs>15 or (p->>'segment')::integer<>(prev->>'segment')::integer or abs((p->>'lng')::float8-(prev->>'lng')::float8)>180 or st_length(edge)/greatest(secs,.001)>limit_speed
      or st_dwithin(edge,first_pt,200) or st_dwithin(edge,last_pt,200) or exists(select 1 from privacy_zones z where z.owner_id=uid and st_dwithin(edge,z.center,z.radius)) then
     if line_samples>=6 and meters>=100 then lines:=lines||jsonb_build_array(line);end if;line:='[]';meters:=0;line_samples:=0;
     -- Bad speed/order must not become the next connected observation.
     if secs<=0 or st_length(edge)/greatest(secs,.001)>limit_speed then good:=false;end if;
   elsif good and line_samples>0 then meters:=meters+st_length(edge);end if;
  end if;
  if good then
   cell:=jsonb_build_object('x',floor((p->>'lng')::numeric*500)::integer,'y',floor((p->>'lat')::numeric*500)::integer);
   -- Keep consecutive same-cell samples as counts, not repeated JSON geometry.
   -- This bounds intermediate storage and avoids quadratic full-trace copying.
   if jsonb_array_length(line)=0 or line->-1 is distinct from cell then line:=line||jsonb_build_array(cell);end if;
   line_samples:=line_samples+1;
   if jsonb_array_length(line)>500 or jsonb_array_length(lines)>20 then raise exception 'Evidence geometry bound';end if;
   prev:=p;
  else
   if line_samples>=6 and meters>=100 then lines:=lines||jsonb_build_array(line);end if;line:='[]';meters:=0;line_samples:=0;prev:=null;
  end if;
 end loop;
 if line_samples>=6 and meters>=100 then lines:=lines||jsonb_build_array(line);end if;
 select coalesce(jsonb_agg(c),'[]') into cell_values from(
 select distinct point.value c from jsonb_array_elements(lines) fragment cross join lateral jsonb_array_elements(fragment.value) point
 cross join lateral (select st_setsrid(st_makepoint(((point.value->>'x')::integer+.5)/500.0,((point.value->>'y')::integer+.5)/500.0),4326)::geography center) coarse
 -- Whole coarse cells must clear endpoint/zones, not merely the sampled point.
 where (point.value->>'x')::integer between -90000 and 89999 and (point.value->>'y')::integer between -42500 and 42499
 and not st_dwithin(coarse.center,first_pt,360) and not st_dwithin(coarse.center,last_pt,360)
 and not exists(select 1 from privacy_zones z where z.owner_id=uid and st_dwithin(coarse.center,z.center,z.radius+160))
 ) cells;
 if jsonb_array_length(cell_values)=0 or jsonb_array_length(cell_values)>500 then raise exception 'No bounded usable geometry';end if;
 insert into track_contributions(activity_id,owner_id,source_revision,preference_revision,origin,observed_day,cells)
 values(a.id,uid,a.revision,s.revision,p_origin,(a.started_at at time zone 'UTC')::date,cell_values)
 on conflict(activity_id) do update set source_revision=excluded.source_revision,preference_revision=excluded.preference_revision,origin=excluded.origin,observed_day=excluded.observed_day,cells=excluded.cells,expires_at=now()+interval '90 days',updated_at=now() where track_contributions.owner_id=uid;
 delete from track_observation_cells where activity_id=a.id;
 insert into track_observation_cells(activity_id,x,y)select a.id,(v->>'x')::integer,(v->>'y')::integer from jsonb_array_elements(cell_values)v;
end $$;
create function public.withdraw_track_contribution(p_activity_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'Not authorized';end if;perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,47));delete from track_contributions where owner_id=auth.uid() and activity_id=p_activity_id;end $$;
create function public.delete_my_track_contributions() returns void language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'Not authorized';end if;perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,47));delete from track_contributions where owner_id=auth.uid();end $$;
-- Bounded service maintenance; deployment must schedule this retention sweep.
create function public.prune_track_contributions(p_limit integer default 500) returns integer language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
 if p_limit is null or p_limit<1 or p_limit>1000 then raise exception 'Invalid maintenance bound';end if;
 delete from track_contributions where activity_id in(select activity_id from track_contributions where expires_at<=now() order by expires_at limit p_limit for update skip locked);
 get diagnostics removed=row_count;return removed;
end $$;
revoke all on function public.prune_track_contributions(integer) from public,anon,authenticated;
grant execute on function public.prune_track_contributions(integer) to service_role;
-- Any source edit or zone edit removes previous evidence immediately. New source
-- revision can contribute again only through the normal eligible lifecycle.
create function public.invalidate_track_contributions() returns trigger language plpgsql security definer set search_path=public as $$
begin if tg_table_name='activities' then delete from track_contributions where activity_id=new.id;else delete from track_contributions where owner_id=coalesce(new.owner_id,old.owner_id);end if;return coalesce(new,old);end $$;
create trigger track_source_changed after update on public.activities for each row when(old.revision is distinct from new.revision) execute function public.invalidate_track_contributions();
create trigger track_privacy_changed after insert or update or delete on public.privacy_zones for each row execute function public.invalidate_track_contributions();
create function public.list_observed_track_cells(p_lat double precision,p_lng double precision) returns table(lat double precision,lng double precision,expires_at timestamptz)
language plpgsql stable security definer set search_path=public,extensions as $$
declare center_x integer;center_y integer;bucket_center geography;
begin
 if not public.account_active() then raise exception 'Not authorized';end if;
 if not coalesce(p_lat between -85 and 85 and p_lng between -180 and 180,false) then raise exception 'Invalid map center';end if;
 -- Stable fixed query bucket; no exact counts, sports, time filters or owner IDs.
 center_x:=floor(p_lng*100)::integer*5;center_y:=floor(p_lat*100)::integer*5;
 bucket_center:=st_setsrid(st_makepoint((center_x+2.5)/500.0,(center_y+2.5)/500.0),4326)::geography;
 return query with evidence as (
 select c.owner_id,c.observed_day,c.expires_at,v.x,v.y
 from track_contributions c join activities a on a.id=c.activity_id and a.revision=c.source_revision
 join track_observation_cells v on v.activity_id=c.activity_id and v.x between center_x-10 and center_x+10 and v.y between center_y-10 and center_y+10 where c.expires_at>now() and not exists(select 1 from account_deletions d where d.owner_id=c.owner_id) and not exists(select 1 from track_mapping_quarantines q where q.owner_id=c.owner_id and q.quarantined) and not public.content_hidden('activity',a.id)
 ), eligible as(select e.x,e.y,min(e.expires_at) expiry from evidence e where abs(e.x-center_x)<=10 and abs(e.y-center_y)<=10 group by e.x,e.y having count(distinct e.owner_id)>=5 and count(distinct e.observed_day)>=3)
 select ((e.y+.5)/500.0)::float8,((e.x+.5)/500.0)::float8,date_trunc('day',now())+interval '1 day' from eligible e
 where st_dwithin(st_setsrid(st_makepoint((e.x+.5)/500.0,(e.y+.5)/500.0),4326)::geography,bucket_center,1200) order by e.y,e.x limit 200;
end $$;
revoke all on function public.track_mapping_preference(),public.set_track_mapping_preference(boolean),public.submit_track_contribution(uuid,integer,text,integer),public.withdraw_track_contribution(uuid),public.delete_my_track_contributions(),public.list_observed_track_cells(double precision,double precision),public.invalidate_track_contributions() from public,anon,authenticated;
grant execute on function public.track_mapping_preference(),public.set_track_mapping_preference(boolean),public.submit_track_contribution(uuid,integer,text,integer),public.withdraw_track_contribution(uuid),public.delete_my_track_contributions(),public.list_observed_track_cells(double precision,double precision) to authenticated;
commit;
