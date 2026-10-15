begin;
create function public.valid_athlete_text(value text, maximum integer, required boolean default true)
returns boolean language sql immutable strict set search_path=pg_catalog as $$
 select char_length(value)<=maximum
   and (not required or char_length(btrim(value))>0)
   and value !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F\202A-\202E\2066-\2069]'
$$;
alter table public.profiles
 add constraint profile_name_safe check(public.valid_athlete_text(name,100)),
 add constraint profile_handle_safe check(handle ~ '^[a-zA-Z0-9._]{1,30}$'),
 add constraint profile_bio_safe check(public.valid_athlete_text(bio,1000,false));
alter table public.activities
 add constraint activity_title_safe check(public.valid_athlete_text(title,200)),
 add constraint activity_note_safe check(public.valid_athlete_text(note,10000,false));
alter table public.comments add constraint comment_body_safe check(public.valid_athlete_text(body,2000));
alter table public.routes
 add constraint route_name_safe check(public.valid_athlete_text(name,200)),
 add constraint route_surface_safe check(public.valid_athlete_text(surface,200,false)),
 add constraint route_distance_bound check(distance between 0 and 10000000),
 add constraint route_ascent_bound check(ascent between 0 and 100000),
 add constraint route_points_bound check(jsonb_typeof(points)='array' and jsonb_array_length(points)<=300000);
alter table public.privacy_zones add constraint privacy_label_safe check(public.valid_athlete_text(label,100));
commit;
