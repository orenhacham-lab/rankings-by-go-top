/**
 * Cache-backed internal-link planner — Phase 2B (DRY RUN ONLY).
 *
 * Pure, deterministic, side-effect-free. Given a topic and the project's CACHED
 * scan targets (ScannedTarget[] from wordpress_content_index), it decides which
 * targets WOULD be linked and with which anchor — and WHY each was selected or
 * rejected. Writes nothing, generates nothing, inserts nothing.
 *
 * Safety rules:
 *   - only eligibility === 'yes' targets can be selected; 'caution' excluded by
 *     default (allowCaution → included but with a HIGHER confidence bar);
 *     'no' (utility/contact/legal/cart/tag/api/action/malformed/…) NEVER used.
 *   - anchors come ONLY from the scanner's vetted usableAnchors, or a clean
 *     target keyword when keywordAvailable and the shape is valid.
 *   - priority is a BONUS (hub/category > product > post; homepage penalized),
 *     never a floor override — an irrelevant hub still fails the relevance floor.
 *   - SELF/DUPLICATE guard: never link a topic to itself or to an existing
 *     article/target representing the same topic (exact title/keyword, [ours],
 *     or one title contained in the other). Related pages are NOT blocked.
 *   - de-duplicate by URL + anchor, cap per topic, and ZERO links is valid.
 *
 * No AI. No I/O. Reuses the shared deterministic helpers.
 */

import { tokens, jaccard } from '@/lib/content/recommendations/dedupe'
import { manualAnchorShapeValid, isInternalUrl, normalizeHref, normalizeUrlKey } from '@/lib/content/internal-links'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'
import type { TopicForPlanning } from '@/lib/content/internal-link-planner'

/** Bump when the cache-planner scoring/guards change (stamped on saved plans). */
export const CACHE_PLANNER_VERSION = '2b.1'

// --- Tunable thresholds (explicit for review) --------------------------------
export const CACHE_PLANNER_RELEVANCE_MIN = 0.3
export const CACHE_PLANNER_SELF_SIMILARITY_MAX = 0.85
export const CACHE_PLANNER_MIN_CONFIDENCE = 0.45
/** Caution targets (homepage/unknown) must clear a higher bar. */
export const CACHE_PLANNER_CAUTION_MIN_CONFIDENCE = 0.6
export const CACHE_PLANNER_MAX_LINKS = 4

/**
 * Priority BONUS applied to relevance — makes higher-value targets rank first
 * among the relevant ones, without ever letting an irrelevant target through
 * (the relevance floor is enforced independently).
 */
export const PRIORITY_BONUS: Record<string, number> = {
  commercial_category_or_service_hub: 0.15,
  content_hub: 0.12,
  strategic_content_page: 0.08,
  product_or_specific_offer: 0.05,
  post_or_article: 0.05,
  homepage: -0.1,
  other_caution: -0.15,
  ineligible: -1, // defensive; ineligible is filtered out anyway
}

export type CacheAnchorSource = 'usable_anchor' | 'target_keyword'

export interface CachePlannedLink {
  targetUrl: string
  targetTitle: string
  targetRole: string
  targetPriority: string
  eligibility: string
  anchorText: string | null
  anchorSource: CacheAnchorSource | null
  relevance: number
  priorityBonus: number
  confidence: number
  selected: boolean
  reason: string
  rejectedReasons: string[]
}

export interface CacheTopicPlan {
  topicId: string
  topicTitle: string
  primaryKeyword: string | null
  selected: CachePlannedLink[]
  rejected: CachePlannedLink[]
  summary: string
}

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Normalize a title/keyword for comparison: lowercase, strip punctuation, collapse spaces. */
function normText(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[?!.,:;"“”׳״()[\]{}<>«»\-–—/|]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Fraction of the SMALLER token set contained in the larger (subset signal). */
function containment(a: Set<string>, b: Set<string>): number {
  const min = Math.min(a.size, b.size)
  if (!min) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / min
}

/** Containment above this ⇒ one title is (almost) fully inside the other ⇒ same subject. */
const SELF_CONTAINMENT_MAX = 0.8

/**
 * Detect when a candidate target IS the topic being planned (self-link) or an
 * existing article/duplicate of the same topic. Generic signals only — never
 * blocks merely-related pages (a broad category, or a different-angle article).
 * Returns a rejection reason, or null.
 */
function selfOrDuplicateReason(topic: TopicForPlanning, t: ScannedTarget): string | null {
  const topicTitle = normText(topic.title)
  const targetTitle = normText(t.targetTitle)
  if (topicTitle && targetTitle && topicTitle === targetTitle) return 'self_target'

  const topicKw = normText(topic.primaryKeyword)
  const targetKw = normText(t.primaryKeywordCandidate)
  if (topicKw && targetKw && topicKw === targetKw) {
    return t.matchedGeneratedArticleId ? 'existing_same_topic_article' : 'duplicate_topic_target'
  }

  // One title (almost) fully contained in the other — e.g. the topic title plus a
  // generic subtitle ("…: המדריך המלא"). Needs ≥2 shared-scope tokens so a broad
  // one-word target (e.g. a "קיוטו" hub) is NOT caught.
  const a = tokens(topic.title)
  const b = tokens(t.targetTitle)
  if (Math.min(a.size, b.size) >= 2 && containment(a, b) >= SELF_CONTAINMENT_MAX) {
    return t.matchedGeneratedArticleId ? 'existing_same_topic_article' : 'too_similar_to_planned_topic'
  }
  return null
}

/** Best anchor for a target: vetted usableAnchors first, else a clean keyword. */
function chooseAnchor(t: ScannedTarget): { text: string; source: CacheAnchorSource } | null {
  const usable = Array.isArray(t.usableAnchors) ? t.usableAnchors : []
  for (const a of usable) {
    const text = (a?.text || '').trim()
    if (text && manualAnchorShapeValid(text)) return { text, source: 'usable_anchor' }
  }
  const kw = (t.primaryKeywordCandidate || '').trim()
  if (t.keywordAvailable && kw && manualAnchorShapeValid(kw)) return { text: kw, source: 'target_keyword' }
  return null
}

/**
 * Plan internal links for ONE topic against the project's CACHED targets. Pure.
 */
export function planFromCachedTargets(
  topic: TopicForPlanning,
  targets: ScannedTarget[],
  hosts: string[],
  opts: { allowCaution?: boolean } = {},
): CacheTopicPlan {
  const allowCaution = opts.allowCaution === true
  const topicTokens = tokens([topic.primaryKeyword ?? '', topic.title, ...(topic.secondaryKeywords ?? [])].join(' '))
  const topicKeyTokens = tokens(topic.primaryKeyword || topic.title)

  const scored: CachePlannedLink[] = []

  for (const t of targets) {
    const rejectedReasons: string[] = []
    const url = normalizeHref(t.targetUrl)

    // 1) Eligibility gate — ineligible NEVER; caution excluded unless allowed.
    if (t.eligibility === 'no') rejectedReasons.push(`target_ineligible(${t.eligibilityReason})`)
    else if (t.eligibility === 'caution' && !allowCaution) rejectedReasons.push('target_caution_excluded')

    // 2) Internal-only (defensive; scanner already guaranteed it).
    if (!url || !isInternalUrl(url, hosts)) rejectedReasons.push('off_domain_or_empty_url')

    // 2b) Self / duplicate-topic guard — never link a topic to itself or to an
    // existing article/target that represents the SAME topic.
    const selfReason = selfOrDuplicateReason(topic, t)
    if (selfReason) rejectedReasons.push(selfReason)

    // 3) Token relevance topic ↔ target.
    const candTokens = tokens([t.targetTitle, t.primaryKeywordCandidate ?? '', ...(t.usableAnchors ?? []).map((a) => a.text)].join(' '))
    const relevance = round2(jaccard(topicTokens, candTokens))
    if (relevance < CACHE_PLANNER_RELEVANCE_MIN) rejectedReasons.push(`low_relevance(${relevance} < ${CACHE_PLANNER_RELEVANCE_MIN})`)

    // 4) Near-self guard.
    const selfSim = round2(jaccard(topicKeyTokens, tokens(`${t.targetTitle} ${t.primaryKeywordCandidate ?? ''}`)))
    if (selfSim > CACHE_PLANNER_SELF_SIMILARITY_MAX) rejectedReasons.push(`too_similar_self_link(${selfSim})`)

    // 5) Anchor (vetted usable anchor, or a clean available keyword).
    const anchor = chooseAnchor(t)
    if (!anchor) rejectedReasons.push(t.contentSkipped ? 'content_skipped_no_anchors' : 'no_usable_anchor')

    // 6) Confidence = relevance + priority bonus + keyword/anchor bonuses.
    const priorityBonus = PRIORITY_BONUS[t.targetPriority] ?? 0
    const kwBonus = t.keywordAvailable ? 0.1 : 0
    const anchorBonus = anchor?.source === 'usable_anchor' ? 0.1 : 0
    const confidence = round2(clamp01(relevance + priorityBonus + kwBonus + anchorBonus))
    const minConf = t.eligibility === 'caution' ? CACHE_PLANNER_CAUTION_MIN_CONFIDENCE : CACHE_PLANNER_MIN_CONFIDENCE
    if (rejectedReasons.length === 0 && confidence < minConf) rejectedReasons.push(`low_confidence(${confidence} < ${minConf})`)

    const selected = rejectedReasons.length === 0
    const reason = selected
      ? `relevance ${relevance} + priority ${priorityBonus >= 0 ? '+' : ''}${priorityBonus} (${t.targetPriority}); anchor "${anchor!.text}" from ${anchor!.source} (confidence ${confidence})`
      : ''

    scored.push({
      targetUrl: url,
      targetTitle: t.targetTitle,
      targetRole: t.targetRole,
      targetPriority: t.targetPriority,
      eligibility: t.eligibility,
      anchorText: anchor?.text ?? null,
      anchorSource: anchor?.source ?? null,
      relevance,
      priorityBonus,
      confidence,
      selected,
      reason,
      rejectedReasons,
    })
  }

  // Sort selectable by confidence, then de-dup by URL + anchor, then cap.
  const selectedSorted = scored.filter((s) => s.selected).sort((a, b) => b.confidence - a.confidence)
  const seenUrl = new Set<string>()
  const seenAnchor = new Set<string>()
  const finalSelected: CachePlannedLink[] = []
  for (const s of selectedSorted) {
    const urlKey = normalizeUrlKey(s.targetUrl)
    const anchorKey = (s.anchorText ?? '').toLowerCase()
    if (seenUrl.has(urlKey)) { s.selected = false; s.rejectedReasons.push('duplicate_url'); continue }
    if (anchorKey && seenAnchor.has(anchorKey)) { s.selected = false; s.rejectedReasons.push('duplicate_anchor'); continue }
    if (finalSelected.length >= CACHE_PLANNER_MAX_LINKS) { s.selected = false; s.rejectedReasons.push('over_cap'); continue }
    seenUrl.add(urlKey)
    if (anchorKey) seenAnchor.add(anchorKey)
    finalSelected.push(s)
  }

  const rejected = scored.filter((s) => !finalSelected.includes(s)).sort((a, b) => b.confidence - a.confidence)
  const summary = finalSelected.length
    ? `${finalSelected.length} internal link(s) would be planned (of ${targets.length} cached targets).`
    : `0 relevant internal links — this topic would publish WITHOUT internal links (of ${targets.length} cached targets).`

  return { topicId: topic.id, topicTitle: topic.title, primaryKeyword: topic.primaryKeyword, selected: finalSelected, rejected, summary }
}
