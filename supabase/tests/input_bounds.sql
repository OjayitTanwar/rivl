begin;
do $$
begin
 if public.valid_athlete_text(U&'runner\202Eevil',100) then raise exception 'Bidi override accepted'; end if;
 if public.valid_athlete_text('   ',100) then raise exception 'Blank required text accepted'; end if;
 if public.valid_athlete_text(repeat('x',201),200) then raise exception 'Oversized text accepted'; end if;
 if not public.valid_athlete_text('José <fast>',100) then raise exception 'Plain athlete text rejected'; end if;
 if not public.valid_athlete_text('',100,false) then raise exception 'Empty optional text rejected'; end if;
end $$;
rollback;
