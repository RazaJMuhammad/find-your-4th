-- Nearby game alerts: when a game is posted, ping players who have alerts on
-- and whose last shared location is within their chosen distance of a club
-- the game is at. Delivery reuses the push outbox.

alter table public.profiles
  add column nearby_alerts boolean not null default true,
  add column nearby_radius_km integer not null default 25
    check (nearby_radius_km between 1 and 200);

create index push_outbox_user_tag_idx
  on private.push_outbox (user_id, created_at)
  where tag like 'nearby:%';

create or replace function private.distance_km(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $fn$
  select 2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )));
$fn$;

create or replace function private.notify_nearby_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label jsonb := private.game_label(p_game_id);
  v_left integer;
  v_need text;
  v_far text;
  r record;
begin
  if v_label is null then
    return;
  end if;

  v_left := coalesce((v_label->>'spots_left')::integer, 1);
  v_need := (v_label->>'host_name') || ' needs ' || case
    when v_left = 1 then '1 more player.'
    else v_left::text || ' more players.'
  end;

  for r in
    select p.id as user_id, near.name, near.distance
    from public.profiles p
    cross join lateral (
      select c.name,
             private.distance_km(p.lat, p.lng, c.lat, c.lng) as distance
      from public.game_clubs gc
      join public.clubs c on c.id = gc.club_id
      where gc.game_id = p_game_id
        and c.lat is not null
        and c.lng is not null
      order by distance
      limit 1
    ) near
    where p.id <> (v_label->>'host_id')::uuid
      and p.nearby_alerts
      and p.lat is not null
      and p.lng is not null
      and near.distance <= p.nearby_radius_km
      and exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
      and (
        select count(*)
        from private.push_outbox o
        where o.user_id = p.id
          and o.tag like 'nearby:%'
          and o.created_at > now() - interval '24 hours'
      ) < 5
  loop
    v_far := case
      when r.distance < 1 then 'under 1 km away'
      else round(r.distance)::integer::text || ' km away'
    end;

    perform private.enqueue_push(
      r.user_id,
      'New game near you',
      (v_label->>'when_label') || ' at ' || r.name || ', ' || v_far || '. ' || v_need,
      '/games/' || p_game_id::text,
      'nearby:' || p_game_id::text
    );
  end loop;
end;
$fn$;

create or replace function private.create_game(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_spots_needed integer,
  p_court_booked boolean,
  p_join_mode public.join_mode,
  p_skill public.skill_level,
  p_note text,
  p_club_ids uuid[],
  p_playtomic_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_url text := nullif(btrim(coalesce(p_playtomic_url, '')), '');
  v_clubs uuid[];
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Finish your profile before posting';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Until has to be later than from';
  end if;
  if p_ends_at <= now() then
    raise exception 'Pick a time in the future';
  end if;
  if p_spots_needed is null or p_spots_needed not between 1 and 3 then
    raise exception 'Ask for 1, 2, or 3 players';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'Keep the note under 280 characters';
  end if;

  if not coalesce(p_court_booked, false) then
    v_url := null;
  elsif v_url is not null and (
    char_length(v_url) > 300
    or v_url !~* '^https?://([a-z0-9-]+\.)*playtomic\.(io|com)([/?#]|$)'
  ) then
    raise exception 'Use a link from Playtomic';
  end if;

  select coalesce(array_agg(distinct u.club_id), '{}'::uuid[])
    into v_clubs
  from unnest(coalesce(p_club_ids, '{}'::uuid[])) as u(club_id);

  if coalesce(p_court_booked, false) then
    if cardinality(v_clubs) <> 1 then
      raise exception 'A booked court is at one club';
    end if;
  elsif cardinality(v_clubs) < 1 or cardinality(v_clubs) > 8 then
    raise exception 'Pick between 1 and 8 clubs';
  end if;

  if (select count(*) from public.clubs where id = any (v_clubs)) <> cardinality(v_clubs) then
    raise exception 'One of those clubs is not in the directory';
  end if;

  insert into public.games (
    host_id, starts_at, ends_at, spots_needed, court_booked, join_mode, skill, note, playtomic_url
  )
  values (
    v_uid, p_starts_at, p_ends_at, p_spots_needed, coalesce(p_court_booked, false),
    coalesce(p_join_mode, 'open'), coalesce(p_skill, 'any'), v_note, v_url
  )
  returning id into v_id;

  insert into public.game_clubs (game_id, club_id)
  select v_id, unnest(v_clubs);

  -- A failed alert must never stop the game from being posted.
  begin
    perform private.notify_nearby_game(v_id);
  exception
    when others then
      null;
  end;

  return jsonb_build_object('id', v_id);
end;
$fn$;

create or replace function private.my_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
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
    'lng', v_row.lng,
    'nearby_alerts', v_row.nearby_alerts,
    'nearby_radius_km', v_row.nearby_radius_km
  );
end;
$fn$;

create or replace function private.set_nearby_alerts(p_enabled boolean, p_radius_km integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
begin
  if p_enabled is null or p_radius_km is null or p_radius_km not between 1 and 200 then
    raise exception 'Pick a distance from 1 to 200 km';
  end if;

  update public.profiles
    set nearby_alerts = p_enabled,
        nearby_radius_km = p_radius_km
    where id = v_uid;

  if not found then
    raise exception 'Finish your profile before changing alerts';
  end if;

  return private.my_profile();
end;
$fn$;

create or replace function public.set_nearby_alerts(p_enabled boolean, p_radius_km integer)
returns jsonb
language sql
security invoker
set search_path = ''
as $fn$
  select private.set_nearby_alerts(p_enabled, p_radius_km);
$fn$;

revoke all on function private.distance_km(double precision, double precision, double precision, double precision) from public, anon, authenticated, service_role;
revoke all on function private.notify_nearby_game(uuid) from public, anon, authenticated, service_role;
revoke all on function private.set_nearby_alerts(boolean, integer) from public, anon, authenticated, service_role;
revoke all on function public.set_nearby_alerts(boolean, integer) from public, anon, authenticated, service_role;

grant execute on function private.set_nearby_alerts(boolean, integer) to authenticated;
grant execute on function public.set_nearby_alerts(boolean, integer) to authenticated;
