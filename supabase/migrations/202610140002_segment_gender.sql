begin;
-- Restrict only the new optional fields. Existing owner settings stay compatible.
alter table public.athlete_settings add constraint athlete_settings_gender_valid check (
  (not (settings ? 'leaderboardGender') or settings->'leaderboardGender'='null'::jsonb
    or settings->>'leaderboardGender' in ('women','men','nonbinary'))
  and (not (settings ? 'shareLeaderboardGender') or jsonb_typeof(settings->'shareLeaderboardGender')='boolean')
  and (settings->>'shareLeaderboardGender' is distinct from 'true'
    or coalesce(settings->>'leaderboardGender' in ('women','men','nonbinary'),false))
);

-- Preserve the eight-argument API. This overload intentionally has no defaults
-- so PostgREST can dispatch legacy requests without ambiguity. Current explicit
-- gender category and consent are read from owner-private settings before LIMIT.
-- A bounded history view; dates apply BEFORE best-effort selection. Public
-- eligibility is rechecked on every read, including privacy/deletion changes.
create function public.segment_standings(
  p_segment uuid, p_scope text, p_since timestamptz,
  p_until timestamptz, p_age integer,
  p_weight integer, p_club uuid, p_frequent boolean, p_gender text
) returns table(athlete_id uuid,athlete text,seconds double precision,date timestamptz,effort_count bigint)
language plpgsql stable security definer set search_path=public,extensions as $$
begin
  if auth.uid() is null or not public.account_active()
    or p_scope is null or p_frequent is null or p_scope not in ('overall','friends','age','weight','club','gender')
    or (p_scope='gender' and (p_gender is null or p_gender not in ('women','men','nonbinary')))
    or (p_since is not null and p_until is not null and p_since>=p_until)
    or (p_scope='age' and (p_age is null or p_age not between 0 and 120 or p_age%10<>0))
    or (p_scope='weight' and (p_weight is null or p_weight not between 25 and 300 or p_weight%5<>0))
  then raise exception 'Invalid segment request'; end if;
  if p_scope='club' and not exists(select 1 from club_members m where m.club_id=p_club and m.athlete_id=auth.uid())
    then raise exception 'Join the club first'; end if;
  return query with eligible as (
    select e.*,p.name,
      exists(select 1 from friendships f where f.status='accepted' and
        ((f.requester_id=auth.uid() and f.recipient_id=e.athlete_id) or
         (f.recipient_id=auth.uid() and f.requester_id=e.athlete_id))) as is_friend
    from segment_efforts e join profiles p on p.id=e.athlete_id
      join activities a on a.id=e.activity_id join segments s on s.id=e.segment_id
      join athlete_settings prefs on prefs.owner_id=e.athlete_id
    where e.segment_id=p_segment and e.verified and e.algorithm_version='gps-corridor-v1'
      and a.revision=e.source_revision and s.revision=e.segment_revision
      and a.visibility='public' and prefs.settings->>'segmentParticipation'='true'
      and not public.is_blocked(e.athlete_id) and not public.content_hidden('activity',a.id)
      and not exists(select 1 from account_deletions d where d.owner_id=e.athlete_id)
      and (not p_frequent or (e.created_at>=now()-interval '90 days' and e.created_at<=now()))
      and (p_frequent or p_since is null or e.created_at>=p_since)
      and (p_frequent or p_until is null or e.created_at<p_until)
  ), filtered as (
    select * from eligible e where p_scope='overall'
      or p_scope='friends' and (e.is_friend or e.athlete_id=auth.uid())
      or p_scope='age' and e.age_group=p_age and
        exists(select 1 from athlete_settings prefs where prefs.owner_id=e.athlete_id and prefs.settings->>'shareLeaderboardAge'='true')
      or p_scope='weight' and e.weight_group=p_weight and
        exists(select 1 from athlete_settings prefs where prefs.owner_id=e.athlete_id and prefs.settings->>'shareLeaderboardWeight'='true')
      or p_scope='gender' and exists(select 1 from athlete_settings prefs where prefs.owner_id=e.athlete_id
        and prefs.settings->>'shareLeaderboardGender'='true' and prefs.settings->>'leaderboardGender'=p_gender)
      or p_scope='club' and exists(select 1 from club_members m where m.club_id=p_club and m.athlete_id=e.athlete_id)
  ), counts as (
    select e.athlete_id,count(distinct e.activity_id) as total from filtered e group by e.athlete_id
  ), best as (
    select distinct on (e.athlete_id) e.* from filtered e
      order by e.athlete_id,e.seconds,e.created_at,e.id
  ) select b.athlete_id,b.name,b.seconds,b.created_at,n.total
    from best b join counts n on n.athlete_id=b.athlete_id
    order by case when p_frequent then n.total else null end desc,
      b.seconds,b.created_at,b.athlete_id limit 250;
end $$;
revoke all on function public.segment_standings(uuid,text,timestamptz,timestamptz,integer,integer,uuid,boolean,text) from public,anon;
grant execute on function public.segment_standings(uuid,text,timestamptz,timestamptz,integer,integer,uuid,boolean,text) to authenticated;
commit;
