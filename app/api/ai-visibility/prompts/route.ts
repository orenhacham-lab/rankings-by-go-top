/**
 * AI Visibility — /api/ai-visibility/prompts
 *
 * GET  ?projectId=...  → list active prompts for a project (verified owner)
 * POST                  → create a new prompt for a project (verified owner)
 *
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function authAndProject(projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project) return { error: 'Project not found', status: 404 as const }
  if ((project as { user_id?: string }).user_id !== user.id) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { user, admin }
}

export async function GET(request: Request) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  if (!projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 })
  }

  const result = await authAndProject(projectId)
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  const { data: prompts, error } = await result.admin
    .from('ai_prompts')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: `Failed to load prompts: ${error.message}` }, { status: 500 })
  }

  return Response.json({ prompts: prompts ?? [] })
}

export async function POST(request: Request) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: {
    projectId?: string
    prompt?: string
    targetDomain?: string | null
    targetBrandName?: string | null
    country?: string | null
    language?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { projectId, prompt, targetDomain, targetBrandName, country, language } = body
  if (!projectId || !prompt || !prompt.trim()) {
    return Response.json({ error: 'projectId and prompt are required' }, { status: 400 })
  }

  const result = await authAndProject(projectId)
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  const trimmedPrompt = prompt.trim()

  // Idempotent: if same prompt already exists for this project, return existing (don't error out)
  const { data: existing } = await result.admin
    .from('ai_prompts')
    .select('*')
    .eq('project_id', projectId)
    .eq('prompt', trimmedPrompt)
    .maybeSingle()

  if (existing) {
    return Response.json({ prompt: existing, duplicate: true })
  }

  const { data: row, error } = await result.admin
    .from('ai_prompts')
    .insert({
      project_id: projectId,
      prompt: trimmedPrompt,
      target_domain: targetDomain || null,
      target_brand_name: targetBrandName || null,
      country: country || null,
      language: language || null,
      is_active: true,
    })
    .select()
    .single()

  if (error || !row) {
    return Response.json({ error: `Failed to create prompt: ${error?.message}` }, { status: 500 })
  }

  return Response.json({ prompt: row })
}
