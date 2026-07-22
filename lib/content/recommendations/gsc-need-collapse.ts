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
import { distinctiveTokensOf, canonicalToken, canonicalVariants } from './semantic-dup'
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
  // Hebrew — generic quality / glue
  'טוב', 'טובה', 'טובים', 'כדאי', 'שווה',
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

/** Remove apostrophes/geresh/gershayim WITHOUT splitting the token, so "פוצ'יוולי" ≡ "פוציוולי"
 *  and "d'or" ≡ "dor". Everything else is handled by the accepted tokenizer. */
function stripApostrophes(query: string): string {
  return (query || '').replace(/[׳״‘’ʼ'`´]/g, '')
}

/**
 * The subject CORE of a query: its distinctive tokens (canonicalized, accepted stopwords already
 * removed) minus the generic framing tokens — sorted-unique for order-independent identity.
 * Empty ⇒ the query is purely generic framing (subjectless).
 */
export function subjectCoreTokens(query: string): string[] {
  const toks = distinctiveTokensOf(stripApostrophes(query)).filter((t) => !isFramingToken(t))
  return Array.from(new Set(toks)).sort()
}

/** A query is usable only when a real subject-bearing token survives framing removal. */
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
  /** Number of source opportunities in this need (1 when not collapsed). */
  collapsedOpportunityCount: number
}

/** Deterministic GSC source order: opportunityScore DESC, impressions DESC, stable id ASC. */
function sourceOrder(a: GscCandidate, b: GscCandidate): number {
  return b.opportunityScore - a.opportunityScore || b.impressions - a.impressions || (a.opportunityId < b.opportunityId ? -1 : a.opportunityId > b.opportunityId ? 1 : 0)
}

/** Two subject cores denote the same need when their canonical core token SETS are identical.
 *  Strict set-equality is conservative: it collapses spelling/punctuation/framing-only variants and
 *  preserves EVERY meaningful modifier (audience, location, timing, subtype, size, before/after…),
 *  because any distinguishing content token makes the cores differ. */
function sameNeed(coreA: string[], coreB: string[]): boolean {
  return coreA.length === coreB.length && coreA.every((t, i) => t === coreB[i])
}

/**
 * Collapse strong near-duplicate GSC needs. Candidates are processed in the deterministic source
 * order (so the representative is always the highest-ordered member and the result is INPUT-ORDER
 * INDEPENDENT). Each candidate joins the first existing need with an identical subject core, else
 * starts a new need. Metrics are aggregated deterministically; opportunityScore is the
 * representative's (never summed/averaged); all source provenance is preserved.
 */
export function collapseGscCandidates(candidates: GscCandidate[]): { needs: CollapsedGscNeed[]; collapsedNearDuplicateCount: number } {
  const ordered = candidates.slice().sort(sourceOrder)
  const groups: { members: GscCandidate[]; core: string[] }[] = []
  for (const c of ordered) {
    const core = subjectCoreTokens(c.primaryQuery)
    const g = groups.find((grp) => sameNeed(grp.core, core))
    if (g) g.members.push(c)
    else groups.push({ members: [c], core })
  }
  const needs = groups.map((g) => toNeed(g.members))
  const collapsedNearDuplicateCount = ordered.length - needs.length
  return { needs, collapsedNearDuplicateCount }
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
    collapsedOpportunityCount: members.length,
  }
}
