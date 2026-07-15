/**
 * Brand-safety guard (P0) — PURE, domain-neutral, AUTOMATIC. No manual competitor list
 * and no hardcoded names: detection is driven entirely by the PROJECT'S OWN evidence
 * (business name + indexed pages + entities + existing content + focus). This is a
 * self-service product — customers never pre-enter competitors.
 *
 *   keywordEntityType: generic_query | own_brand | suspected_external_business
 *
 * A query shaped like "[our business type] + [proper name absent from our own
 * evidence]" (e.g. another flower shop "פרחי אביה") is a suspected external business:
 * it can never seed a title, keyword, secondary, reason, demand, link or article input.
 * The project's own brand is always allowed. Generic terms are allowed. A title→keyword
 * entity MUTATION into a name is blocked separately (detectUnsafeNamedEntityMutation).
 */

import { normalizePhrase } from './keyword-guard'
import { contentTokens } from './evidence-cluster'
import { GENERIC_TOKENS } from './opportunity'

export type KeywordEntityType = 'generic_query' | 'own_brand' | 'suspected_external_business'

const toks = (s: string) => contentTokens(s)

export interface BrandSafety {
  ownBrandTerms: string[][]  // business name (+ own site names) token lists
  ownBrandTokens: Set<string>
  /** Every token in the project's OWN evidence (entities + coverage + focus + tracked
   *  + brand). A token NOT here is "unknown" to this project. Built WITHOUT keyword
   *  research (which may itself surface external names). */
  ownVocab: Set<string>
  /** Business-TYPE tokens the project's own entities repeatedly use (e.g. פרחי/פרחים):
   *  the "[type] + [unknown name]" shape is what marks an external business. */
  typeVocab: Set<string>
}

/** Build brand safety purely from project-owned evidence — no external input. */
export function buildBrandSafety(input: {
  businessName?: string | null
  ownSiteNames?: string[]
  entityNames?: string[]
  ownEvidence?: string[]
}): BrandSafety {
  const own = [input.businessName ?? '', ...(input.ownSiteNames ?? [])].filter((s) => s && s.trim())
  const ownBrandTerms = own.map(toks).filter((a) => a.length)
  const ownBrandTokens = new Set(ownBrandTerms.flat())
  const entityNames = input.entityNames ?? []
  const ownVocab = new Set<string>(ownBrandTokens)
  for (const s of [...entityNames, ...(input.ownEvidence ?? [])]) for (const t of toks(s)) ownVocab.add(t)
  // Type vocabulary: tokens used across >= 2 of the project's own entity names.
  const df = new Map<string, number>()
  for (const n of entityNames) for (const t of new Set(toks(n))) df.set(t, (df.get(t) ?? 0) + 1)
  const typeVocab = new Set<string>()
  for (const [t, d] of df) if (d >= 2 && !GENERIC_TOKENS.has(t)) typeVocab.add(t)
  return { ownBrandTerms, ownBrandTokens, ownVocab, typeVocab }
}

function ownBrandPresent(textToks: Set<string>, bs: BrandSafety): boolean {
  // The distinctive own-brand tokens (not generic, not the shared type words) present.
  return bs.ownBrandTerms.some((term) => {
    const d = term.filter((t) => !GENERIC_TOKENS.has(t) && !bs.typeVocab.has(t))
    const pool = d.length ? d : term
    return pool.length > 0 && pool.every((t) => textToks.has(t))
  })
}

/** Tokens in the text that are UNKNOWN to the project (not generic, not in own vocab). */
function unknownTokens(textToks: Iterable<string>, bs: BrandSafety): string[] {
  const out: string[] = []
  for (const t of textToks) if (!GENERIC_TOKENS.has(t) && !bs.ownVocab.has(t) && t.length >= 3) out.push(t)
  return out
}

/**
 * Classify a keyword query BEFORE it can influence generation. own_brand (allowed);
 * suspected_external_business when the query pairs a project business-TYPE token with an
 * unknown proper token (a "[our type] [someone-else's name]" shape); else generic.
 */
export function classifyKeywordEntity(query: string, bs: BrandSafety): KeywordEntityType {
  const tt = new Set(toks(query))
  if (ownBrandPresent(tt, bs)) return 'own_brand'
  const unknown = unknownTokens(tt, bs)
  const hasType = [...tt].some((t) => bs.typeVocab.has(t))
  if (unknown.length > 0 && hasType) return 'suspected_external_business'
  return 'generic_query'
}

/** True if the text looks like an external business (for the final whole-suggestion
 *  scan). Any hit rejects the entire opportunity — never a partial clean. */
export function containsExternalBusiness(text: string, bs: BrandSafety): boolean {
  if (!text) return false
  return classifyKeywordEntity(text, bs) === 'suspected_external_business'
}

// ── unsafe named-entity mutation ──────────────────────────────────────────────
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[m][n]
}

/**
 * True when the keyword introduces a NAMED-ENTITY token that (a) is absent from the
 * title, (b) is unknown to the project, and (c) is a tiny edit of a title token —
 * a generic word mutated into a possible business name (title "פרחי אביב" → keyword
 * "פרחי אביה"). The caller must NOT auto-repair; it rejects the opportunity.
 */
export function detectUnsafeNamedEntityMutation(title: string, primaryKeyword: string, bs: BrandSafety): boolean {
  const titleToks = toks(title)
  const titleSet = new Set(titleToks)
  for (const k of toks(primaryKeyword)) {
    if (titleSet.has(k) || bs.ownVocab.has(k) || GENERIC_TOKENS.has(k) || k.length < 3) continue
    for (const s of titleToks) {
      if (s.length >= 3 && Math.abs(s.length - k.length) <= 1 && editDistance(s, k) <= 1) return true
    }
  }
  return false
}

// ── final output brand-safety scan ────────────────────────────────────────────
export interface BrandScanResult { safe: boolean; reason?: 'competitor_brand_leakage'; field?: string }

/** Scan the COMPLETE user-visible suggestion for any suspected external business.
 *  Any hit rejects the whole opportunity (never a partial clean). */
export function scanSuggestionBrandSafety(
  s: { title?: string; primaryKeyword?: string; secondaryKeywords?: string[]; suggestionReason?: string; anchors?: string[]; targetTitles?: string[] },
  bs: BrandSafety,
): BrandScanResult {
  const fields: [string, string | undefined][] = [
    ['title', s.title], ['primaryKeyword', s.primaryKeyword], ['reason', s.suggestionReason],
    ...(s.secondaryKeywords ?? []).map((k, i): [string, string] => [`secondary[${i}]`, k]),
    ...(s.anchors ?? []).map((a, i): [string, string] => [`anchor[${i}]`, a]),
    ...(s.targetTitles ?? []).map((t, i): [string, string] => [`targetTitle[${i}]`, t]),
  ]
  for (const [field, val] of fields) if (val && containsExternalBusiness(val, bs)) return { safe: false, reason: 'competitor_brand_leakage', field }
  return { safe: true }
}
