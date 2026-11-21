/**
 * Scheduled scan trigger endpoint.
 * Call this via Vercel Cron, Supabase scheduled function, or any external cron.
 *
 * Vercel cron — vercel.json:
 * {
 *   "crons": [{ "path": "/api/schedule", "schedule": "0 6 * * *" }]
 * }
 *
 * Protect with CRON_SECRET env var.
 * Vercel cron requests arrive with Authorization: Bearer <CRON_SECRET>
 *
 * Phase 3 (review correction) — this route is now a thin loop over due
 * projects; the ENTIRE per-project claim/reserve/dispatch/finalize/retry
 * pipeline lives in lib/scan-scheduler/process-scheduled-scan.ts, which is
 * directly behaviorally tested (see
 * lib/scan-scheduler/__qa__/process-scheduled-scan.qa.ts) — occurrence vs.
 * attempt identity, remaining-target resume across retries, and the
 * charging contract (consume exactly what was dispatched, never a blanket
 * release when checks were already dispatched) are all proven there against
 * the FakeAdmin RPC simulation, not just asserted from source text.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCronRequest } from '@/lib/auth/cron'
import { processScheduledScanForProject } from '@/lib/scan-scheduler/process-scheduled-scan'
import { after } from 'next/server'
import { runMonthlyAiChecks, startIsolatedMonthlyAiChecks } from '@/lib/ai-visibility/monthly-check/runner'
import { retryPayPalMigrations } from '@/lib/shopify/paypal-migration-retry'
import { readPassNumber, scanDeadlineAt, decideChain, nextPassUrl } from '@/lib/scan-scheduler/chain'

// The rank schedule below is unchanged; the budget is for the automatic monthly
// AI check that runs after it (platform clamps to the plan's max).
export const maxDuration = 300

export async function GET(request: Request) {
  // Bearer CRON_SECRET, required — refuses when the secret is unset.
  const denied = authorizeCronRequest(request, 'Schedule')
  if (denied) return denied

  // THE AUTOMATIC MONTHLY AI CHECK (lib/ai-visibility/monthly-check), approved by
  // the owner on 2026-09-29. Scheduled here, before anything below can return,
  // and run by after(): once this route has answered, in its own task with its
  // own deadline (what is left of maxDuration) and its own try/catch. It never
  // throws, so it cannot change, delay or fail the rank schedule's work or answer.
  const startedAtMs = Date.now()

  // Which pass of this trigger we are. A pass beyond the first exists only
  // because the previous one ran out of time, so everything below that is
  // "once per trigger" rather than "once per invocation" must not run again.
  const passNumber = readPassNumber(request.url)
  const isFirstPass = passNumber === 1

  // The instant after which no NEW project may be started. The remainder of
  // maxDuration belongs to the project already in flight, to the after() work
  // scheduled above, and to the response.
  const deadlineAtMs = scanDeadlineAt(startedAtMs, maxDuration)

  if (isFirstPass) try {
    after(() => startIsolatedMonthlyAiChecks(
      (deadlineAt) => runMonthlyAiChecks(createAdminClient(), { deadlineAt }),
      { startedAtMs, maxDurationMs: maxDuration * 1000 },
    ))
  } catch {
    // after() outside a request scope (a direct call in a test): nothing to schedule.
  }

  // THE DAILY PAYPAL→SHOPIFY MIGRATION RETRY (lib/shopify/paypal-migration-retry.ts):
  // stops PayPal auto-renewal that is still on for a migrating account, retries
  // a failed PayPal cancellation, and emails the operator about every row that
  // still fails. Same isolation as the AI check: after(), its own try, never
  // part of the rank answer below. It never throws.
  if (isFirstPass) try {
    after(() => retryPayPalMigrations(createAdminClient()).then(() => undefined, () => undefined))
  } catch {
    // after() outside a request scope (a direct call in a test): nothing to schedule.
  }

  const admin = createAdminClient()
  const now = new Date()

  // Find projects due for scanning:
  // - active
  // - auto scan enabled
  // - not manual frequency
  // - next_scan_at is in the past (or null — treat null as overdue)
  const { data: projects, error } = await admin
    .from('projects')
    .select('*')
    .eq('is_active', true)
    .eq('auto_scan_enabled', true)
    .neq('scan_frequency', 'manual')
    .or(`next_scan_at.is.null,next_scan_at.lte.${now.toISOString()}`)

  if (error) {
    console.error('[Schedule] Error loading projects:', error.message)
    return Response.json({ error: 'load_failed' }, { status: 500 })
  }

  if (!projects || projects.length === 0) {
    return Response.json({ message: 'No projects due for scanning', processed: 0 })
  }

  console.log(`[Schedule] Processing ${projects.length} project(s) at ${now.toISOString()}`)

  const results: Array<{
    projectId: string
    projectName: string
    completed?: number
    failed?: number
    skipped?: boolean
    status?: string
    error?: string
  }> = []

  let stoppedForDeadline = false
  for (const project of projects) {
    // Stop STARTING projects once the budget is spent. A project never started
    // keeps its next_scan_at, so it is still due and the next pass takes it.
    // This is what replaces being killed in the middle of one.
    if (Date.now() >= deadlineAtMs) {
      stoppedForDeadline = true
      console.log(`[Schedule] pass ${passNumber}: deadline reached, ${projects.length - results.length} project(s) left for the next pass`)
      break
    }
    const outcome = await processScheduledScanForProject(admin, project, { now })
    if (outcome.status === 'completed') {
      results.push({ projectId: project.id, projectName: project.name, completed: outcome.completed, failed: outcome.failed })
      console.log(`[Schedule] "${project.name}": ${outcome.completed} OK, ${outcome.failed} failed`)
    } else if (outcome.status === 'skipped') {
      results.push({ projectId: project.id, projectName: project.name, skipped: true, status: outcome.reason })
    } else if (outcome.status === 'quota_exceeded') {
      results.push({ projectId: project.id, projectName: project.name, status: 'quota_exceeded', skipped: true })
    } else if (outcome.status === 'will_retry' || outcome.status === 'failed_max_retries') {
      results.push({ projectId: project.id, projectName: project.name, status: outcome.status, error: outcome.error })
      console.error(`[Schedule] "${project.name}": ${outcome.status} — ${outcome.error}`)
    } else {
      results.push({ projectId: project.id, projectName: project.name, error: outcome.error })
      console.error(`[Schedule] Error for project ${project.id}:`, outcome.error)
    }
  }

  // Hand whatever is left to a fresh invocation of this same route, rather
  // than leaving it until tomorrow. decideChain holds all three brakes: work
  // remaining, forward progress, and the hard cap on passes.
  const remaining = projects.length - results.length
  const chain = decideChain({ processed: results.length, remaining, pass: passNumber })
  if (chain.chain) {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      console.error('[Schedule] work remains but CRON_SECRET is unset, so the next pass cannot authenticate')
    } else {
      const url = nextPassUrl(request.url, chain.nextPass)
      try {
        after(async () => {
          try {
            await fetch(url, { headers: { Authorization: `Bearer ${secret}` } })
          } catch (err) {
            // A failed hand-off costs us this trigger's remaining work, never
            // correctness: every unstarted project is still due.
            console.error(`[Schedule] pass ${chain.nextPass} hand-off failed:`, (err as Error).message)
          }
        })
      } catch {
        // after() outside a request scope (a direct call in a test).
      }
    }
  }

  return Response.json({
    processed: results.length,
    pass: passNumber,
    remaining,
    stoppedForDeadline,
    chained: chain.chain ? chain.nextPass : null,
    chainReason: chain.reason,
    timestamp: now.toISOString(),
    results,
  })
}
