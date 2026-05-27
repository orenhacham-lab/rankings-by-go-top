/**
 * GET /api/ai-visibility/summary
 *
 * Returns aggregated AI Visibility metrics keyed by project for the current
 * user. Used by the global "נראות ב-AI" hub to render real numbers instead
 * of placeholder zeros.
 *
 * Response:
 *   {
 *     summaries: Array<{
 *       projectId: string
 *       totalQueries: number       // ai_prompts.count
 *       totalScans: number         // ai_scan_results with status=success
 *       totalMentions: number      // ai_scan_results.mentioned=true
 *       totalCitations: number     // sum(ai_scan_results.citation_count)
 *       visibilityScore: number    // round(mentions / scans * 100), 0 if no scans
 *       lastScanAt: string | null  // max(ai_scan_results.scanned_at)
 *     }>
 *   }
 *
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type Summary = {
  projectId: string
  totalQueries: number
  totalScans: number
  totalMentions: number
  totalCitations: number
  visibilityScore: number
  lastScanAt: string | null
}

export async function GET() {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1. Load all projects owned by this user
  const { data: projects, error: projectsError } = await admin
    .from('projects')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (projectsError) {
    return Response.json({ error: `Failed to load projects: ${projectsError.message}` }, { status: 500 })
  }

  const projectIds = (projects ?? []).map((p) => p.id as string)
  if (projectIds.length === 0) {
    return Response.json({ summaries: [] })
  }

  // 2. Load AI prompts (count per project)
  const { data: prompts } = await admin
    .from('ai_prompts')
    .select('id, project_id')
    .in('project_id', projectIds)

  const promptCountByProject = new Map<string, number>()
  for (const p of prompts ?? []) {
    const key = p.project_id as string
    promptCountByProject.set(key, (promptCountByProject.get(key) ?? 0) + 1)
  }

  // 3. Load all scan runs for these projects so we can map results → project
  const { data: runs } = await admin
    .from('ai_scan_runs')
    .select('id, project_id')
    .in('project_id', projectIds)

  const runIds = (runs ?? []).map((r) => r.id as string)
  const projectByRunId = new Map<string, string>()
  for (const r of runs ?? []) {
    projectByRunId.set(r.id as string, r.project_id as string)
  }

  // 4. Load all scan results for those runs
  const summaries = new Map<string, Summary>()
  for (const pid of projectIds) {
    summaries.set(pid, {
      projectId: pid,
      totalQueries: promptCountByProject.get(pid) ?? 0,
      totalScans: 0,
      totalMentions: 0,
      totalCitations: 0,
      visibilityScore: 0,
      lastScanAt: null,
    })
  }

  if (runIds.length > 0) {
    const { data: results } = await admin
      .from('ai_scan_results')
      .select('run_id, mentioned, citation_count, status, scanned_at')
      .in('run_id', runIds)
      .eq('excluded_from_score', false)

    for (const r of results ?? []) {
      const projectId = projectByRunId.get(r.run_id as string)
      if (!projectId) continue
      const summary = summaries.get(projectId)
      if (!summary) continue
      if (r.status === 'success') {
        summary.totalScans++
        if (r.mentioned) summary.totalMentions++
        summary.totalCitations += (r.citation_count as number) || 0
        const scannedAt = r.scanned_at as string | null
        if (scannedAt && (!summary.lastScanAt || scannedAt > summary.lastScanAt)) {
          summary.lastScanAt = scannedAt
        }
      }
    }
  }

  // 5. Visibility score
  for (const s of summaries.values()) {
    s.visibilityScore = s.totalScans > 0 ? Math.round((s.totalMentions / s.totalScans) * 100) : 0
  }

  return Response.json({ summaries: Array.from(summaries.values()) })
}
