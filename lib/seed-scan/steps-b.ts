/**
 * Stage B of the seeding scan, one function per step. It runs in the
 * background after the merchant chose which seed keywords to track (POST
 * { action: 'continue' }), on the same run as its stage A.
 *
 *   b1  Read the site's key pages — about, contact, services, categories,
 *       products, articles; at most 25 — and build the site index
 *       (site_crawl_index), which the recommendation engine reads when the
 *       project has no WordPress connection (lib/content/content-index.ts).
 *   b2  Keyword ideas for the site from Google Ads: the run's seed keywords,
 *       the home page, the whole domain (`siteSeed`). At most three calls,
 *       filtered like the engine's own keyword research, kept in the keyword
 *       research cache (research.ts).
 *   b3  Keyword ideas from up to three validated competitors (`siteSeed`), at
 *       most three calls, kept only when they are about what this site sells.
 *   b4  The content plan: the recommendation engine through its own route, the
 *       one the content tab calls, inside that engine's cost controls; the
 *       topics land where the engine always writes them.
 *   b5  AI-visibility questions from the profile's niche and audiences: ONE
 *       model call, written to the suggestion cache as suggestions — never as
 *       tracked prompts, so no AI-scan quota is touched.
 *   b6  The first rank check of the keywords `continue` added, through the
 *       scan route the keywords tab's "check" button calls, so every check is
 *       counted in the merchant's quota by that route.
 *
 * SPEND IS BOUNDED PER RUN, NOT PER ATTEMPT, as in stage A: before b1 reads
 * the site, before b2 or b3 call Google Ads, before b4 asks the engine, before
 * b5 asks the model and before b6 checks a rank, the step saves an `attempted`
 * mark. A resumed step that finds the mark and no saved answer does not spend
 * again; it fails with its `*_interrupted` code (b2 and b3 still use whatever
 * reached the cache). Per run: ≤25 page reads (plus ≤6 sitemap documents and
 * robots.txt), ≤6 Google Ads calls, one model call in b5, one engine run in
 * b4, one rank check per added keyword.
 *
 * b4 and b6 act as the merchant: only the seed route, which holds the
 * merchant's session, can give them their dependencies. A run the cron
 * resumes has none, and the two steps say so (content_session_required,
 * rank_check_session_required) instead of acting for someone who is not there.
 *
 * Failures are stable codes. Nothing a site, Google Ads, the model, the engine
 * or the scan route said is stored, returned or logged.
 */
import {
  assertPublicHost,
  discoverSitemapUrls,
  domainKey,
  extractSiteSignals,
  fetchSiteHtml,
  fetchSiteText,
  normalizeCheckUrl,
  type HostAdmission,
} from '@/lib/free-check'
import { generateProjectEnrichmentQuestions, type FallbackQuestionResponse } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { normalizeLanguage, toBilingualPromptLanguage, QUESTION_GENERATION_VERSION } from '@/lib/ai-visibility/prompt-templates'
import {
  containsBusinessNameInQuotes,
  containsDirectAddress,
  containsDisallowedLocation,
  containsISOCountryCodeLeak,
  containsUnauthorizedLocation,
  containsUnnaturalorBrokenHebrew,
  extractAllowedLocations,
  extractAllowedServiceAreas,
  extractBusinessScope,
  filterSuggestionsByBusinessScope,
  getCountryDisplayName,
  isTimeOrPromotionSensitive,
  isWeakPromotionalQuestion,
  normalizeQuotes,
  strongNormalize,
  writeSuggestionsToCache,
  type BusinessScope,
} from '@/lib/ai-visibility/suggestion-cache'
import { tokens } from '@/lib/content/recommendations/dedupe'
import { buildSiteVocabulary } from '@/lib/content/recommendations/engine'
import { MIN_SITE_VOCAB_TOKENS, researchKeywordIssue } from '@/lib/content/recommendations/keyword-research'
import { deriveStatus, indexTtlDays, SCAN_INDEX_VERSION } from '@/lib/content/wordpress-content-index'
import { GoogleAdsError } from '@/lib/google-ads/client'
import { isValidCountry, isValidLanguage } from '@/lib/google-ads/constants'
import { generateKeywordIdeas, type KeywordIdeaResult, type KeywordIdeasInput } from '@/lib/google-ads/keyword-ideas'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { readClaimSnapshot } from './claim'
import {
  CRAWL_INDEX_VERSION,
  CRAWL_SITEMAP_LIMIT,
  crawlReport,
  MAX_KEY_PAGES,
  pageKey,
  parseRobots,
  robotsAllows,
  robotsAnswer,
  selectKeyPages,
  type CrawledPage,
  type PageBucket,
  type RobotsAnswer,
} from './crawl'
import { readSeedIdeas, seedResearchKey, writeSeedIdeas, type SeedMarket, type SeedResearchKey, type SeedResearchOrigin } from './research'
import type { SeedProject } from './settings'
import { hostPinnedFetch } from './site-access'
import { ABORT, deadline, finished, GRACE_MS, readStoredSignals, settleWithin, type StepOutcome } from './steps'
import type { SeedErrorCode, SeedRunTrigger, SeedScope, SeedStep, SeedSummary } from './types'

// ── Budgets ─────────────────────────────────────────────────────────────────

/**
 * Wall-clock budgets. Stage B runs after the response, inside the seed route's
 * 300 seconds; the worst case of all six steps together (stageBStepBudgetMs)
 * stays under the route's work window, and the runner stops before any step
 * that could not finish in time and hands the run to the cron.
 */
export type StageBBudgets = {
  /** robots.txt, when b1 has to read it itself (a claimed run). */
  robotsMs: number
  /** Sitemap discovery, the children of an index included. */
  sitemapMs: number
  /** One page: every redirect hop and the body. */
  pageMs: number
  /** Every page of b1 together, the home page included when b1 reads it. */
  crawlMs: number
  /** The Google Ads calls of b2, or of b3, which run in parallel. */
  adsMs: number
  /** The recommendation engine's whole run (b4). */
  contentMs: number
  /** The one model call of b5. */
  questionsMs: number
  /** One keyword's rank check (b6); the scan route's own budget is 45s. */
  rankTargetMs: number
}

export const STAGE_B_BUDGETS: StageBBudgets = {
  robotsMs: 4_000,
  sitemapMs: 8_000,
  pageMs: 8_000,
  crawlMs: 30_000,
  adsMs: 20_000,
  contentMs: 100_000,
  questionsMs: 30_000,
  rankTargetMs: 47_000,
}

/** The longest a stage-B step can take: the runner starts one only when this much time is left. */
export function stageBStepBudgetMs(step: SeedStep, b: StageBBudgets): number {
  switch (step) {
    case 'b1':
      return b.robotsMs + b.sitemapMs + b.crawlMs + 3 * GRACE_MS
    case 'b2':
    case 'b3':
      return b.adsMs + GRACE_MS
    case 'b4':
      return b.contentMs + GRACE_MS
    case 'b5':
      return b.questionsMs + GRACE_MS
    case 'b6':
      // At least one keyword; b6 checks the clock before every other one.
      return b.rankTargetMs + GRACE_MS
    default:
      return 0
  }
}

/** Google Ads calls per step (b2, b3): six per run at most. */
export const MAX_IDEA_CALLS = 3
/** Validated competitors b3 asks about. */
export const MAX_COMPETITOR_SEEDS = 3
/** Sitemap documents b1 reads at most (an index and its children). */
export const MAX_SITEMAP_DOCS = 6
/** The engine's own threshold for a keyword idea (keyword-research.ts MIN_MONTHLY). */
const MIN_MONTHLY_SEARCHES = 30
const CRAWL_CONCURRENCY = 4
/** Candidates asked of the model in b5, and suggestions kept at most. */
export const QUESTION_CANDIDATES = 15
export const MAX_QUESTIONS = 12
const MAX_TOP_KEYWORDS = 10

// ── Dependencies ────────────────────────────────────────────────────────────

/** What a route answered, reduced to its status and parsed body. */
export type RouteAnswer = { status: number; body: unknown }
/** The recommendation engine's own route (POST /api/content/automation/recommendations), as the merchant. */
export type ContentPlanFn = (input: { projectId: string; runId: string }) => Promise<RouteAnswer>
/** The scan route (POST /api/scan) for one keyword, as the merchant. */
export type RankCheckFn = (input: { projectId: string; targetId: string }) => Promise<RouteAnswer>

export type QuestionsInput = {
  projectName: string
  domain: string
  language: 'he' | 'en'
  countryDisplay: string | undefined
  allowedLocations: string[]
  scope: BusinessScope
  count: number
}
export type QuestionsFn = (input: QuestionsInput) => Promise<FallbackQuestionResponse[]>

export type StageBDeps = {
  /** The network. Every site request goes through it wrapped in hostPinnedFetch. */
  fetchImpl: typeof fetch
  assertHost: (hostname: string) => Promise<HostAdmission>
  fetchHtml: typeof fetchSiteHtml
  fetchText: typeof fetchSiteText
  discoverSitemap: typeof discoverSitemapUrls
  extractSignals: typeof extractSiteSignals
  /** One Google Ads GenerateKeywordIdeas call (lib/google-ads/keyword-ideas.ts). */
  keywordIdeas: (input: KeywordIdeasInput) => Promise<KeywordIdeaResult[]>
  /** The engine's site vocabulary, the relevance gate of its keyword research. */
  siteVocabulary: typeof buildSiteVocabulary
  /** The one model call of b5. */
  questions: QuestionsFn
  writeSuggestions: typeof writeSuggestionsToCache
  /** Null unless the merchant's session is at hand (the seed route). */
  contentPlan: ContentPlanFn | null
  /** Null unless the merchant's session is at hand (the seed route). */
  rankCheck: RankCheckFn | null
  env: Record<string, string | undefined>
  now: () => Date
  budgets: StageBBudgets
}

export type StageBDepsInput = Partial<Omit<StageBDeps, 'budgets'>> & { budgets?: Partial<StageBBudgets> }

const liveQuestions: QuestionsFn = (input) =>
  generateProjectEnrichmentQuestions(
    input.projectName,
    input.domain,
    input.language,
    input.countryDisplay,
    input.allowedLocations,
    input.scope,
    input.count,
  )

/** The production dependencies, with any of them replaced. */
export function stageBDeps(input: StageBDepsInput = {}): StageBDeps {
  return {
    fetchImpl: input.fetchImpl ?? fetch,
    assertHost: input.assertHost ?? ((hostname) => assertPublicHost(hostname)),
    fetchHtml: input.fetchHtml ?? fetchSiteHtml,
    fetchText: input.fetchText ?? fetchSiteText,
    discoverSitemap: input.discoverSitemap ?? discoverSitemapUrls,
    extractSignals: input.extractSignals ?? extractSiteSignals,
    keywordIdeas: input.keywordIdeas ?? (async (ideas) => (await generateKeywordIdeas(ideas)).results),
    siteVocabulary: input.siteVocabulary ?? buildSiteVocabulary,
    questions: input.questions ?? liveQuestions,
    writeSuggestions: input.writeSuggestions ?? writeSuggestionsToCache,
    contentPlan: input.contentPlan ?? null,
    rankCheck: input.rankCheck ?? null,
    env: input.env ?? process.env,
    now: input.now ?? (() => new Date()),
    budgets: { ...STAGE_B_BUDGETS, ...input.budgets },
  }
}

// ── The step contract (stage A's, with stage B's dependencies) ──────────────

export type StageBContext = {
  admin: ServiceRoleClient
  scope: SeedScope
  runId: string
  trigger: SeedRunTrigger
  project: SeedProject
  /** Stage A's snapshot. Stage B reads it and leaves it as it is. */
  summary: SeedSummary
  /** What each step saved, stage A's included. */
  details: Partial<Record<SeedStep, Record<string, unknown>>>
  deps: StageBDeps
  /** Save an intermediate result on this step; false means the run is no longer this worker's. */
  save: (detail: Record<string, unknown>) => Promise<boolean>
  /** Epoch ms after which no new rank check may start (the runner's time cap), or null. */
  deadlineAt: number | null
}

const lockedStorefront = (ctx: StageBContext) => (ctx.details.a1 ?? {}).storefrontLocked === true

// ── b1: the key pages of the site ───────────────────────────────────────────

async function b1(ctx: StageBContext): Promise<StepOutcome> {
  const { deps } = ctx
  // Behind its password page a store shows nothing of itself to read.
  if (lockedStorefront(ctx)) return finished('skipped', 'storefront_locked', ctx.summary)
  // The host's firewall refused a1's read of its home page (steps.ts, the
  // search-index fallback): the crawl would meet the same refusal on every
  // page. Not crawled, for the firewall's reason, not "no pages".
  if ((ctx.details.a1 ?? {}).mode === 'search_index') return finished('skipped', 'site_forbidden', ctx.summary, { detail: { mode: 'search_index' } })
  const own = ctx.details.b1 ?? {}
  const counts = { pagesRead: 0, pagesFailed: 0, sitemapDocs: 0 }
  const fail = (code: SeedErrorCode) => finished('failed', code, ctx.summary, { detail: { attempted: true, ...counts } })

  const admitted = normalizeCheckUrl(ctx.project.target_domain ?? '')
  if (!admitted.ok) return finished('failed', 'invalid_site_url', ctx.summary)
  const siteKey = domainKey(admitted.url)
  // Resumed after the crawl had begun: this run's page reads are spent.
  if (own.attempted === true) return fail('crawl_interrupted')
  const host = await deps.assertHost(admitted.url.hostname)
  if (!host.ok) return finished('failed', host.reason === 'dns' ? 'site_unreachable' : 'site_blocked', ctx.summary)
  if (!(await ctx.save({ attempted: true }))) return ABORT
  const startedAt = deps.now()

  // The home page and robots.txt as a1 read them (this site's, not a site the
  // project pointed at before). A claimed run read neither itself, so b1 reads
  // robots.txt first — nothing else before the rules are known — at the
  // address the free check ended at, when that is this site. So does a run
  // whose a1 could not read robots.txt whole.
  const onSite = (raw: string | null | undefined): URL | null => {
    const u = normalizeCheckUrl(raw ?? '')
    return u.ok && domainKey(u.url) === siteKey ? u.url : null
  }
  const a1Detail = ctx.details.a1 ?? {}
  const a1Signals = readStoredSignals(a1Detail.signals)
  const stored = a1Signals && onSite(a1Signals.finalUrl) ? a1Signals : null
  const homeUrl = new URL(stored?.finalUrl ?? onSite(ctx.summary.url)?.toString() ?? admitted.url.toString())
  const readRobots = async (at: URL): Promise<RobotsAnswer> => {
    const robotsClock = deadline(deps.budgets.robotsMs)
    const robotsBody = { complete: false }
    const robotsFetch = hostPinnedFetch({ siteKey, base: deps.fetchImpl, deadline: robotsClock.signal, trace: [], offHost: { hit: false }, body: robotsBody })
    const robots = await settleWithin(() => deps.fetchText(new URL('/robots.txt', at), { fetchImpl: robotsFetch }), deps.budgets.robotsMs + GRACE_MS)
    robotsClock.clear()
    return robotsAnswer(robots.kind === 'value' && robots.value.ok ? robots.value : null, robotsBody.complete)
  }
  // a1's read counts when it came to rules (kept on its signals) or to none.
  const fromA1: RobotsAnswer | null = !stored
    ? null
    : a1Detail.robots === 'rules' && typeof stored.robotsTxt === 'string'
      ? { state: 'rules', text: stored.robotsTxt }
      : a1Detail.robots === 'absent'
        ? { state: 'absent' }
        : null
  let robots = fromA1 ?? (await readRobots(homeUrl))
  // Unknown rules forbid everything (RFC 9309, 2.3.1.4): nothing is read.
  const unreadable = () => finished('skipped', 'crawl_disallowed', ctx.summary, { detail: { attempted: true, ...counts, robots: 'unreadable' } })
  if (robots.state === 'unreadable') return unreadable()
  let robotsTxt = robots.state === 'rules' ? robots.text : null
  let rules = parseRobots(robotsTxt)
  const allow = (url: URL) => robotsAllows(rules, url)
  if (!allow(homeUrl)) return finished('skipped', 'crawl_disallowed', ctx.summary, { detail: { attempted: true, ...counts } })

  // Every page read: pinned to the site, refused by robots.txt before it
  // leaves (every redirect hop too), inside its own deadline and the crawl's.
  const crawlClock = deadline(deps.budgets.crawlMs)
  const readPage = async (url: URL, bucket: PageBucket, isHome: boolean): Promise<CrawledPage | null> => {
    const pageClock = deadline(deps.budgets.pageMs)
    const pageFetch = hostPinnedFetch({
      siteKey,
      base: deps.fetchImpl,
      deadline: AbortSignal.any([pageClock.signal, crawlClock.signal]),
      trace: [],
      offHost: { hit: false },
      allow,
    })
    const got = await settleWithin(() => deps.fetchHtml(url, { fetchImpl: pageFetch }), deps.budgets.pageMs + GRACE_MS)
    const pageCutShort = pageClock.signal.aborted || crawlClock.signal.aborted
    pageClock.clear()
    if (got.kind !== 'value' || !got.value.ok) return null
    // A page cut short by the page's or the crawl's deadline is a failed read,
    // not a page: the engine keeps what arrived, but half a page indexes wrong.
    if (got.value.truncated && pageCutShort) return null
    const signals = deps.extractSignals(got.value.html, got.value.url, { robotsTxt: null, llmsTxt: false })
    return {
      url: got.value.url,
      bucket,
      title: signals.title ?? '',
      h1: signals.h1,
      // The page's kind is read from its JSON-LD only: a theme's microdata product cards are not a product page.
      schemaTypes: signals.jsonLdTypes ?? signals.schemaTypes,
      internalLinkUrls: signals.internalLinkUrls,
      home: isHome,
    }
  }

  let homePage: CrawledPage | null = stored
    ? { url: stored.finalUrl, bucket: 'other', title: stored.title ?? '', h1: stored.h1, schemaTypes: stored.jsonLdTypes ?? stored.schemaTypes, internalLinkUrls: stored.internalLinkUrls, home: true }
    : null
  if (!homePage) {
    counts.pagesRead++
    homePage = await readPage(homeUrl, 'other', true)
    if (!homePage) counts.pagesFailed++
    // The home page answered from another address of the site (apex → www):
    // that address's robots.txt governs every read from here on.
    if (homePage && new URL(homePage.url).origin !== homeUrl.origin) {
      robots = await readRobots(new URL(homePage.url))
      if (robots.state === 'unreadable') {
        crawlClock.clear()
        return unreadable()
      }
      robotsTxt = robots.state === 'rules' ? robots.text : null
      rules = parseRobots(robotsTxt)
    }
  }

  // Sitemaps: the site's own list of its pages, read through the same pins.
  // The engine asks only for documents on the site's own host (09ee926); the
  // pin still refuses any redirect hop that leaves it.
  const origin = new URL((homePage ? new URL(homePage.url) : homeUrl).origin)
  const sitemapClock = deadline(deps.budgets.sitemapMs)
  const sitemapFetch = hostPinnedFetch({ siteKey, base: deps.fetchImpl, deadline: sitemapClock.signal, trace: [], offHost: { hit: false }, allow })
  const readSitemapText: typeof fetchSiteText = async (url) => {
    if (counts.sitemapDocs >= MAX_SITEMAP_DOCS) return { ok: false as const, reason: 'network' as const }
    counts.sitemapDocs++
    return deps.fetchText(url, { fetchImpl: sitemapFetch })
  }
  const discovery = await settleWithin(
    () => deps.discoverSitemap(origin, { limit: CRAWL_SITEMAP_LIMIT, robotsTxt }, { fetchText: readSitemapText }),
    deps.budgets.sitemapMs + GRACE_MS,
  )
  sitemapClock.clear()
  const sitemapUrls = discovery.kind === 'value' ? discovery.value.entries.map((e) => e.url) : []

  // The home page's links: a1's copy or b1's own read of it. When a claimed
  // run's read of it failed, the links the free check read on it stand in
  // (the claim's seed); nothing is fetched for them.
  const claimLinks = homePage ? [] : (readClaimSnapshot(ctx.details.a1)?.internalLinkUrls ?? [])
  const homeLinksFrom = stored ? 'a1' : homePage ? 'page' : claimLinks.length > 0 ? 'claim' : 'none'
  const selection = selectKeyPages({
    homeLinks: homePage ? homePage.internalLinkUrls : claimLinks,
    sitemapUrls,
    siteKey,
    homeUrl,
    robots: rules,
    limit: MAX_KEY_PAGES - counts.pagesRead,
  })
  const detail = () => ({
    attempted: true,
    ...counts,
    sitemapUrls: sitemapUrls.length,
    homeLinksFrom,
    candidates: selection.candidates,
    disallowed: selection.disallowed,
  })
  // robots.txt keeps us from every page the site lists.
  if (selection.pages.length === 0 && selection.disallowed > 0) {
    crawlClock.clear()
    return finished('skipped', 'crawl_disallowed', ctx.summary, { detail: detail() })
  }

  const read: { order: number; page: CrawledPage }[] = []
  const seen = new Set<string>(homePage ? [pageKey(homePage.url)] : [])
  let cursor = 0
  const worker = async () => {
    while (cursor < selection.pages.length && !crawlClock.signal.aborted) {
      const order = cursor++
      const item = selection.pages[order]
      counts.pagesRead++
      const page = await readPage(item.url, item.bucket, false)
      if (!page) {
        counts.pagesFailed++
        continue
      }
      const key = pageKey(page.url)
      if (seen.has(key)) continue
      seen.add(key)
      read.push({ order, page })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CRAWL_CONCURRENCY, selection.pages.length) }, () => worker()))
  const cutShort = cursor < selection.pages.length
  crawlClock.clear()

  const pages = read.sort((a, b) => a.order - b.order).map((r) => r.page)
  // Every key page failed, or there was nothing at all to index.
  if (selection.pages.length > 0 && pages.length === 0) return finished('failed', 'crawl_no_pages', ctx.summary, { detail: detail() })
  const indexed = [...(homePage ? [homePage] : []), ...pages]
  if (indexed.length === 0) return finished('failed', 'crawl_no_pages', ctx.summary, { detail: detail() })

  const finishedAt = deps.now()
  const report = crawlReport({
    siteUrl: origin.toString(),
    host: siteKey,
    pages: indexed,
    attempted: counts.pagesRead,
    failed: counts.pagesFailed,
    truncated: cutShort,
    notes: [...(stored ? ['home_page_from_a1'] : []), ...(homeLinksFrom === 'claim' ? ['home_links_from_claim'] : []), ...(cutShort ? ['crawl_cut_short'] : [])],
    errors: counts.pagesFailed > 0 ? ['page_read_failed'] : [],
    timingMs: finishedAt.getTime() - startedAt.getTime(),
  })
  const { targets, sampleLinks, notes, errors, ...reportSummary } = report
  const indexRow = {
    project_id: ctx.scope.projectId,
    user_id: ctx.scope.userId,
    site_url: origin.toString(),
    site_host: siteKey,
    scan_status: deriveStatus(report),
    // The classification is the WordPress scanner's own (classifyTarget),
    // so the index carries its version and reads as current to the engine.
    scanner_version: SCAN_INDEX_VERSION,
    scan_params: { crawler: CRAWL_INDEX_VERSION, runId: ctx.runId, maxPages: MAX_KEY_PAGES },
    summary: reportSummary,
    targets,
    sample_links: sampleLinks,
    warnings: { notes, errors },
    error_message: null,
    scan_started_at: startedAt.toISOString(),
    scan_completed_at: finishedAt.toISOString(),
    scan_duration_ms: finishedAt.getTime() - startedAt.getTime(),
    expires_at: new Date(finishedAt.getTime() + indexTtlDays() * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: finishedAt.toISOString(),
  }
  // One row per project (UNIQUE project_id). This owner's row is replaced,
  // filtered by project AND owner; without one, a row is inserted. A row that
  // names another owner is never written over: the insert then fails.
  const replaced = await ctx.admin
    .from('site_crawl_index')
    .update(indexRow)
    .eq('project_id', ctx.scope.projectId)
    .eq('user_id', ctx.scope.userId)
    .select('id')
  let written = !replaced.error && ((replaced.data as unknown[] | null)?.length ?? 0) === 1
  if (!replaced.error && !written) written = !(await ctx.admin.from('site_crawl_index').insert(indexRow)).error
  if (!written) return finished('failed', 'crawl_write_failed', ctx.summary, { detail: detail() })

  const byBucket: Record<string, number> = {}
  for (const p of pages) byBucket[p.bucket] = (byBucket[p.bucket] ?? 0) + 1
  return finished('done', null, ctx.summary, {
    itemCount: counts.pagesRead - counts.pagesFailed,
    detail: { ...detail(), indexed: indexed.length, byBucket },
  })
}

// ── b2 and b3: keyword ideas ────────────────────────────────────────────────

/** The market Google Ads is asked about: the project's own; empty means the engine's default (IL / he). */
export function ideasMarket(project: Pick<SeedProject, 'country' | 'language'>): SeedMarket | null {
  const country = (project.country ?? '').trim().toUpperCase() || 'IL'
  const language = ((project.language ?? '').trim().toLowerCase() || 'he').split('-')[0]
  return isValidCountry(country) && isValidLanguage(language) ? { country, language } : null
}

type IdeaFailure = Extract<
  SeedErrorCode,
  | 'keyword_ideas_unavailable'
  | 'keyword_ideas_failed'
  | 'keyword_ideas_timeout'
  | 'keyword_ideas_rate_limited'
  | 'keyword_ideas_interrupted'
  | 'keyword_ideas_write_failed'
>
type IdeaSeed = { origin: SeedResearchOrigin; label: string; key: SeedResearchKey; input: KeywordIdeasInput; competitor: string | null }
type IdeaCall = { seed: SeedResearchOrigin; label: string; source: 'cache' | 'live' | 'none'; ok: boolean; code: IdeaFailure | null; kept: number }
type IdeaResult = { calls: IdeaCall[]; kept: number; totalMonthlySearches: number; top: { keyword: string; volume: number | null }[] }

const ADS_UNAVAILABLE = new Set([
  'not_configured',
  'reauth_required',
  'client_credentials_invalid',
  'oauth_token_failed',
  'api_auth_failed',
  'developer_token_invalid',
  'permission_denied',
])
const ADS_RATE_LIMITED = new Set(['rate_limit_exceeded', 'resource_exhausted'])

/** A GoogleAdsError's own code, mapped; its message and the API's text are never read. */
function adsFailure(err: unknown): IdeaFailure {
  const code = err instanceof GoogleAdsError ? err.code : null
  if (code && ADS_UNAVAILABLE.has(code)) return 'keyword_ideas_unavailable'
  if (code && ADS_RATE_LIMITED.has(code)) return 'keyword_ideas_rate_limited'
  return 'keyword_ideas_failed'
}

async function ideasOnce(deps: StageBDeps, input: KeywordIdeasInput): Promise<{ ok: true; rows: KeywordIdeaResult[] } | { ok: false; code: IdeaFailure }> {
  const answer = await settleWithin(async () => {
    try {
      return { ok: true as const, rows: await deps.keywordIdeas(input) }
    } catch (err) {
      return { ok: false as const, code: adsFailure(err) }
    }
  }, deps.budgets.adsMs)
  if (answer.kind === 'timeout') return { ok: false, code: 'keyword_ideas_timeout' }
  if (answer.kind === 'error' || !answer.value || typeof answer.value !== 'object') return { ok: false, code: 'keyword_ideas_failed' }
  if (answer.value.ok && !Array.isArray(answer.value.rows)) return { ok: false, code: 'keyword_ideas_failed' }
  return answer.value
}

const IDEA_FAILURES: readonly IdeaFailure[] = [
  'keyword_ideas_unavailable',
  'keyword_ideas_failed',
  'keyword_ideas_timeout',
  'keyword_ideas_rate_limited',
  'keyword_ideas_interrupted',
  'keyword_ideas_write_failed',
]

function readIdeaResult(v: unknown): IdeaResult | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (!Array.isArray(r.calls) || typeof r.kept !== 'number' || typeof r.totalMonthlySearches !== 'number') return null
  const calls: IdeaCall[] = []
  for (const x of r.calls.slice(0, MAX_IDEA_CALLS)) {
    if (!x || typeof x !== 'object') return null
    const c = x as Record<string, unknown>
    calls.push({
      seed: (['seed_keywords', 'home_page', 'site', 'competitor'] as const).find((s) => s === c.seed) ?? 'site',
      label: typeof c.label === 'string' ? c.label.slice(0, 300) : '',
      source: c.source === 'cache' || c.source === 'live' ? c.source : 'none',
      ok: c.ok === true,
      code: IDEA_FAILURES.find((f) => f === c.code) ?? null,
      kept: typeof c.kept === 'number' ? c.kept : 0,
    })
  }
  const top = Array.isArray(r.top) ? (r.top as { keyword?: unknown; volume?: unknown }[]).filter((t) => typeof t?.keyword === 'string').map((t) => ({ keyword: String(t.keyword), volume: typeof t.volume === 'number' ? t.volume : null })) : []
  return { calls, kept: r.kept, totalMonthlySearches: r.totalMonthlySearches, top }
}

function ideasOutcome(ctx: StageBContext, market: SeedMarket, result: IdeaResult): StepOutcome {
  const detail = { attempted: true, market, result }
  if (result.calls.some((c) => c.ok)) return finished('done', null, ctx.summary, { itemCount: result.kept, detail })
  const code = result.calls.find((c) => c.code)?.code ?? 'keyword_ideas_failed'
  return finished('failed', code, ctx.summary, { itemCount: 0, detail })
}

/**
 * The machinery b2 and b3 share: the cache first (free); then, after the
 * `attempted` mark, one live call per missing seed, all at once, at most
 * MAX_IDEA_CALLS; each seed's kept keywords are stored as soon as they are
 * known, and the step's summary of them is saved before it finishes.
 */
async function runIdeas(
  ctx: StageBContext,
  step: 'b2' | 'b3',
  planned: IdeaSeed[],
  market: SeedMarket,
  keep: (seed: IdeaSeed, rows: KeywordIdeaResult[]) => KeywordIdeaResult[],
): Promise<StepOutcome> {
  const { deps } = ctx
  const seeds = planned.slice(0, MAX_IDEA_CALLS)
  const own = ctx.details[step] ?? {}
  // Resumed after the work was saved: finish from it.
  const saved = readIdeaResult(own.result)
  if (saved) return ideasOutcome(ctx, market, saved)

  const now = deps.now()
  const calls: IdeaCall[] = seeds.map((s) => ({ seed: s.origin, label: s.label, source: 'none', ok: false, code: null, kept: 0 }))
  const kept: KeywordIdeaResult[][] = seeds.map(() => [])
  const misses: number[] = []
  for (const [i, s] of seeds.entries()) {
    const hit = await readSeedIdeas(ctx.admin, ctx.scope, s.key, market, now)
    if (Array.isArray(hit)) {
      kept[i] = keep(s, hit)
      calls[i] = { ...calls[i], source: 'cache', ok: true, kept: kept[i].length }
    } else {
      misses.push(i)
    }
  }

  if (misses.length > 0) {
    if (own.attempted === true) {
      // Resumed after the calls were sent: they are spent. What they found
      // is only what already reached the cache (read above).
      for (const i of misses) calls[i] = { ...calls[i], code: 'keyword_ideas_interrupted' }
    } else {
      if (!(await ctx.save({ attempted: true, market, planned: misses.map((i) => seeds[i].label) }))) return ABORT
      await Promise.all(
        misses.map(async (i) => {
          const answer = await ideasOnce(deps, seeds[i].input)
          if (!answer.ok) {
            calls[i] = { ...calls[i], source: 'live', code: answer.code }
            return
          }
          const rows = keep(seeds[i], answer.rows)
          const stored = await writeSeedIdeas(ctx.admin, ctx.scope, seeds[i].key, market, rows, deps.now())
          if (!stored) {
            calls[i] = { ...calls[i], source: 'live', code: 'keyword_ideas_write_failed' }
            return
          }
          kept[i] = rows
          calls[i] = { ...calls[i], source: 'live', ok: true, kept: rows.length }
        }),
      )
    }
  }

  // One entry per keyword across the seeds, its highest volume.
  const unique = new Map<string, KeywordIdeaResult>()
  for (const rows of kept) {
    for (const r of rows) {
      const k = r.keyword.trim().toLowerCase()
      const prev = unique.get(k)
      if (!prev || (r.avgMonthlySearches ?? 0) > (prev.avgMonthlySearches ?? 0)) unique.set(k, r)
    }
  }
  const ranked = [...unique.values()].sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0))
  const result: IdeaResult = {
    calls,
    kept: ranked.length,
    totalMonthlySearches: ranked.reduce((n, r) => n + (r.avgMonthlySearches ?? 0), 0),
    top: ranked.slice(0, MAX_TOP_KEYWORDS).map((r) => ({ keyword: r.keyword, volume: r.avgMonthlySearches })),
  }
  if (!(await ctx.save({ attempted: true, market, result }))) return ABORT
  return ideasOutcome(ctx, market, result)
}

/** Unique, trimmed rows, at most one per keyword. */
function dedupeIdeas(rows: KeywordIdeaResult[]): KeywordIdeaResult[] {
  const seen = new Set<string>()
  const out: KeywordIdeaResult[] = []
  for (const r of rows) {
    const k = (r?.keyword ?? '').trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ ...r, keyword: r.keyword.trim() })
  }
  return out
}

const businessNameOf = (ctx: StageBContext) => ctx.project.business_name || ctx.summary.business?.companyName || ''

function homePageUrl(ctx: StageBContext): string | null {
  const own = normalizeCheckUrl(ctx.summary.url || '')
  if (own.ok && domainKey(own.url) === ctx.summary.domain) return own.url.toString()
  const admitted = normalizeCheckUrl(ctx.project.target_domain ?? '')
  return admitted.ok ? admitted.url.toString() : null
}

async function b2(ctx: StageBContext): Promise<StepOutcome> {
  if (lockedStorefront(ctx)) return finished('skipped', 'storefront_locked', ctx.summary)
  const market = ideasMarket(ctx.project)
  if (!market) return finished('skipped', 'market_unsupported', ctx.summary)
  const admitted = normalizeCheckUrl(ctx.project.target_domain ?? '')
  if (!admitted.ok) return finished('failed', 'invalid_site_url', ctx.summary)
  const siteKey = domainKey(admitted.url)

  const common = { country: market.country, language: market.language, minMonthlySearches: MIN_MONTHLY_SEARCHES, resultsLimit: 250 as const }
  const keywords = ctx.summary.seedKeywords.map((k) => k.trim()).filter(Boolean).slice(0, 5)
  const home = homePageUrl(ctx)
  const seeds: IdeaSeed[] = []
  if (keywords.length > 0) {
    seeds.push({ origin: 'seed_keywords', label: keywords.join(' | '), key: seedResearchKey('seed_keywords', keywords), input: { researchType: 'keyword', keywords, ...common }, competitor: null })
  }
  if (home) seeds.push({ origin: 'home_page', label: home, key: seedResearchKey('home_page', home), input: { researchType: 'url', keywords: [], url: home, ...common }, competitor: null })
  seeds.push({ origin: 'site', label: siteKey, key: seedResearchKey('site', siteKey), input: { researchType: 'site', keywords: [], site: siteKey, ...common }, competitor: null })

  // The engine's own filters, in its order: brand and support terms, noise
  // (unless it is the site's own subject), store navigation, single words,
  // and — given a representative vocabulary — keywords not about this site.
  const name = businessNameOf(ctx)
  const vocabulary = await ctx.deps.siteVocabulary(ctx.admin, ctx.scope.projectId, [name, ...keywords], ctx.scope.userId)
  const vocab = vocabulary.size >= MIN_SITE_VOCAB_TOKENS ? vocabulary : null
  const brandTokens = tokens(name)
  return runIdeas(ctx, 'b2', seeds, market, (_seed, rows) =>
    dedupeIdeas(rows).filter((r) => researchKeywordIssue(r.keyword, { brandTokens, vocab }) === null),
  )
}

/** The competitor's own name in a keyword: its domain label, spaces and dashes ignored. */
function mentionsCompetitor(keyword: string, domain: string): boolean {
  const label = domain.split('.')[0].replace(/[-_]/g, '').toLowerCase()
  if (label.length < 4) return false
  return keyword.toLowerCase().replace(/[\s\-_.'"]/g, '').includes(label)
}

async function b3(ctx: StageBContext): Promise<StepOutcome> {
  if (lockedStorefront(ctx)) return finished('skipped', 'storefront_locked', ctx.summary)
  const market = ideasMarket(ctx.project)
  if (!market) return finished('skipped', 'market_unsupported', ctx.summary)
  const competitors = ctx.summary.competitors.filter((c) => c.validated).slice(0, MAX_COMPETITOR_SEEDS)
  if (competitors.length === 0) return finished('skipped', 'no_validated_competitors', ctx.summary)

  // A competitor's keywords are kept only when they are about what THIS site
  // sells, so the relevance gate is required here, not optional.
  const name = businessNameOf(ctx)
  const vocab = await ctx.deps.siteVocabulary(ctx.admin, ctx.scope.projectId, [name, ...ctx.summary.seedKeywords], ctx.scope.userId)
  if (vocab.size === 0) return finished('skipped', 'site_vocabulary_missing', ctx.summary)
  const brandTokens = tokens(name)

  const common = { country: market.country, language: market.language, minMonthlySearches: MIN_MONTHLY_SEARCHES, resultsLimit: 250 as const }
  const seeds: IdeaSeed[] = competitors.map((c) => ({
    origin: 'competitor',
    label: c.domain,
    key: seedResearchKey('competitor', c.domain),
    input: { researchType: 'site', keywords: [], site: c.domain, ...common },
    competitor: c.domain,
  }))
  return runIdeas(ctx, 'b3', seeds, market, (seed, rows) =>
    dedupeIdeas(rows).filter(
      (r) => !(seed.competitor && mentionsCompetitor(r.keyword, seed.competitor)) && researchKeywordIssue(r.keyword, { brandTokens, vocab }) === null,
    ),
  )
}

// ── b4: the content plan ────────────────────────────────────────────────────

type ContentVerdict = { status: 'done' | 'skipped' | 'failed'; code: SeedErrorCode | null; topics: number }

/** The engine route's answer, by its status; only a count is read from the body. */
export function contentVerdict(answer: RouteAnswer): ContentVerdict {
  const body = answer.body && typeof answer.body === 'object' ? (answer.body as Record<string, unknown>) : {}
  const meta = body.meta && typeof body.meta === 'object' ? (body.meta as Record<string, unknown>) : {}
  const added = typeof meta.newlyAddedCount === 'number' && Number.isFinite(meta.newlyAddedCount) ? Math.max(0, Math.floor(meta.newlyAddedCount)) : 0
  switch (answer.status) {
    case 200:
      return { status: 'done', code: null, topics: added }
    case 401:
      return { status: 'skipped', code: 'content_session_required', topics: 0 }
    case 402:
    case 403:
      return { status: 'skipped', code: 'content_entitlement_required', topics: 0 }
    case 404:
      // The content module is off for this deployment (ENABLE_CONTENT_AUTOMATION).
      return body.error === 'Not found' ? { status: 'skipped', code: 'content_engine_disabled', topics: 0 } : { status: 'failed', code: 'content_engine_failed', topics: 0 }
    case 409:
      return { status: 'failed', code: 'content_engine_busy', topics: 0 }
    // The model provider failed for the whole run (502), or the model or the
    // entitlement could not be reached (503): nothing was generated.
    case 502:
    case 503:
      return { status: 'failed', code: 'content_engine_unavailable', topics: 0 }
    default:
      return { status: 'failed', code: 'content_engine_failed', topics: 0 }
  }
}

function readContentVerdict(v: unknown): ContentVerdict | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (r.status !== 'done' && r.status !== 'skipped' && r.status !== 'failed') return null
  const code = typeof r.code === 'string' ? (r.code as SeedErrorCode) : null
  return { status: r.status, code, topics: typeof r.topics === 'number' ? r.topics : 0 }
}

async function b4(ctx: StageBContext): Promise<StepOutcome> {
  if (lockedStorefront(ctx)) return finished('skipped', 'storefront_locked', ctx.summary)
  const own = ctx.details.b4 ?? {}
  const saved = readContentVerdict(own.result)
  if (saved) return finished(saved.status, saved.code, ctx.summary, { itemCount: saved.topics, detail: { attempted: true, result: saved } })
  // Only the merchant's own session may ask the engine (its route checks it).
  const contentPlan = ctx.deps.contentPlan
  if (!contentPlan) return finished('skipped', 'content_session_required', ctx.summary)
  const fail = (code: SeedErrorCode) => finished('failed', code, ctx.summary, { detail: { attempted: true } })
  // Resumed after the engine was asked: its run (and its model calls) is spent.
  if (own.attempted === true) return fail('content_engine_interrupted')
  if (!(await ctx.save({ attempted: true }))) return ABORT

  const answer = await settleWithin(() => contentPlan({ projectId: ctx.scope.projectId, runId: ctx.runId }), ctx.deps.budgets.contentMs)
  if (answer.kind === 'timeout') return fail('content_engine_timeout')
  if (answer.kind === 'error' || !answer.value || typeof answer.value.status !== 'number') return fail('content_engine_failed')
  const verdict = contentVerdict(answer.value)
  if (!(await ctx.save({ attempted: true, result: verdict }))) return ABORT
  return finished(verdict.status, verdict.code, ctx.summary, { itemCount: verdict.topics, detail: { attempted: true, result: verdict } })
}

// ── b5: AI-visibility questions ─────────────────────────────────────────────

type QuestionProject = {
  business_name: string | null
  target_domain: string | null
  country: string | null
  language: string | null
  city: string | null
  ai_business_profile: unknown
}

/** The intents the suggestion cache's CHECK accepts; anything else is a recommendation (the enrichment route's default). */
const CACHE_INTENTS = new Set(['commercial', 'pre_purchase', 'informational', 'comparison', 'recommendation', 'brand', 'local'])

/**
 * The enrichment route's validation layers, in its order
 * (app/api/ai-visibility/enriched-suggestions/route.ts): ISO-code leaks,
 * time-sensitive promotions, locations the project does not name, service
 * areas, the business name in quotes, and for Hebrew broken phrasing, direct
 * address and weak promotion; then the business scope. Duplicates go last.
 */
export function keepQuestions(
  raw: FallbackQuestionResponse[],
  ctx: { language: 'he' | 'en'; businessName: string | null; allowedLocations: string[]; serviceAreas: string[]; scope: BusinessScope },
): { question: string; intent: string }[] {
  let list = raw
    .filter((q) => q && typeof q.question === 'string' && q.question.trim().length > 0)
    .map((q) => ({ question: q.question.trim().slice(0, 300), intent: CACHE_INTENTS.has(String(q.intent)) ? String(q.intent) : 'recommendation' }))
  list = list.filter((q) => !containsISOCountryCodeLeak(q.question))
  list = list.filter((q) => !isTimeOrPromotionSensitive(q.question))
  list = list.filter((q) => !containsDisallowedLocation(q.question, ctx.allowedLocations))
  if (ctx.serviceAreas.length > 0) list = list.filter((q) => !containsUnauthorizedLocation(q.question, ctx.serviceAreas))
  list = list
    .map((q) => (containsBusinessNameInQuotes(q.question, ctx.businessName) ? { ...q, question: normalizeQuotes(q.question, ctx.businessName) } : q))
    .filter((q) => !containsBusinessNameInQuotes(q.question, ctx.businessName))
  if (ctx.language === 'he') {
    list = list.filter((q) => !containsUnnaturalorBrokenHebrew(q.question))
    list = list.filter((q) => !containsDirectAddress(q.question, ctx.businessName))
    list = list.filter((q) => !isWeakPromotionalQuestion(q.question, []))
  }
  const scoped = filterSuggestionsByBusinessScope(list, ctx.scope) as { question: string; intent: string }[]
  const seen = new Set<string>()
  const out: { question: string; intent: string }[] = []
  for (const q of scoped) {
    const key = strongNormalize(q.question)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(q)
    if (out.length >= MAX_QUESTIONS) break
  }
  return out
}

function readQuestionsResult(v: unknown): { kept: number; inserted: number } | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  return typeof r.kept === 'number' && typeof r.inserted === 'number' ? { kept: r.kept, inserted: r.inserted } : null
}

async function b5(ctx: StageBContext): Promise<StepOutcome> {
  const { deps } = ctx
  // The AI-visibility module is off for this deployment.
  if (deps.env.ENABLE_AI_VISIBILITY !== 'true') return finished('skipped', 'ai_visibility_disabled', ctx.summary)
  const own = ctx.details.b5 ?? {}
  const saved = readQuestionsResult(own.result)
  if (saved) return finished('done', null, ctx.summary, { itemCount: saved.kept, detail: { attempted: true, result: saved } })

  // The profile stage A wrote (or the owner edited): its niche and audiences.
  const [projectRead, profileRead, audiencesRead] = await Promise.all([
    ctx.admin
      .from('projects')
      .select('business_name, target_domain, country, language, city, ai_business_profile')
      .eq('id', ctx.scope.projectId)
      .eq('user_id', ctx.scope.userId)
      .maybeSingle(),
    ctx.admin.from('project_profiles').select('niche').eq('project_id', ctx.scope.projectId).eq('user_id', ctx.scope.userId).maybeSingle(),
    ctx.admin
      .from('project_audiences')
      .select('label, position')
      .eq('project_id', ctx.scope.projectId)
      .eq('user_id', ctx.scope.userId)
      .order('position', { ascending: true })
      .limit(5),
  ])
  if (projectRead.error || profileRead.error || audiencesRead.error || !projectRead.data) return finished('failed', 'questions_failed', ctx.summary)
  const project = projectRead.data as QuestionProject
  const niche = String((profileRead.data as { niche?: unknown } | null)?.niche ?? '').trim()
  const audiences = ((audiencesRead.data as { label?: unknown }[] | null) ?? []).map((a) => String(a.label ?? '').trim()).filter(Boolean)
  if (!niche && audiences.length === 0) return finished('skipped', 'no_business_profile', ctx.summary)
  if (!deps.env.GEMINI_API_KEY) return finished('skipped', 'questions_unavailable', ctx.summary)

  const fail = (code: SeedErrorCode) => finished('failed', code, ctx.summary, { detail: { attempted: true } })
  // Resumed after the model was asked: the run's one call of b5 is spent.
  if (own.attempted === true) return fail('questions_interrupted')

  const row = project as unknown as Record<string, unknown>
  const base = extractBusinessScope(row)
  const scope: BusinessScope = {
    allowedTopics: [...new Set([niche, ...audiences].filter(Boolean))],
    excludedTerms: base.excludedTerms,
    businessCategory: base.businessCategory,
  }
  // The seed scan's question generator and its keeper are still bilingual, so
  // Spanish is narrowed to ENGLISH here rather than falling through their
  // `language === 'en' ? … : …` seeds, which answer HEBREW for everything else.
  const language = toBilingualPromptLanguage(normalizeLanguage(project.language))
  const businessName = project.business_name || ctx.summary.business?.companyName || null
  const allowedLocations = extractAllowedLocations(row)
  if (!(await ctx.save({ attempted: true }))) return ABORT

  const answer = await settleWithin(
    () =>
      deps.questions({
        projectName: businessName || ctx.summary.domain || 'Project',
        domain: project.target_domain || ctx.summary.domain,
        language,
        countryDisplay: project.country ? getCountryDisplayName(project.country) : undefined,
        allowedLocations,
        scope,
        count: QUESTION_CANDIDATES,
      }),
    deps.budgets.questionsMs,
  )
  if (answer.kind === 'timeout') return fail('questions_timeout')
  // The generator answers [] for every failure of its own (no key, a model
  // error, an unreadable answer), so nothing at all is a failed call.
  if (answer.kind === 'error' || !Array.isArray(answer.value) || answer.value.length === 0) return fail('questions_failed')

  const kept = keepQuestions(answer.value, { language, businessName, allowedLocations, serviceAreas: extractAllowedServiceAreas(row), scope })
  let inserted = 0
  if (kept.length > 0) {
    // The same context the AI-visibility tab loads its suggestions with:
    // the project's language and country, no category, no keyword hash.
    const written = await deps.writeSuggestions(
      ctx.scope.projectId,
      kept.map((q) => ({ question: q.question, intent: q.intent, model_used: 'seed_scan', metadata: { origin: 'seed_scan', runId: ctx.runId } })),
      { projectId: ctx.scope.projectId, language, country: project.country || null, businessCategory: null, keywordsHash: null },
      QUESTION_GENERATION_VERSION,
    )
    if (!written || !written.success) return fail('questions_write_failed')
    inserted = written.rowsInserted
  }
  const result = { kept: kept.length, inserted }
  if (!(await ctx.save({ attempted: true, result }))) return ABORT
  return finished('done', null, ctx.summary, { itemCount: kept.length, detail: { attempted: true, result } })
}

// ── b6: the first rank check of the keywords `continue` added ───────────────

type RankFailure = Extract<SeedErrorCode, 'rank_check_session_required' | 'rank_check_quota' | 'rank_check_failed' | 'rank_check_timeout'>
type RankCheck = { targetId: string; ok: boolean; code: RankFailure | null }

/** The scan route's answer, by its status only. */
export function rankVerdict(answer: RouteAnswer): RankCheck['code'] {
  if (answer.status === 200) return null
  if (answer.status === 401) return 'rank_check_session_required'
  // QUOTA_KEYWORD_CHECKS, or a trial's one check per keyword.
  if (answer.status === 403) return 'rank_check_quota'
  if (answer.status === 504) return 'rank_check_timeout'
  return 'rank_check_failed'
}

const TARGET_ID = /^[0-9a-z-]{1,64}$/i

function readTargetIds(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && TARGET_ID.test(x)))].slice(0, 5)
}

function readRankChecks(v: unknown): RankCheck[] {
  if (!Array.isArray(v)) return []
  const codes: RankFailure[] = ['rank_check_session_required', 'rank_check_quota', 'rank_check_failed', 'rank_check_timeout']
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).targetId === 'string')
    .map((x) => ({ targetId: String(x.targetId), ok: x.ok === true, code: codes.find((c) => c === x.code) ?? null }))
}

type TrackingRefusal = Extract<SeedErrorCode, 'keyword_quota_exceeded' | 'keyword_entitlement_unavailable' | 'keywords_add_failed'>

/** Why `continue` added nothing when the keywords tab's action refused it (its tracking code), or null. */
function trackingRefusal(tracking: unknown): TrackingRefusal | null {
  const code = tracking && typeof tracking === 'object' ? (tracking as { code?: unknown }).code : null
  return code === 'keyword_quota_exceeded' || code === 'keyword_entitlement_unavailable' || code === 'keywords_add_failed' ? code : null
}

function rankOutcome(ctx: StageBContext, base: Record<string, unknown>, checks: RankCheck[], total: number): StepOutcome {
  const ok = checks.filter((c) => c.ok).length
  const detail = { ...base, attempted: true, checks, done: true }
  if (ok === total) return finished('done', null, ctx.summary, { itemCount: ok, detail })
  const first = checks.find((c) => !c.ok)?.code ?? 'rank_check_failed'
  // Refused before anything was checked (no allowance left, no session): not a fault of the run.
  if (ok === 0 && (first === 'rank_check_quota' || first === 'rank_check_session_required')) {
    return finished('skipped', first, ctx.summary, { itemCount: 0, detail })
  }
  return finished('failed', first, ctx.summary, { itemCount: ok, detail })
}

async function b6(ctx: StageBContext): Promise<StepOutcome> {
  const { deps } = ctx
  const own = ctx.details.b6 ?? {}
  // `continue` recorded what it added; b6 checks those and nothing else.
  const targets = readTargetIds(own.targets)
  const base = { tracking: own.tracking ?? null, targets }
  if (targets.length === 0) {
    // Nothing to check. The step's code says why, so the progress screen can
    // too: the plan's keyword limit is a deliberate outcome, an entitlement
    // outage or a failed add is not; nothing chosen or all tracked already is.
    const refused = trackingRefusal(own.tracking)
    if (refused === 'keyword_quota_exceeded') return finished('skipped', refused, ctx.summary, { detail: base })
    if (refused) return finished('failed', refused, ctx.summary, { detail: base })
    return finished('skipped', 'no_keywords_added', ctx.summary, { detail: base })
  }
  const savedChecks = readRankChecks(own.checks)
  if (own.done === true) return rankOutcome(ctx, base, savedChecks, targets.length)
  const rankCheck = deps.rankCheck
  if (!rankCheck) return finished('skipped', 'rank_check_session_required', ctx.summary, { detail: base })
  // Resumed after checks were sent: those checks are spent (and counted).
  if (own.attempted === true) {
    return finished('failed', 'rank_check_interrupted', ctx.summary, {
      itemCount: savedChecks.filter((c) => c.ok).length,
      detail: { ...base, attempted: true, checks: savedChecks },
    })
  }

  const checks: RankCheck[] = []
  if (!(await ctx.save({ ...base, attempted: true, checks }))) return ABORT
  for (const targetId of targets) {
    // Out of time for another check: the rest stay unchecked.
    if (ctx.deadlineAt !== null && deps.now().getTime() + deps.budgets.rankTargetMs + GRACE_MS > ctx.deadlineAt) {
      checks.push({ targetId, ok: false, code: 'rank_check_timeout' })
      break
    }
    const answer = await settleWithin(() => rankCheck({ projectId: ctx.scope.projectId, targetId }), deps.budgets.rankTargetMs)
    const code: RankCheck['code'] =
      answer.kind === 'timeout' ? 'rank_check_timeout' : answer.kind === 'error' || !answer.value || typeof answer.value.status !== 'number' ? 'rank_check_failed' : rankVerdict(answer.value)
    checks.push({ targetId, ok: code === null, code })
    if (!(await ctx.save({ ...base, attempted: true, checks }))) return ABORT
    // No allowance left, or no session: the next check would be refused the same way.
    if (code === 'rank_check_quota' || code === 'rank_check_session_required') break
  }
  if (!(await ctx.save({ ...base, attempted: true, checks, done: true }))) return ABORT
  return rankOutcome(ctx, base, checks, targets.length)
}

/** The executors, by step. The runner calls them in STAGE_STEPS.b order. */
export const STAGE_B_EXECUTORS: Record<'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6', (ctx: StageBContext) => Promise<StepOutcome>> = { b1, b2, b3, b4, b5, b6 }
