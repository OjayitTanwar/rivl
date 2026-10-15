-- Acceptance must never change the athletes who consented to a friendship.
-- The existing recipient UPDATE policy authorizes status, but by itself also
-- permits rewriting requester_id to forge an accepted relationship.
create function public.guard_friendship_endpoints()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.recipient_id is distinct from old.recipient_id then
    raise exception 'Friendship participants are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_friendship_endpoints() from public, anon, authenticated;
create trigger friendship_endpoints_immutable before update on public.friendships
for each row execute function public.guard_friendship_endpoints();

-- Bound client queries to visible athletes/clubs/challenges; these indexes avoid
-- scanning an entire relationship table for the reverse/member lookups.
create index if not exists friendships_recipient_lookup on public.friendships(recipient_id, requester_id);
create index if not exists club_members_athlete_lookup on public.club_members(athlete_id, club_id);
create index if not exists challenge_members_athlete_lookup on public.challenge_members(athlete_id, challenge_id);
create index if not exists comments_activity_page on public.comments(activity_id, created_at desc, id desc);
