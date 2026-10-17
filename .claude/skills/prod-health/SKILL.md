---
name: prod-health
description: Check Production health for rankings-by-go-top — latest deployment, runtime errors, the three Vercel crons, the cron-job.org automation runs, and the content queue. Use for any "is production OK / did the cron run / did it deploy / is the queue stuck" question. Read-only; token-lean.
---

# Production health, cheaply

IDs: Vercel project `prj_ScaRKNPGBFmvAbiqqpi9o9Ew1QXg`, team `team_17MAi6RPwIGabHbftYT7xuSY`;
Supabase project `pmzicbtulloeynsosseh`. Production = `main` (auto-deploy).

**Token rules (these matter — one unfiltered log call returned 67k chars):**
- Vercel logs: start with `group_by` (statusCode / requestPath / level). Pull raw lines only with a
  `query` AND `limit` ≤ 5 AND `since` ≤ 1h. Never raw-pull `/api/content/automation/cron` over hours.
- Supabase: counts and aggregates only. Never select customer content columns.
- Answer from these numbers; do not re-read code to "confirm" what the numbers already show.

## 1. Deployment
`mcp__Vercel__list_deployments` (projectId, teamId, target=production, limit=2) → state + githubCommitSha.

## 2. Errors (last N hours)
`mcp__Vercel__get_runtime_logs` with `group_by: "statusCode"`, then if any 4xx/5xx:
`statusCode: "5xx"` (or `"401"`), `group_by: "requestPath"`. 401 on a cron path = CRON_SECRET mismatch.

## 3. Crons + queue — one SQL call (`mcp__Supabase__execute_sql`)
```sql
select
 (select count(*) from gsc_sync_runs where started_at >= current_date) gsc_runs_today,          -- Vercel 05:00 UTC
 (select count(*) from scans where triggered_by='scheduled' and created_at >= current_date) scheduled_scans_today, -- 06:00 UTC
 (select count(*) from projects where is_active and auto_scan_enabled and scan_frequency<>'manual'
    and (next_scan_at is null or next_scan_at < now())) scans_overdue,
 (select count(*) from generated_articles where created_at > now()-interval '24 hours') generated_24h,
 (select count(*) from article_pool_items where published_at > now()-interval '24 hours') published_24h,
 (select count(*) from article_pool_items where status in ('generating','publishing') and locked_at < now()-interval '10 minutes') stuck,
 (select count(*) from article_pool_items where status='paused') paused,
 (select count(*) from article_pools p where p.next_publish_at <= now()
    and not exists (select 1 from article_pool_items i where i.pool_id=p.id and i.status='generated')) due_without_ready,
 (select min(next_publish_at) from article_pools where next_publish_at > now()) next_publish;
```
Healthy: gsc_runs_today ≥ 1 after 06:00 UTC; scans_overdue = 0; stuck = 0; due_without_ready = 0.
`paused` > 0 → read that item's `last_error` (e.g. `missing_default_blog` = Shopify connection has no default blog).

## 4. Automation cadence (cron-job.org every 15 min + Vercel 07:00 UTC)
`get_runtime_logs` with `query: "run complete"`, `since: "1h"`, `limit: 5`. Each run logs one
`[automation-cron] run complete {generated, published, failures, durationMs}` line; the route answers
202 immediately and works in `after()`. Runs near 300 s risk the maxDuration cut-off.

## 5. Customer email, and the one promise no test can keep
`mcp__Resend__get-domain` with id `884743e5-f5b7-454d-b87e-0cd92185fbbe` (`mail.gotopseo.com`).
Healthy: Status **verified**, every DNS record verified, Sending enabled, Receiving disabled, and
**Open Tracking false AND Click Tracking false**.

Those last two are the point of this step. The legal pages state in all four languages, as a fact
about the system, that our emails carry no open pixel, no click tracking and no link rewriting. That
is the only published promise about this product that lives in a provider's console rather than in
code: a switch in the Resend dashboard breaks it, and no suite fails and no review catches it. If
either reads true, say so plainly as a legal exposure, not a setting: nothing may send until it is
off again or the legal text is changed first.

Nothing is being sent at all while `REMINDER_EMAILS_ENABLED`, `ONBOARDING_EMAILS_ENABLED` and
`WEEKLY_SUMMARY_EMAIL_ENABLED` are unset or anything but exactly `"true"` (`filter_project_envs`).
When they are on, `mcp__Resend__get-usage` is the cheapest "is anything going out" check, and the
automation cron logs one `[reminder-emails] run complete`, `[onboarding-emails] run complete` or
`[weekly-summary] run complete` line per run that did something.
