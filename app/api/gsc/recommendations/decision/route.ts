/**
 * POST/DELETE /api/gsc/recommendations/decision — Stage E2C GROUPED hide/handled decisions.
 *
 * A client recommendation represents multiple E2A opportunities; a decision applies to EVERY related
 * opportunity as one authoritative server operation. Opportunities are ALWAYS recomputed server-side
 * (the browser's list is never trusted): the request carries only the stable recommendationId; the
 * server rebuilds the recommendations, resolves its authoritative relatedOpportunityIds, validates
 * ownership, and batch-writes. Only 'already_covered' | 'irrelevant' are allowed — NEVER created_topic,
 * NEVER an article_topics insert. Requires BOTH the read-only and actions server flags.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscActionsEnabled } from '@/lib/gsc/config'
import { recomputeOpportunities, upsertHideDecisionsBatch, deleteHideDecisionsBatch, DecisionError } from '@/lib/gsc/opportunities/decisions'
import { OpportunityLoadError } from '@/lib/gsc/opportunities/load'
import { buildClientRecommendations } from '@/lib/gsc/client-recommendations/builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type HideDecision = 'already_covered' | 'irrelevant'
const HIDE_DECISIONS = new Set<HideDecision>(['already_covered', 'irrelevant'])

async function parse(request: Request): Promise<{ projectId: unknown; window: unknown; recommendationId: unknown; decision?: unknown }> {
  try { return await request.json() } catch { return { projectId: null, window: null, recommendationId: null } }
}

/** Recompute E2A + rebuild recommendations over the FULL set (decisions ignored) so the stable id
 *  resolves regardless of decision state, and return its authoritative related opportunities. */
async function resolveRecommendation(admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, projectId: string, windowDays: 28 | 90, recommendationId: string) {
  const recompute = await recomputeOpportunities(admin, projectId, windowDays)
  if (recompute.state === 'never_synced') return { error: 'never_synced' as const }
  const { recommendations } = buildClientRecommendations({
    opportunities: recompute.opportunities, decidedOpportunityIds: new Set(), window: windowDays, projectId,
  })
  const rec = recommendations.find((r) => r.id === recommendationId)
  if (!rec) return { error: 'stale_recommendation' as const }
  const byId = new Map(recompute.opportunities.map((o) => [o.id, o]))
  const opportunities = rec.relatedOpportunityIds.map((id) => byId.get(id)).filter((o): o is NonNullable<typeof o> => !!o)
  return { rec, opportunities, syncRunId: recompute.runMeta.syncRunId }
}

export async function POST(request: Request) {
  if (!isGscActionsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const body = await parse(request)
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const windowDays = Number(body.window)
  if (windowDays !== 28 && windowDays !== 90) return Response.json({ ok: false, error: 'invalid_window' }, { status: 400 })
  const recommendationId = typeof body.recommendationId === 'string' ? body.recommendationId : null
  if (!recommendationId) return Response.json({ ok: false, error: 'invalid_recommendation_id' }, { status: 400 })
  const decision = body.decision
  if (typeof decision !== 'string' || !HIDE_DECISIONS.has(decision as HideDecision)) return Response.json({ ok: false, error: 'invalid_decision' }, { status: 400 })

  try {
    const resolved = await resolveRecommendation(auth.admin, auth.project.id, windowDays as 28 | 90, recommendationId)
    if ('error' in resolved) {
      const status = resolved.error === 'never_synced' ? 404 : 409
      return Response.json({ ok: false, error: resolved.error }, { status })
    }
    const result = await upsertHideDecisionsBatch(auth.admin, {
      userId: auth.user.id, projectId: auth.project.id, windowDays: windowDays as 28 | 90,
      syncRunId: resolved.syncRunId, decision: decision as HideDecision, opportunities: resolved.opportunities,
    })
    const ok = result.failed === 0
    return Response.json({
      ok,
      recommendationId,
      decision,
      counts: { updated: result.updated, alreadyMatching: result.alreadyMatching, failed: result.failed },
      failedOpportunityIds: result.failedOpportunityIds,
      refreshed: { removed: ok },
    }, { status: ok ? 200 : 500 })
  } catch (e) {
    if (e instanceof DecisionError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    if (e instanceof OpportunityLoadError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    return Response.json({ ok: false, error: 'decision_failed' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!isGscActionsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const body = await parse(request)
  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const windowDays = Number(body.window)
  if (windowDays !== 28 && windowDays !== 90) return Response.json({ ok: false, error: 'invalid_window' }, { status: 400 })
  const recommendationId = typeof body.recommendationId === 'string' ? body.recommendationId : null
  if (!recommendationId) return Response.json({ ok: false, error: 'invalid_recommendation_id' }, { status: 400 })

  try {
    const resolved = await resolveRecommendation(auth.admin, auth.project.id, windowDays as 28 | 90, recommendationId)
    if ('error' in resolved) {
      const status = resolved.error === 'never_synced' ? 404 : 409
      return Response.json({ ok: false, error: resolved.error }, { status })
    }
    const { deleted } = await deleteHideDecisionsBatch(auth.admin, auth.project.id, resolved.opportunities.map((o) => o.id))
    return Response.json({ ok: true, recommendationId, counts: { deleted } })
  } catch (e) {
    if (e instanceof DecisionError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    if (e instanceof OpportunityLoadError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    return Response.json({ ok: false, error: 'decision_failed' }, { status: 500 })
  }
}
