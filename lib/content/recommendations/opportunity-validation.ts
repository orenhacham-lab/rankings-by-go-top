/**
 * Post-synthesis opportunity validators (P0 Parts C/D/E/F/G) — PURE, domain-neutral.
 * These run AFTER worthiness/cannibalization and BEFORE persistence. They do not
 * change the recovery-tier or evidence architecture; they only correct/label the
 * mapping + claim defects proven in live validation:
 *   C. title–keyword–intent consistency (repair or reject intent_keyword_mismatch);
 *   D. recommended page type (article vs commercial/category/service/product page);
 *   E. demand-claim integrity (structured, verified-volume-only demand evidence);
 *   F. secondary-keyword quality (drop generic/off-topic/subset filler);
 *   G. business-relevance (reject a topic fully disconnected from business evidence).
 * No hardcoded industry/product/location words — every signal is derived from the
 * project's own evidence (entity names, project focus, keyword research) + the shared
 * Hebrew-aware tokenizer and the generic-modifier set.
 */

import { contentTokens } from './evidence-cluster'
import { GENERIC_TOKENS } from './opportunity'
import { normalizePhrase } from './keyword-guard'
import { subjectTokens, type EntityPageType } from './link-role-mapper'
import type { SearchIntent } from './opportunity'

const toks = (s: string) => subjectTokens(s)

/** Comparison FUNCTION words (grammatical, not industry/product/location). A
 *  comparison keyword should carry one of these or both compared sides. */
const COMPARISON_CONNECTORS = new Set<string>(['vs', 'versus', 'לעומת', 'מול'].map((t) => normalizePhrase(t)).filter(Boolean))
/** Commercial-intent modifier function words (price/buy/cheap …). Reused from the
 *  shared generic set; used to flag intent-conflicting secondary keywords. */
const COMMERCIAL_MODIFIERS = new Set<string>(['price', 'buy', 'cheap', 'discount', 'sale', 'מחיר', 'מחירים', 'זול', 'זולה', 'לקנות', 'קניה', 'קנייה', 'מבצע', 'בזול'].map((t) => normalizePhrase(t)).filter(Boolean))

/** Product-TYPE words are data-derived: tokens appearing across many entity names.
 *  (>= 4 entities AND >= 50% of them). Domain-neutral, not a hardcoded list. */
export function deriveCorpusTypeWords(entityNames: string[]): Set<string> {
  const df = new Map<string, number>()
  for (const n of entityNames) for (const t of new Set(toks(n))) df.set(t, (df.get(t) ?? 0) + 1)
  const N = entityNames.length
  const out = new Set<string>()
  for (const [t, d] of df) if (d >= 4 && d / Math.max(1, N) >= 0.5) out.add(t)
  return out
}

// ── C. title–keyword–intent consistency ──────────────────────────────────────
export interface IntentConsistencyResult { ok: boolean; repairedKeyword?: string; reason?: 'intent_keyword_mismatch' }
const INFORMATIONAL_INTENTS = new Set<SearchIntent>(['informational', 'comparison', 'other'])

/** Rebuild a readable primary keyword from the title's own words (main clause before a
 *  ":"/"—" subtitle), dropping the `drop` tokens (e.g. a commercial term the
 *  informational title never used) and — unless keepGeneric — generic modifiers. Keeps
 *  original surface words (Hebrew-safe), capped. keepGeneric preserves delivery/location
 *  intent words (e.g. משלוח) for local/transactional repairs. */
function repairKeywordFromTitle(title: string, drop: Set<string>, keepGeneric = false): string {
  const main = title.split(/[:—–]|(?:\s-\s)/)[0] || title
  const kept = main.split(/\s+/).filter(Boolean).filter((w) => { const n = normalizePhrase(w); return n && !drop.has(n) && (keepGeneric || !GENERIC_TOKENS.has(n)) })
  return kept.slice(0, 6).join(' ').trim()
}

/**
 * A primary keyword must describe the SAME need as the title + intent. The proven
 * defect: an informational/comparison title ("A vs B") paired with a one-sided
 * commercial product keyword ("<bouquet> A"). Detected domain-neutrally: for an
 * informational intent, a keyword token that is absent from the title AND is a
 * commercial-entity token is commercial drift → repair from the title, else reject.
 */
export function validateIntentKeywordConsistency(
  o: { primaryKeyword: string; title: string; intent: SearchIntent },
  commercialEntityTokens: Set<string>,
): IntentConsistencyResult {
  const kw = toks(o.primaryKeyword)
  if (kw.length === 0) return { ok: false, reason: 'intent_keyword_mismatch' }
  const kwSet = new Set(kw)
  const titleToks = toks(o.title)
  const titleSet = new Set(titleToks)
  const informational = INFORMATIONAL_INTENTS.has(o.intent)
  const titleDistinctive = titleToks.filter((t) => !GENERIC_TOKENS.has(t))

  const local = o.intent === 'local' || o.intent === 'transactional'
  const repairOr = (drop: Set<string>): IntentConsistencyResult => {
    const repaired = repairKeywordFromTitle(o.title, drop, local)
    if (toks(repaired).length >= 2 && normalizePhrase(repaired) !== normalizePhrase(o.primaryKeyword)) return { ok: true, repairedKeyword: repaired }
    return { ok: false, reason: 'intent_keyword_mismatch' }
  }

  // Commercial drift: informational topic whose keyword injects a commercial-entity
  // token the title never uses (a keyword that would compete with a product page).
  const drift = kw.filter((t) => !titleSet.has(t) && commercialEntityTokens.has(t) && !GENERIC_TOKENS.has(t))
  if (informational && drift.length > 0) return repairOr(new Set(drift))

  // Comparison intent → the keyword must carry a comparison connector OR both compared
  // sides. If the TITLE expresses the comparison but the keyword does not, repair from
  // the title (which contains the connector + both sides).
  if (o.intent === 'comparison') {
    const kwHasConnector = kw.some((t) => COMPARISON_CONNECTORS.has(t))
    const titleHasConnector = titleToks.some((t) => COMPARISON_CONNECTORS.has(t))
    if (!kwHasConnector) {
      if (titleHasConnector) return repairOr(new Set())
      return { ok: false, reason: 'intent_keyword_mismatch' }
    }
  }

  // Local/transactional intent → the keyword must RETAIN the title's distinctive
  // tokens (e.g. the location). If it dropped any distinctive title token, repair from
  // the title so the location/offer is preserved.
  if (o.intent === 'local' || o.intent === 'transactional') {
    const missing = titleDistinctive.filter((t) => !kwSet.has(t))
    if (missing.length > 0 && titleDistinctive.length >= 2) return repairOr(new Set())
  }

  // General: the keyword should overlap the title (describe the same subject).
  const overlap = kw.filter((t) => titleSet.has(t)).length / kw.length
  if (overlap < 0.34) return repairOr(new Set())
  return { ok: true }
}

// ── D. recommended page type ──────────────────────────────────────────────────
export type RecommendedPageType = 'article' | 'commercial_landing_page' | 'category_page' | 'service_page' | 'product_page_improvement'
const COMMERCIAL_INTENTS = new Set<SearchIntent>(['commercial', 'transactional', 'local'])

/**
 * Not every valid opportunity is a blog article. A transactional/local commercial
 * need backed by a persistent offering is better served by a commercial/category/
 * service page; an exact product need by a product-page improvement. Informational/
 * comparison/care needs are articles. Only 'article' is auto-enqueued (enforced in
 * the approve endpoint).
 */
export function classifyRecommendedPageType(
  o: { intent: SearchIntent },
  signals: { primaryTargetType: EntityPageType | null; keywordEqualsProduct: boolean },
): RecommendedPageType {
  if (!COMMERCIAL_INTENTS.has(o.intent)) return 'article'
  if (signals.keywordEqualsProduct) return 'product_page_improvement'
  if (signals.primaryTargetType === 'category') return 'category_page'
  if (signals.primaryTargetType === 'service') return 'service_page'
  return 'commercial_landing_page'
}

// ── E. demand-claim integrity ─────────────────────────────────────────────────
export interface DemandEvidence {
  demandEvidenceAvailable: boolean
  demandQuery: string | null
  avgMonthlySearches: number | null
  demandConfidence: 'high' | 'low' | 'none'
}

/**
 * Structured, verifiable demand — a demand claim is only legitimate when a
 * keyword-research query the opportunity actually covers has real volume. Volume is
 * never fabricated: no matching query → demandConfidence 'none'.
 */
export function computeDemandEvidence(
  primaryKeyword: string,
  secondaryKeywords: string[],
  keywordResearch: { query: string; volume?: number | null }[],
): DemandEvidence {
  const kwSet = new Set<string>([...toks(primaryKeyword), ...secondaryKeywords.flatMap((s) => toks(s))])
  let best: { query: string; volume: number } | null = null
  for (const q of keywordResearch) {
    const qt = toks(q.query)
    if (qt.length === 0) continue
    const cov = qt.filter((t) => kwSet.has(t)).length / qt.length
    const vol = q.volume ?? 0
    if (cov >= 0.6 && vol > 0 && (!best || vol > best.volume)) best = { query: q.query, volume: vol }
  }
  if (best) return { demandEvidenceAvailable: true, demandQuery: best.query, avgMonthlySearches: best.volume, demandConfidence: best.volume >= 100 ? 'high' : 'low' }
  return { demandEvidenceAvailable: false, demandQuery: null, avgMonthlySearches: null, demandConfidence: 'none' }
}

// ── F. secondary-keyword quality ──────────────────────────────────────────────
export interface SecondaryFilterResult { kept: string[]; rejected: { keyword: string; reason: string }[] }

/** Drop weak secondary keywords: exact-duplicate of the primary, single-token, subset
 *  of the primary, purely generic modifiers, malformed, off-topic (no overlap with the
 *  primary/title), or intent-conflicting (a commercial price/buy modifier inside an
 *  informational/comparison topic). Typed reasons. */
export function filterSecondaryKeywords(primaryKeyword: string, title: string, secondaries: string[], intent?: SearchIntent): SecondaryFilterResult {
  const primNorm = normalizePhrase(primaryKeyword)
  const primSet = new Set(toks(primaryKeyword))
  const onTopic = new Set<string>([...primSet, ...toks(title)])
  const informational = !!intent && INFORMATIONAL_INTENTS.has(intent)
  const kept: string[] = []
  const rejected: { keyword: string; reason: string }[] = []
  const seen = new Set<string>()
  for (const s of secondaries) {
    const n = normalizePhrase(s)
    if (!n || seen.has(n)) { if (n) rejected.push({ keyword: s, reason: 'duplicate' }); continue }
    seen.add(n)
    if (n === primNorm) { rejected.push({ keyword: s, reason: 'duplicate_of_primary' }); continue }
    // Malformed: too long, or almost no real content tokens.
    if (n.split(' ').length > 8) { rejected.push({ keyword: s, reason: 'malformed' }); continue }
    const st = toks(s)
    if (st.length <= 1) { rejected.push({ keyword: s, reason: 'too_short' }); continue }
    if (st.every((t) => primSet.has(t))) { rejected.push({ keyword: s, reason: 'subset_of_primary' }); continue }
    if (st.every((t) => GENERIC_TOKENS.has(t))) { rejected.push({ keyword: s, reason: 'generic_modifier_only' }); continue }
    if (informational && st.some((t) => COMMERCIAL_MODIFIERS.has(t))) { rejected.push({ keyword: s, reason: 'intent_conflicting' }); continue }
    if (!st.some((t) => onTopic.has(t))) { rejected.push({ keyword: s, reason: 'off_topic' }); continue }
    kept.push(s)
  }
  return { kept, rejected }
}

// ── G. business relevance ─────────────────────────────────────────────────────
export interface BusinessRelevanceResult { ok: boolean; score: number; relatedCommercialEntities: string[]; reason?: 'low_business_relevance' }

/**
 * A topic may be top-of-funnel but must have a defensible connection to the business.
 * Relevant when at least one of its distinctive subject tokens is represented in the
 * business's own evidence (entity names, project focus, tracked keywords, keyword
 * research). A topic fully disconnected from all business evidence is rejected. Does
 * NOT over-reject legitimate informational topics that share the business's subject.
 */
export function assessBusinessRelevance(
  o: { primaryKeyword: string; title: string },
  businessEvidenceTokens: Set<string>,
  corpusTypeWords: Set<string>,
  entities: { name: string }[],
): BusinessRelevanceResult {
  const subjAll = [...toks(o.primaryKeyword), ...toks(o.title)].filter((t) => !GENERIC_TOKENS.has(t))
  const distinctive = subjAll.filter((t) => !corpusTypeWords.has(t))
  const pool = Array.from(new Set(distinctive.length ? distinctive : subjAll))
  const covered = pool.filter((t) => businessEvidenceTokens.has(t))
  const related = entities.filter((e) => toks(e.name).some((t) => pool.includes(t))).map((e) => e.name).slice(0, 8)
  const score = pool.length ? Number((covered.length / pool.length).toFixed(2)) : 0
  if (covered.length === 0) return { ok: false, score, relatedCommercialEntities: related, reason: 'low_business_relevance' }
  return { ok: true, score, relatedCommercialEntities: related }
}
