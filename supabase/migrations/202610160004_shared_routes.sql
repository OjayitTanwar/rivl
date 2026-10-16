begin;
-- Public copies are deliberate, coordinate-only projections of owner-held routes.
create table public.shared_routes(
 id uuid primary key references public.routes(id) on delete cascade,
 owner_id uuid not null references public.profiles on delete cascade,
 title text not null, sport public.activity_sport not null, creator text not null,
 points jsonb not null, distance double precision not null, surface text not null,
 license text not null default 'CC-BY-4.0' check(license='CC-BY-4.0'),
 published_at timestamptz not null default now(), hidden boolean not null default false,withdrawn boolean not null default false
);
create index shared_routes_recent on public.shared_routes(published_at desc,id) where not hidden;
alter table public.shared_routes enable row level security;
revoke all on public.shared_routes from public,anon,authenticated;
grant select on public.shared_routes to authenticated;
create policy shared_route_read on public.shared_routes for select to authenticated using(public.account_active() and not withdrawn and not hidden and not public.is_blocked(owner_id) and public.athlete_available(owner_id));
create function public.publish_shared_route(p_id uuid) returns void language plpgsql security definer set search_path=public,extensions as $$
declare uid uuid:=auth.uid(); r public.routes; p jsonb; coords jsonb:='[]'; pt geography; edge geography; prev geography; first_pt geography; last_pt geography; total double precision:=0; started boolean:=false; ended boolean:=false;
begin
 if not public.account_active()then raise exception 'Not authorized' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,91));
 select * into r from routes where id=p_id and owner_id=uid;
 if r.id is null then raise exception 'Route unavailable' using errcode='42501';end if;
 if r.routing='manual' then raise exception 'Direct-line routes cannot be published';end if;
 if jsonb_array_length(r.points)<2 or jsonb_array_length(r.points)>12000 then raise exception 'Route needs 2 to 12000 points';end if;
 if exists(select 1 from shared_routes where id=p_id and hidden) then raise exception 'Route paused for review' using errcode='42501';end if;
 if not exists(select 1 from shared_routes where id=p_id) and(select count(*)from shared_routes where owner_id=uid)>=100 then raise exception 'Shared route limit reached';end if;
 for p in select value from jsonb_array_elements(r.points)loop
  if jsonb_typeof(p->'lat')is distinct from 'number' or jsonb_typeof(p->'lng')is distinct from 'number' or (p->>'lat')::float8 not between -85 and 85 or(p->>'lng')::float8 not between -180 and 180 then raise exception 'Invalid route coordinate';end if;
 end loop;
 first_pt:=st_setsrid(st_makepoint((r.points->0->>'lng')::float8,(r.points->0->>'lat')::float8),4326)::geography;
 last_pt:=st_setsrid(st_makepoint((r.points->-1->>'lng')::float8,(r.points->-1->>'lat')::float8),4326)::geography;
 for p in select value from jsonb_array_elements(r.points)loop
  pt:=st_setsrid(st_makepoint((p->>'lng')::float8,(p->>'lat')::float8),4326)::geography;
  if st_dwithin(pt,first_pt,200) or st_dwithin(pt,last_pt,200)then
   if started then ended:=true;end if;
   continue;
  end if;
  if ended then raise exception 'Route crosses its hidden endpoints; choose a different route';end if;
  if exists(select 1 from privacy_zones z where z.owner_id=uid and st_dwithin(pt,z.center,z.radius))then raise exception 'Route crosses a privacy zone';end if;
  if prev is not null then
   edge:=st_makeline(prev::geometry,pt::geometry)::geography;
   if st_dwithin(edge,first_pt,200)or st_dwithin(edge,last_pt,200)or exists(select 1 from privacy_zones z where z.owner_id=uid and st_dwithin(edge,z.center,z.radius))then raise exception 'Route crosses a hidden area';end if;
   if st_distance(prev,pt)>2000 then raise exception 'Route contains a GPS gap';end if;
   total:=total+st_distance(prev,pt);
  end if;
  coords:=coords||jsonb_build_array(jsonb_build_object('lat',(p->>'lat')::float8,'lng',(p->>'lng')::float8));prev:=pt;started:=true;
 end loop;
 if jsonb_array_length(coords)<2 or total<100 then raise exception 'Route is too short after hiding endpoints';end if;
 insert into shared_routes(id,owner_id,title,sport,creator,points,distance,surface)values(r.id,uid,r.name,r.sport,(select name from profiles where id=uid),coords,total,r.surface)
 on conflict(id)do update set title=excluded.title,sport=excluded.sport,creator=excluded.creator,points=excluded.points,distance=excluded.distance,surface=excluded.surface,published_at=now(),withdrawn=false;
end $$;
create function public.unpublish_shared_route(p_id uuid)returns void language plpgsql security definer set search_path=public as $$begin
 if not public.account_active()then raise exception 'Not authorized' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,91));
 update shared_routes set withdrawn=true where id=p_id and owner_id=auth.uid();
end $$;
create function public.list_shared_routes(p_sport public.activity_sport default null,p_before timestamptz default null,p_before_id uuid default null)returns setof public.shared_routes language sql stable security invoker set search_path=public as $$
 select * from shared_routes where(p_sport is null or sport=p_sport)and(p_before is null or(published_at,id)<(p_before,p_before_id))order by published_at desc,id desc limit 20
$$;
-- Changing privacy protection immediately retracts old route projections; republish explicitly.
create function public.retract_shared_routes_for_zone()returns trigger language plpgsql security definer set search_path=public as $$begin perform pg_advisory_xact_lock(hashtextextended(coalesce(new.owner_id,old.owner_id)::text,91));update shared_routes set withdrawn=true where owner_id=coalesce(new.owner_id,old.owner_id);return null;end $$;
create trigger shared_route_zone_change after insert or update or delete on public.privacy_zones for each row execute function public.retract_shared_routes_for_zone();
create function public.retract_changed_shared_route()returns trigger language plpgsql security definer set search_path=public as $$begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,91));
 if (new.points,new.name,new.sport,new.surface,new.routing) is distinct from (old.points,old.name,old.sport,old.surface,old.routing) then update shared_routes set withdrawn=true where id=new.id;end if;return null;end $$;
create trigger shared_route_source_change after update on public.routes for each row execute function public.retract_changed_shared_route();
revoke all on function public.retract_changed_shared_route()from public,anon,authenticated;
create table public.shared_route_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.profiles on delete cascade,route_id uuid not null references public.shared_routes on delete cascade,reason text not null check(reason in('unsafe','privacy','spam','other')),created_at timestamptz not null default now(),unique(reporter_id,route_id));
alter table public.shared_route_reports enable row level security;
revoke all on public.shared_route_reports from public,anon,authenticated;
create function public.report_shared_route(p_id uuid,p_reason text)returns void language plpgsql security definer set search_path=public as $$begin
 if not public.account_active()or not exists(select 1 from shared_routes s where s.id=p_id and not s.hidden and not s.withdrawn and not exists(select 1 from account_deletions d where d.owner_id=s.owner_id) and not public.is_blocked(s.owner_id))then raise exception 'Route unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,92));
 if(select count(*)from shared_route_reports where reporter_id=auth.uid()and created_at>now()-interval '1 hour')>=10 then raise exception 'Report limit reached';end if;
 insert into shared_route_reports(reporter_id,route_id,reason)values(auth.uid(),p_id,p_reason)on conflict(reporter_id,route_id)do nothing;
end $$;
create function public.moderate_shared_route(p_id uuid,p_hidden boolean)returns void language sql security definer set search_path=public as $$update shared_routes set hidden=p_hidden where id=p_id$$;
revoke all on function public.publish_shared_route(uuid),public.unpublish_shared_route(uuid),public.list_shared_routes(public.activity_sport,timestamptz,uuid),public.report_shared_route(uuid,text),public.retract_shared_routes_for_zone(),public.moderate_shared_route(uuid,boolean)from public,anon,authenticated;
grant execute on function public.publish_shared_route(uuid),public.unpublish_shared_route(uuid),public.list_shared_routes(public.activity_sport,timestamptz,uuid),public.report_shared_route(uuid,text)to authenticated;
grant execute on function public.moderate_shared_route(uuid,boolean)to service_role;
grant all on public.shared_routes,public.shared_route_reports to service_role;
commit;
