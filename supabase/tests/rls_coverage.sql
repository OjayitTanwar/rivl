-- Enforces the project rule: every table in the public schema must have row
-- level security enabled, and a blanket `using (true)` policy may exist only on
-- the reviewed public reference tables. Run with psql after `supabase db reset`.
--
-- Deny-by-default worker tables (no policy, no grant to anon/authenticated) are
-- intentionally allowed: they are reachable only through service_role inside
-- edge functions. The invariants below are what stop that posture from silently
-- regressing into a readable table.

-- 1. Every public table has RLS enabled.
do $$ declare t text; begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    order by 1
  loop
    raise exception 'RLS is not enabled on public.%', t;
  end loop;
end $$;

-- 2. A permissive read policy may only exist on reviewed public reference data.
do $$ declare r record; begin
  for r in
    select c.relname, p.polname from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pg_get_expr(p.polqual, p.polrelid) = 'true'
      and c.relname not in ('profiles','clubs','club_members','segments','challenges')
  loop
    raise exception 'public.% policy % exposes a blanket using(true); add it to the reviewed allowlist only if it is genuinely public reference data',
      r.relname, r.polname;
  end loop;
end $$;

-- 3. No table that is reachable by clients may skip policies entirely while
--    still being granted to anon/authenticated.
do $$ declare t text; begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and exists (
        select 1 from information_schema.role_table_grants g
        where g.table_schema = 'public' and g.table_name = c.relname
          and g.grantee in ('anon','authenticated')
      )
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    order by 1
  loop
    raise exception 'public.% is granted to clients but has no policy', t;
  end loop;
end $$;
