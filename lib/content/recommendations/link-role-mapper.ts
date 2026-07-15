/**
 * Internal-link role mapper (F) — PURE, domain-neutral. Runs AFTER an opportunity
 * survives worthiness. Assigns every candidate indexed URL/entity a typed role with
 * a reason + score, based on page type, topic/entity match, intent relationship and
 * URL relevance. A commercial page the opportunity directly serves becomes a
 * primary/secondary commercial target — never demoted to a supporting link merely
 * because the candidate keyword is longer. The primary target URL is excluded from
 * supporting links; URLs are de-duplicated; "no target" beats an unrelated target.
 */

import { tokens, jaccard } from './dedupe'
import { normalizePhrase } from './keyword-guard'

export type LinkRole = 'primary_commercial_target' | 'secondary_commercial_target' | 'supporting_informational_link' | 'source_reference' | 'unrelated'
export type EntityPageType = 'product' | 'category' | 'service' | 'page' | 'post' | 'article' | 'unknown'

export interface LinkCandidateEntity { url: string; title: string; type?: EntityPageType }
export interface RoleAssignment { url: string; title: string; role: LinkRole; reason: string; score: number }

const COMMERCIAL_TYPES = new Set<EntityPageType>(['product', 'category', 'service'])
const toks = (s: string) => tokens(normalizePhrase(s || ''))
const urlKey = (u: string) => (u || '').trim().toLowerCase().replace(/\/+$/, '')

/**
 * Map each candidate to a role for one opportunity. `opportunityKeyword` +
 * `opportunityTitle` describe the surviving article. Returns assignments sorted by
 * role priority then score; de-duplicated by URL; the chosen primary target never
 * also appears as a supporting link.
 */
export function mapLinkRoles(
  opportunityKeyword: string,
  opportunityTitle: string,
  candidates: LinkCandidateEntity[],
): { primaryTarget: RoleAssignment | null; assignments: RoleAssignment[] } {
  const oppToks = new Set([...toks(opportunityKeyword), ...toks(opportunityTitle)])
  const seen = new Set<string>()
  const scored: RoleAssignment[] = []

  for (const c of candidates) {
    const k = urlKey(c.url)
    if (!k || seen.has(k)) continue
    seen.add(k)
    const overlap = jaccard(oppToks, new Set(toks(c.title)))
    const isCommercial = COMMERCIAL_TYPES.has(c.type ?? 'unknown')
    let role: LinkRole
    let reason: string
    if (overlap < 0.12) { role = 'unrelated'; reason = 'low_topic_overlap' }
    else if (isCommercial && overlap >= 0.5) { role = 'primary_commercial_target'; reason = 'commercial_page_directly_served' }
    else if (isCommercial && overlap >= 0.25) { role = 'secondary_commercial_target'; reason = 'commercial_page_related' }
    else if ((c.type === 'post' || c.type === 'article') && overlap >= 0.2) { role = 'supporting_informational_link'; reason = 'related_informational_page' }
    else if (overlap >= 0.25) { role = 'supporting_informational_link'; reason = 'related_page' }
    else { role = 'source_reference'; reason = 'weak_but_relevant' }
    scored.push({ url: c.url, title: c.title, role, reason, score: Number(overlap.toFixed(3)) })
  }

  // The single best commercial target becomes THE primary; others stay secondary.
  const commercial = scored.filter((a) => a.role === 'primary_commercial_target' || a.role === 'secondary_commercial_target')
    .sort((a, b) => b.score - a.score)
  let primaryTarget: RoleAssignment | null = null
  if (commercial.length) {
    primaryTarget = { ...commercial[0], role: 'primary_commercial_target', reason: 'best_commercial_match' }
    for (const a of scored) {
      if (urlKey(a.url) === urlKey(primaryTarget.url)) { a.role = 'primary_commercial_target'; a.reason = 'best_commercial_match' }
      else if (a.role === 'primary_commercial_target') { a.role = 'secondary_commercial_target'; a.reason = 'commercial_page_related' }
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
