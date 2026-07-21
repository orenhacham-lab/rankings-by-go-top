/**
 * Stage E2A — deterministic query normalization + tokenization (pure).
 *
 * Read-only opportunity intelligence only. This module NEVER mutates content and is fully
 * isolated from the recommendation engine. Normalization is language-agnostic and generic:
 * it lowercases, strips Hebrew niqqud, folds punctuation to spaces, and collapses spacing —
 * with NO project/customer/industry vocabulary.
 */

// Hebrew niqqud (vowel points) + cantillation marks — removed so "שֵׁרוּת" == "שרות".
const NIQQUD = /[֑-ׇ]/g
// A tiny, generic connector stopword set (Hebrew + English). Only trivial glue words that
// never carry a distinguishing modifier — so containment comparison isn't skewed by them.
const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'with', 'is', 'are',
  // Hebrew connectors / articles / prepositions
  'של', 'עם', 'את', 'על', 'אל', 'או', 'גם', 'הוא', 'היא', 'זה', 'זו',
])

/** Lowercase, strip niqqud, fold punctuation to spaces, collapse + trim whitespace. */
export function normalizeQuery(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(NIQQUD, '')
    // Replace any character that is not a letter/number (Unicode-aware) with a space.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** All normalized tokens (order preserved, duplicates kept). */
export function tokenize(input: string): string[] {
  const n = normalizeQuery(input)
  return n ? n.split(' ') : []
}

/** Meaningful content tokens: normalized tokens minus the generic connector stopwords.
 *  Falls back to the raw token set when a query is ALL stopwords (never returns empty for
 *  a non-empty query). */
export function contentTokens(input: string): string[] {
  const all = tokenize(input)
  const kept = all.filter((t) => !STOPWORDS.has(t))
  return kept.length > 0 ? kept : all
}

/** Deterministic set (sorted unique) of content tokens — for order-independent comparison. */
export function contentTokenSet(input: string): string[] {
  return Array.from(new Set(contentTokens(input))).sort()
}
