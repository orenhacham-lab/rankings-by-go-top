/**
 * Stage E2B — human decision persistence over Stage E2A opportunities. Server-side only.
 *
 * Decisions are recorded ONLY after the caller is verified as the project owner. The
 * opportunity is ALWAYS recomputed server-side (never trusted from the browser) so the
 * persisted snapshot, query, page, type and sync run come from the authoritative engine.
 * This module never mutates Stage E2A output and never imports the recommendation engine.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { loadOpportunityInputs } from './load'
import { buildOpportunities } from './engine'
import type { Opportunity } from './types'

type Admin = ReturnType<typeof createAdminClient>
const TABLE = 'gsc_opportunity_decisions'

export type DecisionKind = 'already_covered' | 'irrelevant' | 'created_topic'

export interface DecisionRow {
  id: string; project_id: string; user_id: string; opportunity_id: string; window_days: number
  decision: DecisionKind; created_topic_id: string | null; sync_run_id: string | null
  primary_query: string; page_url: string; opportunity_type: string; opportunity_snapshot: unknown
  created_at: string; updated_at: string
}
/** Client-facing annotation attached to an opportunity (no internal ids / snapshot). */
export interface DecisionAnnotation { decision: DecisionKind; createdTopicId: string | null; createdAt: string; updatedAt: string }
export interface DecisionCounts { open: number; decided: number; already_covered: number; irrelevant: number; created_topic: number }

export class DecisionError extends Error {
  code: string; status: number
  constructor(code: string, status: number, message: string) { super(message); this.name = 'DecisionError'; this.code = code; this.status = status }
}

export type RecomputeResult = { state: 'never_synced' } | { state: 'ok'; opportunities: Opportunity[]; runMeta: { syncRunId: string; windowDays: number } }

/**
 * Recompute the current Stage E2A opportunities for (project, window) using the latest
 * succeeded run + the accepted engine. Pure passthrough — no scoring/type/id change.
 *
 * `opts.excludeArticleTopicIds` is a SERVER-ONLY content-evidence exclusion (never
 * browser-supplied). It is used ONLY by the created_topic decision path to evaluate the
 * opportunity in its PRE-created-topic state, so that a just-created topic does not flip the
 * type away from supporting_content_candidate. No other evidence is excluded.
 */
export async function recomputeOpportunities(admin: Admin, projectId: string, windowDays: 28 | 90, opts?: { excludeArticleTopicIds?: string[] }): Promise<RecomputeResult> {
  const inputs = await loadOpportunityInputs(admin, projectId, windowDays, opts) // throws typed on DB error
  if (inputs.state === 'never_synced') return { state: 'never_synced' }
  const opportunities = buildOpportunities(inputs.rows, inputs.evidence, inputs.runMeta)
  return { state: 'ok', opportunities, runMeta: { syncRunId: inputs.runMeta.syncRunId, windowDays } }
}

/** All persisted decisions for a project, keyed by opportunity_id. Fail closed on DB error. */
export async function loadDecisionsMap(admin: Admin, projectId: string): Promise<Map<string, DecisionRow>> {
  const { data, error } = await admin.from(TABLE).select('*').eq('project_id', projectId)
  if (error) throw new DecisionError('decisions_read_failed', 500, 'Could not read opportunity decisions.')
  const map = new Map<string, DecisionRow>()
  for (const r of (data ?? []) as DecisionRow[]) map.set(r.opportunity_id, r)
  return map
}

/** Annotate opportunities with their decision + compute decision counts (pure). */
export function annotate(opportunities: Opportunity[], decisions: Map<string, DecisionRow>): { annotated: (Opportunity & { decision: DecisionAnnotation | null })[]; counts: DecisionCounts } {
  const counts: DecisionCounts = { open: 0, decided: 0, already_covered: 0, irrelevant: 0, created_topic: 0 }
  const annotated = opportunities.map((o) => {
    const row = decisions.get(o.id) ?? null
    if (!row) { counts.open++; return { ...o, decision: null } }
    counts.decided++; counts[row.decision]++
    return { ...o, decision: { decision: row.decision, createdTopicId: row.created_topic_id, createdAt: row.created_at, updatedAt: row.updated_at } }
  })
  return { annotated, counts }
}

/** Verify a created topic exists AND belongs to the same project + authenticated user. */
export async function validateCreatedTopic(admin: Admin, projectId: string, userId: string, topicId: string): Promise<void> {
  const { data, error } = await admin.from('article_topics').select('id,project_id,user_id').eq('id', topicId).maybeSingle()
  if (error) throw new DecisionError('topic_lookup_failed', 500, 'Could not verify the created topic.')
  const t = data as { id: string; project_id: string; user_id: string } | null
  if (!t) throw new DecisionError('invalid_created_topic', 404, 'The created topic was not found.')
  if (t.project_id !== projectId || t.user_id !== userId) throw new DecisionError('invalid_created_topic', 403, 'The created topic does not belong to this project/user.')
}

/**
 * Idempotently upsert a decision for (project, opportunity). Enforces the created_topic lock:
 * once created_topic is recorded, already_covered / irrelevant cannot silently overwrite it.
 */
export async function upsertDecision(admin: Admin, params: {
  userId: string; projectId: string; opportunity: Opportunity; windowDays: 28 | 90; syncRunId: string
  decision: DecisionKind; createdTopicId: string | null
}): Promise<DecisionAnnotation> {
  const { data: existingRow, error: readErr } = await admin.from(TABLE).select('*').eq('project_id', params.projectId).eq('opportunity_id', params.opportunity.id).maybeSingle()
  if (readErr) throw new DecisionError('decisions_read_failed', 500, 'Could not read the existing decision.')
  const existing = existingRow as DecisionRow | null
  // App-level fast path for the created_topic lock (DB trigger is the authoritative guard).
  if (existing?.decision === 'created_topic' && params.decision !== 'created_topic') {
    throw new DecisionError('decision_locked_by_created_topic', 409, 'This opportunity already has a created topic.')
  }
  // FIX 3 fast path — a created topic may link to at most ONE opportunity (UNIQUE index is
  // the authoritative guard). Same-opportunity retry is allowed (idempotent).
  if (params.decision === 'created_topic' && params.createdTopicId) {
    const { data: linkedRows, error: linkErr } = await admin.from(TABLE).select('opportunity_id').eq('created_topic_id', params.createdTopicId)
    if (linkErr) throw new DecisionError('decisions_read_failed', 500, 'Could not check topic linkage.')
    if (((linkedRows ?? []) as { opportunity_id: string }[]).some((r) => r.opportunity_id !== params.opportunity.id)) {
      throw new DecisionError('created_topic_already_linked', 409, 'This topic is already linked to another opportunity.')
    }
  }

  const nowIso = new Date().toISOString()
  const o = params.opportunity
  // Persist the SERVER-recomputed snapshot only.
  const snapshot = {
    id: o.id, primaryQuery: o.primaryQuery, relatedQueries: o.relatedQueries, page: o.page, pageType: o.pageType,
    queryIntent: o.queryIntent, opportunityType: o.opportunityType, signals: o.signals, opportunityScore: o.opportunityScore,
    clicks: o.clicks, impressions: o.impressions, ctr: o.ctr, averagePosition: o.averagePosition, distinctPageCount: o.distinctPageCount,
    windowDays: o.windowDays, syncRunId: o.syncRunId,
  }
  const payload = {
    user_id: params.userId, project_id: params.projectId, opportunity_id: o.id, window_days: params.windowDays,
    decision: params.decision, created_topic_id: params.decision === 'created_topic' ? params.createdTopicId : null,
    sync_run_id: params.syncRunId, primary_query: o.primaryQuery, page_url: o.page, opportunity_type: o.opportunityType,
    opportunity_snapshot: snapshot, updated_at: nowIso,
  }
  const { error: upsertErr } = await admin.from(TABLE).upsert(payload, { onConflict: 'project_id,opportunity_id' })
  if (upsertErr) {
    const msg = (upsertErr as { message?: string }).message ?? ''
    const code = (upsertErr as { code?: string }).code
    // DB-authoritative guards (survive concurrent requests):
    if (msg.includes('decision_locked_by_created_topic')) throw new DecisionError('decision_locked_by_created_topic', 409, 'This opportunity already has a created topic.')
    if (code === '23505') throw new DecisionError('created_topic_already_linked', 409, 'This topic is already linked to another opportunity.')
    throw new DecisionError('decision_write_failed', 500, 'Could not record the decision.')
  }
  return { decision: params.decision, createdTopicId: payload.created_topic_id, createdAt: existing?.created_at ?? nowIso, updatedAt: nowIso }
}

/** Undo (delete) a decision. Idempotent when absent. Refuses to delete a created_topic
 *  decision (that must be managed via the Content Hub topic flow). Never touches article_topics. */
export async function deleteDecision(admin: Admin, projectId: string, opportunityId: string): Promise<{ deleted: boolean }> {
  const { data: existingRow, error: readErr } = await admin.from(TABLE).select('decision').eq('project_id', projectId).eq('opportunity_id', opportunityId).maybeSingle()
  if (readErr) throw new DecisionError('decisions_read_failed', 500, 'Could not read the decision.')
  const existing = existingRow as { decision: DecisionKind } | null
  if (!existing) return { deleted: false } // idempotent — nothing to undo
  if (existing.decision === 'created_topic') throw new DecisionError('created_topic_decision_cannot_be_undone_here', 409, 'A created-topic decision cannot be undone here.')
  const { error: delErr } = await admin.from(TABLE).delete().eq('project_id', projectId).eq('opportunity_id', opportunityId)
  if (delErr) throw new DecisionError('decision_delete_failed', 500, 'Could not undo the decision.')
  return { deleted: true }
}
