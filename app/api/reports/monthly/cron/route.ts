/**
 * GET|POST /api/reports/monthly/cron — the monthly progress report run.
 *
 * vercel.json runs it at :30 past every hour from 08:30 to 23:30 UTC on the 1st
 * and the 2nd of each month: after the GSC (05:00), schedule (06:00) and
 * automation (07:00) crons, and never on the hour they use. Each run reports on
 * the month that just ended for at most MONTHLY_REPORT_BATCH_SIZE projects still
 * missing it, so every project is covered over the runs, and a run over a
 * finished month does nothing.
 *
 * SECURITY — no browser session: authorized ONLY by `Authorization: Bearer
 * <CRON_SECRET>` through authorizeCronRequest, which FAILS CLOSED (503 when the
 * secret is not configured, 401 on a wrong one).
 *
 * ANSWERS FIRST, WORKS AFTER, like /api/content/automation/cron: 202 at once,
 * the run in `after()`. The outcome is the `[monthly-report] run complete` log
 * line (counts and a stable code per failed project, never a message).
 *
 * Kill switch: DISABLE_MONTHLY_REPORTS=true.
 */
import { after } from 'next/server'
import { authorizeCronRequest } from '@/lib/auth/cron'
import { handleMonthlyCron } from '@/lib/reports/monthly/http'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handle(request: Request): Promise<Response> {
  return handleMonthlyCron(request, {
    authorize: (req) => authorizeCronRequest(req, 'monthly-report'),
    enabled: () => process.env.DISABLE_MONTHLY_REPORTS !== 'true',
    admin: () => createAdminClient(),
    now: () => new Date(),
    schedule: (task) => after(task),
    log: (msg, fields) => console.log(msg, fields),
    env: process.env,
  })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
