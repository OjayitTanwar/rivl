-- Coarse, anonymous public popularity. No private tracks or athlete identifiers.
create function public.route_popularity(p_lat double precision,p_lng double precision,p_sport public.activity_sport,p_since timestamptz default now()-interval '1 year')
returns table(lat double precision,lng double precision,visits bigint)
language sql stable security invoker set search_path=public,extensions as $$
 with recent as (
  select owner_id,route from published_activities p where visibility='public' and sport=p_sport
    and started_at>=greatest(p_since,now()-interval '5 years') and not public.content_hidden('activity',p.id)
    order by started_at desc limit 500
 ), coordinates as (
  select r.owner_id,
   case when jsonb_typeof(v->'lat')='number' and length(v->>'lat')<32 then (v->>'lat')::numeric end latitude,
   case when jsonb_typeof(v->'lng')='number' and length(v->>'lng')<32 then (v->>'lng')::numeric end longitude
  from recent r cross join lateral jsonb_array_elements(case when jsonb_typeof(r.route)='array' then r.route else '[]'::jsonb end) with ordinality as a(v,n)
  where n%5=1 and n<=20000
 ), points as (
  select owner_id,floor(case when latitude between -85 and 85 then latitude*200 end)::integer y,
    floor(case when longitude between -180 and 180 then longitude*200 end)::integer x from coordinates
  where latitude between -85 and 85 and longitude between -180 and 180
   and abs(latitude-p_lat)<.06 and abs(longitude-p_lng)<.06
   and p_lat between -85 and 85 and p_lng between -180 and 180
 ) select (y+.5)/200.0,(x+.5)/200.0,count(distinct owner_id) from points group by x,y
  having count(distinct owner_id)>=3 order by count(distinct owner_id) desc limit 1000
$$;
revoke all on function public.route_popularity(double precision,double precision,public.activity_sport,timestamptz) from public,anon;
grant execute on function public.route_popularity(double precision,double precision,public.activity_sport,timestamptz) to authenticated;
