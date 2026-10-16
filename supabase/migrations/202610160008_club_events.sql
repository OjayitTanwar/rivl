begin;
-- Owner membership cannot be removed through the older direct join/leave adapter.
create policy club_owner_cannot_leave on public.club_members as restrictive for delete to authenticated using(not exists(select 1 from public.clubs c where c.id=club_members.club_id and c.owner_id=club_members.athlete_id));
-- There is no legitimate client-side membership move; join/leave remains insert/delete.
revoke update on public.club_members from authenticated;
revoke insert,update on public.clubs from authenticated;
create table public.club_roles(club_id uuid not null,athlete_id uuid not null,role text not null check(role='moderator'),primary key(club_id,athlete_id),foreign key(club_id,athlete_id) references public.club_members(club_id,athlete_id) on delete cascade);
create table public.club_events(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs on delete cascade,
 creator_id uuid not null references public.profiles on delete cascade,title text not null check(public.valid_athlete_text(title,100,true)),
 meeting_point text not null check(public.valid_athlete_text(meeting_point,240,true)),
 starts_at timestamptz not null,ends_at timestamptz not null,time_zone text not null,
 capacity integer not null check(capacity between 1 and 500),cancelled_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours')
);
create index club_events_upcoming on public.club_events(club_id,starts_at,id);
create table public.club_event_rsvps(event_id uuid not null references public.club_events on delete cascade,athlete_id uuid not null references public.profiles on delete cascade,created_at timestamptz not null default clock_timestamp(),primary key(event_id,athlete_id));
alter table public.club_roles enable row level security;alter table public.club_events enable row level security;alter table public.club_event_rsvps enable row level security;
revoke all on public.club_roles,public.club_events,public.club_event_rsvps from public,anon,authenticated;
grant all on public.club_roles,public.club_events,public.club_event_rsvps to service_role;
create function public.club_actor_role(p_club uuid) returns text language sql stable security definer set search_path=public as $$
 select case when c.owner_id=auth.uid()then 'owner' when exists(select 1 from club_roles r where r.club_id=c.id and r.athlete_id=auth.uid())then 'moderator' when exists(select 1 from club_members m where m.club_id=c.id and m.athlete_id=auth.uid())then 'member' else 'visitor' end from clubs c where public.account_active() and not public.is_blocked(c.owner_id) and not exists(select 1 from account_deletions where owner_id=c.owner_id) and c.id=p_club
$$;
create function public.create_club(p_name text,p_description text)returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
 if not public.account_active()then raise exception 'Account unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,98));
 if not public.valid_athlete_text(p_name,80,true)or not public.valid_athlete_text(p_description,500,false)then raise exception 'Enter a club name and short description';end if;
 if(select count(*)from clubs where owner_id=auth.uid())>=5 then raise exception 'Club limit reached';end if;
 insert into clubs(owner_id,name,description)values(auth.uid(),trim(p_name),trim(p_description))returning id into cid;
 insert into club_members(club_id,athlete_id)values(cid,auth.uid());return cid;
end $$;
create function public.club_detail(p_club uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor text:=public.club_actor_role(p_club);result jsonb;
begin
 if actor is null then raise exception 'Club unavailable' using errcode='42501';end if;
 select jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'owner_id',c.owner_id,'role',actor,'member_count',(select count(*)from club_members m where m.club_id=c.id),'members',case when actor in('owner','moderator','member')then(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',case when p.id=c.owner_id then 'owner' when r.role is not null then 'moderator' else 'member'end)order by p.name,p.id),'[]')from(select m.athlete_id from club_members m where m.club_id=c.id order by m.joined_at,m.athlete_id limit 100)m join profiles p on p.id=m.athlete_id left join club_roles r on r.club_id=c.id and r.athlete_id=p.id where not public.is_blocked(p.id)and not exists(select 1 from account_deletions where owner_id=p.id))else '[]'::jsonb end,'events',case when actor in('owner','moderator','member')then(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'meeting_point',e.meeting_point,'starts_at',e.starts_at,'ends_at',e.ends_at,'time_zone',e.time_zone,'capacity',e.capacity,'cancelled',e.cancelled_at is not null,'attending',(select count(*)from club_event_rsvps a where a.event_id=e.id),'rsvp',exists(select 1 from club_event_rsvps a where a.event_id=e.id and a.athlete_id=auth.uid()))order by e.starts_at,e.id),'[]')from(select *from club_events where club_id=c.id and ends_at>now()-interval '7 days' order by starts_at,id limit 50)e where not public.is_blocked(e.creator_id)and not exists(select 1 from account_deletions where owner_id=e.creator_id))else '[]'::jsonb end)into result from clubs c where c.id=p_club;return result;
end $$;
create function public.set_club_membership(p_club uuid,p_join boolean)returns void language plpgsql security definer set search_path=public as $$
declare actor text;
begin
 perform 1 from clubs where id=p_club for update;actor:=public.club_actor_role(p_club);
 if actor is null then raise exception 'Club unavailable' using errcode='42501';end if;
 if p_join then insert into club_members(club_id,athlete_id)values(p_club,auth.uid())on conflict do nothing;
 else
  if actor='owner'then raise exception 'Transfer ownership before leaving';end if;
  delete from club_event_rsvps a using club_events e where a.event_id=e.id and e.club_id=p_club and a.athlete_id=auth.uid() and e.starts_at>clock_timestamp();
  delete from club_members where club_id=p_club and athlete_id=auth.uid();
 end if;
end $$;
create function public.set_club_role(p_club uuid,p_athlete uuid,p_role text)returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from clubs where id=p_club for update;
 if public.club_actor_role(p_club)is distinct from 'owner'or p_athlete=auth.uid()then raise exception 'Only the owner can change other members roles' using errcode='42501';end if;
 if p_role not in('member','moderator','owner')or p_role is null or not exists(select 1 from club_members where club_id=p_club and athlete_id=p_athlete)or public.is_blocked(p_athlete)or exists(select 1 from account_deletions where owner_id=p_athlete)then raise exception 'Choose an active club member';end if;
 if p_role='owner'then update clubs set owner_id=p_athlete where id=p_club;delete from club_roles where club_id=p_club and athlete_id=p_athlete;
 elsif p_role='moderator'then insert into club_roles(club_id,athlete_id,role)values(p_club,p_athlete,'moderator')on conflict do nothing;
 else delete from club_roles where club_id=p_club and athlete_id=p_athlete;end if;
end $$;
create function public.create_club_event(p_club uuid,p_title text,p_meeting_point text,p_start timestamptz,p_duration integer,p_time_zone text,p_capacity integer)returns uuid language plpgsql security definer set search_path=public as $$
declare eid uuid;
begin
 perform 1 from clubs where id=p_club for update;
 if coalesce(public.club_actor_role(p_club),'visitor')not in('owner','moderator')then raise exception 'Organizer access required' using errcode='42501';end if;
 if not public.valid_athlete_text(p_title,100,true)or not public.valid_athlete_text(p_meeting_point,240,true)or p_start is null or p_start<clock_timestamp()+interval '1 minute'or p_start>clock_timestamp()+interval '365 days'or p_duration is null or p_duration not between 5 and 1440 or p_capacity is null or p_capacity not between 1 and 500 or p_time_zone is null or not exists(select 1 from pg_timezone_names where name=p_time_zone)then raise exception 'Choose valid future event details';end if;
 if(select count(*)from club_events where club_id=p_club and cancelled_at is null and starts_at>clock_timestamp())>=20 then raise exception 'Twenty upcoming events maximum';end if;
 if(select count(*)from club_events where club_id=p_club and created_at>clock_timestamp()-interval '1 day')>=20 then raise exception 'Daily event limit reached';end if;
 insert into club_events(club_id,creator_id,title,meeting_point,starts_at,ends_at,time_zone,capacity)values(p_club,auth.uid(),trim(p_title),trim(p_meeting_point),p_start,p_start+make_interval(mins=>p_duration),p_time_zone,p_capacity)returning id into eid;return eid;
end $$;
create function public.club_event_rsvp(p_event uuid,p_attending boolean)returns void language plpgsql security definer set search_path=public as $$
declare e public.club_events;actor text;cid uuid;
begin
 select club_id into cid from club_events where id=p_event;
 perform 1 from clubs where id=cid for update;
 actor:=public.club_actor_role(cid);
 -- Lock the consenting membership against the legacy direct DELETE adapter.
 if actor is distinct from 'owner' then
  perform 1 from club_members where club_id=cid and athlete_id=auth.uid() for key share;
  if not found then raise exception 'Member access required' using errcode='42501';end if;
 end if;
 select *into e from club_events where id=p_event for update;
 if e.id is null or actor is null or actor='visitor'or public.is_blocked(e.creator_id)or exists(select 1 from account_deletions where owner_id=e.creator_id)then raise exception 'Member access required' using errcode='42501';end if;
 if p_attending then
  if e.cancelled_at is not null or e.starts_at<=clock_timestamp()then raise exception 'Event is no longer accepting responses';end if;
  if exists(select 1 from club_event_rsvps where event_id=e.id and athlete_id=auth.uid())then return;end if;
  if(select count(*)from club_event_rsvps where event_id=e.id)>=e.capacity then raise exception 'Event is full';end if;
  insert into club_event_rsvps(event_id,athlete_id)values(e.id,auth.uid());
 else delete from club_event_rsvps where event_id=e.id and athlete_id=auth.uid();end if;
end $$;
create function public.cancel_club_event(p_event uuid)returns void language plpgsql security definer set search_path=public as $$
declare e public.club_events;
begin
 select *into e from club_events where id=p_event for update;
 if e.id is null or coalesce(public.club_actor_role(e.club_id),'visitor')not in('owner','moderator')then raise exception 'Organizer access required' using errcode='42501';end if;
 if e.ends_at<=clock_timestamp()then raise exception 'Past events cannot be cancelled';end if;
 update club_events set cancelled_at=clock_timestamp()where id=p_event and cancelled_at is null;
end $$;
-- The legacy join/leave adapter still uses club_members directly. Keep RSVPs and
-- moderator roles consistent when it removes a membership outside the new RPC.
create function public.club_member_leave_cleanup()returns trigger language plpgsql security definer set search_path=public as $$begin
 delete from club_event_rsvps a using club_events e where a.event_id=e.id and e.club_id=old.club_id and a.athlete_id=old.athlete_id and e.starts_at>clock_timestamp();return null;end $$;
create trigger club_member_rsvp_cleanup after delete on public.club_members for each row execute function public.club_member_leave_cleanup();
revoke all on function public.club_member_leave_cleanup(),public.club_actor_role(uuid),public.create_club(text,text),public.club_detail(uuid),public.set_club_membership(uuid,boolean),public.set_club_role(uuid,uuid,text),public.create_club_event(uuid,text,text,timestamptz,integer,text,integer),public.club_event_rsvp(uuid,boolean),public.cancel_club_event(uuid)from public,anon,authenticated;
grant execute on function public.create_club(text,text),public.club_detail(uuid),public.set_club_membership(uuid,boolean),public.set_club_role(uuid,uuid,text),public.create_club_event(uuid,text,text,timestamptz,integer,text,integer),public.club_event_rsvp(uuid,boolean),public.cancel_club_event(uuid)to authenticated;
commit;
