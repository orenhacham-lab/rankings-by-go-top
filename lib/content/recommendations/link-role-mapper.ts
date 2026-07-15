/**
 * Internal-link role mapper (F) — PURE, domain-neutral. Runs AFTER an opportunity
 * survives worthiness. Assigns every candidate indexed URL/entity a typed role with
 * a reason + score.
 *
 * P0 fix — the previous version scored with raw token Jaccard, which (a) dropped the
 * truly relevant commercial page as "unrelated" because a long opportunity title
 * diluted the overlap, and (b) kept unrelated pages that merely shared a generic
 * product-TYPE word. The new scoring is SPECIFICITY-WEIGHTED and Hebrew-aware:
 *   - tokens are normalized with the SAME proclitic-aware tokenizer as the cluster
 *     builder (so "בצבעים"/"לכלה" match, not false-mismatch);
 *   - a token that is a generic modifier (best/price/משלוח…) contributes nothing;
 *   - a token that is a product-TYPE word ubiquitous across the candidate corpus
 *     (data-derived, NOT a hardcoded list) is down-weighted — sharing only a type
 *     word is never enough for a target or a supporting link;
 *   - a page is relevant when it shares a DISTINCTIVE subject token with the article.
 * The primary commercial target is the strongest commercial match, never demoted for
 * a longer candidate; it is excluded from supporting links; URLs are de-duplicated;
 * "no target" beats an unrelated target.
 */

import { contentTokens } from './evidence-cluster'
import { GENERIC_TOKENS } from './opportunity'

export type LinkRole = 'primary_commercial_target' | 'secondary_commercial_target' | 'supporting_informational_link' | 'source_reference' | 'unrelated'
export type EntityPageType = 'product' | 'category' | 'service' | 'page' | 'post' | 'article' | 'unknown'

export interface LinkCandidateEntity { url: string; title: string; type?: EntityPageType }
export interface RoleAssignment { url: string; title: string; role: LinkRole; reason: string; score: number }

const COMMERCIAL_TYPES = new Set<EntityPageType>(['product', 'category', 'service'])
const INFORMATIONAL_TYPES = new Set<EntityPageType>(['post', 'article', 'page'])
const urlKey = (u: string) => (u || '').trim().toLowerCase().replace(/\/+$/, '')

// Relevance floor: a link needs at least ONE distinctive shared subject token
// (weight 1.0). A pile of generic/type-word matches never reaches it.
const RELEVANCE_FLOOR = 0.9
// A commercial target within this fraction of the best commercial score is kept as a
// secondary target; far-weaker generic matches are dropped when a strong one exists.
const RELATIVE_KEEP = 0.5
const TYPE_WORD_WEIGHT = 0.2

/**
 * Map each candidate to a role for one opportunity. Returns assignments sorted by
 * role priority then score; de-duplicated by URL; the chosen primary target never
 * also appears as a supporting link.
 */
export function mapLinkRoles(
  opportunityKeyword: string,
  opportunityTitle: string,
  candidates: LinkCandidateEntity[],
): { primaryTarget: RoleAssignment | null; assignments: RoleAssignment[] } {
  const oppToks = new Set(contentTokens(`${opportunityKeyword} ${opportunityTitle}`))

  // De-dup candidates by URL and pre-tokenize.
  const seen = new Set<string>()
  const prepared: { c: LinkCandidateEntity; toks: string[] }[] = []
  for (const c of candidates) {
    const k = urlKey(c.url)
    if (!k || seen.has(k)) continue
    seen.add(k)
    prepared.push({ c, toks: contentTokens(c.title) })
  }

  // Document frequency across candidate titles → identify ubiquitous product-TYPE
  // words (data-derived, domain-neutral). A token in >= 50% of candidates (and at
  // least 4 of them) is a "type word" and is down-weighted so it cannot, alone,
  // qualify a link.
  const df = new Map<string, number>()
  for (const { toks } of prepared) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1)
  const N = prepared.length
  const isTypeWord = (t: string) => { const d = df.get(t) ?? 0; return d >= 4 && d / Math.max(1, N) >= 0.5 }
  const weight = (t: string) => (GENERIC_TOKENS.has(t) ? 0 : isTypeWord(t) ? TYPE_WORD_WEIGHT : 1)

  const scored: RoleAssignment[] = []
  for (const { c, toks } of prepared) {
    const shared = toks.filter((t) => oppToks.has(t))
    const score = Number(shared.reduce((s, t) => s + weight(t), 0).toFixed(3))
    const hasDistinctiveMatch = shared.some((t) => weight(t) >= 1)
    const isCommercial = COMMERCIAL_TYPES.has(c.type ?? 'unknown')
    const isInformational = INFORMATIONAL_TYPES.has(c.type ?? 'unknown')

    let role: LinkRole
    let reason: string
    if (score < RELEVANCE_FLOOR || !hasDistinctiveMatch) {
      role = 'unrelated'
      reason = shared.length ? 'generic_or_type_word_only' : 'no_topical_overlap'
    } else if (isCommercial) {
      role = 'secondary_commercial_target' // promoted to primary below for the best
      reason = 'distinctive_commercial_subject_match'
    } else if (isInformational) {
      role = 'supporting_informational_link'
      reason = 'distinctive_informational_match'
    } else {
      role = 'source_reference'
      reason = 'distinctive_match_unknown_type'
    }
    scored.push({ url: c.url, title: c.title, role, reason, score })
  }

  // The single strongest commercial target becomes THE primary; other commercial
  // matters within RELATIVE_KEEP of it stay secondary, weaker ones are dropped.
  const commercial = scored.filter((a) => a.role === 'secondary_commercial_target').sort((a, b) => b.score - a.score)
  let primaryTarget: RoleAssignment | null = null
  if (commercial.length) {
    const best = commercial[0].score
    primaryTarget = { ...commercial[0], role: 'primary_commercial_target', reason: 'best_commercial_match' }
    for (const a of scored) {
      if (a.role !== 'secondary_commercial_target') continue
      if (urlKey(a.url) === urlKey(primaryTarget.url)) { a.role = 'primary_commercial_target'; a.reason = 'best_commercial_match' }
      else if (a.score < best * RELATIVE_KEEP) { a.role = 'unrelated'; a.reason = 'outranked_generic_commercial' }
    }
  }

  const rolePriority: Record<LinkRole, number> = { primary_commercial_target: 0, secondary_commercial_target: 1, supporting_informational_link: 2, source_reference: 3, unrelated: 4 }
  const assignments = scored
    .filter((a) => a.role !== 'unrelated') // "no target" beats an unrelated target
    .sort((a, b) => rolePriority[a.role] - rolePriority[b.role] || b.score - a.score)
  return { primaryTarget, assignments }
}

/** Ordered link list for an opportunity: primary target first, then supporting
 *  links EXCLUDING the primary URL, de-duplicated. */
export function orderedLinksForOpportunity(mapped: ReturnType<typeof mapLinkRoles>): { url: string; anchor: string; role: LinkRole }[] {
  const out: { url: string; anchor: string; role: LinkRole }[] = []
  const seen = new Set<string>()
  const push = (a: RoleAssignment) => { const k = urlKey(a.url); if (!k || seen.has(k)) return; seen.add(k); out.push({ url: a.url, anchor: a.title, role: a.role }) }
  if (mapped.primaryTarget) push(mapped.primaryTarget)
  for (const a of mapped.assignments) {
    if (a.role === 'primary_commercial_target') continue // already added (never a supporting dup)
    push(a)
  }
  return out
}
