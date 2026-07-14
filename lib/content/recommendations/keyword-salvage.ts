/**
 * Long-tail keyword salvage (Part 4) — pure, no model, no network.
 *
 * A bare primary-keyword collision (the candidate's primaryKeyword already equals
 * an owned project/pending/content keyword) is NOT a topic collision: a broad
 * category keyword can support many distinct subtopics. Instead of permanently
 * rejecting, we derive ONE narrower long-tail primary keyword from the candidate's
 * OWN structured data (its secondary keywords, then its title's leading phrase) and
 * re-validate it against the SAME owned/semantic/coverage checks. One attempt only;
 * no filler — if nothing distinct and supported is found, the candidate is rejected.
 */

import { normalizePhrase } from './keyword-guard'

export interface SalvageCandidate {
  title: string
  primaryKeyword: string
  secondaryKeywords?: string[]
}

export interface SalvageChecks {
  /** The normalized keyword is already an owned project/pending/content keyword. */
  isOwnedKeyword: (normalizedKeyword: string) => boolean
  /** The keyword is a semantic near-duplicate of an owned keyword (frozen corpus). */
  isSemanticKeywordDup: (keyword: string) => boolean
  /** The (title, keyword) pair is already covered by existing published content. */
  isCoveredByContent: (title: string, keyword: string) => boolean
}

export interface SalvageResult {
  ok: boolean
  /** The narrower long-tail keyword (original casing) when ok. */
  keyword?: string
  /** Where it came from (diagnostics). */
  source?: 'secondary_keyword' | 'title_phrase'
}

const SEGMENT_SPLIT = /\s+[–—-]\s+|\s*\|\s*|:\s+/

/**
 * Derive one narrower, distinct, supported long-tail primary keyword for a
 * candidate whose primaryKeyword collided with an owned keyword. Returns ok:false
 * when no distinct, non-covered, non-duplicate long-tail can be formed.
 */
export function salvageLongTailKeyword(candidate: SalvageCandidate, checks: SalvageChecks): SalvageResult {
  const broad = normalizePhrase(candidate.primaryKeyword)
  const acceptable = (kw: string): boolean => {
    const nk = normalizePhrase(kw)
    if (!nk || nk === broad) return false
    if (nk.split(' ').length < 2) return false // long-tail must be multi-word
    if (checks.isOwnedKeyword(nk)) return false
    if (checks.isSemanticKeywordDup(kw)) return false
    if (checks.isCoveredByContent(candidate.title, kw)) return false
    return true
  }

  // 1) A secondary keyword is already article-relevant; prefer one that EXTENDS the
  //    broad keyword (shares its tokens) so the salvaged target stays on-topic.
  const secondaries = (candidate.secondaryKeywords || [])
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .sort((a, b) => (normalizePhrase(b).includes(broad) ? 1 : 0) - (normalizePhrase(a).includes(broad) ? 1 : 0))
  for (const sk of secondaries) if (acceptable(sk)) return { ok: true, keyword: sk, source: 'secondary_keyword' }

  // 2) The title's leading phrase (before a separator) is a real, specific query.
  const seg = (candidate.title.split(SEGMENT_SPLIT)[0] || '').trim()
  if (seg && acceptable(seg)) return { ok: true, keyword: seg, source: 'title_phrase' }

  return { ok: false }
}
