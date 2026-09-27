/**
 * Building and reading the stage-A snapshot (SeedSummary).
 *
 * The snapshot is written after every step, so it always reflects exactly what
 * has been found so far. `readSummary` is the one way a stored snapshot is read
 * back — by the runner when it resumes a run, and by the API — and it copies
 * only the fields this module defines, so nothing else that might ever be put
 * into the jsonb column can leak through the API.
 */
import type { FreeCheckFinding, GeoSignal } from '@/lib/free-check'
import type { Locale } from '@/lib/i18n/locales'
import type { SeedBusiness, SeedCompetitor, SeedCounters, SeedGeo, SeedSummary } from './types'
import { safeSiteIcon } from '@/lib/site-icon'

export const PENDING_GEO: SeedGeo = { state: 'pending', unavailableReason: null, passed: 0, total: 0, signals: [] }

export function initialSummary(args: { source: 'scan' | 'claim'; domain: string; url: string; locale: Locale }): SeedSummary {
  return withCounters({
    version: 1,
    source: args.source,
    domain: args.domain,
    url: args.url,
    scannedAt: null,
    locale: args.locale,
    storefrontLocked: false,
    siteAccess: 'direct',
    business: null,
    audiences: [],
    seedKeywords: [],
    topics: [],
    findings: [],
    findingsOmitted: 0,
    geo: { ...PENDING_GEO },
    competitors: [],
    counters: { keywords: 0, fixes: 0, geoPassed: 0, geoTotal: 0, articles: 0, competitors: 0 },
    sitemapUrlCount: null,
    sitemapTruncated: false,
  })
}

/** The four tiles and the competitor count, derived — never stored independently of the lists. */
export function withCounters(summary: SeedSummary): SeedSummary {
  const counters: SeedCounters = {
    keywords: summary.seedKeywords.length,
    fixes: summary.findings.length + summary.findingsOmitted,
    geoPassed: summary.geo.passed,
    geoTotal: summary.geo.total,
    articles: summary.topics.length,
    competitors: summary.competitors.length,
  }
  return { ...summary, counters }
}

const str = (v: unknown, max = 2_000): string | null => (typeof v === 'string' ? v.slice(0, max) : null)
const bool = (v: unknown): boolean => v === true
const nonNegInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
const strList = (v: unknown, max: number, maxLen = 300): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, maxLen)).slice(0, max) : []

function readFindings(v: unknown): FreeCheckFinding[] {
  if (!Array.isArray(v)) return []
  const out: FreeCheckFinding[] = []
  for (const f of v.slice(0, 50)) {
    if (!f || typeof f !== 'object') continue
    const r = f as Record<string, unknown>
    const severity = r.severity === 'blocker' || r.severity === 'warning' || r.severity === 'info' ? r.severity : null
    const id = str(r.id, 80)
    if (!id || !severity) continue
    const finding: FreeCheckFinding = { id, severity, title: str(r.title, 300) ?? '', detail: str(r.detail, 1_000) ?? '' }
    const evidence = str(r.evidence, 200)
    if (evidence) finding.evidence = evidence
    out.push(finding)
  }
  return out
}

function readGeoSignals(v: unknown): GeoSignal[] {
  if (!Array.isArray(v)) return []
  const out: GeoSignal[] = []
  for (const s of v.slice(0, 10)) {
    if (!s || typeof s !== 'object') continue
    const r = s as Record<string, unknown>
    const id = str(r.id, 40)
    if (!id) continue
    out.push({ id, ok: bool(r.ok), title: str(r.title, 300) ?? '', detail: str(r.detail, 1_000) ?? '' })
  }
  return out
}

function readGeo(v: unknown): SeedGeo {
  if (!v || typeof v !== 'object') return { ...PENDING_GEO }
  const r = v as Record<string, unknown>
  const state = r.state === 'measured' || r.state === 'unavailable' ? r.state : 'pending'
  return {
    state,
    unavailableReason:
      state === 'unavailable' && (r.unavailableReason === 'storefront_locked' || r.unavailableReason === 'site_firewall') ? r.unavailableReason : null,
    passed: nonNegInt(r.passed),
    total: nonNegInt(r.total),
    signals: readGeoSignals(r.signals),
  }
}

function readBusiness(v: unknown): SeedBusiness | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const description = str(r.description, 1_500)
  if (!description) return null
  const commerceType = r.commerceType === 'product' || r.commerceType === 'service' || r.commerceType === 'content' ? r.commerceType : 'other'
  return {
    companyName: str(r.companyName, 200),
    description,
    commerceType,
    niche: str(r.niche, 120),
    isLocal: bool(r.isLocal),
    platform: str(r.platform, 40),
    language: str(r.language, 20),
    country: str(r.country, 2),
  }
}

function readCompetitors(v: unknown): SeedCompetitor[] {
  if (!Array.isArray(v)) return []
  const out: SeedCompetitor[] = []
  for (const c of v.slice(0, 10)) {
    if (!c || typeof c !== 'object') continue
    const r = c as Record<string, unknown>
    const domain = str(r.domain, 120)
    if (!domain) continue
    out.push({ domain, validated: bool(r.validated), seenIn: nonNegInt(r.seenIn), source: r.source === 'search' ? 'search' : 'model' })
  }
  return out
}

/**
 * Read a stored snapshot defensively: known fields only, each re-validated.
 * Returns null for anything that is not a version-1 snapshot.
 */
export function readSummary(raw: unknown): SeedSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return null
  const domain = str(r.domain, 253)
  const url = str(r.url, 2_000)
  if (!domain || !url) return null
  return withCounters({
    version: 1,
    source: r.source === 'claim' ? 'claim' : 'scan',
    domain,
    url,
    scannedAt: str(r.scannedAt, 40),
    locale: r.locale === 'en' ? 'en' : 'he',
    storefrontLocked: bool(r.storefrontLocked),
    siteAccess: r.siteAccess === 'search_index' ? 'search_index' : 'direct',
    business: readBusiness(r.business),
    audiences: strList(r.audiences, 5),
    seedKeywords: strList(r.seedKeywords, 5, 160),
    topics: strList(r.topics, 5, 200),
    findings: readFindings(r.findings),
    findingsOmitted: nonNegInt(r.findingsOmitted),
    geo: readGeo(r.geo),
    competitors: readCompetitors(r.competitors),
    counters: { keywords: 0, fixes: 0, geoPassed: 0, geoTotal: 0, articles: 0, competitors: 0 },
    sitemapUrlCount: typeof r.sitemapUrlCount === 'number' && r.sitemapUrlCount >= 0 ? Math.floor(r.sitemapUrlCount) : null,
    sitemapTruncated: bool(r.sitemapTruncated),
    // Checked again on every read (https, on this site, bounded), never trusted because stored.
    ...siteIconField(safeSiteIcon(r.siteIcon, domain)),
  })
}

const siteIconField = (icon: string | null): { siteIcon?: string } => (icon ? { siteIcon: icon } : {})
