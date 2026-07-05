/**
 * Content automation — GET/POST /api/content/automation/cron
 *
 * The scheduled runner: recovers stale locks, publishes due generated items, and
 * generates ahead — bounded per run. Protected by CRON_SECRET (same pattern as
 * /api/schedule). Service-role only; no browser session. Idempotent.
 *
 * Vercel cron sends GET with `Authorization: Bearer <CRON_SECRET>`.
 */

import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAutomation } from '@/lib/content/automation/runner'

// Generation can take a while; request a generous budget (platform clamps to the
// plan's max — e.g. 60s on Hobby, up to 300s on Pro).
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function handle(request: Request): Promise<Response> {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  try {
    const summary = await runAutomation(admin, {})
    console.log('[automation-cron] run complete', { poolsChecked: summary.poolsChecked, published: summary.published, generated: summary.generated, staleRecovered: summary.staleRecovered, failures: summary.failures, durationMs: summary.durationMs })
    return Response.json({ ok: true, ...summary })
  } catch (e) {
    console.error('[automation-cron] run failed', { message: e instanceof Error ? e.message : String(e) })
    return Response.json({ ok: false, error: 'automation_run_failed' }, { status: 500 })
  }
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
