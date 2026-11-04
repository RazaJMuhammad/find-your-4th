-- A booked court is one place. An open search can still list several clubs.
create or replace function private.create_game(
  p_starts_at timestamptz,
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
  if p_starts_at is null or p_starts_at <= now() then
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
    host_id, starts_at, spots_needed, court_booked, join_mode, skill, note
  )
  values (
    v_uid, p_starts_at, p_spots_needed, coalesce(p_court_booked, false),
    coalesce(p_join_mode, 'open'), coalesce(p_skill, 'any'), v_note
  )
  returning id into v_id;

  insert into public.game_clubs (game_id, club_id)
  select v_id, unnest(v_clubs);

  return jsonb_build_object('id', v_id);
end;
$fn$;

create or replace function private.notify_player_left(
  p_game_id uuid,
  p_user_id uuid,
  p_was_pending boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label jsonb := private.game_label(p_game_id);
  v_name text;
begin
  if v_label is null then
    return;
  end if;

  v_name := coalesce(private.player_first_name(p_user_id), 'A player');
  perform private.enqueue_push(
    (v_label->>'host_id')::uuid,
    case
      when p_was_pending then v_name || ' withdrew their request'
      else v_name || ' left the game'
    end,
    (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '.',
    '/games/' || p_game_id::text,
    'left:' || p_game_id::text || ':' || p_user_id::text
  );
end;
$fn$;

create or replace function private.leave_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_host uuid;
  v_status public.game_status;
  v_player_id uuid;
  v_player_status public.player_status;
begin
  select host_id, status
    into v_host, v_status
  from public.games
  where id = p_game_id
  for update;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if v_host = v_uid then
    raise exception 'You are hosting this game';
  end if;
  if v_status <> 'open' then
    raise exception 'This game is no longer open';
  end if;

  select id, status
    into v_player_id, v_player_status
  from public.game_players
  where game_id = p_game_id and user_id = v_uid
  for update;

  if v_player_id is null or v_player_status not in ('joined', 'pending') then
    raise exception 'You are not in this game';
  end if;

  update public.game_players
    set status = 'removed'
    where id = v_player_id;

  perform private.notify_player_left(p_game_id, v_uid, v_player_status = 'pending');
  return jsonb_build_object('status', 'removed');
end;
$fn$;

create or replace function public.leave_game(p_game_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $fn$
  select private.leave_game(p_game_id);
$fn$;

revoke all on function private.notify_player_left(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function private.leave_game(uuid) from public;
grant execute on function private.leave_game(uuid) to authenticated, service_role;

revoke all on function public.leave_game(uuid) from public, anon;
grant execute on function public.leave_game(uuid) to authenticated;
