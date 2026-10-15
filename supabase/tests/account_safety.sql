\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','safety-owner@example.test'),
 ('10000000-0000-4000-8000-000000000002','safety-reader@example.test');
insert into public.profiles(id,name,handle) values
 ('10000000-0000-4000-8000-000000000001','Owner','safetyowner'),
 ('10000000-0000-4000-8000-000000000002','Reader','safetyreader');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.save_activity(
 '{"id":"10000000-0000-4000-8000-000000000010","owner_id":"10000000-0000-4000-8000-000000000001","title":"Safety test","sport":"run","started_at":"2026-10-07T08:00:00Z","ended_at":"2026-10-07T09:00:00Z","summary":{},"visibility":"public","rpe":5,"revision":1}', '[[0,0,1,0,40,-1,-1,0],[0,100,1000,0,40,-1,-1,0]]', '[{"lat":0,"lng":0,"segment":0},{"lat":0,"lng":0.01,"segment":0}]');
insert into public.comments(id,activity_id,athlete_id,body) values
 ('10000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000010',auth.uid(),'Test comment');
insert into storage.objects(bucket_id,name) values('activity-media',auth.uid()::text||'/workout/photo.jpg');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 if has_function_privilege(current_user,'public.queue_account_deletion(uuid)','EXECUTE') then raise exception 'Client can queue arbitrary deletion'; end if;
 if has_function_privilege(current_user,'public.claim_account_deletion(uuid)','EXECUTE') then raise exception 'Client can claim deletion jobs'; end if;
 if has_function_privilege(current_user,'public.review_content_report(uuid,boolean)','EXECUTE') then raise exception 'Client can moderate content'; end if;
 if exists(select 1 from storage.objects) then raise exception 'Reader can access owner media'; end if;
 if (select count(*) from public.published_activities)<>1 then raise exception 'Public workout missing'; end if;
 begin
  perform public.report_content('10000000-0000-4000-8000-000000000030','activity','10000000-0000-4000-8000-000000000099','spam','');
  raise exception 'Forged target accepted';
 exception when insufficient_privilege then null; end;
end $$;
select public.report_content('10000000-0000-4000-8000-000000000030','comment','10000000-0000-4000-8000-000000000020','privacy','Test report');
do $$ begin
 if public.report_content('10000000-0000-4000-8000-000000000031','comment','10000000-0000-4000-8000-000000000020','privacy','Retry')<>'10000000-0000-4000-8000-000000000030'::uuid then raise exception 'Duplicate report not idempotent'; end if;
 if (select count(*) from public.content_reports)<>1 then raise exception 'Report duplicated'; end if;
 begin
  update public.content_reports set state='removed';
  raise exception 'Client can decide report outcome';
 exception when insufficient_privilege then null; end;
end $$;
insert into public.athlete_blocks(blocker_id,blocked_id) values(auth.uid(),'10000000-0000-4000-8000-000000000001');
do $$ begin
 if exists(select 1 from public.published_activities) then raise exception 'Blocked publication visible'; end if;
 if exists(select 1 from public.comments) then raise exception 'Blocked comment visible'; end if;
 if exists(select 1 from public.profiles where id='10000000-0000-4000-8000-000000000001') then raise exception 'Blocked profile visible'; end if;
 begin
  insert into public.comments(activity_id,athlete_id,body) values('10000000-0000-4000-8000-000000000010',auth.uid(),'Cannot interact');
  raise exception 'Blocked interaction accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.profiles where id='10000000-0000-4000-8000-000000000002') then raise exception 'Reciprocal block bypassed'; end if;
 if exists(select 1 from public.content_reports) then raise exception 'Reported athlete can read reporter details'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
delete from public.athlete_blocks where blocker_id=auth.uid();
reset role;
set local role service_role;
select public.review_content_report('10000000-0000-4000-8000-000000000030',true);
reset role;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.comments) then raise exception 'Removed content still visible'; end if;
 if (select count(*) from public.published_activities)<>1 then raise exception 'Moderating a comment hid the workout'; end if;
end $$;
reset role;
set local role service_role;
select public.queue_account_deletion('10000000-0000-4000-8000-000000000001');
select public.queue_account_deletion('10000000-0000-4000-8000-000000000001');
reset role;
set local role authenticated;
do $$ begin
 if exists(select 1 from public.published_activities) then raise exception 'Deleting athlete remains public'; end if;
 if exists(select 1 from public.account_deletions) then raise exception 'Reader sees deletion status of another athlete'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 if public.account_active() then raise exception 'Deletion did not freeze old JWT'; end if;
 if exists(select 1 from public.activities) then raise exception 'Frozen account can still read workouts'; end if;
 if exists(select 1 from storage.objects) then raise exception 'Frozen account can still read media'; end if;
 if (select count(*) from public.account_deletions)<>1 then raise exception 'Own deletion status unavailable'; end if;
 begin
  perform public.save_activity('{"id":"10000000-0000-4000-8000-000000000010","owner_id":"10000000-0000-4000-8000-000000000001","title":"Bypass freeze","sport":"run","started_at":"2026-10-07T08:00:00Z","ended_at":"2026-10-07T09:00:00Z","summary":{},"visibility":"public","rpe":5,"revision":2}',null,null);
  raise exception 'Definer RPC bypassed deletion freeze';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
do $$ declare job public.account_deletions; begin
 select * into job from public.claim_account_deletion('10000000-0000-4000-8000-000000000001');
 if job.lease_token is null then raise exception 'Claim missing lease'; end if;
 if exists(select 1 from public.claim_account_deletion(job.owner_id)) then raise exception 'Concurrent worker stole lease'; end if;
 if not public.deletion_lease_valid(job.owner_id,job.lease_token) then raise exception 'Valid lease rejected'; end if;
 if exists(select 1 from public.deletion_media(job.owner_id,gen_random_uuid())) then raise exception 'Wrong lease returned object paths'; end if;
 if (select count(*) from public.deletion_media(job.owner_id,job.lease_token))<>1 then raise exception 'Owned media missing'; end if;
 perform public.finish_account_deletion(job.owner_id,gen_random_uuid(),true);
 if (select state from public.account_deletions where owner_id=job.owner_id)<>'processing' then raise exception 'Stale worker completed job'; end if;
 perform public.finish_account_deletion(job.owner_id,job.lease_token,false);
 if (select state from public.account_deletions where owner_id=job.owner_id)<>'failed' then raise exception 'Failed job not retryable'; end if;
end $$;
reset role;
delete from auth.users where id='10000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from public.activities) or exists(select 1 from public.profiles where id='10000000-0000-4000-8000-000000000001') or exists(select 1 from public.content_reports) then raise exception 'Identity deletion left owned database data'; end if;
 if (select count(*) from public.account_deletions)<>1 then raise exception 'Deletion job lost during identity cascade'; end if;
end $$;
rollback;
