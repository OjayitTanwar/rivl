begin;
insert into auth.users(id,email)values('c9100000-0000-0000-0000-000000000001','mod-author@example.test'),('c9100000-0000-0000-0000-000000000002','mod-reporter@example.test'),('c9100000-0000-0000-0000-000000000003','mod-operator@example.test'),('c9100000-0000-0000-0000-000000000004','mod-track@example.test');
insert into public.profiles(id,name,handle)select id,'Moderation fixture','moderation_'||right(id::text,1)from auth.users where id::text like 'c9100000%';
insert into public.app_moderators values('c9100000-0000-0000-0000-000000000003');
insert into public.track_reviewers values('c9100000-0000-0000-0000-000000000004');
insert into public.activities(id,owner_id,title,sport,started_at,ended_at,summary,rpe,revision)values('c9200000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000001','Reported activity','run',now()-interval '1 hour',now(),'{}',5,1);
insert into public.published_activities(id,owner_id,title,sport,started_at,summary,visibility,note)values('c9200000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000001','Reported activity','run',now()-interval '1 hour','{}','public','Reported note');
insert into public.content_reports(id,reporter_id,target_kind,target_id,target_owner,reason)values('c9300000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000002','activity','c9200000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000001','spam');
insert into public.routes(id,owner_id,name,sport,points,distance,ascent,routing)values('c9200000-0000-0000-0000-000000000002','c9100000-0000-0000-0000-000000000001','Route','run','[]',1000,0,'recorded');
insert into public.shared_routes(id,owner_id,title,sport,creator,points,distance,surface)values('c9200000-0000-0000-0000-000000000002','c9100000-0000-0000-0000-000000000001','Shared route','run','Author','[{"lat":0,"lng":0},{"lat":0,"lng":0.01}]',1000,'Trail');
insert into public.shared_route_reports(id,reporter_id,route_id,reason)values('c9300000-0000-0000-0000-000000000002','c9100000-0000-0000-0000-000000000002','c9200000-0000-0000-0000-000000000002','unsafe');
insert into public.creator_training_programs(id,owner_id,latest_revision)values('c9200000-0000-0000-0000-000000000003','c9100000-0000-0000-0000-000000000001',1);
insert into public.creator_training_versions(program_id,revision,payload)values('c9200000-0000-0000-0000-000000000003',1,'{"title":"Reported program","description":"Published description"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','c9100000-0000-0000-0000-000000000002',true);
select public.report_creator_program('c9200000-0000-0000-0000-000000000003','unsafe');
select public.report_creator_program('c9200000-0000-0000-0000-000000000003','unsafe');
do $$begin
 if public.is_app_moderator()then raise exception 'Ordinary user promoted';end if;
 if has_table_privilege('authenticated','public.app_moderators','INSERT')or has_table_privilege('authenticated','public.moderation_actions','SELECT')then raise exception 'Staff or audit access granted';end if;
 if has_function_privilege('authenticated','public.moderation_item(text,uuid)','EXECUTE')then raise exception 'Internal projection callable';end if;
 begin perform public.moderation_queue();raise exception 'Ordinary user read queue';exception when insufficient_privilege then null;end;
 begin perform public.decide_moderation('content','c9300000-0000-0000-0000-000000000001',repeat('0',32),'hide','Reason');raise exception 'Ordinary user decided';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','c9100000-0000-0000-0000-000000000004',true);
do $$begin
 if public.is_app_moderator()or not public.is_track_reviewer()then raise exception 'GPS role conflated';end if;
 begin perform public.moderation_queue();raise exception 'GPS reviewer read global queue';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','c9100000-0000-0000-0000-000000000003',true);
do $$declare item jsonb;begin
 if public.is_track_reviewer()or not public.is_app_moderator()then raise exception 'App role conflated';end if;
 if(select count(*)from public.moderation_queue())<>3 then raise exception 'Expected three report types';end if;
 if exists(select 1 from public.moderation_queue()i where i ? 'points' or i ? 'reporter_id' or i ? 'route' or i ? 'summary')then raise exception 'Private geometry or reporter leaked';end if;
 select i into item from public.moderation_queue()i where i->>'kind'='content';
 begin perform public.decide_moderation('content',(item->>'id')::uuid,item->>'version','hide','');raise exception 'Empty review reason accepted';exception when raise_exception then if sqlerrm='Empty review reason accepted'then raise;end if;end;
 begin perform public.decide_moderation('content',(item->>'id')::uuid,repeat('0',32),'hide','Reviewed');raise exception 'Stale decision accepted';exception when serialization_failure then null;end;
 perform public.decide_moderation('content',(item->>'id')::uuid,item->>'version','hide','Spam confirmed');
 begin perform public.decide_moderation('content',(item->>'id')::uuid,item->>'version','dismiss','Second decision');raise exception 'Duplicate decision accepted';exception when serialization_failure then null;end;
 select i into item from public.moderation_queue()i where i->>'kind'='sharedRoute';
 perform public.decide_moderation('sharedRoute',(item->>'id')::uuid,item->>'version','hide','Unsafe route confirmed');
 select i into item from public.moderation_queue()i where i->>'kind'='creator';
 perform public.decide_moderation('creator',(item->>'id')::uuid,item->>'version','hide','Unsafe training confirmed');
 if exists(select 1 from public.moderation_queue())then raise exception 'Decisions left reports open';end if;
end $$;
reset role;
do $$begin
 if not exists(select 1 from public.hidden_content where target_id='c9200000-0000-0000-0000-000000000001')then raise exception 'Content hide failed';end if;
 if not exists(select 1 from public.shared_routes where id='c9200000-0000-0000-0000-000000000002'and hidden)then raise exception 'Route hide failed';end if;
 if not exists(select 1 from public.creator_training_quarantines where owner_id='c9100000-0000-0000-0000-000000000001'and quarantined)then raise exception 'Creator pause failed';end if;
 if(select count(*)from public.moderation_actions where staff_id='c9100000-0000-0000-0000-000000000003'and length(reason)>0)<>3 then raise exception 'Audit attribution failed';end if;
 if(select count(*)from public.creator_training_reports)<>1 then raise exception 'Program report duplicated';end if;
end $$;
-- Dismissal does not hide the target; editing the published source invalidates a pending review.
insert into public.content_reports(id,reporter_id,target_kind,target_id,target_owner,reason)values('c9300000-0000-0000-0000-000000000004','c9100000-0000-0000-0000-000000000004','activity','c9200000-0000-0000-0000-000000000001','c9100000-0000-0000-0000-000000000001','other');
create temporary table review_snapshot(item jsonb);
insert into review_snapshot select public.moderation_item('content','c9300000-0000-0000-0000-000000000004');
grant select on review_snapshot to authenticated;
update public.published_activities set note='Edited note'where id='c9200000-0000-0000-0000-000000000001';
set local role authenticated;
do $$declare item jsonb;begin
 select s.item into item from review_snapshot s;
 begin perform public.decide_moderation('content',(item->>'id')::uuid,item->>'version','dismiss','Old snapshot');raise exception 'Source edit not guarded';exception when serialization_failure then null;end;
 select i into item from public.moderation_queue()i;
 perform public.decide_moderation('content',(item->>'id')::uuid,item->>'version','dismiss','No further action');
end $$;
reset role;
-- A large backlog stays bounded; missing targets do not expose private source rows.
insert into public.content_reports(reporter_id,target_kind,target_id,target_owner,reason)
select 'c9100000-0000-0000-0000-000000000002','activity',('c9400000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'c9100000-0000-0000-0000-000000000001','other'from generate_series(1,25)n;
set local role authenticated;
do $$declare item jsonb;begin
 if(select count(*)from public.moderation_queue())<>20 then raise exception 'Moderation backlog unbounded';end if;
 select i into item from public.moderation_queue()i limit 1;
 perform public.decide_moderation('content',(item->>'id')::uuid,item->>'version','dismiss','Reported target no longer exists');
end $$;
reset role;
do $$begin
 if(select count(*)from public.moderation_actions where decision='dismiss')<>2 then raise exception 'Dismiss decisions were not audited';end if;
 if exists(select 1 from public.hidden_content where target_id::text like 'c9400000%')then raise exception 'Dismissal hid content';end if;
end $$;
delete from public.app_moderators where owner_id='c9100000-0000-0000-0000-000000000003';
set local role authenticated;
do $$begin begin perform public.moderation_queue();raise exception 'Revoked operator retained access';exception when insufficient_privilege then null;end;end $$;
rollback;
