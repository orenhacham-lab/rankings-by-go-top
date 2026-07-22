/**
 * Stage E3A source-quality cleanup — domain-neutral GSC need collapsing + subject-bearing guard.
 *
 * The GSC source-budget list can contain many query variants of ONE search need (spelling /
 * punctuation / generic framing differences) and subjectless generic queries ("מה המחיר" /
 * "what is the price") that are not usable article needs. This module, on the RECOMMENDATION side
 * (so it may reuse the accepted deterministic semantic utilities — the GSC layer must never import
 * the recommendation engine), collapses strong near-duplicate needs into ONE unique need and
 * rejects subjectless queries BEFORE the source budget.
 *
 * It is generic and project-agnostic: NO project/domain/category vocabulary, NO hardcoded product
 * lists, NO edit-distance, NO LLM. It relies only on normalized/canonical/distinctive tokens, a
 * small GENERIC framing-token set (question / commerce / navigation / glue words), and the existing
 * high-confidence subject-core identity. The same query + evidence shape yields the same decision
 * for every project.
 */
import { distinctiveTokensOf, canonicalToken, canonicalVariants, intentClusterOf, type IntentCluster } from './semantic-dup'
import type { GscCandidate } from '@/lib/gsc/recommendations/types'

// GENERIC framing tokens (Hebrew + English): question words, commerce/price framing, navigation /
// "more info" framing, and generic glue/quality words. These carry NO distinguishing search need —
// they are the wrapper around a subject. This is NOT business-category vocabulary and contains no
// product/service nouns. Tokens the accepted distinctiveTokensOf() already strips (the/a/of/for/is/
// how/why/what/best/guide + Hebrew מה/איך/האם/מתי/איפה/למה/כיצד/של/את/עם/… ) need not be repeated.
const FRAMING_RAW = [
  // Hebrew — question / quantity
  'כמה', 'מי', 'איזה', 'לאיזה', 'מאיזה', 'מאיפה', 'לאן', 'האם',
  // Hebrew — commerce / price / purchase
  'מחיר', 'מחירים', 'עולה', 'עולות', 'עלות', 'לקנות', 'קונים', 'קנייה', 'קניה', 'קניית',
  'להזמין', 'מזמינים', 'הזמנה', 'הזמנת', 'למכירה', 'לרכוש', 'רכישה', 'רכישת',
  // Hebrew — navigation / "more information" / contact
  'מידע', 'פרטים', 'פרטי', 'נוסף', 'נוספים', 'נוספת', 'נוספות', 'צור', 'קשר', 'ליצור',
  // Hebrew — generic quality / glue / possessive (wrapper around "near me" / "my area")
  'טוב', 'טובה', 'טובים', 'כדאי', 'שווה', 'אליי', 'אלי', 'שלי', 'שלנו',
  // English — question / quantity
  'what', 'how', 'why', 'when', 'where', 'who', 'which', 'much', 'many',
  // English — commerce / price / purchase
  'cost', 'costs', 'price', 'priced', 'buy', 'buying', 'order', 'ordering', 'purchase', 'purchasing',
  // English — navigation / "more information" / contact
  'more', 'information', 'info', 'details', 'detail', 'contact', 'us', 'get', 'near',
  // English — generic glue / pronouns / quality
  'do', 'does', 'is', 'are', 'the', 'a', 'an', 'to', 'of', 'for', 'it', 'i', 'my', 'me', 'you', 'your', 'right', 'good', 'best',
]
const FRAMING = new Set(FRAMING_RAW.map((t) => canonicalToken(t)))

/** A token is generic framing when its canonical form (or a proclitic-stripped variant, e.g.
 *  "המחיר" → "מחיר") is in the framing set. Purely deterministic + domain-neutral. */
function isFramingToken(token: string): boolean {
  if (FRAMING.has(canonicalToken(token))) return true
  for (const v of canonicalVariants(token)) if (FRAMING.has(v)) return true
  return false
}

// GENERIC local-intent markers (Hebrew + English) — "near me" / "nearby" / "לידי" / "באזור". These
// are NOT removable framing: a local-intent query is a DISTINCT need from its non-local sibling
// ("office cleaning" ≠ "office cleaning near me"). They also do NOT count as a subject-bearing token
// (a query of ONLY local markers + glue is still subjectless). NO city names / project locations —
// explicit locations are ordinary content tokens and remain distinct naturally.
const LOCAL_MARKER_RAW = ['near', 'nearby', 'קרוב', 'לידי', 'ליד', 'סמוך', 'באזור']
const LOCAL = new Set(LOCAL_MARKER_RAW.map((t) => canonicalToken(t)))
function isLocalMarker(token: string): boolean {
  if (LOCAL.has(canonicalToken(token))) return true
  for (const v of canonicalVariants(token)) if (LOCAL.has(v)) return true
  return false
}

/** True when the query carries a generic local-intent marker ("near me" / "nearby" / "לידי" …). */
export function hasLocalIntent(query: string): boolean {
  return distinctiveTokensOf(stripApostrophes(query)).some(isLocalMarker)
}

/** Remove apostrophes/geresh/gershayim WITHOUT splitting the token, so "פוצ'יוולי" ≡ "פוציוולי"
 *  and "d'or" ≡ "dor". Everything else is handled by the accepted tokenizer. */
function stripApostrophes(query: string): string {
  return (query || '').replace(/[׳״‘’ʼ'`´]/g, '')
}

// GENERIC price / cost / fee / rate / tariff family (Hebrew + English) — commercial framing that is
// NEVER an article subject. Listed as EXPLICIT surface forms (singular + plural), NOT stemmed: the
// only morphology applied is stripping a leading Hebrew definite article "ה" for the membership
// check (so "העלויות" → "עלויות"). This is deliberately narrow and conservative — it can never
// rewrite or drop an arbitrary noun the way a general stemmer would. Matched on the RAW surface
// token because the accepted plural fold in canonicalToken is length-dependent and mangles some of
// these forms inconsistently (e.g. "עלות"→"עלות" but "העלות"→"העל").
const HE_NIQQUD = /[֑-ׇ]/g
const COMMERCE_FAMILY = new Set([
  // Hebrew base forms (definite "ה" handled by the check below)
  'מחיר', 'מחירים', 'עלות', 'עלויות', 'תעריף', 'תעריפים', 'עולה', 'עולות', 'יעלה',
  // English (singular + plural, listed explicitly)
  'price', 'prices', 'pricing', 'cost', 'costs', 'fee', 'fees', 'rate', 'rates', 'tariff', 'tariffs',
])
function normForCommerce(raw: string): string {
  const t = (raw || '').toLowerCase().replace(HE_NIQQUD, '')
  // strip a single leading Hebrew definite article when a real word (≥3 letters) remains.
  return /^ה[א-ת]{3,}$/.test(t) ? t.slice(1) : t
}
/** True when the RAW token is a generic price/cost/fee/rate/tariff term (incl. plural/definite). */
function isGenericCommerceToken(raw: string): boolean {
  return COMMERCE_FAMILY.has(normForCommerce(raw))
}

// The accepted distinctive tokenizer's split set (mirrored so we can classify the RAW surface token
// while honouring the SAME stopword removal via distinctiveTokensOf).
const SPLIT = /[?!.,:;"'“”׳״()\-–—/|]/g
/** Raw surface tokens that survive the accepted stopword removal, paired with their canonical form.
 *  Lets the guard classify framing/local/commerce on the RAW token yet keep canonical subject identity. */
function classifiableTokens(query: string): { raw: string; canon: string }[] {
  const distinct = new Set(distinctiveTokensOf(stripApostrophes(query)))
  const out: { raw: string; canon: string }[] = []
  for (const w of stripApostrophes(query).toLowerCase().replace(SPLIT, ' ').split(/\s+/)) {
    if (w.length <= 1) continue
    const canon = canonicalToken(w)
    if (!canon || canon.length <= 1 || !distinct.has(canon)) continue
    out.push({ raw: w, canon })
  }
  return out
}

/**
 * The subject CORE of a query: its distinctive tokens (accepted stopwords already removed) minus
 * generic framing, generic local-intent markers, AND the generic price/cost family — sorted-unique
 * canonical tokens for order-independent identity. Empty ⇒ the query has no real subject (purely
 * generic framing / commercial wrapper / a bare local marker) and is subjectless.
 */
export function subjectCoreTokens(query: string): string[] {
  const kept = classifiableTokens(query).filter(({ raw, canon }) => !isFramingToken(canon) && !isLocalMarker(canon) && !isGenericCommerceToken(raw))
  return Array.from(new Set(kept.map((k) => k.canon))).sort()
}

/** A query is usable only when a real subject-bearing (non-framing, non-location) token survives. */
export function isSubjectBearingQuery(query: string): boolean {
  return subjectCoreTokens(query).length > 0
}

/** Split candidates into subject-bearing vs subjectless (generic-only) — input-order preserving. */
export function partitionSubjectBearing(candidates: GscCandidate[]): { subjectBearing: GscCandidate[]; subjectless: GscCandidate[] } {
  const subjectBearing: GscCandidate[] = []
  const subjectless: GscCandidate[] = []
  for (const c of candidates) (isSubjectBearingQuery(c.primaryQuery) ? subjectBearing : subjectless).push(c)
  return { subjectBearing, subjectless }
}

export interface CollapsedGscNeed {
  /** Representative candidate (highest source order) with AGGREGATED metrics. */
  candidate: GscCandidate
  /** All source opportunity ids in deterministic representative order. */
  relatedOpportunityIds: string[]
  /** All source queries in the corresponding deterministic order. */
  relatedQueries: string[]
  /** Union of ranking page URLs across every source (deduped, first-seen source order). */
  relatedPages: string[]
  /** Union of reason codes across every source (deduped, first-seen source order). */
  relatedReasonCodes: string[]
  /** Union of signals across every source (deduped, first-seen source order). */
  relatedSignals: string[]
  /** Number of source opportunities in this need (1 when not collapsed). */
  collapsedOpportunityCount: number
}

/** Deterministic GSC source order: opportunityScore DESC, impressions DESC, stable id ASC. */
function sourceOrder(a: GscCandidate, b: GscCandidate): number {
  return b.opportunityScore - a.opportunityScore || b.impressions - a.impressions || (a.opportunityId < b.opportunityId ? -1 : a.opportunityId > b.opportunityId ? 1 : 0)
}

/**
 * The full need identity of a candidate: subject core + intent cluster + local-intent flag. Two
 * candidates are the same need ONLY when all three match (strict core set-equality; COMPATIBLE
 * intent clusters via the accepted intentClusterOf — so informational and commercial variants of the
 * same subject never collapse; and the same local-intent flag — so "office cleaning" ≠ "office
 * cleaning near me"). Conservative: any distinguishing content token, a different intent, or a
 * local/non-local split keeps needs separate.
 */
function needKey(c: GscCandidate): string {
  const core = subjectCoreTokens(c.primaryQuery)
  const cluster: IntentCluster = intentClusterOf(c.queryIntent)
  const local = hasLocalIntent(c.primaryQuery) ? 'L' : ''
  return `${core.join('')}${cluster}${local}`
}

/**
 * Collapse strong near-duplicate GSC needs. Candidates are processed in the deterministic source
 * order (so the representative is always the highest-ordered member and the result is INPUT-ORDER
 * INDEPENDENT). Each candidate joins the first existing need with an identical need identity
 * (subject core + compatible intent cluster + local-intent flag), else starts a new need. Metrics
 * are aggregated deterministically; opportunityScore is the representative's (never summed/averaged);
 * all source provenance is preserved.
 */
export function collapseGscCandidates(candidates: GscCandidate[]): { needs: CollapsedGscNeed[]; collapsedNearDuplicateCount: number } {
  const ordered = candidates.slice().sort(sourceOrder)
  const groups = new Map<string, GscCandidate[]>()
  for (const c of ordered) {
    const key = needKey(c)
    const g = groups.get(key)
    if (g) g.push(c)
    else groups.set(key, [c]) // Map preserves insertion order → groups stay in representative order
  }
  const needs = Array.from(groups.values()).map((members) => toNeed(members))
  const collapsedNearDuplicateCount = ordered.length - needs.length
  return { needs, collapsedNearDuplicateCount }
}

/** Deduplicate preserving first-seen order. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) if (v && !seen.has(v)) { seen.add(v); out.push(v) }
  return out
}

function toNeed(members: GscCandidate[]): CollapsedGscNeed {
  const rep = members[0] // members are in source order → highest-ordered representative
  const totalClicks = members.reduce((s, m) => s + m.clicks, 0)
  const totalImpressions = members.reduce((s, m) => s + m.impressions, 0)
  const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0
  const averagePosition = totalImpressions > 0
    ? members.reduce((s, m) => s + m.averagePosition * m.impressions, 0) / totalImpressions
    : rep.averagePosition
  const candidate: GscCandidate = {
    ...rep,
    clicks: totalClicks,
    impressions: totalImpressions,
    ctr,
    averagePosition,
    // opportunityScore is the representative's — NEVER summed or averaged.
    opportunityScore: rep.opportunityScore,
  }
  return {
    candidate,
    relatedOpportunityIds: members.map((m) => m.opportunityId),
    relatedQueries: members.map((m) => m.primaryQuery),
    relatedPages: dedupe(members.map((m) => m.page)),
    relatedReasonCodes: dedupe(members.flatMap((m) => m.reasonCodes)),
    relatedSignals: dedupe(members.flatMap((m) => m.signals)),
    collapsedOpportunityCount: members.length,
  }
}
