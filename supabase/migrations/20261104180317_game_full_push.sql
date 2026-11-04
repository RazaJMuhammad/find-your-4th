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
  v_court text;
  v_host uuid;
  v_title text;
  v_body text;
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

  if v_left <= 0 then
    v_title := 'Your game is full';
    v_body := v_name || ' took the last spot. '
      || (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '.' || v_court;
  else
    v_title := v_name || ' joined';
    v_body := (v_label->>'when_label') || ' at ' || (v_label->>'place_label') || '. ' || case
      when v_left = 1 then '1 spot left.'
      else v_left::text || ' spots left.'
    end;
  end if;

  perform private.enqueue_push(
    v_host,
    v_title,
    v_body,
    '/games/' || p_game_id::text,
    'join:' || p_game_id::text || ':' || p_user_id::text
  );

  if v_left <= 0 then
    perform private.notify_game_full(p_game_id, array[v_host, p_user_id]);
  end if;
end;
$fn$;
