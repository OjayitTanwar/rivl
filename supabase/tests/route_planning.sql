begin;
do $$ begin
  if not public.valid_route_waypoints('[{"lat":51.5,"lng":-0.12}]') then raise exception 'Valid waypoint rejected'; end if;
  if public.valid_route_waypoints('[{"lat":null,"lng":1}]') then raise exception 'Null coordinate accepted'; end if;
  if public.valid_route_waypoints('[{"lat":"51.5","lng":1}]') then raise exception 'String coordinate accepted'; end if;
  if public.valid_route_waypoints('[{"lat":86,"lng":1}]') then raise exception 'Out-of-bounds coordinate accepted'; end if;
  if public.valid_route_waypoints('[{}]') then raise exception 'Missing coordinates accepted'; end if;
  if public.valid_route_waypoints('{}') then raise exception 'Non-array accepted'; end if;
  if public.valid_route_waypoints((select jsonb_agg(jsonb_build_object('lat',1,'lng',1)) from generate_series(1,25))) then raise exception 'Too many stops accepted'; end if;
end $$;
insert into auth.users(id,email) values ('a0000000-0000-0000-0000-000000000001','route-a@example.test'),('b0000000-0000-0000-0000-000000000001','route-b@example.test');
insert into public.profiles(id,name,handle) values ('a0000000-0000-0000-0000-000000000001','Route A','route_a'),('b0000000-0000-0000-0000-000000000001','Route B','route_b');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
insert into public.routes(id,owner_id,name,sport,points,distance,ascent,waypoints,routing) values ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Private plan','run','[]',100,0,'[{"lat":51.5,"lng":-0.12}]','manual');
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',true);
do $$ begin
  if exists(select 1 from public.routes where id='c0000000-0000-0000-0000-000000000001') then raise exception 'Private plan exposed to another account'; end if;
end $$;
delete from public.routes where id='c0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
do $$ begin
  if not exists(select 1 from public.routes where id='c0000000-0000-0000-0000-000000000001') then raise exception 'Other account deleted private route'; end if;
end $$;
rollback;
