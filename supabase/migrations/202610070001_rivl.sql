-- RIVL: private source data; separate server-redacted community projection.
begin;
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create type public.activity_sport as enum ('run','ride','walk','hike');
create type public.activity_visibility as enum ('private','friends','public');
create table public.profiles(
 id uuid primary key references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 100),
 handle text not null check(length(handle) between 1 and 100),
 bio text not null default '', created_at timestamptz not null default now()
);
create table public.athlete_settings(
 owner_id uuid primary key references public.profiles on delete cascade,
 settings jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table public.privacy_zones(
 id uuid primary key, owner_id uuid not null references public.profiles on delete cascade,
 label text not null, center extensions.geography(Point,4326) not null,
 radius double precision not null check(radius between 200 and 10000)
);
create index privacy_zones_owner on public.privacy_zones(owner_id);
create index privacy_zones_geo on public.privacy_zones using gist(center);
create table public.activities(
 id uuid primary key, owner_id uuid not null references public.profiles on delete cascade,
 title text not null check(length(title) between 1 and 200),sport public.activity_sport not null,
 started_at timestamptz not null,ended_at timestamptz not null check(ended_at>=started_at),
 summary jsonb not null, display_route jsonb not null default '[]',visibility public.activity_visibility not null default 'private',
 note text not null default '' check(length(note)<=10000),rpe integer not null check(rpe between 1 and 10),
 revision integer not null default 1, verified boolean not null default false,
 updated_at timestamptz not null default now()
);
create index activities_owner_time on public.activities(owner_id,started_at desc);
create index activities_sync on public.activities(owner_id,updated_at);
create table public.activity_tracks(
 activity_id uuid primary key references public.activities on delete cascade,
 owner_id uuid not null references public.profiles on delete cascade,
 encoding text not null default 'delta-e7-ms-v1',samples jsonb not null,
 points jsonb not null,created_at timestamptz not null default now()
);
create table public.friendships(
 requester_id uuid references public.profiles on delete cascade,recipient_id uuid references public.profiles on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted')),
 primary key(requester_id,recipient_id),check(requester_id<>recipient_id)
);
create table public.published_activities(
 id uuid primary key references public.activities on delete cascade,owner_id uuid not null references public.profiles on delete cascade,
 title text not null,sport public.activity_sport not null,started_at timestamptz not null,summary jsonb not null,
 route jsonb not null default '[]',visibility public.activity_visibility not null,note text not null default '',
 updated_at timestamptz not null default now()
);
create index published_time on public.published_activities(started_at desc);
create table public.reactions(activity_id uuid references public.published_activities on delete cascade,athlete_id uuid references public.profiles on delete cascade,created_at timestamptz not null default now(),primary key(activity_id,athlete_id));
create table public.comments(id uuid primary key default gen_random_uuid(),activity_id uuid not null references public.published_activities on delete cascade,athlete_id uuid not null references public.profiles on delete cascade,body text not null check(length(body) between 1 and 2000),created_at timestamptz not null default now());
create table public.clubs(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles on delete cascade,name text not null,description text not null default '');
create table public.club_members(club_id uuid references public.clubs on delete cascade,athlete_id uuid references public.profiles on delete cascade,joined_at timestamptz not null default now(),primary key(club_id,athlete_id));
create table public.routes(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles on delete cascade,name text not null,sport public.activity_sport not null,points jsonb not null,distance double precision not null,ascent double precision not null,surface text not null default '',saved boolean not null default true);
create table public.segments(id uuid primary key default gen_random_uuid(),name text not null,sport public.activity_sport not null,path extensions.geography(LineString,4326) not null,distance double precision not null,ascent double precision not null default 0);
create index segments_geo on public.segments using gist(path);
create table public.segment_efforts(id uuid primary key default gen_random_uuid(),segment_id uuid not null references public.segments on delete cascade,athlete_id uuid not null references public.profiles on delete cascade,activity_id uuid not null references public.activities on delete cascade,seconds double precision not null check(seconds>0),previous double precision,expected double precision,age_group integer,verified boolean not null default false,created_at timestamptz not null default now(),unique(segment_id,activity_id));
create index segment_efforts_ranking on public.segment_efforts(segment_id,seconds) where verified;
create table public.challenges(id uuid primary key default gen_random_uuid(),title text not null,kind text not null check(kind in ('distance','ascent','days')),target double precision not null check(target>0),starts_at timestamptz not null,ends_at timestamptz not null);
create table public.challenge_members(challenge_id uuid references public.challenges on delete cascade,athlete_id uuid references public.profiles on delete cascade,primary key(challenge_id,athlete_id));
create table public.leagues(id uuid primary key default gen_random_uuid(),club_id uuid references public.clubs on delete cascade,name text not null,starts_at timestamptz not null,ends_at timestamptz not null);
create table public.health_samples(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles on delete cascade,source text not null,kind text not null,value double precision not null,recorded_at timestamptz not null);
create table public.device_tokens(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles on delete cascade,token text not null unique);
create table public.coach_reports(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles on delete cascade,activity_id uuid references public.activities on delete cascade,facts jsonb not null,narrative text not null,created_at timestamptz not null default now());

-- Explicit RLS on every application table.
do $$ declare t text; begin foreach t in array array['profiles','athlete_settings','privacy_zones','activities','activity_tracks','friendships','published_activities','reactions','comments','clubs','club_members','routes','segments','segment_efforts','challenges','challenge_members','leagues','health_samples','device_tokens','coach_reports'] loop execute format('alter table public.%I enable row level security',t);end loop;end $$;
create policy profiles_read on public.profiles for select to authenticated using(true);
create policy profiles_write on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
do $$ declare t text; begin foreach t in array array['athlete_settings','privacy_zones','activities','activity_tracks','routes','health_samples','device_tokens','coach_reports'] loop execute format('create policy owner_only on public.%I for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid())',t);end loop;end $$;
create policy friendship_read on public.friendships for select to authenticated using(auth.uid() in (requester_id,recipient_id));
create policy friendship_request on public.friendships for insert to authenticated with check(requester_id=auth.uid() and status='pending');
create policy friendship_accept on public.friendships for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid() and status='accepted');
create policy friendship_remove on public.friendships for delete to authenticated using(auth.uid() in (requester_id,recipient_id));
create function public.are_friends(a uuid,b uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from friendships where status='accepted' and ((requester_id=a and recipient_id=b) or(requester_id=b and recipient_id=a))) $$;
revoke all on function public.are_friends(uuid,uuid) from public;grant execute on function public.are_friends(uuid,uuid) to authenticated;
create policy published_read on public.published_activities for select to authenticated using(owner_id=auth.uid() or visibility='public' or(visibility='friends' and public.are_friends(owner_id,auth.uid())));
create policy reaction_read on public.reactions for select to authenticated using(exists(select 1 from public.published_activities p where p.id=activity_id));
create policy reaction_insert on public.reactions for insert to authenticated with check(athlete_id=auth.uid() and exists(select 1 from public.published_activities p where p.id=activity_id));
create policy reaction_delete on public.reactions for delete to authenticated using(athlete_id=auth.uid());
create policy comment_read on public.comments for select to authenticated using(exists(select 1 from public.published_activities p where p.id=activity_id));
create policy comment_insert on public.comments for insert to authenticated with check(athlete_id=auth.uid() and exists(select 1 from public.published_activities p where p.id=activity_id));
create policy comment_delete on public.comments for delete to authenticated using(athlete_id=auth.uid());
create policy clubs_read on public.clubs for select to authenticated using(true);
create policy clubs_write on public.clubs for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy members_read on public.club_members for select to authenticated using(true);
create policy members_write on public.club_members for all to authenticated using(athlete_id=auth.uid()) with check(athlete_id=auth.uid());
create policy segments_read on public.segments for select to authenticated using(true);
create policy efforts_read on public.segment_efforts for select to authenticated using(verified or athlete_id=auth.uid());
create policy challenges_read on public.challenges for select to authenticated using(true);
create policy challenge_members_read on public.challenge_members for select to authenticated using(athlete_id=auth.uid());
create policy challenge_members_write on public.challenge_members for all to authenticated using(athlete_id=auth.uid()) with check(athlete_id=auth.uid());
create policy leagues_read on public.leagues for select to authenticated using(exists(select 1 from public.club_members where club_id=leagues.club_id and athlete_id=auth.uid()));
-- No client writes to segment rankings or server-verified flags.
revoke insert,update,delete on public.segment_efforts,public.segments,public.challenges,public.leagues,public.published_activities from authenticated;
revoke update on public.activities from authenticated;
grant update(title,note,visibility,rpe) on public.activities to authenticated;

-- Server redaction uses geography metres, erases endpoints, and keeps disjoint runs.
create function public.publish_activity(p_id uuid) returns void language plpgsql security definer set search_path=public,extensions as $$
declare a public.activities;pts jsonb;p jsonb;first_pt geography;last_pt geography;pt geography;hidden boolean;last_segment integer:=null;group_id integer:=0;line jsonb:='[]';lines jsonb:='[]';
begin
 select * into a from public.activities where id=p_id;
 if not found then return;end if;
 if auth.uid() is distinct from a.owner_id then raise exception 'Not authorized';end if;
 delete from public.published_activities where id=p_id;
 if a.visibility='private' then return;end if;
 select points into pts from public.activity_tracks where activity_id=p_id;
 if jsonb_array_length(pts)>0 then
 first_pt:=st_setsrid(st_makepoint((pts->0->>'lng')::float8,(pts->0->>'lat')::float8),4326)::geography;
 last_pt:=st_setsrid(st_makepoint((pts->-1->>'lng')::float8,(pts->-1->>'lat')::float8),4326)::geography;
 for p in select value from jsonb_array_elements(pts) loop
 pt:=st_setsrid(st_makepoint((p->>'lng')::float8,(p->>'lat')::float8),4326)::geography;
 hidden:=st_dwithin(pt,first_pt,200) or st_dwithin(pt,last_pt,200) or exists(select 1 from public.privacy_zones z where z.owner_id=a.owner_id and st_dwithin(pt,z.center,z.radius));
 if hidden or last_segment is distinct from (p->>'segment')::integer then
 if jsonb_array_length(line)>1 then lines:=lines||jsonb_build_array(line);end if;line:='[]';group_id:=group_id+1;end if;
 if not hidden then line:=line||jsonb_build_array(jsonb_build_object('lat',(p->>'lat')::float8,'lng',(p->>'lng')::float8,'segment',group_id,'t',0,'accuracy',0));end if;
 last_segment:=(p->>'segment')::integer;
 end loop;
 if jsonb_array_length(line)>1 then lines:=lines||jsonb_build_array(line);end if;
 end if;
 insert into public.published_activities(id,owner_id,title,sport,started_at,summary,route,visibility,note) values(a.id,a.owner_id,a.title,a.sport,date_trunc('minute',a.started_at),a.summary,lines,a.visibility,a.note);
end $$;
revoke all on function public.publish_activity(uuid) from public;grant execute on function public.publish_activity(uuid) to authenticated;

create function public.save_activity(p_activity jsonb,p_raw jsonb,p_points jsonb,p_zones jsonb default '[]') returns void language plpgsql security definer set search_path=public,extensions as $$
declare uid uuid:=auth.uid();aid uuid:=(p_activity->>'id')::uuid;z jsonb;existing_owner uuid;
begin
 if uid is null or uid<>(p_activity->>'owner_id')::uuid then raise exception 'Not authorized';end if;
 select owner_id into existing_owner from activities where id=aid;
 if existing_owner is not null and existing_owner<>uid then raise exception 'Not authorized';end if;
 if jsonb_typeof(p_raw)<>'array' or jsonb_typeof(p_points)<>'array' or jsonb_array_length(p_points)>300000 then raise exception 'Invalid track';end if;
 insert into activities(id,owner_id,title,sport,started_at,ended_at,summary,visibility,note,rpe,revision,display_route)
 values(aid,uid,p_activity->>'title',(p_activity->>'sport')::activity_sport,(p_activity->>'started_at')::timestamptz,(p_activity->>'ended_at')::timestamptz,p_activity->'summary',(p_activity->>'visibility')::activity_visibility,coalesce(p_activity->>'note',''),(p_activity->>'rpe')::integer,(p_activity->>'revision')::integer,p_points)
 on conflict(id) do update set title=excluded.title,summary=excluded.summary,visibility=excluded.visibility,note=excluded.note,rpe=excluded.rpe,revision=excluded.revision,display_route=excluded.display_route,updated_at=now(),verified=false where activities.owner_id=uid and activities.revision<=excluded.revision;
 if not found then return;end if;
 insert into activity_tracks(activity_id,owner_id,samples,points) values(aid,uid,p_raw,p_points) on conflict(activity_id) do update set samples=excluded.samples,points=excluded.points where activity_tracks.owner_id=uid;
 perform publish_activity(aid);
end $$;
revoke all on function public.save_activity(jsonb,jsonb,jsonb,jsonb) from public;grant execute on function public.save_activity(jsonb,jsonb,jsonb,jsonb) to authenticated;
create function public.set_privacy_zones(p_zones jsonb) returns void language plpgsql security definer set search_path=public,extensions as $$
declare uid uuid:=auth.uid();z jsonb;aid uuid;begin
 if uid is null then raise exception 'Not authorized';end if;
 if jsonb_array_length(p_zones)>50 then raise exception 'Too many zones';end if;
 delete from privacy_zones where owner_id=uid;
 for z in select value from jsonb_array_elements(p_zones) loop
 insert into privacy_zones(id,owner_id,label,center,radius) values((z->>'id')::uuid,uid,z->>'label',st_setsrid(st_makepoint((z->>'lng')::float8,(z->>'lat')::float8),4326)::geography,(z->>'radius')::float8);
 end loop;
 for aid in select id from activities where owner_id=uid and visibility<>'private' loop perform publish_activity(aid);end loop;
end $$;
revoke all on function public.set_privacy_zones(jsonb) from public;grant execute on function public.set_privacy_zones(jsonb) to authenticated;

insert into storage.buckets(id,name,public) values('activity-media','activity-media',false) on conflict(id) do nothing;
create policy media_owner_select on storage.objects for select to authenticated using(bucket_id='activity-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_owner_insert on storage.objects for insert to authenticated with check(bucket_id='activity-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_owner_update on storage.objects for update to authenticated using(bucket_id='activity-media' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='activity-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_owner_delete on storage.objects for delete to authenticated using(bucket_id='activity-media' and (storage.foldername(name))[1]=auth.uid()::text);
-- Realtime subscriptions are subject to the same RLS.
alter publication supabase_realtime add table public.published_activities,public.comments,public.reactions;
commit;
