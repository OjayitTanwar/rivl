begin;
-- Deliberate foreground sharing. Only the latest point exists; there is no route archive.
create table public.live_shares (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles on delete cascade unique,
 started_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 stopped_at timestamptz,
 lat double precision, lng double precision, accuracy double precision,
 sampled_at timestamptz, received_at timestamptz,
 check(expires_at > started_at and expires_at <= started_at + interval '1 hour')
);
create table public.live_share_recipients (
 share_id uuid not null references public.live_shares on delete cascade,
 recipient_id uuid not null references public.profiles on delete cascade,
 primary key(share_id,recipient_id)
);
create index live_share_recipient_lookup on public.live_share_recipients(recipient_id,share_id);
alter table public.live_shares enable row level security;
alter table public.live_share_recipients enable row level security;
revoke all on public.live_shares, public.live_share_recipients from public,anon,authenticated;
grant all on public.live_shares, public.live_share_recipients to service_role;

create function public.start_live_share(p_recipients uuid[]) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); sid uuid; start_time timestamptz:=clock_timestamp();
begin
 if not public.account_active() then raise exception 'Account unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,96));
 if coalesce(cardinality(p_recipients),0) not between 1 and 10 or array_position(p_recipients,null) is not null
 or (select count(distinct r) from unnest(p_recipients) r) <> cardinality(p_recipients)
 or exists(select 1 from unnest(p_recipients) r where r=uid or not public.are_friends(uid,r) or public.is_blocked(r) or not exists(select 1 from profiles where id=r) or exists(select 1 from account_deletions where owner_id=r)) then
  raise exception 'Select up to ten accepted friends' using errcode='42501';end if;
 delete from live_shares where owner_id=uid;
 insert into live_shares(owner_id,started_at,expires_at) values(uid,start_time,start_time+interval '1 hour') returning id into sid;
 insert into live_share_recipients(share_id,recipient_id) select sid,r from unnest(p_recipients) r;
 return jsonb_build_object('id',sid,'owner_id',uid,'started_at',start_time,'expires_at',start_time+interval '1 hour','recipient_count',cardinality(p_recipients));
end $$;
create function public.update_live_share(p_id uuid,p_lat double precision,p_lng double precision,p_accuracy double precision,p_sampled_at timestamptz) returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
 if not public.account_active() then raise exception 'Account unavailable' using errcode='42501';end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_sampled_at is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180) or not(p_accuracy between 0 and 100)
 or p_sampled_at < clock_timestamp()-interval '60 seconds' or p_sampled_at > clock_timestamp()+interval '10 seconds' then raise exception 'Fresh accurate GPS required';end if;
 -- Row lock serializes a late update against stop. Stopped/expired IDs cannot revive.
 perform 1 from live_shares where id=p_id and owner_id=auth.uid() and stopped_at is null and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Sharing ended' using errcode='42501';end if;
 update live_shares set lat=p_lat,lng=p_lng,accuracy=p_accuracy,sampled_at=p_sampled_at,received_at=clock_timestamp()
 where id=p_id and owner_id=auth.uid() and stopped_at is null and expires_at>clock_timestamp()
 and (sampled_at is null or p_sampled_at>sampled_at) and (received_at is null or received_at<clock_timestamp()-interval '5 seconds');
 get diagnostics changed=row_count;return changed=1;
end $$;
create function public.stop_live_share(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 -- Permit stopping even when deletion is queued; this never grants location reads.
 if auth.uid() is null then raise exception 'Sign in' using errcode='42501';end if;
 update live_shares set stopped_at=clock_timestamp(),lat=null,lng=null,accuracy=null,sampled_at=null,received_at=null where id=p_id and owner_id=auth.uid();
 delete from live_share_recipients where share_id=p_id and exists(select 1 from live_shares where id=p_id and owner_id=auth.uid());
end $$;
create function public.list_live_shares() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'owner_id',s.owner_id,'name',p.name,'started_at',s.started_at,'expires_at',s.expires_at,'lat',s.lat,'lng',s.lng,'accuracy',s.accuracy,'sampled_at',s.sampled_at,'received_at',s.received_at,'recipient_count',(select count(*) from live_share_recipients r where r.share_id=s.id)) order by s.started_at desc),'[]'::jsonb)
 from (select x.* from live_shares x where x.owner_id=auth.uid() or exists(select 1 from live_share_recipients rx where rx.share_id=x.id and rx.recipient_id=auth.uid()) order by (x.owner_id=auth.uid()) desc,x.started_at desc limit 101) s join profiles p on p.id=s.owner_id
 where public.account_active() and s.stopped_at is null and s.expires_at>now() and not exists(select 1 from account_deletions where owner_id=s.owner_id)
 and (s.owner_id=auth.uid() or (public.are_friends(auth.uid(),s.owner_id) and not public.is_blocked(s.owner_id) and exists(select 1 from live_share_recipients r where r.share_id=s.id and r.recipient_id=auth.uid())))
$$;
create function public.live_share_friends() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id),'[]'::jsonb) from (select p.id,p.name from profiles p where public.account_active() and p.id<>auth.uid() and public.are_friends(auth.uid(),p.id) and not public.is_blocked(p.id) and not exists(select 1 from account_deletions where owner_id=p.id) order by p.name,p.id limit 100) p
$$;
-- Removing a friendship or blocking permanently revokes that session's grant.
create function public.revoke_live_share_relationship() returns trigger language plpgsql security definer set search_path=public as $$
declare first_id uuid;second_id uuid;
begin
 if tg_table_name='athlete_blocks' then first_id:=new.blocker_id;second_id:=new.blocked_id;
 else
  if tg_op='UPDATE' and new.status='accepted' then return null;end if;
  first_id:=old.requester_id;second_id:=old.recipient_id;
 end if;
 delete from live_share_recipients r using live_shares s where r.share_id=s.id and ((s.owner_id=first_id and r.recipient_id=second_id)or(s.owner_id=second_id and r.recipient_id=first_id));
 return null;
end $$;
create trigger live_share_block_revoke after insert on public.athlete_blocks for each row execute function public.revoke_live_share_relationship();
create trigger live_share_friend_revoke after delete or update on public.friendships for each row execute function public.revoke_live_share_relationship();
revoke all on function public.revoke_live_share_relationship() from public,anon,authenticated;
revoke all on function public.start_live_share(uuid[]),public.update_live_share(uuid,double precision,double precision,double precision,timestamptz),public.stop_live_share(uuid),public.list_live_shares(),public.live_share_friends() from public,anon,authenticated;
grant execute on function public.start_live_share(uuid[]),public.update_live_share(uuid,double precision,double precision,double precision,timestamptz),public.stop_live_share(uuid),public.list_live_shares(),public.live_share_friends() to authenticated;
commit;
