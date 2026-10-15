begin;
do $$ begin
  if has_schema_privilege('anon','rivl_private','USAGE')
     or has_schema_privilege('authenticated','rivl_private','USAGE')
     or has_schema_privilege('service_role','rivl_private','USAGE') then
    raise exception 'Private worker scheduler schema is client accessible';
  end if;
  if has_function_privilege('anon','rivl_private.dispatch_workers()','EXECUTE')
     or has_function_privilege('authenticated','rivl_private.dispatch_workers()','EXECUTE')
     or has_function_privilege('service_role','rivl_private.dispatch_workers()','EXECUTE') then
    raise exception 'Private worker scheduler is client executable';
  end if;
  if has_table_privilege('anon','rivl_private.worker_dispatch','SELECT')
     or has_table_privilege('authenticated','rivl_private.worker_dispatch','SELECT') then
    raise exception 'Worker dispatch status is client readable';
  end if;
end $$;
rollback;
