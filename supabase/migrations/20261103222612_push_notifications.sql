-- Game alerts: store each phone's push subscription, queue a message when a
-- game changes, and let pg_net call the app to deliver it.
-- Vault keys push_dispatch_url and push_dispatch_secret are set outside this
-- file so the shared secret is not committed.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table public.games
  add column if not exists reminder_sent_at timestamptz;

create index if not exists games_reminder_idx
  on public.games (starts_at)
  where status = 'open' and reminder_sent_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated, service_role;

create table private.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null,
  tag text,
  created_at timestamptz not null default now(),
  attempted_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  error text
);

create index push_outbox_unsent_idx
  on private.push_outbox (attempted_at)
  where sent_at is null;

alter table private.push_outbox enable row level security;
revoke all on table private.push_outbox from public, anon, authenticated, service_role;

create or replace function private.player_first_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(nullif(btrim(first_name), ''), 'A player')
  from public.profiles
  where id = p_user_id;
$fn$;

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
  v_today := (now() at time zone 'Africa/Johannesburg')::date;
  v_dow := (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from v_local)::integer + 1];
  v_mon := (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from v_local)::integer];
  if v_local::date = v_today then
    v_when := 'Today · ' || to_char(v_local, 'HH24:MI');
  elsif v_local::date = v_today + 1 then
    v_when := 'Tomorrow · ' || to_char(v_local, 'HH24:MI');
  else
    v_when := v_dow || ' ' || extract(day from v_local)::integer || ' ' || v_mon || ' · ' || to_char(v_local, 'HH24:MI');
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

create or replace function private.enqueue_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_url text,
  p_tag text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text := coalesce(p_url, '/');
  v_title text := left(btrim(coalesce(p_title, '')), 80);
  v_body text := left(btrim(coalesce(p_body, '')), 180);
  v_tag text := left(btrim(coalesce(p_tag, '')), 80);
begin
  if p_user_id is null or v_title = '' then
    return;
  end if;
  if v_url !~ '^/($|[^/].*)$' then
    v_url := '/';
  end if;
  if not exists (select 1 from public.push_subscriptions where user_id = p_user_id) then
    return;
  end if;

  insert into private.push_outbox (user_id, title, body, url, tag)
  values (p_user_id, v_title, v_body, v_url, nullif(v_tag, ''));
end;
$fn$;

create or replace function private.notify_game_full(p_game_id uuid, p_skip uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label jsonb := private.game_label(p_game_id);
  v_when text;
  v_place text;
  v_host uuid;
  v_extra text;
  v_skip uuid[];
begin
  if v_label is null then
    return;
  end if;

  select coalesce(array_agg(u), '{}'::uuid[])
    into v_skip
  from unnest(coalesce(p_skip, '{}'::uuid[])) as u
  where u is not null;

  v_when := v_label->>'when_label';
  v_place := v_label->>'place_label';
  v_host := (v_label->>'host_id')::uuid;
  v_extra := case
    when coalesce((v_label->>'court_booked')::boolean, true) then ''
    else ' The court is still needed.'
  end;

  if v_host is not null and v_host <> all (v_skip) then
    perform private.enqueue_push(
      v_host,
      'Your game is full',
      v_when || ' at ' || v_place || '.' || v_extra,
      '/games/' || p_game_id::text,
      'full:' || p_game_id::text
    );
  end if;

  perform private.enqueue_push(
    gp.user_id,
    'Game is full',
    v_when || ' at ' || v_place || '. You''re in.' || v_extra,
    '/games/' || p_game_id::text,
    'full:' || p_game_id::text
  )
  from public.game_players gp
  where gp.game_id = p_game_id
    and gp.status = 'joined'
    and gp.user_id <> all (v_skip);

  perform private.enqueue_push(
    gp.user_id,
    'Game is full',
    v_when || ' at ' || v_place || ' filled up.',
    '/',
    'full:' || p_game_id::text
  )
  from public.game_players gp
  where gp.game_id = p_game_id
    and gp.status = 'pending'
    and gp.user_id <> all (v_skip);
end;
$fn$;

create or replace function private.notify_player_joined(p_game_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label jsonb := private.game_label(p_game_id);
  v_left integer;
  v_name text;
  v_body text;
  v_court text;
  v_host uuid;
begin
  if v_label is null then
    return;
  end if;

  v_host := (v_label->>'host_id')::uuid;
  v_left := coalesce((v_label->>'spots_left')::integer, 0);
  v_name := coalesce(private.player_first_name(p_user_id), 'A player');
  v_court := case
    when v_left <= 0 and not coalesce((v_label->>'court_booked')::boolean, true) then ' The court is still needed.'
    else ''
  end;
  v_body := (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '. ' || case
    when v_left <= 0 then 'The game is full.'
    when v_left = 1 then '1 spot left.'
    else v_left::text || ' spots left.'
  end || v_court;

  perform private.enqueue_push(
    v_host,
    v_name || ' joined',
    v_body,
    '/games/' || p_game_id::text,
    'join:' || p_game_id::text || ':' || p_user_id::text
  );

  if v_left <= 0 then
    perform private.notify_game_full(p_game_id, array[v_host, p_user_id]);
  end if;
end;
$fn$;

create or replace function private.notify_spot_requested(p_game_id uuid, p_user_id uuid)
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
    v_name || ' wants in',
    'Approve them for ' || (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '.',
    '/games/' || p_game_id::text,
    'request:' || p_game_id::text || ':' || p_user_id::text
  );
end;
$fn$;

create or replace function private.notify_request_answered(
  p_game_id uuid,
  p_user_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label jsonb := private.game_label(p_game_id);
  v_left integer;
  v_body text;
begin
  if v_label is null then
    return;
  end if;
  v_left := coalesce((v_label->>'spots_left')::integer, 0);

  if coalesce(p_accept, false) then
    v_body := (v_label->>'host_name') || ' accepted you for '
      || (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '.';
    if v_left <= 0 then
      v_body := v_body || ' The game is full.';
    end if;
    perform private.enqueue_push(
      p_user_id,
      'You''re in',
      v_body,
      '/games/' || p_game_id::text,
      'answer:' || p_game_id::text || ':' || p_user_id::text
    );
    if v_left <= 0 then
      perform private.notify_game_full(p_game_id, array[p_user_id]);
    end if;
    return;
  end if;

  perform private.enqueue_push(
    p_user_id,
    'Request declined',
    (v_label->>'host_name') || ' couldn''t take you for '
      || (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '.',
    '/',
    'answer:' || p_game_id::text || ':' || p_user_id::text
  );
end;
$fn$;

create or replace function private.notify_player_removed(p_game_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label jsonb := private.game_label(p_game_id);
begin
  if v_label is null then
    return;
  end if;
  perform private.enqueue_push(
    p_user_id,
    'Removed from a game',
    'You are no longer playing ' || (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '.',
    '/',
    'removed:' || p_game_id::text || ':' || p_user_id::text
  );
end;
$fn$;

create or replace function private.notify_game_cancelled(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_label jsonb := private.game_label(p_game_id);
begin
  if v_label is null then
    return;
  end if;
  perform private.enqueue_push(
    gp.user_id,
    'Game cancelled',
    (v_label->>'host_name') || ' cancelled ' || (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '.',
    '/',
    'cancel:' || p_game_id::text
  )
  from public.game_players gp
  where gp.game_id = p_game_id
    and gp.status in ('joined', 'pending');
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

  perform private.notify_spot_requested(p_game_id, v_uid);
  return jsonb_build_object('status', 'pending', 'player_id', v_existing_id);
end;
$fn$;

create or replace function private.respond_request(
  p_player_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
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
    perform private.notify_request_answered(v_game_id, v_player_user, false);
    return jsonb_build_object('status', 'declined');
  end if;

  select count(*)::integer into v_joined
  from public.game_players
  where game_id = v_game_id and status = 'joined';

  if v_joined >= v_spots then
    raise exception 'No spots left';
  end if;

  update public.game_players set status = 'joined' where id = p_player_id;
  perform private.notify_request_answered(v_game_id, v_player_user, true);
  return jsonb_build_object('status', 'joined', 'user_id', v_player_user);
end;
$fn$;

create or replace function private.remove_player(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_game_id uuid;
  v_host uuid;
  v_player_user uuid;
  v_player_status public.player_status;
begin
  select game_id, user_id, status
    into v_game_id, v_player_user, v_player_status
  from public.game_players
  where id = p_player_id
  for update;

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

  if v_player_status not in ('joined', 'pending') then
    return jsonb_build_object('status', v_player_status);
  end if;

  update public.game_players
    set status = 'removed'
    where id = p_player_id;

  perform private.notify_player_removed(v_game_id, v_player_user);
  return jsonb_build_object('status', 'removed');
end;
$fn$;

create or replace function private.cancel_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_host uuid;
  v_status public.game_status;
begin
  select host_id, status into v_host, v_status
  from public.games
  where id = p_game_id
  for update;

  if v_host is null then
    raise exception 'Game not found';
  end if;
  if v_host <> v_uid then
    raise exception 'Only the host can cancel';
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  end if;

  update public.games set status = 'cancelled' where id = p_game_id;
  perform private.notify_game_cancelled(p_game_id);
  return jsonb_build_object('status', 'cancelled');
end;
$fn$;

create or replace function private.enqueue_game_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r record;
  v_label jsonb;
  v_body text;
begin
  delete from private.push_outbox
  where sent_at is not null
    and sent_at < now() - interval '7 days';

  for r in
    select g.id, g.host_id
    from public.games g
    where g.status = 'open'
      and g.reminder_sent_at is null
      and g.starts_at > now()
      and g.starts_at <= now() + interval '2 hours'
      and g.created_at <= g.starts_at - interval '3 hours'
    for update skip locked
  loop
    update public.games
      set reminder_sent_at = now()
      where id = r.id;

    v_label := private.game_label(r.id);
    if v_label is null then
      continue;
    end if;

    v_body := (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '.';
    perform private.enqueue_push(
      r.host_id,
      'Padel coming up',
      v_body,
      '/games/' || r.id::text,
      'reminder:' || r.id::text
    );
    perform private.enqueue_push(
      gp.user_id,
      'Padel coming up',
      v_body,
      '/games/' || r.id::text,
      'reminder:' || r.id::text
    )
    from public.game_players gp
    where gp.game_id = r.id
      and gp.status = 'joined';
  end loop;
end;
$fn$;

create or replace function private.dispatch_push(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text;
  v_secret text;
begin
  if p_id is null then
    return;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'push_dispatch_url'
  limit 1;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_dispatch_secret'
  limit 1;

  if v_url is null or v_secret is null or btrim(v_url) = '' or btrim(v_secret) = '' then
    return;
  end if;

  perform net.http_post(
    url := btrim(v_url),
    body := jsonb_build_object('id', p_id),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
exception
  when others then
    return;
end;
$fn$;

create or replace function private.dispatch_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.dispatch_push(new.id);
  return new;
exception
  when others then
    return new;
end;
$fn$;

drop trigger if exists push_outbox_dispatch on private.push_outbox;
create trigger push_outbox_dispatch
  after insert on private.push_outbox
  for each row
  execute function private.dispatch_push_trigger();

create or replace function private.retry_unsent_pushes()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r record;
begin
  for r in
    select id
    from private.push_outbox
    where sent_at is null
      and created_at > now() - interval '1 day'
      and attempted_at < now() - interval '2 minutes'
    order by created_at
    limit 40
  loop
    update private.push_outbox
      set attempted_at = now()
      where id = r.id
        and sent_at is null;
    perform private.dispatch_push(r.id);
  end loop;
end;
$fn$;

create or replace function private.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh text := btrim(coalesce(p_p256dh, ''));
  v_auth text := btrim(coalesce(p_auth, ''));
begin
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Finish your profile before turning on alerts';
  end if;
  if v_endpoint !~ '^https://[^[:space:]]+$' or char_length(v_endpoint) > 2000
    or v_p256dh !~ '^[A-Za-z0-9_-]+={0,2}$' or char_length(v_p256dh) not between 20 and 200
    or v_auth !~ '^[A-Za-z0-9_-]+={0,2}$' or char_length(v_auth) not between 10 and 100
  then
    raise exception 'Push subscription is not valid';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, v_endpoint, v_p256dh, v_auth, left(btrim(coalesce(p_user_agent, '')), 240))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$fn$;

create or replace function private.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
begin
  delete from public.push_subscriptions
  where user_id = v_uid
    and endpoint = btrim(coalesce(p_endpoint, ''));
end;
$fn$;

create or replace function private.claim_push_outbox(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_rows jsonb;
begin
  with claimed as (
    update private.push_outbox o
      set claimed_at = now()
    where o.id = any (coalesce(p_ids, '{}'::uuid[]))
      and o.sent_at is null
      and (o.claimed_at is null or o.claimed_at < now() - interval '1 minute')
    returning o.id, o.user_id, o.title, o.body, o.url, o.tag
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'body', c.body,
    'url', c.url,
    'tag', c.tag,
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'endpoint', s.endpoint,
        'p256dh', s.p256dh,
        'auth', s.auth
      ))
      from public.push_subscriptions s
      where s.user_id = c.user_id
    ), '[]'::jsonb)
  )), '[]'::jsonb)
  into v_rows
  from claimed c;

  return v_rows;
end;
$fn$;

create or replace function private.finish_push(p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_error is null or btrim(p_error) = '' then
    update private.push_outbox
      set sent_at = now(),
          error = null
      where id = p_id;
    return;
  end if;

  update private.push_outbox
    set claimed_at = null,
        error = left(btrim(p_error), 300)
    where id = p_id
      and sent_at is null;
end;
$fn$;

create or replace function private.delete_push_endpoint(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  delete from public.push_subscriptions
  where endpoint = btrim(coalesce(p_endpoint, ''));
end;
$fn$;

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent);
$fn$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.delete_push_subscription(p_endpoint);
$fn$;

create or replace function public.claim_push_outbox(p_ids uuid[])
returns jsonb
language sql
security invoker
set search_path = ''
as $fn$
  select private.claim_push_outbox(p_ids);
$fn$;

create or replace function public.finish_push(p_id uuid, p_error text)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.finish_push(p_id, p_error);
$fn$;

create or replace function public.delete_push_endpoint(p_endpoint text)
returns void
language sql
security invoker
set search_path = ''
as $fn$
  select private.delete_push_endpoint(p_endpoint);
$fn$;

revoke all on function private.player_first_name(uuid) from public, anon, authenticated, service_role;
revoke all on function private.game_label(uuid) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_push(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.notify_game_full(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.notify_player_joined(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.notify_spot_requested(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.notify_request_answered(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function private.notify_player_removed(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.notify_game_cancelled(uuid) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_game_reminders() from public, anon, authenticated, service_role;
revoke all on function private.dispatch_push(uuid) from public, anon, authenticated, service_role;
revoke all on function private.dispatch_push_trigger() from public, anon, authenticated, service_role;
revoke all on function private.retry_unsent_pushes() from public, anon, authenticated, service_role;
revoke all on function private.save_push_subscription(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.delete_push_subscription(text) from public, anon, authenticated, service_role;
revoke all on function private.claim_push_outbox(uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.finish_push(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.delete_push_endpoint(text) from public, anon, authenticated, service_role;

grant execute on function private.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function private.delete_push_subscription(text) to authenticated;
grant execute on function private.claim_push_outbox(uuid[]) to service_role;
grant execute on function private.finish_push(uuid, text) to service_role;
grant execute on function private.delete_push_endpoint(text) to service_role;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_push_subscription(text) from public, anon, authenticated, service_role;
revoke all on function public.claim_push_outbox(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.finish_push(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_push_endpoint(text) from public, anon, authenticated, service_role;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.claim_push_outbox(uuid[]) to service_role;
grant execute on function public.finish_push(uuid, text) to service_role;
grant execute on function public.delete_push_endpoint(text) to service_role;

do $cron$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'fy4-game-reminders';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
  perform cron.schedule(
    'fy4-game-reminders',
    '*/5 * * * *',
    'select private.enqueue_game_reminders()'
  );

  select jobid into v_job from cron.job where jobname = 'fy4-push-retry';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
  perform cron.schedule(
    'fy4-push-retry',
    '* * * * *',
    'select private.retry_unsent_pushes()'
  );
end;
$cron$;
