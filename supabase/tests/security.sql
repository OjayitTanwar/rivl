-- Run with psql after supabase db reset. Fails if any private table lacks RLS.
do $$ declare t text;begin foreach t in array array['activities','activity_tracks','privacy_zones','health_samples','athlete_settings','device_tokens','coach_reports'] loop if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS disabled on %',t;end if;end loop;end $$;
-- Published data has no raw track column.
do $$ begin if exists(select 1 from information_schema.columns where table_schema='public' and table_name='published_activities' and column_name in ('samples','points','display_route')) then raise exception 'Raw route leaked in public projection';end if;end $$;
