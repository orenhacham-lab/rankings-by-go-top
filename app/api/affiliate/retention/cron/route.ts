/**
 * Forgetting old applications — GET/POST /api/affiliate/retention/cron
 *
 * Daily (vercel.json, 10:30 UTC). It clears the applicant IP of any application
 * made over a year ago and deletes outright an application a person refused over
 * a year ago. The rules, and what is deliberately never touched, are in
 * lib/affiliate/retention.ts.
 *
 * Protected by CRON_SECRET (lib/auth/cron.ts, which fails closed), checked
 * FIRST: proxy.ts's matcher excludes /api/*, so this route has no middleware in
 * front of it. Service-role only; no browser session reaches it.
 *
 * It answers with the counts rather than scheduling work in `after()`: two
 * statements over one small table finish in milliseconds, and a pass whose
 * result the cron log carries is one we can see has run.
 */
import { authorizeCronRequest } from '@/lib/auth/cron'
import { createAdminClient } from '@/lib/supabase/admin'
import { purgeAffiliateApplications } from '@/lib/affiliate/retention'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request: Request): Promise<Response> {
  const denied = authorizeCronRequest(request, 'affiliate-retention')
  if (denied) return denied

  const summary = await purgeAffiliateApplications(createAdminClient())
  // Counts only — nothing about any applicant reaches a log line.
  if (summary.rejectedDeleted || summary.ipsForgotten || summary.failed.length) {
    console.log('[affiliate-retention] pass complete', summary)
  }
  return Response.json({ ok: summary.failed.length === 0, ...summary })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
