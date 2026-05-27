/**
 * AI Visibility — PATCH /api/ai-visibility/results/[id]/exclusion
 *
 * Phase 2-C result-level exclusion toggle.
 * Allows users to exclude irrelevant results from visibility scoring without
 * deleting scan data. Excluded results remain visible in the Results tab with
 * a muted style and label.
 *
 * Request body:
 *   { "excluded": boolean }
 *
 * Gated by ENABLE_AI_VISIBILITY=true. Returns 404 when disabled.
 * Requires ownership verification: result must belong to a project owned by the user.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
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

  const { id: resultId } = await context.params
  if (!resultId) {
    return Response.json({ error: 'Result id is required' }, { status: 400 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { excluded } = body as { excluded?: unknown }
  if (typeof excluded !== 'boolean') {
    return Response.json({ error: 'excluded must be a boolean' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load result and verify ownership via project.user_id
  const { data: result, error: resultError } = await admin
    .from('ai_scan_results')
    .select('id, project_id')
    .eq('id', resultId)
    .single()

  if (resultError || !result) {
    return Response.json({ error: 'Result not found' }, { status: 404 })
  }

  const { data: project } = await admin
    .from('projects')
    .select('user_id')
    .eq('id', (result as { project_id?: string }).project_id)
    .single()

  if (!project || (project as { user_id?: string }).user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Update exclusion flag
  const { data: updated, error: updateError } = await admin
    .from('ai_scan_results')
    .update({ excluded_from_score: excluded })
    .eq('id', resultId)
    .select('id, excluded_from_score')
    .single()

  if (updateError) {
    return Response.json(
      { error: `Failed to update result: ${updateError.message}` },
      { status: 500 }
    )
  }

  return Response.json({
    result: {
      id: (updated as { id?: string }).id,
      excludedFromScore: (updated as { excluded_from_score?: boolean }).excluded_from_score,
    },
  })
}
