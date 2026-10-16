begin;
insert into auth.users(id,email)values('d1000000-0000-0000-0000-000000000001','shared-owner@example.test'),('d1000000-0000-0000-0000-000000000002','shared-reader@example.test');
insert into public.profiles(id,name,handle)values('d1000000-0000-0000-0000-000000000001','Shared creator','shared_creator'),('d1000000-0000-0000-0000-000000000002','Shared reader','shared_reader');
insert into public.routes(id,owner_id,name,sport,points,distance,ascent,routing)
select ('d2000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'d1000000-0000-0000-0000-000000000001','Shared fixture '||n,case when n=23 then 'hike'::public.activity_sport else 'run'::public.activity_sport end,
(select jsonb_agg(jsonb_build_object('lat',0,'lng',i*.001,'t',i*1000,'heartRate',150,'accuracy',5)order by i)from generate_series(0,30)i),3300,0,'recorded' from generate_series(1,23)n;
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
do $$declare n integer;begin
 for n in 1..23 loop perform public.publish_shared_route(('d2000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid);end loop;
 if has_table_privilege('authenticated','public.shared_routes','INSERT') or has_table_privilege('authenticated','public.shared_routes','UPDATE') then raise exception 'Forged projection write granted';end if;
 if has_function_privilege('authenticated','public.moderate_shared_route(uuid,boolean)','EXECUTE')then raise exception 'Client moderation granted';end if;
 if exists(select 1 from public.shared_routes s cross join lateral jsonb_array_elements(s.points)p where p ? 't' or p ? 'heartRate' or p ? 'accuracy')then raise exception 'Source telemetry leaked';end if;
 if exists(select 1 from public.shared_routes where distance>=3300 or distance<100)then raise exception 'Forged source distance trusted';end if;
 if exists(select 1 from public.shared_routes where creator<>'Shared creator' or owner_id<>'d1000000-0000-0000-0000-000000000001' or license<>'CC-BY-4.0')then raise exception 'Forged attribution';end if;
 if exists(select 1 from public.shared_routes s cross join lateral jsonb_array_elements(s.points)p where(p->>'lng')::float8<.0018 or(p->>'lng')::float8>.0282)then raise exception 'Hidden endpoints leaked';end if;
end $$;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000002',true);
do $$declare first_ids uuid[];second_ids uuid[];last_date timestamptz;last_id uuid;begin
 if(select count(*)from public.list_shared_routes())<>20 then raise exception 'Page limit failed';end if;
 if(select count(*)from public.list_shared_routes('hike'))<>1 then raise exception 'Sport filter failed';end if;
 select array_agg(id)into first_ids from public.list_shared_routes();
 select published_at,id into last_date,last_id from public.list_shared_routes()order by published_at,id limit 1;
 select array_agg(id)into second_ids from public.list_shared_routes(null,last_date,last_id);
 if cardinality(second_ids)<>3 or first_ids&&second_ids then raise exception 'Stable cursor failed';end if;
 begin perform public.publish_shared_route('d2000000-0000-0000-0000-000000000001');raise exception 'Foreign publish accepted';exception when insufficient_privilege then null;end;
 perform public.unpublish_shared_route('d2000000-0000-0000-0000-000000000001');
 if not exists(select 1 from public.shared_routes where id='d2000000-0000-0000-0000-000000000001')then raise exception 'Foreign withdrawal succeeded';end if;
 perform public.report_shared_route('d2000000-0000-0000-0000-000000000001','unsafe');
 perform public.report_shared_route('d2000000-0000-0000-0000-000000000001','unsafe');
 begin perform public.report_shared_route('d2000000-0000-0000-0000-000000000002','invented');raise exception 'Invalid report reason accepted';exception when check_violation then null;end;
 insert into public.athlete_blocks(blocker_id,blocked_id)values('d1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001');
 if exists(select 1 from public.list_shared_routes())then raise exception 'Blocked routes visible';end if;
 begin perform public.report_shared_route('d2000000-0000-0000-0000-000000000002','spam');raise exception 'Blocked report accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from public.athlete_blocks where blocker_id='d1000000-0000-0000-0000-000000000002';
do $$begin if(select count(*)from public.shared_route_reports where route_id='d2000000-0000-0000-0000-000000000001')<>1 then raise exception 'Duplicate reports recorded';end if;end $$;
-- Source edits retract the old publication until an explicit republication.
update public.routes set name='Edited title' where id='d2000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',true);
do $$begin
 if exists(select 1 from public.shared_routes where id='d2000000-0000-0000-0000-000000000001')then raise exception 'Stale source projection visible';end if;
 perform public.publish_shared_route('d2000000-0000-0000-0000-000000000001');
 if not exists(select 1 from public.shared_routes where title='Edited title')then raise exception 'Explicit republish failed';end if;
end $$;
reset role;
update public.routes set routing='manual' where id='d2000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$begin
 begin perform public.publish_shared_route('d2000000-0000-0000-0000-000000000003');raise exception 'Manual line published';exception when raise_exception then if sqlerrm='Manual line published' then raise;end if;end;
 if exists(select 1 from public.shared_routes where id='d2000000-0000-0000-0000-000000000003')then raise exception 'Manual source retained old publication';end if;
end $$;
reset role;
select public.moderate_shared_route('d2000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$begin
 perform public.unpublish_shared_route('d2000000-0000-0000-0000-000000000001');
 begin perform public.publish_shared_route('d2000000-0000-0000-0000-000000000001');raise exception 'Moderation bypassed by withdrawal';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.privacy_zones(id,owner_id,label,center,radius)values('d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Far zone',extensions.st_setsrid(extensions.st_makepoint(10,10),4326)::extensions.geography,200);
set local role authenticated;
do $$begin if exists(select 1 from public.list_shared_routes())then raise exception 'Zone changes left stale projections';end if;end $$;
reset role;
delete from public.privacy_zones where id='d3000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.publish_shared_route('d2000000-0000-0000-0000-000000000002');
reset role;
insert into public.account_deletions(owner_id)values('d1000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000002',true);
do $$begin if exists(select 1 from public.list_shared_routes())then raise exception 'Deletion-frozen routes visible';end if;end $$;
reset role;
delete from public.routes where id='d2000000-0000-0000-0000-000000000001';
do $$begin if exists(select 1 from public.shared_routes where id='d2000000-0000-0000-0000-000000000001')or exists(select 1 from public.shared_route_reports where route_id='d2000000-0000-0000-0000-000000000001')then raise exception 'Route deletion failed to cascade';end if;end $$;
rollback;
