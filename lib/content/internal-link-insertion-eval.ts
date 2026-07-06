/**
 * Shared read-only evaluation for internal-link insertion preview/apply.
 *
 * Runs the SAME revalidation + natural-only placement (non-mutating) for a
 * draft's APPROVED plan links, so the preview and the apply token are computed
 * from identical logic. Pure aside from the read calls; writes nothing.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getCachedIndex, reassembleReport, isStale, isVersionStale } from '@/lib/content/wordpress-content-index'
import { getLatestBatchForTopic, getBatchLinks, evaluateStaleness } from '@/lib/content/internal-link-plan-store'
import { selfOrDuplicateReason } from '@/lib/content/internal-link-planner-cache'
import { findNaturalAnchorPlacement, sha256, type OccurrenceEval } from '@/lib/content/internal-link-insertion'
import { isInternalUrl, isUrlAlreadyLinked, normalizeUrlKey, manualAnchorShapeValid } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { InternalLinkPlanBatchRow, InternalLinkPlanLinkRow } from '@/lib/supabase/types'

type Admin = ReturnType<typeof createAdminClient>

export interface EvalItem {
  linkId: string
  targetUrl: string
  anchorText: string
  status: 'would_insert' | 'skipped'
  reason: string | undefined
  sentencePreview: string | null
  checks: Record<string, boolean>
  // Response-only placement diagnostics (no UI depends on these).
  placement?: {
    occurrenceCount: number
    evaluatedOccurrences: OccurrenceEval[]
    selectedOccurrenceIndex: number | null
    wordCountBefore: number | null
  }
}

export interface EvalResult {
  batch: InternalLinkPlanBatchRow | null
  approvedLinks: InternalLinkPlanLinkRow[]
  items: EvalItem[]
  wouldInsert: { linkId: string; anchorText: string; targetUrl: string }[]
  cacheRow: Awaited<ReturnType<typeof getCachedIndex>>
  cacheStale: boolean
  cacheVersionStale: boolean
  planStale: boolean
  planStaleReasons: string[]
  contentChecksum: string
  linksChecksum: string
  reason?: 'no_plan_batch' | 'no_approved_links'
}

export interface EvalArticle {
  topicId: string | null
  contentHtml: string
  internalLinksJson: unknown
}

/** Evaluate approved plan links for a draft (non-mutating). */
export async function evaluateApprovedLinks(admin: Admin, projectId: string, article: EvalArticle): Promise<EvalResult> {
  const html = article.contentHtml || ''
  const contentChecksum = sha256(html)
  const linksChecksum = sha256(JSON.stringify(article.internalLinksJson ?? null))
  const topicId = article.topicId

  const empty = (reason: EvalResult['reason'], batch: InternalLinkPlanBatchRow | null): EvalResult => ({
    batch, approvedLinks: [], items: [], wouldInsert: [], cacheRow: null,
    cacheStale: true, cacheVersionStale: true, planStale: false, planStaleReasons: [],
    contentChecksum, linksChecksum, reason,
  })

  if (!topicId) return empty('no_plan_batch', null)
  const batch = await getLatestBatchForTopic(admin, projectId, topicId)
  if (!batch) return empty('no_plan_batch', null)
  const allLinks = await getBatchLinks(admin, batch.id)
  const approved = allLinks.filter((l) => l.status === 'approved')
  if (approved.length === 0) return { ...empty('no_approved_links', batch), approvedLinks: [] }

  const cacheRow = await getCachedIndex(admin, projectId)
  const report = cacheRow ? reassembleReport(cacheRow) : null
  const targets = (report?.targets ?? []) as ScannedTarget[]
  const hosts = report?.hosts ?? []
  const targetByKey = new Map<string, ScannedTarget>()
  for (const t of targets) targetByKey.set(normalizeUrlKey(t.targetUrl), t)

  const cacheStale = !cacheRow || isStale(cacheRow)
  const cacheVersionStale = !cacheRow || isVersionStale(cacheRow)

  const { data: topicRow } = await admin.from('article_topics').select('id, topic, primary_keyword, secondary_keywords, updated_at').eq('id', topicId).maybeSingle()
  const topic = topicRow as { topic: string; primary_keyword: string | null; secondary_keywords: string[] | null; updated_at: string } | null
  const topicForPlanning = { id: topicId, title: topic?.topic ?? '', primaryKeyword: topic?.primary_keyword ?? null, secondaryKeywords: Array.isArray(topic?.secondary_keywords) ? topic!.secondary_keywords! : [] }

  const staleness = evaluateStaleness(batch, allLinks, {
    cacheScanCompletedAt: cacheRow?.scan_completed_at ?? null,
    cacheScannerVersion: cacheRow?.scanner_version ?? null,
    topicTitle: topic?.topic ?? null,
    topicPrimaryKeyword: topic?.primary_keyword ?? null,
    targets,
  })

  const usedWordOffsets: number[] = []
  const items: EvalItem[] = approved
    .slice()
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map((l) => {
      const url = l.target_url
      const anchor = l.anchor_text || ''
      const target = targetByKey.get(normalizeUrlKey(url))
      const selfReason = target && topic ? selfOrDuplicateReason(topicForPlanning, target) : null
      const anchorClean = !!target && ((target.usableAnchors ?? []).some((a) => a.text.toLowerCase() === anchor.toLowerCase()) || manualAnchorShapeValid(anchor))

      const checks: Record<string, boolean> = {
        status_approved: l.status === 'approved',
        batch_latest: batch.status === 'planned' || batch.status === 'approved' || batch.status === 'rejected',
        plan_not_stale: !staleness.stale,
        cache_not_stale: !cacheStale,
        cache_version_ok: !cacheVersionStale,
        target_in_cache: !!target,
        target_eligible: target?.eligibility === 'yes',
        not_self_or_duplicate: !selfReason,
        anchor_clean: anchorClean,
        url_internal: isInternalUrl(url, hosts),
        not_already_linked: !isUrlAlreadyLinked(html, url),
        natural_placement: false,
      }

      let skipReason: string | undefined
      if (!checks.plan_not_stale) skipReason = 'plan_stale'
      else if (!checks.cache_not_stale) skipReason = 'cache_stale'
      else if (!checks.cache_version_ok) skipReason = 'cache_version_stale'
      else if (!checks.target_in_cache) skipReason = 'target_missing_from_cache'
      else if (!checks.target_eligible) skipReason = 'target_now_ineligible'
      else if (!checks.not_self_or_duplicate) skipReason = `self_or_duplicate_target(${selfReason})`
      else if (!checks.anchor_clean) skipReason = 'anchor_no_longer_clean'
      else if (!checks.url_internal) skipReason = 'target_not_internal'
      else if (!checks.not_already_linked) skipReason = 'target_already_linked'

      if (skipReason) return { linkId: l.id, targetUrl: url, anchorText: anchor, status: 'skipped', reason: skipReason, sentencePreview: null, checks }

      const placement = findNaturalAnchorPlacement(html, anchor, usedWordOffsets)
      const diag = {
        occurrenceCount: placement.occurrenceCount ?? 0,
        evaluatedOccurrences: placement.evaluatedOccurrences ?? [],
        selectedOccurrenceIndex: placement.selectedOccurrenceIndex ?? null,
        wordCountBefore: placement.wordOffset ?? null,
      }
      if (!placement.found) return { linkId: l.id, targetUrl: url, anchorText: anchor, status: 'skipped', reason: placement.skipReason, sentencePreview: null, checks, placement: diag }
      checks.natural_placement = true
      usedWordOffsets.push(placement.wordOffset ?? 0)
      return { linkId: l.id, targetUrl: url, anchorText: anchor, status: 'would_insert', reason: 'safe_prose_occurrence_found', sentencePreview: placement.sentence ?? null, checks, placement: diag }
    })

  const wouldInsert = items.filter((i) => i.status === 'would_insert').map((i) => ({ linkId: i.linkId, anchorText: i.anchorText, targetUrl: i.targetUrl }))

  return {
    batch, approvedLinks: approved, items, wouldInsert,
    cacheRow, cacheStale, cacheVersionStale,
    planStale: staleness.stale, planStaleReasons: staleness.reasons,
    contentChecksum, linksChecksum,
  }
}
