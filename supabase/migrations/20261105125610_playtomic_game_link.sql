-- Optional link to the Playtomic game, only kept when the host already booked a court.
alter table public.games
  add column playtomic_url text;

alter table public.games
  add constraint games_playtomic_url_format
  check (
    playtomic_url is null
    or (
      char_length(playtomic_url) <= 300
      and playtomic_url ~* '^https?://([a-z0-9-]+\.)*playtomic\.(io|com)([/?#]|$)'
    )
  );

drop function public.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]);
drop function private.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]);

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
  p_club_ids uuid[],
  p_playtomic_url text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $fn$
  select private.create_game(
    p_starts_at, p_ends_at, p_spots_needed, p_court_booked, p_join_mode, p_skill, p_note, p_club_ids, p_playtomic_url
  );
$fn$;

revoke all on function private.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[], text) from public;
grant execute on function private.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[], text) to authenticated, service_role;

revoke all on function public.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[], text) from public, anon;
grant execute on function public.create_game(timestamptz, timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[], text) to authenticated;
