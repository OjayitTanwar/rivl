begin;
create function pg_temp.track_fixture(n integer) returns uuid language plpgsql as $$
declare uid uuid:=('aa000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid; aid uuid:=('bb000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid; started timestamptz:=now()-((n%3+1)||' days')::interval; raw jsonb;
begin
 insert into auth.users(id,email)values(uid,'track'||n||'@example.test');
 insert into public.profiles(id,name,handle)values(uid,'Track fixture','track_fixture_'||n);
 select jsonb_agg(jsonb_build_object('lat',0,'lng',i*.0001,'accuracy',5,'segment',0,'t',extract(epoch from started)*1000+i*5000)order by i)into raw from generate_series(0,100)i;
 insert into public.activities(id,owner_id,title,sport,started_at,ended_at,summary,rpe,revision) values(aid,uid,'Private fixture','run',started,started+interval '500 seconds','{}',5,1);
 insert into public.activity_tracks(activity_id,owner_id,samples,points) values(aid,uid,raw,raw);
 return aid;
end $$;
select pg_temp.track_fixture(i) from generate_series(1,5)i;
set local role authenticated;
do $$ declare n integer;uid uuid;aid uuid;s record;
begin
 for n in 1..4 loop
 uid:=('aa000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;aid:=('bb000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
 perform set_config('request.jwt.claim.sub',uid::text,true);select * into s from public.track_mapping_preference();if not s.enabled or s.revision<>1 then raise exception 'Wrong default';end if;
 perform public.submit_track_contribution(aid,1,'device-gps',1);
 perform public.submit_track_contribution(aid,1,'device-gps',1);
 end loop;
 if exists(select 1 from public.list_observed_track_cells(0,.005)) then raise exception 'Published below owner minimum';end if;
 perform set_config('request.jwt.claim.sub','aa000000-0000-0000-0000-000000000005',true);
 perform public.track_mapping_preference();perform public.submit_track_contribution('bb000000-0000-0000-0000-000000000005',1,'watch-gps',1);
 if not exists(select 1 from public.list_observed_track_cells(0,.005)) then raise exception 'Corroborated evidence missing';end if;
 if has_table_privilege('authenticated','public.track_contributions','SELECT') then raise exception 'Private evidence exposed';end if;
 if has_table_privilege('authenticated','public.track_mapping_settings','UPDATE') then raise exception 'Direct preference update granted';end if;
 if has_function_privilege('anon','public.list_observed_track_cells(double precision,double precision)','EXECUTE') then raise exception 'Anonymous map access';end if;
 begin perform public.submit_track_contribution('bb000000-0000-0000-0000-000000000001',1,'device-gps',1);raise exception 'Wrong owner accepted';exception when raise_exception then if sqlerrm='Wrong owner accepted' then raise;end if;end;
 perform public.withdraw_track_contribution('bb000000-0000-0000-0000-000000000005');
 if exists(select 1 from public.list_observed_track_cells(0,.005)) then raise exception 'Withdrawal did not retract';end if;
 perform public.set_track_mapping_preference(false);
 begin perform public.submit_track_contribution('bb000000-0000-0000-0000-000000000005',1,'device-gps',2);raise exception 'Disabled submission accepted';exception when raise_exception then if sqlerrm='Disabled submission accepted' then raise;end if;end;
 perform public.set_track_mapping_preference(true);
 begin perform public.submit_track_contribution('bb000000-0000-0000-0000-000000000005',1,'device-gps',1);raise exception 'Stale preference accepted';exception when raise_exception then if sqlerrm='Stale preference accepted' then raise;end if;end;
 perform public.submit_track_contribution('bb000000-0000-0000-0000-000000000005',1,'device-gps',3);
end $$;
reset role;
-- Moderator and account freeze each remove support immediately without exposing
-- contributor identity; clients cannot clear a quarantine.
select public.quarantine_track_mapping_owner('aa000000-0000-0000-0000-000000000001',true,'suspected_spoofing');
set local role authenticated;
do $$ begin
 if exists(select 1 from public.list_observed_track_cells(0,.005))then raise exception 'Quarantined support published';end if;
 if has_function_privilege('authenticated','public.quarantine_track_mapping_owner(uuid,boolean,text)','EXECUTE')then raise exception 'Client quarantine override';end if;
end $$;
reset role;
select public.quarantine_track_mapping_owner('aa000000-0000-0000-0000-000000000001',false,'review_complete');
insert into public.account_deletions(owner_id)values('aa000000-0000-0000-0000-000000000001');
set local role authenticated;
do $$ begin if exists(select 1 from public.list_observed_track_cells(0,.005))then raise exception 'Deletion-frozen support published';end if;end $$;
reset role;
delete from public.account_deletions where owner_id='aa000000-0000-0000-0000-000000000001';
do $$ begin
 if(select count(*) from public.track_contributions)<>5 then raise exception 'Idempotence failed';end if;
 if exists(select 1 from public.track_contributions c cross join lateral jsonb_array_elements(c.cells)v where(v->>'x')::integer<1 or(v->>'x')::integer>4)then raise exception 'Endpoint evidence leaked';end if;
 update public.activities set revision=2 where id='bb000000-0000-0000-0000-000000000005';
 if exists(select 1 from public.track_contributions where activity_id='bb000000-0000-0000-0000-000000000005')then raise exception 'Edited source not invalidated';end if;
 insert into public.privacy_zones(id,owner_id,label,center,radius)values('cc000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','Fixture zone',extensions.st_setsrid(extensions.st_makepoint(.005,0),4326)::extensions.geography,200);
 if exists(select 1 from public.track_contributions where owner_id='aa000000-0000-0000-0000-000000000001')then raise exception 'Zone revision not invalidated';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','aa000000-0000-0000-0000-000000000002',true);
select public.delete_my_track_contributions();
reset role;
do $$ begin if exists(select 1 from public.track_contributions where owner_id='aa000000-0000-0000-0000-000000000002')then raise exception 'Delete previous failed';end if;end $$;
rollback;
