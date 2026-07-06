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
    topicUpdatedAt: string | null
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

  const topicUpd = current.topicUpdatedAt ? new Date(current.topicUpdatedAt).getTime() : 0
  const created = batch.created_at ? new Date(batch.created_at).getTime() : 0
  if (topicUpd && created && topicUpd > created) reasons.push('topic_changed')

  // Target URL disappeared from / became ineligible in the current cache.
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

  return { stale: reasons.length > 0, reasons }
}
