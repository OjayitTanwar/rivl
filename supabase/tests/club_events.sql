\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('93000000-0000-4000-8000-000000000001','clubowner@example.test'),('93000000-0000-4000-8000-000000000002','clubmod@example.test'),('93000000-0000-4000-8000-000000000003','clubmember@example.test');
insert into public.profiles(id,name,handle) values ('93000000-0000-4000-8000-000000000001','Owner','eventowner'),('93000000-0000-4000-8000-000000000002','Organizer','eventmod'),('93000000-0000-4000-8000-000000000003','Member','eventmember');
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select set_config('test.club',public.create_club('Weekend riders','Real rides together')::text,true);
do $$ begin
 delete from public.club_members where club_id=current_setting('test.club')::uuid and athlete_id=auth.uid();
 if not exists(select 1 from public.club_members where club_id=current_setting('test.club')::uuid and athlete_id=auth.uid())then raise exception 'Owner bypassed transfer by direct DELETE';end if;
 begin update public.club_members set club_id=gen_random_uuid() where athlete_id=auth.uid();raise exception 'Membership update allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
select public.set_club_membership(current_setting('test.club')::uuid,true);
do $$ begin
 begin perform public.create_club_event(current_setting('test.club')::uuid,'Ride','Park gate',clock_timestamp()+interval '1 day',60,'Asia/Kolkata',1);raise exception 'Member created event';exception when insufficient_privilege then null;end;
 begin perform public.set_club_role(current_setting('test.club')::uuid,auth.uid(),'moderator');raise exception 'Member self promoted';exception when insufficient_privilege then null;end;
 begin insert into public.club_roles(club_id,athlete_id,role)values(current_setting('test.club')::uuid,auth.uid(),'moderator');raise exception 'Direct role forge';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select public.set_club_role(current_setting('test.club')::uuid,'93000000-0000-4000-8000-000000000002','moderator');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
select set_config('test.event',public.create_club_event(current_setting('test.club')::uuid,'Sunday ride','Park gate',clock_timestamp()+interval '1 day',60,'Asia/Kolkata',1)::text,true);
select public.club_event_rsvp(current_setting('test.event')::uuid,true);
select public.club_event_rsvp(current_setting('test.event')::uuid,true);
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000003',true);
do $$ begin
 begin perform public.club_event_rsvp(current_setting('test.event')::uuid,true);raise exception 'Visitor RSVP allowed';exception when insufficient_privilege then null;end;
end $$;
select public.set_club_membership(current_setting('test.club')::uuid,true);
do $$ declare rejected boolean:=false;begin
 begin perform public.club_event_rsvp(current_setting('test.event')::uuid,true);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Capacity overbooked';end if;
end $$;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
-- Legacy direct leave must clean the moderator grant and upcoming RSVP too.
delete from public.club_members where club_id=current_setting('test.club')::uuid and athlete_id=auth.uid();
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000003',true);
select public.club_event_rsvp(current_setting('test.event')::uuid,true);
do $$ begin if (public.club_detail(current_setting('test.club')::uuid)->'events'->0->>'attending')::integer<>1 then raise exception 'Leave did not release capacity';end if;end $$;
insert into public.athlete_blocks(blocker_id,blocked_id)values(auth.uid(),'93000000-0000-4000-8000-000000000002');
do $$ begin if jsonb_array_length(public.club_detail(current_setting('test.club')::uuid)->'events')<>0 then raise exception 'Blocked organizer visible';end if;end $$;
delete from public.athlete_blocks where blocker_id=auth.uid();
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select public.cancel_club_event(current_setting('test.event')::uuid);
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000003',true);
do $$ declare rejected boolean:=false;begin begin perform public.club_event_rsvp(current_setting('test.event')::uuid,true);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Cancelled RSVP allowed';end if;end $$;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
select public.set_club_role(current_setting('test.club')::uuid,'93000000-0000-4000-8000-000000000003','owner');
select public.set_club_membership(current_setting('test.club')::uuid,false);
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000003',true);
do $$ begin if public.club_detail(current_setting('test.club')::uuid)->>'role'<>'owner'then raise exception 'Ownership transfer failed';end if;end $$;
reset role;
-- Force an elapsed fixture, then assert server RSVP gate independently of UI.
update public.club_events set cancelled_at=null,starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=current_setting('test.event')::uuid;
set local role authenticated;
do $$ declare rejected boolean:=false;begin begin perform public.club_event_rsvp(current_setting('test.event')::uuid,true);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Past RSVP allowed';end if;end $$;
reset role;
insert into public.account_deletions(owner_id)values('93000000-0000-4000-8000-000000000003');
set local role authenticated;
do $$ begin begin perform public.club_detail(current_setting('test.club')::uuid);raise exception 'Frozen owner read';exception when insufficient_privilege then null;end;end $$;
reset role;
delete from public.profiles where id='93000000-0000-4000-8000-000000000003';
do $$ begin if exists(select 1 from public.clubs where id=current_setting('test.club')::uuid)or exists(select 1 from public.club_events where id=current_setting('test.event')::uuid)then raise exception 'Account deletion cascade failed';end if;end $$;
rollback;
