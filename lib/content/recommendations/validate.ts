/**
 * MINIMAL, non-destructive recommendation validation.
 *
 * The ONLY post-generation processing allowed: drop an item that fails a safe
 * rule. It NEVER rewrites, replaces, deletes or transliterates any word — a title
 * or reason that passes is returned byte-for-byte as the model produced it.
 *
 * There is deliberately NO semantic filter here: no fuzzy matching, no claim
 * lexicon, no cannibalization engine, no entity/syntax caps. Those over-suppressed
 * the set in production; grounding/diversity are handled by the PROMPT instead.
 */

export type RejectReason =
  | 'empty_title'
  | 'empty_keyword'
  | 'duplicate_title'
  | 'stale_year'
  | 'internal_label'
  | 'missing_field'

export interface ValidatableIdea {
  title?: unknown
  primaryKeyword?: unknown
  reason?: unknown
}

/** Normalized title key for EXACT-duplicate detection (whitespace/case only —
 *  no stemming, no token edits). Used to reject byte-equal / trivially-equal
 *  titles, never to merge distinct ones. */
export function normalizeTitleKey(title: string): string {
  return (title || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** True when a year in the title is legitimate HISTORICAL context (kept), not a
 *  stale "current" framing. Mirrors the acceptance rule: preserve שנות ה-90 /
 *  ranges / launch years; reject an obvious past "current" year. */
export function isHistoricalYear(title: string): boolean {
  const t = title || ''
  return (
    /שנות ה[-'’]?\d0/.test(t) ||
    /(19|20)\d{2}\s*[־–—-]+\s*(19|20)\d{2}/.test(t) ||
    /בין\s*(19|20)\d{2}/.test(t) ||
    /(הושק|הושקו|יצא|יצאו|נוסד|נוסדה|משנת|בשנת|עד שנת|מאז)/.test(t) ||
    /\b(since|founded in|launched in|history of|in the)\b/i.test(t) ||
    /\b(19|20)\d0s\b/i.test(t)
  )
}

/** An obvious stale CURRENT-framing year: a past 4-digit year in the title that is
 *  not legitimate historical context. Reject the item (never rewrite the title). */
export function hasStaleCurrentYear(title: string, currentYear: number): boolean {
  const t = title || ''
  const years = (t.match(/\b(19|20)\d{2}\b/g) || []).map(Number)
  if (years.length === 0) return false
  if (isHistoricalYear(t)) return false
  return years.some((y) => y < currentYear)
}

/** Internal labels that must never reach a user-facing reason (leak guard). */
const INTERNAL_LABEL = /cluster\s*\d+|sourceContext|gid:\/\/|\bcluster\b/i

/**
 * Validate one model idea against the minimal safe rules. Returns the reject
 * reason, or null when the item passes (and is kept UNCHANGED). `seen` accumulates
 * normalized titles for exact-duplicate rejection across the batch + existing set.
 */
export function validateIdea(idea: ValidatableIdea, seen: Set<string>, currentYear: number): RejectReason | null {
  const title = typeof idea.title === 'string' ? idea.title.trim() : ''
  const keyword = typeof idea.primaryKeyword === 'string' ? idea.primaryKeyword.trim() : ''
  const reason = typeof idea.reason === 'string' ? idea.reason : ''
  if (idea.title === undefined || idea.primaryKeyword === undefined) return 'missing_field'
  if (!title) return 'empty_title'
  if (!keyword) return 'empty_keyword'
  if (INTERNAL_LABEL.test(reason) || INTERNAL_LABEL.test(title)) return 'internal_label'
  if (hasStaleCurrentYear(title, currentYear)) return 'stale_year'
  const key = normalizeTitleKey(title)
  if (seen.has(key)) return 'duplicate_title'
  seen.add(key)
  return null
}
