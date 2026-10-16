begin;
-- Operators are provisioned by a trusted service, never through a client RPC.
create table public.app_moderators(owner_id uuid primary key references public.profiles on delete cascade);
alter table public.app_moderators enable row level security;
revoke all on public.app_moderators from public,anon,authenticated;
grant all on public.app_moderators to service_role;
create function public.is_app_moderator()returns boolean language sql stable security definer set search_path=public as $$
 select public.account_active()and exists(select 1 from app_moderators where owner_id=auth.uid())
$$;
create table public.moderation_actions(id uuid primary key default gen_random_uuid(),staff_id uuid references public.profiles on delete set null,item_kind text not null check(item_kind in('content','sharedRoute','creator')),report_id uuid not null,target_id uuid not null,decision text not null check(decision in('hide','dismiss')),reason text not null check(public.valid_athlete_text(reason,500,true)),expected_version text not null,created_at timestamptz not null default now());
alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from public,anon,authenticated;
grant select on public.moderation_actions to service_role;
alter table public.shared_route_reports add column state text not null default 'open' check(state in('open','dismissed','removed'));
create table public.creator_training_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.profiles on delete cascade,program_id uuid not null references public.creator_training_programs on delete cascade,reason text not null check(reason in('unsafe','privacy','spam','other')),state text not null default 'open' check(state in('open','dismissed','removed')),created_at timestamptz not null default now(),unique(reporter_id,program_id));
alter table public.creator_training_reports enable row level security;
revoke all on public.creator_training_reports from public,anon,authenticated;
grant all on public.creator_training_reports to service_role;
create function public.report_creator_program(p_id uuid,p_reason text)returns void language plpgsql security definer set search_path=public as $$begin
 if not public.account_active()or not exists(select 1 from creator_training_programs p where p.id=p_id and p.published and public.athlete_available(p.owner_id)and not public.is_blocked(p.owner_id)and not exists(select 1 from creator_training_quarantines q where q.owner_id=p.owner_id and q.quarantined))then raise exception 'Program unavailable'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,95));
 if(select count(*)from creator_training_reports where reporter_id=auth.uid()and created_at>now()-interval '1 hour')>=10 then raise exception 'Report limit reached';end if;
 insert into creator_training_reports(reporter_id,program_id,reason)values(auth.uid(),p_id,p_reason)on conflict(reporter_id,program_id)do nothing;
end $$;
-- Internal projection includes reported published text, never GPS or health records.
create function public.moderation_item(p_kind text,p_id uuid)returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r record;t jsonb;title text;excerpt text;target uuid;owner uuid;begin
 if p_kind='content' then
  select * into r from content_reports where id=p_id and state='open';if not found then return null;end if;
  target:=r.target_id;owner:=r.target_owner;
  if r.target_kind='activity' then select to_jsonb(p),p.title,left(p.note,500)into t,title,excerpt from published_activities p where id=target;
  else select to_jsonb(c),'Reported comment',left(c.body,500)into t,title,excerpt from comments c where id=target;end if;
  t:=jsonb_build_object('publication',t,'hidden',public.content_hidden(r.target_kind,target));
 elsif p_kind='sharedRoute' then
  select * into r from shared_route_reports where id=p_id and state='open';if not found then return null;end if;
  target:=r.route_id;select to_jsonb(s),s.owner_id,s.title,'Shared route'into t,owner,title,excerpt from shared_routes s where id=target;
 elsif p_kind='creator' then
  select * into r from creator_training_reports where id=p_id and state='open';if not found then return null;end if;
  target:=r.program_id;select jsonb_build_object('program',to_jsonb(p),'version',v.payload,'quarantine',to_jsonb(q)),p.owner_id,v.payload->>'title',left(v.payload->>'description',500)into t,owner,title,excerpt from creator_training_programs p join creator_training_versions v on v.program_id=p.id and v.revision=p.latest_revision left join creator_training_quarantines q on q.owner_id=p.owner_id where p.id=target;
 else raise exception 'Unknown review kind';end if;
 return jsonb_build_object('id',p_id,'kind',p_kind,'targetId',target,'targetOwner',owner,'title',coalesce(title,'Content no longer available'),'excerpt',coalesce(excerpt,''),'reason',r.reason,'createdAt',r.created_at,'version',md5((to_jsonb(r)||jsonb_build_object('target',t))::text));
end $$;
create function public.moderation_roles()returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('moderator',public.is_app_moderator(),'trackReviewer',public.is_track_reviewer())
$$;
create function public.moderation_queue()returns setof jsonb language plpgsql stable security definer set search_path=public as $$begin
 if not public.is_app_moderator()then raise exception 'Not authorized'using errcode='42501';end if;
 return query select public.moderation_item(q.kind,q.id)from(select id,'content'::text kind,created_at from content_reports where state='open' union all select id,'sharedRoute',created_at from shared_route_reports where state='open' union all select id,'creator',created_at from creator_training_reports where state='open')q order by q.created_at,q.kind,q.id limit 20;
end $$;
create function public.decide_moderation(p_kind text,p_id uuid,p_version text,p_decision text,p_reason text)returns void language plpgsql security definer set search_path=public as $$
declare item jsonb;target uuid;owner uuid;begin
 if not public.is_app_moderator()then raise exception 'Not authorized'using errcode='42501';end if;
 if p_decision is null or p_decision not in('hide','dismiss')or not public.valid_athlete_text(p_reason,500,true)then raise exception 'Choose a decision and enter a reason';end if;
 -- Serial staff decisions and membership changes; target locks protect source revisions.
 perform 1 from app_moderators where owner_id=auth.uid() for share;
 if not found then raise exception 'Not authorized'using errcode='42501';end if;
 if p_kind='content' then
  perform 1 from content_reports where id=p_id for update;
  select target_id into target from content_reports where id=p_id;
  perform 1 from published_activities where id=target for update;
  perform 1 from comments where id=target for update;
 elsif p_kind='sharedRoute' then
  select s.owner_id into owner from shared_route_reports r join shared_routes s on s.id=r.route_id where r.id=p_id;
  perform pg_advisory_xact_lock(hashtextextended(owner::text,91));
  perform 1 from shared_route_reports where id=p_id for update;
  perform 1 from shared_routes where id=(select route_id from shared_route_reports where id=p_id)for update;
 elsif p_kind='creator' then
  select p.owner_id into owner from creator_training_reports r join creator_training_programs p on p.id=r.program_id where r.id=p_id;
  perform pg_advisory_xact_lock(hashtextextended(owner::text,79));
  perform 1 from creator_training_reports where id=p_id for update;
  perform 1 from creator_training_programs where id=(select program_id from creator_training_reports where id=p_id)for update;
 else raise exception 'Unknown review kind';end if;
 item:=public.moderation_item(p_kind,p_id);
 if item is null or p_version is null or item->>'version'<>p_version then raise exception 'Review changed. Reload before deciding.'using errcode='40001';end if;
 target:=(item->>'targetId')::uuid;owner:=(item->>'targetOwner')::uuid;
 if p_kind='content' then perform public.review_content_report(p_id,p_decision='hide');
 elsif p_kind='sharedRoute' then
  if p_decision='hide'then perform public.moderate_shared_route(target,true);end if;
  update shared_route_reports set state=case when p_decision='hide'then 'removed'else 'dismissed'end where id=p_id;
 else
  if p_decision='hide'then perform public.quarantine_creator_training(owner,true,'abuse');end if;
  update creator_training_reports set state=case when p_decision='hide'then 'removed'else 'dismissed'end where id=p_id;
 end if;
 insert into moderation_actions(staff_id,item_kind,report_id,target_id,decision,reason,expected_version)values(auth.uid(),p_kind,p_id,target,p_decision,p_reason,p_version);
end $$;
revoke all on function public.is_app_moderator(),public.report_creator_program(uuid,text),public.moderation_item(text,uuid),public.moderation_roles(),public.moderation_queue(),public.decide_moderation(text,uuid,text,text,text)from public,anon,authenticated;
grant execute on function public.is_app_moderator(),public.report_creator_program(uuid,text),public.moderation_roles(),public.moderation_queue(),public.decide_moderation(text,uuid,text,text,text)to authenticated;
commit;
