-- FindYour4th: clubs, open games, and locked join/request functions.
-- Join logic lives in the private schema. Public wrappers are security invoker
-- so the Data API can call them without a security definer in an exposed schema.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.skill_level as enum ('any', 'beginner', 'intermediate', 'advanced');
create type public.join_mode as enum ('open', 'request');
create type public.game_status as enum ('open', 'cancelled');
create type public.player_status as enum ('joined', 'pending', 'declined', 'removed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 40),
  surname text not null check (char_length(btrim(surname)) between 1 and 40),
  phone text not null check (char_length(btrim(phone)) between 9 and 20),
  city text not null check (char_length(btrim(city)) between 1 and 80),
  skill public.skill_level not null default 'any',
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  city text not null,
  province text,
  area text,
  court_count integer check (court_count is null or court_count >= 0),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  spots_needed integer not null check (spots_needed between 1 and 3),
  court_booked boolean not null default false,
  join_mode public.join_mode not null default 'open',
  skill public.skill_level not null default 'any',
  note text check (note is null or char_length(note) <= 280),
  status public.game_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.game_clubs (
  game_id uuid not null references public.games (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete restrict,
  primary key (game_id, club_id)
);

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.player_status not null,
  created_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index clubs_city_idx on public.clubs (city);
create index games_starts_idx on public.games (starts_at) where status = 'open';
create index games_host_idx on public.games (host_id);
create index game_players_game_idx on public.game_players (game_id, status);
create index game_players_user_idx on public.game_players (user_id);

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.games enable row level security;
alter table public.game_clubs enable row level security;
alter table public.game_players enable row level security;

-- Phone numbers stay off the table API. Players read them through game_contacts.
revoke all on public.profiles from anon, authenticated;
grant select (id, first_name, surname, city, skill, created_at)
  on public.profiles to anon, authenticated;

revoke all on public.clubs from anon, authenticated;
grant select on public.clubs to anon, authenticated;

revoke all on public.games from anon, authenticated;
grant select on public.games to anon, authenticated;

revoke all on public.game_clubs from anon, authenticated;
grant select on public.game_clubs to anon, authenticated;

revoke all on public.game_players from anon, authenticated;
grant select on public.game_players to anon, authenticated;

create policy profiles_read on public.profiles
  for select to anon, authenticated
  using (true);

create policy clubs_read on public.clubs
  for select to anon, authenticated
  using (true);

create policy games_read on public.games
  for select to anon, authenticated
  using (
    status = 'open'
    or host_id = (select auth.uid())
  );

create policy game_clubs_read on public.game_clubs
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.games g
      where g.id = game_clubs.game_id
        and (
          g.status = 'open'
          or g.host_id = (select auth.uid())
        )
    )
  );

create policy game_players_read on public.game_players
  for select to anon, authenticated
  using (
    status = 'joined'
    or user_id = (select auth.uid())
    or exists (
      select 1
      from public.games g
      where g.id = game_players.game_id
        and g.host_id = (select auth.uid())
    )
  );

create or replace function private.require_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to continue';
  end if;
  return v_uid;
end;
$$;

create or replace function private.save_profile(
  p_first_name text,
  p_surname text,
  p_phone text,
  p_city text,
  p_skill public.skill_level
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
  v_city text := btrim(coalesce(p_city, ''));
begin
  if char_length(v_first) not between 1 and 40
    or char_length(v_surname) not between 1 and 40
    or char_length(v_city) not between 1 and 80
    or char_length(regexp_replace(v_phone, '\D', '', 'g')) < 9
  then
    raise exception 'Check your name, city, and WhatsApp number';
  end if;

  insert into public.profiles (id, first_name, surname, phone, city, skill)
  values (v_uid, v_first, v_surname, v_phone, v_city, coalesce(p_skill, 'any'))
  on conflict (id) do update
    set first_name = excluded.first_name,
        surname = excluded.surname,
        phone = excluded.phone,
        city = excluded.city,
        skill = excluded.skill;

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
    'lat', v_row.lat,
    'lng', v_row.lng
  );
end;
$$;

create or replace function private.set_location(
  p_lat double precision,
  p_lng double precision,
  p_city text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  if p_lat is null or p_lng is null
    or p_lat < -90 or p_lat > 90
    or p_lng < -180 or p_lng > 180
  then
    raise exception 'Location is not valid';
  end if;

  update public.profiles
    set lat = p_lat,
        lng = p_lng,
        city = case
          when p_city is null or btrim(p_city) = '' then city
          else btrim(p_city)
        end
    where id = v_uid;
end;
$$;

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
as $$
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

  if cardinality(v_clubs) < 1 or cardinality(v_clubs) > 8 then
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
$$;

create or replace function private.join_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_spots integer;
  v_mode public.join_mode;
  v_status public.game_status;
  v_host uuid;
  v_starts timestamptz;
  v_joined integer;
  v_existing_id uuid;
  v_existing_status public.player_status;
begin
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Finish your profile before joining';
  end if;

  select spots_needed, join_mode, status, host_id, starts_at
    into v_spots, v_mode, v_status, v_host, v_starts
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
  if v_starts <= now() then
    raise exception 'This game has already started';
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

  return jsonb_build_object('status', 'joined', 'player_id', v_existing_id);
end;
$$;

create or replace function private.request_spot(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_spots integer;
  v_mode public.join_mode;
  v_status public.game_status;
  v_host uuid;
  v_starts timestamptz;
  v_joined integer;
  v_existing_id uuid;
  v_existing_status public.player_status;
begin
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Finish your profile before requesting';
  end if;

  select spots_needed, join_mode, status, host_id, starts_at
    into v_spots, v_mode, v_status, v_host, v_starts
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
  if v_starts <= now() then
    raise exception 'This game has already started';
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

  return jsonb_build_object('status', 'pending', 'player_id', v_existing_id);
end;
$$;

create or replace function private.respond_request(
  p_player_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_game_id uuid;
  v_player_user uuid;
  v_player_status public.player_status;
  v_spots integer;
  v_status public.game_status;
  v_host uuid;
  v_joined integer;
begin
  select game_id into v_game_id
  from public.game_players
  where id = p_player_id;

  if v_game_id is null then
    raise exception 'Request not found';
  end if;

  select spots_needed, status, host_id
    into v_spots, v_status, v_host
  from public.games
  where id = v_game_id
  for update;

  if v_host <> v_uid then
    raise exception 'Only the host can respond';
  end if;
  if v_status <> 'open' then
    raise exception 'This game is no longer open';
  end if;

  select user_id, status
    into v_player_user, v_player_status
  from public.game_players
  where id = p_player_id
  for update;

  if v_player_status <> 'pending' then
    raise exception 'This request is no longer waiting';
  end if;

  if not coalesce(p_accept, false) then
    update public.game_players set status = 'declined' where id = p_player_id;
    return jsonb_build_object('status', 'declined');
  end if;

  select count(*)::integer into v_joined
  from public.game_players
  where game_id = v_game_id and status = 'joined';

  if v_joined >= v_spots then
    raise exception 'No spots left';
  end if;

  update public.game_players set status = 'joined' where id = p_player_id;
  return jsonb_build_object('status', 'joined', 'user_id', v_player_user);
end;
$$;

create or replace function private.remove_player(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_game_id uuid;
  v_host uuid;
begin
  select game_id into v_game_id from public.game_players where id = p_player_id;
  if v_game_id is null then
    raise exception 'Player not found';
  end if;

  select host_id into v_host
  from public.games
  where id = v_game_id
  for update;

  if v_host <> v_uid then
    raise exception 'Only the host can remove a player';
  end if;

  update public.game_players
    set status = 'removed'
    where id = p_player_id
      and status in ('joined', 'pending');

  return jsonb_build_object('status', 'removed');
end;
$$;

create or replace function private.cancel_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_host uuid;
begin
  select host_id into v_host
  from public.games
  where id = p_game_id
  for update;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if v_host <> v_uid then
    raise exception 'Only the host can cancel';
  end if;

  update public.games set status = 'cancelled' where id = p_game_id;
  return jsonb_build_object('status', 'cancelled');
end;
$$;

create or replace function private.game_contacts(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_allowed boolean := false;
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  select host_id into v_host from public.games where id = p_game_id;
  if v_host is null then
    return '[]'::jsonb;
  end if;

  if v_host = v_uid then
    v_allowed := true;
  elsif exists (
    select 1 from public.game_players
    where game_id = p_game_id and user_id = v_uid and status = 'joined'
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', p.id,
      'first_name', p.first_name,
      'surname', p.surname,
      'phone', p.phone,
      'role', case when p.id = v_host then 'host' else 'player' end
    ) order by case when p.id = v_host then 0 else 1 end, p.first_name)
    from public.profiles p
    where p.id = v_host
      or exists (
        select 1 from public.game_players gp
        where gp.game_id = p_game_id
          and gp.user_id = p.id
          and gp.status = 'joined'
      )
  ), '[]'::jsonb);
end;
$$;

-- Public wrappers. Invoker so they are safe to expose; the private functions do the work.
create or replace function public.save_profile(p_first_name text, p_surname text, p_phone text, p_city text, p_skill public.skill_level)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.save_profile(p_first_name, p_surname, p_phone, p_city, p_skill); $$;

create or replace function public.my_profile()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.my_profile(); $$;

create or replace function public.set_location(p_lat double precision, p_lng double precision, p_city text)
returns void language sql security invoker set search_path = ''
as $$ select private.set_location(p_lat, p_lng, p_city); $$;

create or replace function public.create_game(p_starts_at timestamptz, p_spots_needed integer, p_court_booked boolean, p_join_mode public.join_mode, p_skill public.skill_level, p_note text, p_club_ids uuid[])
returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_game(p_starts_at, p_spots_needed, p_court_booked, p_join_mode, p_skill, p_note, p_club_ids); $$;

create or replace function public.join_game(p_game_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.join_game(p_game_id); $$;

create or replace function public.request_spot(p_game_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.request_spot(p_game_id); $$;

create or replace function public.respond_request(p_player_id uuid, p_accept boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.respond_request(p_player_id, p_accept); $$;

create or replace function public.remove_player(p_player_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.remove_player(p_player_id); $$;

create or replace function public.cancel_game(p_game_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.cancel_game(p_game_id); $$;

create or replace function public.game_contacts(p_game_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.game_contacts(p_game_id); $$;

revoke all on function private.require_user() from public;
revoke all on function private.save_profile(text, text, text, text, public.skill_level) from public;
revoke all on function private.my_profile() from public;
revoke all on function private.set_location(double precision, double precision, text) from public;
revoke all on function private.create_game(timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]) from public;
revoke all on function private.join_game(uuid) from public;
revoke all on function private.request_spot(uuid) from public;
revoke all on function private.respond_request(uuid, boolean) from public;
revoke all on function private.remove_player(uuid) from public;
revoke all on function private.cancel_game(uuid) from public;
revoke all on function private.game_contacts(uuid) from public;

grant execute on function private.require_user() to authenticated, service_role;
grant execute on function private.save_profile(text, text, text, text, public.skill_level) to authenticated, service_role;
grant execute on function private.my_profile() to authenticated, service_role;
grant execute on function private.set_location(double precision, double precision, text) to authenticated, service_role;
grant execute on function private.create_game(timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]) to authenticated, service_role;
grant execute on function private.join_game(uuid) to authenticated, service_role;
grant execute on function private.request_spot(uuid) to authenticated, service_role;
grant execute on function private.respond_request(uuid, boolean) to authenticated, service_role;
grant execute on function private.remove_player(uuid) to authenticated, service_role;
grant execute on function private.cancel_game(uuid) to authenticated, service_role;
grant execute on function private.game_contacts(uuid) to authenticated, service_role;

revoke all on function public.save_profile(text, text, text, text, public.skill_level) from public, anon;
revoke all on function public.my_profile() from public, anon;
revoke all on function public.set_location(double precision, double precision, text) from public, anon;
revoke all on function public.create_game(timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]) from public, anon;
revoke all on function public.join_game(uuid) from public, anon;
revoke all on function public.request_spot(uuid) from public, anon;
revoke all on function public.respond_request(uuid, boolean) from public, anon;
revoke all on function public.remove_player(uuid) from public, anon;
revoke all on function public.cancel_game(uuid) from public, anon;
revoke all on function public.game_contacts(uuid) from public, anon;

grant execute on function public.save_profile(text, text, text, text, public.skill_level) to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.set_location(double precision, double precision, text) to authenticated;
grant execute on function public.create_game(timestamptz, integer, boolean, public.join_mode, public.skill_level, text, uuid[]) to authenticated;
grant execute on function public.join_game(uuid) to authenticated;
grant execute on function public.request_spot(uuid) to authenticated;
grant execute on function public.respond_request(uuid, boolean) to authenticated;
grant execute on function public.remove_player(uuid) to authenticated;
grant execute on function public.cancel_game(uuid) to authenticated;
grant execute on function public.game_contacts(uuid) to authenticated;

alter table public.games replica identity full;
alter table public.game_players replica identity full;

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_players;
alter publication supabase_realtime add table public.game_clubs;
