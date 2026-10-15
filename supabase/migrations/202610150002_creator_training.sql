begin;
-- Immutable creator-declared versions and a retractable latest publication.
-- No private activities, health readings or athlete metrics are projected.
create table public.creator_training_programs(id uuid primary key,owner_id uuid not null references public.profiles on delete cascade,latest_revision bigint not null check(latest_revision>0),published boolean not null default true,published_at timestamptz not null default now());
create index creator_training_recent on public.creator_training_programs(published_at desc,id)where published;
create table public.creator_training_versions(program_id uuid not null references public.creator_training_programs on delete cascade,revision bigint not null check(revision>0),payload jsonb not null check(octet_length(payload::text)<=200000),created_at timestamptz not null default now(),primary key(program_id,revision));
create table public.creator_training_quarantines(owner_id uuid primary key references public.profiles on delete cascade,quarantined boolean not null,reason text not null check(reason in ('abuse','privacy','fraud','review_complete')),updated_at timestamptz not null default now());
alter table public.creator_training_programs enable row level security;
alter table public.creator_training_versions enable row level security;
alter table public.creator_training_quarantines enable row level security;
revoke all on public.creator_training_programs,public.creator_training_versions,public.creator_training_quarantines from public,anon,authenticated;
create function public.quarantine_creator_training(p_owner uuid,p_quarantined boolean,p_reason text)returns void language plpgsql security definer set search_path=public as $$
begin
 if p_owner is null or p_quarantined is null or p_reason is null or p_reason not in ('abuse','privacy','fraud','review_complete')then raise exception 'Invalid moderation request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,79));
 insert into creator_training_quarantines(owner_id,quarantined,reason)values(p_owner,p_quarantined,p_reason)on conflict(owner_id)do update set quarantined=excluded.quarantined,reason=excluded.reason,updated_at=now();
end $$;
revoke all on function public.quarantine_creator_training(uuid,boolean,text)from public,anon,authenticated;
grant execute on function public.quarantine_creator_training(uuid,boolean,text)to service_role;
create function public.publish_creator_program(p_program jsonb)returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();pid uuid;rev bigint;existing public.creator_training_programs;old_payload jsonb;s jsonb;w jsonb;key text;n numeric;session_ids text[]:='{}';canonical_sessions jsonb:='[]';canonical jsonb;
begin
 if not public.account_active() then raise exception 'Not authorized' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,79));
 if exists(select 1 from creator_training_quarantines q where q.owner_id=uid and q.quarantined)then raise exception 'Creator publication paused for review' using errcode='42501';end if;
 if p_program is null or jsonb_typeof(p_program)<>'object' or octet_length(p_program::text)>200000 then raise exception 'Invalid program';end if;
 if exists(select 1 from jsonb_object_keys(p_program)k where k not in ('id','ownerId','creatorName','title','description','sport','level','weeks','revision','updatedAt','license','sessions'))then raise exception 'Unsupported program fields';end if;
 for key in select unnest(array['id','ownerId','creatorName','title','description','sport','level','license'])loop
  if jsonb_typeof(p_program->key)is distinct from 'string'then raise exception 'Invalid program text';end if;
 end loop;
 if coalesce(p_program->>'ownerId','')<>uid::text then raise exception 'Not authorized' using errcode='42501';end if;
 pid:=(p_program->>'id')::uuid;
 if pid is null then raise exception 'Invalid program identity';end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text,80));
 if not coalesce(public.valid_athlete_text(p_program->>'creatorName',80,true)and public.valid_athlete_text(p_program->>'title',100,true)and public.valid_athlete_text(p_program->>'description',2000,false),false)
  or coalesce(p_program->>'sport','')not in ('run','ride','walk','hike')or coalesce(p_program->>'level','')not in ('beginner','intermediate','advanced','all')or coalesce(p_program->>'license','')not in ('CC-BY-4.0','CC0-1.0')then raise exception 'Invalid program details';end if;
 for key in select unnest(array['weeks','revision','updatedAt'])loop
  if jsonb_typeof(p_program->key) is distinct from 'number' then raise exception 'Invalid program number';end if;
  n:=(p_program->>key)::numeric;
  if n<>trunc(n)or n<1 or (key='weeks'and n>24)or(key='revision'and n>9007199254740991)or(key='updatedAt'and n>8640000000000000)then raise exception 'Invalid program number';end if;
 end loop;
 rev:=(p_program->>'revision')::bigint;
 if jsonb_typeof(p_program->'sessions')is distinct from 'array'or jsonb_array_length(p_program->'sessions')<1 or jsonb_array_length(p_program->'sessions')>100 then raise exception 'Invalid sessions';end if;
 for s in select value from jsonb_array_elements(p_program->'sessions')loop
  if jsonb_typeof(s)<>'object'or exists(select 1 from jsonb_object_keys(s)k where k not in ('id','week','day','title','notes','workout'))then raise exception 'Invalid session';end if;
  for key in select unnest(array['id','title','notes'])loop if jsonb_typeof(s->key)is distinct from 'string'then raise exception 'Invalid session text';end if;end loop;
  if not coalesce(public.valid_athlete_text(s->>'id',100,true)and (s->>'id')~'^[A-Za-z0-9_-]{1,100}$' and public.valid_athlete_text(s->>'title',100,true)and public.valid_athlete_text(s->>'notes',1000,false),false)then raise exception 'Invalid session details';end if;
  if s->>'id'=any(session_ids)then raise exception 'Duplicate session identity';end if;session_ids:=array_append(session_ids,s->>'id');
  for key in select unnest(array['week','day'])loop
   if jsonb_typeof(s->key)is distinct from 'number' then raise exception 'Invalid schedule';end if;
   n:=(s->>key)::numeric;if n<>trunc(n)or n<1 or(key='week'and n>(p_program->>'weeks')::integer)or(key='day'and n>7)then raise exception 'Invalid schedule';end if;
  end loop;
  -- Multiple sessions on the same day are legitimate; session identity dedups.
  w:=s->'workout';
  if jsonb_typeof(w)is distinct from 'object'or exists(select 1 from jsonb_object_keys(w)k where k not in ('warmupSec','workSec','recoverySec','repeats','cooldownSec'))then raise exception 'Invalid workout';end if;
  for key in select unnest(array['warmupSec','workSec','recoverySec','repeats','cooldownSec'])loop
   if jsonb_typeof(w->key)is distinct from 'number' then raise exception 'Invalid interval';end if;n:=(w->>key)::numeric;
   if n<>trunc(n)or n<(case when key in ('workSec','repeats')then 1 else 0 end) or n>(case when key='repeats'then 50 else 3600 end) then raise exception 'Invalid interval';end if;
  end loop;
  if(w->>'warmupSec')::integer+(w->>'workSec')::integer*(w->>'repeats')::integer+(w->>'recoverySec')::integer*((w->>'repeats')::integer-1)+(w->>'cooldownSec')::integer>86400 then raise exception 'Session exceeds 24 hours';end if;
  canonical_sessions:=canonical_sessions||jsonb_build_array(jsonb_build_object('id',s->>'id','week',(s->>'week')::integer,'day',(s->>'day')::integer,'title',s->>'title','notes',s->>'notes','workout',jsonb_build_object('warmupSec',(w->>'warmupSec')::integer,'workSec',(w->>'workSec')::integer,'recoverySec',(w->>'recoverySec')::integer,'repeats',(w->>'repeats')::integer,'cooldownSec',(w->>'cooldownSec')::integer)));
 end loop;
 canonical:=jsonb_build_object('id',pid,'ownerId',uid,'creatorName',p_program->>'creatorName','title',p_program->>'title','description',p_program->>'description','sport',p_program->>'sport','level',p_program->>'level','weeks',(p_program->>'weeks')::integer,'revision',rev,'updatedAt',(p_program->>'updatedAt')::numeric,'license',p_program->>'license','sessions',canonical_sessions);
 select * into existing from creator_training_programs where id=pid for update;
 if existing.id is not null and existing.owner_id<>uid then raise exception 'Not authorized'using errcode='42501';end if;
 select payload into old_payload from creator_training_versions where program_id=pid and revision=rev;
 if old_payload is not null and old_payload<>canonical then raise exception 'Published versions are immutable. Increase the revision.';end if;
 if existing.id is not null and rev<existing.latest_revision then raise exception 'Stale program revision';end if;
 if old_payload is null and(select count(*)from creator_training_versions where program_id=pid)>=100 then raise exception 'Program version limit reached';end if;
 if existing.id is null and(select count(*)from creator_training_programs where owner_id=uid)>=50 then raise exception 'Creator program limit reached';end if;
 if old_payload is null and(select count(*)from creator_training_versions v join creator_training_programs p on p.id=v.program_id where p.owner_id=uid and v.created_at>now()-interval '1 day')>=20 then raise exception 'Daily publication limit reached';end if;
 insert into creator_training_programs(id,owner_id,latest_revision,published)values(pid,uid,rev,true)on conflict(id)do update set latest_revision=excluded.latest_revision,published=true,published_at=case when creator_training_programs.latest_revision=rev and creator_training_programs.published then creator_training_programs.published_at else now()end where creator_training_programs.owner_id=uid;
 insert into creator_training_versions(program_id,revision,payload)values(pid,rev,canonical)on conflict do nothing;
end $$;
create function public.unpublish_creator_program(p_id uuid)returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.account_active()then raise exception 'Not authorized'using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,79));
 if exists(select 1 from creator_training_programs where id=p_id and owner_id<>auth.uid())then raise exception 'Not authorized'using errcode='42501';end if;
 update creator_training_programs set published=false where id=p_id and owner_id=auth.uid();
end $$;
create function public.list_creator_programs(p_sport public.activity_sport default null)returns table(program jsonb)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.account_active()then raise exception 'Not authorized'using errcode='42501';end if;
 return query select v.payload from creator_training_programs p join creator_training_versions v on v.program_id=p.id and v.revision=p.latest_revision
 where p.published and (p_sport is null or v.payload->>'sport'=p_sport::text)
 and not exists(select 1 from account_deletions d where d.owner_id=p.owner_id)
 and not exists(select 1 from creator_training_quarantines q where q.owner_id=p.owner_id and q.quarantined)
 and not public.is_blocked(p.owner_id)
 order by p.published_at desc,p.id limit 20;
end $$;
revoke all on function public.publish_creator_program(jsonb),public.unpublish_creator_program(uuid),public.list_creator_programs(public.activity_sport)from public,anon,authenticated;
grant execute on function public.publish_creator_program(jsonb),public.unpublish_creator_program(uuid),public.list_creator_programs(public.activity_sport)to authenticated;
commit;
