\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('90000000-0000-4000-8000-000000000001','requester@example.test'),
 ('90000000-0000-4000-8000-000000000002','recipient@example.test'),
 ('90000000-0000-4000-8000-000000000003','victim@example.test');
insert into public.profiles(id,name,handle) values
 ('90000000-0000-4000-8000-000000000001','Requester','integrityrequester'),
 ('90000000-0000-4000-8000-000000000002','Recipient','integrityrecipient'),
 ('90000000-0000-4000-8000-000000000003','Victim','integrityvictim');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
insert into public.friendships(requester_id,recipient_id) values(auth.uid(),'90000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin
  update public.friendships set requester_id='90000000-0000-4000-8000-000000000003',status='accepted';
  raise exception 'Recipient forged an accepted relationship';
 exception when insufficient_privilege then null; end;
 if public.are_friends(auth.uid(),'90000000-0000-4000-8000-000000000003') then raise exception 'Victim friendship exists'; end if;
end $$;
update public.friendships set status='accepted' where recipient_id=auth.uid();
do $$ begin
 if not public.are_friends(auth.uid(),'90000000-0000-4000-8000-000000000001') then raise exception 'Legitimate acceptance failed'; end if;
end $$;
delete from public.friendships where recipient_id=auth.uid();
do $$ begin
 if public.are_friends(auth.uid(),'90000000-0000-4000-8000-000000000001') then raise exception 'Removal failed'; end if;
end $$;
rollback;
