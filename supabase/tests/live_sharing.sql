\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('91000000-0000-4000-8000-000000000001','live1@example.test'),('91000000-0000-4000-8000-000000000002','live2@example.test'),('91000000-0000-4000-8000-000000000003','live3@example.test');
insert into public.profiles(id,name,handle) values ('91000000-0000-4000-8000-000000000001','Sender','livesender'),('91000000-0000-4000-8000-000000000002','Friend','livefriend'),('91000000-0000-4000-8000-000000000003','Stranger','livestranger');
insert into public.friendships(requester_id,recipient_id,status) values ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','accepted');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.start_live_share(array['91000000-0000-4000-8000-000000000003'::uuid]);raise exception 'Nonfriend granted';exception when insufficient_privilege then null;end;
 begin perform public.start_live_share(array['91000000-0000-4000-8000-000000000002'::uuid,'91000000-0000-4000-8000-000000000002'::uuid]);raise exception 'Duplicate accepted';exception when insufficient_privilege then null;end;
end $$;
select set_config('test.live_share',(public.start_live_share(array['91000000-0000-4000-8000-000000000002'::uuid])->>'id'),true);
select public.update_live_share(current_setting('test.live_share')::uuid,10,20,5,clock_timestamp());
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$ begin
 if jsonb_array_length(public.list_live_shares())<>1 then raise exception 'Friend cannot read';end if;
 begin perform public.update_live_share(current_setting('test.live_share')::uuid,11,20,5,clock_timestamp());raise exception 'Recipient wrote';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
do $$ begin if jsonb_array_length(public.list_live_shares())<>0 then raise exception 'Stranger read';end if;end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
insert into public.athlete_blocks(blocker_id,blocked_id) values(auth.uid(),'91000000-0000-4000-8000-000000000001');
do $$ begin if jsonb_array_length(public.list_live_shares())<>0 then raise exception 'Blocked read';end if;end $$;
delete from public.athlete_blocks where blocker_id=auth.uid();
do $$ begin if jsonb_array_length(public.list_live_shares())<>0 then raise exception 'Unblock revived old grant';end if;end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.stop_live_share(current_setting('test.live_share')::uuid);
do $$ begin
 begin perform public.update_live_share(current_setting('test.live_share')::uuid,11,20,5,clock_timestamp());raise exception 'Stopped revived';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('test.live_share',(public.start_live_share(array['91000000-0000-4000-8000-000000000002'::uuid])->>'id'),true);
update public.live_shares set started_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=current_setting('test.live_share')::uuid;
set local role authenticated;
do $$ begin
 if jsonb_array_length(public.list_live_shares())<>0 then raise exception 'Expired read';end if;
 begin perform public.update_live_share(current_setting('test.live_share')::uuid,11,20,5,clock_timestamp());raise exception 'Expired revived';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('test.live_share',(public.start_live_share(array['91000000-0000-4000-8000-000000000002'::uuid])->>'id'),true);
delete from public.friendships where requester_id='91000000-0000-4000-8000-000000000001';
insert into public.friendships(requester_id,recipient_id,status) values ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','accepted');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$ begin if jsonb_array_length(public.list_live_shares())<>0 then raise exception 'Re-friend revived old grant';end if;end $$;
reset role;
insert into public.account_deletions(owner_id) values('91000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$ begin if jsonb_array_length(public.list_live_shares())<>0 or jsonb_array_length(public.live_share_friends())<>0 then raise exception 'Frozen account read';end if;end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.start_live_share(array['91000000-0000-4000-8000-000000000002'::uuid]);raise exception 'Frozen recipient accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from public.profiles where id='91000000-0000-4000-8000-000000000001';
do $$ begin if exists(select 1 from public.live_shares where owner_id='91000000-0000-4000-8000-000000000001') then raise exception 'Delete did not cascade';end if;end $$;
rollback;
