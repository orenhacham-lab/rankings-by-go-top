/**
 * Fixtures for the stage-B suites: a site to crawl (robots.txt rules for every
 * crawler and for ours, a sitemap index with an off-host child, more pages
 * than a run may read, redirects that leave the site or walk into a disallowed
 * path, a page that fails with provider text), counting fakes for Google Ads,
 * the question model, the suggestion cache, the content route and the scan
 * route, and a finished stage-A run to continue from.
 */
import type { FallbackQuestionResponse } from '@/lib/ai-visibility/gemini-semantic-classifier'
import type { writeSuggestionsToCache } from '@/lib/ai-visibility/suggestion-cache'
import type { KeywordIdeaResult, KeywordIdeasInput } from '@/lib/google-ads/keyword-ideas'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { claimSnapshot } from '../claim'
import { runStageA } from '../runner'
import type { QuestionsInput, RouteAnswer } from '../steps-b'
import { createSeedRun, getLatestSeedRun, startSeedStageB, updateSeedStep } from '../store'
import { initialSummary } from '../summary'
import type { SeedScope } from '../types'
import { captureConsole, claimedScan, fakeModel, fakeSearch, HE_WP, HE_WP_INSIGHT, HE_WP_RESULTS, heWordPressSite, PROJECT, SECRET, USER, type FakeRoute } from './_fixtures'

export const SCOPE: SeedScope = { projectId: PROJECT, userId: USER }
export const BASE = 'https://www.plumber-tlv.co.il'

const html = (body: string, headers: Record<string, string> = {}): FakeRoute => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body })
const xml = (body: string): FakeRoute => ({ status: 200, headers: { 'content-type': 'application/xml' }, body })
const text = (body: string): FakeRoute => ({ status: 200, headers: { 'content-type': 'text/plain' }, body })
const redirect = (location: string, status = 301): FakeRoute => ({ status, headers: { location } })
const urlset = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`
const sitemapIndex = (children: { loc: string; lastmod: string }[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children
    .map((c) => `<sitemap><loc>${c.loc}</loc><lastmod>${c.lastmod}</lastmod></sitemap>`)
    .join('')}</sitemapindex>`

function page(title: string, h1: string, links: string[] = [], schemaType?: string): FakeRoute {
  const ld = schemaType ? `<script type="application/ld+json">{"@context":"https://schema.org","@type":"${schemaType}","name":"${h1}"}</script>` : ''
  return html(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title} | אינסטלציה מהירה</title>${ld}</head>
<body><h1>${h1}</h1><p>תוכן העמוד על ${h1}. אינסטלציה מהירה בתל אביב.</p>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}</body></html>`)
}

/** Paths robots.txt keeps from us: for every crawler, and for our own product token. */
export const DISALLOWED_PATHS = ['/wp-admin/', '/private/', '/blog/draft-']

export const CRAWL_ROBOTS = `User-agent: *
Disallow: /wp-admin/
Disallow: /private/

User-agent: GPTBot
Disallow: /

User-agent: GoTopFreeCheck
Disallow: /blog/draft-

Sitemap: ${BASE}/wp-sitemap.xml
`

/** Page paths the crawl may read (all on the project's host). */
export const POSTS = Array.from({ length: 40 }, (_, i) => `/blog/post-${i + 1}`)

/**
 * The Hebrew plumber's site, grown for a crawl: 40 articles, service and
 * category pages, a page that moved to another domain, one that moved into a
 * disallowed folder, and one that fails with provider text in its body.
 *
 * `sitemapIndexes`: robots.txt also names that many more sitemap indexes, of
 * five same-host child sitemaps each — more documents than a run may read.
 */
export function crawlSite(over: { robots?: string; sitemapIndexes?: number } = {}): Record<string, FakeRoute> {
  const site = heWordPressSite()
  const extraIndexes = Array.from({ length: over.sitemapIndexes ?? 0 }, (_, i) => `${BASE}/sitemap-extra-${i + 1}.xml`)
  const robots = over.robots ?? `${CRAWL_ROBOTS}${extraIndexes.map((u) => `Sitemap: ${u}\n`).join('')}`
  const routes: Record<string, FakeRoute> = {
    ...site,
    [`${BASE}/robots.txt`]: text(robots),
    [`${BASE}/wp-sitemap.xml`]: xml(
      sitemapIndex([
        // Newest first is how the engine expands an index: the off-host child
        // is the newest, so it is certainly among those tried.
        { loc: 'https://cdn.evil-sitemaps.com/sitemap_x.xml', lastmod: '2026-09-20' },
        { loc: `${BASE}/wp-sitemap-posts-page-1.xml`, lastmod: '2026-09-10' },
        { loc: `${BASE}/wp-sitemap-taxonomies-category-1.xml`, lastmod: '2026-09-09' },
        { loc: `${BASE}/wp-sitemap-posts-post-1.xml`, lastmod: '2026-09-08' },
        { loc: `${BASE}/wp-sitemap-posts-post-2.xml`, lastmod: '2026-09-07' },
        { loc: `${BASE}/wp-sitemap-posts-post-3.xml`, lastmod: '2026-09-06' },
        { loc: `${BASE}/wp-sitemap-posts-post-4.xml`, lastmod: '2026-09-05' },
      ]),
    ),
    [`${BASE}/wp-sitemap-posts-page-1.xml`]: xml(
      urlset(['/', '/services', '/contact', '/about', '/areas', '/old-page', '/private/secret-page', '/blog/draft-1', '/services/boilers', '/services/leaks'].map((p) => `${BASE}${p}`)),
    ),
    [`${BASE}/wp-sitemap-taxonomies-category-1.xml`]: xml(urlset(['/category/pipes', '/category/boilers'].map((p) => `${BASE}${p}`))),
    [`${BASE}/wp-sitemap-posts-post-1.xml`]: xml(urlset(POSTS.slice(0, 20).map((p) => `${BASE}${p}`))),
    [`${BASE}/wp-sitemap-posts-post-2.xml`]: xml(urlset(POSTS.slice(20).map((p) => `${BASE}${p}`))),
    [`${BASE}/wp-sitemap-posts-post-3.xml`]: xml(urlset([`${BASE}/blog/extra-1`])),
    [`${BASE}/wp-sitemap-posts-post-4.xml`]: xml(urlset([`${BASE}/blog/extra-2`])),
    'https://cdn.evil-sitemaps.com/sitemap_x.xml': xml(urlset(['https://cdn.evil-sitemaps.com/x'])),
    [`${BASE}/services`]: page('שירותי אינסטלציה', 'שירותי אינסטלציה', ['/services/boilers', '/services/leaks', '/contact']),
    [`${BASE}/services/boilers`]: page('תיקון דודי שמש', 'תיקון דודי שמש', ['/services']),
    [`${BASE}/services/leaks`]: page('איתור נזילות', 'איתור נזילות ללא הרס', ['/services']),
    [`${BASE}/contact`]: page('צור קשר', 'צור קשר', ['/']),
    [`${BASE}/about`]: page('אודות', 'אודות אינסטלציה מהירה', ['/services']),
    // Moved to another domain: the hop is refused before it leaves.
    [`${BASE}/areas`]: redirect('https://other-plumbers.example/areas'),
    // Moved into a disallowed folder: the hop is refused before it leaves.
    [`${BASE}/old-page`]: redirect(`${BASE}/private/moved`),
    [`${BASE}/private/secret-page`]: page('סודי', 'סודי'),
    [`${BASE}/private/moved`]: page('הועבר', 'הועבר'),
    [`${BASE}/blog/draft-1`]: page('טיוטה', 'טיוטה'),
    [`${BASE}/category/pipes`]: page('צנרת', 'צנרת', ['/services'], 'CollectionPage'),
    [`${BASE}/category/boilers`]: page('דודים', 'דודים', ['/services/boilers'], 'CollectionPage'),
    'https://other-plumbers.example/areas': page('אזורים', 'אזורים'),
  }
  for (const [i, p] of POSTS.entries()) routes[`${BASE}${p}`] = page(`מדריך אינסטלציה ${i + 1}`, `מדריך אינסטלציה מספר ${i + 1}`, ['/services'], 'BlogPosting')
  for (const [i, index] of extraIndexes.entries()) {
    const children = Array.from({ length: 5 }, (_, j) => `${BASE}/sitemap-extra-${i + 1}-${j + 1}.xml`)
    routes[index] = xml(sitemapIndex(children.map((loc, j) => ({ loc, lastmod: `2026-09-${String(28 - j).padStart(2, '0')}` }))))
    for (const [j, loc] of children.entries()) routes[loc] = xml(urlset([`${BASE}${POSTS[(i * 5 + j) % POSTS.length]}`]))
  }
  // A server error whose body is provider text: nothing of it may be kept.
  routes[`${BASE}/blog/post-3`] = { status: 500, headers: { 'content-type': 'text/html' }, body: `<html><body>${SECRET}</body></html>` }
  return routes
}

// ── Counting fakes ──────────────────────────────────────────────────────────

const idea = (keyword: string, avgMonthlySearches: number): KeywordIdeaResult => ({
  keyword,
  avgMonthlySearches,
  competition: 'MEDIUM',
  competitionIndex: 40,
  lowTopOfPageBid: 1.2,
  highTopOfPageBid: 4.5,
  currency: 'ILS',
})

/** What Google Ads answers, by seed: some of each kept, some of each that the filters must drop. */
export function ideaRows(input: KeywordIdeasInput): KeywordIdeaResult[] {
  if (input.researchType === 'site' && input.site && input.site !== HE_WP.key) {
    const label = input.site.split('.')[0]
    return [
      idea('תיקון דוד שמש מחיר', 900),
      idea('איתור נזילות מים בבית', 700),
      // the competitor's own name
      idea(`${label.replace(/-/g, ' ')} טלפון`, 400),
      // nothing to do with this site
      idea('נעלי ריצה לנשים', 5000),
      // one word
      idea('אינסטלטור', 9000),
    ]
  }
  return [
    idea('אינסטלטור בתל אביב', 1600),
    idea('פתיחת סתימות בכיור', 880),
    idea('תיקון דוד שמש', 720),
    // the business itself
    idea('אינסטלציה מהירה טלפון', 300),
    // one word
    idea('אינסטלטור', 9000),
    // nothing to do with this site
    idea('ביטוח רכב זול', 12000),
  ]
}

export function fakeIdeas(answer: (input: KeywordIdeasInput) => Promise<KeywordIdeaResult[]> | KeywordIdeaResult[] = ideaRows) {
  const calls: KeywordIdeasInput[] = []
  const fn = async (input: KeywordIdeasInput) => {
    calls.push(input)
    return answer(input)
  }
  return { fn, calls }
}

const q = (question: string, intent: string): FallbackQuestionResponse => ({ question, intent, reason: 'fixture' })

/** Fifteen candidates as the question model would answer: most usable, some for each filter. */
export const QUESTION_CANDIDATES: FallbackQuestionResponse[] = [
  q('איך לבחור אינסטלטור אמין?', 'recommendation'),
  q('כמה עולה פתיחת סתימה בכיור?', 'commercial'),
  q('מה עושים כשיש נזילה מתחת לכיור?', 'informational'),
  q('איך יודעים שהדוד צריך החלפה?', 'informational'),
  q('כמה זמן לוקח איתור נזילה ללא הרס?', 'informational'),
  q('מה ההבדל בין פתיחת סתימה ידנית למכונה?', 'comparison'),
  q('איזה אינסטלטור מומלץ לוועדי בתים?', 'recommendation'),
  q('מה לבדוק לפני שמזמינים אינסטלטור?', 'pre_purchase'),
  // the same question again
  q('איך לבחור אינסטלטור אמין?', 'recommendation'),
  // a country code where a name belongs
  q('מה המחיר של אינסטלטור ב IL?', 'commercial'),
  q('איך מונעים סתימות בצנרת הבית?', 'informational'),
  q('מה גורם לרעש בצנרת המים?', 'informational'),
  q('כמה עולה החלפת ברז במטבח?', 'commercial'),
  q('איך מתקנים ברז מטפטף?', 'informational'),
  q('מה עושים בהצפה בדירה?', 'informational'),
]
/** The one the ISO-code filter must drop. */
export const ISO_LEAK_QUESTION = 'מה המחיר של אינסטלטור ב IL?'

export function fakeQuestions(answer: FallbackQuestionResponse[] | (() => Promise<FallbackQuestionResponse[]>) = QUESTION_CANDIDATES) {
  const calls: QuestionsInput[] = []
  const fn = async (input: QuestionsInput) => {
    calls.push(input)
    return typeof answer === 'function' ? answer() : answer
  }
  return { fn, calls }
}

type WriteArgs = Parameters<typeof writeSuggestionsToCache>
type WriteResult = Awaited<ReturnType<typeof writeSuggestionsToCache>>

export const writeOk = (n: number): WriteResult => ({
  success: true,
  contextHash: 'ctx',
  rowsAttempted: n,
  rowsInserted: n,
  rowsAlreadyPresent: 0,
  rowsVisibleAfterWrite: n,
  errorCode: null,
  errorMessage: null,
  sampleQuestionHashes: [],
})

export function fakeSuggestionCache(result: (args: WriteArgs) => WriteResult = (args) => writeOk(args[1].length)) {
  const calls: WriteArgs[] = []
  const fn: typeof writeSuggestionsToCache = async (...args: WriteArgs) => {
    calls.push(args)
    return result(args)
  }
  return { fn, calls }
}

export function fakeRoute<T>(answer: (input: T) => RouteAnswer | Promise<RouteAnswer>) {
  const calls: T[] = []
  const fn = async (input: T) => {
    calls.push(input)
    return answer(input)
  }
  return { fn, calls }
}

// ── A finished stage A, ready for `continue` ────────────────────────────────

/**
 * Run a real stage A of the plumber's site with the stage-A fakes; returns the
 * run id. `claim` seeds it from a claimed free check instead (a1 reads nothing).
 */
export async function finishedStageA(admin: ServiceRoleClient, net: { fetch: typeof fetch }, now: () => Date, opts: { claim?: boolean } = {}): Promise<string> {
  const snapshot = opts.claim ? claimSnapshot(claimedScan()) : null
  const created = await createSeedRun(admin, SCOPE, {
    trigger: snapshot ? 'claim' : 'create',
    stage: 'a',
    summary: initialSummary({ source: snapshot ? 'claim' : 'scan', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', locale: 'he' }),
    stepDetail: snapshot ? { a1: { claim: snapshot } } : undefined,
    now: now(),
  })
  if (!created.ok) throw new Error('stage A run not created')
  const result = await captureConsole(() =>
    runStageA({
      admin,
      scope: SCOPE,
      runId: created.run.id,
      lease: created.lease,
      deps: { fetchImpl: net.fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: fakeSearch(HE_WP_RESULTS).fn, now },
    }),
  )
  if (result.value.outcome !== 'finished' || result.value.status !== 'done') throw new Error(`stage A did not finish: ${JSON.stringify(result.value)}`)
  return created.run.id
}

/** What `continue` leaves behind: the run at stage B with its lease, and b6 told which keywords were added. */
export async function continued(
  admin: ServiceRoleClient,
  runId: string,
  now: Date,
  targets: string[] = [],
  tracking: { requested: number; added: number; code: string } = {
    requested: targets.length,
    added: targets.length,
    code: targets.length ? 'keywords_added' : 'no_keywords_selected',
  },
): Promise<string> {
  const run = await getLatestSeedRun(admin, SCOPE)
  if (!run || run === 'error' || run.id !== runId) throw new Error('stage A run not found')
  const started = await startSeedStageB(admin, SCOPE, run, now)
  if (!started.ok) throw new Error(`stage B not started: ${started.reason}`)
  await updateSeedStep(admin, SCOPE, runId, 'b6', { status: 'pending', detail: { tracking, targets } })
  return started.lease
}
