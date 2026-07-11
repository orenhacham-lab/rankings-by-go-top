/**
 * DELETE /api/ai-visibility/prompts/[id]
 *
 * Deletes a single AI prompt. Cascades to ai_scan_results and ai_citations
 * via FK constraints. Returns 404 if the prompt does not exist or the user
 * does not own the parent project.
 *
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
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

  const { id: promptId } = await context.params
  if (!promptId) {
    return Response.json({ error: 'Missing prompt ID' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: prompt, error: promptError } = await admin
    .from('ai_prompts')
    .select('id, project_id')
    .eq('id', promptId)
    .single()

  if (promptError || !prompt) {
    return Response.json({ error: 'Prompt not found' }, { status: 404 })
  }

  const { data: project } = await admin
    .from('projects')
    .select('user_id')
    .eq('id', prompt.project_id)
    .single()

  if (!project || (project as { user_id?: string }).user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await admin
    .from('ai_prompts')
    .delete()
    .eq('id', promptId)

  if (deleteError) {
    return Response.json(
      { error: `Failed to delete prompt: ${deleteError.message}` },
      { status: 500 }
    )
  }

  return Response.json({ success: true, deletedPromptId: promptId })
}
