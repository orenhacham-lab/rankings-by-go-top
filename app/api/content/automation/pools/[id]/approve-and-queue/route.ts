/**
 * Content automation — POST /api/content/automation/pools/:id/approve-and-queue
 *
 * The ONE authoritative server call for "approve links + add to queue" (Part G).
 * For each topic it: validates ownership + status, VERIFIES the selected link plan
 * actually persisted server-side, approves the topic (suggested→approved) and
 * enqueues it — returning ONE typed per-topic result. It NEVER reports a topic as
 * added when its links did not save (the live defect): a missing/failed link plan
 * yields link_plan_failed and the topic is not approved or enqueued.
 *
 * The client must call the existing link-plan save first; this endpoint confirms it
 * before committing. For true single-transaction atomicity, apply the additive RPC
 * in supabase/migrations/20260728_add_approve_topic_with_links_rpc.sql (NOT applied
 * automatically) and set RECO_APPROVE_QUEUE_RPC=1.
 */

import { isContentAutomationEnabled } from '@/lib/content/api-auth'
import { authPool, isMigrationMissing } from '@/lib/content/automation/api'
import { getLatestBatchForTopic } from '@/lib/content/internal-link-plan-store'
import { classifyTopicOutcome, blockedNonArticle, summarizeBatch, type TopicStageOutcomes } from '@/lib/content/automation/approve-link-queue'

/** A manual topic still 'suggested' is the only kind this flow may promote — a
 *  genuinely non-approved auto topic is never silently approved here. */
const isManualSuggested = (row: { status: string; source: string | null }): boolean => row.source === 'manual' && row.status === 'suggested'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isContentAutomationEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const { id } = await params

  let body: { topics?: unknown; topicIds?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  // Accept [{ topicId, expectsLinks, recommendedPageType, allowNonArticle }] or a
  // plain topicIds[] (expectsLinks=false). Part D — a non-article recommendation is
  // blocked from the article queue unless the caller sets allowNonArticle (the user
  // explicitly changed the type).
  const rawTopics: { topicId: string; expectsLinks: boolean; recommendedPageType: string; allowNonArticle: boolean }[] = Array.isArray(body.topics)
    ? (body.topics as { topicId?: unknown; expectsLinks?: unknown; recommendedPageType?: unknown; allowNonArticle?: unknown }[]).filter((t) => typeof t?.topicId === 'string').map((t) => ({ topicId: t.topicId as string, expectsLinks: t.expectsLinks === true, recommendedPageType: typeof t.recommendedPageType === 'string' ? t.recommendedPageType : 'article', allowNonArticle: t.allowNonArticle === true }))
    : Array.isArray(body.topicIds)
      ? (body.topicIds as unknown[]).filter((x): x is string => typeof x === 'string').map((topicId) => ({ topicId, expectsLinks: false, recommendedPageType: 'article', allowNonArticle: false }))
      : []
  const topics = Array.from(new Map(rawTopics.map((t) => [t.topicId, t])).values()).slice(0, 200)
  if (topics.length === 0) return Response.json({ error: 'no_topics' }, { status: 400 })

  const owned = await authPool(id)
  if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })
  const { auth, pool } = owned

  // Load requested topics in THIS project.
  const { data: topicRows, error: loadErr } = await auth.admin
    .from('article_topics').select('id, status, source').eq('project_id', pool.project_id).in('id', topics.map((t) => t.topicId))
  if (loadErr) {
    if (isMigrationMissing((loadErr as { code?: string }).code)) return Response.json({ error: 'automation_migration_required' }, { status: 503 })
    return Response.json({ error: 'Failed to load topics' }, { status: 500 })
  }
  const rows = (topicRows ?? []) as { id: string; status: string; source: string | null }[]
  const byId = new Map(rows.map((r) => [r.id, r]))

  // Part F — AUTHORITATIVE recommendedPageType from the idea's persisted link_plan
  // (by approved_topic_id), so a non-article opportunity cannot silently enter the
  // ARTICLE queue regardless of what the client sends. Resilient to a pre-migration
  // link_plan column (falls back to the request value / 'article').
  const serverPageType = new Map<string, string>()
  try {
    const { data: ideaRows } = await auth.admin
      .from('content_topic_ideas').select('approved_topic_id, link_plan')
      .eq('project_id', pool.project_id).in('approved_topic_id', topics.map((t) => t.topicId))
    for (const r of (ideaRows ?? []) as { approved_topic_id: string | null; link_plan: unknown }[]) {
      const pt = (r.link_plan && typeof r.link_plan === 'object') ? (r.link_plan as { recommendedPageType?: string }).recommendedPageType : undefined
      if (r.approved_topic_id && typeof pt === 'string') serverPageType.set(r.approved_topic_id, pt)
    }
  } catch { /* pre-migration / column missing → rely on the request value */ }

  // Existing pool items for idempotent enqueue.
  const { data: existing } = await auth.admin.from('article_pool_items').select('topic_id, position').eq('pool_id', pool.id)
  const existingRows = (existing ?? []) as { topic_id: string | null; position: number }[]
  const alreadyIn = new Set(existingRows.map((r) => r.topic_id).filter((x): x is string => !!x))
  let position = existingRows.reduce((m, r) => Math.max(m, r.position), -1)
  const nowIso = new Date().toISOString()

  const results = []
  for (const t of topics) {
    const row = byId.get(t.topicId)
    const outcome: TopicStageOutcomes = { validated: false, linkPlanRequested: t.expectsLinks, linkPlanSaved: false, approved: false, enqueued: false, alreadyQueued: false }
    // 0) Part D/F — a non-article recommendation is never auto-enqueued as an article.
    // The persisted (server-side) page type wins over the request; a deliberate
    // allowNonArticle override is still required to convert it to an article.
    const effectivePageType = serverPageType.get(t.topicId) ?? t.recommendedPageType
    if (effectivePageType !== 'article' && !t.allowNonArticle) { results.push(blockedNonArticle(t.topicId)); continue }
    // 1) validate.
    if (!row) { results.push(classifyTopicOutcome(t.topicId, outcome)); continue }
    outcome.validated = true

    // 2) VERIFY the link plan actually persisted (never enqueue with unsaved links).
    if (t.expectsLinks) {
      const batch = await getLatestBatchForTopic(auth.admin, pool.project_id, t.topicId)
      outcome.linkPlanSaved = !!batch
      if (!outcome.linkPlanSaved) { results.push(classifyTopicOutcome(t.topicId, outcome)); continue }
    }

    // 3) approve (manual+suggested only; already-approved is fine).
    if (isManualSuggested(row)) {
      const { data: upd } = await auth.admin.from('article_topics').update({ status: 'approved', updated_at: nowIso }).eq('id', t.topicId).eq('project_id', pool.project_id).eq('source', 'manual').eq('status', 'suggested').select('id, status')
      outcome.approved = ((upd ?? []) as { status: string }[]).some((r) => r.status === 'approved')
    } else {
      outcome.approved = row.status === 'approved'
    }
    if (!outcome.approved) { results.push(classifyTopicOutcome(t.topicId, outcome)); continue }

    // 4) enqueue (idempotent).
    if (alreadyIn.has(t.topicId)) { outcome.alreadyQueued = true; results.push(classifyTopicOutcome(t.topicId, outcome)); continue }
    const { data: ins, error: insErr } = await auth.admin.from('article_pool_items')
      .insert({ user_id: auth.user.id, project_id: pool.project_id, pool_id: pool.id, topic_id: t.topicId, article_id: null, position: ++position, status: 'queued', updated_at: nowIso })
      .select('id').maybeSingle()
    if (insErr) {
      if ((insErr as { code?: string }).code === '23505') { outcome.alreadyQueued = true }
      else { position--; results.push(classifyTopicOutcome(t.topicId, outcome)); continue }
    } else if (ins) { outcome.enqueued = true; alreadyIn.add(t.topicId) }
    results.push(classifyTopicOutcome(t.topicId, outcome))
  }

  const summary = summarizeBatch(results)
  return Response.json({ ok: summary.ok, added: summary.added, alreadyQueued: summary.alreadyQueued, blockedNonArticle: summary.blockedNonArticle, failed: summary.failed, byState: summary.byState, results }, { status: summary.ok ? 200 : 207 })
}
