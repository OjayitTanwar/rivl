begin;
create table public.account_deletions(
 owner_id uuid primary key,
 state text not null default 'requested' check(state in ('requested','processing','failed','completed')),
 requested_at timestamptz not null default now(), completed_at timestamptz,
 attempts integer not null default 0, lease_until timestamptz, lease_token uuid,
 retry_after timestamptz not null default now(), last_error_code text
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon,authenticated;
grant select(owner_id,state,requested_at,completed_at) on public.account_deletions to authenticated;
create policy deletion_status on public.account_deletions for select to authenticated using(owner_id=auth.uid());

create function public.account_active() returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from auth.users u where u.id=auth.uid())
 and not exists(select 1 from public.account_deletions d where d.owner_id=auth.uid())
$$;
revoke all on function public.account_active() from public; grant execute on function public.account_active() to authenticated;
-- Restrictive policies intersect with every existing policy, including old unexpired JWTs.
do $$ declare t text; begin
 foreach t in array array['profiles','athlete_settings','privacy_zones','activities','activity_tracks','friendships','published_activities','reactions','comments','clubs','club_members','routes','segments','segment_efforts','challenges','challenge_members','leagues','health_samples','device_tokens','coach_reports'] loop
 execute format('create policy active_account on public.%I as restrictive for all to authenticated using(public.account_active()) with check(public.account_active())',t);
 end loop;
end $$;
create policy media_active_account on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'activity-media' or public.account_active()) with check(bucket_id<>'activity-media' or public.account_active());

create function public.queue_account_deletion(p_owner uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
 begin
 if not exists(select 1 from auth.users where id=p_owner) then raise exception 'Account not found'; end if;
 insert into public.account_deletions(owner_id) values(p_owner) on conflict(owner_id) do nothing;
 end $$;
revoke all on function public.queue_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.queue_account_deletion(uuid) to service_role;

create function public.claim_account_deletion(p_owner uuid default null)
returns setof public.account_deletions language sql security definer set search_path=pg_catalog as $$
 update public.account_deletions d set state='processing',attempts=d.attempts+1,
 lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
 where d.owner_id=(select j.owner_id from public.account_deletions j
 where j.state<>'completed' and j.retry_after<=now() and (j.lease_until is null or j.lease_until<now())
 and (p_owner is null or j.owner_id=p_owner) order by j.requested_at for update skip locked limit 1)
 returning d.*
$$;
create function public.finish_account_deletion(p_owner uuid,p_lease uuid,p_success boolean)
returns void language sql security definer set search_path=pg_catalog as $$
 update public.account_deletions set state=case when p_success then 'completed' else 'failed' end,
 completed_at=case when p_success then now() else null end,lease_until=null,lease_token=null,
 retry_after=now()+interval '1 minute',last_error_code=case when p_success then null else 'retry_required' end
 where owner_id=p_owner and lease_token=p_lease
$$;
create function public.deletion_media(p_owner uuid,p_lease uuid) returns table(name text)
language sql security definer set search_path=pg_catalog as $$
 select o.name from storage.objects o where o.bucket_id='activity-media' and o.name like p_owner::text||'/%'
 and exists(select 1 from public.account_deletions d where d.owner_id=p_owner and d.lease_token=p_lease and d.lease_until>now())
 order by o.name limit 100
$$;
revoke all on function public.claim_account_deletion(uuid),public.finish_account_deletion(uuid,uuid,boolean),public.deletion_media(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_account_deletion(uuid),public.finish_account_deletion(uuid,uuid,boolean),public.deletion_media(uuid,uuid) to service_role;
grant all on public.account_deletions to service_role;

-- Security-definer workout RPCs also have to honor the deletion freeze.
create function public.guard_active_mutation() returns trigger language plpgsql set search_path=pg_catalog as $$
 begin
 if auth.uid() is not null then
 if not public.account_active() then raise exception 'Account unavailable' using errcode='42501'; end if;
 end if; return new;
 end $$;
create trigger activity_account_guard before insert or update on public.activities for each row execute function public.guard_active_mutation();
create trigger privacy_account_guard before insert or update on public.privacy_zones for each row execute function public.guard_active_mutation();
create trigger settings_account_guard before insert or update on public.athlete_settings for each row execute function public.guard_active_mutation();

create table public.athlete_blocks(
 blocker_id uuid not null references public.profiles on delete cascade,
 blocked_id uuid not null references public.profiles on delete cascade,
 created_at timestamptz not null default now(),primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id)
);
alter table public.athlete_blocks enable row level security;
create policy own_blocks on public.athlete_blocks for all to authenticated using(blocker_id=auth.uid() and public.account_active()) with check(blocker_id=auth.uid() and public.account_active());
create function public.is_blocked(other uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.athlete_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=other) or(b.blocked_id=auth.uid() and b.blocker_id=other))
$$;
revoke all on function public.is_blocked(uuid) from public;grant execute on function public.is_blocked(uuid) to authenticated;
create policy profile_block_filter on public.profiles as restrictive for select to authenticated using(not public.is_blocked(id));
create policy publication_block_filter on public.published_activities as restrictive for select to authenticated using(not public.is_blocked(owner_id));
create policy comment_block_filter on public.comments as restrictive for all to authenticated using(not public.is_blocked(athlete_id)) with check(not public.is_blocked(athlete_id));
create policy reaction_block_filter on public.reactions as restrictive for all to authenticated using(not public.is_blocked(athlete_id)) with check(not public.is_blocked(athlete_id));
create policy friendship_block_filter on public.friendships as restrictive for all to authenticated using(not public.is_blocked(requester_id) and not public.is_blocked(recipient_id)) with check(not public.is_blocked(requester_id) and not public.is_blocked(recipient_id));
create policy effort_block_filter on public.segment_efforts as restrictive for select to authenticated using(not public.is_blocked(athlete_id));
create policy club_block_filter on public.clubs as restrictive for select to authenticated using(not public.is_blocked(owner_id));
create policy member_block_filter on public.club_members as restrictive for all to authenticated using(not public.is_blocked(athlete_id)) with check(not public.is_blocked(athlete_id));

create table public.content_reports(
 id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.profiles on delete cascade,
 target_kind text not null check(target_kind in ('activity','comment')),target_id uuid not null,
 target_owner uuid not null references public.profiles on delete cascade,
 reason text not null check(reason in ('harassment','hate','sexual','violence','spam','privacy','other')),
 details text not null default '' check(public.valid_athlete_text(details,2000,false)),
 state text not null default 'open' check(state in ('open','dismissed','removed')),
 created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(reporter_id,target_kind,target_id)
);
create table public.hidden_content(kind text not null check(kind in ('activity','comment')),target_id uuid not null,
 owner_id uuid not null references public.profiles on delete cascade,primary key(kind,target_id));
alter table public.content_reports enable row level security;
alter table public.hidden_content enable row level security;
revoke all on public.content_reports,public.hidden_content from anon,authenticated;
grant select on public.content_reports to authenticated;
create policy own_reports on public.content_reports for select to authenticated using(reporter_id=auth.uid() and public.account_active());
create function public.content_hidden(kind text,target uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.hidden_content h where h.kind=$1 and h.target_id=$2)
$$;
revoke all on function public.content_hidden(text,uuid) from public; grant execute on function public.content_hidden(text,uuid) to authenticated;
create policy publication_moderation on public.published_activities as restrictive for select to authenticated using(not public.content_hidden('activity',id));
create policy comment_moderation on public.comments as restrictive for select to authenticated using(not public.content_hidden('comment',id));

create function public.report_content(p_id uuid,p_kind text,p_target uuid,p_reason text,p_details text default '') returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
 declare uid uuid:=auth.uid();owner uuid;aid uuid;pid uuid; begin
 if not public.account_active() then raise exception 'Not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if p_kind='activity' then aid:=p_target;
 elsif p_kind='comment' then select c.activity_id,c.athlete_id into aid,owner from public.comments c where c.id=p_target;
 else raise exception 'Invalid content kind'; end if;
 select p.owner_id into pid from public.published_activities p where p.id=aid
 and not public.is_blocked(p.owner_id) and not public.content_hidden('activity',p.id)
 and (p.owner_id=uid or p.visibility='public' or(p.visibility='friends' and public.are_friends(p.owner_id,uid)));
 if pid is null then raise exception 'Content unavailable' using errcode='42501'; end if;
 if p_kind='activity' then owner:=pid; end if;
 if owner is null or public.is_blocked(owner) then raise exception 'Content unavailable' using errcode='42501'; end if;
 if exists(select 1 from public.content_reports r where r.reporter_id=uid and r.target_kind=p_kind and r.target_id=p_target) then
 return (select r.id from public.content_reports r where r.reporter_id=uid and r.target_kind=p_kind and r.target_id=p_target); end if;
 if (select count(*) from public.content_reports where reporter_id=uid and created_at>now()-interval '1 hour')>=10 then raise exception 'Report limit reached' using errcode='P0001'; end if;
 insert into public.content_reports(id,reporter_id,target_kind,target_id,target_owner,reason,details) values(p_id,uid,p_kind,p_target,owner,p_reason,p_details);
 return p_id; end $$;
revoke all on function public.report_content(uuid,text,uuid,text,text) from public;
grant execute on function public.report_content(uuid,text,uuid,text,text) to authenticated;

create function public.review_content_report(p_id uuid,p_remove boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
 declare r public.content_reports; begin
 select * into r from public.content_reports where id=p_id for update;
 if not found then raise exception 'Report not found'; end if;
 if p_remove then insert into public.hidden_content(kind,target_id,owner_id) values(r.target_kind,r.target_id,r.target_owner) on conflict do nothing; end if;
 update public.content_reports set state=case when p_remove then 'removed' else 'dismissed' end,reviewed_at=now() where id=p_id;
 end $$;
revoke all on function public.review_content_report(uuid,boolean) from public,anon,authenticated;
grant execute on function public.review_content_report(uuid,boolean) to service_role;
grant all on public.content_reports,public.hidden_content,public.athlete_blocks to service_role;
create function public.deletion_lease_valid(p_owner uuid,p_lease uuid) returns boolean
language sql volatile security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.account_deletions where owner_id=p_owner and lease_token=p_lease and lease_until>clock_timestamp() and state='processing')
$$;
revoke all on function public.deletion_lease_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function public.deletion_lease_valid(uuid,uuid) to service_role;
create function public.athlete_available(other uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select not exists(select 1 from public.account_deletions where owner_id=other)
$$;
revoke all on function public.athlete_available(uuid) from public;grant execute on function public.athlete_available(uuid) to authenticated;
create policy publication_owner_active on public.published_activities as restrictive for select to authenticated using(public.athlete_available(owner_id));
create policy profile_owner_active on public.profiles as restrictive for select to authenticated using(public.athlete_available(id));
create policy comment_owner_active on public.comments as restrictive for select to authenticated using(public.athlete_available(athlete_id));
create policy effort_owner_active on public.segment_efforts as restrictive for select to authenticated using(public.athlete_available(athlete_id));
commit;
