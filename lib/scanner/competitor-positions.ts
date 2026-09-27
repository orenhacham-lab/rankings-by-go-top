/**
 * Where each of the project's competitors ranks, read from the SAME organic
 * results the scanner already fetched for the project's own position.
 *
 * Nothing here makes a request. The scanner hands over the result list it holds
 * anyway, and a competitor is located by exactly the rules that locate the
 * project in that list (./domain-match.ts):
 *
 *  - organic mode (pages 1 and 2, positions 1-20): the first result whose link,
 *    displayed link or sitelinks belong to the domain;
 *  - radius mode (one list per scan point): per point, the first result whose
 *    LINK belongs to the domain, numbered by its place in that point's list, and
 *    the best of those across the points that answered.
 *
 * The window is the top 20. A competitor found lower than that (possible only in
 * radius mode, whose requests ask for more results) is recorded as absent, like
 * one that was not found at all.
 */
import { normalizeDomain, isDomainMatch, extractAllURLsFromResult, type OrganicResultUrls } from './domain-match'
import type { CompetitorPosition } from './types'

/** Positions are recorded inside this window only. */
export const COMPETITOR_TOP_N = 20

/** More than the product lets a project configure (3), so a real list is never cut. */
export const MAX_COMPETITOR_DOMAINS = 10

/**
 * The configured competitor domains, normalized exactly as the scanner
 * normalizes the project's target domain (`normalizeDomain(raw.trim())`).
 * Unparseable entries are dropped, duplicates collapse to one, order is kept.
 */
export function normalizeCompetitorDomains(raw: ReadonlyArray<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const normalized = normalizeDomain(trimmed)
    if (!normalized || out.includes(normalized)) continue
    out.push(normalized)
    if (out.length >= MAX_COMPETITOR_DOMAINS) break
  }
  return out
}

/** The first result in `results` that belongs to `domain`, by the organic-mode rule. */
function firstOrganicMatch(
  results: ReadonlyArray<OrganicResultUrls & { position: number }>,
  domain: string,
): { position: number; url: string | null } | null {
  for (const result of results) {
    for (const { url } of extractAllURLsFromResult(result)) {
      if (isDomainMatch(normalizeDomain(url), domain)) {
        return { position: result.position, url: result.link || null }
      }
    }
  }
  return null
}

/**
 * Organic mode. `results` is the scanner's combined list, already numbered 1-20
 * (page 1 capped at ten, page 2 at ten). `domains` are normalized.
 */
export function locateCompetitorsInOrganic(
  results: ReadonlyArray<OrganicResultUrls & { position: number }>,
  domains: readonly string[],
): CompetitorPosition[] {
  return domains.map((domain) => {
    const hit = firstOrganicMatch(results, domain)
    return hit && hit.position >= 1 && hit.position <= COMPETITOR_TOP_N
      ? { domain, position: hit.position, url: hit.url }
      : { domain, position: null, url: null }
  })
}

/**
 * Radius mode. `pointResults` holds the organic list of every scan point that
 * answered, in scan order. Returns null when no point answered: without a result
 * page there is nothing to record, and "not in the top 20" would be a guess.
 */
export function locateCompetitorsAcrossPoints(
  pointResults: ReadonlyArray<ReadonlyArray<OrganicResultUrls>>,
  domains: readonly string[],
): CompetitorPosition[] | null {
  if (pointResults.length === 0) return null
  return domains.map((domain) => {
    let best: { position: number; url: string | null } | null = null
    for (const results of pointResults) {
      for (let i = 0; i < results.length; i++) {
        if (isDomainMatch(normalizeDomain(results[i].link), domain)) {
          const position = i + 1
          if (!best || position < best.position) best = { position, url: results[i].link || null }
          break
        }
      }
    }
    return best && best.position <= COMPETITOR_TOP_N
      ? { domain, position: best.position, url: best.url }
      : { domain, position: null, url: null }
  })
}
