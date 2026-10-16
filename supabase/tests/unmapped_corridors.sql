begin;
create function pg_temp.corridor_fixture(n integer)returns uuid language plpgsql as $$
declare uid uuid:=('ad160000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;aid uuid:=('bd160000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;started timestamptz:=now()-((n%3+1)||' days')::interval;raw jsonb;
begin
 insert into auth.users(id,email)values(uid,'corridor'||n||'@example.test');
 insert into public.profiles(id,name,handle)values(uid,'Corridor fixture','corridor_fixture_'||n);
 select jsonb_agg(jsonb_build_object('lat',n*.000001,'lng',i*.0001,'accuracy',5,'segment',0,'t',extract(epoch from started)*1000+i*5000)order by i)into raw from generate_series(0,100)i;
 insert into public.activities(id,owner_id,title,sport,started_at,ended_at,summary,rpe,revision)values(aid,uid,'Private corridor fixture','run',started,started+interval '500 seconds','{}',5,1);
 insert into public.activity_tracks(activity_id,owner_id,samples,points)values(aid,uid,raw,raw);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.track_mapping_preference();perform public.submit_track_contribution(aid,1,'device-gps',1);
 return aid;
end $$;
create function pg_temp.corridor_payload()returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('sport','run','widthMeters',5,'geometry',
 (select jsonb_agg(jsonb_build_object('lat',0,'lng',.004+i*.0001)order by i)from generate_series(0,20)i),
 'support',(select jsonb_agg(jsonb_build_object('activityId',activity_id,'revision',source_revision,'preferenceRevision',preference_revision,'fingerprint',lpad(right(activity_id::text,12),64,'0')))from public.track_contributions where owner_id::text like 'ad160000%')))
$$;
do $$declare n integer;j record;cid uuid;rev integer;payload jsonb;
begin
 if has_table_privilege('authenticated','public.track_corridors','SELECT')or has_table_privilege('authenticated','public.track_corridor_support','INSERT')or has_function_privilege('authenticated','public.track_mapping_neighbor_input(uuid,uuid)','EXECUTE')or has_function_privilege('anon','public.list_community_corridors(double precision,double precision)','EXECUTE')then raise exception 'Corridor privilege leaked';end if;
 for n in 1..5 loop perform pg_temp.corridor_fixture(n);end loop;
 update public.track_mapping_budget set last_claim=null;select * into j from public.claim_track_mapping_job();payload:=pg_temp.corridor_payload();
 if public.complete_track_mapping_result(j.activity_id,extensions.gen_random_uuid(),j.revision,'track-reconstruction-v1','[]','[]',null,payload)then raise exception 'Stale lease completed';end if;
 if not public.complete_track_mapping_result(j.activity_id,j.lease,j.revision,'track-reconstruction-v1','[]','[]',null,payload)then raise exception 'Corridor completion failed';end if;
 select id,revision into cid,rev from public.track_corridors;
 if cid is null or not public.track_corridor_supported(cid)then raise exception 'Five-owner three-day support absent';end if;
 if exists(select 1 from public.list_community_corridors(0,.005))then raise exception 'Unreviewed proposal exposed';end if;
 begin perform public.review_track_corridor(cid,rev,true,'Reviewed geometry');raise exception 'Nonreviewer accepted';exception when insufficient_privilege then null;end;
 insert into public.track_reviewers(owner_id)values(auth.uid());
 if not exists(select 1 from public.list_track_corridor_reviews())then raise exception 'Reviewer queue missing';end if;
 begin perform public.review_track_corridor(cid,rev+1,true,'Reviewed geometry');raise exception 'Stale review revision accepted';exception when raise_exception then if sqlerrm='Stale review revision accepted'then raise;end if;end;
 perform public.review_track_corridor(cid,rev,true,'Reviewed geometry');
 if(select count(*)from public.list_community_corridors(0,.005))<>1 then raise exception 'Reviewed corridor missing';end if;
 update public.track_corridor_support set fingerprint=repeat('a',64);
 if exists(select 1 from public.list_community_corridors(0,.005))then raise exception 'Duplicate fingerprints counted';end if;
 update public.track_corridor_support set fingerprint=lpad(right(activity_id::text,12),64,'0');
 update public.track_contributions set observed_day=current_date where owner_id::text like 'ad160000%';
 if exists(select 1 from public.list_community_corridors(0,.005))then raise exception 'Single-day support counted';end if;
 update public.track_contributions set observed_day=current_date-(right(activity_id::text,1)::int%3+1)where owner_id::text like 'ad160000%';
 delete from public.track_corridor_support where corridor_id=cid and activity_id='bd160000-0000-0000-0000-000000000001';
 if public.track_corridor_supported(cid)then raise exception 'Four owners supported corridor';end if;
 insert into public.track_corridor_support values(cid,'bd160000-0000-0000-0000-000000000001',1,1,lpad('1',64,'0'));
 perform public.report_track_corridor(cid,'geometry');
 if exists(select 1 from public.list_community_corridors(0,.005))or not exists(select 1 from public.track_corridor_reports where corridor_id=cid and state='open')then raise exception 'Report failed to suppress corridor';end if;
 begin perform public.review_track_corridor(cid,rev,true,'Stale pre-report review');raise exception 'Pre-report revision resolved newer report';exception when raise_exception then if sqlerrm='Pre-report revision resolved newer report'then raise;end if;end;
 select revision into rev from public.track_corridors where id=cid;
 perform public.review_track_corridor(cid,rev,true,'Resolved report after review');
 if exists(select 1 from public.track_corridor_reports where corridor_id=cid and state='open')then raise exception 'Review did not resolve report';end if;
 update public.track_corridors set expires_at=now()-interval '1 second'where id=cid;
 if exists(select 1 from public.list_community_corridors(0,.005))then raise exception 'Expired corridor exposed';end if;
 update public.track_corridors set expires_at=now()+interval '1 day'where id=cid;
 update public.track_mapping_settings set revision=revision+1 where owner_id='ad160000-0000-0000-0000-000000000001';
 if public.track_corridor_supported(cid)then raise exception 'Stale preference supported corridor';end if;
 update public.track_mapping_settings set revision=revision-1 where owner_id='ad160000-0000-0000-0000-000000000001';
 perform set_config('request.jwt.claim.sub','ad160000-0000-0000-0000-000000000005',true);
 perform public.withdraw_track_contribution('bd160000-0000-0000-0000-000000000005');
 if exists(select 1 from public.list_community_corridors(0,.005))then raise exception 'Withdrawn support still exposed';end if;
 if public.complete_track_mapping_result(j.activity_id,j.lease,j.revision,'track-reconstruction-v1','[]','[]',null,payload)then raise exception 'Consumed lease resurrected corridor';end if;
 update public.activities set revision=revision+1 where id='bd160000-0000-0000-0000-000000000002';
 if public.track_corridor_supported(cid)then raise exception 'Changed source revision supported corridor';end if;
 perform pg_temp.corridor_fixture(6);update public.track_mapping_budget set last_claim=null;
 select * into j from public.claim_track_mapping_job();
 update public.track_mapping_jobs set locked_at=now()-interval '6 minutes'where activity_id=j.activity_id;
 if public.complete_track_mapping_result(j.activity_id,j.lease,j.revision,'track-reconstruction-v1','[]','[]',null,'[]')then raise exception 'Expired lease accepted';end if;

end $$;
rollback;
