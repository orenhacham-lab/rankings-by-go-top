/**
 * /api/projects/[id]/ai-profile
 *
 * GET    → return the project's saved AI Business Profile (null if not set)
 * PATCH  → save a manual AI Business Profile (mode='manual')
 * DELETE → reset to auto-detection (clears the column)
 *
 * The profile affects ONLY recommended AI questions in the AI Visibility
 * module. It does not change scans, rankings, billing, or anything else.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

type AIBusinessProfile = {
  mode: 'auto' | 'manual'
  primaryCategory: string | null
  secondaryCategories: string[]
  excludedTopics: string[]
  updatedAt: string
  updatedBy: string
}

async function authAndProject(projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id, ai_business_profile')
    .eq('id', projectId)
    .single()

  if (projectError || !project) return { error: 'Project not found', status: 404 as const }
  if ((project as { user_id?: string }).user_id !== user.id) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { user, admin, project: project as { id: string; user_id: string; ai_business_profile: AIBusinessProfile | null } }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await authAndProject(id)
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status })
  return Response.json({ profile: result.project.ai_business_profile })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await authAndProject(id)
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status })

  let body: Partial<AIBusinessProfile>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const VALID_CATEGORIES = new Set([
    'agency', 'ecommerce', 'perfume', 'sports_store', 'gifts', 'appliance_store',
    'saas', 'local_service', 'cleaning', 'florist', 'restaurant', 'healthcare',
    'legal', 'real_estate', 'fitness', 'beauty', 'education', 'generic',
  ])

  const primaryCategory = typeof body.primaryCategory === 'string' && VALID_CATEGORIES.has(body.primaryCategory)
    ? body.primaryCategory
    : null

  const secondaryCategories = Array.isArray(body.secondaryCategories)
    ? body.secondaryCategories.filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 20)
    : []

  const excludedTopics = Array.isArray(body.excludedTopics)
    ? body.excludedTopics.filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 30)
    : []

  const profile: AIBusinessProfile = {
    mode: 'manual',
    primaryCategory,
    secondaryCategories,
    excludedTopics,
    updatedAt: new Date().toISOString(),
    updatedBy: result.user.id,
  }

  const { error } = await result.admin
    .from('projects')
    .update({ ai_business_profile: profile })
    .eq('id', id)

  if (error) {
    return Response.json({ error: `Failed to save profile: ${error.message}` }, { status: 500 })
  }

  return Response.json({ profile })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await authAndProject(id)
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status })

  const { error } = await result.admin
    .from('projects')
    .update({ ai_business_profile: null })
    .eq('id', id)

  if (error) {
    return Response.json({ error: `Failed to reset profile: ${error.message}` }, { status: 500 })
  }
  return Response.json({ ok: true })
}
