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
import { processScheduledScanForProject } from '@/lib/scan-scheduler/process-scheduled-scan'

export async function GET(request: Request) {
  // Verify cron secret when configured
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
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
    return Response.json({ error: error.message }, { status: 500 })
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

  for (const project of projects) {
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

  return Response.json({ processed: results.length, timestamp: now.toISOString(), results })
}
