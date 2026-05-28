/**
 * AI Visibility — /api/ai-visibility/suggestions/[cacheId]/dismiss
 *
 * POST → dismiss a cached suggestion (mark as 'dismissed')
 *
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cacheId: string }> }
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { cacheId } = await params
  if (!cacheId) {
    return NextResponse.json({ error: 'cacheId is required' }, { status: 400 })
  }

  let body: {
    projectId?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { projectId } = body
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  // Verify user owns project
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if ((project as { user_id?: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Update cache row
  const { error } = await admin
    .from('ai_question_suggestion_cache')
    .update({
      status: 'dismissed',
      dismissed_at: new Date().toISOString()
    })
    .eq('id', cacheId)
    .eq('project_id', projectId)

  if (error) {
    return NextResponse.json({ error: `Failed to dismiss: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
