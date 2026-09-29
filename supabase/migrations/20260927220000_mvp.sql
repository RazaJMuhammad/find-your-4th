-- MVP epics 1–11. Additive on the foundations migration.
-- Privileged functions stay in schema app. Do not expose schema app on the Data API.

alter type public.notification_type add value if not exists 'new_match';
alter type public.notification_type add value if not exists 'join_request';
alter type public.notification_type add value if not exists 'request_decided';
alter type public.notification_type add value if not exists 'player_update';
alter type public.notification_type add value if not exists 'game_locked';
alter type public.notification_type add value if not exists 'booking_reminder';
alter type public.notification_type add value if not exists 'game_booked';
alter type public.notification_type add value if not exists 'game_changed';
alter type public.notification_type add value if not exists 'fill_deadline';
alter type public.notification_type add value if not exists 'pre_game';

alter table public.profiles
  add column if not exists level_score smallint check (level_score between 0 and 7),
  add column if not exists avatar_url text;

alter table public.matches
  add column if not exists mode text not null default 'court' check (mode in ('court', 'proposal')),
  add column if not exists ends_at timestamptz,
  add column if not exists duration_minutes integer not null default 90 check (duration_minutes between 60 and 180),
  add column if not exists court_number text,
  add column if not exists open_spots integer not null default 3 check (open_spots between 1 and 3),
  add column if not exists level_min smallint not null default 0 check (level_min between 0 and 7),
  add column if not exists level_max smallint not null default 7 check (level_max between 0 and 7),
  add column if not exists join_mode text not null default 'instant' check (join_mode in ('instant', 'request')),
  add column if not exists cost_cents integer check (cost_cents is null or cost_cents >= 0),
  add column if not exists booking_url text,
  add column if not exists fill_deadline timestamptz,
  add column if not exists first_timer boolean not null default false,
  add column if not exists racket_available boolean not null default false,
  add column if not exists booker_id uuid references public.profiles (id),
  add column if not exists booking_status text not null default 'unbooked' check (booking_status in ('unbooked', 'booked', 'booked_elsewhere')),
  add column if not exists booking_deadline timestamptz,
  add column if not exists booking_details text,
  add column if not exists rebroadcast_used boolean not null default false,
  add column if not exists withdrawal_free_until timestamptz,
  add column if not exists share_token text unique default replace(gen_random_uuid()::text, '-', ''),
  add column if not exists locked_at timestamptz,
  add column if not exists broadcast_wave integer not null default 0,
  add column if not exists pre_game_sent_at timestamptz,
  add column if not exists fill_prompt_sent_at timestamptz,
  add column if not exists rating_prompt_sent_at timestamptz,
  add column if not exists booking_misses integer not null default 0,
  add column if not exists booking_nudge_at timestamptz;

alter table public.matches drop constraint if exists matches_level_range;
alter table public.matches add constraint matches_level_range check (level_min <= level_max);

alter table public.notifications add column if not exists event text;
alter table public.match_ratings add column if not exists level_fit smallint check (level_fit between 1 and 5);
alter table public.player_reports add column if not exists status text not null default 'open' check (status in ('open', 'resolved'));
alter table public.player_reports add column if not exists resolved_at timestamptz;

create table if not exists public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  gender text check (gender in ('man', 'woman', 'unspecified')),
  playtomic_url text,
  search_radius_km integer not null default 15 check (search_radius_km between 1 and 80),
  age_confirmed boolean not null default false,
  terms_accepted_at timestamptz,
  whatsapp text,
  whatsapp_share boolean not null default false,
  quiet_start time,
  quiet_end time,
  notif_prefs jsonb not null default '{}'::jsonb,
  fantasy_opt_in boolean not null default false,
  is_admin boolean not null default false,
  banned_at timestamptz
);

create table if not exists public.profile_clubs (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  club_id text not null references public.clubs (id),
  primary key (profile_id, club_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  note text check (note is null or char_length(note) <= 280),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create table if not exists public.match_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  slot_id uuid references public.match_slots (id) on delete set null,
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'expired', 'declined')),
  created_at timestamptz not null default now()
);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  filters jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  city text not null check (char_length(city) between 2 and 80),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  kind text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcast_sends (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  wave integer not null,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  subject text,
  created_at timestamptz not null default now()
);

create table if not exists public.disposable_email_domains (
  domain text primary key
);

insert into public.disposable_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('tempmail.com'), ('10minutemail.com'),
  ('yopmail.com'), ('trashmail.com'), ('sharklasers.com'), ('getnada.com'), ('dispostable.com')
on conflict do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('google_sign_in', false, 'Show Google sign-in once the provider is enabled'),
  ('broadcast', true, 'Wave matching when a game is posted'),
  ('chat', true, 'Per-game chat'),
  ('saved_searches', true, 'Saved feed alerts'),
  ('boost', false, 'Paid boost is a later hook'),
  ('crews', false, 'Crews are a later phase'),
  ('bench', false, 'Recurring bench is a later phase'),
  ('americano', false, 'Social tournaments are a later phase'),
  ('im_free', false, 'Availability posts are a later phase'),
  ('club_layer', false, 'Club claiming is a later phase'),
  ('payments', false, 'Payments stay mock-only')
on conflict do nothing;

insert into public.profile_private (id)
select id from public.profiles
on conflict do nothing;

insert into public.profile_clubs (profile_id, club_id)
select id, home_club_id from public.profiles
where home_club_id is not null
on conflict do nothing;

update public.matches set share_token = replace(gen_random_uuid()::text, '-', '') where share_token is null;

create index if not exists profile_clubs_club_idx on public.profile_clubs (club_id);
create index if not exists join_requests_match_idx on public.join_requests (match_id, status);
create index if not exists messages_match_idx on public.match_messages (match_id, created_at);
create index if not exists offers_open_idx on public.waitlist_offers (match_id, status, expires_at);
create index if not exists analytics_name_idx on public.analytics_events (name, created_at);
create index if not exists game_events_match_idx on public.game_events (match_id, created_at);

set check_function_bodies = off;

create or replace function app.touch_profile_private()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile_private (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_private on public.profiles;
create trigger profiles_private after insert on public.profiles
for each row execute function app.touch_profile_private();

create or replace function app.limit_home_clubs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.profile_clubs where profile_id = new.profile_id) >= 3 then
    raise exception 'Pick at most 3 home clubs';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_clubs_limit on public.profile_clubs;
create trigger profile_clubs_limit before insert on public.profile_clubs
for each row execute function app.limit_home_clubs();

create or replace function app.limit_saved_searches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 5 then
    raise exception 'You can save 5 searches';
  end if;
  return new;
end;
$$;

drop trigger if exists saved_searches_limit on public.saved_searches;
create trigger saved_searches_limit before insert on public.saved_searches
for each row execute function app.limit_saved_searches();

create or replace function app.score_to_level(p_score integer)
returns public.skill_level
language sql
immutable
set search_path = ''
as $$
  select case
    when p_score <= 1 then 'beginner'::public.skill_level
    when p_score = 2 then 'beginner_plus'::public.skill_level
    when p_score <= 4 then 'intermediate'::public.skill_level
    when p_score = 5 then 'intermediate_plus'::public.skill_level
    else 'advanced'::public.skill_level
  end;
$$;

create or replace function app.level_to_score(p_level public.skill_level)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_level
    when 'beginner' then 1
    when 'beginner_plus' then 2
    when 'intermediate' then 4
    when 'intermediate_plus' then 5
    else 6
  end;
$$;

create or replace function app.assert_clean(p_text text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(p_text, '') ~* '\m(fuck|shit|bitch|asshole)\M' then
    raise exception 'Remove the language in the note';
  end if;
end;
$$;

create or replace function app.assert_real_email()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return;
  end if;
  if exists (
    select 1 from public.disposable_email_domains d
    where d.domain = lower(split_part(v_email, '@', 2))
  ) then
    raise exception 'Use a regular email address';
  end if;
end;
$$;

create or replace function app.assert_active()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_banned timestamptz;
begin
  perform app.assert_real_email();
  select banned_at into v_banned from public.profile_private where id = v_uid;
  if v_banned is not null then
    raise exception 'This account is suspended';
  end if;
end;
$$;

create or replace function app.event_category(p_event text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_event in ('join_request', 'request_approved', 'request_declined') then 'requests'
    when p_event in ('game_locked', 'booking_reminder', 'game_booked') then 'booking'
    when p_event in ('attendance_reminder', 'fill_deadline', 'pre_game', 'waitlist_promoted', 'waitlist_offer') then 'reminders'
    when p_event = 'rate_game' then 'ratings'
    else 'matches'
  end;
$$;

create or replace function app.in_quiet_hours(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start time;
  v_end time;
  v_local time := (now() at time zone 'Africa/Johannesburg')::time;
begin
  select quiet_start, quiet_end into v_start, v_end from public.profile_private where id = p_user;
  if v_start is null or v_end is null or v_start = v_end then
    return false;
  end if;
  if v_start < v_end then
    return v_local >= v_start and v_local < v_end;
  end if;
  return v_local >= v_start or v_local < v_end;
end;
$$;

create or replace function app.wants_notification(p_user uuid, p_event text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prefs jsonb;
  v_flag text;
begin
  select notif_prefs into v_prefs from public.profile_private where id = p_user;
  v_flag := coalesce(v_prefs, '{}'::jsonb) ->> app.event_category(p_event);
  return v_flag is distinct from 'false';
end;
$$;

create or replace function app.notify(p_user uuid, p_type public.notification_type, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text := coalesce(p_payload ->> 'event', p_type::text);
  v_quiet boolean;
begin
  if p_user is null then
    return;
  end if;
  if not app.wants_notification(p_user, v_event) then
    return;
  end if;
  v_quiet := app.in_quiet_hours(p_user);
  insert into public.notifications (user_id, type, event, payload, push_sent_at)
  values (
    p_user,
    p_type,
    v_event,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('event', v_event),
    case when v_quiet then now() else null end
  );
  if v_event in ('game_cancelled', 'game_locked', 'booking_reminder', 'game_booked', 'fill_deadline') then
    insert into public.email_outbox (user_id, event, subject, body)
    values (
      p_user,
      v_event,
      'Find Your 4th',
      coalesce(p_payload ->> 'message', v_event)
    );
  end if;
end;
$$;

create or replace function app.notify_members(
  p_match uuid,
  p_type public.notification_type,
  p_payload jsonb,
  p_skip uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select s.player_id
    from public.match_slots s
    where s.match_id = p_match
      and s.player_id is not null
      and s.status in ('joined', 'confirmed')
      and s.player_id is distinct from p_skip
  loop
    perform app.notify(v_user, p_type, p_payload);
  end loop;
end;
$$;

create or replace function app.track(p_name text, p_props jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.analytics_events (user_id, name, props)
  values (auth.uid(), p_name, coalesce(p_props, '{}'::jsonb));
$$;

create or replace function app.log_event(p_match uuid, p_kind text, p_body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.game_events (match_id, kind, body) values (p_match, p_kind, p_body);
$$;

create or replace function app.overlaps_game(p_player uuid, p_start timestamptz, p_minutes integer, p_except uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.match_slots s
    join public.matches m on m.id = s.match_id
    where s.player_id = p_player
      and s.status in ('joined', 'confirmed')
      and m.status in ('open', 'full')
      and m.id is distinct from p_except
      and tstzrange(m.starts_at, m.starts_at + make_interval(mins => m.duration_minutes), '[)')
        && tstzrange(p_start, p_start + make_interval(mins => p_minutes), '[)')
  );
$$;

create or replace function app.blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

create or replace function app.promote_waitlist(p_match uuid)
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
  if exists (
    select 1 from public.waitlist_offers
    where match_id = p_match and status = 'open' and expires_at > now()
  ) then
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
  insert into public.waitlist_offers (match_id, player_id, slot_id, expires_at)
  values (p_match, v_player, v_slot, now() + interval '30 minutes');
  perform app.notify(
    v_player,
    'waitlist_promoted',
    jsonb_build_object('event', 'waitlist_offer', 'match_id', p_match, 'message', 'A spot is yours for 30 minutes')
  );
end;
$$;

create or replace function app.broadcast_wave(p_match uuid, p_wave integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_player uuid;
  v_sent integer := 0;
  v_wide boolean;
begin
  if not exists (select 1 from public.feature_flags where key = 'broadcast' and enabled) then
    return;
  end if;

  select * into v_match from public.matches where id = p_match;
  if v_match.id is null or v_match.status <> 'open' then
    return;
  end if;
  v_wide := p_wave >= 2 or v_match.open_spots >= 2;

  for v_player in
    select p.id
    from public.profiles p
    join public.profile_private priv on priv.id = p.id
    where p.id <> v_match.host_id
      and priv.banned_at is null
      and p.level_score is not null
      and p.level_score between v_match.level_min and v_match.level_max
      and not app.blocked_pair(p.id, v_match.host_id)
      and not app.overlaps_game(p.id, v_match.starts_at, v_match.duration_minutes, v_match.id)
      and (
        (v_match.gender_label = 'women' and priv.gender = 'woman')
        or (v_match.gender_label = 'men' and priv.gender = 'man')
        or v_match.gender_label in ('open', 'mixed')
      )
      and not exists (
        select 1 from public.broadcast_sends b
        where b.match_id = p_match and b.user_id = p.id
      )
      and (
        select count(*) from public.notifications n
        where n.user_id = p.id and n.event = 'new_match' and n.created_at > now() - interval '1 day'
      ) < 5
      and (
        exists (
          select 1
          from public.profile_clubs pc
          join public.match_clubs mc on mc.club_id = pc.club_id
          where pc.profile_id = p.id and mc.match_id = p_match
        )
        or (
          v_wide and exists (
            select 1
            from public.profile_clubs pc
            join public.clubs home on home.id = pc.club_id
            join public.match_clubs mc on mc.match_id = p_match
            join public.clubs game on game.id = mc.club_id
            where pc.profile_id = p.id and home.city = game.city
          )
        )
      )
    limit 40
  loop
    insert into public.broadcast_sends (match_id, user_id, wave) values (p_match, v_player, p_wave);
    perform app.notify(
      v_player,
      'new_match',
      jsonb_build_object('event', 'new_match', 'match_id', p_match, 'message', 'A game near you needs players')
    );
    v_sent := v_sent + 1;
  end loop;

  update public.matches set broadcast_wave = p_wave where id = p_match;
end;
$$;

create or replace function app.lock_if_full()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'full' and old.status is distinct from 'full' and new.booking_status = 'unbooked' and new.locked_at is null then
    new.locked_at := now();
    new.booker_id := coalesce(new.booker_id, new.host_id);
    new.booking_deadline := now() + interval '3 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists matches_lock on public.matches;
create trigger matches_lock before update of status on public.matches
for each row execute function app.lock_if_full();

create or replace function app.after_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.locked_at is not null and old.locked_at is null then
    perform app.log_event(new.id, 'locked', 'Four players are in. Someone needs to book the court.');
    perform app.notify_members(
      new.id,
      'game_locked',
      jsonb_build_object('event', 'game_locked', 'match_id', new.id, 'message', 'The game is locked. Book the court.'),
      null
    );
    perform app.track('game_locked', jsonb_build_object('match_id', new.id));
  end if;
  return null;
end;
$$;

drop trigger if exists matches_after_lock on public.matches;
create trigger matches_after_lock after update of locked_at on public.matches
for each row execute function app.after_lock();

create or replace function app.post_game(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_mode text := p ->> 'mode';
  v_score integer;
  v_min integer := (p ->> 'level_min')::integer;
  v_max integer := (p ->> 'level_max')::integer;
  v_open integer := (p ->> 'open_spots')::integer;
  v_minutes integer := coalesce((p ->> 'duration_minutes')::integer, 90);
  v_starts timestamptz := (p ->> 'starts_at')::timestamptz;
  v_ends timestamptz := nullif(p ->> 'ends_at', '')::timestamptz;
  v_gender public.gender_label := coalesce((p ->> 'gender')::public.gender_label, 'open');
  v_clubs text[];
  v_guests text[];
  v_hosted integer;
  v_created timestamptz;
  v_priv public.profile_private%rowtype;
  v_id uuid;
  v_deadline timestamptz;
  v_fill timestamptz;
  v_invite uuid;
begin
  perform app.assert_active();
  select * into v_priv from public.profile_private where id = v_uid;
  select level_score into v_score from public.profiles where id = v_uid;
  if v_score is null or v_priv.age_confirmed is not true or v_priv.terms_accepted_at is null then
    raise exception 'Finish your profile before posting a game';
  end if;
  if v_mode not in ('court', 'proposal') then
    raise exception 'Choose how you are posting';
  end if;
  if v_open < 1 or v_open > 3 then
    raise exception 'Open spots must be 1, 2, or 3';
  end if;
  if v_min < 0 or v_max > 7 or v_min > v_max then
    raise exception 'Level range must sit between 0 and 7';
  end if;
  if v_minutes < 60 or v_minutes > 180 then
    raise exception 'Duration looks wrong';
  end if;
  perform app.assert_clean(p ->> 'note');

  select coalesce(array_agg(value), '{}') into v_clubs
  from jsonb_array_elements_text(coalesce(p -> 'club_ids', '[]'::jsonb));
  select coalesce(array_agg(value), '{}') into v_guests
  from jsonb_array_elements_text(coalesce(p -> 'guest_names', '[]'::jsonb));

  if v_mode = 'court' and coalesce(array_length(v_clubs, 1), 0) <> 1 then
    raise exception 'A booked court is one club';
  end if;
  if v_mode = 'proposal' and coalesce(array_length(v_clubs, 1), 0) not between 1 and 3 then
    raise exception 'Propose 1 to 3 clubs';
  end if;
  if v_mode = 'proposal' and (v_ends is null or v_ends < v_starts + interval '2 hours') then
    raise exception 'A proposal needs a time window of at least 2 hours';
  end if;
  if coalesce(array_length(v_guests, 1), 0) <> 3 - v_open then
    raise exception 'Guest names have to match the spots you already filled';
  end if;
  if v_gender = 'women' and v_priv.gender is distinct from 'woman' then
    raise exception 'Women-only games are posted by players who set their gender to woman';
  end if;
  if v_gender = 'men' and v_priv.gender is distinct from 'man' then
    raise exception 'Men-only games are posted by players who set their gender to man';
  end if;
  if app.overlaps_game(v_uid, v_starts, v_minutes, null) then
    raise exception 'You already have a game at that time';
  end if;

  select created_at into v_created from public.profiles where id = v_uid;
  select count(*) into v_hosted
  from public.matches
  where host_id = v_uid and status in ('open', 'full') and starts_at > now();
  if v_hosted >= case when now() - v_created < interval '3 days' then 1 else 3 end then
    raise exception 'You have reached the limit for active games you host';
  end if;

  v_fill := coalesce(nullif(p ->> 'fill_deadline', '')::timestamptz, v_starts - interval '4 hours');
  v_deadline := least(v_fill, v_starts - interval '1 hour');
  if v_deadline <= now() then
    v_deadline := least(now() + interval '30 minutes', v_starts - interval '1 hour');
  end if;

  v_id := app.create_match(
    v_starts,
    app.score_to_level(((v_min + v_max) / 2)),
    'casual',
    case when v_mode = 'court' then 'booked'::public.court_status else 'not_booked'::public.court_status end,
    p ->> 'note',
    v_gender,
    null,
    v_deadline,
    v_guests,
    v_clubs
  );

  update public.matches set
    mode = v_mode,
    ends_at = case when v_mode = 'proposal' then v_ends else v_starts + make_interval(mins => v_minutes) end,
    duration_minutes = v_minutes,
    court_number = nullif(p ->> 'court_number', ''),
    open_spots = v_open,
    level_min = v_min,
    level_max = v_max,
    join_mode = coalesce(nullif(p ->> 'join_mode', ''), 'instant'),
    cost_cents = nullif(p ->> 'cost_cents', '')::integer,
    booking_url = nullif(p ->> 'booking_url', ''),
    fill_deadline = v_fill,
    first_timer = coalesce((p ->> 'first_timer')::boolean, false),
    racket_available = coalesce((p ->> 'racket_available')::boolean, false),
    booking_status = case when v_mode = 'court' then 'booked' else 'unbooked' end,
    booking_details = nullif(p ->> 'booking_details', '')
  where id = v_id;

  perform app.log_event(v_id, 'posted', case when v_mode = 'court' then 'Court is already held' else 'Looking for a court once four players confirm' end);
  perform app.track('game_posted', jsonb_build_object('match_id', v_id, 'mode', v_mode));
  perform app.broadcast_wave(v_id, 1);
  if nullif(p ->> 'reinvite_from', '') is not null then
    for v_invite in
      select s.player_id from public.match_slots s
      where s.match_id = (p ->> 'reinvite_from')::uuid
        and s.player_id is not null
        and s.player_id <> v_uid
    loop
      perform app.notify(
        v_invite,
        'new_match',
        jsonb_build_object('event', 'new_match', 'match_id', v_id, 'message', 'You are invited to a rematch')
      );
    end loop;
  end if;
  return v_id;
end;
$$;

create or replace function app.join_or_request(p_match uuid, p_ack boolean, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_match public.matches%rowtype;
  v_score integer;
  v_gender text;
  v_open integer;
  v_pending integer;
  v_slot uuid;
  v_in_range boolean;
  v_needs boolean;
begin
  perform app.assert_active();
  perform app.assert_clean(p_note);
  select * into v_match from public.matches where id = p_match for update;
  if not found then
    raise exception 'Game not found';
  end if;
  if v_match.status <> 'open' then
    raise exception 'This game is not open';
  end if;
  if v_match.starts_at <= now() then
    raise exception 'This game has already started';
  end if;
  if v_match.host_id = v_uid then
    raise exception 'You are hosting this game';
  end if;

  select level_score into v_score from public.profiles where id = v_uid;
  select gender into v_gender from public.profile_private where id = v_uid;
  if v_score is null then
    raise exception 'Finish your profile before joining a game';
  end if;
  if v_match.gender_label = 'women' and v_gender is distinct from 'woman' then
    raise exception 'This game is for women';
  end if;
  if v_match.gender_label = 'men' and v_gender is distinct from 'man' then
    raise exception 'This game is for men';
  end if;
  if app.blocked_pair(v_uid, v_match.host_id) then
    raise exception 'You cannot join this game';
  end if;
  if app.overlaps_game(v_uid, v_match.starts_at, v_match.duration_minutes, p_match) then
    raise exception 'You already have a game at that time';
  end if;
  if exists (
    select 1 from public.match_slots
    where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed')
  ) then
    raise exception 'You are already in this game';
  end if;

  v_in_range := v_score between v_match.level_min and v_match.level_max;
  if not v_in_range and p_ack is not true then
    raise exception 'This game is outside your level. Confirm to request anyway';
  end if;

  select count(*) into v_open from public.match_slots where match_id = p_match and status = 'open';
  v_needs := v_match.join_mode = 'request' or v_open >= 2 or not v_in_range;

  if v_needs then
    select count(*) into v_pending
    from public.join_requests
    where player_id = v_uid and status = 'pending';
    if v_pending >= 5 then
      raise exception 'You already have 5 pending requests';
    end if;
    insert into public.join_requests (match_id, player_id, note)
    values (p_match, v_uid, nullif(btrim(coalesce(p_note, '')), ''))
    on conflict (match_id, player_id) do update
      set status = 'pending', note = excluded.note, created_at = now();
    perform app.notify(
      v_match.host_id,
      'join_request',
      jsonb_build_object('event', 'join_request', 'match_id', p_match, 'message', 'Someone wants to join your game')
    );
    perform app.track('join_requested', jsonb_build_object('match_id', p_match));
    return 'requested';
  end if;

  delete from public.match_waitlist where match_id = p_match and player_id = v_uid;
  select id into v_slot
  from public.match_slots
  where match_id = p_match
    and status = 'open'
    and not exists (
      select 1 from public.waitlist_offers o
      where o.slot_id = match_slots.id and o.status = 'open' and o.expires_at > now()
    )
  order by slot_index
  limit 1
  for update;

  if v_slot is null then
    raise exception 'This game is full';
  end if;

  update public.match_slots
  set status = 'joined', kind = 'member', player_id = v_uid, joined_at = now()
  where id = v_slot;
  update public.join_requests set status = 'withdrawn' where match_id = p_match and player_id = v_uid and status = 'pending';
  perform app.refresh_match_status(p_match);
  perform app.notify(
    v_match.host_id,
    'player_update',
    jsonb_build_object('event', 'player_joined', 'match_id', p_match, 'message', 'A player joined your game')
  );
  perform app.log_event(p_match, 'joined', 'A player joined');
  perform app.track('player_joined', jsonb_build_object('match_id', p_match));
  return 'joined';
end;
$$;

create or replace function app.join_match(p_match uuid, p_ack boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.join_or_request(p_match, p_ack, null);
end;
$$;

create or replace function app.review_request(p_request uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_req public.join_requests%rowtype;
  v_match public.matches%rowtype;
  v_slot uuid;
begin
  select * into v_req from public.join_requests where id = p_request for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'That request is no longer open';
  end if;
  select * into v_match from public.matches where id = v_req.match_id for update;
  if v_match.host_id <> v_uid then
    raise exception 'Only the host can review requests';
  end if;
  if not p_approve then
    update public.join_requests set status = 'declined' where id = p_request;
    perform app.notify(v_req.player_id, 'request_decided', jsonb_build_object('event', 'request_declined', 'match_id', v_match.id, 'message', 'The host declined the request'));
    return;
  end if;
  if v_match.status <> 'open' then
    raise exception 'This game is not open';
  end if;
  select id into v_slot
  from public.match_slots
  where match_id = v_match.id and status = 'open'
  order by slot_index
  limit 1
  for update;
  if v_slot is null then
    raise exception 'This game is full';
  end if;
  update public.match_slots
  set status = 'joined', kind = 'member', player_id = v_req.player_id, joined_at = now()
  where id = v_slot;
  update public.join_requests set status = 'approved' where id = p_request;
  perform app.refresh_match_status(v_match.id);
  perform app.notify(v_req.player_id, 'request_decided', jsonb_build_object('event', 'request_approved', 'match_id', v_match.id, 'message', 'You are in'));
  perform app.log_event(v_match.id, 'approved', 'The host approved a player');
end;
$$;

create or replace function app.leave_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
  v_starts timestamptz;
  v_free timestamptz;
  v_slot uuid;
  v_reason public.release_reason;
  v_record boolean := false;
begin
  select host_id, starts_at, withdrawal_free_until into v_host, v_starts, v_free
  from public.matches where id = p_match for update;
  if not found then
    raise exception 'Game not found';
  end if;
  if v_host = v_uid then
    raise exception 'Cancel the game if you can no longer play';
  end if;
  select id into v_slot
  from public.match_slots
  where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed')
  for update;
  if v_slot is null then
    raise exception 'You are not in this game';
  end if;

  if v_free is not null and now() < v_free then
    v_reason := 'cancelled_early';
  elsif v_starts - now() > interval '24 hours' then
    v_reason := 'cancelled_early';
  elsif v_starts - now() > interval '3 hours' then
    v_reason := 'cancelled_late';
    v_record := true;
  else
    v_reason := 'no_show';
    v_record := true;
  end if;

  perform app.release_playing_slot(p_match, v_slot, v_uid, v_reason, v_record, v_uid, true);
  perform app.notify_members(
    p_match,
    'player_update',
    jsonb_build_object('event', 'player_withdrew', 'match_id', p_match, 'message', 'A player left the game'),
    v_uid
  );
  perform app.log_event(p_match, 'withdrew', 'A player left');
end;
$$;

create or replace function app.accept_offer(p_offer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_offer public.waitlist_offers%rowtype;
begin
  select * into v_offer from public.waitlist_offers where id = p_offer for update;
  if not found or v_offer.player_id <> v_uid or v_offer.status <> 'open' then
    raise exception 'That offer is not yours';
  end if;
  if v_offer.expires_at <= now() then
    update public.waitlist_offers set status = 'expired' where id = p_offer;
    raise exception 'That offer expired';
  end if;
  update public.match_slots
  set status = 'joined', kind = 'member', player_id = v_uid, joined_at = now()
  where id = v_offer.slot_id and status = 'open';
  if not found then
    raise exception 'That spot has gone';
  end if;
  update public.waitlist_offers set status = 'accepted' where id = p_offer;
  perform app.refresh_match_status(v_offer.match_id);
end;
$$;

create or replace function app.edit_game(p_match uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
begin
  perform app.assert_clean(p ->> 'note');
  select host_id into v_host from public.matches where id = p_match for update;
  if v_host is distinct from v_uid then
    raise exception 'Only the host can edit this game';
  end if;
  update public.matches set
    note = coalesce(p ->> 'note', note),
    cost_cents = coalesce(nullif(p ->> 'cost_cents', '')::integer, cost_cents),
    starts_at = coalesce(nullif(p ->> 'starts_at', '')::timestamptz, starts_at),
    withdrawal_free_until = now() + interval '2 hours'
  where id = p_match;
  perform app.notify_members(
    p_match,
    'game_changed',
    jsonb_build_object('event', 'game_changed', 'match_id', p_match, 'message', 'The host changed the game. You can leave without a penalty for 2 hours.'),
    v_uid
  );
  perform app.log_event(p_match, 'edited', 'The host changed the game');
end;
$$;

create or replace function app.rebroadcast(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_host uuid;
  v_used boolean;
  v_wave integer;
begin
  select host_id, rebroadcast_used, broadcast_wave into v_host, v_used, v_wave
  from public.matches where id = p_match for update;
  if v_host is distinct from v_uid then
    raise exception 'Only the host can send this again';
  end if;
  if v_used then
    raise exception 'You already used the extra send';
  end if;
  update public.matches set rebroadcast_used = true where id = p_match;
  perform app.broadcast_wave(p_match, v_wave + 1);
end;
$$;

create or replace function app.claim_booker(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  if not exists (
    select 1 from public.match_slots
    where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed')
  ) and not exists (
    select 1 from public.matches where id = p_match and host_id = v_uid
  ) then
    raise exception 'Only a player in the game can book it';
  end if;
  update public.matches
  set booker_id = v_uid
  where id = p_match and booking_status = 'unbooked';
  perform app.log_event(p_match, 'booker', 'A player will book the court');
end;
$$;

create or replace function app.mark_booked(p_match uuid, p_status text, p_url text, p_details text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_booker uuid;
begin
  if p_status not in ('booked', 'booked_elsewhere') then
    raise exception 'Say where it was booked';
  end if;
  select booker_id into v_booker from public.matches where id = p_match for update;
  if v_booker is distinct from v_uid then
    raise exception 'The booker marks the court';
  end if;
  update public.matches set
    booking_status = p_status,
    booking_url = nullif(btrim(coalesce(p_url, '')), ''),
    booking_details = nullif(btrim(coalesce(p_details, '')), ''),
    booking_deadline = null,
    court_status = 'booked'
  where id = p_match;
  perform app.notify_members(
    p_match,
    'game_booked',
    jsonb_build_object('event', 'game_booked', 'match_id', p_match, 'message', 'The court is booked'),
    null
  );
  perform app.log_event(p_match, 'booked', 'The court is booked');
  perform app.track('game_booked', jsonb_build_object('match_id', p_match));
end;
$$;

create or replace function app.booking_details(p_match uuid)
returns text
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
  if not exists (
    select 1 from public.matches m
    where m.id = p_match and (
      m.host_id = v_uid or exists (
        select 1 from public.match_slots s
        where s.match_id = m.id and s.player_id = v_uid and s.status in ('joined', 'confirmed')
      )
    )
  ) then
    return null;
  end if;
  return (select booking_details from public.matches where id = p_match);
end;
$$;

create or replace function app.send_message(p_match uuid, p_body text)
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
  if not exists (select 1 from public.feature_flags where key = 'chat' and enabled) then
    raise exception 'Chat is off';
  end if;
  perform app.assert_clean(p_body);
  if char_length(btrim(coalesce(p_body, ''))) < 1 then
    raise exception 'Write a message';
  end if;
  select status, starts_at into v_status, v_starts from public.matches where id = p_match;
  if v_status in ('completed', 'cancelled') or v_starts < now() - interval '6 hours' then
    raise exception 'This chat is archived';
  end if;
  if not exists (
    select 1 from public.matches where id = p_match and host_id = v_uid
  ) and not exists (
    select 1 from public.match_slots
    where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed')
  ) then
    raise exception 'Chat is for the host and confirmed players';
  end if;
  insert into public.match_messages (match_id, author_id, body) values (p_match, v_uid, btrim(p_body));
end;
$$;

create or replace function app.confirmed_contacts(p_match uuid)
returns table (player_id uuid, display_name text, whatsapp text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  if not exists (
    select 1 from public.matches m
    where m.id = p_match and (
      m.host_id = v_uid or exists (
        select 1 from public.match_slots s
        where s.match_id = m.id and s.player_id = v_uid and s.status in ('joined', 'confirmed')
      )
    )
  ) then
    return;
  end if;
  return query
  select p.id, p.display_name, priv.whatsapp
  from public.match_slots s
  join public.profiles p on p.id = s.player_id
  join public.profile_private priv on priv.id = p.id
  where s.match_id = p_match
    and s.status in ('joined', 'confirmed')
    and priv.whatsapp_share
    and priv.whatsapp is not null;
end;
$$;

create or replace function app.block_player(p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  if p_player = v_uid then
    raise exception 'You cannot block yourself';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_player)
  on conflict do nothing;
end;
$$;

create or replace function app.unblock_player(p_player uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_player;
$$;

create or replace function app.save_search(p_filters jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  if not exists (select 1 from public.feature_flags where key = 'saved_searches' and enabled) then
    raise exception 'Saved searches are off';
  end if;
  insert into public.saved_searches (user_id, filters) values (v_uid, coalesce(p_filters, '{}'::jsonb));
end;
$$;

create or replace function app.suggest_club(p_name text, p_city text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  insert into public.club_suggestions (user_id, name, city, note)
  values (v_uid, btrim(p_name), btrim(p_city), nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;

create or replace function app.confirm_played(p_match uuid, p_played boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_starts timestamptz;
  v_slot uuid;
begin
  select starts_at into v_starts from public.matches where id = p_match;
  if v_starts > now() then
    raise exception 'The game has not started';
  end if;
  select id into v_slot
  from public.match_slots
  where match_id = p_match and player_id = v_uid and status in ('joined', 'confirmed');
  if v_slot is null then
    raise exception 'You were not in this game';
  end if;
  if exists (select 1 from public.attendance_outcomes where match_id = p_match and player_id = v_uid) then
    return;
  end if;
  perform app.record_outcome(p_match, v_uid, v_slot, case when p_played then 'show_up' else 'no_show' end);
end;
$$;

create or replace function app.submit_feedback(p_match uuid, p_ratee uuid, p_level_fit integer, p_play_again boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.submit_rating(p_match, p_ratee, p_level_fit, p_play_again);
  update public.match_ratings
  set level_fit = p_level_fit
  where match_id = p_match and rater_id = auth.uid() and ratee_id = p_ratee;
end;
$$;

create or replace function app.player_card(p_player uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_avatar text;
  v_score integer;
  v_since timestamptz;
  v_games integer;
  v_fit numeric;
  v_fit_n integer;
  v_show integer;
  v_miss integer;
begin
  select display_name, avatar_url, level_score, created_at
  into v_name, v_avatar, v_score, v_since
  from public.profiles where id = p_player;
  if v_name is null then
    return null;
  end if;
  select count(distinct s.match_id) into v_games
  from public.match_slots s
  where s.player_id = p_player and s.status in ('joined', 'confirmed');
  select count(*), avg(level_fit) into v_fit_n, v_fit
  from public.match_ratings where ratee_id = p_player and level_fit is not null;
  select
    count(*) filter (where outcome = 'show_up'),
    count(*) filter (where outcome in ('late_cancel', 'no_response', 'no_show'))
  into v_show, v_miss
  from public.attendance_outcomes where player_id = p_player;

  return jsonb_build_object(
    'id', p_player,
    'display_name', v_name,
    'avatar_url', v_avatar,
    'level_score', v_score,
    'level_source', case when v_fit_n >= 5 then 'community' else 'self' end,
    'community_level', case when v_fit_n >= 5 then round(v_fit) else null end,
    'games_played', v_games,
    'member_since', v_since,
    'show_ups', v_show,
    'misses', v_miss,
    'badges', (
      select coalesce(jsonb_agg(badge), '[]'::jsonb)
      from (
        select 'first_game' as badge where v_games >= 1
        union all select 'five_games' where v_games >= 5
        union all select 'reliable' where (v_show + v_miss) >= 3 and v_show::numeric / nullif(v_show + v_miss, 0) >= 0.8
      ) badges
    )
  );
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
  v_score integer := (p ->> 'level_score')::integer;
  v_clubs text[];
  v_club text;
begin
  perform app.assert_real_email();
  if v_score < 0 or v_score > 7 then
    raise exception 'Level must be from 0 to 7';
  end if;
  if coalesce((p ->> 'age_confirmed')::boolean, false) is not true then
    raise exception 'Confirm you are 18 or older';
  end if;
  if coalesce((p ->> 'accept_terms')::boolean, false) is not true
     and not exists (select 1 from public.profile_private where id = v_uid and terms_accepted_at is not null) then
    raise exception 'Accept the terms to continue';
  end if;
  perform app.assert_clean(p ->> 'display_name');
  update public.profiles set
    display_name = left(btrim(p ->> 'display_name'), 40),
    level_score = v_score,
    level = app.score_to_level(v_score),
    avatar_url = nullif(p ->> 'avatar_url', ''),
    home_club_id = null
  where id = v_uid;

  update public.profile_private set
    gender = nullif(p ->> 'gender', ''),
    playtomic_url = nullif(p ->> 'playtomic_url', ''),
    search_radius_km = coalesce((p ->> 'search_radius_km')::integer, 15),
    age_confirmed = true,
    terms_accepted_at = coalesce(terms_accepted_at, now()),
    whatsapp = nullif(p ->> 'whatsapp', ''),
    whatsapp_share = coalesce((p ->> 'whatsapp_share')::boolean, false),
    quiet_start = nullif(p ->> 'quiet_start', '')::time,
    quiet_end = nullif(p ->> 'quiet_end', '')::time,
    notif_prefs = coalesce(p -> 'notif_prefs', '{}'::jsonb),
    fantasy_opt_in = coalesce((p ->> 'fantasy_opt_in')::boolean, false)
  where id = v_uid;

  select coalesce(array_agg(value), '{}') into v_clubs
  from jsonb_array_elements_text(coalesce(p -> 'club_ids', '[]'::jsonb));
  if coalesce(array_length(v_clubs, 1), 0) > 3 then
    raise exception 'Pick at most 3 home clubs';
  end if;
  delete from public.profile_clubs where profile_id = v_uid;
  foreach v_club in array v_clubs loop
    insert into public.profile_clubs (profile_id, club_id) values (v_uid, v_club);
  end loop;
  update public.profiles set home_club_id = v_clubs[1] where id = v_uid and coalesce(array_length(v_clubs, 1), 0) >= 1;
end;
$$;

create or replace function app.export_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  return jsonb_build_object(
    'account', app.my_account(),
    'games', (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.matches where host_id = v_uid),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('event', event, 'at', created_at)), '[]'::jsonb) from public.notifications where user_id = v_uid)
  );
end;
$$;

create or replace function app.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  delete from public.matches where host_id = v_uid;
  update public.match_slots set player_id = null where player_id = v_uid;
  delete from public.match_waitlist where player_id = v_uid;
  delete from public.attendance_outcomes where player_id = v_uid;
  delete from public.match_ratings where rater_id = v_uid or ratee_id = v_uid;
  delete from public.player_reports where reporter_id = v_uid or reported_id = v_uid;
  delete from public.join_requests where player_id = v_uid;
  delete from public.blocks where blocker_id = v_uid or blocked_id = v_uid;
  delete from public.match_messages where author_id = v_uid;
  delete from public.waitlist_offers where player_id = v_uid;
  delete from public.saved_searches where user_id = v_uid;
  delete from public.club_suggestions where user_id = v_uid;
  delete from public.broadcast_sends where user_id = v_uid;
  update public.matches set booker_id = null where booker_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

create or replace function app.assert_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  if not exists (select 1 from public.profile_private where id = v_uid and is_admin) then
    raise exception 'Not allowed';
  end if;
  return v_uid;
end;
$$;

create or replace function app.admin_suspend(p_user uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.assert_admin();
begin
  update public.profile_private set banned_at = case when p_on then now() else null end where id = p_user;
  insert into public.audit_log (actor_id, action, subject) values (v_uid, case when p_on then 'suspend' else 'restore' end, p_user::text);
end;
$$;

create or replace function app.admin_takedown(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.assert_admin();
begin
  update public.matches set status = 'cancelled' where id = p_match and status in ('open', 'full');
  perform app.notify_members(
    p_match,
    'game_cancelled',
    jsonb_build_object('event', 'game_cancelled', 'match_id', p_match, 'message', 'This game was removed'),
    null
  );
  insert into public.audit_log (actor_id, action, subject) values (v_uid, 'takedown', p_match::text);
end;
$$;

create or replace function app.admin_resolve_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.assert_admin();
begin
  update public.player_reports set status = 'resolved', resolved_at = now() where id = p_report;
  insert into public.audit_log (actor_id, action, subject) values (v_uid, 'resolve_report', p_report::text);
end;
$$;

create or replace function app.admin_broadcast(p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.assert_admin();
  v_user uuid;
begin
  for v_user in select id from public.profiles loop
    perform app.notify(v_user, 'game_changed', jsonb_build_object('event', 'game_changed', 'message', left(p_message, 280)));
  end loop;
  insert into public.audit_log (actor_id, action, subject) values (v_uid, 'broadcast', left(p_message, 80));
end;
$$;

create or replace function app.admin_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.assert_admin();
  return jsonb_build_object(
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'note', note, 'status', status, 'created_at', created_at))
      from public.player_reports where status = 'open'
    ), '[]'::jsonb),
    'suggestions', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'city', city, 'note', note))
      from public.club_suggestions
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object('action', action, 'subject', subject, 'created_at', created_at) order by created_at desc)
      from (select * from public.audit_log order by created_at desc limit 30) a
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function app.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_posted integer;
  v_filled integer;
  v_booked integer;
  v_locked integer;
  v_show integer;
  v_resolved integer;
begin
  perform app.assert_admin();
  select count(*) into v_posted from public.matches where status <> 'cancelled';
  select count(*) into v_filled from public.matches where status in ('full', 'completed') or locked_at is not null;
  select count(*) into v_locked from public.matches where locked_at is not null;
  select count(*) into v_booked from public.matches where booking_status in ('booked', 'booked_elsewhere') and locked_at is not null;
  select count(*) filter (where outcome = 'show_up'), count(*) into v_show, v_resolved from public.attendance_outcomes;
  return jsonb_build_object(
    'posted', v_posted,
    'fill_rate', case when v_posted = 0 then null else round(v_filled::numeric / v_posted, 2) end,
    'lock_to_booked', case when v_locked = 0 then null else round(v_booked::numeric / v_locked, 2) end,
    'show_up_rate', case when v_resolved = 0 then null else round(v_show::numeric / v_resolved, 2) end,
    'repeat_players', (
      select count(*) from (
        select player_id from public.match_slots
        where player_id is not null and status in ('joined', 'confirmed')
        group by player_id having count(distinct match_id) >= 2
      ) repeats
    )
  );
end;
$$;

create or replace function app.run_mvp_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  update public.waitlist_offers set status = 'expired'
  where status = 'open' and expires_at <= now();

  for r in
    select distinct match_id from public.waitlist_offers
    where status = 'expired' and expires_at > now() - interval '2 minutes'
  loop
    perform app.promote_waitlist(r.match_id);
  end loop;

  for r in
    select id, booker_id, booking_misses from public.matches
    where booking_status = 'unbooked' and booking_deadline is not null and booking_deadline <= now() and status = 'full'
  loop
    update public.matches set
      booking_misses = booking_misses + 1,
      booking_deadline = case when booking_misses + 1 >= 2 then null else now() + interval '2 hours' end,
      booker_id = host_id
    where id = r.id;
    perform app.notify(
      r.booker_id,
      'booking_reminder',
      jsonb_build_object('event', 'booking_reminder', 'match_id', r.id, 'message', 'The booking window was missed')
    );
  end loop;

  for r in
    select id from public.matches
    where status = 'open' and fill_deadline is not null and fill_deadline <= now() and fill_prompt_sent_at is null
  loop
    update public.matches set fill_prompt_sent_at = now() where id = r.id;
    perform app.notify_members(
      r.id,
      'fill_deadline',
      jsonb_build_object('event', 'fill_deadline', 'match_id', r.id, 'message', 'Keep the court or release it?'),
      null
    );
  end loop;

  for r in
    select id from public.matches
    where status in ('open', 'full') and starts_at between now() and now() + interval '2 hours' and pre_game_sent_at is null
  loop
    update public.matches set pre_game_sent_at = now() where id = r.id;
    perform app.notify_members(
      r.id,
      'pre_game',
      jsonb_build_object('event', 'pre_game', 'match_id', r.id, 'message', 'Your game starts soon'),
      null
    );
  end loop;

  for r in
    select id, booker_id from public.matches
    where booking_status = 'unbooked' and booking_deadline is not null
      and booking_deadline between now() and now() + interval '45 minutes'
      and booking_nudge_at is null
      and status = 'full'
  loop
    update public.matches set booking_nudge_at = now() where id = r.id;
    perform app.notify(
      r.booker_id,
      'booking_reminder',
      jsonb_build_object('event', 'booking_reminder', 'match_id', r.id, 'message', 'Book the court soon')
    );
  end loop;

  for r in
    select id from public.matches
    where status = 'completed' and rating_prompt_sent_at is null and updated_at > now() - interval '1 day'
  loop
    update public.matches set rating_prompt_sent_at = now() where id = r.id;
    perform app.notify_members(
      r.id,
      'rate_game',
      jsonb_build_object('event', 'rate_game', 'match_id', r.id, 'message', 'Did you play? Rate the group.'),
      null
    );
  end loop;

  for r in
    select id from public.matches
    where status = 'open' and broadcast_wave = 1 and created_at < now() - interval '30 minutes'
  loop
    perform app.broadcast_wave(r.id, 2);
  end loop;
end;
$$;

create or replace function app.club_leaderboard()
returns table (club_id text, club_name text, games integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, count(distinct m.id)::integer
  from public.matches m
  join public.match_clubs mc on mc.match_id = m.id
  join public.clubs c on c.id = mc.club_id
  where m.status = 'completed' and m.starts_at > now() - interval '30 days'
  group by c.id, c.name
  order by count(distinct m.id) desc
  limit 10;
$$;

set check_function_bodies = on;

create or replace function public.post_game(p jsonb)
returns uuid language plpgsql security invoker set search_path = ''
as $$ begin return app.post_game(p); end; $$;

create or replace function public.join_or_request(p_match uuid, p_ack boolean, p_note text)
returns text language plpgsql security invoker set search_path = ''
as $$ begin return app.join_or_request(p_match, p_ack, p_note); end; $$;

create or replace function public.review_request(p_request uuid, p_approve boolean)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.review_request(p_request, p_approve); end; $$;

create or replace function public.accept_offer(p_offer uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.accept_offer(p_offer); end; $$;

create or replace function public.edit_game(p_match uuid, p jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.edit_game(p_match, p); end; $$;

create or replace function public.rebroadcast(p_match uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.rebroadcast(p_match); end; $$;

create or replace function public.claim_booker(p_match uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.claim_booker(p_match); end; $$;

create or replace function public.mark_booked(p_match uuid, p_status text, p_url text, p_details text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.mark_booked(p_match, p_status, p_url, p_details); end; $$;

create or replace function public.booking_details(p_match uuid)
returns text language sql stable security invoker set search_path = ''
as $$ select app.booking_details(p_match); $$;

create or replace function public.send_message(p_match uuid, p_body text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.send_message(p_match, p_body); end; $$;

create or replace function public.confirmed_contacts(p_match uuid)
returns table (player_id uuid, display_name text, whatsapp text)
language sql stable security invoker set search_path = ''
as $$ select * from app.confirmed_contacts(p_match); $$;

create or replace function public.block_player(p_player uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.block_player(p_player); end; $$;

create or replace function public.unblock_player(p_player uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.unblock_player(p_player); end; $$;

create or replace function public.save_search(p_filters jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.save_search(p_filters); end; $$;

create or replace function public.suggest_club(p_name text, p_city text, p_note text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.suggest_club(p_name, p_city, p_note); end; $$;

create or replace function public.confirm_played(p_match uuid, p_played boolean)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.confirm_played(p_match, p_played); end; $$;

create or replace function public.submit_feedback(p_match uuid, p_ratee uuid, p_level_fit integer, p_play_again boolean)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.submit_feedback(p_match, p_ratee, p_level_fit, p_play_again); end; $$;

create or replace function public.player_card(p_player uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.player_card(p_player); $$;

create or replace function public.my_account()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.my_account(); $$;

create or replace function public.save_account(p jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.save_account(p); end; $$;

create or replace function public.export_account()
returns jsonb language sql security invoker set search_path = ''
as $$ select app.export_account(); $$;

create or replace function public.delete_account()
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.delete_account(); end; $$;

create or replace function public.admin_suspend(p_user uuid, p_on boolean)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.admin_suspend(p_user, p_on); end; $$;

create or replace function public.admin_takedown(p_match uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.admin_takedown(p_match); end; $$;

create or replace function public.admin_resolve_report(p_report uuid)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.admin_resolve_report(p_report); end; $$;

create or replace function public.admin_broadcast(p_message text)
returns void language plpgsql security invoker set search_path = ''
as $$ begin perform app.admin_broadcast(p_message); end; $$;

create or replace function public.admin_queue()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.admin_queue(); $$;

create or replace function public.admin_metrics()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select app.admin_metrics(); $$;

create or replace function public.club_leaderboard()
returns table (club_id text, club_name text, games integer)
language sql stable security invoker set search_path = ''
as $$ select * from app.club_leaderboard(); $$;

create or replace function public.run_scheduled_jobs()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  perform app.run_scheduled_jobs();
  perform app.run_mvp_jobs();
end;
$$;

revoke all on function app.post_game(jsonb) from public, anon, authenticated;
revoke all on function app.join_or_request(uuid, boolean, text) from public, anon, authenticated;
revoke all on function app.review_request(uuid, boolean) from public, anon, authenticated;
revoke all on function app.accept_offer(uuid) from public, anon, authenticated;
revoke all on function app.edit_game(uuid, jsonb) from public, anon, authenticated;
revoke all on function app.rebroadcast(uuid) from public, anon, authenticated;
revoke all on function app.claim_booker(uuid) from public, anon, authenticated;
revoke all on function app.mark_booked(uuid, text, text, text) from public, anon, authenticated;
revoke all on function app.booking_details(uuid) from public, anon, authenticated;
revoke all on function app.send_message(uuid, text) from public, anon, authenticated;
revoke all on function app.confirmed_contacts(uuid) from public, anon, authenticated;
revoke all on function app.block_player(uuid) from public, anon, authenticated;
revoke all on function app.unblock_player(uuid) from public, anon, authenticated;
revoke all on function app.save_search(jsonb) from public, anon, authenticated;
revoke all on function app.suggest_club(text, text, text) from public, anon, authenticated;
revoke all on function app.confirm_played(uuid, boolean) from public, anon, authenticated;
revoke all on function app.submit_feedback(uuid, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function app.player_card(uuid) from public, anon, authenticated;
revoke all on function app.my_account() from public, anon, authenticated;
revoke all on function app.save_account(jsonb) from public, anon, authenticated;
revoke all on function app.export_account() from public, anon, authenticated;
revoke all on function app.delete_account() from public, anon, authenticated;
revoke all on function app.admin_suspend(uuid, boolean) from public, anon, authenticated;
revoke all on function app.admin_takedown(uuid) from public, anon, authenticated;
revoke all on function app.admin_resolve_report(uuid) from public, anon, authenticated;
revoke all on function app.admin_broadcast(text) from public, anon, authenticated;
revoke all on function app.admin_queue() from public, anon, authenticated;
revoke all on function app.admin_metrics() from public, anon, authenticated;
revoke all on function app.club_leaderboard() from public, anon, authenticated;
revoke all on function app.run_mvp_jobs() from public, anon, authenticated;
revoke all on function app.broadcast_wave(uuid, integer) from public, anon, authenticated;

grant execute on function app.post_game(jsonb) to authenticated;
grant execute on function app.join_or_request(uuid, boolean, text) to authenticated;
grant execute on function app.review_request(uuid, boolean) to authenticated;
grant execute on function app.accept_offer(uuid) to authenticated;
grant execute on function app.edit_game(uuid, jsonb) to authenticated;
grant execute on function app.rebroadcast(uuid) to authenticated;
grant execute on function app.claim_booker(uuid) to authenticated;
grant execute on function app.mark_booked(uuid, text, text, text) to authenticated;
grant execute on function app.booking_details(uuid) to authenticated;
grant execute on function app.send_message(uuid, text) to authenticated;
grant execute on function app.confirmed_contacts(uuid) to authenticated;
grant execute on function app.block_player(uuid) to authenticated;
grant execute on function app.unblock_player(uuid) to authenticated;
grant execute on function app.save_search(jsonb) to authenticated;
grant execute on function app.suggest_club(text, text, text) to authenticated;
grant execute on function app.confirm_played(uuid, boolean) to authenticated;
grant execute on function app.submit_feedback(uuid, uuid, integer, boolean) to authenticated;
grant execute on function app.player_card(uuid) to anon, authenticated;
grant execute on function app.my_account() to authenticated;
grant execute on function app.save_account(jsonb) to authenticated;
grant execute on function app.export_account() to authenticated;
grant execute on function app.delete_account() to authenticated;
grant execute on function app.admin_suspend(uuid, boolean) to authenticated;
grant execute on function app.admin_takedown(uuid) to authenticated;
grant execute on function app.admin_resolve_report(uuid) to authenticated;
grant execute on function app.admin_broadcast(text) to authenticated;
grant execute on function app.admin_queue() to authenticated;
grant execute on function app.admin_metrics() to authenticated;
grant execute on function app.club_leaderboard() to anon, authenticated;
grant execute on function app.run_mvp_jobs() to service_role;

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
        'post_game', 'join_or_request', 'review_request', 'accept_offer', 'edit_game', 'rebroadcast',
        'claim_booker', 'mark_booked', 'booking_details', 'send_message', 'confirmed_contacts',
        'block_player', 'unblock_player', 'save_search', 'suggest_club', 'confirm_played',
        'submit_feedback', 'player_card', 'my_account', 'save_account', 'export_account', 'delete_account',
        'admin_suspend', 'admin_takedown', 'admin_resolve_report', 'admin_broadcast', 'admin_queue',
        'admin_metrics', 'club_leaderboard', 'run_scheduled_jobs'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.signature);
  end loop;
end $$;

grant execute on function public.post_game(jsonb) to authenticated;
grant execute on function public.join_or_request(uuid, boolean, text) to authenticated;
grant execute on function public.review_request(uuid, boolean) to authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;
grant execute on function public.edit_game(uuid, jsonb) to authenticated;
grant execute on function public.rebroadcast(uuid) to authenticated;
grant execute on function public.claim_booker(uuid) to authenticated;
grant execute on function public.mark_booked(uuid, text, text, text) to authenticated;
grant execute on function public.booking_details(uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.confirmed_contacts(uuid) to authenticated;
grant execute on function public.block_player(uuid) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;
grant execute on function public.save_search(jsonb) to authenticated;
grant execute on function public.suggest_club(text, text, text) to authenticated;
grant execute on function public.confirm_played(uuid, boolean) to authenticated;
grant execute on function public.submit_feedback(uuid, uuid, integer, boolean) to authenticated;
grant execute on function public.player_card(uuid) to anon, authenticated;
grant execute on function public.my_account() to authenticated;
grant execute on function public.save_account(jsonb) to authenticated;
grant execute on function public.export_account() to authenticated;
grant execute on function public.delete_account() to authenticated;
grant execute on function public.admin_suspend(uuid, boolean) to authenticated;
grant execute on function public.admin_takedown(uuid) to authenticated;
grant execute on function public.admin_resolve_report(uuid) to authenticated;
grant execute on function public.admin_broadcast(text) to authenticated;
grant execute on function public.admin_queue() to authenticated;
grant execute on function public.admin_metrics() to authenticated;
grant execute on function public.club_leaderboard() to anon, authenticated;
grant execute on function public.run_scheduled_jobs() to service_role;

revoke all on public.profile_private, public.profile_clubs, public.blocks, public.join_requests, public.match_messages, public.waitlist_offers, public.saved_searches, public.club_suggestions, public.analytics_events, public.feature_flags, public.email_outbox, public.game_events, public.broadcast_sends, public.audit_log, public.disposable_email_domains from anon, authenticated;

grant select (id, display_name, level, level_score, home_club_id, avatar_url, created_at, updated_at) on public.profiles to anon, authenticated;
grant update (display_name, level, level_score, home_club_id, avatar_url) on public.profiles to authenticated;
grant select (
  mode, ends_at, duration_minutes, court_number, open_spots, level_min, level_max, join_mode,
  cost_cents, booking_url, fill_deadline, first_timer, racket_available, booker_id, booking_status,
  booking_deadline, share_token, locked_at, withdrawal_free_until, broadcast_wave
) on public.matches to anon, authenticated;

grant select on public.feature_flags, public.game_events to anon, authenticated;
grant select, insert, delete on public.profile_clubs to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select on public.join_requests, public.match_messages, public.waitlist_offers, public.saved_searches, public.club_suggestions to authenticated;
grant insert on public.club_suggestions to authenticated;
grant select (
  id, gender, playtomic_url, search_radius_km, age_confirmed, terms_accepted_at, whatsapp, whatsapp_share,
  quiet_start, quiet_end, notif_prefs, fantasy_opt_in, is_admin
) on public.profile_private to authenticated;
grant update (
  gender, playtomic_url, search_radius_km, age_confirmed, terms_accepted_at, whatsapp, whatsapp_share,
  quiet_start, quiet_end, notif_prefs, fantasy_opt_in
) on public.profile_private to authenticated;

alter table public.profile_private enable row level security;
alter table public.profile_clubs enable row level security;
alter table public.blocks enable row level security;
alter table public.join_requests enable row level security;
alter table public.match_messages enable row level security;
alter table public.waitlist_offers enable row level security;
alter table public.saved_searches enable row level security;
alter table public.club_suggestions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.feature_flags enable row level security;
alter table public.email_outbox enable row level security;
alter table public.game_events enable row level security;
alter table public.broadcast_sends enable row level security;
alter table public.audit_log enable row level security;
alter table public.disposable_email_domains enable row level security;

drop policy if exists profile_private_self on public.profile_private;
create policy profile_private_self on public.profile_private for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists profile_private_update on public.profile_private;
create policy profile_private_update on public.profile_private for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists profile_clubs_self on public.profile_clubs;
create policy profile_clubs_self on public.profile_clubs for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

drop policy if exists blocks_self on public.blocks;
create policy blocks_self on public.blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

drop policy if exists requests_read on public.join_requests;
create policy requests_read on public.join_requests for select to authenticated
  using (
    player_id = (select auth.uid())
    or exists (select 1 from public.matches m where m.id = match_id and m.host_id = (select auth.uid()))
  );

drop policy if exists messages_read on public.match_messages;
create policy messages_read on public.match_messages for select to authenticated
  using (
    exists (select 1 from public.matches m where m.id = match_id and m.host_id = (select auth.uid()))
    or exists (
      select 1 from public.match_slots s
      where s.match_id = match_messages.match_id and s.player_id = (select auth.uid()) and s.status in ('joined', 'confirmed')
    )
  );

drop policy if exists offers_read on public.waitlist_offers;
create policy offers_read on public.waitlist_offers for select to authenticated
  using (
    player_id = (select auth.uid())
    or exists (select 1 from public.matches m where m.id = match_id and m.host_id = (select auth.uid()))
  );

drop policy if exists searches_self on public.saved_searches;
create policy searches_self on public.saved_searches for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists suggestions_self on public.club_suggestions;
create policy suggestions_self on public.club_suggestions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists suggestions_insert on public.club_suggestions;
create policy suggestions_insert on public.club_suggestions for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists flags_read on public.feature_flags;
create policy flags_read on public.feature_flags for select to anon, authenticated using (true);

drop policy if exists events_read on public.game_events;
create policy events_read on public.game_events for select to anon, authenticated using (true);

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
  execute 'drop policy if exists avatars_public_read on storage.objects';
  execute 'create policy avatars_public_read on storage.objects for select to anon, authenticated using (bucket_id = ''avatars'')';
  execute 'drop policy if exists avatars_insert_own on storage.objects';
  execute 'create policy avatars_insert_own on storage.objects for insert to authenticated with check (bucket_id = ''avatars'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
  execute 'drop policy if exists avatars_update_own on storage.objects';
  execute 'create policy avatars_update_own on storage.objects for update to authenticated using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
exception
  when undefined_table or insufficient_privilege then null;
end $$;
