begin;
insert into auth.users(id,email) values('f3000000-0000-4000-8000-000000000001','intent@example.test');
insert into public.profiles(id,name,handle) values('f3000000-0000-4000-8000-000000000001','Route athlete','route_intent_athlete');
do $$ begin
 if has_function_privilege('authenticated','public.route_intent_allow(uuid)','EXECUTE') or has_table_privilege('authenticated','public.route_intent_budget','UPDATE') then raise exception 'Client can reset spending limits'; end if;
 for i in 1..8 loop if not public.route_intent_allow('f3000000-0000-4000-8000-000000000001') then raise exception 'Valid reserved call rejected'; end if; end loop;
 if public.route_intent_allow('f3000000-0000-4000-8000-000000000001') then raise exception 'Daily user limit exceeded'; end if;
 if public.route_intent_allow('f3000000-0000-4000-8000-000000000099') then raise exception 'Unknown athlete accepted'; end if;
end $$;
rollback;
