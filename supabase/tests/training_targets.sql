begin;
insert into auth.users(id,email)values('f1000000-0000-0000-0000-000000000001','target-creator@example.test'),('f1000000-0000-0000-0000-000000000002','target-viewer@example.test');
insert into public.profiles(id,name,handle)values('f1000000-0000-0000-0000-000000000001','Target creator','target_creator'),('f1000000-0000-0000-0000-000000000002','Target viewer','target_viewer');
create function pg_temp.target_program(rev integer default 1)returns jsonb language sql as $$
 select jsonb_build_object('id','f2000000-0000-0000-0000-000000000001','ownerId','f1000000-0000-0000-0000-000000000001','creatorName','Target creator','title','Target test','description','','sport','run','level','all','weeks',1,'revision',rev,'updatedAt',1000000,'license','CC0-1.0','sessions',jsonb_build_array(jsonb_build_object('id','session-1','week',1,'day',1,'title','Work intervals','notes','','workout',jsonb_build_object('warmupSec',60,'workSec',120,'recoverySec',60,'repeats',3,'cooldownSec',60))))
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
select public.publish_creator_program(pg_temp.target_program());
do $$declare p jsonb;t jsonb;revision integer:=2;payload jsonb;begin
 -- Optional means omitted, not null. Reject metadata and untyped/noninteger/reversed bounds.
 for t in select value from jsonb_array_elements('[null,[],{}, {"kind":"unknown","min":1,"max":2},{"kind":"pace","min":120},{"kind":"pace","min":"120","max":1800},{"kind":"pace","min":120,"max":"Infinity"},{"kind":"pace","min":120.1,"max":1800},{"kind":"pace","min":1800,"max":120},{"kind":"pace","min":119,"max":1800},{"kind":"pace","min":120,"max":1801},{"kind":"heartRate","min":29,"max":250},{"kind":"heartRate","min":30,"max":251},{"kind":"power","min":0,"max":2500},{"kind":"power","min":1,"max":2501},{"kind":"strength","min":0,"max":100},{"kind":"strength","min":1,"max":101},{"kind":"power","min":1,"max":1e100},{"kind":"pace","min":120,"max":1800,"privateHealth":{"hr":123}}]')loop
  p:=jsonb_set(pg_temp.target_program(revision),'{sessions,0,workout,target}',t);
  begin perform public.publish_creator_program(p);raise exception 'Invalid target accepted: %',t;exception when raise_exception then if sqlerrm like 'Invalid target accepted:%' then raise;end if;end;
 end loop;
 -- All known sports can use the guidance units; no inferred medical or sensor readiness.
 for t in select value from jsonb_array_elements('[{"kind":"pace","min":120,"max":1800},{"kind":"heartRate","min":30,"max":250},{"kind":"power","min":1,"max":2500},{"kind":"strength","min":1,"max":100}]')loop
  p:=jsonb_set(pg_temp.target_program(revision),'{sessions,0,workout,target}',t);
  perform public.publish_creator_program(p);perform public.publish_creator_program(p);
  select program into payload from public.list_creator_programs();
  if payload#>'{sessions,0,workout,target}'is distinct from t then raise exception 'Target was dropped or changed';end if;
  begin perform public.publish_creator_program(jsonb_set(p,'{sessions,0,workout,target,min}',to_jsonb((t->>'min')::integer+1)));raise exception 'Target mutation in immutable revision accepted';exception when raise_exception then if sqlerrm='Target mutation in immutable revision accepted'then raise;end if;end;
  revision:=revision+1;
 end loop;
 -- An omitted target remains compatible and does not inherit a previous interval target.
 perform public.publish_creator_program(pg_temp.target_program(revision));
 select program into payload from public.list_creator_programs();
 if payload#>'{sessions,0,workout}' ? 'target' then raise exception 'Removed target retained';end if;
end $$;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000002',true);
do $$begin
 begin perform public.publish_creator_program(jsonb_set(pg_temp.target_program(7),'{sessions,0,workout,target}','{"kind":"pace","min":300,"max":400}'));raise exception 'Foreign target publication accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if(select count(*)from public.creator_training_versions where program_id='f2000000-0000-0000-0000-000000000001')<>6 then raise exception 'Target version idempotency or invalid rollback failed';end if;
end $$;
select public.quarantine_creator_training('f1000000-0000-0000-0000-000000000001',true,'fraud');
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',true);
do $$begin
 if exists(select 1 from public.list_creator_programs())then raise exception 'Quarantined targets exposed';end if;
 begin perform public.publish_creator_program(pg_temp.target_program(7));raise exception 'Quarantine target bypass';exception when insufficient_privilege then null;end;
end $$;
rollback;
