begin;
create function pg_temp.mapping_fixture(n integer)returns uuid language plpgsql as $$
declare uid uuid:=('ac160000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;aid uuid:=('bc160000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;started timestamptz:=now()-((n%3+1)||' days')::interval;raw jsonb;
begin
 insert into auth.users(id,email)values(uid,'mapping'||n||'@example.test');
 insert into public.profiles(id,name,handle)values(uid,'Mapping fixture','mapping_fixture_'||n);
 select jsonb_agg(jsonb_build_object('lat',n*.000001,'lng',i*.0001,'accuracy',5,'segment',0,'t',extract(epoch from started)*1000+i*5000)order by i)into raw from generate_series(0,100)i;
 insert into public.activities(id,owner_id,title,sport,started_at,ended_at,summary,rpe,revision)values(aid,uid,'Private fixture','run',started,started+interval '500 seconds','{}',5,1);
 insert into public.activity_tracks(activity_id,owner_id,samples,points)values(aid,uid,raw,raw);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.track_mapping_preference();perform public.submit_track_contribution(aid,1,'device-gps',1);
 return aid;
end $$;
create function pg_temp.mapping_complete(n integer,hash text default null)returns boolean language plpgsql as $$
declare j record;ways jsonb:='[{"wayId":160001,"version":1,"points":[{"lat":0,"lng":0.004},{"lat":0,"lng":0.006}],"nodeIds":[160001,160002],"tags":{"highway":"path","foot":"yes","bicycle":"yes"}}]';support jsonb:='[{"wayId":160001,"version":1,"start":200,"end":800}]';
begin
 update public.track_mapping_budget set last_claim=null;
 select * into j from public.claim_track_mapping_job();
 if j.activity_id is null then raise exception 'Missing queued source';end if;
 if public.track_mapping_job_input(j.activity_id,j.lease)is null then raise exception 'Missing private worker input';end if;
 return public.complete_track_mapping_job(j.activity_id,j.lease,j.revision,'track-reconstruction-v1',ways,support,coalesce(hash,lpad(n::text,64,'0')));
end $$;
do $$declare n integer;
begin
 if has_table_privilege('authenticated','public.track_candidate_evidence','SELECT')or has_table_privilege('authenticated','public.track_osm_ways','INSERT')or has_function_privilege('authenticated','public.claim_track_mapping_job()','EXECUTE')or has_function_privilege('anon','public.list_track_candidates(double precision,double precision)','EXECUTE')then raise exception 'Private mapping privilege leaked';end if;
 for n in 1..4 loop perform pg_temp.mapping_fixture(n);if not pg_temp.mapping_complete(n)then raise exception 'Completion failed';end if;end loop;
 if exists(select 1 from public.list_track_candidates(0,.005))then raise exception 'Below-owner threshold published';end if;
 perform pg_temp.mapping_fixture(5);perform pg_temp.mapping_complete(5);
 if(select count(*)from public.list_track_candidates(0,.005))<>60 then raise exception 'Corroborated partial-way support missing';end if;
 if exists(select 1 from public.list_track_candidates(0,.005)where start_fraction<200 or end_fraction>800)then raise exception 'Whole-way endorsement leaked';end if;
 -- Five distinct owners on a single UTC day remain below the day threshold.
 for n in 1..5 loop
  update public.track_contributions set observed_day=current_date where activity_id=('bc160000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
  perform pg_temp.mapping_complete(n);
 end loop;
 if exists(select 1 from public.list_track_candidates(0,.005))then raise exception 'Single-day support published';end if;
 for n in 1..5 loop
  update public.track_contributions set observed_day=current_date-(n%3+1)where activity_id=('bc160000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
  perform pg_temp.mapping_complete(n);
 end loop;
 insert into public.account_deletions(owner_id)values('ac160000-0000-0000-0000-000000000001');
 if exists(select 1 from public.list_track_candidates(0,.005))then raise exception 'Deletion-frozen support published';end if;
 delete from public.account_deletions where owner_id='ac160000-0000-0000-0000-000000000001';
 -- Identical geometry cannot manufacture distinct-account support.
 update public.track_candidate_evidence set fingerprint=repeat('a',64);
 if exists(select 1 from public.list_track_candidates(0,.005))then raise exception 'Duplicate geometry counted independently';end if;
 update public.track_candidate_evidence set fingerprint=lpad(right(activity_id::text,12),64,'0');
 if not exists(select 1 from public.list_track_candidates(0,.005))then raise exception 'Distinct geometry did not restore support';end if;
 update public.track_mapping_quarantines set quarantined=true where owner_id='ac160000-0000-0000-0000-000000000001';
 perform public.quarantine_track_mapping_owner('ac160000-0000-0000-0000-000000000001',true,'suspected_spoofing');
 if exists(select 1 from public.list_track_candidates(0,.005))then raise exception 'Quarantined support published';end if;
 perform public.quarantine_track_mapping_owner('ac160000-0000-0000-0000-000000000001',false,'review_complete');
 update public.track_mapping_settings set enabled=false where owner_id='ac160000-0000-0000-0000-000000000001';
 if exists(select 1 from public.list_track_candidates(0,.005))then raise exception 'Disabled preference published';end if;
 update public.track_mapping_settings set enabled=true where owner_id='ac160000-0000-0000-0000-000000000001';
 update public.track_contributions set expires_at=now()-interval '1 second' where activity_id='bc160000-0000-0000-0000-000000000001';
 if exists(select 1 from public.list_track_candidates(0,.005))then raise exception 'Expired support published';end if;
 -- Re-complete fixture1 after contribution update deleted its evidence.
 update public.track_contributions set expires_at=now()+interval '1 day'where activity_id='bc160000-0000-0000-0000-000000000001';
 perform pg_temp.mapping_complete(1);
 perform set_config('request.jwt.claim.sub','ac160000-0000-0000-0000-000000000005',true);
 perform public.withdraw_track_contribution('bc160000-0000-0000-0000-000000000005');
 if exists(select 1 from public.list_track_candidates(0,.005))or exists(select 1 from public.track_candidate_evidence where activity_id='bc160000-0000-0000-0000-000000000005')then raise exception 'Withdrawal did not revoke derived support';end if;
end $$;
-- Lease, preference and source changes cannot resurrect withdrawn evidence.
do $$declare j record;old_lease uuid;
begin
 perform pg_temp.mapping_fixture(6);update public.track_mapping_budget set last_claim=null;
 select * into j from public.claim_track_mapping_job();old_lease:=j.lease;
 if exists(select 1 from public.claim_track_mapping_job())then raise exception 'Global provider spacing ignored';end if;
 if public.complete_track_mapping_job(j.activity_id,extensions.gen_random_uuid(),j.revision,'track-reconstruction-v1','[]','[]')then raise exception 'Stale lease accepted';end if;
 begin
  perform public.complete_track_mapping_job(j.activity_id,j.lease,j.revision,'track-reconstruction-v1','[{"wayId":160001.5,"version":1,"points":[{"lat":0,"lng":0.004},{"lat":0,"lng":0.006}],"nodeIds":[1,2],"tags":{}}]','[]');
  raise exception 'Fractional way identifier accepted';
 exception when raise_exception then if sqlerrm='Fractional way identifier accepted'then raise;end if;end;
 begin
  perform public.complete_track_mapping_job(j.activity_id,j.lease,j.revision,'track-reconstruction-v1','[]','[{"wayId":160001,"version":1,"start":-1,"end":1000}]',repeat('b',64));
  raise exception 'Invalid interval accepted';
 exception when raise_exception then if sqlerrm='Invalid interval accepted'then raise;end if;end;
 begin
  perform public.complete_track_mapping_job(j.activity_id,j.lease,j.revision,'track-reconstruction-v1','[]','[{"wayId":160001,"version":1,"start":200,"end":800}]','bad');
  raise exception 'Invalid fingerprint accepted';
 exception when raise_exception then if sqlerrm='Invalid fingerprint accepted'then raise;end if;end;
 update public.track_mapping_settings set revision=revision+1 where owner_id=j.owner_id;
 if public.track_mapping_job_input(j.activity_id,j.lease)is not null or public.complete_track_mapping_job(j.activity_id,j.lease,j.revision,'track-reconstruction-v1','[]','[]')then raise exception 'Changed preference accepted';end if;
 update public.activities set revision=revision+1 where id=j.activity_id;
 if exists(select 1 from public.track_mapping_jobs where activity_id=j.activity_id)then raise exception 'Source invalidation left a job';end if;
 update public.track_mapping_budget set claims=100,last_claim=null;
 if exists(select 1 from public.claim_track_mapping_job())then raise exception 'Daily budget ignored';end if;
end $$;
rollback;
