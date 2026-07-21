/**
 * Content-opportunity model — the domain-neutral core of the evidence→opportunity
 * →article architecture. PURE (no model, no DB, no network, no hardcoded industry
 * words). A recommendation must represent a real user/search NEED, not an existing
 * entity name re-expressed. This module provides:
 *   - the typed ContentOpportunity structure + opportunity types + rejection reasons;
 *   - assessCannibalization()  (G) — multi-signal REJECT / ALLOW / REVIEW;
 *   - evaluateArticleWorthiness() (F) — the deterministic persistence gate.
 * The nuanced "weak vs strong modifier" judgment is left to model synthesis + the
 * restructured prompt; this layer is the provably-safe deterministic backstop.
 */

import { tokens, jaccard } from './dedupe'
import { normalizePhrase } from './keyword-guard'

/** Domain-neutral opportunity types. "product article" is deliberately NOT one. */
export const OPPORTUNITY_TYPES = [
  'question_how_to', 'comparison', 'selection_guide', 'troubleshooting',
  'care_maintenance', 'use_case', 'audience_need', 'occasion_scenario',
  'seasonal_demand', 'terminology_educational', 'category_guide',
  'local_informational', 'supporting_commercial', 'content_cluster_gap',
] as const
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number]

export type RejectionReason =
  | 'exact_existing_keyword_owner'
  | 'same_intent_existing_page'
  | 'weak_entity_modifier'
  | 'insufficient_independent_need'
  | 'insufficient_content_depth'
  | 'unsupported_by_evidence'
  | 'already_covered'
  | 'duplicate_pending_topic'
  | 'low_business_relevance'
  | 'source_only_entity_expansion'

export type SearchIntent = 'informational' | 'commercial' | 'comparison' | 'transactional' | 'local' | 'other'

export interface ContentOpportunity {
  opportunity_id: string
  opportunity_type: OpportunityType
  core_topic: string
  primary_keyword: string
  secondary_keywords: string[]
  search_intent: SearchIntent
  audience_or_context: string | null
  user_problem_or_question: string | null
  expected_answer: string | null
  proposed_content_format: string | null
  supporting_evidence: string[]
  demand_signals: string[]
  project_relevance_signals: string[]
  existing_coverage_signals: string[]
  commercial_entities: string[]
  cannibalization_risk: 'none' | 'low' | 'review' | 'high'
  distinctiveness_score: number
  business_value_score: number
  evidence_confidence: number
  article_worthiness: boolean
  rejection_reason?: RejectionReason
}

// ── shared token helpers (domain-neutral) ────────────────────────────────────
/** Generic, industry-agnostic modifier tokens (commercial/quality/logistics) that
 *  do NOT create a distinct content need. Canonical-normalized. NOT topic words. */
export const GENERIC_TOKENS = new Set<string>(
  ['best', 'guide', 'price', 'buy', 'cheap', 'top', 'online', 'review', 'reviews',
   'מדריך', 'מומלץ', 'מומלצת', 'מומלצים', 'איכותי', 'איכותית', 'מחיר', 'מחירים',
   'משלוח', 'הטוב', 'ביותר', 'הכי', 'טוב', 'טובה', 'זול', 'זולה', 'לקנות', 'קניה',
   'קנייה', 'אונליין'].map((t) => normalizePhrase(t)).filter(Boolean),
)
const kwTokens = (s: string | null | undefined): string[] => Array.from(tokens(normalizePhrase(s || '')))

// ── G. cannibalization (multi-signal, domain-neutral) ────────────────────────
export interface ExistingPageSignal {
  /** Normalized name/keyword the page owns. */
  name: string
  /** Page kind — commercial pages own commercial/transactional queries strongly. */
  pageType?: 'product' | 'category' | 'page' | 'service' | 'post' | 'article' | 'unknown'
  /** The page's own search intent when known. */
  intent?: SearchIntent
}
export type CannibalizationOutcome = 'reject' | 'allow_distinct' | 'review'
export interface CannibalizationResult {
  outcome: CannibalizationOutcome
  reason: string
  matchedName?: string
  /** 0..1 keyword overlap with the matched page. */
  overlap: number
}

const COMMERCIAL_INTENTS = new Set<SearchIntent>(['commercial', 'transactional'])

/**
 * Decide whether a candidate cannibalizes an existing page. Signals: exact
 * normalized equality, full token-containment of the entity name inside the
 * candidate with no added distinct token, intent match, and keyword overlap.
 * Never rejects a candidate merely for CONTAINING an entity; never allows a
 * candidate that only re-expresses the entity (+ generics).
 */
export function assessCannibalization(candidatePrimaryKeyword: string, candidateIntent: SearchIntent, pages: ExistingPageSignal[]): CannibalizationResult {
  const cand = normalizePhrase(candidatePrimaryKeyword)
  if (!cand) return { outcome: 'review', reason: 'empty_candidate', overlap: 0 }
  const candToks = kwTokens(cand)
  const candSet = new Set(candToks)

  let best: CannibalizationResult = { outcome: 'allow_distinct', reason: 'no_matching_page', overlap: 0 }
  for (const p of pages) {
    const name = normalizePhrase(p.name)
    if (!name) continue
    const nameToks = kwTokens(name)
    if (nameToks.length === 0) continue
    const overlap = jaccard(new Set(candToks), new Set(nameToks))

    // 1) exact query equality → hard reject.
    if (cand === name) return { outcome: 'reject', reason: 'exact_keyword_equality', matchedName: p.name, overlap: 1 }

    // 2) the entity name is fully contained AND the candidate adds only generic
    //    tokens (no distinct need token) → same query re-expressed → reject.
    const nameContained = nameToks.every((t) => candSet.has(t))
    if (nameContained) {
      const residual = candToks.filter((t) => !nameToks.includes(t))
      const meaningfulResidual = residual.filter((t) => !GENERIC_TOKENS.has(t))
      if (meaningfulResidual.length === 0) {
        return { outcome: 'reject', reason: 'entity_plus_generic_only', matchedName: p.name, overlap }
      }
      // Entity contained + a real added token: distinct long-tail, UNLESS the page
      // is commercial and the candidate is also commercial with high overlap and the
      // only added token is weak → REVIEW (ambiguous, model/judgment decides).
      const sameCommercial = COMMERCIAL_INTENTS.has(candidateIntent) && (!p.intent || COMMERCIAL_INTENTS.has(p.intent))
      if (sameCommercial && overlap >= 0.6 && meaningfulResidual.length === 1) {
        if (best.outcome !== 'reject') best = { outcome: 'review', reason: 'commercial_overlap_single_modifier', matchedName: p.name, overlap }
        continue
      }
      // distinct long-tail against this page.
      continue
    }
    // 3) high overlap without full containment → review (ambiguous distinction).
    if (overlap >= 0.8 && best.outcome === 'allow_distinct') best = { outcome: 'review', reason: 'high_keyword_overlap', matchedName: p.name, overlap }
  }
  return best
}

// ── F. deterministic article-worthiness gate ─────────────────────────────────
export interface WorthinessInput {
  primaryKeyword: string
  title: string
  secondaryKeywords?: string[]
  intent?: SearchIntent
  /** Existing commercial/entity pages (site scan + Shopify + content). */
  existingPages: ExistingPageSignal[]
  /** True when at least one demand/evidence signal supports the topic. */
  hasEvidence: boolean
  /** True when the topic is relevant to the project's focus/products/audience. */
  businessRelevant: boolean
  /** Normalized keys of already-covered/pending topics (exact dup guard). */
  coveredKeys?: Set<string>
}
export interface WorthinessResult {
  ok: boolean
  rejection_reason?: RejectionReason
  distinctiveness_score: number
  cannibalization: CannibalizationResult
}

/**
 * The persistence gate. A candidate passes only when it represents an independent
 * need distinct from existing pages, is evidence-supported + business-relevant, and
 * is not an entity-name (+generic) expansion. Deterministic + domain-neutral; the
 * REVIEW cannibalization outcome is allowed through (the model/prompt handled the
 * nuance) but recorded. Returns a typed rejection_reason on failure.
 */
export function evaluateArticleWorthiness(inp: WorthinessInput): WorthinessResult {
  const cand = normalizePhrase(inp.primaryKeyword)
  const intent: SearchIntent = inp.intent ?? 'informational'
  const cannib = assessCannibalization(inp.primaryKeyword, intent, inp.existingPages)

  // exact dup of an already-covered/pending topic.
  if (cand && inp.coveredKeys?.has(cand)) return fail('already_covered', 0, cannib)

  // hard cannibalization outcomes → typed rejection.
  if (cannib.outcome === 'reject') {
    const reason: RejectionReason = cannib.reason === 'exact_keyword_equality' ? 'exact_existing_keyword_owner'
      : cannib.reason === 'entity_plus_generic_only' ? 'weak_entity_modifier'
      : 'same_intent_existing_page'
    return fail(reason, 0, cannib)
  }

  // source-only entity expansion: EVERY candidate token belongs to some existing
  // entity name or is generic → no independent need was added.
  const candToks = kwTokens(cand)
  if (candToks.length > 0) {
    const entityTokenUnion = new Set<string>()
    for (const p of inp.existingPages) for (const t of kwTokens(p.name)) entityTokenUnion.add(t)
    const residual = candToks.filter((t) => !entityTokenUnion.has(t) && !GENERIC_TOKENS.has(t))
    if (entityTokenUnion.size > 0 && residual.length === 0) return fail('source_only_entity_expansion', 0, cannib)
  }

  // evidence + business relevance.
  if (!inp.hasEvidence) return fail('unsupported_by_evidence', 0.2, cannib)
  if (!inp.businessRelevant) return fail('low_business_relevance', 0.2, cannib)

  // content depth: a real article needs structure — proxied by a multi-word primary
  // keyword AND (a distinct secondary keyword OR a multi-segment title). A bare 1-2
  // word head term with no support is too thin for a defensible article.
  const depthOk = candToks.length >= 2 && ((inp.secondaryKeywords?.filter(Boolean).length ?? 0) >= 1 || inp.title.split(/\s+[–—-]\s+|:\s+/).length >= 2 || candToks.length >= 4)
  if (!depthOk) return fail('insufficient_content_depth', 0.3, cannib)

  // distinctiveness score: how much the candidate adds beyond the closest entity.
  const distinctiveness = distinctivenessScore(candToks, inp.existingPages)
  if (distinctiveness < 0.15) return fail('insufficient_independent_need', distinctiveness, cannib)

  return { ok: true, distinctiveness_score: distinctiveness, cannibalization: cannib }
}

function fail(reason: RejectionReason, score: number, cannibalization: CannibalizationResult): WorthinessResult {
  return { ok: false, rejection_reason: reason, distinctiveness_score: score, cannibalization }
}

/** Fraction of candidate tokens that are NOT part of any existing entity name or a
 *  generic modifier — i.e. the "added need". 1 = fully novel, 0 = pure expansion. */
export function distinctivenessScore(candToks: string[], pages: ExistingPageSignal[]): number {
  if (candToks.length === 0) return 0
  const entityTokens = new Set<string>()
  for (const p of pages) for (const t of kwTokens(p.name)) entityTokens.add(t)
  const added = candToks.filter((t) => !entityTokens.has(t) && !GENERIC_TOKENS.has(t))
  return added.length / candToks.length
}
