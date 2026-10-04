-- Details collected after signup. Phone and the screenshot path stay off the public profile
-- and are returned only by app.my_account for the signed-in player.

alter table public.profile_private
  add column if not exists first_name text,
  add column if not exists surname text,
  add column if not exists phone text,
  add column if not exists playtomic_screenshot_path text,
  add column if not exists preferred_genders text[] not null default '{}',
  add column if not exists preferred_levels smallint[] not null default '{}',
  add column if not exists onboarded_at timestamptz;

alter table public.profile_private
  drop constraint if exists profile_private_preferred_genders;
alter table public.profile_private
  add constraint profile_private_preferred_genders check (
    preferred_genders <@ array['men', 'women', 'mixed']::text[]
    and array_position(preferred_genders, null::text) is null
  );

alter table public.profile_private
  drop constraint if exists profile_private_preferred_levels;
alter table public.profile_private
  add constraint profile_private_preferred_levels check (
    preferred_levels <@ array[0, 1, 2, 3, 4, 5, 6, 7]::smallint[]
    and array_position(preferred_levels, null::smallint) is null
  );

create or replace function app.limit_home_clubs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.profile_clubs where profile_id = new.profile_id) >= 15 then
    raise exception 'Pick at most 15 clubs';
  end if;
  return new;
end;
$$;

create or replace function app.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'level', p.level,
      'level_score', p.level_score,
      'home_club_id', p.home_club_id,
      'avatar_url', p.avatar_url,
      'created_at', p.created_at,
      'gender', priv.gender,
      'playtomic_url', priv.playtomic_url,
      'search_radius_km', priv.search_radius_km,
      'age_confirmed', priv.age_confirmed,
      'terms_accepted_at', priv.terms_accepted_at,
      'whatsapp', priv.whatsapp,
      'whatsapp_share', priv.whatsapp_share,
      'quiet_start', priv.quiet_start,
      'quiet_end', priv.quiet_end,
      'notif_prefs', priv.notif_prefs,
      'fantasy_opt_in', priv.fantasy_opt_in,
      'is_admin', priv.is_admin,
      'first_name', priv.first_name,
      'surname', priv.surname,
      'phone', priv.phone,
      'playtomic_screenshot_path', priv.playtomic_screenshot_path,
      'preferred_genders', to_jsonb(priv.preferred_genders),
      'preferred_levels', to_jsonb(priv.preferred_levels),
      'onboarded_at', priv.onboarded_at,
      'clubs', coalesce((
        select jsonb_agg(pc.club_id) from public.profile_clubs pc where pc.profile_id = p.id
      ), '[]'::jsonb)
    )
    from public.profiles p
    join public.profile_private priv on priv.id = p.id
    where p.id = v_uid
  );
end;
$$;

create or replace function app.save_account(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_first text := btrim(p ->> 'first_name');
  v_surname text := btrim(p ->> 'surname');
  v_phone text := regexp_replace(btrim(coalesce(p ->> 'phone', '')), '[\s()-]', '', 'g');
  v_shot text := nullif(btrim(coalesce(p ->> 'playtomic_screenshot_path', '')), '');
  v_genders text[];
  v_levels smallint[];
  v_score integer;
  v_n integer;
  v_clubs text[];
  v_club text;
begin
  perform app.assert_real_email();
  perform app.assert_clean(v_first);
  perform app.assert_clean(v_surname);

  if v_first is null or char_length(v_first) < 1 or char_length(v_first) > 30 or v_first ~ '[[:cntrl:]]' then
    raise exception 'Use a first name up to 30 characters';
  end if;
  if v_surname is null or char_length(v_surname) < 1 or char_length(v_surname) > 30 or v_surname ~ '[[:cntrl:]]' then
    raise exception 'Use a surname up to 30 characters';
  end if;
  if char_length(v_first || ' ' || v_surname) > 40 then
    raise exception 'Name and surname together can be at most 40 characters';
  end if;
  if v_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception 'Enter a phone number';
  end if;
  if coalesce((p ->> 'age_confirmed')::boolean, false) is not true then
    raise exception 'Confirm you are 18 or older';
  end if;
  if coalesce((p ->> 'accept_terms')::boolean, false) is not true
     and not exists (select 1 from public.profile_private where id = v_uid and terms_accepted_at is not null) then
    raise exception 'Accept the terms to continue';
  end if;
  if v_shot is not null and v_shot !~ ('^' || v_uid::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$') then
    raise exception 'Screenshot path is not valid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p -> 'preferred_genders', '[]'::jsonb)) as t(value)
    where value not in ('men', 'women', 'mixed')
  ) then
    raise exception 'Pick men, women, or mixed games';
  end if;
  select coalesce(array_agg(value order by value), '{}'::text[])
  into v_genders
  from (
    select distinct value
    from jsonb_array_elements_text(coalesce(p -> 'preferred_genders', '[]'::jsonb)) as t(value)
  ) as genders;
  if coalesce(array_length(v_genders, 1), 0) < 1 then
    raise exception 'Pick at least one game type';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(p -> 'preferred_levels', '[]'::jsonb)) as t(value)
    where value !~ '^[0-7]$'
  ) then
    raise exception 'Pick a level from 0 to 7';
  end if;
  select coalesce(array_agg(score order by score), '{}'::smallint[])
  into v_levels
  from (
    select distinct value::smallint as score
    from jsonb_array_elements_text(coalesce(p -> 'preferred_levels', '[]'::jsonb)) as t(value)
  ) as levels;
  v_n := coalesce(array_length(v_levels, 1), 0);
  if v_n < 1 then
    raise exception 'Pick at least one level';
  end if;
  if v_n % 2 = 1 then
    v_score := v_levels[(v_n + 1) / 2];
  else
    v_score := round((v_levels[v_n / 2] + v_levels[v_n / 2 + 1]) / 2.0)::integer;
  end if;

  select coalesce(array_agg(club_id order by ord), '{}'::text[])
  into v_clubs
  from (
    select value as club_id, min(ord) as ord
    from jsonb_array_elements_text(coalesce(p -> 'club_ids', '[]'::jsonb)) with ordinality as t(value, ord)
    group by value
  ) as clubs;
  if coalesce(array_length(v_clubs, 1), 0) < 1 then
    raise exception 'Pick at least one club';
  end if;
  if coalesce(array_length(v_clubs, 1), 0) > 15 then
    raise exception 'Pick at most 15 clubs';
  end if;
  if exists (
    select 1
    from unnest(v_clubs) as club_id
    where not exists (select 1 from public.clubs where id = club_id)
  ) then
    raise exception 'Pick a club from the list';
  end if;

  update public.profiles set
    display_name = v_first || ' ' || v_surname,
    level_score = v_score,
    level = app.score_to_level(v_score),
    home_club_id = null
  where id = v_uid;

  update public.profile_private set
    first_name = v_first,
    surname = v_surname,
    phone = v_phone,
    playtomic_screenshot_path = v_shot,
    preferred_genders = v_genders,
    preferred_levels = v_levels,
    onboarded_at = coalesce(onboarded_at, now()),
    age_confirmed = true,
    terms_accepted_at = coalesce(terms_accepted_at, now())
  where id = v_uid;

  delete from public.profile_clubs where profile_id = v_uid;
  foreach v_club in array v_clubs loop
    insert into public.profile_clubs (profile_id, club_id) values (v_uid, v_club);
  end loop;
  update public.profiles set home_club_id = v_clubs[1] where id = v_uid;
end;
$$;

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'playtomic-screenshots',
    'playtomic-screenshots',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists playtomic_select_own on storage.objects';
  execute 'create policy playtomic_select_own on storage.objects for select to authenticated using (bucket_id = ''playtomic-screenshots'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
  execute 'drop policy if exists playtomic_insert_own on storage.objects';
  execute 'create policy playtomic_insert_own on storage.objects for insert to authenticated with check (bucket_id = ''playtomic-screenshots'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
  execute 'drop policy if exists playtomic_update_own on storage.objects';
  execute 'create policy playtomic_update_own on storage.objects for update to authenticated using (bucket_id = ''playtomic-screenshots'' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = ''playtomic-screenshots'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
  execute 'drop policy if exists playtomic_delete_own on storage.objects';
  execute 'create policy playtomic_delete_own on storage.objects for delete to authenticated using (bucket_id = ''playtomic-screenshots'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
exception
  when undefined_table or insufficient_privilege or undefined_column then null;
end $$;
