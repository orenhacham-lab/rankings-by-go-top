/**
 * "You already have a page on this" for the keyword research (wave 9).
 *
 * The owner, on japan4u: the research offered phrases the site already covers with
 * an existing page, which would end in duplicate content. Each research keyword is
 * asked THE shared cannibalization check (lib/content/cannibalization/check.ts), the
 * one every creation path asks, against the site only: the full-site mapping and the
 * site's indexes (`page`), our own articles (`article`), and the Search Console
 * queries it already ranks for with a page (`search`). A match is marked, not
 * removed: the research screen moves it out of the opportunities into a collapsed
 * "already covered" group, with "improve the page" (an in-app path only).
 *
 * Pure: the index is built by the caller (lib/content/cannibalization/load.ts).
 */
import { checkOverlap, overlapPayload, SITE_KINDS, type OverlapIndex } from '@/lib/content/cannibalization/check'
import { readOverlap, type OverlapPayload } from '@/lib/content/cannibalization/client'
import { keywordKey } from './scan-research'

/** Covered keywords by keywordKey. */
export type CoveredMap = Record<string, OverlapPayload>

export function coveredKeywords(index: OverlapIndex, keywords: readonly { keyword: string }[]): CoveredMap {
  const out: CoveredMap = {}
  for (const { keyword } of keywords) {
    const key = keywordKey(keyword)
    if (!key || out[key]) continue
    const payload = overlapPayload(checkOverlap(index, { keyword }, { kinds: SITE_KINDS }))
    if (payload && payload.onSite) out[key] = payload
  }
  return out
}

/** The route's `covered` field, read defensively (a malformed entry is dropped). */
export function readCovered(v: unknown): CoveredMap | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: CoveredMap = {}
  for (const [key, raw] of Object.entries(v as Record<string, unknown>)) {
    const o = readOverlap(raw)
    if (o && o.onSite && key) out[key] = o
  }
  return Object.keys(out).length > 0 ? out : undefined
}
