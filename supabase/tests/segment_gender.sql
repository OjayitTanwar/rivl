begin;
insert into auth.users(id,email) values('f1000000-0000-0000-0000-000000000001','gender-athlete@example.test'),('f1000000-0000-0000-0000-000000000002','gender-viewer@example.test');
insert into public.profiles(id,name,handle) values('f1000000-0000-0000-0000-000000000001','Athlete','gender_athlete'),('f1000000-0000-0000-0000-000000000002','Viewer','gender_viewer');
insert into public.athlete_settings(owner_id,settings) values('f1000000-0000-0000-0000-000000000001','{"segmentParticipation":true,"leaderboardGender":"women"}');
insert into public.segments(id,name,sport,path,distance) values('f2000000-0000-0000-0000-000000000001','Gender fixture','run',extensions.st_geogfromtext('LINESTRING(0.003 0,0.007 0)'),445);
insert into public.activities(id,owner_id,title,sport,started_at,ended_at,summary,visibility,rpe,revision) values('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','Fixture run','run',to_timestamp(1000),to_timestamp(1500),'{}','public',5,1);
-- Recreate eligible server data after each settings mutation, which legitimately
-- retracts existing efforts and queues recomputation. This exercises query consent
-- independently of that additional retraction protection.
create function pg_temp.seed_gender_effort() returns void language sql as $$
insert into public.segment_efforts(segment_id,athlete_id,activity_id,seconds,verified,source_revision,segment_revision,algorithm_version,start_ms,end_ms,quality,created_at)
values('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001',200,true,1,1,'gps-corridor-v1',1150000,1350000,'{}',to_timestamp(1150));
$$;
do $$ begin
  begin
    update public.athlete_settings set settings=settings||'{"shareLeaderboardGender":true,"leaderboardGender":"inferred"}' where owner_id='f1000000-0000-0000-0000-000000000001';
    raise exception 'Invalid category accepted';
  exception when check_violation then null; end;
  begin
    update public.athlete_settings set settings=settings||'{"shareLeaderboardGender":"true"}' where owner_id='f1000000-0000-0000-0000-000000000001';
    raise exception 'Nonboolean consent accepted';
  exception when check_violation then null; end;
end $$;
select pg_temp.seed_gender_effort();
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if exists(select 1 from public.athlete_settings) then raise exception 'Private demographic settings leaked'; end if;
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001','gender',null,null,null,null,null,false,'women'))<>0 then raise exception 'Unconsented category included'; end if;
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001'))<>1 then raise exception 'Legacy API broken'; end if;
  if has_function_privilege('anon','public.segment_standings(uuid,text,timestamptz,timestamptz,integer,integer,uuid,boolean,text)','EXECUTE') then raise exception 'Anonymous gender standings exposed'; end if;
end $$;
reset role;
update public.athlete_settings set settings=settings||'{"shareLeaderboardGender":true}' where owner_id='f1000000-0000-0000-0000-000000000001';
select pg_temp.seed_gender_effort();
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001','gender',null,null,null,null,null,false,'women'))<>1 then raise exception 'Consented category excluded'; end if;
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001','gender',null,null,null,null,null,false,'men'))<>0 then raise exception 'Wrong category included'; end if;
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001','gender',null,to_timestamp(1150),null,null,null,false,'women'))<>0 then raise exception 'Gender date bound ignored'; end if;
end $$;
reset role;
update public.athlete_settings set settings=settings||'{"shareLeaderboardGender":false}' where owner_id='f1000000-0000-0000-0000-000000000001';
select pg_temp.seed_gender_effort();
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001','gender',null,null,null,null,null,false,'women'))<>0 then raise exception 'Withdrawn consent included'; end if;
end $$;
reset role;
update public.athlete_settings set settings=settings||'{"shareLeaderboardGender":true,"leaderboardGender":"nonbinary"}' where owner_id='f1000000-0000-0000-0000-000000000001';
select pg_temp.seed_gender_effort();
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001','gender',null,null,null,null,null,false,'women'))<>0 then raise exception 'Stale category included'; end if;
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001','gender',null,null,null,null,null,false,'nonbinary'))<>1 then raise exception 'Current category ignored'; end if;
end $$;
reset role;
update public.activities set visibility='private',revision=2 where id='f3000000-0000-0000-0000-000000000001';
-- Stale seeded efforts still must fail source visibility/version checks.
select pg_temp.seed_gender_effort();
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.segment_standings('f2000000-0000-0000-0000-000000000001','gender',null,null,null,null,null,false,'nonbinary'))<>0 then raise exception 'Private source included'; end if;
end $$;
reset role;
rollback;
