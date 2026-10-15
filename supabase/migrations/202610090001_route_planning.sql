begin;
create function public.valid_route_waypoints(value jsonb)
returns boolean language plpgsql immutable strict set search_path=pg_catalog as $$
declare point jsonb;
begin
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 24 then return false; end if;
  for point in select jsonb_array_elements(value) loop
    if jsonb_typeof(point) <> 'object'
      or jsonb_typeof(point->'lat') is distinct from 'number'
      or jsonb_typeof(point->'lng') is distinct from 'number' then return false; end if;
    if (point->>'lat')::numeric not between -85 and 85
      or (point->>'lng')::numeric not between -180 and 180 then return false; end if;
  end loop;
  return true;
end;
$$;
alter table public.routes
  add column waypoints jsonb not null default '[]'::jsonb
    check (public.valid_route_waypoints(waypoints)),
  add column routing text not null default 'recorded'
    check (routing in ('manual', 'paths', 'recorded'));
-- Existing owner-only row-level policies apply to the new route metadata.
commit;
