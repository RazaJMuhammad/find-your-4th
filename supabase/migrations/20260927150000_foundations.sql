-- Find Your 4th v1.
-- Slot rules mirror lib/domain/rules.ts. Keep the two together.
-- Privileged functions live in schema app, which must stay off the Data API exposed-schemas list.

create schema if not exists app;

create type public.skill_level as enum (
  'beginner',
  'beginner_plus',
  'intermediate',
  'intermediate_plus',
  'advanced'
);

create type public.game_type as enum ('casual', 'competitive', 'social');
create type public.court_status as enum ('booked', 'not_booked', 'book_when_full');
create type public.gender_label as enum ('open', 'men', 'women', 'mixed');
create type public.match_status as enum ('open', 'full', 'completed', 'cancelled');
create type public.slot_kind as enum ('member', 'guest');
create type public.slot_status as enum ('open', 'held_guest', 'joined', 'confirmed', 'released');
create type public.release_reason as enum (
  'cancelled_early',
  'cancelled_late',
  'no_response',
  'no_show',
  'host_removed'
);
create type public.notification_type as enum (
  'game_full',
  'spot_opened',
  'waitlist_promoted',
  'attendance_reminder',
  'court_confirmed',
  'rate_game',
  'game_cancelled'
);

create table public.clubs (
  id text primary key,
  name text not null,
  suburb text,
  city text not null,
  province text not null,
  court_count integer,
  booking_platform text
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  level public.skill_level,
  home_club_id text references public.clubs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  level public.skill_level not null,
  game_type public.game_type not null,
  court_status public.court_status not null,
  note text check (note is null or char_length(note) <= 500),
  gender_label public.gender_label not null default 'open',
  logistics_note text check (logistics_note is null or char_length(logistics_note) <= 500),
  attendance_deadline timestamptz not null,
  status public.match_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_deadline_before_start check (attendance_deadline <= starts_at - interval '1 hour')
);

create table public.match_clubs (
  match_id uuid not null references public.matches (id) on delete cascade,
  club_id text not null references public.clubs (id),
  is_confirmed boolean not null default false,
  primary key (match_id, club_id)
);

create table public.match_slots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  slot_index integer not null check (slot_index between 1 and 4),
  kind public.slot_kind not null default 'member',
  status public.slot_status not null,
  player_id uuid references public.profiles (id),
  guest_label text check (guest_label is null or char_length(guest_label) <= 40),
  release_reason public.release_reason,
  joined_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  attendance_reminder_sent_at timestamptz,
  unique (match_id, slot_index)
);

create unique index match_slots_one_active_player
  on public.match_slots (match_id, player_id)
  where player_id is not null and status in ('joined', 'confirmed');

create table public.match_waitlist (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create table public.attendance_outcomes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id),
  slot_id uuid references public.match_slots (id) on delete set null,
  outcome text not null check (outcome in ('show_up', 'late_cancel', 'no_response', 'no_show')),
  created_at timestamptz not null default now()
);

create table public.match_ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  rater_id uuid not null references public.profiles (id),
  ratee_id uuid not null references public.profiles (id),
  stars integer not null check (stars between 1 and 5),
  play_again boolean not null,
  created_at timestamptz not null default now(),
  unique (match_id, rater_id, ratee_id),
  check (rater_id <> ratee_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.player_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  reported_id uuid not null references public.profiles (id),
  match_id uuid references public.matches (id) on delete set null,
  note text not null check (char_length(note) between 10 and 1000),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index clubs_city_idx on public.clubs (city, name);
create index matches_feed_idx on public.matches (status, starts_at);
create index matches_host_idx on public.matches (host_id);
create index matches_deadline_idx on public.matches (attendance_deadline) where status in ('open', 'full');
create index match_slots_match_idx on public.match_slots (match_id);
create index match_slots_player_idx on public.match_slots (player_id) where player_id is not null;
create index match_clubs_club_idx on public.match_clubs (club_id);
create index match_waitlist_order_idx on public.match_waitlist (match_id, created_at);
create index attendance_player_idx on public.attendance_outcomes (player_id);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create function app.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function app.touch_updated_at();

create trigger matches_touch before update on public.matches
for each row execute function app.touch_updated_at();

create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Player'), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create function app.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

create function app.level_rank(p_level public.skill_level)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_level
    when 'beginner' then 0
    when 'beginner_plus' then 1
    when 'intermediate' then 2
    when 'intermediate_plus' then 3
    when 'advanced' then 4
  end;
$$;

create function app.notify(p_user uuid, p_type public.notification_type, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, payload)
  values (p_user, p_type, coalesce(p_payload, '{}'::jsonb));
$$;

create function app.notify_members(
  p_match uuid,
  p_type public.notification_type,
  p_payload jsonb,
  p_skip uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, payload)
  select s.player_id, p_type, coalesce(p_payload, '{}'::jsonb)
  from public.match_slots s
  where s.match_id = p_match
    and s.player_id is not null
    and s.status in ('joined', 'confirmed')
    and s.player_id is distinct from p_skip;
$$;

create function app.record_outcome(p_match uuid, p_player uuid, p_slot uuid, p_outcome text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.attendance_outcomes (match_id, player_id, slot_id, outcome)
  values (p_match, p_player, p_slot, p_outcome);
$$;

create function app.clear_slot(p_slot uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.match_slots
  set
    status = 'open',
    kind = 'member',
    player_id = null,
    guest_label = null,
    release_reason = null,
    joined_at = null,
    confirmed_at = null,
    released_at = null,
    attendance_reminder_sent_at = null
  where id = p_slot;
$$;

create function app.refresh_match_status(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.match_status;
  v_open integer;
begin
  select status into v_status from public.matches where id = p_match;
  if v_status in ('completed', 'cancelled') then
    return;
  end if;

  select count(*) into v_open
  from public.match_slots
  where match_id = p_match and status = 'open';

  if v_open = 0 then
    update public.matches set status = 'full' where id = p_match;
    if v_status is distinct from 'full' then
      perform app.notify_members(
        p_match,
        'game_full',
        jsonb_build_object('match_id', p_match),
        null
      );
    end if;
  else
    update public.matches set status = 'open' where id = p_match;
  end if;
end;
$$;

create function app.promote_waitlist(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts timestamptz;
  v_player uuid;
  v_wait uuid;
  v_slot uuid;
begin
  select starts_at into v_starts from public.matches where id = p_match;
  if v_starts <= now() + interval '60 minutes' then
    return;
  end if;

  select id, player_id into v_wait, v_player
  from public.match_waitlist
  where match_id = p_match
  order by created_at
  limit 1
  for update skip locked;

  if v_player is null then
    return;
  end if;

  select id into v_slot
  from public.match_slots
  where match_id = p_match and status = 'open'
  order by slot_index
  limit 1
  for update;

  if v_slot is null then
    return;
  end if;

  delete from public.match_waitlist where id = v_wait;

  update public.match_slots
  set status = 'joined', kind = 'member', player_id = v_player, joined_at = now()
  where id = v_slot;

  perform app.notify(v_player, 'waitlist_promoted', jsonb_build_object('match_id', p_match));
end;
$$;

create function app.release_playing_slot(
  p_match uuid,
  p_slot uuid,
  p_player uuid,
  p_reason public.release_reason,
  p_record boolean,
  p_outcome_player uuid,
  p_notify_host boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_status public.match_status;
  v_next public.match_status;
begin
  select host_id, status into v_host, v_status
  from public.matches
  where id = p_match;

  if p_record and p_outcome_player is not null then
    perform app.record_outcome(
      p_match,
      p_outcome_player,
      p_slot,
      case p_reason
        when 'cancelled_late' then 'late_cancel'
        when 'no_response' then 'no_response'
        when 'no_show' then 'no_show'
        else 'late_cancel'
      end
    );
  end if;

  update public.match_slots set release_reason = p_reason, released_at = now() where id = p_slot;
  perform app.clear_slot(p_slot);
  perform app.promote_waitlist(p_match);
  perform app.refresh_match_status(p_match);

  select status into v_next from public.matches where id = p_match;
  if p_notify_host and v_status = 'full' and v_next = 'open' and v_host is distinct from p_player then
    perform app.notify(v_host, 'spot_opened', jsonb_build_object('match_id', p_match));
  end if;
end;
$$;

create function app.create_match(
  p_starts_at timestamptz,
  p_level public.skill_level,
  p_game_type public.game_type,
  p_court_status public.court_status,
  p_note text,
  p_gender public.gender_label,
  p_logistics_note text,
  p_attendance_deadline timestamptz,
  p_guest_names text[],
  p_club_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_level public.skill_level;
  v_deadline timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_logistics text := nullif(btrim(coalesce(p_logistics_note, '')), '');
  v_guests integer := coalesce(array_length(p_guest_names, 1), 0);
  v_clubs integer := coalesce(array_length(p_club_ids, 1), 0);
  v_id uuid;
  v_index integer;
  v_name text;
begin
  select level into v_level from public.profiles where id = v_uid;
  if v_level is null then
    raise exception 'Finish your profile before posting a game';
  end if;
  if p_starts_at <= now() + interval '1 hour' then
    raise exception 'Games need to start more than an hour from now';
  end if;

  v_deadline := coalesce(p_attendance_deadline, p_starts_at - interval '4 hours');
  if v_deadline > p_starts_at - interval '1 hour' then
    raise exception 'Attendance deadline must be at least 1 hour before the game';
  end if;
  if v_deadline <= now() then
    raise exception 'Attendance deadline must be in the future';
  end if;
  if v_guests > 2 then
    raise exception 'You can hold at most two guest spots';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Note is too long';
  end if;
  if v_logistics is not null and char_length(v_logistics) > 500 then
    raise exception 'Logistics note is too long';
  end if;
  if v_clubs < 1 then
    raise exception 'Pick at least one club';
  end if;
  if (select count(*) from unnest(p_club_ids) c) <> (select count(distinct c) from unnest(p_club_ids) c) then
    raise exception 'Each club can only be selected once';
  end if;
  if exists (
    select 1 from unnest(p_club_ids) c
    where not exists (select 1 from public.clubs clubs where clubs.id = c)
  ) then
    raise exception 'Unknown club';
  end if;
  if p_court_status = 'booked' and v_clubs <> 1 then
    raise exception 'A booked court is one club';
  end if;

  insert into public.matches (
    host_id, starts_at, level, game_type, court_status, note, gender_label,
    logistics_note, attendance_deadline, status
  )
  values (
    v_uid, p_starts_at, p_level, p_game_type, p_court_status, v_note, coalesce(p_gender, 'open'),
    v_logistics, v_deadline, 'open'
  )
  returning id into v_id;

  insert into public.match_clubs (match_id, club_id, is_confirmed)
  select v_id, c, p_court_status = 'booked'
  from unnest(p_club_ids) c;

  insert into public.match_slots (match_id, slot_index, kind, status, player_id, joined_at)
  values (v_id, 1, 'member', 'joined', v_uid, now());

  for v_index in 1..v_guests loop
    v_name := nullif(btrim(p_guest_names[v_index]), '');
    if v_name is null then
      raise exception 'Guest spots need a first name';
    end if;
    insert into public.match_slots (match_id, slot_index, kind, status, guest_label)
    values (v_id, v_index + 1, 'guest', 'held_guest', left(v_name, 40));
  end loop;

  for v_index in (v_guests + 2)..4 loop
    insert into public.match_slots (match_id, slot_index, kind, status)
    values (v_id, v_index, 'member', 'open');
  end loop;

  return v_id;
end;
$$;

create function app.join_match(p_match uuid, p_ack boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_status public.match_status;
  v_starts timestamptz;
  v_game_level public.skill_level;
  v_player_level public.skill_level;
  v_slot uuid;
begin
  select status, starts_at, level
  into v_status, v_starts, v_game_level
  from public.matches
  where id = p_match
  for update;

  if not found then
    raise exception 'Game not found';
  end if;
  if v_status <> 'open' then
    raise exception 'This game is not open';
  end if;
  if v_starts <= now() then
    raise exception 'This game has already started';
  end if;

  select level into v_player_level from public.profiles where id = v_uid;
  if v_player_level is null then
    raise exception 'Finish your profile before joining a game';
  end if;
  if abs(app.level_rank(v_player_level) - app.level_rank(v_game_level)) > 1 and p_ack is not true then
    raise exception 'This game is outside your level. Confirm to join anyway';
  end if;
  if exists (
    select 1 from public.attendance_outcomes
    where match_id = p_match and player_id = v_uid
  ) then
    raise exception 'You already left this game';
  end if;
  if exists (
    select 1 from public.match_slots
    where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed')
  ) then
    raise exception 'You are already in this game';
  end if;

  delete from public.match_waitlist where match_id = p_match and player_id = v_uid;

  select id into v_slot
  from public.match_slots
  where match_id = p_match and status = 'open'
  order by slot_index
  limit 1
  for update;

  if v_slot is null then
    raise exception 'This game is full';
  end if;

  update public.match_slots
  set status = 'joined', kind = 'member', player_id = v_uid, joined_at = now()
  where id = v_slot;

  perform app.refresh_match_status(p_match);
end;
$$;

create function app.leave_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
  v_deadline timestamptz;
  v_slot uuid;
  v_status public.slot_status;
  v_reason public.release_reason;
begin
  select host_id, attendance_deadline into v_host, v_deadline
  from public.matches
  where id = p_match
  for update;

  if not found then
    raise exception 'Game not found';
  end if;
  if v_host = v_uid then
    raise exception 'Cancel the game if you can no longer play';
  end if;

  select id, status into v_slot, v_status
  from public.match_slots
  where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed')
  for update;

  if v_slot is null then
    raise exception 'You are not in this game';
  end if;

  if v_status = 'confirmed' or now() > v_deadline then
    v_reason := 'cancelled_late';
  else
    v_reason := 'cancelled_early';
  end if;

  perform app.release_playing_slot(
    p_match,
    v_slot,
    v_uid,
    v_reason,
    v_reason = 'cancelled_late',
    v_uid,
    true
  );
end;
$$;

create function app.join_waitlist(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_status public.match_status;
  v_starts timestamptz;
begin
  select status, starts_at into v_status, v_starts
  from public.matches
  where id = p_match
  for update;

  if v_status <> 'full' then
    raise exception 'This game still has an open spot';
  end if;
  if v_starts <= now() then
    raise exception 'This game has already started';
  end if;
  if exists (
    select 1 from public.match_slots
    where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed')
  ) then
    raise exception 'You are already in this game';
  end if;

  insert into public.match_waitlist (match_id, player_id)
  values (p_match, v_uid)
  on conflict (match_id, player_id) do nothing;
end;
$$;

create function app.confirm_attendance(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_deadline timestamptz;
  v_slot uuid;
begin
  select attendance_deadline into v_deadline
  from public.matches
  where id = p_match
  for update;

  if v_deadline < now() then
    raise exception 'The confirmation deadline has passed';
  end if;

  select id into v_slot
  from public.match_slots
  where match_id = p_match and player_id = v_uid and status = 'joined';

  if v_slot is null then
    raise exception 'There is nothing to confirm';
  end if;

  update public.match_slots
  set status = 'confirmed', confirmed_at = now()
  where id = v_slot;
end;
$$;

create function app.confirm_club(p_match uuid, p_club text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
  v_status public.match_status;
begin
  select host_id, status into v_host, v_status
  from public.matches
  where id = p_match
  for update;

  if v_host is distinct from v_uid then
    raise exception 'Only the host can confirm the club';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'This game is closed';
  end if;
  if not exists (select 1 from public.clubs where id = p_club) then
    raise exception 'Unknown club';
  end if;

  insert into public.match_clubs (match_id, club_id, is_confirmed)
  values (p_match, p_club, false)
  on conflict (match_id, club_id) do nothing;

  update public.match_clubs set is_confirmed = (club_id = p_club) where match_id = p_match;
  update public.matches set court_status = 'booked' where id = p_match;

  perform app.notify_members(
    p_match,
    'court_confirmed',
    jsonb_build_object('match_id', p_match, 'club_id', p_club),
    v_uid
  );
end;
$$;

create function app.set_logistics_note(p_match uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Logistics note is too long';
  end if;
  update public.matches
  set logistics_note = v_note
  where id = p_match and host_id = v_uid;
  if not found then
    raise exception 'Only the host can update the logistics note';
  end if;
end;
$$;

create function app.remove_player(p_match uuid, p_slot uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
  v_player uuid;
  v_status public.slot_status;
begin
  select host_id into v_host from public.matches where id = p_match for update;
  if v_host is distinct from v_uid then
    raise exception 'Only the host can remove a player';
  end if;

  select player_id, status into v_player, v_status
  from public.match_slots
  where id = p_slot and match_id = p_match
  for update;

  if v_status not in ('joined', 'confirmed', 'held_guest') then
    raise exception 'That spot is already open';
  end if;
  if v_player = v_uid then
    raise exception 'Cancel the game if you can no longer play';
  end if;

  perform app.release_playing_slot(p_match, p_slot, v_player, 'host_removed', false, null, false);
end;
$$;

create function app.cancel_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
  v_status public.match_status;
  v_deadline timestamptz;
  v_confirmed boolean;
begin
  select host_id, status, attendance_deadline
  into v_host, v_status, v_deadline
  from public.matches
  where id = p_match
  for update;

  if v_host is distinct from v_uid then
    raise exception 'Only the host can cancel the game';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'This game is already closed';
  end if;

  select exists (
    select 1 from public.match_slots
    where match_id = p_match and status = 'confirmed' and player_id is not null
  ) into v_confirmed;

  if v_confirmed or now() > v_deadline then
    perform app.record_outcome(p_match, v_uid, null, 'late_cancel');
  end if;

  update public.matches set status = 'cancelled' where id = p_match;
  perform app.notify_members(
    p_match,
    'game_cancelled',
    jsonb_build_object('match_id', p_match),
    v_uid
  );
end;
$$;

create function app.complete_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
  v_starts timestamptz;
  v_status public.match_status;
begin
  select host_id, starts_at, status
  into v_host, v_starts, v_status
  from public.matches
  where id = p_match
  for update;

  if v_host is distinct from v_uid then
    raise exception 'Only the host can mark the game played';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'This game is already closed';
  end if;
  if v_starts > now() then
    raise exception 'The game has not started yet';
  end if;

  insert into public.attendance_outcomes (match_id, player_id, slot_id, outcome)
  select s.match_id, s.player_id, s.id, 'show_up'
  from public.match_slots s
  where s.match_id = p_match
    and s.player_id is not null
    and s.status in ('joined', 'confirmed')
    and not exists (
      select 1 from public.attendance_outcomes o
      where o.match_id = p_match and o.player_id = s.player_id and o.outcome = 'show_up'
    );

  update public.matches set status = 'completed' where id = p_match;

  perform app.notify_members(
    p_match,
    'rate_game',
    jsonb_build_object('match_id', p_match),
    null
  );
end;
$$;

create function app.mark_no_show(p_match uuid, p_slot uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
  v_status public.match_status;
  v_kind public.slot_kind;
  v_player uuid;
  v_slot_status public.slot_status;
begin
  select host_id, status into v_host, v_status
  from public.matches
  where id = p_match
  for update;

  if v_host is distinct from v_uid then
    raise exception 'Only the host can mark a no-show';
  end if;
  if v_status <> 'completed' then
    raise exception 'Mark the game played first';
  end if;

  select kind, player_id, status into v_kind, v_player, v_slot_status
  from public.match_slots
  where id = p_slot and match_id = p_match;

  if v_slot_status not in ('joined', 'confirmed', 'held_guest') then
    raise exception 'That spot was already empty';
  end if;

  if exists (
    select 1 from public.attendance_outcomes
    where slot_id = p_slot and outcome = 'no_show'
  ) then
    raise exception 'Already marked as a no-show';
  end if;

  if v_kind = 'guest' then
    perform app.record_outcome(p_match, v_host, p_slot, 'no_show');
  else
    delete from public.attendance_outcomes
    where match_id = p_match and slot_id = p_slot and outcome = 'show_up';
    perform app.record_outcome(p_match, v_player, p_slot, 'no_show');
  end if;
end;
$$;

create function app.submit_rating(p_match uuid, p_ratee uuid, p_stars integer, p_play_again boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_status public.match_status;
begin
  select status into v_status from public.matches where id = p_match;
  if v_status <> 'completed' then
    raise exception 'Ratings open after the game';
  end if;
  if p_ratee = v_uid then
    raise exception 'You cannot rate yourself';
  end if;
  if p_stars < 1 or p_stars > 5 then
    raise exception 'Stars must be between 1 and 5';
  end if;
  if not exists (
    select 1 from public.attendance_outcomes
    where match_id = p_match and player_id = v_uid and outcome = 'show_up'
  ) or not exists (
    select 1 from public.attendance_outcomes
    where match_id = p_match and player_id = p_ratee and outcome = 'show_up'
  ) then
    raise exception 'You can only rate players who played';
  end if;

  insert into public.match_ratings (match_id, rater_id, ratee_id, stars, play_again)
  values (p_match, v_uid, p_ratee, p_stars, p_play_again)
  on conflict (match_id, rater_id, ratee_id) do update
  set stars = excluded.stars, play_again = excluded.play_again;
end;
$$;

create function app.report_player(p_reported uuid, p_match uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_reported = v_uid then
    raise exception 'You cannot report yourself';
  end if;
  if char_length(v_note) < 10 or char_length(v_note) > 1000 then
    raise exception 'Add a short note, at least 10 characters';
  end if;
  insert into public.player_reports (reporter_id, reported_id, match_id, note)
  values (v_uid, p_reported, p_match, v_note);
end;
$$;

create function app.logistics_note(p_match uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_note text;
begin
  if v_uid is null then
    return null;
  end if;
  if not exists (
    select 1 from public.match_slots
    where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed')
  ) then
    return null;
  end if;
  select logistics_note into v_note from public.matches where id = p_match;
  return v_note;
end;
$$;

-- Aggregates only. Individual ratings stay behind RLS, so this cannot be a security invoker view.
create function app.player_reliability(p_player uuid)
returns table (
  show_ups integer,
  misses integer,
  games_hosted integer,
  play_again_yes integer,
  play_again_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.attendance_outcomes o where o.player_id = p_player and o.outcome = 'show_up'),
    (select count(*)::integer from public.attendance_outcomes o where o.player_id = p_player and o.outcome in ('late_cancel', 'no_response', 'no_show')),
    (select count(*)::integer from public.matches m where m.host_id = p_player and m.status = 'completed'),
    (select count(*)::integer from public.match_ratings r where r.ratee_id = p_player and r.play_again),
    (select count(*)::integer from public.match_ratings r where r.ratee_id = p_player);
$$;

create function app.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth);
end;
$$;

create function app.run_scheduled_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select s.id as slot_id, s.match_id, s.player_id
    from public.match_slots s
    join public.matches m on m.id = s.match_id
    where m.status in ('open', 'full')
      and m.attendance_deadline < now()
      and s.kind = 'member'
      and s.status = 'joined'
      and s.player_id is not null
    order by s.match_id, s.slot_index
  loop
    perform 1 from public.matches where id = r.match_id for update;
    if exists (
      select 1
      from public.match_slots s
      join public.matches m on m.id = s.match_id
      where s.id = r.slot_id
        and s.status = 'joined'
        and m.attendance_deadline < now()
    ) then
      perform app.release_playing_slot(
        r.match_id, r.slot_id, r.player_id, 'no_response', true, r.player_id, true
      );
    end if;
  end loop;

  for r in
    select s.id as slot_id, s.player_id, s.match_id
    from public.match_slots s
    join public.matches m on m.id = s.match_id
    where s.status = 'joined'
      and s.kind = 'member'
      and s.player_id is not null
      and s.attendance_reminder_sent_at is null
      and m.status in ('open', 'full')
      and m.attendance_deadline > now()
      and m.attendance_deadline <= now() + interval '2 hours'
  loop
    update public.match_slots
    set attendance_reminder_sent_at = now()
    where id = r.slot_id and attendance_reminder_sent_at is null;
    if found then
      perform app.notify(
        r.player_id,
        'attendance_reminder',
        jsonb_build_object('match_id', r.match_id)
      );
    end if;
  end loop;
end;
$$;

-- Public wrappers. security invoker so the Data API does not run them as the owner.
-- They call app.*, which stays off the exposed schema list.

create function public.create_match(p_starts_at timestamptz, p_level public.skill_level, p_game_type public.game_type, p_court_status public.court_status, p_note text, p_gender public.gender_label, p_logistics_note text, p_attendance_deadline timestamptz, p_guest_names text[], p_club_ids text[])
returns uuid language sql security invoker set search_path = ''
as $$ select app.create_match(p_starts_at, p_level, p_game_type, p_court_status, p_note, p_gender, p_logistics_note, p_attendance_deadline, p_guest_names, p_club_ids); $$;

create function public.join_match(p_match uuid, p_ack boolean)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.join_match(p_match, p_ack); end; $$;

create function public.leave_match(p_match uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.leave_match(p_match); end; $$;

create function public.join_waitlist(p_match uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.join_waitlist(p_match); end; $$;

create function public.confirm_attendance(p_match uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.confirm_attendance(p_match); end; $$;

create function public.confirm_club(p_match uuid, p_club text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.confirm_club(p_match, p_club); end; $$;

create function public.set_logistics_note(p_match uuid, p_note text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.set_logistics_note(p_match, p_note); end; $$;

create function public.remove_player(p_match uuid, p_slot uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.remove_player(p_match, p_slot); end; $$;

create function public.cancel_match(p_match uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.cancel_match(p_match); end; $$;

create function public.complete_match(p_match uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.complete_match(p_match); end; $$;

create function public.mark_no_show(p_match uuid, p_slot uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.mark_no_show(p_match, p_slot); end; $$;

create function public.submit_rating(p_match uuid, p_ratee uuid, p_stars integer, p_play_again boolean)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.submit_rating(p_match, p_ratee, p_stars, p_play_again); end; $$;

create function public.report_player(p_reported uuid, p_match uuid, p_note text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.report_player(p_reported, p_match, p_note); end; $$;

create function public.logistics_note(p_match uuid)
returns text language sql stable security invoker set search_path = ''
as $$ select app.logistics_note(p_match); $$;

create function public.player_reliability(p_player uuid)
returns table (show_ups integer, misses integer, games_hosted integer, play_again_yes integer, play_again_count integer)
language sql stable security invoker set search_path = ''
as $$ select * from app.player_reliability(p_player); $$;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.save_push_subscription(p_endpoint, p_p256dh, p_auth); end; $$;

create function public.run_scheduled_jobs()
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.run_scheduled_jobs(); end; $$;

revoke all on schema app from public, anon, authenticated;
grant usage on schema app to anon, authenticated, service_role;

revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.create_match(timestamptz, public.skill_level, public.game_type, public.court_status, text, public.gender_label, text, timestamptz, text[], text[]) to authenticated;
grant execute on function app.join_match(uuid, boolean) to authenticated;
grant execute on function app.leave_match(uuid) to authenticated;
grant execute on function app.join_waitlist(uuid) to authenticated;
grant execute on function app.confirm_attendance(uuid) to authenticated;
grant execute on function app.confirm_club(uuid, text) to authenticated;
grant execute on function app.set_logistics_note(uuid, text) to authenticated;
grant execute on function app.remove_player(uuid, uuid) to authenticated;
grant execute on function app.cancel_match(uuid) to authenticated;
grant execute on function app.complete_match(uuid) to authenticated;
grant execute on function app.mark_no_show(uuid, uuid) to authenticated;
grant execute on function app.submit_rating(uuid, uuid, integer, boolean) to authenticated;
grant execute on function app.report_player(uuid, uuid, text) to authenticated;
grant execute on function app.logistics_note(uuid) to authenticated;
grant execute on function app.player_reliability(uuid) to anon, authenticated;
grant execute on function app.save_push_subscription(text, text, text) to authenticated;
grant execute on function app.run_scheduled_jobs() to service_role;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_match', 'join_match', 'leave_match', 'join_waitlist', 'confirm_attendance',
        'confirm_club', 'set_logistics_note', 'remove_player', 'cancel_match', 'complete_match',
        'mark_no_show', 'submit_rating', 'report_player', 'logistics_note', 'player_reliability',
        'save_push_subscription', 'run_scheduled_jobs'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;

grant execute on function public.create_match(timestamptz, public.skill_level, public.game_type, public.court_status, text, public.gender_label, text, timestamptz, text[], text[]) to authenticated;
grant execute on function public.join_match(uuid, boolean) to authenticated;
grant execute on function public.leave_match(uuid) to authenticated;
grant execute on function public.join_waitlist(uuid) to authenticated;
grant execute on function public.confirm_attendance(uuid) to authenticated;
grant execute on function public.confirm_club(uuid, text) to authenticated;
grant execute on function public.set_logistics_note(uuid, text) to authenticated;
grant execute on function public.remove_player(uuid, uuid) to authenticated;
grant execute on function public.cancel_match(uuid) to authenticated;
grant execute on function public.complete_match(uuid) to authenticated;
grant execute on function public.mark_no_show(uuid, uuid) to authenticated;
grant execute on function public.submit_rating(uuid, uuid, integer, boolean) to authenticated;
grant execute on function public.report_player(uuid, uuid, text) to authenticated;
grant execute on function public.logistics_note(uuid) to authenticated;
grant execute on function public.player_reliability(uuid) to anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.run_scheduled_jobs() to service_role;

alter table public.clubs enable row level security;
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_clubs enable row level security;
alter table public.match_slots enable row level security;
alter table public.match_waitlist enable row level security;
alter table public.attendance_outcomes enable row level security;
alter table public.match_ratings enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.player_reports enable row level security;

revoke all on public.clubs, public.profiles, public.matches, public.match_clubs, public.match_slots, public.match_waitlist, public.attendance_outcomes, public.match_ratings, public.notifications, public.push_subscriptions, public.player_reports from anon, authenticated;

grant select on public.clubs, public.match_clubs, public.match_slots, public.match_waitlist to anon, authenticated;
grant select (
  id, host_id, starts_at, level, game_type, court_status, note, gender_label,
  attendance_deadline, status, created_at, updated_at
) on public.matches to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, level, home_club_id) on public.profiles to authenticated;
grant select on public.attendance_outcomes to authenticated;
grant select on public.match_ratings to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy clubs_read on public.clubs for select to anon, authenticated using (true);
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy matches_read on public.matches for select to anon, authenticated using (true);
create policy match_clubs_read on public.match_clubs for select to anon, authenticated using (true);
create policy match_slots_read on public.match_slots for select to anon, authenticated using (true);
create policy waitlist_read on public.match_waitlist for select to anon, authenticated using (true);
create policy outcomes_read on public.attendance_outcomes for select to authenticated
  using (
    player_id = (select auth.uid())
    or exists (
      select 1 from public.matches m
      where m.id = match_id and m.host_id = (select auth.uid())
    )
    or exists (
      select 1 from public.match_slots s
      where s.match_id = attendance_outcomes.match_id
        and s.player_id = (select auth.uid())
        and s.status in ('joined', 'confirmed')
    )
  );
create policy ratings_read on public.match_ratings for select to authenticated
  using (rater_id = (select auth.uid()) or ratee_id = (select auth.uid()));
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy push_read on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.match_slots replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.match_slots;
  end if;
exception
  when duplicate_object then null;
end $$;
