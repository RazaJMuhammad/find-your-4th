alter table public.games
  add column ends_at timestamptz;

update public.games
  set ends_at = starts_at
  where ends_at is null;

alter table public.games
  alter column ends_at set not null;

alter table public.games
  add constraint games_window_order check (ends_at > starts_at or ends_at = starts_at);

create index games_ends_idx on public.games (ends_at) where status = 'open';

-- Existing posts are a single time. New posts carry the end of the availability window.
drop function public.create_game(timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]);
drop function private.create_game(timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]);

create or replace function private.create_game(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_spots_needed integer,
  p_court_booked boolean,
  p_join_mode public.join_mode,
  p_skill public.skill_level,
  p_note text,
  p_club_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
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
    host_id, starts_at, ends_at, spots_needed, court_booked, join_mode, skill, note
  )
  values (
    v_uid, p_starts_at, p_ends_at, p_spots_needed, coalesce(p_court_booked, false),
    coalesce(p_join_mode, 'open'), coalesce(p_skill, 'any'), v_note
  )
  returning id into v_id;

  insert into public.game_clubs (game_id, club_id)
  select v_id, unnest(v_clubs);

  return jsonb_build_object('id', v_id);
end;
$fn$;

create or replace function public.create_game(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_spots_needed integer,
  p_court_booked boolean,
  p_join_mode public.join_mode,
  p_skill public.skill_level,
  p_note text,
  p_club_ids uuid[]
)
returns jsonb
language sql
security invoker
set search_path = ''
as $fn$
  select private.create_game(
    p_starts_at, p_ends_at, p_spots_needed, p_court_booked, p_join_mode, p_skill, p_note, p_club_ids
  );
$fn$;

revoke all on function private.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]) from public;
grant execute on function private.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]) to authenticated, service_role;

revoke all on function public.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]) from public, anon;
grant execute on function public.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]) to authenticated;

create or replace function private.game_label(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_game public.games;
  v_host_name text;
  v_place text;
  v_local timestamp;
  v_end timestamp;
  v_span text;
  v_today date;
  v_when text;
  v_joined integer;
  v_dow text;
  v_mon text;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    return null;
  end if;

  select coalesce(nullif(btrim(first_name), ''), 'The host')
    into v_host_name
  from public.profiles
  where id = v_game.host_id;

  select string_agg(c.name, ' / ' order by c.name)
    into v_place
  from public.game_clubs gc
  join public.clubs c on c.id = gc.club_id
  where gc.game_id = p_game_id;

  if v_place is null or btrim(v_place) = '' then
    v_place := 'the club';
  elsif char_length(v_place) > 90 then
    v_place := left(v_place, 87) || '...';
  end if;

  v_local := v_game.starts_at at time zone 'Africa/Johannesburg';
  v_end := v_game.ends_at at time zone 'Africa/Johannesburg';
  v_span := case
    when to_char(v_end, 'HH24:MI') = to_char(v_local, 'HH24:MI') then to_char(v_local, 'HH24:MI')
    else to_char(v_local, 'HH24:MI') || '–' || to_char(v_end, 'HH24:MI')
  end;
  v_today := (now() at time zone 'Africa/Johannesburg')::date;
  v_dow := (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from v_local)::integer + 1];
  v_mon := (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from v_local)::integer];
  if v_local::date = v_today then
    v_when := 'Today · ' || v_span;
  elsif v_local::date = v_today + 1 then
    v_when := 'Tomorrow · ' || v_span;
  else
    v_when := v_dow || ' ' || extract(day from v_local)::integer || ' ' || v_mon || ' · ' || v_span;
  end if;

  select count(*)::integer into v_joined
  from public.game_players
  where game_id = p_game_id and status = 'joined';

  return jsonb_build_object(
    'host_id', v_game.host_id,
    'host_name', coalesce(v_host_name, 'The host'),
    'when_label', v_when,
    'place_label', v_place,
    'spots_left', greatest(0, v_game.spots_needed - coalesce(v_joined, 0)),
    'court_booked', v_game.court_booked
  );
end;
$fn$;

create or replace function private.join_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_spots integer;
  v_mode public.join_mode;
  v_status public.game_status;
  v_host uuid;
  v_ends timestamptz;
  v_joined integer;
  v_existing_id uuid;
  v_existing_status public.player_status;
begin
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Finish your profile before joining';
  end if;

  select spots_needed, join_mode, status, host_id, ends_at
    into v_spots, v_mode, v_status, v_host, v_ends
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;
  if v_host = v_uid then
    raise exception 'You are hosting this game';
  end if;
  if v_status <> 'open' then
    raise exception 'This game is no longer open';
  end if;
  if v_ends <= now() then
    raise exception 'This window has closed';
  end if;
  if v_mode <> 'open' then
    raise exception 'This host wants to approve players. Send a request instead';
  end if;

  select id, status
    into v_existing_id, v_existing_status
  from public.game_players
  where game_id = p_game_id and user_id = v_uid
  for update;

  if v_existing_status = 'joined' then
    return jsonb_build_object('status', 'joined', 'player_id', v_existing_id);
  end if;

  select count(*)::integer into v_joined
  from public.game_players
  where game_id = p_game_id and status = 'joined';

  if v_joined >= v_spots then
    raise exception 'No spots left';
  end if;

  if v_existing_id is not null then
    update public.game_players
      set status = 'joined'
      where id = v_existing_id;
  else
    insert into public.game_players (game_id, user_id, status)
    values (p_game_id, v_uid, 'joined')
    returning id into v_existing_id;
  end if;

  perform private.notify_player_joined(p_game_id, v_uid);
  return jsonb_build_object('status', 'joined', 'player_id', v_existing_id);
end;
$fn$;

create or replace function private.request_spot(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_spots integer;
  v_mode public.join_mode;
  v_status public.game_status;
  v_host uuid;
  v_ends timestamptz;
  v_joined integer;
  v_existing_id uuid;
  v_existing_status public.player_status;
begin
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Finish your profile before requesting';
  end if;

  select spots_needed, join_mode, status, host_id, ends_at
    into v_spots, v_mode, v_status, v_host, v_ends
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;
  if v_host = v_uid then
    raise exception 'You are hosting this game';
  end if;
  if v_status <> 'open' then
    raise exception 'This game is no longer open';
  end if;
  if v_ends <= now() then
    raise exception 'This window has closed';
  end if;
  if v_mode <> 'request' then
    raise exception 'This game is open. Join it directly';
  end if;

  select id, status
    into v_existing_id, v_existing_status
  from public.game_players
  where game_id = p_game_id and user_id = v_uid
  for update;

  if v_existing_status in ('joined', 'pending') then
    return jsonb_build_object('status', v_existing_status, 'player_id', v_existing_id);
  end if;

  select count(*)::integer into v_joined
  from public.game_players
  where game_id = p_game_id and status = 'joined';

  if v_joined >= v_spots then
    raise exception 'No spots left';
  end if;

  if v_existing_id is not null then
    update public.game_players
      set status = 'pending'
      where id = v_existing_id;
  else
    insert into public.game_players (game_id, user_id, status)
    values (p_game_id, v_uid, 'pending')
    returning id into v_existing_id;
  end if;

  perform private.notify_spot_requested(p_game_id, v_uid);
  return jsonb_build_object('status', 'pending', 'player_id', v_existing_id);
end;
$fn$;
