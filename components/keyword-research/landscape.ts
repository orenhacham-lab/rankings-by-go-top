/**
 * The research tab's landscape: who the site competes with, and who searches for it.
 *
 * Computed from what the tab already read, and nothing else: the seeding scan's run
 * (GET /api/projects/[id]/seed, its summary's competitors, audiences, business and site
 * icon), the research (GET /api/keyword-research/scan, where every keyword carries the
 * competitor domains whose research found it), the project's audiences as the owner
 * keeps them (project_audiences, read under RLS) and, when the project tracks
 * competitors, where they ranked against it (lib/competitors/comparison.ts). No model,
 * no Google Ads, no Serper: opening the tab still spends nothing.
 *
 * Pure: no React, no I/O.
 */
import { RESEARCH_ORIGINS, type ScanKeyword } from '@/lib/keyword-research/scan-research'
import type { CompetitorStanding } from '@/lib/competitors/comparison'
import { siteHost } from '@/lib/site-icon'

/** What the tab keeps of the scan's summary, beyond what scan-state.ts reads. */
export type SeedLandscape = {
  domain: string | null
  siteIcon: string | null
  niche: string | null
  audiences: string[]
  competitors: { domain: string; validated: boolean; seenIn: number }[]
}

export const NO_LANDSCAPE: SeedLandscape = { domain: null, siteIcon: null, niche: null, audiences: [], competitors: [] }

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** The seed route's answer → the landscape's part of it; anything unreadable is left out. */
export function readLandscape(httpStatus: number, body: unknown): SeedLandscape {
  if (httpStatus !== 200 || !body || typeof body !== 'object') return NO_LANDSCAPE
  const run = (body as { ok?: unknown; run?: unknown }).ok === true ? (body as { run?: unknown }).run : null
  const summary = run && typeof run === 'object' ? (run as { summary?: unknown }).summary : null
  if (!summary || typeof summary !== 'object') return NO_LANDSCAPE
  const s = summary as Record<string, unknown>
  const business = s.business && typeof s.business === 'object' ? (s.business as Record<string, unknown>) : null
  const audiences = Array.isArray(s.audiences) ? s.audiences.map((a) => str(a, 300)).filter((a): a is string => !!a).slice(0, 10) : []
  const competitors: SeedLandscape['competitors'] = []
  for (const c of Array.isArray(s.competitors) ? s.competitors.slice(0, 12) : []) {
    if (!c || typeof c !== 'object') continue
    const r = c as Record<string, unknown>
    const host = siteHost(str(r.domain, 253))
    if (!host || competitors.some((x) => x.domain === bareHost(host))) continue
    competitors.push({ domain: bareHost(host), validated: r.validated === true, seenIn: typeof r.seenIn === 'number' && r.seenIn > 0 ? Math.floor(r.seenIn) : 0 })
  }
  return {
    domain: str(s.domain, 253),
    // Checked again where it is shown (components/ui/SiteIcon.tsx → lib/site-icon.ts), never trusted here.
    siteIcon: str(s.siteIcon, 512),
    niche: business ? str(business.niche, 120) : null,
    audiences,
    competitors,
  }
}

export const bareHost = (host: string): string => host.toLowerCase().replace(/^www\./, '')

export type CompetitorInsight = {
  domain: string
  /** Seen in a real search result for the site's keywords (the scan's a4). */
  validated: boolean
  seenIn: number
  /** The project tracks it (its rank checks record where it stands). */
  tracked: boolean
  /** Research keywords its research found. */
  found: number
  /** Their monthly searches, summed. */
  searches: number
  /** Of those, found for the site itself too. */
  shared: number
  /** Found only for it: demand the site does not reach yet. */
  gaps: number
  gapSearches: number
  /** Its best gap keywords, most searched first (at most three). */
  topGaps: { keyword: string; volume: number | null }[]
  /** Where it ranks against the site on the tracked keywords; null when it is not compared. */
  standing: { ahead: number; compared: number } | null
}

export type CompetitorLandscape = {
  competitors: CompetitorInsight[]
  /** The site's own keywords (found for its seeds, pages or domain). */
  own: { found: number; searches: number }
  /** The largest `searches` among the site and its competitors: the bars' full width. */
  maxSearches: number
}

const own = (k: ScanKeyword) => k.origins.some((o) => RESEARCH_ORIGINS.includes(o))

/**
 * One card per competitor: every domain the scan named or whose research found a
 * keyword, and every competitor the project tracks. Validated and most-found first.
 * The site itself is never its own competitor.
 */
export function competitorLandscape(input: {
  keywords: readonly ScanKeyword[]
  scan: SeedLandscape['competitors']
  tracked?: readonly { domain: string }[]
  standings?: readonly CompetitorStanding[]
  ownDomain: string | null
}): CompetitorLandscape {
  const ownHost = input.ownDomain ? bareHost(siteHost(input.ownDomain) ?? input.ownDomain) : null
  const by = new Map<string, CompetitorInsight>()
  const entry = (raw: string): CompetitorInsight | null => {
    const host = siteHost(raw)
    const domain = host ? bareHost(host) : null
    if (!domain || domain === ownHost) return null
    let e = by.get(domain)
    if (!e) {
      e = { domain, validated: false, seenIn: 0, tracked: false, found: 0, searches: 0, shared: 0, gaps: 0, gapSearches: 0, topGaps: [], standing: null }
      by.set(domain, e)
    }
    return e
  }
  for (const c of input.scan) {
    const e = entry(c.domain)
    if (e) { e.validated = e.validated || c.validated; e.seenIn = Math.max(e.seenIn, c.seenIn) }
  }
  for (const t of input.tracked ?? []) { const e = entry(t.domain); if (e) e.tracked = true }
  for (const s of input.standings ?? []) {
    const e = entry(s.domain)
    if (e && s.compared > 0) e.standing = { ahead: s.ahead, compared: s.compared }
  }
  const gapLists = new Map<string, { keyword: string; volume: number | null }[]>()
  let ownFound = 0
  let ownSearches = 0
  for (const k of input.keywords) {
    if (k.relevant === false) continue
    const mine = own(k)
    if (mine) { ownFound++; ownSearches += k.avgMonthlySearches ?? 0 }
    for (const d of k.competitors) {
      const e = entry(d)
      if (!e) continue
      e.found++
      e.searches += k.avgMonthlySearches ?? 0
      if (mine) e.shared++
      else {
        e.gaps++
        e.gapSearches += k.avgMonthlySearches ?? 0
        const list = gapLists.get(e.domain) ?? []
        list.push({ keyword: k.keyword, volume: k.avgMonthlySearches })
        gapLists.set(e.domain, list)
      }
    }
  }
  for (const [domain, list] of gapLists) {
    by.get(domain)!.topGaps = list.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, 3)
  }
  const competitors = [...by.values()].sort((a, b) =>
    Number(b.validated || b.tracked) - Number(a.validated || a.tracked) || b.found - a.found || b.searches - a.searches || (a.domain < b.domain ? -1 : 1))
  const maxSearches = Math.max(ownSearches, ...competitors.map((c) => c.searches), 0)
  return { competitors, own: { found: ownFound, searches: ownSearches }, maxSearches }
}

/** The demand only competitors reach, counting each keyword once however many of them found it. */
export function gapDemand(keywords: readonly ScanKeyword[]): number {
  let n = 0
  for (const k of keywords) if (k.relevant !== false && k.competitors.length > 0 && !own(k)) n += k.avgMonthlySearches ?? 0
  return n
}
