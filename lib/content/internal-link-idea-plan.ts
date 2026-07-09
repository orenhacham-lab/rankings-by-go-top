/**
 * Phase 3F.3.2 — turn a topic idea's USER-SELECTED suggested internal links into
 * validated PLANNED plan links for the newly-created topic.
 *
 * Pure validation against the cached scan (no rescan, no planner-scoring change,
 * no insertion): a selected link is kept only when its target exists in the
 * cache, is an internal URL, is eligible (not blocked/ineligible), is not a
 * self/duplicate target, and has a safe anchor. Duplicates are removed. The
 * result is saved as PLANNED links (never approved/inserted) via savePlanBatch.
 */

import { normalizeUrlKey, isInternalUrl, manualAnchorShapeValid } from '@/lib/content/internal-links'
import { selfOrDuplicateReason, planFromCachedTargets, type CachePlannedLink, type CacheTopicPlan, type CacheAnchorSource } from '@/lib/content/internal-link-planner-cache'
import { resolveMoneyTargetFromPlan, type MoneyTargetMatchType } from '@/lib/content/money-target-resolver'
import { deriveTargetAnchorFromMeta, type ScannedTarget } from '@/lib/content/wordpress-content-scan'

export interface SelectedIdeaLink { url: string; anchor: string }

export interface TopicForPlan {
  id: string
  title: string
  primaryKeyword: string | null
  secondaryKeywords: string[]
}

/** Best safe anchor for a target from the selection: the chosen anchor if valid,
 *  else a vetted usable anchor, else the target's clean keyword, else — Phase
 *  3G.6 — a safely DERIVED anchor from the target's own title/slug (validated by
 *  the same CTA/generic rules). Null = truly unusable. */
function resolveAnchor(target: ScannedTarget, chosen: string): { text: string; source: CacheAnchorSource } | null {
  const c = (chosen || '').trim()
  const usable = (target.usableAnchors ?? []).filter((a) => a?.usability === 'yes' && (a.text || '').trim())
  if (c && (usable.some((a) => a.text.toLowerCase() === c.toLowerCase()) || manualAnchorShapeValid(c))) {
    return { text: c, source: 'usable_anchor' }
  }
  const firstUsable = usable[0]?.text?.trim()
  if (firstUsable && manualAnchorShapeValid(firstUsable)) return { text: firstUsable, source: 'usable_anchor' }
  const kw = (target.primaryKeywordCandidate || '').trim()
  if (target.keywordAvailable && kw && manualAnchorShapeValid(kw)) return { text: kw, source: 'target_keyword' }
  const derived = deriveTargetAnchorFromMeta({ targetTitle: target.targetTitle, targetUrl: target.targetUrl })
  if (derived && manualAnchorShapeValid(derived.text)) return derived
  return null
}

export interface IdeaPlanBuildResult {
  links: CachePlannedLink[]
  skipped: { url: string; reason: string }[]
}

/**
 * Build validated PLANNED links from the idea-stage selection. Returns the valid
 * links AND per-link skip reasons (diagnostics). Pure.
 */
export function buildIdeaSelectedPlanLinks(
  topic: TopicForPlan,
  selected: SelectedIdeaLink[],
  targets: ScannedTarget[],
  hosts: string[],
): IdeaPlanBuildResult {
  const targetByKey = new Map<string, ScannedTarget>()
  for (const t of targets) targetByKey.set(normalizeUrlKey(t.targetUrl), t)
  const topicForPlanning = { id: topic.id, title: topic.title, primaryKeyword: topic.primaryKeyword, secondaryKeywords: topic.secondaryKeywords }

  const out: CachePlannedLink[] = []
  const skipped: { url: string; reason: string }[] = []
  const seen = new Set<string>()
  for (const sel of Array.isArray(selected) ? selected : []) {
    const url = (sel?.url || '').trim()
    if (!url) { skipped.push({ url: '', reason: 'empty_url' }); continue }
    const key = normalizeUrlKey(url)
    if (seen.has(key)) { skipped.push({ url, reason: 'duplicate_target' }); continue }
    const target = targetByKey.get(key)
    if (!target) { skipped.push({ url, reason: 'target_not_in_scan' }); continue }
    if (!isInternalUrl(url, hosts)) { skipped.push({ url, reason: 'not_internal' }); continue }
    if (target.eligibility !== 'yes') { skipped.push({ url, reason: `target_ineligible(${target.eligibility})` }); continue }
    const selfDup = selfOrDuplicateReason(topicForPlanning, target)
    if (selfDup) { skipped.push({ url, reason: `self_or_duplicate(${selfDup})` }); continue }
    const anchor = resolveAnchor(target, sel.anchor || '')
    if (!anchor) { skipped.push({ url, reason: 'no_safe_anchor' }); continue }

    seen.add(key)
    out.push({
      targetUrl: target.targetUrl,
      targetTitle: target.targetTitle,
      targetRole: target.targetRole,
      targetPriority: target.targetPriority,
      eligibility: target.eligibility,
      anchorText: anchor.text,
      anchorSource: anchor.source,
      relevance: 0.5,
      priorityBonus: 0,
      confidence: 0.6,
      selected: true,
      reason: 'topic_idea_selection',
      rejectedReasons: [],
      matchedTokens: [],
      missingTokens: [],
      entityMatchedTokens: [],
      normalizedTopicTokens: [],
      normalizedCandidateTokens: [],
      relevanceMethod: 'jaccard',
      reviewability: 'recommended',
      canManualApprove: true,
      blockReason: null,
    })
  }
  return { links: out, skipped }
}

/** Assemble a CacheTopicPlan from validated selection (for savePlanBatch). */
export function ideaSelectedPlan(topic: TopicForPlan, links: CachePlannedLink[]): CacheTopicPlan {
  return { topicId: topic.id, topicTitle: topic.title, primaryKeyword: topic.primaryKeyword, selected: links, rejected: [], summary: 'topic_idea_selection' }
}

export type NoLinkReason =
  | 'valid_no_match'
  | 'low_confidence_only'
  | 'target_type_gap'
  | 'already_linked_or_duplicate'
  | 'planner_error'
  | 'stale_index'

/** Classify WHY a plan produced no selected links (Phase 3F.3.4a). */
export function classifyNoLinkReason(plan: CacheTopicPlan, commerceTargetCount: number): NoLinkReason {
  const rejected = plan.rejected
  if (rejected.length === 0) return 'valid_no_match'
  const isSelfDup = (r: CachePlannedLink) => r.rejectedReasons.some((x) => x.startsWith('self') || x.includes('duplicate') || x.startsWith('too_similar_self'))
  const isLow = (r: CachePlannedLink) => r.rejectedReasons.some((x) => x.startsWith('low_relevance') || x.startsWith('low_confidence'))
  if (rejected.every(isSelfDup)) return 'already_linked_or_duplicate'
  if (rejected.some(isLow)) return commerceTargetCount === 0 ? 'target_type_gap' : 'low_confidence_only'
  return 'valid_no_match'
}

export interface LinkPreview {
  links: { url: string; anchor: string }[]
  reason?: NoLinkReason
  /** Dev diagnostics: top rejected candidates + score explanations. */
  debug?: Record<string, unknown>
}

/** A single previewed link (money target or supporting), with its target title. */
export interface PreviewLink { url: string; anchor: string; title: string }

export interface StructuredLinkPreview {
  /** Best commercial destination for the topic, or null when none is confident. */
  moneyTarget: PreviewLink | null
  /** Supporting internal links (articles/pages/secondary commercial), money target excluded. */
  supportingLinks: PreviewLink[]
  /** Money-target match classification (for the card + diagnostics). */
  moneyTargetMatchType: MoneyTargetMatchType
  moneyTargetConfidence: number
  reason?: NoLinkReason
  debug?: Record<string, unknown>
}

/**
 * Phase 3F.3.6 — resolve the MONEY TARGET first (best commercial destination),
 * then the supporting links, as a structured result. Same planner the drawer
 * uses, run ONCE. Pure; never throws. `max` caps the TOTAL links shown
 * (money target + supporting).
 */
export function previewStructuredLinks(topic: TopicForPlan, targets: ScannedTarget[], hosts: string[], max: number, devDebug = false): StructuredLinkPreview {
  try {
    const plan = planFromCachedTargets(
      { id: topic.id || 'preview', title: topic.title, primaryKeyword: topic.primaryKeyword, secondaryKeywords: topic.secondaryKeywords ?? [] },
      targets, hosts, {},
    )
    const money = resolveMoneyTargetFromPlan(plan)
    const moneyKey = money.moneyTarget ? normalizeUrlKey(money.moneyTarget.targetUrl) : null
    const moneyTarget: PreviewLink | null = money.moneyTarget && (money.moneyTarget.anchorText || '').trim()
      ? { url: money.moneyTarget.targetUrl, anchor: (money.moneyTarget.anchorText || '').trim(), title: money.moneyTarget.targetTitle }
      : null

    const cap = Math.max(1, max)
    const supportingCap = Math.max(0, moneyTarget ? cap - 1 : cap)
    const supportingLinks: PreviewLink[] = plan.selected
      .filter((l) => (l.anchorText || '').trim() && (!moneyKey || normalizeUrlKey(l.targetUrl) !== moneyKey))
      .slice(0, supportingCap)
      .map((l) => ({ url: l.targetUrl, anchor: (l.anchorText || '').trim(), title: l.targetTitle }))

    const byType: Record<string, number> = { category: 0, product: 0, post: 0, page: 0, tag: 0, unknown: 0 }
    for (const t of targets) byType[t.targetType] = (byType[t.targetType] ?? 0) + 1
    const commerce = byType.category + byType.product
    const anyLinks = !!moneyTarget || supportingLinks.length > 0

    const debug = devDebug ? {
      title: topic.title, primaryKeyword: topic.primaryKeyword,
      eligibleTargets: targets.filter((t) => t.eligibility === 'yes').length, targetTypes: byType,
      // Money-target diagnostics (Part D).
      selectedMoneyTarget: moneyTarget ? { url: moneyTarget.url, title: moneyTarget.title, matchType: money.matchType, confidence: money.confidence } : null,
      moneyTargetMatchType: money.matchType,
      moneyTargetConfidence: money.confidence,
      moneyTargetCandidates: money.candidates,
      rejectedMoneyTargets: money.rejected,
      supportingLinksSelected: supportingLinks.map((l) => ({ url: l.url, title: l.title })),
    } : undefined

    return {
      moneyTarget,
      supportingLinks,
      moneyTargetMatchType: money.matchType,
      moneyTargetConfidence: money.confidence,
      reason: anyLinks ? undefined : classifyNoLinkReason(plan, commerce),
      debug,
    }
  } catch {
    return { moneyTarget: null, supportingLinks: [], moneyTargetMatchType: 'no_match', moneyTargetConfidence: 0, reason: 'planner_error' }
  }
}

/**
 * Flat preview (money target first, then supporting) — kept for callers that only
 * need an ordered link list. Delegates to previewStructuredLinks so ordering and
 * diagnostics stay consistent. Pure; never throws.
 */
export function previewPlannerLinks(topic: TopicForPlan, targets: ScannedTarget[], hosts: string[], max: number, devDebug = false): LinkPreview {
  const s = previewStructuredLinks(topic, targets, hosts, max, devDebug)
  const links = [...(s.moneyTarget ? [s.moneyTarget] : []), ...s.supportingLinks]
    .slice(0, max)
    .map(({ url, anchor }) => ({ url, anchor }))
  return { links, reason: s.reason, debug: s.debug }
}
