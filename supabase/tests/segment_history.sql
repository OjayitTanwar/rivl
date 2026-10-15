begin;
insert into auth.users(id,email) values('e1000000-0000-0000-0000-000000000001','segment@example.test'),('e1000000-0000-0000-0000-000000000002','viewer@example.test');
insert into public.profiles(id,name,handle) values('e1000000-0000-0000-0000-000000000001','Segment athlete','segment_athlete'),('e1000000-0000-0000-0000-000000000002','Viewer','segment_viewer');
insert into public.athlete_settings(owner_id,settings) values('e1000000-0000-0000-0000-000000000001','{"segmentParticipation":true}');
insert into public.segments(id,name,sport,path,distance) values('e2000000-0000-0000-0000-000000000001','Test segment','run',extensions.st_geogfromtext('LINESTRING(0.003 0,0.007 0)'),445);
insert into public.activities(id,owner_id,title,sport,started_at,ended_at,summary,visibility,rpe,revision) values('e3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','Segment run','run',to_timestamp(1000),to_timestamp(1500),'{}','public',5,1);
insert into public.activity_tracks(activity_id,owner_id,samples,points) values('e3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','[[0,0,1000000,0,40,-1,-1,0],[0,100000,500000,0,40,-1,-1,0]]','[{"lat":0,"lng":0.003,"segment":0},{"lat":0,"lng":0.007,"segment":0}]');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if has_function_privilege('authenticated','public.claim_segment_job()','EXECUTE') then raise exception 'Client can claim worker job'; end if;
  if has_function_privilege('authenticated','public.complete_segment_job(uuid,uuid,integer,jsonb,text)','EXECUTE') then raise exception 'Client can forge verified efforts'; end if;
  if has_table_privilege('authenticated','public.segment_processing_jobs','SELECT') then raise exception 'Private jobs exposed'; end if;
end $$;
reset role;
create temporary table claimed as select * from public.claim_segment_job();
do $$ declare input jsonb; ok boolean; token uuid; begin
  select lease into token from claimed;
  input:=public.segment_job_input('e3000000-0000-0000-0000-000000000001',token);
  if input->>'optedIn'<>'true' or jsonb_array_length(input->'segments') is distinct from 1 then raise exception 'Worker input incorrect'; end if;
  ok:=public.complete_segment_job('e3000000-0000-0000-0000-000000000001',token,1,
    '[{"segment_id":"e2000000-0000-0000-0000-000000000001","segment_revision":1,"seconds":200,"start_ms":1150000,"end_ms":1350000,"quality":{"fixes":41}}]','gps-corridor-v1');
  if not ok then raise exception 'Fresh result rejected'; end if;
  if public.complete_segment_job('e3000000-0000-0000-0000-000000000001',token,1,'[]','gps-corridor-v1') then raise exception 'Lease replay accepted'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.segment_leaderboard('e2000000-0000-0000-0000-000000000001')) is distinct from 1 then raise exception 'Verified ranking unavailable'; end if;
  if (select count(*) from public.segment_efforts) is distinct from 1 then raise exception 'Public effort policy incorrect'; end if;
end $$;
reset role;
-- Date filtering precedes selecting the athlete's best.
do $$ begin
  if (select count(*) from public.segment_standings('e2000000-0000-0000-0000-000000000001','overall',to_timestamp(1100),to_timestamp(1200))) is distinct from 1 then raise exception 'Inclusive start lost'; end if;
  if (select count(*) from public.segment_standings('e2000000-0000-0000-0000-000000000001','overall',null,to_timestamp(1150)))<>0 then raise exception 'Exclusive finish leaked'; end if;
  if (select count(*) from public.segment_standings('e2000000-0000-0000-0000-000000000001','overall',null,null,null,null,null,true))<>0 then raise exception 'Old effort counted toward crown'; end if;
  if has_function_privilege('anon','public.segment_standings(uuid,text,timestamptz,timestamptz,integer,integer,uuid,boolean)','EXECUTE') then raise exception 'Anonymous history exposed'; end if;
end $$;
-- A second activity, seeded as a server-checked result only in this fixture.
reset role;
insert into public.activities(id,owner_id,title,sport,started_at,ended_at,summary,visibility,rpe,revision)
values('e3000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001','Recent run','run',now()-interval '10 minutes',now(),'{}','public',5,1);
insert into public.segment_efforts(segment_id,athlete_id,activity_id,seconds,verified,source_revision,segment_revision,algorithm_version,start_ms,end_ms,quality,created_at)
values('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000002',150,true,1,1,'gps-corridor-v1',extract(epoch from now()-interval '8 minutes')*1000,extract(epoch from now()-interval '5 minutes')*1000,'{}',now()-interval '8 minutes');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select seconds from public.segment_standings('e2000000-0000-0000-0000-000000000001')) is distinct from 150 then raise exception 'Best effort selection incorrect'; end if;
  if (select seconds from public.segment_standings('e2000000-0000-0000-0000-000000000001','overall',null,to_timestamp(1200))) is distinct from 200 then raise exception 'Date filter applied after best selection'; end if;
  if (select effort_count from public.segment_standings('e2000000-0000-0000-0000-000000000001','overall',null,null,null,null,null,true)) is distinct from 1 then raise exception 'Recent crown count incorrect'; end if;
  if (select count(*) from public.segment_standings('e2000000-0000-0000-0000-000000000001','friends'))<>0 then raise exception 'Friends filter leaked'; end if;
end $$;
reset role;
update public.activities set visibility='private',revision=2 where id='e3000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.segment_standings('e2000000-0000-0000-0000-000000000001','overall',null,null,null,null,null,true))<>0 then raise exception 'Private effort retained crown'; end if;
end $$;
reset role;
-- A visibility edit retracts rankings immediately and invalidates old leases.
update public.activities set revision=2,visibility='private' where id='e3000000-0000-0000-0000-000000000001';
do $$ begin
  if exists(select 1 from public.segment_efforts) then raise exception 'Private activity still ranked'; end if;
  if public.complete_segment_job('e3000000-0000-0000-0000-000000000001',(select lease from claimed),1,'[]','gps-corridor-v1') then raise exception 'Stale revision committed'; end if;
end $$;
rollback;
