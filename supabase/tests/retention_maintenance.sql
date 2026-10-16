begin;
do $$declare n integer;
begin
 if has_function_privilege('authenticated','rivl_private.maintain_retention()','EXECUTE')or has_function_privilege('service_role','rivl_private.maintain_retention()','EXECUTE')then raise exception 'Maintenance privilege leaked';end if;
 update rivl_private.maintenance_state set last_run=null;
 n:=rivl_private.maintain_retention();
 if n<0 or not exists(select 1 from rivl_private.maintenance_state where last_run is not null)then raise exception 'Maintenance failed';end if;
 if rivl_private.maintain_retention()<>0 then raise exception 'Daily budget ignored';end if;
end $$;
rollback;
