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
 * WHAT A CLAIM CARRIES. A check recorded since free_site_checks.seed exists
 * (09ee926) carries its ungated set next to the public result: every finding,
 * every competitor the model named, and the home page's own internal links.
 * The snapshot takes those (`basis: 'seed'`): a3 reports every finding, a4
 * checks every competitor, and b1 has the home page's links to fall back on.
 * An older row has no seed and only its public teaser (`basis: 'teaser'`): the
 * findings beyond the teaser are known by count only (findingsOmitted), the
 * competitors are the two shown, and there are no links. a4 makes up for the
 * competitors by adding what the search results show. Either way the claim
 * path fetches nothing and asks no model.
 *
 * A SPENT TOKEN THAT SEEDED NOTHING. The route redeems the token only after
 * every check it makes before creating the run (so no refusal of theirs spends
 * it), but creating the run comes after, and can still fail: another run of the
 * project won the race, or the database answered with an error. Then
 * restoreClaimToken gives the token back, so the visitor can claim again.
 */
import {
  domainKey,
  hashClaimToken,
  MAX_INTERNAL_LINK_URLS,
  normalizeCheckUrl,
  type ClaimedScan,
  type FreeCheckBusiness,
  type FreeCheckFinding,
  type GeoSignal,
} from '@/lib/free-check'
import type { Locale } from '@/lib/i18n/locales'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { SeedBusiness } from './types'

/** Exactly what a1-a3 (and b1) need from the claimed row, validated. Stored on step a1. */
export type ClaimSnapshot = {
  checkId: string
  url: string
  domain: string
  locale: Locale
  scannedAt: string | null
  /** 'seed': the row's ungated set was used; 'teaser': a row without one, its public result only. */
  basis: 'seed' | 'teaser'
  business: SeedBusiness | null
  audiences: string[]
  keywords: string[]
  articles: string[]
  competitors: string[]
  findings: FreeCheckFinding[]
  findingsOmitted: number
  geo: { passed: number; total: number; signals: GeoSignal[] }
  /** The home page's internal links on this site, as the free check read them; empty on a teaser. */
  internalLinkUrls: string[]
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

/** A stored link longer than this is not kept (a percent-encoded Hebrew slug runs to a few hundred). */
const MAX_LINK_CHARS = 2_048

/**
 * The page's links that are this site's own pages: absolute http(s) URLs with
 * no credentials and no port whose domainKey is `siteKey`, the fragment
 * dropped, distinct, at most as many as the engine extracts from a page
 * (MAX_INTERNAL_LINK_URLS). b1 admits each again before it reads one.
 */
export function siteLinks(v: unknown, siteKey: string): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) {
    if (out.length >= MAX_INTERNAL_LINK_URLS) break
    if (typeof x !== 'string' || x.length > MAX_LINK_CHARS) continue
    let url: URL
    try {
      url = new URL(x)
    } catch {
      continue
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.port) continue
    if (domainKey(url) !== siteKey) continue
    url.hash = ''
    const link = url.toString()
    if (!out.includes(link)) out.push(link)
  }
  return out
}

/** The row's ungated set when it has a usable one (three lists), else null: a row recorded before the column. */
function readSeed(v: unknown): { findings: unknown[]; competitors: unknown[]; internalLinkUrls: unknown[] } | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (!Array.isArray(r.findings) || !Array.isArray(r.competitors) || !Array.isArray(r.internalLinkUrls)) return null
  return { findings: r.findings, competitors: r.competitors, internalLinkUrls: r.internalLinkUrls }
}

/** Build the stored snapshot from a redeemed claim: from its seed when it has one, from its teaser otherwise. */
export function claimSnapshot(scan: ClaimedScan): ClaimSnapshot {
  const result = (scan.result ?? {}) as unknown as Record<string, unknown>
  const biz = toSeedBusiness(result.business as FreeCheckBusiness | null | undefined)
  const seed = readSeed(scan.seed)
  return {
    checkId: scan.checkId,
    url: scan.url,
    domain: scan.domain,
    locale: scan.locale === 'en' ? 'en' : 'he',
    scannedAt: typeof result.scannedAt === 'string' ? result.scannedAt.slice(0, 40) : null,
    basis: seed ? 'seed' : 'teaser',
    business: biz,
    audiences: cleanList((result.business as FreeCheckBusiness | null | undefined)?.audiences, 5, 300),
    keywords: cleanList(result.keywords, 5, 160),
    articles: cleanList(result.articles, 5, 200),
    // Every competitor the model named, capped as a live a2 caps them; a teaser shows two.
    competitors: cleanList(seed ? seed.competitors : result.competitors, 6, 120),
    // Every finding; a teaser's locked ones are known by count only.
    findings: findings(seed ? seed.findings : result.findings),
    findingsOmitted: seed ? 0 : count(result.lockedFindings),
    geo: geo(result.geo),
    internalLinkUrls: seed ? siteLinks(seed.internalLinkUrls, scan.domain) : [],
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
    // A snapshot stored before the seed existed reads as the teaser it was.
    basis: r.basis === 'seed' ? 'seed' : 'teaser',
    internalLinkUrls: siteLinks(r.internalLinkUrls, r.domain),
  }
}

/**
 * Give back a token this request redeemed at `consumedAt` and then could not
 * use (its run was never created). Conditional on the very consumption this
 * request made: the row's consumed_at must still be that instant, so it never
 * revives a token some other redemption spent. true when it is claimable again.
 */
export async function restoreClaimToken(admin: ServiceRoleClient, token: string, consumedAt: Date): Promise<boolean> {
  const { data, error } = await admin
    .from('free_site_check_claims')
    .update({ consumed_at: null })
    .eq('token_hash', hashClaimToken(token))
    .eq('consumed_at', consumedAt.toISOString())
    .select('check_id')
  return !error && ((data as unknown[] | null)?.length ?? 0) === 1
}

// ── A claimed research (the visitor's anonymous stage A, lib/presignup) ─────

type SavedStep = { status: 'done' | 'skipped' | 'failed'; errorCode: string | null; itemCount: number | null }

/**
 * What a claimed research's run keeps on step a1, beside the visitor's own a1
 * detail: the site the research read and how, and how each of its four steps
 * ended. steps.ts replays the run from it without any I/O.
 */
export type ResearchMarker = {
  domain: string
  url: string
  locale: Locale
  scannedAt: string | null
  storefrontLocked: boolean
  siteAccess: 'direct' | 'search_index'
  sitemapUrlCount: number | null
  sitemapTruncated: boolean
  steps: Partial<Record<'a1' | 'a2' | 'a3' | 'a4', SavedStep>>
}

/** The research a free_site_checks row carries in `seed.research` (lib/presignup/view.ts researchSeed). */
export type ResearchSeed = {
  marker: ResearchMarker
  /** The visitor's own step details: a1's read of the site, a2's answer, a4's searches. */
  details: { a1: Record<string, unknown>; a2: Record<string, unknown>; a4: Record<string, unknown> }
}

const STEP_CODE = /^[a-z0-9_]{1,64}$/

function savedSteps(v: unknown): ResearchMarker['steps'] | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out: ResearchMarker['steps'] = {}
  for (const step of ['a1', 'a2', 'a3', 'a4'] as const) {
    const raw = (v as Record<string, unknown>)[step]
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (r.status !== 'done' && r.status !== 'skipped' && r.status !== 'failed') continue
    out[step] = {
      status: r.status,
      errorCode: typeof r.errorCode === 'string' && STEP_CODE.test(r.errorCode) ? r.errorCode : null,
      itemCount: typeof r.itemCount === 'number' && Number.isFinite(r.itemCount) && r.itemCount >= 0 ? Math.floor(r.itemCount) : null,
    }
  }
  return out
}

/** Read a marker back defensively; null when `v` is not one. */
function marker(v: unknown): ResearchMarker | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (typeof r.domain !== 'string' || !r.domain || typeof r.url !== 'string') return null
  const admitted = normalizeCheckUrl(r.url)
  // The research read THIS site: its address is on the site the marker names.
  if (!admitted.ok || domainKey(admitted.url) !== r.domain) return null
  const steps = savedSteps(r.steps)
  if (!steps) return null
  return {
    domain: r.domain.slice(0, 253),
    url: admitted.url.toString().slice(0, 2_000),
    locale: r.locale === 'en' ? 'en' : 'he',
    scannedAt: typeof r.scannedAt === 'string' ? r.scannedAt.slice(0, 40) : null,
    storefrontLocked: r.storefrontLocked === true,
    siteAccess: r.siteAccess === 'search_index' ? 'search_index' : 'direct',
    sitemapUrlCount: typeof r.sitemapUrlCount === 'number' && Number.isFinite(r.sitemapUrlCount) && r.sitemapUrlCount >= 0 ? Math.floor(r.sitemapUrlCount) : null,
    sitemapTruncated: r.sitemapTruncated === true,
    steps,
  }
}

/** The marker on a run's a1 detail, when the run replays a claimed research. */
export function readResearchMarker(detail: Record<string, unknown> | null | undefined): ResearchMarker | null {
  return marker(detail?.research)
}

const detailObject = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/**
 * The research a redeemed claim carries, when its row is one the anonymous
 * stage A wrote AND it read this project's site; null for a plain free check
 * (which then seeds as before) and for anything malformed. Its a1 must have
 * finished: a research that could not read the site is never offered a claim.
 */
export function readResearchSeed(seed: unknown, siteKey: string): ResearchSeed | null {
  const s = detailObject(seed)
  const research = detailObject(s?.research)
  if (!research || research.version !== 1) return null
  const m = marker(research.marker)
  if (!m || m.domain !== siteKey || m.steps.a1?.status !== 'done') return null
  const details = detailObject(research.details)
  const a1 = detailObject(details?.a1)
  if (!a1) return null
  return { marker: m, details: { a1, a2: detailObject(details?.a2) ?? {}, a4: detailObject(details?.a4) ?? {} } }
}

/** The step details a claimed research's run is created with: every step's saved result, and the marker on a1. */
export function researchStepDetail(research: ResearchSeed): Partial<Record<'a1' | 'a2' | 'a4', Record<string, unknown>>> {
  return {
    a1: { ...research.details.a1, research: research.marker },
    a2: research.details.a2,
    a4: research.details.a4,
  }
}
