/**
 * /api/projects/[id]/ai-profile
 *
 * GET    → return the project's saved AI Business Profile (null if not set)
 * PATCH  → save a manual AI Business Profile (mode='manual')
 * DELETE → reset to auto-detection (clears the column)
 *
 * The profile affects ONLY recommended AI questions in the AI Visibility
 * module. It does not change scans, rankings, billing, or anything else.
 *
 * Robustness notes:
 *   - Auth check selects ONLY columns guaranteed to exist (`id`, `user_id`).
 *     Earlier versions selected `ai_business_profile` in the same query, which
 *     failed with PG error 42703 ("column does not exist") on instances that
 *     hadn't yet applied 20260516_add_ai_business_profile.sql — and surfaced
 *     to the user as a misleading "Project not found" 404.
 *   - The profile column is fetched/updated in a separate step, with explicit
 *     handling for the missing-column case so the user sees a Hebrew error.
 *   - `primaryCategory` accepts ANY non-empty string — the user may type
 *     freeform Hebrew text (e.g. "משלוחי פרחים", "בשמי נישה"). The generator
 *     is responsible for mapping known aliases and falling back gracefully.
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

const ERR_HEBREW = {
  unauthorized: 'יש להתחבר מחדש לפני שמירת הפרופיל.',
  notFound: 'הפרויקט לא נמצא. נסה לרענן את העמוד.',
  forbidden: 'אין הרשאה לערוך פרופיל לפרויקט זה.',
  badJson: 'בקשה לא תקינה.',
  columnMissing:
    'עמודת פרופיל ה-AI חסרה במסד הנתונים. הפעל את ההגירה 20260516_add_ai_business_profile.sql.',
  saveFailed: 'שמירת הפרופיל נכשלה. נסה שוב.',
  resetFailed: 'איפוס הפרופיל נכשל. נסה שוב.',
} as const

/**
 * Verify the user is authenticated AND owns the project. Returns only fields
 * guaranteed to exist on the projects table — DO NOT request optional columns
 * here, or PG will return an error and we'll mislabel it as "Project not found".
 */
async function authAndProject(projectId: string | null | undefined) {
  if (!projectId || typeof projectId !== 'string') {
    return { error: ERR_HEBREW.notFound, status: 404 as const }
  }

  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    return { error: ERR_HEBREW.unauthorized, status: 401 as const }
  }
  const user = userData.user

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) {
    console.error('[ai-profile] project lookup error', {
      projectId,
      message: projectError.message,
      code: projectError.code,
    })
    return { error: ERR_HEBREW.notFound, status: 404 as const }
  }
  if (!project) {
    return { error: ERR_HEBREW.notFound, status: 404 as const }
  }

  const ownerId = (project as { user_id?: string | null }).user_id
  if (ownerId && ownerId !== user.id) {
    return { error: ERR_HEBREW.forbidden, status: 403 as const }
  }

  return { user, admin, projectId }
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined) {
  if (!err) return false
  if (err.code === '42703') return true
  const msg = (err.message || '').toLowerCase()
  return (
    msg.includes('ai_business_profile') &&
    (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('column'))
  )
}

async function readProfile(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<{ profile: AIBusinessProfile | null; columnMissing: boolean }> {
  const { data, error } = await admin
    .from('projects')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('ai_business_profile' as any)
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return { profile: null, columnMissing: true }
    console.error('[ai-profile] profile read error', { projectId, message: error.message })
    return { profile: null, columnMissing: false }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = ((data as any)?.ai_business_profile ?? null) as AIBusinessProfile | null
  return { profile, columnMissing: false }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authAndProject(id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { profile, columnMissing } = await readProfile(auth.admin, auth.projectId)
  return Response.json({ profile, columnMissing })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authAndProject(id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: Partial<AIBusinessProfile> & { mode?: 'auto' | 'manual' }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: ERR_HEBREW.badJson }, { status: 400 })
  }

  // Accept ANY non-empty string for primaryCategory — the user can type a
  // freeform Hebrew label (e.g. "משלוחי פרחים"). Mapping/fallback happens in
  // the generator, not here.
  const rawPrimary = typeof body.primaryCategory === 'string' ? body.primaryCategory.trim() : ''
  const primaryCategory = rawPrimary.length > 0 ? rawPrimary.slice(0, 120) : null

  const secondaryCategories = Array.isArray(body.secondaryCategories)
    ? body.secondaryCategories
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 120))
        .slice(0, 20)
    : []

  const excludedTopics = Array.isArray(body.excludedTopics)
    ? body.excludedTopics
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 120))
        .slice(0, 30)
    : []

  const mode: 'auto' | 'manual' = body.mode === 'auto' ? 'auto' : 'manual'

  const profile: AIBusinessProfile = {
    mode,
    primaryCategory: mode === 'manual' ? primaryCategory : null,
    secondaryCategories: mode === 'manual' ? secondaryCategories : [],
    excludedTopics: mode === 'manual' ? excludedTopics : [],
    updatedAt: new Date().toISOString(),
    updatedBy: auth.user.id,
  }

  const { error } = await auth.admin
    .from('projects')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ ai_business_profile: profile } as any)
    .eq('id', auth.projectId)

  if (error) {
    console.error('[ai-profile] update error', {
      projectId: auth.projectId,
      message: error.message,
      code: error.code,
    })
    if (isMissingColumnError(error)) {
      return Response.json({ error: ERR_HEBREW.columnMissing, columnMissing: true }, { status: 500 })
    }
    return Response.json(
      { error: `${ERR_HEBREW.saveFailed} (${error.message})` },
      { status: 500 },
    )
  }

  return Response.json({ profile, ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authAndProject(id)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.admin
    .from('projects')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ ai_business_profile: null } as any)
    .eq('id', auth.projectId)

  if (error) {
    console.error('[ai-profile] reset error', {
      projectId: auth.projectId,
      message: error.message,
      code: error.code,
    })
    if (isMissingColumnError(error)) {
      return Response.json({ ok: true, columnMissing: true })
    }
    return Response.json(
      { error: `${ERR_HEBREW.resetFailed} (${error.message})` },
      { status: 500 },
    )
  }
  return Response.json({ ok: true })
}
