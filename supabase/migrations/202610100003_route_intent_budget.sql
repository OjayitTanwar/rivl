create table public.route_intent_budget(owner_id uuid not null,day date not null,calls integer not null default 0,primary key(owner_id,day));
alter table public.route_intent_budget enable row level security;
revoke all on public.route_intent_budget from public,anon,authenticated;
grant all on public.route_intent_budget to service_role;
create function public.route_intent_allow(p_owner uuid) returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare global_id uuid='00000000-0000-0000-0000-000000000000'; today date=(now() at time zone 'UTC')::date; total integer; individual integer;
begin
 if p_owner is null or p_owner=global_id or not exists(select 1 from profiles p where p.id=p_owner) or exists(select 1 from account_deletions where owner_id=p_owner) then return false; end if;
 insert into route_intent_budget(owner_id,day) values(global_id,today) on conflict do nothing;
 select calls into total from route_intent_budget where owner_id=global_id and day=today for update;
 if total>=100 then return false; end if;
 insert into route_intent_budget(owner_id,day) values(p_owner,today) on conflict do nothing;
 select calls into individual from route_intent_budget where owner_id=p_owner and day=today for update;
 if individual>=8 then return false; end if;
 update route_intent_budget set calls=calls+1 where day=today and owner_id in(global_id,p_owner);
 delete from route_intent_budget where day<today-7;
 return true;
end $$;
revoke all on function public.route_intent_allow(uuid) from public,anon,authenticated;
grant execute on function public.route_intent_allow(uuid) to service_role;
create function public.erase_route_intent_budget() returns trigger language plpgsql security definer set search_path=public as $$
begin delete from route_intent_budget where owner_id=old.id;return old;end $$;
revoke all on function public.erase_route_intent_budget() from public,anon,authenticated;
create trigger erase_intent_budget after delete on public.profiles for each row execute function public.erase_route_intent_budget();
