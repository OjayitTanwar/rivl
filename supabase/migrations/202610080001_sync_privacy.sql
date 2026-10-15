begin;

alter table public.activities add column photo_keys text[] not null default '{}';
-- Mutations must pass through RPCs so projections and private tracks stay in sync.
revoke insert, update on public.activities from authenticated;
revoke update(title,note,visibility,rpe) on public.activities from authenticated;
revoke insert, update, delete on public.activity_tracks, public.privacy_zones from authenticated;
revoke update on public.friendships from authenticated;
grant update(status) on public.friendships to authenticated;

create or replace function public.publish_activity(p_id uuid) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare
 a public.activities; pts jsonb; p jsonb; first_pt geography; last_pt geography;
 pt geography; previous_pt geography; edge geography; hidden boolean; blocked_edge boolean;
 last_segment integer; group_id integer:=0; line jsonb:='[]'; lines jsonb:='[]';
begin
 select * into a from public.activities where id=p_id;
 if not found then return; end if;
 if auth.uid() is distinct from a.owner_id then raise exception 'Not authorized'; end if;
 if a.visibility='private' then
   delete from public.published_activities where id=p_id;
   return;
 end if;
 select points into pts from public.activity_tracks where activity_id=p_id;
 if coalesce(jsonb_array_length(pts),0)>0 then
   first_pt:=st_setsrid(st_makepoint((pts->0->>'lng')::float8,(pts->0->>'lat')::float8),4326)::geography;
   last_pt:=st_setsrid(st_makepoint((pts->-1->>'lng')::float8,(pts->-1->>'lat')::float8),4326)::geography;
   for p in select value from jsonb_array_elements(pts) loop
     pt:=st_setsrid(st_makepoint((p->>'lng')::float8,(p->>'lat')::float8),4326)::geography;
     hidden:=st_dwithin(pt,first_pt,200) or st_dwithin(pt,last_pt,200)
       or exists(select 1 from privacy_zones z where z.owner_id=a.owner_id and st_dwithin(pt,z.center,z.radius));
     blocked_edge:=false;
     if previous_pt is not null and last_segment=(p->>'segment')::integer then
       edge:=st_makeline(previous_pt::geometry,pt::geometry)::geography;
       -- Sparse or simplified tracks must not draw a line through a hidden zone.
       blocked_edge:=st_dwithin(edge,first_pt,200) or st_dwithin(edge,last_pt,200)
         or exists(select 1 from privacy_zones z where z.owner_id=a.owner_id and st_dwithin(edge,z.center,z.radius));
     end if;
     if hidden or blocked_edge or last_segment is distinct from (p->>'segment')::integer then
       if jsonb_array_length(line)>1 then lines:=lines||jsonb_build_array(line); end if;
       line:='[]'; group_id:=group_id+1;
     end if;
     if not hidden then
       line:=line||jsonb_build_array(jsonb_build_object('lat',(p->>'lat')::float8,'lng',(p->>'lng')::float8,'segment',group_id,'t',0,'accuracy',0));
     end if;
     last_segment:=(p->>'segment')::integer; previous_pt:=pt;
   end loop;
   if jsonb_array_length(line)>1 then lines:=lines||jsonb_build_array(line); end if;
 end if;
 -- Preserve the row identity and its comments/reactions when editing or re-redacting.
 insert into published_activities(id,owner_id,title,sport,started_at,summary,route,visibility,note)
 values(a.id,a.owner_id,a.title,a.sport,date_trunc('minute',a.started_at),a.summary,lines,a.visibility,a.note)
 on conflict(id) do update set title=excluded.title,sport=excluded.sport,started_at=excluded.started_at,
 summary=excluded.summary,route=excluded.route,visibility=excluded.visibility,note=excluded.note,updated_at=now();
end $$;

create or replace function public.set_privacy_zones(p_zones jsonb) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare uid uuid:=auth.uid(); z jsonb; aid uuid;
begin
 if uid is null then raise exception 'Not authorized'; end if;
 if p_zones is null or jsonb_typeof(p_zones)<>'array' or jsonb_array_length(p_zones)>50 then raise exception 'Invalid privacy zones'; end if;
 for z in select value from jsonb_array_elements(p_zones) loop
   if not(coalesce((z->>'lat')::float8 between -90 and 90,false)
      and coalesce((z->>'lng')::float8 between -180 and 180,false)
      and coalesce((z->>'radius')::float8 between 200 and 10000,false)) then raise exception 'Invalid privacy zone'; end if;
 end loop;
 delete from privacy_zones where owner_id=uid;
 for z in select value from jsonb_array_elements(p_zones) loop
   insert into privacy_zones(id,owner_id,label,center,radius)
   values((z->>'id')::uuid,uid,left(z->>'label',100),st_setsrid(st_makepoint((z->>'lng')::float8,(z->>'lat')::float8),4326)::geography,(z->>'radius')::float8);
 end loop;
 insert into athlete_settings(owner_id,settings) values(uid,jsonb_build_object('privacyZones',p_zones))
 on conflict(owner_id) do update set settings=athlete_settings.settings||excluded.settings,updated_at=now();
 for aid in select id from activities where owner_id=uid and visibility<>'private' loop perform publish_activity(aid); end loop;
end $$;

create or replace function public.save_activity(p_activity jsonb,p_raw jsonb,p_points jsonb,p_zones jsonb default null) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare uid uuid:=auth.uid(); aid uuid:=(p_activity->>'id')::uuid; existing public.activities; p jsonb; keys text[];
begin
 if uid is null or uid is distinct from (p_activity->>'owner_id')::uuid then raise exception 'Not authorized'; end if;
 select * into existing from activities where id=aid for update;
 if existing.id is not null and existing.owner_id<>uid then raise exception 'Not authorized'; end if;
 if existing.id is not null and existing.revision>(p_activity->>'revision')::integer then return; end if;
 -- NULL means metadata-only edit from another device. An empty track never erases a saved track.
 if p_raw is not null then
   if jsonb_typeof(p_raw)<>'array' or jsonb_array_length(p_raw)<2 or jsonb_array_length(p_raw)>300000
      or p_points is null or jsonb_typeof(p_points)<>'array' or jsonb_array_length(p_points)<2 or jsonb_array_length(p_points)>12000 then raise exception 'Invalid track'; end if;
   for p in select value from jsonb_array_elements(p_points) loop
     if not(coalesce((p->>'lat')::float8 between -90 and 90,false) and coalesce((p->>'lng')::float8 between -180 and 180,false)
        and coalesce((p->>'segment')::integer>=0,false)) then raise exception 'Invalid coordinate'; end if;
   end loop;
 elsif existing.id is null then raise exception 'A new activity requires its GPS track';
 end if;
 keys:=case when p_activity ? 'photo_keys' then array(select jsonb_array_elements_text(p_activity->'photo_keys')) else coalesce(existing.photo_keys,'{}') end;
 if cardinality(keys)>20 or exists(select 1 from unnest(keys) k where k not like uid::text||'/'||aid::text||'/%') then raise exception 'Invalid media ownership'; end if;
 if p_zones is not null then perform set_privacy_zones(p_zones); end if;
 insert into activities(id,owner_id,title,sport,started_at,ended_at,summary,visibility,note,rpe,revision,display_route,photo_keys)
 values(aid,uid,p_activity->>'title',(p_activity->>'sport')::activity_sport,(p_activity->>'started_at')::timestamptz,(p_activity->>'ended_at')::timestamptz,
 p_activity->'summary',(p_activity->>'visibility')::activity_visibility,coalesce(p_activity->>'note',''),(p_activity->>'rpe')::integer,
 (p_activity->>'revision')::integer,coalesce(p_points,existing.display_route,'[]'),keys)
 on conflict(id) do update set title=excluded.title,summary=excluded.summary,visibility=excluded.visibility,note=excluded.note,rpe=excluded.rpe,
 revision=excluded.revision,display_route=excluded.display_route,photo_keys=excluded.photo_keys,updated_at=now(),verified=false
 where activities.owner_id=uid and activities.revision<=excluded.revision;
 if not found then return; end if;
 if p_raw is not null then
   insert into activity_tracks(activity_id,owner_id,samples,points) values(aid,uid,p_raw,p_points)
   on conflict(activity_id) do update set samples=excluded.samples,points=excluded.points where activity_tracks.owner_id=uid;
 end if;
 perform publish_activity(aid);
end $$;
create function public.sync_clock() returns timestamptz language sql volatile as $$ select clock_timestamp() $$;
revoke all on function public.sync_clock() from public;
grant execute on function public.sync_clock() to authenticated;

-- Geometry is serialized explicitly; clients never need to decode PostGIS EWKB.
create function public.list_segments() returns table(id uuid,name text,sport public.activity_sport,points jsonb,distance double precision,ascent double precision)
language sql stable security invoker set search_path=public,extensions as $$
 select s.id,s.name,s.sport,
 (select jsonb_agg(jsonb_build_object('lng',st_x(d.geom),'lat',st_y(d.geom)) order by d.path) from st_dumppoints(s.path::geometry) d),
 s.distance,s.ascent from segments s order by s.id limit 500
$$;
revoke all on function public.list_segments() from public;
grant execute on function public.list_segments() to authenticated;

create or replace function public.are_friends(a uuid,b uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() in (a,b) and exists(select 1 from friendships where status='accepted' and
 ((requester_id=a and recipient_id=b) or (requester_id=b and recipient_id=a)))
$$;
commit;
