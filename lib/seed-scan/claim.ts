/**
 * Seeding a project from the visitor's anonymous free check.
 *
 * The free check hands its visitor a one-time token (lib/free-check/claim.ts);
 * redeeming it returns the exact ledger row that visitor watched, never a
 * lookup by domain. The route redeems it and, only when the scanned domain IS
 * the project's domain, stores the snapshot below on step a1. Steps a1-a3 then
 * seed from it with no fetch and no model call; a4 still validates competitors
 * against real search results.
 *
 * The stored result is data we wrote, but it is read defensively all the same:
 * every list is re-validated and capped before it becomes part of a project.
 *
 * What a claim cannot carry: the free check stores only its public teaser, so
 * the findings beyond the teaser are known by count only (findingsOmitted), and
 * the model's competitor list is cut to the first two. a4 compensates for the
 * second by adding what the search results show.
 */
import { domainKey, normalizeCheckUrl, type ClaimedScan, type FreeCheckBusiness, type FreeCheckFinding, type GeoSignal } from '@/lib/free-check'
import type { Locale } from '@/lib/i18n/locales'
import type { SeedBusiness } from './types'

/** Exactly what a1-a3 need from the claimed row, validated. Stored on step a1. */
export type ClaimSnapshot = {
  checkId: string
  url: string
  domain: string
  locale: Locale
  scannedAt: string | null
  business: SeedBusiness | null
  audiences: string[]
  keywords: string[]
  articles: string[]
  competitors: string[]
  findings: FreeCheckFinding[]
  findingsOmitted: number
  geo: { passed: number; total: number; signals: GeoSignal[] }
}

/** The domain key of a project's target_domain, or null when it is not a public web address. */
export function projectSiteKey(targetDomain: string | null | undefined): string | null {
  const admitted = normalizeCheckUrl(targetDomain ?? '')
  return admitted.ok ? domainKey(admitted.url) : null
}

/** A claim seeds this project only when the site it scanned is this project's site. */
export function claimMatchesProject(scan: Pick<ClaimedScan, 'url' | 'domain'>, siteKey: string): boolean {
  const admitted = normalizeCheckUrl(scan.url ?? '')
  if (!admitted.ok) return false
  return domainKey(admitted.url) === siteKey && scan.domain === siteKey
}

/** Distinct, whitespace-collapsed, non-empty strings of `v`, at most `max` of them, each at most `maxLen` long. */
export function cleanList(v: unknown, max: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') continue
    const s = x.replace(/\s+/g, ' ').trim().slice(0, maxLen)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** The engine's business insight as a seed business; null without a summary. */
export function toSeedBusiness(v: FreeCheckBusiness | null | undefined): SeedBusiness | null {
  if (!v || typeof v !== 'object' || typeof v.summary !== 'string' || !v.summary.trim()) return null
  const commerce = v.commerceType === 'product' || v.commerceType === 'service' || v.commerceType === 'content' ? v.commerceType : 'other'
  const text = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null)
  const country = text(v.country, 2)?.toUpperCase() ?? null
  return {
    companyName: text(v.companyName, 200),
    description: v.summary.trim().slice(0, 1_500),
    commerceType: commerce,
    niche: text(v.niche, 120),
    isLocal: v.isLocal === true,
    platform: text(v.platform, 40),
    language: text(v.language, 20),
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
  }
}

function findings(v: unknown): FreeCheckFinding[] {
  if (!Array.isArray(v)) return []
  const out: FreeCheckFinding[] = []
  for (const f of v.slice(0, 50)) {
    if (!f || typeof f !== 'object') continue
    const r = f as Record<string, unknown>
    if (typeof r.id !== 'string' || (r.severity !== 'blocker' && r.severity !== 'warning' && r.severity !== 'info')) continue
    const item: FreeCheckFinding = {
      id: r.id.slice(0, 80),
      severity: r.severity,
      title: typeof r.title === 'string' ? r.title.slice(0, 300) : '',
      detail: typeof r.detail === 'string' ? r.detail.slice(0, 1_000) : '',
    }
    if (typeof r.evidence === 'string' && r.evidence) item.evidence = r.evidence.slice(0, 200)
    out.push(item)
  }
  return out
}

function geo(v: unknown): ClaimSnapshot['geo'] {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const signals: GeoSignal[] = []
  if (Array.isArray(r.signals)) {
    for (const s of r.signals.slice(0, 10)) {
      if (!s || typeof s !== 'object') continue
      const x = s as Record<string, unknown>
      if (typeof x.id !== 'string') continue
      signals.push({
        id: x.id.slice(0, 40),
        ok: x.ok === true,
        title: typeof x.title === 'string' ? x.title.slice(0, 300) : '',
        detail: typeof x.detail === 'string' ? x.detail.slice(0, 1_000) : '',
      })
    }
  }
  return { passed: signals.filter((s) => s.ok).length, total: signals.length, signals }
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)

/** Build the stored snapshot from a redeemed claim. */
export function claimSnapshot(scan: ClaimedScan): ClaimSnapshot {
  const result = (scan.result ?? {}) as unknown as Record<string, unknown>
  const biz = toSeedBusiness(result.business as FreeCheckBusiness | null | undefined)
  return {
    checkId: scan.checkId,
    url: scan.url,
    domain: scan.domain,
    locale: scan.locale === 'en' ? 'en' : 'he',
    scannedAt: typeof result.scannedAt === 'string' ? result.scannedAt.slice(0, 40) : null,
    business: biz,
    audiences: cleanList((result.business as FreeCheckBusiness | null | undefined)?.audiences, 5, 300),
    keywords: cleanList(result.keywords, 5, 160),
    articles: cleanList(result.articles, 5, 200),
    competitors: cleanList(result.competitors, 6, 120),
    findings: findings(result.findings),
    findingsOmitted: count(result.lockedFindings),
    geo: geo(result.geo),
  }
}

/** Read a snapshot back from step a1's detail; null when it is missing or not one. */
export function readClaimSnapshot(detail: Record<string, unknown> | null | undefined): ClaimSnapshot | null {
  const raw = detail?.claim
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.checkId !== 'string' || typeof r.url !== 'string' || typeof r.domain !== 'string') return null
  return {
    checkId: r.checkId,
    url: r.url,
    domain: r.domain,
    locale: r.locale === 'en' ? 'en' : 'he',
    scannedAt: typeof r.scannedAt === 'string' ? r.scannedAt : null,
    business: toSeedBusiness(
      r.business && typeof r.business === 'object'
        ? ({ ...(r.business as Record<string, unknown>), summary: (r.business as Record<string, unknown>).description } as unknown as FreeCheckBusiness)
        : null,
    ),
    audiences: cleanList(r.audiences, 5, 300),
    keywords: cleanList(r.keywords, 5, 160),
    articles: cleanList(r.articles, 5, 200),
    competitors: cleanList(r.competitors, 6, 120),
    findings: findings(r.findings),
    findingsOmitted: count(r.findingsOmitted),
    geo: geo(r.geo),
  }
}
