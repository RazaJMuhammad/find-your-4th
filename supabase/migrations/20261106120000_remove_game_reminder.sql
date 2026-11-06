-- Playtomic already reminds players before a game, so the two-hour reminder is
-- gone. The reminder job also pruned old sent alerts, so that now has its own job.

do $cron$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'fy4-game-reminders';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
end;
$cron$;

drop function if exists private.enqueue_game_reminders();
drop index if exists public.games_reminder_idx;

alter table public.games
  drop column if exists reminder_sent_at;

create or replace function private.purge_push_outbox()
returns void
language sql
security definer
set search_path = ''
as $fn$
  delete from private.push_outbox
  where sent_at is not null
    and sent_at < now() - interval '7 days';
$fn$;

revoke all on function private.purge_push_outbox() from public, anon, authenticated, service_role;

do $cron$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'fy4-push-cleanup';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
  perform cron.schedule(
    'fy4-push-cleanup',
    '17 * * * *',
    'select private.purge_push_outbox()'
  );
end;
$cron$;
