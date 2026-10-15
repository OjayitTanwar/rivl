-- Execute as postgres against a disposable Supabase database after migrations.
-- Everything rolls back, including the synthetic auth identities.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','rls-owner@example.test'),
 ('00000000-0000-4000-8000-000000000002','rls-stranger@example.test');
insert into public.profiles(id,name,handle) values
 ('00000000-0000-4000-8000-000000000001','Owner','ownertest'),
 ('00000000-0000-4000-8000-000000000002','Stranger','strangertest');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.save_activity(
 '{"id":"00000000-0000-4000-8000-000000000010","owner_id":"00000000-0000-4000-8000-000000000001","title":"Privacy test","sport":"run","started_at":"2026-10-07T08:00:00Z","ended_at":"2026-10-07T09:00:00Z","summary":{},"visibility":"public","rpe":5,"revision":1}',
 '[[0,0,1,0,40,-1,-1,0],[0,100,1000,0,40,-1,-1,0]]',
 '[{"lat":0,"lng":0,"segment":0},{"lat":0,"lng":0.003,"segment":0},{"lat":0,"lng":0.004,"segment":0},{"lat":0,"lng":0.009,"segment":0},{"lat":0,"lng":0.016,"segment":0},{"lat":0,"lng":0.017,"segment":0},{"lat":0,"lng":0.02,"segment":0}]');
insert into public.comments(activity_id,athlete_id,body) values('00000000-0000-4000-8000-000000000010',auth.uid(),'Keep this comment');
insert into public.reactions(activity_id,athlete_id) values('00000000-0000-4000-8000-000000000010',auth.uid());
select public.save_activity(
 '{"id":"00000000-0000-4000-8000-000000000010","owner_id":"00000000-0000-4000-8000-000000000001","title":"Edited on another phone","sport":"run","started_at":"2026-10-07T08:00:00Z","ended_at":"2026-10-07T09:00:00Z","summary":{},"visibility":"public","rpe":5,"revision":2}',null,null);
select public.set_privacy_zones('[{"id":"00000000-0000-4000-8000-000000000020","label":"Home","lat":0,"lng":0.012,"radius":200}]');
do $$ begin
 if (select jsonb_array_length(samples) from public.activity_tracks limit 1)<>2 then raise exception 'Metadata edit lost track'; end if;
 if (select count(*) from public.comments where body='Keep this comment')<>1 then raise exception 'Republishing deleted comments'; end if;
 if (select count(*) from public.reactions)<>1 then raise exception 'Republishing deleted reactions'; end if;
 if (select jsonb_array_length(route) from public.published_activities limit 1)<>2 then raise exception 'Sparse crossing was not split'; end if;
 if has_column_privilege('authenticated','public.activities','verified','INSERT') then raise exception 'Client can forge verification'; end if;
 if has_column_privilege('authenticated','public.friendships','requester_id','UPDATE') then raise exception 'Client can rewrite friendship identity'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.activities) then raise exception 'Stranger can read private activities'; end if;
 if exists(select 1 from public.activity_tracks) then raise exception 'Stranger can read raw GPS'; end if;
 if exists(select 1 from public.privacy_zones) then raise exception 'Stranger can read home location'; end if;
 if (select count(*) from public.published_activities)<>1 then raise exception 'Public redacted activity is missing'; end if;
 begin
   perform public.publish_activity('00000000-0000-4000-8000-000000000010');
   raise exception 'Unauthorized publication succeeded';
 exception when raise_exception then
   if sqlerrm <> 'Not authorized' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.save_activity(
 '{"id":"00000000-0000-4000-8000-000000000010","owner_id":"00000000-0000-4000-8000-000000000001","title":"Now private","sport":"run","started_at":"2026-10-07T08:00:00Z","ended_at":"2026-10-07T09:00:00Z","summary":{},"visibility":"private","rpe":5,"revision":3}',null,null);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.published_activities) then raise exception 'Private activity remains public'; end if;
 if exists(select 1 from public.comments) then raise exception 'Revoked activity comments remain visible'; end if;
end $$;
rollback;
