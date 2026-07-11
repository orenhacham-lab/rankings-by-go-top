/**
 * /api/projects/[id]/ai-visibility/competitors
 *
 * GET  → list active+inactive competitors for the project
 * POST → create a new competitor (enforces max 3 active per project)
 *
 * Auth: requires an authenticated user that owns the project. Performed at the
 * API layer (this project does not use Postgres RLS — see prompts/ai-profile
 * routes for the same pattern).
 *
 * Gated by ENABLE_AI_VISIBILITY=true.
 *
 * Soft delete only — DELETE in the [cid] route sets is_active=false so the
 * historical record remains for future Share of Voice / Timeline analytics.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const MAX_ACTIVE_COMPETITORS = 3

const ERR = {
  unauthorized: 'יש להתחבר מחדש לפני שמירת המתחרים.',
  notFound: 'הפרויקט לא נמצא. נסה לרענן את העמוד.',
  forbidden: 'אין הרשאה לערוך מתחרים לפרויקט זה.',
  badJson: 'בקשה לא תקינה.',
  nameRequired: 'יש להזין שם מתחרה.',
  maxReached: `ניתן להגדיר עד ${MAX_ACTIVE_COMPETITORS} מתחרים פעילים לפרויקט.`,
  saveFailed: 'שמירת המתחרה נכשלה. נסה שוב.',
  loadFailed: 'טעינת המתחרים נכשלה. נסה שוב.',
  columnMissing:
    'טבלת המתחרים חסרה במסד הנתונים. הפעל את ההגירה 20260522_add_ai_visibility_competitors.sql.',
} as const

async function authAndProject(projectId: string | null | undefined) {
  if (!projectId || typeof projectId !== 'string') {
    return { error: ERR.notFound, status: 404 as const, stage: 'params' as const }
  }

  let supabase
  try {
    supabase = await createClient()
  } catch (e) {
    console.error('[ai-vis-competitors] supabase client creation error', { projectId, message: String(e) })
    return { error: 'Missing Supabase configuration.', status: 503 as const, stage: 'supabase_config' as const }
  }

  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    return { error: ERR.unauthorized, status: 401 as const, stage: 'auth' as const }
  }
  const user = userData.user

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('[ai-vis-competitors] admin client creation error', { projectId, message: String(e) })
    return { error: 'Database configuration error.', status: 503 as const, stage: 'db_config' as const }
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) {
    if (projectError.code === '42P01') {
      return { error: ERR.columnMissing, status: 503 as const, stage: 'missing_table' as const }
    }
    console.error('[ai-vis-competitors] project lookup error', {
      projectId,
      message: projectError.message,
      code: projectError.code,
    })
    return { error: ERR.notFound, status: 404 as const, stage: 'db_error' as const }
  }
  if (!project) {
    return { error: ERR.notFound, status: 404 as const, stage: 'project_not_found' as const }
  }

  const ownerId = (project as { user_id?: string | null }).user_id
  if (ownerId && ownerId !== user.id) {
    return { error: ERR.forbidden, status: 403 as const, stage: 'permission' as const }
  }

  return { user, admin, projectId }
}

function normalizeAliases(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out.slice(0, 20)
}

function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null
  return trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { id: projectId } = await params
  const auth = await authAndProject(projectId)
  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status })
  }

  const { data, error } = await auth.admin
    .from('ai_visibility_competitors')
    .select('*')
    .eq('project_id', auth.projectId)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    if (error.code === '42P01') {
      return Response.json({ error: ERR.columnMissing }, { status: 503 })
    }
    console.error('[ai-vis-competitors] list error', {
      projectId,
      message: error.message,
      code: error.code,
    })
    return Response.json({ error: ERR.loadFailed }, { status: 500 })
  }

  return Response.json({ competitors: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { id: projectId } = await params
  const auth = await authAndProject(projectId)
  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: ERR.badJson }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return Response.json({ error: ERR.nameRequired }, { status: 400 })
  }

  const domain = normalizeDomain(body.domain)
  const aliases = normalizeAliases(body.aliases)

  // Enforce max 3 active competitors per project
  const { count, error: countError } = await auth.admin
    .from('ai_visibility_competitors')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', auth.projectId)
    .eq('is_active', true)

  if (countError) {
    if (countError.code === '42P01') {
      return Response.json({ error: ERR.columnMissing }, { status: 503 })
    }
    console.error('[ai-vis-competitors] count error', {
      projectId,
      message: countError.message,
    })
    return Response.json({ error: ERR.saveFailed }, { status: 500 })
  }

  if ((count ?? 0) >= MAX_ACTIVE_COMPETITORS) {
    return Response.json(
      { error: ERR.maxReached, code: 'max_competitors_reached' },
      { status: 400 },
    )
  }

  const { data, error } = await auth.admin
    .from('ai_visibility_competitors')
    .insert({
      user_id: auth.user.id,
      project_id: auth.projectId,
      name,
      domain,
      aliases,
      is_active: true,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[ai-vis-competitors] insert error', {
      projectId,
      message: error.message,
      code: error.code,
    })
    return Response.json({ error: ERR.saveFailed }, { status: 500 })
  }

  return Response.json({ competitor: data })
}
