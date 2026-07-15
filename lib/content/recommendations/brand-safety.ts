/**
 * Brand-safety guard (P0) — PURE, domain-neutral. Prevents competitor/business names
 * from leaking into any generated content field. Competitor terms are NEVER hardcoded:
 * they come from project-level data (a user-maintained exclusion list) + the project's
 * own brand + a generic business vocabulary. This module only classifies and matches;
 * the caller rejects the whole contaminated opportunity.
 *
 *   keywordEntityType: generic_query | own_brand | competitor_brand | unknown_business_name
 *
 * Matching is variant/prefix/suffix tolerant (Hebrew-aware tokens): a competitor term
 * matches when its DISTINCTIVE tokens (the name part, not the generic industry word)
 * are present — so "פרחי אביה" matches "פרחי אביה ירושלים", "לפרחי אביה", etc.
 */

import { normalizePhrase } from './keyword-guard'
import { contentTokens } from './evidence-cluster'
import { GENERIC_TOKENS } from './opportunity'

export type KeywordEntityType = 'generic_query' | 'own_brand' | 'competitor_brand' | 'unknown_business_name'

const toks = (s: string) => contentTokens(s)

export interface BrandSafety {
  competitorTerms: string[][]  // each exclusion term as its normalized token list
  ownBrandTerms: string[][]
  ownBrandTokens: Set<string>
  /** Known-generic business vocabulary (entities + focus + tracked) — NOT keyword
   *  research (which may itself contain competitor names). Used to isolate the
   *  distinctive "name" token of a term and to whitelist safe keyword tokens. */
  genericVocab: Set<string>
}

/** Build the brand-safety context from project data. competitorTerms is the
 *  user-maintained exclusion list (project field / env) — never hardcoded. */
export function buildBrandSafety(input: {
  businessName?: string | null
  ownSiteNames?: string[]
  competitorTerms?: string[]
  genericVocab?: Iterable<string>
}): BrandSafety {
  const own = [input.businessName ?? '', ...(input.ownSiteNames ?? [])].filter((s) => s && s.trim())
  const ownBrandTerms = own.map(toks).filter((a) => a.length)
  return {
    competitorTerms: (input.competitorTerms ?? []).map(toks).filter((a) => a.length),
    ownBrandTerms,
    ownBrandTokens: new Set(ownBrandTerms.flat()),
    genericVocab: new Set(input.genericVocab ?? []),
  }
}

/** Parse a raw competitor-list string (comma / newline separated) into terms. */
export function parseCompetitorList(raw: string | null | undefined): string[] {
  return (raw ?? '').split(/[,\n;|]+/).map((s) => s.trim()).filter(Boolean)
}

/** The distinctive (name) tokens of a term: those not generic + not in the business
 *  vocabulary + not the own brand. Falls back to all tokens when none are distinctive. */
function distinctiveOf(term: string[], bs: BrandSafety): string[] {
  const d = term.filter((t) => !GENERIC_TOKENS.has(t) && !bs.genericVocab.has(t) && !bs.ownBrandTokens.has(t))
  return d.length ? d : term
}

/** All of a term's distinctive (name) tokens present → the term is in the text. Exact
 *  on tokens (NOT fuzzy) so a legitimate near-generic word (e.g. the season "אביב",
 *  one edit from a competitor "אביה") is never mis-flagged — a genuine typo/mutation
 *  of a title word into a name is caught separately by detectUnsafeNamedEntityMutation. */
function termPresent(term: string[], textToks: Set<string>, bs: BrandSafety): boolean {
  const d = distinctiveOf(term, bs)
  return d.length > 0 && d.every((t) => textToks.has(t))
}

/** True if ANY competitor term is present (variant/prefix/suffix tolerant via
 *  Hebrew-aware tokens). Used by the final scan — any hit rejects the opportunity. */
export function containsCompetitorTerm(text: string, bs: BrandSafety): boolean {
  if (!text || bs.competitorTerms.length === 0) return false
  const tt = new Set(toks(text))
  return bs.competitorTerms.some((term) => termPresent(term, tt, bs))
}

/** Classify a keyword-research query / keyword before it can influence generation. */
export function classifyKeywordEntity(query: string, bs: BrandSafety): KeywordEntityType {
  const tt = new Set(toks(query))
  if (bs.competitorTerms.some((term) => termPresent(term, tt, bs))) return 'competitor_brand'
  if (bs.ownBrandTerms.some((term) => termPresent(term, tt, bs))) return 'own_brand'
  return 'generic_query'
}

// ── C. unsafe named-entity mutation ───────────────────────────────────────────
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
 * title, (b) is not a known business-vocab / own-brand word, and (c) is a tiny edit of
 * a title token — i.e. a generic word mutated into a possible brand/business name
 * (title "פרחי אביב" → keyword "פרחי אביה"). The caller must NOT auto-repair such a
 * keyword; it rejects the opportunity.
 */
export function detectUnsafeNamedEntityMutation(title: string, primaryKeyword: string, bs: BrandSafety): boolean {
  const titleToks = toks(title)
  const titleSet = new Set(titleToks)
  for (const k of toks(primaryKeyword)) {
    if (titleSet.has(k) || bs.ownBrandTokens.has(k) || bs.genericVocab.has(k) || GENERIC_TOKENS.has(k)) continue
    if (k.length < 3) continue
    for (const s of titleToks) {
      if (s.length >= 3 && Math.abs(s.length - k.length) <= 1 && editDistance(s, k) <= 1) return true
    }
  }
  return false
}

// ── G. final output brand-safety scan ─────────────────────────────────────────
export interface BrandScanResult { safe: boolean; reason?: 'competitor_brand_leakage'; field?: string }

/** Scan the COMPLETE user-visible suggestion for any competitor term. Any hit rejects
 *  the entire opportunity (never a partial clean). */
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
  for (const [field, val] of fields) if (val && containsCompetitorTerm(val, bs)) return { safe: false, reason: 'competitor_brand_leakage', field }
  return { safe: true }
}
