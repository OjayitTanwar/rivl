begin;
insert into auth.users(id,email) select ('f1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'heat'||i||'@example.test' from generate_series(1,5) i;
insert into public.profiles(id,name,handle) select ('f1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Heat athlete '||i,'heat_athlete_'||i from generate_series(1,5) i;
insert into public.activities(id,owner_id,title,sport,started_at,ended_at,summary,visibility,rpe,revision)
 select ('f2000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,('f1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Shared ride','ride',now()-interval '1 hour',now(),'{}',case when i=4 then 'private'::public.activity_visibility else 'public'::public.activity_visibility end,4,1 from generate_series(1,4) i;
insert into public.published_activities(id,owner_id,title,sport,started_at,summary,route,visibility)
 select id,owner_id,title,sport,started_at,summary,'[{"lat":51.001,"lng":0.001,"segment":0}]',visibility from public.activities where id::text like 'f2000000-%';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000005',true);
do $$ begin
 if (select count(*) from public.route_popularity(51,0,'ride'))<>1 then raise exception 'Public density missing'; end if;
 if (select visits from public.route_popularity(51,0,'ride'))<>3 then raise exception 'Private activity counted'; end if;
 if exists(select 1 from public.route_popularity(51,0,'run')) then raise exception 'Sport filter incorrect'; end if;
 if has_function_privilege('anon','public.route_popularity(double precision,double precision,public.activity_sport,timestamptz)','EXECUTE') then raise exception 'Anonymous density access'; end if;
end $$;
reset role;
delete from public.published_activities where owner_id='f1000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin if exists(select 1 from public.route_popularity(51,0,'ride')) then raise exception 'Below-threshold cells exposed'; end if; end $$;
rollback;
