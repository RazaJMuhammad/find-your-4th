-- Player level is a Playtomic rating. Home city is optional and still
-- updated when someone chooses a city in the feed.

alter table public.profiles
  add column playtomic_rating numeric(3, 2);

alter table public.profiles
  add constraint profiles_playtomic_rating_range
  check (playtomic_rating is null or playtomic_rating between 0 and 7);

alter table public.profiles
  alter column city drop not null;

grant select (playtomic_rating) on public.profiles to anon, authenticated;

drop function public.save_profile(text, text, text, text, public.skill_level);
drop function private.save_profile(text, text, text, text, public.skill_level);

create or replace function private.save_profile(
  p_first_name text,
  p_surname text,
  p_phone text,
  p_playtomic_rating numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_first text := btrim(coalesce(p_first_name, ''));
  v_surname text := btrim(coalesce(p_surname, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_rating numeric := round(p_playtomic_rating, 2);
begin
  if char_length(v_first) not between 1 and 40
    or char_length(v_surname) not between 1 and 40
    or char_length(regexp_replace(v_phone, '\D', '', 'g')) < 9
  then
    raise exception 'Check your name and WhatsApp number';
  end if;

  if v_rating is null or v_rating < 0 or v_rating > 7 then
    raise exception 'Enter a Playtomic level from 0 to 7';
  end if;

  insert into public.profiles (id, first_name, surname, phone, city, skill, playtomic_rating)
  values (v_uid, v_first, v_surname, v_phone, null, 'any', v_rating)
  on conflict (id) do update
    set first_name = excluded.first_name,
        surname = excluded.surname,
        phone = excluded.phone,
        playtomic_rating = excluded.playtomic_rating;

  return private.my_profile();
end;
$$;

create or replace function private.my_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_row from public.profiles where id = v_uid;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'first_name', v_row.first_name,
    'surname', v_row.surname,
    'phone', v_row.phone,
    'city', v_row.city,
    'skill', v_row.skill,
    'playtomic_rating', v_row.playtomic_rating,
    'lat', v_row.lat,
    'lng', v_row.lng
  );
end;
$$;

create or replace function public.save_profile(p_first_name text, p_surname text, p_phone text, p_playtomic_rating numeric)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.save_profile(p_first_name, p_surname, p_phone, p_playtomic_rating); $$;

revoke all on function private.save_profile(text, text, text, numeric) from public;
revoke all on function private.my_profile() from public;
revoke all on function public.save_profile(text, text, text, numeric) from public, anon;

grant execute on function private.save_profile(text, text, text, numeric) to authenticated, service_role;
grant execute on function private.my_profile() to authenticated, service_role;
grant execute on function public.save_profile(text, text, text, numeric) to authenticated;
