/**
 * POST   /api/gsc/opportunities/decision — record a human decision on a Stage E2A opportunity
 * DELETE /api/gsc/opportunities/decision — undo an already_covered / irrelevant decision
 *
 * Controlled, human-triggered WRITES. Requires BOTH GSC_READ_ONLY_ENABLED and
 * GSC_ACTIONS_ENABLED (else 404) and the authenticated project owner. The opportunity is
 * ALWAYS recomputed server-side; the client's query/page/type/score/signals/snapshot are
 * never trusted. The only content mutation Stage E2B performs is the created topic itself,
 * which is created earlier through the existing manual topic endpoint — this route only
 * records the decision (and validates the referenced topic's ownership). No writes when the
 * flag is off. Never returns tokens/OAuth/service-role internals.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled, isGscActionsEnabled } from '@/lib/gsc/config'
import { recomputeOpportunities, upsertDecision, deleteDecision, validateCreatedTopic, DecisionError, type DecisionKind } from '@/lib/gsc/opportunities/decisions'
import { OpportunityLoadError } from '@/lib/gsc/opportunities/load'
import { GscServiceError } from '@/lib/gsc/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DECISIONS = new Set<DecisionKind>(['already_covered', 'irrelevant', 'created_topic'])

function mapError(e: unknown): Response {
  if (e instanceof DecisionError) return Response.json({ ok: false, error: e.code }, { status: e.status })
  if (e instanceof OpportunityLoadError) return Response.json({ ok: false, error: e.code }, { status: e.status })
  if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code }, { status: e.status })
  return Response.json({ ok: false, error: 'decision_failed' }, { status: 500 })
}

export async function POST(request: Request) {
  // Actions require the read-only prerequisite AND the actions flag.
  if (!isGscReadOnlyEnabled() || !isGscActionsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const opportunityId = typeof body.opportunityId === 'string' ? body.opportunityId : ''
  const windowDays = Number(body.window)
  const decision = body.decision as DecisionKind
  const createdTopicId = typeof body.createdTopicId === 'string' ? body.createdTopicId : null

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (windowDays !== 28 && windowDays !== 90) return Response.json({ ok: false, error: 'invalid_window' }, { status: 400 })
  if (!DECISIONS.has(decision)) return Response.json({ ok: false, error: 'invalid_decision' }, { status: 400 })
  if (!opportunityId) return Response.json({ ok: false, error: 'opportunity_id_required' }, { status: 400 })

  try {
    // For created_topic: validate the topic FIRST (ownership), then recompute the opportunity
    // in its PRE-created-topic state by excluding ONLY the validated topic id from evidence —
    // otherwise the just-created topic flips the type away from supporting_content_candidate
    // (the confirmed 409). The exclusion is derived server-side from the validated topic id;
    // the browser never supplies excluded ids. irrelevant/already_covered use NO exclusion.
    let excludeArticleTopicIds: string[] = []
    if (decision === 'created_topic') {
      if (!createdTopicId) return Response.json({ ok: false, error: 'created_topic_id_required' }, { status: 400 })
      await validateCreatedTopic(auth.admin, auth.project.id, auth.user.id, createdTopicId) // exists + same project + same user
      excludeArticleTopicIds = [createdTopicId]
    }

    const recomputed = await recomputeOpportunities(auth.admin, auth.project.id, windowDays, { excludeArticleTopicIds })
    if (recomputed.state === 'never_synced') return Response.json({ ok: false, error: 'never_synced' }, { status: 409 })
    const opportunity = recomputed.opportunities.find((o) => o.id === opportunityId)
    if (!opportunity) return Response.json({ ok: false, error: 'opportunity_not_found' }, { status: 404 })

    if (decision === 'created_topic' && opportunity.opportunityType !== 'supporting_content_candidate') {
      // Still enforce server-side eligibility (in the pre-created-topic view). A genuinely
      // non-supporting opportunity is rejected; the browser type is never trusted.
      return Response.json({ ok: false, error: 'created_topic_not_allowed_for_opportunity_type' }, { status: 409 })
    }

    const annotation = await upsertDecision(auth.admin, {
      userId: auth.user.id, projectId: auth.project.id, opportunity, windowDays, syncRunId: recomputed.runMeta.syncRunId,
      decision, createdTopicId: decision === 'created_topic' ? createdTopicId : null,
    })
    return Response.json({ ok: true, decision: annotation })
  } catch (e) {
    return mapError(e)
  }
}

export async function DELETE(request: Request) {
  if (!isGscReadOnlyEnabled() || !isGscActionsEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const opportunityId = url.searchParams.get('opportunityId') ?? ''
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!opportunityId) return Response.json({ ok: false, error: 'opportunity_id_required' }, { status: 400 })

  try {
    const res = await deleteDecision(auth.admin, auth.project.id, opportunityId) // 409 for created_topic; idempotent otherwise
    return Response.json({ ok: true, deleted: res.deleted })
  } catch (e) {
    return mapError(e)
  }
}
