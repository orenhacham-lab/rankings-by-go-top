/**
 * DELETE /api/ai-visibility/runs/[id]/delete
 *
 * Delete an AI scan run and cascade-delete its results and citations.
 * Auth required. User must own the parent project.
 *
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: runId } = await params
  if (!runId) {
    return Response.json({ error: 'Missing run ID' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch run to get project_id and verify ownership
  const { data: run, error: runError } = await admin
    .from('ai_scan_runs')
    .select('project_id')
    .eq('id', runId)
    .single()

  if (!run || runError) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  // Verify project ownership
  const { data: project } = await admin
    .from('projects')
    .select('user_id')
    .eq('id', run.project_id)
    .single()

  if (!project || (project as { user_id?: string }).user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete run (cascades to ai_scan_results and ai_citations via FK CASCADE)
  const { error: deleteError } = await admin
    .from('ai_scan_runs')
    .delete()
    .eq('id', runId)

  if (deleteError) {
    return Response.json(
      { error: `Failed to delete: ${deleteError.message}` },
      { status: 500 }
    )
  }

  return Response.json({ success: true, deletedRunId: runId })
}
