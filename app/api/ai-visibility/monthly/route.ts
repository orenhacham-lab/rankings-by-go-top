/**
 * The automatic monthly AI check, as the AI tab sees it (lib/ai-visibility/monthly-check).
 *
 *   GET  ?projectId=…               what the hero says: the next date, the engines,
 *                                    and the period's meter (used of X, by the
 *                                    automatic check, left), from the allowance ledger
 *   POST { projectId }              "הרצה עכשיו" after a skipped month: the same
 *                                    checks the cron would run, through the same
 *                                    reservations (a repeat reserves nothing twice)
 *   PUT  { projectId, enabled }     the project's "automatic monthly check" setting
 *
 * proxy.ts does not cover /api/*, so the route authenticates itself: a session,
 * and a project that session owns. The service role bypasses RLS, so the project
 * is read with its owner as a filter. Nothing of a provider's text is returned:
 * the answer is states and counts.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readMonthlyCheckStatus, runMonthlyCheckNow, type ProjectRow } from '@/lib/ai-visibility/monthly-check/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PROJECT_FIELDS = 'id, user_id, name, target_domain, business_name, country, is_active, ai_business_profile'
const UUIDish = /^[0-9a-f-]{8,64}$/i

async function authProject(projectId: unknown) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') return { error: 'Not found', status: 404 } as const
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 } as const
  if (typeof projectId !== 'string' || !UUIDish.test(projectId)) return { error: 'projectId is required', status: 400 } as const
  const admin = createAdminClient()
  const { data: project } = await admin.from('projects').select(PROJECT_FIELDS)
    .eq('id', projectId).eq('user_id', user.id).maybeSingle()
  if (!project) return { error: 'Forbidden', status: 403 } as const
  return { admin, user, project: project as unknown as ProjectRow } as const
}

export async function GET(request: Request) {
  const auth = await authProject(new URL(request.url).searchParams.get('projectId'))
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  try {
    return Response.json(await readMonthlyCheckStatus(auth.admin, auth.project))
  } catch {
    console.error('[ai-monthly] status unreadable')
    return Response.json({ state: 'unavailable' })
  }
}

export async function POST(request: Request) {
  let body: { projectId?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const auth = await authProject(body?.projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const startedAt = Date.now()
  try {
    const outcome = await runMonthlyCheckNow(auth.admin, auth.project, { deadlineAt: startedAt + maxDuration * 1000 - 20_000 })
    if (!outcome.ok) {
      return Response.json({
        ok: false, reason: outcome.reason,
        error: 'אין כרגע בדיקות להריץ בבדיקה החודשית.',
        errorEn: 'There is nothing for the monthly check to run right now.',
      }, { status: 409 })
    }
    return Response.json({ ok: true, dispatched: outcome.counts.dispatched, failed: outcome.counts.failed })
  } catch {
    console.error('[ai-monthly] run now failed')
    return Response.json({
      ok: false,
      error: 'הבדיקה לא הושלמה. נסו שוב בעוד רגע.',
      errorEn: 'The check did not finish. Please try again in a moment.',
    }, { status: 502 })
  }
}

export async function PUT(request: Request) {
  let body: { projectId?: unknown; enabled?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  if (typeof body?.enabled !== 'boolean') return Response.json({ error: 'enabled is required' }, { status: 400 })
  const auth = await authProject(body.projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { error } = await auth.admin.from('projects').update({ ai_auto_check_enabled: body.enabled } as never)
    .eq('id', auth.project.id).eq('user_id', auth.user.id)
  if (error) {
    // A database without the column (migration 20260930000000 not applied yet).
    console.error('[ai-monthly] setting not saved', { code: (error as { code?: string }).code ?? null })
    return Response.json({
      ok: false,
      error: 'לא הצלחנו לשמור את ההגדרה. נסו שוב בעוד רגע.',
      errorEn: 'We could not save this setting. Please try again in a moment.',
    }, { status: 503 })
  }
  return Response.json({ ok: true, enabled: body.enabled })
}
