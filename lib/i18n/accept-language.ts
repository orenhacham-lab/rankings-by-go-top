/**
 * Accept-Language parsing (RFC 9110 §12.5.4) — PURE, no framework imports.
 *
 * WHY A PARSER AND NOT A SUBSTRING TEST. `header.includes('he')` matches the
 * "he" inside `zh-Hant`, `iw-IL` written as `he` is a real alias that a
 * substring test gets right only by luck, and — the part that actually decides
 * the answer — a substring test cannot read q-values at all. For
 * `he;q=0.1,en;q=0.9` the user has said, explicitly and in the format the spec
 * defines, that they prefer English; a substring test would hand them Hebrew.
 *
 * WHAT IT DOES
 *   - splits the list, reads each `tag;q=…` (q defaults to 1);
 *   - drops entries with q=0 ("not acceptable") and entries whose q parameter
 *     is present but malformed — a broken parameter is not a preference;
 *   - orders by q descending, and for equal q keeps the header's own order
 *     (Array.prototype.sort is stable in every runtime we target), because the
 *     spec gives no other tiebreak and the sender's order is the best signal;
 *   - matches on the PRIMARY subtag only, case-insensitively, so `en-GB`,
 *     `en_US` and `EN` are all English;
 *   - accepts `iw` as Hebrew — the legacy ISO code some clients still send;
 *   - IGNORES `*`: it says "anything is acceptable", which is not a preference
 *     for either supported language, so the caller's own fallback should decide;
 *   - returns null when nothing supported is named, so the caller can apply its
 *     own final default rather than being handed a guess.
 */

import type { Locale } from './locales'

export interface AcceptLanguageEntry {
  /** The raw language-range, lower-cased (e.g. `en-gb`, `*`). */
  tag: string
  /** Quality value in [0,1]. Absent parameter means 1. */
  q: number
}

/** Language ranges are `1*8ALPHA *("-" 1*8alphanum)`, or `*`. Anything else is junk. */
const RANGE_RE = /^(?:\*|[a-z]{1,8}(?:[-_][a-z0-9]{1,8})*)$/

/**
 * Parse the header into entries ordered by preference (q desc, then header
 * order). Never throws; an unparseable header yields an empty list.
 */
export function parseAcceptLanguage(header: string | null | undefined): AcceptLanguageEntry[] {
  if (!header || typeof header !== 'string') return []
  const entries: AcceptLanguageEntry[] = []
  for (const raw of header.split(',')) {
    const parts = raw.trim().split(';')
    const tag = (parts.shift() ?? '').trim().toLowerCase()
    if (!tag || !RANGE_RE.test(tag)) continue
    let q = 1
    let malformed = false
    for (const param of parts) {
      const [k, v] = param.split('=')
      if ((k ?? '').trim().toLowerCase() !== 'q') continue
      const n = Number((v ?? '').trim())
      // A `q` that is not a number in [0,1] is a malformed parameter. Treating
      // it as 1 would PROMOTE a broken entry above well-formed ones, so the
      // entry is dropped instead.
      if (!Number.isFinite(n) || n < 0 || n > 1) { malformed = true; break }
      q = n
    }
    if (malformed) continue
    if (q === 0) continue // explicitly not acceptable
    entries.push({ tag, q })
  }
  // Stable sort: equal q keeps the sender's ordering.
  return entries.sort((a, b) => b.q - a.q)
}

/** The primary subtag, mapped to a supported Locale — or null. */
function localeOfTag(tag: string): Locale | null {
  const primary = tag.split(/[-_]/)[0]
  if (primary === 'en') return 'en'
  // `iw` is the deprecated ISO 639-1 code for Hebrew; some clients still send it.
  if (primary === 'he' || primary === 'iw') return 'he'
  return null
}

/**
 * The most-preferred SUPPORTED locale named by the header, or null when the
 * header names none (empty, missing, malformed, `*` only, or all-unsupported).
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  for (const e of parseAcceptLanguage(header)) {
    const locale = localeOfTag(e.tag)
    if (locale) return locale
  }
  return null
}
