/**
 * Content automation — POST /api/content/automation/topic-ideas/improve
 *
 * Per-item "שפר עם Gemini Pro": polish ONE pending recommendation's wording with the
 * Pro model and persist the improved title/reason + an improvedWithPro marker. This
 * refines only the human-facing title and reason — the validated primary keyword,
 * intent, page type, links and coverage are preserved (the ranking / ownership /
 * cannibalization logic is never re-run). Owner-gated; makes at most ONE paid Pro call.
 *
 * Body: { projectId, ideaId }.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { loadPendingIdeaById, ideaToSuggestion, applyProImprovement } from '@/lib/content/recommendations/topic-idea-store'
import { improveRecommendationWithPro } from '@/lib/content/recommendations/improve-one'
import { newRunCostController } from '@/lib/content/recommendations/run-cost-controller'
import { BillingExhaustedError } from '@/lib/content/recommendations/model'
import { assertContentGenerationAllowedForUser } from '@/lib/content/entitlement-guard'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  let body: { projectId?: unknown; ideaId?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const ideaId = typeof body.ideaId === 'string' ? body.ideaId : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Blocker D fix — central gate, before any Pro model call.
  const gate = await assertContentGenerationAllowedForUser(auth.admin, auth.user.id)
  if (!gate.allowed) return Response.json({ error: 'Shopify billing required', reason: gate.reason }, { status: 403 })

  if (!ideaId) return Response.json({ error: 'idea_required' }, { status: 400 })

  const row = await loadPendingIdeaById(auth.admin, auth.project.id, ideaId)
  if (!row) return Response.json({ error: 'idea_not_found', reason: 'idea_not_found' }, { status: 404 })
  const current = ideaToSuggestion(row)

  // Project language (default Hebrew) so the polish stays in the site's language.
  const { data: proj } = await auth.admin.from('projects').select('language').eq('id', auth.project.id).maybeSingle()
  const language: 'he' | 'en' = String((proj as { language?: string } | null)?.language || '').toLowerCase().startsWith('en') ? 'en' : 'he'

  try {
    const controller = newRunCostController('premium', randomUUID(), 1, { maxModelCallsPerRun: 1 })
    const improved = await improveRecommendationWithPro(
      { primaryKeyword: current.primaryKeyword, title: current.title, suggestionReason: current.suggestionReason, language },
      controller,
    )

    // Pro genuinely unavailable for this key → typed, honest state (never silent Flash).
    if (!improved.ok && improved.reason === 'model_unavailable') {
      return Response.json({ ok: false, error: 'pro_model_unavailable', reason: 'pro_model_unavailable', message: 'מודל Gemini Pro אינו זמין למפתח הנוכחי כרגע.' }, { status: 503 })
    }
    // Provider/parse failure → transient; the item is left untouched.
    if (!improved.ok) {
      return Response.json({ ok: false, error: 'improve_failed', reason: improved.reason ?? 'improve_failed', message: 'שיפור ההמלצה נכשל זמנית. יש לנסות שוב.' }, { status: 502 })
    }
    // The Pro polish produced nothing better than the original — report truthfully,
    // do not persist a no-op or falsely mark the item as improved.
    if (!improved.changed) {
      return Response.json({ ok: true, changed: false, suggestion: current, reason: 'no_change' })
    }

    const updated = await applyProImprovement(auth.admin, auth.project.id, ideaId, {
      title: improved.title, suggestionReason: improved.suggestionReason, improvedModel: improved.model ?? 'gemini-pro',
    })
    // Persistence unavailable (table missing) — still return the improved wording so
    // the session reflects it; it just will not survive a reload.
    const suggestion = updated ?? { ...current, title: improved.title, suggestionReason: improved.suggestionReason, improvedWithPro: true }
    return Response.json({ ok: true, changed: true, persisted: !!updated, suggestion })
  } catch (e) {
    if (e instanceof BillingExhaustedError) {
      return Response.json({ ok: false, error: 'billing_exhausted', reason: 'billing_exhausted', message: 'יתרת Gemini API הסתיימה.' }, { status: 402 })
    }
    console.error('[topic-ideas/improve] failed', { message: (e as Error)?.message })
    return Response.json({ ok: false, error: 'improve_failed' }, { status: 500 })
  }
}
