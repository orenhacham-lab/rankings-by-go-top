/**
 * Stage A of the seeding scan, one function per step.
 *
 *   a1  Read the site: admission, the home page, robots.txt, llms.txt, and how
 *       many URLs its sitemaps list. A Shopify store behind its password page
 *       is recognised here, so nothing downstream reports the password page's
 *       "problems" as the merchant's.
 *   a2  Understand the business with ONE model call, and write what it found
 *       into the project's settings under the field-ownership rules
 *       (settings.ts).
 *   a3  Every technical finding and the four AI-readiness checks — all of them,
 *       not the free check's signup-gated split.
 *   a4  Validate competitors against real search results: at most three
 *       searches, one per seed keyword.
 *
 * Every dependency is injected — the network, the engine's functions, the
 * model, the search and the clock — so a whole run is deterministic under test.
 * A step never writes its own row: it returns what it found and the runner
 * saves it. The one exception is `ctx.save`, the intermediate save below.
 *
 * SPEND IS BOUNDED PER RUN, NOT PER ATTEMPT. A run can be resumed after its
 * worker died, so before a2 calls the model and before a4 searches, the step
 * saves an `attempted` mark. A resumed step that finds the mark but no saved
 * answer does not ask again; it fails with `model_interrupted` or
 * `search_interrupted`. One model call and three searches per run is a hard
 * ceiling whatever happens.
 *
 * A CLAIMED RUN (trigger 'claim') seeds a1-a3 from the free check the visitor
 * already watched, stored on a1 when the run was created: no fetch and no model
 * call. From the check's seed when its row has one — every finding, every
 * competitor, the home page's links (b1's fallback) — and from its public
 * teaser when it does not (claim.ts). a4 still searches.
 *
 * Failures are stable codes. Nothing a site, the model or the search provider
 * said is stored, returned or logged.
 */
import {
  assertPublicHost,
  buildFindings,
  buildGeoSignals,
  discoverSitemapUrls,
  domainKey,
  extractSiteSignals,
  fetchBusinessInsight,
  fetchSiteHtml,
  fetchSiteText,
  normalizeCheckUrl,
  type BusinessInsight,
  type FreeCheckBusiness,
  type FreeCheckFinding,
  type HostAdmission,
  type SiteSignals,
} from '@/lib/free-check'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { claimMatchesProject, cleanList, readClaimSnapshot, toSeedBusiness } from './claim'
import { createSerperSearch, isDomainMatch, isNonCompetitor, type SearchFn, type SearchOutcome } from './serper'
import {
  addValidatedCompetitors,
  applyBusinessToSettings,
  cleanAudienceLabels,
  competitorDomainKey,
  type SeedProject,
} from './settings'
import { hostPinnedFetch, isLockedStorefront, type FetchHop } from './site-access'
import { withCounters } from './summary'
import type {
  SeedBusiness,
  SeedCompetitor,
  SeedErrorCode,
  SeedGeo,
  SeedRunTrigger,
  SeedScope,
  SeedStep,
  SeedSummary,
} from './types'

// ── Budgets ─────────────────────────────────────────────────────────────────

/**
 * Wall-clock budgets. The target for the whole stage is ~45 seconds: a1 at most
 * 21s (page 10, companions 5, sitemaps 6), a2 18s, a3 no I/O, a4 7s.
 */
export type StageABudgets = {
  /** The home page: every redirect hop and the body. */
  pageMs: number
  /** robots.txt and llms.txt, fetched together. */
  companionMs: number
  /** Sitemap discovery, the children of a sitemap index included. */
  sitemapMs: number
  /** The one model call. */
  modelMs: number
  /** The searches of a4, which run in parallel. */
  searchMs: number
}

export const STAGE_A_BUDGETS: StageABudgets = {
  pageMs: 10_000,
  companionMs: 5_000,
  sitemapMs: 6_000,
  modelMs: 18_000,
  searchMs: 7_000,
}

/** The outer race gives the inner abort a moment to come back as a structured result. */
export const GRACE_MS = 1_000
/** How many sitemap URLs are counted before the count reads "at least". */
export const SITEMAP_URL_LIMIT = 1_000
/** Page text kept for a resumed a2; the model prompt uses the first 6,000 characters. */
const STORED_TEXT_CHARS = 8_000
export const MAX_SEARCHES = 3
export const MAX_COMPETITORS = 5
const MAX_RESULT_DOMAINS = 10

// ── Dependencies ────────────────────────────────────────────────────────────

export type StageADeps = {
  /** The network. Every site request goes through it wrapped in hostPinnedFetch. */
  fetchImpl: typeof fetch
  /** Admission of the project's host: every DNS answer must be a public address. */
  assertHost: (hostname: string) => Promise<HostAdmission>
  fetchHtml: typeof fetchSiteHtml
  fetchText: typeof fetchSiteText
  discoverSitemap: typeof discoverSitemapUrls
  extractSignals: typeof extractSiteSignals
  buildFindings: typeof buildFindings
  buildGeoSignals: typeof buildGeoSignals
  /** The model call. */
  insight: typeof fetchBusinessInsight
  search: SearchFn
  now: () => Date
  budgets: StageABudgets
}

export type StageADepsInput = Partial<Omit<StageADeps, 'budgets'>> & { budgets?: Partial<StageABudgets> }

/** The production dependencies, with any of them replaced. */
export function stageADeps(input: StageADepsInput = {}): StageADeps {
  return {
    fetchImpl: input.fetchImpl ?? fetch,
    assertHost: input.assertHost ?? ((hostname) => assertPublicHost(hostname)),
    fetchHtml: input.fetchHtml ?? fetchSiteHtml,
    fetchText: input.fetchText ?? fetchSiteText,
    discoverSitemap: input.discoverSitemap ?? discoverSitemapUrls,
    extractSignals: input.extractSignals ?? extractSiteSignals,
    buildFindings: input.buildFindings ?? buildFindings,
    buildGeoSignals: input.buildGeoSignals ?? buildGeoSignals,
    insight: input.insight ?? fetchBusinessInsight,
    search: input.search ?? createSerperSearch(),
    now: input.now ?? (() => new Date()),
    budgets: { ...STAGE_A_BUDGETS, ...input.budgets },
  }
}

// ── The step contract ───────────────────────────────────────────────────────

export type StepContext = {
  admin: ServiceRoleClient
  scope: SeedScope
  trigger: SeedRunTrigger
  project: SeedProject
  /** The snapshot as the previous steps left it. */
  summary: SeedSummary
  /** What each step saved so far; a resumed step reads its own and its predecessors'. */
  details: Partial<Record<SeedStep, Record<string, unknown>>>
  deps: StageADeps
  /**
   * Save an intermediate result on this step (the lease is renewed first).
   * False means the run is no longer this worker's: the step must stop.
   */
  save: (detail: Record<string, unknown>) => Promise<boolean>
}

export type StepResult = {
  kind: 'finished'
  status: 'done' | 'skipped' | 'failed'
  errorCode: SeedErrorCode | null
  itemCount: number | null
  detail: Record<string, unknown>
  summary: SeedSummary
  /** The project as a2 left it, so a4 searches in the market just detected. */
  project?: SeedProject
}

export type StepOutcome = StepResult | { kind: 'abort' }

export const ABORT: StepOutcome = { kind: 'abort' }

export function finished(
  status: StepResult['status'],
  errorCode: SeedErrorCode | null,
  summary: SeedSummary,
  extra: { itemCount?: number | null; detail?: Record<string, unknown>; project?: SeedProject } = {},
): StepResult {
  return {
    kind: 'finished',
    status,
    errorCode,
    itemCount: extra.itemCount ?? null,
    detail: extra.detail ?? {},
    summary,
    ...(extra.project ? { project: extra.project } : {}),
  }
}

// ── Time ────────────────────────────────────────────────────────────────────

export type Settled<T> = { kind: 'value'; value: T } | { kind: 'timeout' } | { kind: 'error' }

/**
 * Run `work` for at most `ms`. A rejection is `error` and never escapes; a late
 * answer is ignored. Nothing about the error is kept: its text may be a
 * provider's.
 */
export async function settleWithin<T>(work: () => Promise<T>, ms: number): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Settled<T>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), ms)
  })
  const attempt = (async (): Promise<Settled<T>> => {
    try {
      return { kind: 'value', value: await work() }
    } catch {
      return { kind: 'error' }
    }
  })()
  try {
    return await Promise.race([attempt, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** An abort signal that fires after `ms`, and a way to disarm it. */
export function deadline(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

// ── Stored shapes, read back defensively ────────────────────────────────────

/** Signals as a1 stores them for a2 and a3: the page text trimmed to what the model reads. */
function storedSignals(signals: SiteSignals): SiteSignals {
  return { ...signals, text: signals.text.slice(0, STORED_TEXT_CHARS) }
}

export function readStoredSignals(v: unknown): SiteSignals | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Partial<SiteSignals>
  const ok =
    typeof r.finalUrl === 'string' &&
    typeof r.text === 'string' &&
    Array.isArray(r.h1) &&
    Array.isArray(r.h2) &&
    Array.isArray(r.schemaTypes) &&
    Array.isArray(r.internalLinkUrls) &&
    Array.isArray(r.externalDomains) &&
    !!r.images && typeof r.images === 'object' &&
    !!r.contact && typeof r.contact === 'object'
  return ok ? (r as SiteSignals) : null
}

/** What a2 learned, in the form a2 saves it and a4 reads it. */
type StoredInsight = {
  business: SeedBusiness
  audiences: string[]
  keywords: string[]
  articles: string[]
  competitors: string[]
}

function insightFromModel(insight: BusinessInsight): StoredInsight | null {
  const business = toSeedBusiness(insight.business)
  if (!business) return null
  return {
    business,
    audiences: cleanAudienceLabels(cleanList(insight.business.audiences, 10, 300)),
    keywords: cleanList(insight.keywords, 5, 160),
    articles: cleanList(insight.articles, 5, 200),
    competitors: cleanList(insight.competitors, 6, 120),
  }
}

function readStoredInsight(v: unknown): StoredInsight | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const b = r.business
  if (!b || typeof b !== 'object') return null
  // Saved as a SeedBusiness; re-validated through the same mapping as the model's.
  const business = toSeedBusiness({ ...(b as Record<string, unknown>), summary: (b as Record<string, unknown>).description } as unknown as FreeCheckBusiness)
  if (!business) return null
  return {
    business,
    audiences: cleanList(r.audiences, 5, 300),
    keywords: cleanList(r.keywords, 5, 160),
    articles: cleanList(r.articles, 5, 200),
    competitors: cleanList(r.competitors, 6, 120),
  }
}

const SEARCH_FAILURES = ['search_unavailable', 'search_failed', 'search_timeout'] as const
type SearchFailure = (typeof SEARCH_FAILURES)[number]
type SearchRecord = { query: string; ok: boolean; code: SearchFailure | null; domains: string[] }

function cleanDomains(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const d of v) {
    if (typeof d !== 'string') continue
    const domain = d.trim().toLowerCase()
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || domain.length > 253 || out.includes(domain)) continue
    out.push(domain)
    if (out.length >= MAX_RESULT_DOMAINS) break
  }
  return out
}

function readSearchRecords(v: unknown): SearchRecord[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const out: SearchRecord[] = []
  for (const x of v.slice(0, MAX_SEARCHES)) {
    if (!x || typeof x !== 'object') return null
    const r = x as Record<string, unknown>
    const code = SEARCH_FAILURES.find((c) => c === r.code) ?? null
    out.push({ query: typeof r.query === 'string' ? r.query.slice(0, 160) : '', ok: r.ok === true, code, domains: r.ok === true ? cleanDomains(r.domains) : [] })
  }
  return out
}

// ── a1: read the site ───────────────────────────────────────────────────────

async function a1(ctx: StepContext): Promise<StepOutcome> {
  return ctx.trigger === 'claim' ? a1Claim(ctx) : a1Live(ctx)
}

async function a1Live(ctx: StepContext): Promise<StepOutcome> {
  const { deps } = ctx
  const fail = (code: SeedErrorCode) => finished('failed', code, ctx.summary, { detail: { mode: 'live' } })

  // Admission first: the project's own address, a public host, nothing else.
  const admitted = normalizeCheckUrl(ctx.project.target_domain ?? '')
  if (!admitted.ok) return fail('invalid_site_url')
  const start = admitted.url
  const siteKey = domainKey(start)
  const host = await deps.assertHost(start.hostname)
  if (!host.ok) return fail(host.reason === 'dns' ? 'site_unreachable' : 'site_blocked')

  // The home page: every hop pinned to this site, all of it inside one deadline.
  const trace: FetchHop[] = []
  const offHost = { hit: false }
  const pageClock = deadline(deps.budgets.pageMs)
  const page = await settleWithin(
    () => deps.fetchHtml(start, { fetchImpl: hostPinnedFetch({ siteKey, base: deps.fetchImpl, deadline: pageClock.signal, trace, offHost }) }),
    deps.budgets.pageMs + GRACE_MS,
  )
  const pageCutShort = pageClock.signal.aborted
  pageClock.clear()
  // The engine keeps whatever arrived when a read is cut short and calls the
  // page truncated. A home page cut short by THIS deadline is not the page —
  // its findings would be the missing half's — so it reads as unreachable. A
  // page truncated at the engine's size cap, inside the deadline, is the page.
  const fetched = page.kind === 'value' && page.value.ok && !(page.value.truncated && pageCutShort) ? page.value : null

  // A password-locked store answers with its password page (200 or 401). It is
  // read as "locked", not as a site full of problems.
  if (isLockedStorefront({ trace, html: fetched?.html ?? null, siteHost: start.hostname })) {
    const summary = withCounters({
      ...ctx.summary,
      url: fetched?.url ?? start.toString(),
      scannedAt: deps.now().toISOString(),
      storefrontLocked: true,
      sitemapUrlCount: null,
      sitemapTruncated: false,
    })
    return finished('done', null, summary, { detail: { mode: 'live', storefrontLocked: true, signals: null } })
  }

  if (!fetched) {
    if (offHost.hit) return fail('site_offsite_redirect')
    if (page.kind !== 'value' || page.value.ok) return fail('site_unreachable')
    const reason = page.value.reason
    if (reason === 'blocked') return fail('site_blocked')
    if (reason === 'not_html' || reason === 'too_large') return fail('site_not_html')
    return fail('site_unreachable')
  }

  // robots.txt and llms.txt: companions, not prerequisites. A failure reads as
  // "absent", which is what a crawler would conclude.
  const origin = new URL(new URL(fetched.url).origin)
  const companionClock = deadline(deps.budgets.companionMs)
  const companionFetch = hostPinnedFetch({ siteKey, base: deps.fetchImpl, deadline: companionClock.signal, trace: [], offHost: { hit: false } })
  const companion = (path: string) =>
    settleWithin(() => deps.fetchText(new URL(path, origin), { fetchImpl: companionFetch }), deps.budgets.companionMs + GRACE_MS)
  const [robots, llms] = await Promise.all([companion('/robots.txt'), companion('/llms.txt')])
  companionClock.clear()
  const robotsTxt = robots.kind === 'value' && robots.value.ok && robots.value.status === 200 ? robots.value.text : null
  const llmsTxt = llms.kind === 'value' && llms.value.ok && llms.value.status === 200 && llms.value.text.trim().length > 0

  const signals = deps.extractSignals(fetched.html, fetched.url, { robotsTxt, llmsTxt })

  // Sitemaps: how many real URLs the site publishes. A document cut off by the
  // deadline comes back as what arrived (the engine no longer throws), and the
  // count then reads "at least" (cutShort below).
  const sitemapClock = deadline(deps.budgets.sitemapMs)
  const sitemapFetch = hostPinnedFetch({ siteKey, base: deps.fetchImpl, deadline: sitemapClock.signal, trace: [], offHost: { hit: false } })
  const readSitemapText: typeof fetchSiteText = async (url) => {
    return deps.fetchText(url, { fetchImpl: sitemapFetch })
  }
  const discovery = await settleWithin(
    () => deps.discoverSitemap(origin, { limit: SITEMAP_URL_LIMIT, robotsTxt }, { fetchText: readSitemapText }),
    deps.budgets.sitemapMs + GRACE_MS,
  )
  const cutShort = sitemapClock.signal.aborted
  sitemapClock.clear()
  const sitemapUrlCount = discovery.kind === 'value' ? discovery.value.entries.length : null
  const sitemapTruncated = discovery.kind === 'value' && (discovery.value.truncated || cutShort)

  const summary = withCounters({
    ...ctx.summary,
    url: fetched.url,
    scannedAt: deps.now().toISOString(),
    storefrontLocked: false,
    sitemapUrlCount,
    sitemapTruncated,
  })
  return finished('done', null, summary, {
    itemCount: sitemapUrlCount,
    detail: {
      mode: 'live',
      storefrontLocked: false,
      htmlTruncated: fetched.truncated,
      signals: storedSignals(signals),
      sitemap: {
        count: sitemapUrlCount,
        truncated: sitemapTruncated,
        documents: discovery.kind === 'value' ? discovery.value.sitemaps.length : 0,
      },
    },
  })
}

async function a1Claim(ctx: StepContext): Promise<StepOutcome> {
  const snapshot = readClaimSnapshot(ctx.details.a1)
  // The route only stores a snapshot of this very site; checked again anyway.
  if (!snapshot || !claimMatchesProject(snapshot, ctx.summary.domain)) {
    return finished('failed', 'claim_payload_missing', ctx.summary, { detail: ctx.details.a1 ?? {} })
  }
  const summary = withCounters({
    ...ctx.summary,
    source: 'claim',
    url: snapshot.url,
    locale: snapshot.locale,
    scannedAt: snapshot.scannedAt,
    storefrontLocked: false,
    sitemapUrlCount: null,
    sitemapTruncated: false,
  })
  return finished('done', null, summary, { detail: { mode: 'claim', claim: snapshot } })
}

// ── a2: understand the business ─────────────────────────────────────────────

const MODEL_UNAVAILABLE_REASONS = new Set(['missing_gemini_api_key', 'gemini_init_failed'])

async function a2(ctx: StepContext): Promise<StepOutcome> {
  return ctx.trigger === 'claim' ? a2Claim(ctx) : a2Live(ctx)
}

async function a2Live(ctx: StepContext): Promise<StepOutcome> {
  const a1Detail = ctx.details.a1 ?? {}
  if (a1Detail.storefrontLocked === true) return finished('skipped', 'storefront_locked', ctx.summary)
  const signals = readStoredSignals(a1Detail.signals)
  if (!signals) return finished('failed', 'site_unreadable', ctx.summary)

  const own = ctx.details.a2 ?? {}
  let insight = readStoredInsight(own.insight)
  if (!insight) {
    const fail = (code: SeedErrorCode) => finished('failed', code, ctx.summary, { detail: { attempted: true } })
    // Resumed after the model was already asked and the answer was lost: the
    // run's one model call is spent.
    if (own.attempted === true) return fail('model_interrupted')
    if (!(await ctx.save({ attempted: true }))) return ABORT

    const answer = await settleWithin(() => ctx.deps.insight(signals, ctx.summary.locale, ctx.summary.domain), ctx.deps.budgets.modelMs)
    if (answer.kind === 'timeout') return fail('model_timeout')
    if (answer.kind === 'error') return fail('model_failed')
    if (!answer.value.ok) return fail(MODEL_UNAVAILABLE_REASONS.has(answer.value.reason) ? 'model_unavailable' : 'model_failed')
    insight = insightFromModel(answer.value.insight)
    if (!insight) return fail('model_failed')
    if (!(await ctx.save({ attempted: true, insight }))) return ABORT
  }
  return applyInsight(ctx, insight, { attempted: true, insight })
}

async function a2Claim(ctx: StepContext): Promise<StepOutcome> {
  const snapshot = readClaimSnapshot(ctx.details.a1)
  if (!snapshot) return finished('failed', 'claim_payload_missing', ctx.summary)
  // The free check ran without its model call (a cap or an outage): there is
  // no understanding to seed from, and a claim never makes the call itself.
  if (!snapshot.business) return finished('skipped', 'claim_without_insight', ctx.summary, { detail: { mode: 'claim' } })
  const insight: StoredInsight = {
    business: snapshot.business,
    audiences: cleanAudienceLabels(snapshot.audiences),
    keywords: snapshot.keywords,
    articles: snapshot.articles,
    // Every competitor the model named when the claim has its seed; the two shown otherwise.
    competitors: snapshot.competitors,
  }
  return applyInsight(ctx, insight, { mode: 'claim', basis: snapshot.basis, insight })
}

/** The model's competitor suggestions, before a4 has checked any of them. */
function suggestedCompetitors(domains: string[], siteKey: string): SeedCompetitor[] {
  const out: SeedCompetitor[] = []
  for (const raw of domains) {
    const domain = competitorDomainKey(raw)
    if (!domain || isDomainMatch(domain, siteKey) || out.some((c) => c.domain === domain)) continue
    out.push({ domain, validated: false, seenIn: 0, source: 'model' })
  }
  return out
}

async function applyInsight(ctx: StepContext, insight: StoredInsight, detail: Record<string, unknown>): Promise<StepOutcome> {
  const summary = withCounters({
    ...ctx.summary,
    business: insight.business,
    audiences: insight.audiences,
    seedKeywords: insight.keywords,
    topics: insight.articles,
    competitors: suggestedCompetitors(insight.competitors, ctx.summary.domain),
  })
  const applied = await applyBusinessToSettings(ctx.admin, ctx.scope, {
    trigger: ctx.trigger,
    project: ctx.project,
    business: insight.business,
    audiences: insight.audiences,
    now: ctx.deps.now(),
  })
  // What was learned stays in the snapshot either way; the step reports that
  // the settings did not take it.
  if (!applied.ok) {
    return finished('failed', 'settings_write_failed', summary, { itemCount: insight.keywords.length, detail: { ...detail, settings: null } })
  }
  return finished('done', null, summary, {
    itemCount: insight.keywords.length,
    detail: { ...detail, settings: applied.report },
    project: applied.project,
  })
}

// ── a3: what holds the site back ────────────────────────────────────────────

const SEVERITY_RANK: Record<FreeCheckFinding['severity'], number> = { blocker: 0, warning: 1, info: 2 }
const bySeverity = (list: FreeCheckFinding[]) => [...list].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])

async function a3(ctx: StepContext): Promise<StepOutcome> {
  return ctx.trigger === 'claim' ? a3Claim(ctx) : a3Live(ctx)
}

async function a3Live(ctx: StepContext): Promise<StepOutcome> {
  const a1Detail = ctx.details.a1 ?? {}
  if (a1Detail.storefrontLocked === true) {
    // Not measured, which is not the same as failing all four.
    const geo: SeedGeo = { state: 'unavailable', unavailableReason: 'storefront_locked', passed: 0, total: 0, signals: [] }
    return finished('skipped', 'storefront_locked', withCounters({ ...ctx.summary, findings: [], findingsOmitted: 0, geo }))
  }
  const signals = readStoredSignals(a1Detail.signals)
  if (!signals) return finished('failed', 'site_unreadable', ctx.summary)

  const locale = ctx.summary.locale
  const findings = bySeverity(ctx.deps.buildFindings(signals, locale)).slice(0, 50)
  const geoSignals = ctx.deps.buildGeoSignals(signals, locale).slice(0, 10)
  const geo: SeedGeo = {
    state: 'measured',
    unavailableReason: null,
    passed: geoSignals.filter((s) => s.ok).length,
    total: geoSignals.length,
    signals: geoSignals,
  }
  const summary = withCounters({ ...ctx.summary, findings, findingsOmitted: 0, geo })
  return finished('done', null, summary, {
    itemCount: findings.length,
    detail: {
      findings: findings.length,
      blockers: findings.filter((f) => f.severity === 'blocker').length,
      geoPassed: geo.passed,
      geoTotal: geo.total,
    },
  })
}

async function a3Claim(ctx: StepContext): Promise<StepOutcome> {
  const snapshot = readClaimSnapshot(ctx.details.a1)
  if (!snapshot) return finished('failed', 'claim_payload_missing', ctx.summary)
  const geo: SeedGeo =
    snapshot.geo.total > 0
      ? { state: 'measured', unavailableReason: null, ...snapshot.geo }
      : { state: 'unavailable', unavailableReason: null, passed: 0, total: 0, signals: [] }
  // With the claim's seed, every finding and none omitted; from a teaser, the
  // shown ones and the count of the rest.
  const findings = bySeverity(snapshot.findings)
  const summary = withCounters({ ...ctx.summary, findings, findingsOmitted: snapshot.findingsOmitted, geo })
  return finished('done', null, summary, {
    itemCount: findings.length + snapshot.findingsOmitted,
    detail: { mode: 'claim', basis: snapshot.basis, findings: findings.length, omitted: snapshot.findingsOmitted, geoPassed: geo.passed, geoTotal: geo.total },
  })
}

// ── a4: competitors, checked against real results ──────────────────────────

/**
 * The market the searches run in — the rank scanner's convention
 * (lib/scanner/google-search.ts): `gl` is the project's country, lower-cased,
 * defaulting to IL; `hl` is the project's language, defaulting to he.
 */
export function searchMarket(project: Pick<SeedProject, 'country' | 'language'>): { gl: string; hl: string } {
  const country = (project.country ?? '').trim()
  const language = (project.language ?? '').trim().toLowerCase()
  return {
    gl: (/^[A-Za-z]{2}$/.test(country) ? country : 'IL').toLowerCase(),
    hl: /^[a-z]{2}(-[a-z]{2})?$/.test(language) ? language : 'he',
  }
}

/**
 * Who the site competes with, from what the searches showed:
 *   - a suggested competitor that appears in a result stays, validated;
 *   - a domain in two or more of the results is added, unless it is the site
 *     itself or an obvious non-competitor (social, video, encyclopedias, the
 *     search engine);
 *   - suggestions first, then discoveries, each by how many searches showed
 *     them; at most MAX_COMPETITORS.
 * A suggestion no search showed is dropped: it was never validated.
 */
export function rankCompetitors(input: { candidates: string[]; results: string[][]; siteKey: string }): SeedCompetitor[] {
  const isSelf = (d: string) => isDomainMatch(d, input.siteKey) || isDomainMatch(input.siteKey, d)
  const seenIn = (domain: string) => input.results.filter((list) => list.some((d) => isDomainMatch(d, domain))).length

  const suggested: SeedCompetitor[] = []
  for (const raw of input.candidates) {
    const domain = competitorDomainKey(raw)
    if (!domain || isSelf(domain) || suggested.some((c) => c.domain === domain)) continue
    const n = seenIn(domain)
    if (n > 0) suggested.push({ domain, validated: true, seenIn: n, source: 'model' })
  }
  suggested.sort((a, b) => b.seenIn - a.seenIn)

  const tally = new Map<string, { lists: number; bestRank: number }>()
  for (const list of input.results) {
    for (const [rank, d] of [...new Set(list)].entries()) {
      const t = tally.get(d) ?? { lists: 0, bestRank: rank }
      t.lists += 1
      t.bestRank = Math.min(t.bestRank, rank)
      tally.set(d, t)
    }
  }
  const covered = (d: string) => suggested.some((c) => isDomainMatch(d, c.domain) || isDomainMatch(c.domain, d))
  const discovered: SeedCompetitor[] = [...tally.entries()]
    .filter(([d, t]) => t.lists >= 2 && !isSelf(d) && !isNonCompetitor(d) && !covered(d))
    .sort(([, a], [, b]) => b.lists - a.lists || a.bestRank - b.bestRank)
    .map(([domain, t]) => ({ domain, validated: true, seenIn: t.lists, source: 'search' as const }))

  return [...suggested, ...discovered].slice(0, MAX_COMPETITORS)
}

async function searchOnce(deps: StageADeps, query: string, market: { gl: string; hl: string }): Promise<SearchRecord> {
  const answer = await settleWithin<SearchOutcome>(() => deps.search(query, market), deps.budgets.searchMs)
  if (answer.kind === 'timeout') return { query, ok: false, code: 'search_timeout', domains: [] }
  if (answer.kind === 'error' || !answer.value || typeof answer.value !== 'object') return { query, ok: false, code: 'search_failed', domains: [] }
  if (!answer.value.ok) {
    const code = SEARCH_FAILURES.find((c) => c === (answer.value as { code?: unknown }).code) ?? 'search_failed'
    return { query, ok: false, code, domains: [] }
  }
  return { query, ok: true, code: null, domains: cleanDomains(answer.value.domains) }
}

async function a4(ctx: StepContext): Promise<StepOutcome> {
  const insight = readStoredInsight(ctx.details.a2?.insight)
  const queries = (insight?.keywords ?? []).slice(0, MAX_SEARCHES)
  if (queries.length === 0) return finished('skipped', 'no_seed_keywords', ctx.summary)

  const market = searchMarket(ctx.project)
  const own = ctx.details.a4 ?? {}
  let results = readSearchRecords(own.results)
  if (!results) {
    // Resumed after the searches were sent and the answers were lost: the
    // run's searches are spent.
    if (own.attempted === true) return finished('failed', 'search_interrupted', ctx.summary, { detail: { attempted: true } })
    if (!(await ctx.save({ attempted: true, queries, market }))) return ABORT
    // One request per query, all three at once, each inside the same budget.
    results = await Promise.all(queries.map((q) => searchOnce(ctx.deps, q, market)))
    if (!(await ctx.save({ attempted: true, queries, market, results }))) return ABORT
  }
  const detail: Record<string, unknown> = { attempted: true, queries, market, results }

  const answered = results.filter((r) => r.ok)
  if (answered.length === 0) return finished('failed', results[0]?.code ?? 'search_failed', ctx.summary, { detail })

  const competitors = rankCompetitors({
    candidates: insight?.competitors ?? [],
    results: answered.map((r) => r.domains),
    siteKey: ctx.summary.domain,
  })
  const summary = withCounters({ ...ctx.summary, competitors })
  const added = await addValidatedCompetitors(ctx.admin, ctx.scope, competitors.map((c) => c.domain), ctx.deps.now())
  if (added === 'error') return finished('failed', 'competitors_write_failed', summary, { itemCount: competitors.length, detail })
  return finished('done', null, summary, { itemCount: competitors.length, detail: { ...detail, added } })
}

/** The executors, by step. The runner calls them in STAGE_STEPS order. */
export const STAGE_A_EXECUTORS: Record<'a1' | 'a2' | 'a3' | 'a4', (ctx: StepContext) => Promise<StepOutcome>> = { a1, a2, a3, a4 }
