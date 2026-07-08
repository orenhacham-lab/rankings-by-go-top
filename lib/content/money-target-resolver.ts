/**
 * Money Target Resolver — Phase 3F.3.6.
 *
 * Picks the single BEST commercial destination (product category / product /
 * commercial hub) for a topic BEFORE supporting links are chosen. It works ONLY
 * on the site's own indexed commercial targets and derives the relationship from
 * their title / keyword / slug (via the Phase 3F.3.5 semantic matcher) — never a
 * hardcoded term map. Supporting articles/pages are deliberately excluded from
 * this pool so a related article can never win over the right category/product.
 *
 * Pure: it consumes an already-scored CacheTopicPlan (or runs the planner once)
 * and returns a structured result — the highest-tier commercial match, its match
 * type + confidence, and the rejected commercial candidates with reasons. It NEVER
 * forces a money target: weak / generic-only / broad-unconfident matches yield
 * `moneyTarget: null` so the caller can fall back to supporting links.
 */

import {
  planFromCachedTargets,
  type CachePlannedLink,
  type CacheTopicPlan,
  type SemanticMatchType,
} from '@/lib/content/internal-link-planner-cache'
import type { TopicForPlanning } from '@/lib/content/internal-link-planner'
import type { ScannedTarget } from '@/lib/content/wordpress-content-scan'

/** A money target must clear at least this confidence unless the planner already
 *  SELECTED it (i.e. it passed the relevance/confidence floors). */
export const MONEY_TARGET_MIN_CONFIDENCE = 0.5

export type MoneyTargetMatchType =
  | 'exact_product_category'
  | 'exact_product'
  | 'exact_slug'
  | 'stem_category'
  | 'parent_category_fallback'
  | 'no_match'

export type MoneyTargetRejectReason =
  | 'weak_product_match'
  | 'generic_only_match'
  | 'broad_fallback_not_confident'
  | 'wrong_target_type'
  | 'no_commercial_target'

export interface MoneyTargetCandidateDebug {
  title: string
  url: string
  targetType: string
  semanticMatchType: SemanticMatchType
  confidence: number
  relevance: number
  matchedTopicTerms: string[]
  matchedTargetTerms: string[]
  targetSourceFields: string[]
  selected: boolean
  tier: number
}

export interface MoneyTargetResult {
  /** The chosen commercial link (with a usable anchor), or null when none is confident. */
  moneyTarget: CachePlannedLink | null
  matchType: MoneyTargetMatchType
  confidence: number
  /** Top commercial candidates (ranked) for dev diagnostics. */
  candidates: MoneyTargetCandidateDebug[]
  /** Commercial candidates that were NOT chosen, with a reason. */
  rejected: { title: string; url: string; reason: MoneyTargetRejectReason; semanticMatchType: SemanticMatchType; confidence: number }[]
}

/** True when a planned link points at a commercial destination (category / product). */
export function isCommercialLink(l: CachePlannedLink): boolean {
  return l.targetPriority === 'commercial_category_or_service_hub' || l.targetPriority === 'product_or_specific_offer'
}
const isProductLink = (l: CachePlannedLink): boolean => l.targetPriority === 'product_or_specific_offer'

/**
 * Money-target TIER (lower = better). Only these semantic match types can be a
 * money target; everything else (weak_match / article_fallback / stem_phrase /
 * none) is treated as non-commercial-grade and excluded.
 *   1 exact phrase → 2 strong product/category noun → 3 slug → 4 broad/parent fallback
 */
function moneyTier(mt: SemanticMatchType): number {
  switch (mt) {
    case 'exact_phrase': return 1
    case 'product_match': return 2
    case 'taxonomy_relation': return 2
    case 'slug_match': return 3
    case 'parent_category': return 4
    case 'broad_category_fallback': return 4
    default: return 99
  }
}

function toMatchType(l: CachePlannedLink): MoneyTargetMatchType {
  switch (l.semanticMatchType) {
    case 'exact_phrase': return isProductLink(l) ? 'exact_product' : 'exact_product_category'
    case 'product_match': return 'exact_product'
    case 'taxonomy_relation': return 'stem_category'
    case 'slug_match': return 'exact_slug'
    case 'parent_category':
    case 'broad_category_fallback': return 'parent_category_fallback'
    default: return 'no_match'
  }
}

function rejectReason(l: CachePlannedLink): MoneyTargetRejectReason {
  const tier = moneyTier(l.semanticMatchType ?? 'none')
  if (tier === 99) return (l.matchedTokens?.length ?? 0) === 0 ? 'generic_only_match' : 'weak_product_match'
  if (tier === 4) return 'broad_fallback_not_confident'
  return 'weak_product_match'
}

/**
 * Resolve the best money target from an ALREADY-SCORED plan. Commercial-only pool;
 * strict tiers; fallback (parent/broad) accepted only when the planner actually
 * selected it (passed the floors). Returns null when nothing is confident enough.
 */
export function resolveMoneyTargetFromPlan(plan: CacheTopicPlan): MoneyTargetResult {
  const commercial = [...plan.selected, ...plan.rejected].filter(isCommercialLink)
  if (commercial.length === 0) {
    return { moneyTarget: null, matchType: 'no_match', confidence: 0, candidates: [], rejected: [] }
  }

  const scored = commercial.map((l) => ({ l, tier: moneyTier(l.semanticMatchType ?? 'none') }))
  // Eligible: usable anchor + an eligible tier + confident enough. Exact/strong/slug
  // tiers accept a SELECTED link OR one clearing the money-target confidence bar;
  // the broad/parent fallback (tier 4) is accepted ONLY when the planner selected it
  // — we never invent a broad guess the planner itself rejected.
  const eligible = scored.filter(({ l, tier }) =>
    tier <= 4 && (l.anchorText || '').trim() && (tier <= 3 ? (l.selected || l.confidence >= MONEY_TARGET_MIN_CONFIDENCE) : l.selected),
  )
  eligible.sort((a, b) => a.tier - b.tier || b.l.confidence - a.l.confidence)
  const best = eligible[0]?.l ?? null

  const rankedAll = [...scored].sort((a, b) => a.tier - b.tier || b.l.confidence - a.l.confidence)
  const candidates: MoneyTargetCandidateDebug[] = rankedAll.slice(0, 10).map(({ l, tier }) => ({
    title: l.targetTitle, url: l.targetUrl,
    targetType: isProductLink(l) ? 'product' : 'category',
    semanticMatchType: l.semanticMatchType ?? 'none', confidence: l.confidence, relevance: l.relevance,
    matchedTopicTerms: l.matchedTokens ?? [], matchedTargetTerms: l.matchedTargetTerms ?? [],
    targetSourceFields: l.matchedSourceFields ?? [], selected: l.selected, tier,
  }))
  const rejected = commercial
    .filter((l) => l !== best)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map((l) => ({ title: l.targetTitle, url: l.targetUrl, reason: rejectReason(l), semanticMatchType: l.semanticMatchType ?? 'none', confidence: l.confidence }))

  return {
    moneyTarget: best,
    matchType: best ? toMatchType(best) : 'no_match',
    confidence: best?.confidence ?? 0,
    candidates,
    rejected,
  }
}

/**
 * Convenience: run the planner ONCE for a topic and resolve its money target.
 * (Matches the Part A signature: topic fields + the project's index targets.)
 */
export function resolveMoneyTargetForTopic(
  topic: TopicForPlanning,
  targets: ScannedTarget[],
  hosts: string[],
  opts: { allowCaution?: boolean } = {},
): { plan: CacheTopicPlan; money: MoneyTargetResult } {
  const plan = planFromCachedTargets(topic, targets, hosts, opts)
  return { plan, money: resolveMoneyTargetFromPlan(plan) }
}
