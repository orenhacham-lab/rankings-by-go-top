/**
 * Forgetting a prospect — GET/POST /api/outreach/retention/cron
 *
 * Daily (vercel.json, 11:30 UTC), and every 15 minutes through the automation
 * cron, which is what actually makes it run (lib/outreach/retention-isolated.ts:
 * a daily Vercel cron on this plan is best-effort). It nulls the address and the contact name of
 * a prospect 30 days after the last message, and deletes outright a prospect we
 * never wrote to after 90 days. The rules, the reasons for those two numbers,
 * and what deliberately survives a redaction are in lib/outreach/retention.ts.
 * The published privacy text states both periods, so the two move together.
 *
 * Protected by CRON_SECRET (lib/auth/cron.ts, which fails closed), checked
 * FIRST: proxy.ts's matcher excludes /api/*, so this route has no middleware in
 * front of it. Service-role only; no browser session reaches it.
 *
 * It answers with the counts rather than scheduling work in `after()`: a few
 * statements over one small table finish in milliseconds, and a pass whose
 * result the cron log carries is one we can see has run. It logs that line on
 * every pass, counts of zero included, for the same reason.
 */
import { authorizeCronRequest } from '@/lib/auth/cron'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyProspectRetention } from '@/lib/outreach/retention'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request: Request): Promise<Response> {
  const denied = authorizeCronRequest(request, 'outreach-retention')
  if (denied) return denied

  const summary = await applyProspectRetention(createAdminClient())
  // EVERY pass, counts of zero included. Counts only — no address, no company,
  // nothing about any prospect. A line printed only when something changed is
  // indistinguishable from a job that never fired, and while the table is empty
  // that is every pass; on 13 Oct 2026 that is exactly the question the logs
  // could not answer before the first list was loaded.
  console.log('[outreach-retention] pass complete', summary)
  return Response.json({ ok: summary.failed.length === 0, ...summary })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
