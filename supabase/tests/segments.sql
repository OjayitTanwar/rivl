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
  if input->>'optedIn'<>'true' or jsonb_array_length(input->'segments')<>1 then raise exception 'Worker input incorrect'; end if;
  ok:=public.complete_segment_job('e3000000-0000-0000-0000-000000000001',token,1,
    '[{"segment_id":"e2000000-0000-0000-0000-000000000001","segment_revision":1,"seconds":200,"start_ms":1150000,"end_ms":1350000,"quality":{"fixes":41}}]','gps-corridor-v1');
  if not ok then raise exception 'Fresh result rejected'; end if;
  if public.complete_segment_job('e3000000-0000-0000-0000-000000000001',token,1,'[]','gps-corridor-v1') then raise exception 'Lease replay accepted'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
do $$ begin
  if (select count(*) from public.segment_leaderboard('e2000000-0000-0000-0000-000000000001'))<>1 then raise exception 'Verified ranking unavailable'; end if;
  if (select count(*) from public.segment_efforts)<>1 then raise exception 'Public effort policy incorrect'; end if;
end $$;
reset role;
-- A visibility edit retracts rankings immediately and invalidates old leases.
update public.activities set revision=2,visibility='private' where id='e3000000-0000-0000-0000-000000000001';
do $$ begin
  if exists(select 1 from public.segment_efforts) then raise exception 'Private activity still ranked'; end if;
  if public.complete_segment_job('e3000000-0000-0000-0000-000000000001',(select lease from claimed),1,'[]','gps-corridor-v1') then raise exception 'Stale revision committed'; end if;
end $$;
rollback;
