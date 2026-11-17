-- The hourly gate for /api/content/automation/cron (lib/content/automation/pass-gate.ts).
--
-- cron-job.org calls that route every fifteen minutes and it is the only path of
-- this project that appears in the Vercel runtime logs. One row holds the start
-- of the last pass that was allowed to do the work; a caller claims the window
-- with a conditional UPDATE, so of two simultaneous callers exactly one runs.
--
-- Service role only: RLS is on and no policy is granted, so no browser role can
-- read or write it. There is nothing in it about any person or project.
create table if not exists public.cron_pass_gate (
  key text primary key,
  last_started_at timestamptz not null default now()
);

comment on table public.cron_pass_gate is
  'One row per scheduled pass: when the last pass that did the work started. Claimed with a conditional UPDATE so a quarter-hour scheduler yields one pass an hour. Service role only.';

alter table public.cron_pass_gate enable row level security;

-- Seed the automation key so the first production call takes the ordinary
-- claim path. The far-past timestamp makes that first call eligible at once.
insert into public.cron_pass_gate (key, last_started_at)
values ('automation', 'epoch')
on conflict (key) do nothing;
