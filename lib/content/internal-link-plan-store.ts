/**
 * Internal-link PLAN store (Phase 2C) — INERT persistence/review layer.
 *
 * Reads/writes ONLY article_internal_link_plan_batches + ..._plan_links. Nothing
 * in generation / publishing / cron / queue / approval reads these tables, and
 * 'approved' here is a REVIEW status only (NOT permission to insert links).
 *
 * The save flow re-runs the Phase 2B planner server-side and persists ONLY its
 * selected links — client-provided link payloads are never trusted.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { normalizeUrlKey } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { CacheTopicPlan } from '@/lib/content/internal-link-planner-cache'
import type {
  InternalLinkPlanBatchRow, InternalLinkPlanLinkRow, InternalLinkPlanSubjectType,
} from '@/lib/supabase/types'

type Admin = ReturnType<typeof createAdminClient>

const BATCHES = 'article_internal_link_plan_batches'
const LINKS = 'article_internal_link_plan_links'
const ACTIVE = ['planned', 'approved', 'rejected'] as const

export interface PlanSubject {
  subjectType: InternalLinkPlanSubjectType
  topicId: string | null
  articlePoolItemId: string | null
  generatedArticleId: string | null
}

/** Latest active (non-superseded) batch for a topic, or null. Never throws. */
export async function getLatestBatchForTopic(admin: Admin, projectId: string, topicId: string): Promise<InternalLinkPlanBatchRow | null> {
  try {
    const { data } = await admin
      .from(BATCHES)
      .select('*')
      .eq('project_id', projectId)
      .eq('topic_id', topicId)
      .in('status', ACTIVE as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as InternalLinkPlanBatchRow | null) ?? null
  } catch {
    return null
  }
}

export interface TopicPlanBatchSummary { exists: boolean; linkCount: number; approvedCount: number; stale: boolean }

/**
 * ONE-SHOT owner-scoped saved-plan summaries for EVERY topic in a project (no N+1). Two
 * queries: the latest active batch per topic, then the approved-link counts for those
 * batches. `stale` uses the persisted stale_at_creation (the drawer recomputes live
 * staleness on open). Never throws — a load failure yields an empty map.
 */
export async function loadPlanSummariesForProject(admin: Admin, projectId: string): Promise<Record<string, TopicPlanBatchSummary>> {
  const out: Record<string, TopicPlanBatchSummary> = {}
  try {
    const { data: batchData } = await admin
      .from(BATCHES)
      .select('id, topic_id, link_count, stale_at_creation, created_at')
      .eq('project_id', projectId)
      .in('status', ACTIVE as unknown as string[])
      .order('created_at', { ascending: false })
    const rows = (batchData ?? []) as { id: string; topic_id: string | null; link_count: number | null; stale_at_creation: boolean | null }[]
    // latest active batch per topic (rows are created_at desc → first seen wins).
    const latestByTopic = new Map<string, { id: string; linkCount: number; stale: boolean }>()
    for (const b of rows) {
      if (!b.topic_id || latestByTopic.has(b.topic_id)) continue
      latestByTopic.set(b.topic_id, { id: b.id, linkCount: b.link_count ?? 0, stale: !!b.stale_at_creation })
    }
    const batchIds = [...latestByTopic.values()].map((b) => b.id)
    const approvedByBatch = new Map<string, number>()
    if (batchIds.length) {
      const { data: linkData } = await admin.from(LINKS).select('batch_id').eq('status', 'approved').in('batch_id', batchIds)
      for (const l of (linkData ?? []) as { batch_id: string }[]) approvedByBatch.set(l.batch_id, (approvedByBatch.get(l.batch_id) ?? 0) + 1)
    }
    for (const [topicId, b] of latestByTopic) out[topicId] = { exists: true, linkCount: b.linkCount, approvedCount: approvedByBatch.get(b.id) ?? 0, stale: b.stale }
  } catch { /* best-effort → empty map */ }
  return out
}

/**
 * Approve (review-status only) the still-'planned' links of a saved batch. Sets
 * status planned→approved. NEVER touches article content / generation / apply.
 * Returns the count approved. Never throws.
 */
export async function approveBatchLinks(admin: Admin, projectId: string, batchId: string): Promise<number> {
  const nowIso = new Date().toISOString()
  try {
    const { data } = await admin
      .from(LINKS)
      .update({ status: 'approved', updated_at: nowIso })
      .eq('project_id', projectId)
      .eq('batch_id', batchId)
      .eq('status', 'planned')
      .select('id')
    return ((data ?? []) as { id: string }[]).length
  } catch {
    return 0
  }
}

export async function getBatchLinks(admin: Admin, batchId: string): Promise<InternalLinkPlanLinkRow[]> {
  try {
    const { data } = await admin.from(LINKS).select('*').eq('batch_id', batchId).order('confidence', { ascending: false })
    return (data as InternalLinkPlanLinkRow[]) ?? []
  } catch {
    return []
  }
}

/** Mark the subject's previous active batches (and their links) superseded. Never deletes. */
export async function supersedePreviousBatches(admin: Admin, projectId: string, topicId: string): Promise<void> {
  const nowIso = new Date().toISOString()
  try {
    const { data } = await admin
      .from(BATCHES)
      .update({ status: 'superseded', updated_at: nowIso })
      .eq('project_id', projectId)
      .eq('topic_id', topicId)
      .in('status', ACTIVE as unknown as string[])
      .select('id')
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
    if (ids.length) {
      await admin.from(LINKS).update({ status: 'superseded', updated_at: nowIso }).in('batch_id', ids)
    }
  } catch {
    /* best-effort */
  }
}

export interface SavePlanArgs {
  projectId: string
  userId: string
  subject: PlanSubject
  topicTitle: string
  primaryKeyword: string | null
  plan: CacheTopicPlan
  plannerVersion: string
  cacheScannerVersion: string | null
  cacheScanCompletedAt: string | null
  cacheState: string
  allowCaution: boolean
  strict: boolean
  staleAtCreation: boolean
  warnings: string[]
}

/**
 * Persist one plan batch + its SELECTED links (zero links → a batch with
 * link_count 0). Previous active batches for the subject are superseded first.
 * Returns the new batch id, or null on failure. Never throws.
 */
export async function savePlanBatch(admin: Admin, args: SavePlanArgs): Promise<string | null> {
  const { subject, plan } = args
  const selected = plan.selected
  const nowIso = new Date().toISOString()

  if (subject.topicId) await supersedePreviousBatches(admin, args.projectId, subject.topicId)

  try {
    const { data: batch, error } = await admin
      .from(BATCHES)
      .insert({
        user_id: args.userId,
        project_id: args.projectId,
        topic_id: subject.topicId,
        article_pool_item_id: subject.articlePoolItemId,
        generated_article_id: subject.generatedArticleId,
        subject_type: subject.subjectType,
        subject_title_snapshot: args.topicTitle,
        primary_keyword_snapshot: args.primaryKeyword,
        planner_version: args.plannerVersion,
        cache_scanner_version: args.cacheScannerVersion,
        cache_scan_completed_at: args.cacheScanCompletedAt,
        cache_state: args.cacheState,
        allow_caution: args.allowCaution,
        strict: args.strict,
        stale_at_creation: args.staleAtCreation,
        status: 'planned',
        link_count: selected.length,
        selected_count: selected.length,
        rejected_count: plan.rejected.length,
        diagnostics_summary: { totalCandidates: selected.length + plan.rejected.length, summary: plan.summary },
        warnings: args.warnings,
        updated_at: nowIso,
      })
      .select('id')
      .single()
    if (error || !batch) {
      console.error('[ilp-store] batch insert failed', { message: (error as { message?: string })?.message })
      return null
    }
    const batchId = (batch as { id: string }).id

    if (selected.length) {
      const rows = selected.map((l) => ({
        batch_id: batchId,
        user_id: args.userId,
        project_id: args.projectId,
        topic_id: subject.topicId,
        article_pool_item_id: subject.articlePoolItemId,
        generated_article_id: subject.generatedArticleId,
        target_url: l.targetUrl,
        target_title: l.targetTitle,
        target_role: l.targetRole,
        target_priority: l.targetPriority,
        anchor_text: l.anchorText,
        anchor_source: l.anchorSource,
        confidence: l.confidence,
        relevance: l.relevance,
        reason: l.reason,
        status: 'planned' as const,
        updated_at: nowIso,
      }))
      const { error: linkErr } = await admin.from(LINKS).insert(rows)
      if (linkErr) console.error('[ilp-store] links insert failed', { message: linkErr.message })
    }
    return batchId
  } catch (e) {
    console.error('[ilp-store] savePlanBatch threw', { message: e instanceof Error ? e.message : String(e) })
    return null
  }
}

export interface StalenessResult {
  stale: boolean
  reasons: string[]
}

/**
 * Compute staleness of a saved batch vs the CURRENT cache + topic. Advisory only
 * — a later phase must refuse to act on a stale plan; 2C just flags it.
 */
export function evaluateStaleness(
  batch: InternalLinkPlanBatchRow,
  links: InternalLinkPlanLinkRow[],
  current: {
    cacheScanCompletedAt: string | null
    cacheScannerVersion: string | null
    topicTitle: string | null
    topicPrimaryKeyword: string | null
    targets: ScannedTarget[]
  },
): StalenessResult {
  const reasons: string[] = []

  const batchScan = batch.cache_scan_completed_at ? new Date(batch.cache_scan_completed_at).getTime() : 0
  const curScan = current.cacheScanCompletedAt ? new Date(current.cacheScanCompletedAt).getTime() : 0
  if (curScan && batchScan && curScan > batchScan) reasons.push('cache_rescanned')

  if (current.cacheScannerVersion && batch.cache_scanner_version && current.cacheScannerVersion !== batch.cache_scanner_version) {
    reasons.push('cache_version_changed')
  }

  // Topic changed = PLANNING-RELEVANT fields differ from the batch snapshots.
  // NOT article_topics.updated_at — that bumps for operational reasons (e.g. a
  // generated article being linked to the topic) without touching title/keyword,
  // which must not invalidate an approved plan.
  const normSnap = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim()
  const curTitle = normSnap(current.topicTitle)
  const snapTitle = normSnap(batch.subject_title_snapshot)
  const curKw = normSnap(current.topicPrimaryKeyword)
  const snapKw = normSnap(batch.primary_keyword_snapshot)
  const titleChanged = !!snapTitle && !!curTitle && curTitle !== snapTitle
  const keywordChanged = curKw !== snapKw
  if (titleChanged || keywordChanged) reasons.push('topic_changed')

  // Phase 3G.5 — `stale` is PLAN-LEVEL only (cache rescanned / scanner version /
  // topic changed). Everything above this line contributes to it.
  const planLevelReasons = reasons.length

  // Target URL disappeared from / became ineligible in the current cache —
  // reported per-plan for DIAGNOSTICS, but it no longer flips `stale`: one bad
  // target must not poison the whole plan (blocking generation guidance and the
  // auto-apply of every OTHER, still-valid approved link). The insertion
  // evaluator and generation guidance handle these PER LINK (target_in_cache /
  // target_eligible), which is both precise and explainable.
  const byKey = new Map<string, ScannedTarget>()
  for (const t of current.targets) byKey.set(normalizeUrlKey(t.targetUrl), t)
  let missing = 0
  let ineligible = 0
  for (const l of links) {
    if (l.status === 'superseded' || l.status === 'rejected') continue
    const t = byKey.get(normalizeUrlKey(l.target_url))
    if (!t) missing++
    else if (t.eligibility !== 'yes') ineligible++
  }
  if (missing) reasons.push(`target_missing(${missing})`)
  if (ineligible) reasons.push(`target_now_ineligible(${ineligible})`)

  return { stale: planLevelReasons > 0, reasons }
}
