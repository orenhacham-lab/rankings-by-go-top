/**
 * AI Visibility — GET /api/ai-visibility/runs/[id]/results
 *
 * Phase 2-C minimal vertical slice.
 * Returns the persisted scan result + citations for a single run.
 *
 * Gated by ENABLE_AI_VISIBILITY=true. Returns 404 when disabled.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: runId } = await context.params
  if (!runId) {
    return Response.json({ error: 'Run id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load run and verify ownership via project.user_id
  const { data: run, error: runError } = await admin
    .from('ai_scan_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  const { data: project } = await admin
    .from('projects')
    .select('user_id')
    .eq('id', run.project_id)
    .single()

  if (!project || (project as { user_id?: string }).user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch results for this run (including excluded ones, which get marked in response)
  const { data: results, error: resultsError } = await admin
    .from('ai_scan_results')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true })

  if (resultsError) {
    return Response.json(
      { error: `Failed to load results: ${resultsError.message}` },
      { status: 500 }
    )
  }

  // Fetch citations for all result ids in one query
  const resultIds = (results ?? []).map((r) => r.id)
  let citations: Array<Record<string, unknown>> = []
  if (resultIds.length > 0) {
    const { data: citationRows, error: citationsError } = await admin
      .from('ai_citations')
      .select('*')
      .in('result_id', resultIds)
      .order('citation_position', { ascending: true })

    if (citationsError) {
      return Response.json(
        { error: `Failed to load citations: ${citationsError.message}` },
        { status: 500 }
      )
    }
    citations = citationRows ?? []
  }

  // Group citations by result id
  const citationsByResult = new Map<string, Array<Record<string, unknown>>>()
  for (const c of citations) {
    const rid = c.result_id as string
    const arr = citationsByResult.get(rid) ?? []
    arr.push(c)
    citationsByResult.set(rid, arr)
  }

  return Response.json({
    run: {
      id: run.id,
      projectId: run.project_id,
      provider: run.provider,
      status: run.status,
      totalTasks: run.total_tasks,
      completedTasks: run.completed_tasks,
      failedTasks: run.failed_tasks,
      totalCreditsUsed: run.total_credits_used,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      errorMessage: run.error_message,
    },
    results: (results ?? []).map((r) => ({
      id: r.id,
      promptId: r.prompt_id,
      engine: r.engine,
      provider: r.provider,
      mentioned: r.mentioned,
      targetCited: r.target_cited,
      mentionPositions: r.mention_positions,
      citationCount: r.citation_count,
      sourceCount: r.source_count,
      responseText: r.response_text,
      responseSummary: r.response_summary,
      visibilityScore: r.visibility_score,
      creditsUsed: r.credits_used,
      status: r.status,
      errorMessage: r.error_message,
      scannedAt: r.scanned_at,
      excludedFromScore: r.excluded_from_score,
      citations: citationsByResult.get(r.id) ?? [],
    })),
  })
}
