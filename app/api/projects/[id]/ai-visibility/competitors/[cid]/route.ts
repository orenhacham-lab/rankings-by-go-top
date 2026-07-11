/**
 * /api/projects/[id]/ai-visibility/competitors/[cid]
 *
 * PUT    → update competitor (name, domain, aliases, is_active)
 * DELETE → soft delete only (sets is_active=false). Never removes the row,
 *          so historical analytics (future Share of Voice / Timeline) stay
 *          consistent.
 *
 * Reactivating an inactive competitor (PUT with is_active:true) re-enforces
 * the max-3-active-per-project cap.
 *
 * Auth: API-level ownership check (project owner only).
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const MAX_ACTIVE_COMPETITORS = 3

const ERR = {
  unauthorized: 'יש להתחבר מחדש לפני שמירת המתחרים.',
  notFound: 'הפרויקט לא נמצא. נסה לרענן את העמוד.',
  competitorNotFound: 'המתחרה לא נמצא.',
  forbidden: 'אין הרשאה לערוך מתחרים לפרויקט זה.',
  badJson: 'בקשה לא תקינה.',
  nameRequired: 'יש להזין שם מתחרה.',
  maxReached: `ניתן להגדיר עד ${MAX_ACTIVE_COMPETITORS} מתחרים פעילים לפרויקט.`,
  saveFailed: 'שמירת המתחרה נכשלה. נסה שוב.',
  deleteFailed: 'מחיקת המתחרה נכשלה. נסה שוב.',
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { id: projectId, cid } = await params
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

  // Verify the competitor exists and belongs to this project
  const { data: existing, error: lookupError } = await auth.admin
    .from('ai_visibility_competitors')
    .select('id, project_id, is_active')
    .eq('id', cid)
    .maybeSingle()

  if (lookupError) {
    if (lookupError.code === '42P01') {
      return Response.json({ error: ERR.columnMissing }, { status: 503 })
    }
    return Response.json({ error: ERR.saveFailed }, { status: 500 })
  }
  if (!existing || (existing as { project_id?: string }).project_id !== auth.projectId) {
    return Response.json({ error: ERR.competitorNotFound }, { status: 404 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) {
      return Response.json({ error: ERR.nameRequired }, { status: 400 })
    }
    updates.name = name
  }

  if ('domain' in body) {
    updates.domain = normalizeDomain(body.domain)
  }

  if ('aliases' in body) {
    updates.aliases = normalizeAliases(body.aliases)
  }

  // Enforce max-active cap when reactivating
  if (typeof body.is_active === 'boolean') {
    const wasActive = (existing as { is_active?: boolean }).is_active === true
    if (body.is_active && !wasActive) {
      const { count, error: countError } = await auth.admin
        .from('ai_visibility_competitors')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', auth.projectId)
        .eq('is_active', true)

      if (countError) {
        return Response.json({ error: ERR.saveFailed }, { status: 500 })
      }
      if ((count ?? 0) >= MAX_ACTIVE_COMPETITORS) {
        return Response.json(
          { error: ERR.maxReached, code: 'max_competitors_reached' },
          { status: 400 },
        )
      }
    }
    updates.is_active = body.is_active
  }

  const { data, error } = await auth.admin
    .from('ai_visibility_competitors')
    .update(updates)
    .eq('id', cid)
    .select('*')
    .single()

  if (error) {
    console.error('[ai-vis-competitors] update error', {
      projectId,
      cid,
      message: error.message,
      code: error.code,
    })
    return Response.json({ error: ERR.saveFailed }, { status: 500 })
  }

  return Response.json({ competitor: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { id: projectId, cid } = await params
  const auth = await authAndProject(projectId)
  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status })
  }

  // Verify ownership through project before soft-deleting
  const { data: existing, error: lookupError } = await auth.admin
    .from('ai_visibility_competitors')
    .select('id, project_id')
    .eq('id', cid)
    .maybeSingle()

  if (lookupError) {
    if (lookupError.code === '42P01') {
      return Response.json({ error: ERR.columnMissing }, { status: 503 })
    }
    return Response.json({ error: ERR.deleteFailed }, { status: 500 })
  }
  if (!existing || (existing as { project_id?: string }).project_id !== auth.projectId) {
    return Response.json({ error: ERR.competitorNotFound }, { status: 404 })
  }

  // Soft delete: never remove rows so historical analytics remain stable.
  const { data, error } = await auth.admin
    .from('ai_visibility_competitors')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', cid)
    .select('*')
    .single()

  if (error) {
    console.error('[ai-vis-competitors] soft-delete error', {
      projectId,
      cid,
      message: error.message,
    })
    return Response.json({ error: ERR.deleteFailed }, { status: 500 })
  }

  return Response.json({ success: true, competitor: data })
}
