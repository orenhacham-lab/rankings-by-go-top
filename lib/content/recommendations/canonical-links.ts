/**
 * ONE canonical source of truth for a recommendation's internal-link PREVIEW.
 *
 * The recommendation/idea engine produces `suggestedInternalLinks` from its link-role mapper
 * (model/evidence driven). The authoritative internal-link planner — `planFromCachedTargets`,
 * the same pure function GET /internal-links/plan and bulk-save use — may accept a different
 * set. When the card shows the mapper's links but bulk-save validates the planner's, a
 * checked card link can come back `not_in_plan`/`blocked` (the live dropped_link failure).
 *
 * This module re-derives the card's selectable links from `planFromCachedTargets` against the
 * SAME cached index, so the links a user checks are exactly the links bulk-save will persist.
 * It changes ONLY the internal-link preview (+ records the cache identity) — never the topic
 * title, primary keyword, secondary keywords, score, acceptance, or count.
 */
import { planFromCachedTargets, type CacheTopicPlan } from '@/lib/content/internal-link-planner-cache'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { TopicSuggestion, SuggestedInternalLink } from './types'

export interface CanonicalLinkContext {
  targets: ScannedTarget[]
  hosts: string[]
  scannerVersion: string | null
  scanCompletedAt: string | null
}

export interface CanonicalCardLinks {
  /** Recommended (auto-selected) links — checked by default on the card. */
  selected: SuggestedInternalLink[]
  /** Safe manual-approvable candidates — exposed only when the UI intentionally allows it. */
  reviewable: SuggestedInternalLink[]
}

const toPair = (l: { targetUrl: string; anchorText: string | null }): SuggestedInternalLink | null =>
  l.targetUrl && l.anchorText && l.anchorText.trim() ? { url: l.targetUrl, anchor: l.anchorText } : null

/**
 * Selectable card links from a planner plan: the recommended `selected` pool and — only when
 * `exposeReviewable` — the SAFE `reviewable && canManualApprove` pool. A `blocked` candidate
 * is NEVER selectable/checked.
 */
export function canonicalCardLinksFromPlan(plan: CacheTopicPlan, opts: { exposeReviewable?: boolean } = {}): CanonicalCardLinks {
  const selected = plan.selected.map(toPair).filter((x): x is SuggestedInternalLink => !!x)
  const reviewable = opts.exposeReviewable
    ? plan.rejected.filter((r) => r.reviewability === 'reviewable' && r.canManualApprove).map(toPair).filter((x): x is SuggestedInternalLink => !!x)
    : []
  // De-dupe by URL, keeping the recommended entry over a reviewable duplicate.
  const seen = new Set(selected.map((l) => l.url))
  return { selected, reviewable: reviewable.filter((l) => !seen.has(l.url)) }
}

/**
 * Replace a suggestion's internal-link PREVIEW with the canonical planner output for the SAME
 * cached index, and stamp the cache snapshot the preview came from. Only `suggestedInternalLinks`
 * and `linkPreviewSnapshot` change; every recommendation field is preserved.
 */
export function canonicalizeSuggestionLinks(s: TopicSuggestion, ctx: CanonicalLinkContext, opts: { exposeReviewable?: boolean } = {}): TopicSuggestion {
  const plan = planFromCachedTargets(
    { id: s.id, title: s.title, primaryKeyword: s.primaryKeyword, secondaryKeywords: s.secondaryKeywords ?? [] },
    ctx.targets, ctx.hosts, { allowCaution: false },
  )
  const canon = canonicalCardLinksFromPlan(plan, opts)
  return {
    ...s,
    suggestedInternalLinks: canon.selected,
    linkPreviewSnapshot: { scannerVersion: ctx.scannerVersion, scanCompletedAt: ctx.scanCompletedAt },
  }
}
