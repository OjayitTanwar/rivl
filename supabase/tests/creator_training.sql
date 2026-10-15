begin;
insert into auth.users(id,email)values('e1000000-0000-0000-0000-000000000001','creator@example.test'),('e1000000-0000-0000-0000-000000000002','viewer@example.test');
insert into profiles(id,name,handle)values('e1000000-0000-0000-0000-000000000001','Creator fixture','creator_fixture'),('e1000000-0000-0000-0000-000000000002','Viewer fixture','viewer_fixture');
create function pg_temp.creator_fixture(rev integer default 1,title text default 'Fixture program')returns jsonb language sql as $$
 select jsonb_build_object('id','e2000000-0000-0000-0000-000000000001','ownerId','e1000000-0000-0000-0000-000000000001','creatorName','Creator fixture','title',title,'description','Real creator-declared program fixture','sport','run','level','all','weeks',2,'revision',rev,'updatedAt',1000000,'license','CC-BY-4.0','sessions',jsonb_build_array(jsonb_build_object('id','session-1','week',1,'day',1,'title','Intervals','notes','','workout',jsonb_build_object('warmupSec',60,'workSec',120,'recoverySec',60,'repeats',3,'cooldownSec',60))))
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
select public.publish_creator_program(pg_temp.creator_fixture());
select public.publish_creator_program(pg_temp.creator_fixture());
do $$ begin
 if(select count(*)from public.list_creator_programs())<>1 then raise exception 'Creator browse missing';end if;
 if(select count(*)from public.list_creator_programs('ride'))<>0 then raise exception 'Sport filter ignored';end if;
 if has_table_privilege('authenticated','public.creator_training_versions','SELECT')or has_table_privilege('authenticated','public.creator_training_programs','UPDATE')then raise exception 'Direct creator table access';end if;
 if has_function_privilege('anon','public.list_creator_programs(public.activity_sport)','EXECUTE')then raise exception 'Anonymous browse granted';end if;
 begin perform publish_creator_program(pg_temp.creator_fixture(1,'Changed same version'));raise exception 'Mutated version accepted';exception when raise_exception then if sqlerrm='Mutated version accepted'then raise;end if;end;
 begin perform publish_creator_program(pg_temp.creator_fixture()||'{"origin":{"creatorName":"Another author"}}');raise exception 'Private import state accepted';exception when raise_exception then if sqlerrm='Private import state accepted'then raise;end if;end;
 begin perform publish_creator_program(jsonb_set(pg_temp.creator_fixture(),'{sessions,0,workout,workSec}','0'));raise exception 'Zero work accepted';exception when raise_exception then if sqlerrm='Zero work accepted'then raise;end if;end;
 begin perform publish_creator_program(jsonb_set(pg_temp.creator_fixture(),'{creatorName}','7'));raise exception 'Numeric author name accepted';exception when raise_exception then if sqlerrm='Numeric author name accepted'then raise;end if;end;
 begin perform publish_creator_program(jsonb_set(pg_temp.creator_fixture(),'{sessions}','[]'));raise exception 'Empty publish accepted';exception when raise_exception then if sqlerrm='Empty publish accepted'then raise;end if;end;
 begin perform publish_creator_program(jsonb_set(pg_temp.creator_fixture(),'{sessions,0,workout}', '{"warmupSec":3600,"workSec":3600,"recoverySec":3600,"repeats":50,"cooldownSec":3600}'));raise exception 'Overlong workout accepted';exception when raise_exception then if sqlerrm='Overlong workout accepted'then raise;end if;end;
 perform public.publish_creator_program(pg_temp.creator_fixture(2,'Second version'));
 if(select program->>'title'from public.list_creator_programs())<>'Second version'then raise exception 'Latest version not published';end if;
 begin perform public.publish_creator_program(pg_temp.creator_fixture());raise exception 'Stale version accepted';exception when raise_exception then if sqlerrm='Stale version accepted'then raise;end if;end;
 perform public.unpublish_creator_program('e2000000-0000-0000-0000-000000000001');
 if exists(select 1 from list_creator_programs())then raise exception 'Unpublication failed';end if;
 perform public.publish_creator_program(pg_temp.creator_fixture(2,'Second version'));
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
do $$ begin
 if(select count(*)from list_creator_programs())<>1 then raise exception 'Authenticated browse missing';end if;
 begin perform unpublish_creator_program('e2000000-0000-0000-0000-000000000001');raise exception 'Foreign unpublish accepted';exception when insufficient_privilege then null;end;
 begin perform publish_creator_program(pg_temp.creator_fixture(3));raise exception 'Foreign publish accepted';exception when insufficient_privilege then null;end;
 begin perform publish_creator_program(jsonb_set(pg_temp.creator_fixture(3),'{ownerId}','"e1000000-0000-0000-0000-000000000002"'));raise exception 'Foreign identity collision accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if(select count(*)from creator_training_versions)<>2 then raise exception 'Version idempotency failed';end if;
 if(select payload->>'title'from creator_training_versions where revision=1)<>'Fixture program'then raise exception 'Old version mutated';end if;
end $$;
insert into athlete_blocks(blocker_id,blocked_id)values('e1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
do $$ begin if exists(select 1 from list_creator_programs())then raise exception 'Blocked creator exposed';end if;end $$;
reset role;
delete from athlete_blocks where blocker_id='e1000000-0000-0000-0000-000000000002';
select quarantine_creator_training('e1000000-0000-0000-0000-000000000001',true,'fraud');
set local role authenticated;
do $$ begin
 if exists(select 1 from list_creator_programs())then raise exception 'Quarantined creator exposed';end if;
 if has_function_privilege('authenticated','public.quarantine_creator_training(uuid,boolean,text)','EXECUTE')then raise exception 'Client quarantine override';end if;
end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
do $$ begin begin perform publish_creator_program(pg_temp.creator_fixture(3));raise exception 'Quarantined creator publish accepted';exception when insufficient_privilege then null;end;end $$;
reset role;
select quarantine_creator_training('e1000000-0000-0000-0000-000000000001',false,'review_complete');
insert into account_deletions(owner_id)values('e1000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',true);
do $$ begin if exists(select 1 from list_creator_programs())then raise exception 'Deletion-frozen creator exposed';end if;end $$;
select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',true);
do $$ begin begin perform publish_creator_program(pg_temp.creator_fixture(3));raise exception 'Frozen creator publish accepted';exception when insufficient_privilege then null;end;end $$;
reset role;
delete from auth.users where id='e1000000-0000-0000-0000-000000000001';
do $$ begin if exists(select 1 from creator_training_programs)or exists(select 1 from creator_training_versions)then raise exception 'Deleted creator retained';end if;end $$;
rollback;
