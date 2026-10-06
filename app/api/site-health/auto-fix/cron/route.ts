/**
 * Automatic site-health fixes — GET/POST /api/site-health/auto-fix/cron
 *
 * The daily scheduler (vercel.json, 09:30 UTC): for the projects whose owner turned automatic fixes
 * on (Settings › Automatic fixes), one scan and at most a few fixes of the three covered types,
 * through the Go Top WordPress plugin only. The rules: lib/site-fix/auto-run.ts and
 * lib/site-fix/api.ts autoFixProject.
 *
 * Protected by CRON_SECRET (lib/auth/cron.ts, fails closed), checked FIRST. Then the kill switch:
 * OFF (404) unless SITE_FIX_AUTO_ENABLED is exactly "true". Service-role only; no browser session.
 *
 * ANSWERS FIRST, WORKS AFTER, like /api/content/automation/cron: the run is scheduled with
 * `after()` and the route returns 202 at once. The run has its own deadline inside maxDuration
 * (less a margin) and never throws (startIsolatedAutoFix). The outcome is the
 * `[site-fix-auto] run complete` log line: counts only.
 */
import { after } from 'next/server'
import { authorizeCronRequest } from '@/lib/auth/cron'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAutoFixes, startIsolatedAutoFix } from '@/lib/site-fix/auto-run'
import { cronDeps } from '@/lib/site-fix/route-deps'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function handle(request: Request): Promise<Response> {
  // Bearer CRON_SECRET, required — refuses when the secret is unset.
  const denied = authorizeCronRequest(request, 'site-fix-auto')
  if (denied) return denied
  if (process.env.SITE_FIX_AUTO_ENABLED !== 'true') return Response.json({ error: 'Not found' }, { status: 404 })

  const startedAt = new Date().toISOString()
  after(() => startIsolatedAutoFix(async (deadlineAt) => {
    const summary = await runAutoFixes(createAdminClient(), { deadlineAt, depsFor: cronDeps, newRunId: () => crypto.randomUUID() })
    console.log('[site-fix-auto] run complete', { startedAt, ...summary })
  }, { startedAtMs: Date.parse(startedAt), maxDurationMs: maxDuration * 1000 }))
  return Response.json({ ok: true, accepted: true, startedAt }, { status: 202 })
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
