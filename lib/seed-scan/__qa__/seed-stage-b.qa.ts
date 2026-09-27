/**
 * Stage B of the seeding scan, end to end: a real stage A of the Hebrew
 * plumber's site, moved on to stage B as `continue` leaves it, then b1-b6
 * against a site grown for a crawl (robots.txt rules for every crawler and for
 * ours, a sitemap index with an off-host child, more pages than a run may
 * read, redirects that leave the site or walk into a disallowed folder, a page
 * that fails with provider text).
 *
 * The engine's real fetchers, sitemap discovery and parsers run against the
 * fake network (only sockets and DNS are fake), and the recommendation
 * engine's real site vocabulary and keyword filters run against the FakeAdmin
 * world. Google Ads, the question model, the suggestion cache, the content
 * route and the scan route are counting fakes — except in section 10, where
 * the real Google Ads and Gemini libraries run against a stubbed global fetch.
 *
 * What is asserted: which requests leave and with what user agent, what
 * robots.txt keeps out, how much each step spends (≤25 page reads, ≤6 sitemap
 * documents, ≤6 Google Ads calls, one model call), where each step's result
 * lands, that every step is saved on its own and a resumed run starts at the
 * first unfinished step without spending twice, the time cap, and that
 * provider text never reaches a stored row, a result or a log line.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-stage-b.qa.ts
 */
import { normalizeLanguage } from '@/lib/ai-visibility/prompt-templates'
import { getContentIndex } from '@/lib/content/content-index'
import { buildSiteVocabulary } from '@/lib/content/recommendations/engine'
import { reassembleReport, SCAN_INDEX_VERSION } from '@/lib/content/wordpress-content-index'
import { GoogleAdsError } from '@/lib/google-ads/client'
import { generateKeywordIdeas, type KeywordIdeasInput } from '@/lib/google-ads/keyword-ideas'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CRAWL_INDEX_VERSION, MAX_KEY_PAGES } from '../crawl'
import { readSeedResearch } from '../research'
import { resumeSeedRun, runSeedStage } from '../runner'
import { contentVerdict, MAX_IDEA_CALLS, MAX_SITEMAP_DOCS, rankVerdict, type StageBDepsInput } from '../steps-b'
import { STAGE_B_LEASE_MS } from '../store'
import { readSummary } from '../summary'
import type { SeedSummary } from '../types'
import { captureConsole, clock, FakeNetwork, HE_WP, installFakeDns, makeChecker, PROJECT, projectRow, SECRET, USER, world, type FakeRoute, type Tables } from './_fixtures'
import { auditOwners } from './_owner-audit'
import {
  BASE,
  continued,
  crawlSite,
  DISALLOWED_PATHS,
  fakeIdeas,
  fakeQuestions,
  fakeRoute,
  fakeSuggestionCache,
  finishedStageA,
  ideaRows,
  ISO_LEAK_QUESTION,
  SCOPE,
} from './_stage-b-fixtures'

const { check, finish } = makeChecker()

// ── Reading the world ───────────────────────────────────────────────────────

type Row = Record<string, unknown>
const B_STEPS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] as const
const stepRow = (t: Tables, step: string, runId?: string) =>
  (t.project_seed_steps.find((s) => s.step === step && (!runId || s.run_id === runId)) ?? {}) as Row
const runRow = (t: Tables, runId?: string) => (t.project_seed_runs.find((r) => !runId || r.id === runId) ?? {}) as Row
const detailOf = (t: Tables, step: string, runId?: string) => (stepRow(t, step, runId).detail ?? {}) as Row
const summaryOf = (t: Tables, runId?: string) => readSummary(runRow(t, runId).summary) as SeedSummary
const statusLine = (t: Tables, runId?: string) =>
  B_STEPS.map((s) => {
    const r = stepRow(t, s, runId)
    return `${s}:${r.status}${r.error_code ? `(${r.error_code})` : ''}`
  }).join(' ')
const ALL_DONE = 'b1:done b2:done b3:done b4:done b5:done b6:done'
const seedRows = (t: Tables, prefix: string) => (t.keyword_research_cache ?? []).filter((r) => String(r.seed_value).startsWith(prefix))
const keptKeywords = (rows: Row[]) => rows.flatMap((r) => (r.results_json as Row[]).map((k) => String(k.keyword)))

/** The keys of the WordPress index's ScannedTarget (lib/content/wordpress-content-scan.ts), the optional one aside. */
const TARGET_KEYS = [
  'targetUrl', 'targetType', 'targetTitle', 'inboundLinkCount', 'eligibility', 'eligibilityReason', 'targetRole', 'targetPriority',
  'keywordSource', 'primaryKeywordCandidate', 'keywordAvailable', 'usableAnchorsCount', 'cautionAnchorsCount', 'rejectedAnchorsCount',
  'onlyGenericAnchors', 'usableAnchors', 'cautionAnchors', 'rejectedAnchors', 'exampleSources', 'matchedGeneratedArticleId',
  'matchedGeneratedArticleTitle', 'contentSkipped',
].sort()

// ── The network, recorded with each request's user agent ────────────────────

function recordingNet(routes: Record<string, FakeRoute>) {
  const net = new FakeNetwork(routes)
  const log: { url: string; ua: string | null }[] = []
  const hooks: ((url: string) => void)[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    log.push({ url, ua: new Headers(init?.headers).get('user-agent') })
    for (const h of hooks) h(url)
    return net.fetch(input, init)
  }
  return { log, hooks, fetch: fetchImpl }
}

// ── A stage-B run, ready to work ────────────────────────────────────────────

function standardFakes() {
  return {
    ideas: fakeIdeas(),
    questions: fakeQuestions(),
    cache: fakeSuggestionCache(),
    content: fakeRoute<{ projectId: string; runId: string }>(() => ({ status: 200, body: { meta: { newlyAddedCount: 7 } } })),
    rank: fakeRoute<{ projectId: string; targetId: string }>(() => ({ status: 200, body: { ok: true } })),
  }
}
type Fakes = ReturnType<typeof standardFakes>

const ENV = { ENABLE_AI_VISIBILITY: 'true', GEMINI_API_KEY: 'qa-key' }

function depsOf(fakes: Fakes, fetchImpl: typeof fetch, now: () => Date): StageBDepsInput {
  return {
    fetchImpl,
    keywordIdeas: fakes.ideas.fn,
    questions: fakes.questions.fn,
    writeSuggestions: fakes.cache.fn,
    contentPlan: fakes.content.fn,
    rankCheck: fakes.rank.fn,
    env: ENV,
    now,
  }
}

type Tracking = { requested: number; added: number; code: string }

async function setupB(
  o: { robots?: string; sitemapIndexes?: number; claim?: boolean; targets?: string[]; tracking?: Tracking; fakes?: Partial<Fakes>; routes?: Record<string, FakeRoute> } = {},
) {
  const { tables, fake, admin } = world(projectRow())
  const clk = clock()
  const web = recordingNet({ ...crawlSite({ robots: o.robots, sitemapIndexes: o.sitemapIndexes }), ...o.routes })
  const runId = await finishedStageA(admin, { fetch: web.fetch }, clk.now, { claim: o.claim })
  const afterA = web.log.length
  // The keywords `continue` added (through the keywords tab's action).
  tables.tracking_targets = [
    { id: 't1', project_id: PROJECT, user_id: USER, keyword: 'פתיחת סתימות' },
    { id: 't2', project_id: PROJECT, user_id: USER, keyword: 'איתור נזילות' },
  ]
  const lease = await continued(admin, runId, clk.now(), o.targets ?? ['t1', 't2'], o.tracking)
  const audit = auditOwners(fake)
  const fakes: Fakes = { ...standardFakes(), ...o.fakes }
  const run = (extra: StageBDepsInput = {}, deadlineAt?: number) =>
    captureConsole(() => runSeedStage({ admin, scope: SCOPE, runId, lease, stageB: { ...depsOf(fakes, web.fetch, clk.now), ...extra }, deadlineAt }))
  return { tables, admin, clk, web, afterA, runId, lease, audit, fakes, run, b1: () => web.log.slice(afterA) }
}

/** The database as it was at one moment: what a worker that died then left behind. */
function snapshotter() {
  let source: Tables | null = null
  let snap: Tables | null = null
  return {
    watch: (t: Tables) => {
      source = t
    },
    take: () => {
      if (!snap && source) snap = structuredClone(source)
    },
    get: () => snap,
  }
}

const EXPIRED = STAGE_B_LEASE_MS + 60_000

/** A new worker on the snapshot, `advanceMs` after the dead one's clock. */
async function resumeFrom(snap: Tables, runId: string, o: { advanceMs?: number; fakes?: Partial<Fakes> } = {}) {
  const copy = structuredClone(snap)
  const { tables, fake, admin } = world(copy.projects[0] as Row, copy)
  const clk = clock()
  clk.advance(o.advanceMs ?? EXPIRED)
  const web = recordingNet(crawlSite())
  const fakes: Fakes = { ...standardFakes(), ...o.fakes }
  const audit = auditOwners(fake)
  const res = await captureConsole(() => resumeSeedRun({ admin, scope: SCOPE, runId, stageB: depsOf(fakes, web.fetch, clk.now) }))
  return { tables, web, fakes, audit, res }
}

const pathOf = (u: string) => new URL(u).pathname
const disallowedHit = (urls: string[]) => urls.filter((u) => DISALLOWED_PATHS.some((p) => pathOf(u).startsWith(p)))

async function main() {
  installFakeDns()

  // ── 1. A whole stage B ────────────────────────────────────────────────────
  console.log("1) A whole stage B of the plumber's site")
  {
    const s = await setupB()
    const { value: result, output } = await s.run()
    const t = s.tables
    check('the run finishes done', result.outcome === 'finished' && result.status === 'done', JSON.stringify(result))
    check('every stage-B step is done', statusLine(t) === ALL_DONE, statusLine(t))
    check("stage A's steps stay as they finished", ['a1', 'a2', 'a3', 'a4'].every((st) => stepRow(t, st).status === 'done'))
    check('the run row: stage b, done, its lease dropped', runRow(t).stage === 'b' && runRow(t).status === 'done' && runRow(t).lease_expires_at === null && !!runRow(t).finished_at)

    // Spend, per run.
    check(`Google Ads: exactly ${2 * MAX_IDEA_CALLS} calls (three in b2, three in b3)`, s.fakes.ideas.calls.length === 6, String(s.fakes.ideas.calls.length))
    check('the question model: ONE call', s.fakes.questions.calls.length === 1)
    check('the engine: asked once; the scan route: once per added keyword', s.fakes.content.calls.length === 1 && s.fakes.rank.calls.length === 2)

    // b1: the crawl.
    const reqs = s.b1()
    const urls = reqs.map((r) => r.url)
    check('b1 reads only the project host', urls.length > 0 && urls.every((u) => new URL(u).hostname === 'www.plumber-tlv.co.il'), [...new Set(urls.map((u) => new URL(u).hostname))].join(','))
    check('…never the off-host sitemap child, never the domain a page moved to', !urls.some((u) => /evil-sitemaps|other-plumbers/.test(u)))
    check('no disallowed path is requested (robots.txt for every crawler and for ours), redirect hops included',
      disallowedHit(urls).length === 0 && !urls.includes(`${BASE}/private/moved`), disallowedHit(urls).join(','))
    check("robots.txt is not read again: a1's copy governs", !urls.some((u) => pathOf(u) === '/robots.txt'))
    const pageReads = urls.filter((u) => !pathOf(u).endsWith('.xml'))
    const sitemapReads = urls.filter((u) => pathOf(u).endsWith('.xml'))
    check(`at most ${MAX_KEY_PAGES} page reads (40 articles listed)`, pageReads.length === MAX_KEY_PAGES, String(pageReads.length))
    check(`at most ${MAX_SITEMAP_DOCS} sitemap documents`, sitemapReads.length > 0 && sitemapReads.length <= MAX_SITEMAP_DOCS, String(sitemapReads.length))
    check('every request carries our user agent', reqs.every((r) => (r.ua ?? '').startsWith('GoTopFreeCheck/1.0')), JSON.stringify(reqs.find((r) => !(r.ua ?? '').startsWith('GoTopFreeCheck'))))
    const b1d = detailOf(t, 'b1')
    check('b1 item count = pages read: 25 attempted, 3 failed (moved off-site, moved into a disallowed folder, a server error)',
      stepRow(t, 'b1').item_count === 22 && b1d.pagesRead === 25 && b1d.pagesFailed === 3, JSON.stringify({ n: stepRow(t, 'b1').item_count, r: b1d.pagesRead, f: b1d.pagesFailed }))

    const index = t.site_crawl_index ?? []
    const idx = (index[0] ?? {}) as Row
    check('one site index row, owned by this user and project', index.length === 1 && idx.user_id === USER && idx.project_id === PROJECT)
    check('stamped with the scanner version the engine reads as current, and with the crawler\'s own',
      idx.scanner_version === SCAN_INDEX_VERSION && (idx.scan_params as Row)?.crawler === CRAWL_INDEX_VERSION && idx.site_host === HE_WP.key)
    const targets = (idx.targets ?? []) as Row[]
    check('targets: the home page first, then every page read (1 + 22)', targets.length === 23 && targets[0]?.targetUrl === HE_WP.home, String(targets.length))
    check("every target has exactly the keys of the WordPress index's ScannedTarget",
      targets.every((x) => JSON.stringify(Object.keys(x).sort()) === JSON.stringify(TARGET_KEYS)), JSON.stringify(Object.keys(targets[0] ?? {}).sort()))
    check('no target is a page that was not read (disallowed, off-site, failed)',
      !targets.some((x) => /private|draft|\/areas|old-page|post-3$|evil|other-plumbers/.test(String(x.targetUrl))))
    check('articles and category pages are classified as such', targets.some((x) => x.targetType === 'post') && targets.some((x) => x.targetType === 'category'),
      [...new Set(targets.map((x) => x.targetType))].join(','))
    check('nothing a failing page said is kept', !JSON.stringify(idx).includes(SECRET))
    const read = await getContentIndex(PROJECT, USER, s.admin)
    check('getContentIndex answers with the crawl (no WordPress connection)', read?.id === idx.id && read?.project_id === PROJECT)
    check("…and the engine's reader reassembles all of it", !!read && reassembleReport(read).targets.length === 23)

    // b2: keyword ideas of the site itself.
    const summary = summaryOf(t)
    const b2calls = s.fakes.ideas.calls.slice(0, 3)
    const byType = (type: string) => b2calls.find((c) => c.researchType === type)
    check('b2: the seed keywords, the home page, the whole domain (siteSeed)', b2calls.map((c) => c.researchType).sort().join(',') === 'keyword,site,url')
    check("…the run's own seed keywords", JSON.stringify(byType('keyword')?.keywords) === JSON.stringify(summary.seedKeywords), JSON.stringify(byType('keyword')?.keywords))
    check('…the home page, and the domain the project names', byType('url')?.url === HE_WP.home && byType('site')?.site === HE_WP.key)
    check("…in the project's market, with the engine's volume floor", b2calls.every((c) => c.country === 'IL' && c.language === 'he' && c.minMonthlySearches === 30))
    const own = seedRows(t, 'seed:keywords:').concat(seedRows(t, 'seed:home:'), seedRows(t, 'seed:site:'))
    check('b2 keeps one research-cache row per seed, owned by this user', own.length === 3 && own.every((r) => r.user_id === USER && r.project_id === PROJECT))
    check("…inside the table's seed_type CHECK: keywords → 'keyword', page and domain → 'url'",
      seedRows(t, 'seed:keywords:')[0]?.seed_type === 'keyword' && seedRows(t, 'seed:home:')[0]?.seed_type === 'url' && seedRows(t, 'seed:site:')[0]?.seed_type === 'url')
    const ownKept = keptKeywords(own)
    check('only what passed the filters is stored: not the brand, not one word, not the unrelated',
      !ownKept.includes('אינסטלציה מהירה טלפון') && !ownKept.includes('אינסטלטור') && !ownKept.includes('ביטוח רכב זול'), ownKept.join(' / '))
    check("the site's own keywords are kept", ['אינסטלטור בתל אביב', 'פתיחת סתימות בכיור', 'תיקון דוד שמש'].every((k) => ownKept.includes(k)), ownKept.join(' / '))
    const b2r = detailOf(t, 'b2').result as Row
    check('b2 item count = keywords kept; its detail sums their monthly searches',
      stepRow(t, 'b2').item_count === 3 && b2r?.kept === 3 && b2r?.totalMonthlySearches === 1600 + 880 + 720, JSON.stringify({ n: stepRow(t, 'b2').item_count, b2r }))

    // b3: keyword ideas of the validated competitors.
    const validated = summary.competitors.filter((c) => c.validated).slice(0, 3).map((c) => c.domain)
    const b3calls = s.fakes.ideas.calls.slice(3)
    check('b3: one siteSeed call per validated competitor, three at most',
      validated.length === 3 && b3calls.length === 3 && b3calls.every((c) => c.researchType === 'site') && JSON.stringify(b3calls.map((c) => c.site)) === JSON.stringify(validated),
      JSON.stringify(b3calls.map((c) => c.site)))
    const comp = seedRows(t, 'seed:competitor:')
    check("each competitor's keywords under its own row, marked as a competitor's by its key",
      JSON.stringify(comp.map((r) => r.seed_value).sort()) === JSON.stringify(validated.map((d) => `seed:competitor:${d}`).sort()) && comp.every((r) => r.user_id === USER))
    const compKept = keptKeywords(comp)
    check("a competitor's keyword is kept only when it is about this site: not its name, not the unrelated, not one word",
      compKept.length > 0 && !compKept.some((k) => /טלפון|נעלי ריצה/.test(k) || k === 'אינסטלטור'), compKept.join(' / '))
    check('b3 item count = distinct keywords kept', stepRow(t, 'b3').item_count === new Set(compKept).size, String(stepRow(t, 'b3').item_count))

    const research = await readSeedResearch(s.admin as unknown as SupabaseClient, SCOPE)
    check('the research tab reads all six back by origin — no Google Ads call',
      research !== 'error' && research.length === 6 && research.filter((r) => r.origin === 'competitor').length === 3 && s.fakes.ideas.calls.length === 6,
      research === 'error' ? 'error' : research.map((r) => r.origin).join(','))
    // The engine's own rows share the table: sixty newer ones must not push the scan's out.
    const cache = t.keyword_research_cache ?? []
    const newest = Math.max(...seedRows(t, 'seed:').map((r) => Date.parse(String(r.fetched_at))))
    const engineRows = Array.from({ length: 60 }, (_, i) => ({
      user_id: USER,
      project_id: PROJECT,
      seed_type: 'url',
      seed_value: `https://engine-${i}.example/`,
      country: 'IL',
      language: 'he',
      results_json: [{ keyword: `engine keyword ${i}`, avgMonthlySearches: 10 }],
      fetched_at: new Date(newest + (i + 1) * 60_000).toISOString(),
    }))
    cache.push(...engineRows)
    const crowded = await readSeedResearch(s.admin as unknown as SupabaseClient, SCOPE)
    cache.splice(cache.length - engineRows.length)
    check("…and sixty newer rows of the engine's own do not push them out",
      Number.isFinite(newest) && crowded !== 'error' && crowded.length === 6 && crowded.filter((r) => r.origin === 'competitor').length === 3,
      crowded === 'error' ? 'error' : crowded.map((r) => r.origin).join(','))

    // b4: the content plan.
    check('b4: the engine route, once, for this project and run; item count = topics added',
      JSON.stringify(s.fakes.content.calls) === JSON.stringify([{ projectId: PROJECT, runId: s.runId }]) && stepRow(t, 'b4').item_count === 7)

    // b5: AI-visibility questions.
    const qc = s.fakes.questions.calls[0]
    const niche = String(t.project_profiles[0]?.niche ?? '')
    const audiences = t.project_audiences.map((a) => String(a.label))
    check("b5: from the profile's niche and audiences", !!qc && niche.length > 0 && audiences.length > 0 && [niche, ...audiences].every((x) => qc.scope.allowedTopics.includes(x)),
      JSON.stringify(qc?.scope.allowedTopics))
    check('…fifteen candidates asked, in the project language', qc?.count === 15 && qc?.language === normalizeLanguage(t.projects[0].language as string | null))
    const write = s.fakes.cache.calls[0]
    const context = write?.[2]
    check("…written to the suggestion cache in the AI-visibility tab's own context",
      s.fakes.cache.calls.length === 1 && write[0] === PROJECT && context?.projectId === PROJECT && context?.language === normalizeLanguage(t.projects[0].language as string | null)
      && context?.country === ((t.projects[0].country as string | null) || null) && context?.businessCategory === null && context?.keywordsHash === null,
      JSON.stringify(context))
    const written = (write?.[1] ?? []) as { question: string }[]
    check('duplicates and a country code in place of a name are dropped; twelve at most',
      written.length === 12 && !written.some((q) => q.question === ISO_LEAK_QUESTION) && new Set(written.map((q) => q.question)).size === written.length, String(written.length))
    check('suggestions only: no tracked prompt is created', (t.ai_prompts ?? []).length === 0)
    check('b5 item count = suggestions kept', stepRow(t, 'b5').item_count === 12)

    // b6: the first rank check.
    check('b6: exactly the keywords `continue` added are checked, through the scan route',
      JSON.stringify(s.fakes.rank.calls) === JSON.stringify([{ projectId: PROJECT, targetId: 't1' }, { projectId: PROJECT, targetId: 't2' }]) && stepRow(t, 'b6').item_count === 2)

    // Owners, logs.
    const offenders = s.audit.offenders(USER)
    check('every service-role query the scan makes filters by the owner, or writes rows that carry them', offenders.length === 0, offenders.join('; '))
    const tablesSeen = new Set(s.audit.ours().map((q) => q.table))
    check('…the audit saw the scan\'s own queries on every table it touches',
      ['project_seed_runs', 'project_seed_steps', 'projects', 'project_profiles', 'project_audiences', 'site_crawl_index', 'keyword_research_cache'].every((x) => tablesSeen.has(x)),
      [...tablesSeen].join(','))
    check('logs: one line per step, then the run', (output.match(/\[seed-scan\] step /g) ?? []).length === 6 && output.includes('[seed-scan] run finished'))
    check('provider text is nowhere: not in a row, not in a log line', !JSON.stringify(t).includes(SECRET) && !output.includes(SECRET))
  }

  // ── 2. robots.txt keeps us out ────────────────────────────────────────────
  console.log('\n2) robots.txt that keeps our crawler out entirely')
  for (const [who, robots] of [
    ['our product token', `User-agent: GoTopFreeCheck\nDisallow: /\n\nUser-agent: *\nDisallow: /wp-admin/\n\nSitemap: ${BASE}/wp-sitemap.xml\n`],
    ['every crawler (*)', `User-agent: *\nDisallow: /\n\nSitemap: ${BASE}/wp-sitemap.xml\n`],
  ] as const) {
    const s = await setupB({ robots })
    const { value } = await s.run()
    check(`disallowed for ${who}: b1 skipped crawl_disallowed and NOT ONE request`,
      stepRow(s.tables, 'b1').status === 'skipped' && stepRow(s.tables, 'b1').error_code === 'crawl_disallowed' && s.b1().length === 0, `${statusLine(s.tables)} ${s.b1().length}`)
    check('…no site index is written; the rest of stage B runs', (s.tables.site_crawl_index ?? []).length === 0
      && B_STEPS.slice(1).every((st) => ['done', 'skipped', 'failed'].includes(String(stepRow(s.tables, st).status))) && value.outcome === 'finished', statusLine(s.tables))
  }

  // ── 3. A claimed run ──────────────────────────────────────────────────────
  console.log('\n3) A claimed run: stage A read nothing, so b1 reads robots.txt first')
  {
    const s = await setupB({ claim: true })
    await s.run()
    const urls = s.b1().map((r) => r.url)
    check('stage A of a claimed run read nothing', s.afterA === 0)
    check('b1 reads robots.txt FIRST — nothing before the rules are known', urls[0] === `${BASE}/robots.txt`, urls.slice(0, 3).join(' '))
    check('…then the home page, where the free check ended', urls[1] === HE_WP.home, urls[1])
    check('…every request on the host, none disallowed, ≤25 page reads',
      urls.every((u) => new URL(u).hostname === 'www.plumber-tlv.co.il') && disallowedHit(urls).length === 0
      && urls.filter((u) => !pathOf(u).endsWith('.xml') && pathOf(u) !== '/robots.txt').length <= MAX_KEY_PAGES, disallowedHit(urls).join(','))
    const b1d = detailOf(s.tables, 'b1')
    check('b1 done: the home page counts among the 25 reads', stepRow(s.tables, 'b1').status === 'done' && b1d.pagesRead === 25 && (s.tables.site_crawl_index ?? []).length === 1,
      JSON.stringify({ st: stepRow(s.tables, 'b1').status, r: b1d.pagesRead }))
  }

  // ── 3b. More sitemaps than a run may read ─────────────────────────────────
  console.log('\n3b) robots.txt names more sitemaps than a run may read')
  {
    // Two more indexes of five children each: nineteen documents in all, the
    // fallback /sitemap.xml included, where the cap allows six. The engine
    // itself skips the index's off-host child (09ee926), so it is not among
    // the six; the sixth is the first extra index, and nothing after it —
    // its children, the second extra index, the fallback — is requested.
    const s = await setupB({ sitemapIndexes: 2 })
    await s.run()
    const urls = s.b1().map((r) => r.url)
    const sitemapReads = urls.filter((u) => pathOf(u).endsWith('.xml'))
    const b1d = detailOf(s.tables, 'b1')
    const pastTheCap = (u: string) => /\/sitemap-extra-\d+-\d+\.xml$/.test(u) || pathOf(u) === '/sitemap-extra-2.xml' || pathOf(u) === '/sitemap.xml'
    check(`b1 requests ${MAX_SITEMAP_DOCS} sitemap documents and no more: nothing past the sixth`,
      b1d.sitemapDocs === MAX_SITEMAP_DOCS && sitemapReads.length === MAX_SITEMAP_DOCS && !sitemapReads.some(pastTheCap) && !sitemapReads.some((u) => /evil-sitemaps/.test(u)),
      `${JSON.stringify(b1d.sitemapDocs)} ${sitemapReads.map((u) => pathOf(u)).join(',')}`)
    check('…and b1 still reads its 25 pages and finishes done', stepRow(s.tables, 'b1').status === 'done' && b1d.pagesRead === MAX_KEY_PAGES, statusLine(s.tables))
  }

  // ── 3c. A page whose body never finishes ──────────────────────────────────
  console.log('\n3c) A key page whose body never finishes is a failed read, not half a page')
  {
    const STALLED = `${BASE}/services/boilers`
    const s = await setupB({ routes: { [STALLED]: { status: 200, stallBody: true, headers: { 'content-type': 'text/html; charset=utf-8' } } } })
    const t0 = Date.now()
    await s.run({ budgets: { pageMs: 200 } })
    const ms = Date.now() - t0
    const b1d = detailOf(s.tables, 'b1')
    const targets = ((s.tables.site_crawl_index ?? [])[0]?.targets ?? []) as { targetUrl?: string }[]
    check('the stalled page was requested, and cut at its deadline', s.b1().some((r) => r.url === STALLED) && ms < 5_000, `${ms}ms`)
    check('…counted as a failed read (4: the three of the site, and this one), b1 still done',
      stepRow(s.tables, 'b1').status === 'done' && b1d.pagesFailed === 4 && b1d.pagesRead === MAX_KEY_PAGES, JSON.stringify({ r: b1d.pagesRead, f: b1d.pagesFailed }))
    check('…and not in the site index: what arrived before the deadline is not the page',
      targets.length > 0 && !targets.some((x) => String(x.targetUrl ?? '').startsWith(STALLED)), String(targets.length))
  }

  // ── 4. Keyword ideas: the cache, failures, markets, competitors ───────────
  console.log('\n4) b2 and b3: the cache, Google Ads failures, the market, no competitors')
  {
    // A second run of the same project within the cache's 30 days.
    const s = await setupB()
    await s.run()
    const clk = clock()
    clk.advance(2 * 24 * 60 * 60 * 1000)
    const web = recordingNet(crawlSite())
    const second = await finishedStageA(s.admin, { fetch: web.fetch }, clk.now)
    const lease = await continued(s.admin, second, clk.now(), [])
    const fakes = standardFakes()
    await captureConsole(() => runSeedStage({ admin: s.admin, scope: SCOPE, runId: second, lease, stageB: depsOf(fakes, web.fetch, clk.now) }))
    check('a rescan within the cache TTL: b2 and b3 read the cache and call Google Ads ZERO times',
      fakes.ideas.calls.length === 0 && stepRow(s.tables, 'b2', second).status === 'done' && stepRow(s.tables, 'b3', second).status === 'done', statusLine(s.tables, second))
    const calls = ((detailOf(s.tables, 'b2', second).result as Row)?.calls ?? []) as Row[]
    check('…every seed answered from the cache, the same keywords kept', calls.length === 3 && calls.every((c) => c.source === 'cache')
      && stepRow(s.tables, 'b2', second).item_count === stepRow(s.tables, 'b2', s.runId).item_count)
  }
  {
    const s = await setupB({ fakes: { ideas: fakeIdeas(() => Promise.reject(new GoogleAdsError('not_configured'))) } })
    const { value } = await s.run()
    check('Google Ads not configured: b2 and b3 fail keyword_ideas_unavailable after their three calls each',
      stepRow(s.tables, 'b2').error_code === 'keyword_ideas_unavailable' && stepRow(s.tables, 'b3').error_code === 'keyword_ideas_unavailable' && s.fakes.ideas.calls.length === 6,
      statusLine(s.tables))
    check('…the run carries on and ends partial with that code; nothing is cached',
      value.outcome === 'finished' && value.status === 'partial' && value.errorCode === 'keyword_ideas_unavailable' && stepRow(s.tables, 'b6').status === 'done'
      && seedRows(s.tables, 'seed:').length === 0, JSON.stringify(value))
  }
  {
    const s = await setupB({ fakes: { ideas: fakeIdeas(() => Promise.reject(new GoogleAdsError('rate_limit_exceeded'))) } })
    await s.run()
    check('rate limited: keyword_ideas_rate_limited', stepRow(s.tables, 'b2').error_code === 'keyword_ideas_rate_limited', statusLine(s.tables))
  }
  {
    const s = await setupB({
      fakes: {
        ideas: fakeIdeas((input: KeywordIdeasInput) =>
          input.researchType === 'site' && input.site === HE_WP.key ? Promise.reject(new GoogleAdsError('invalid_request', { apiMessage: SECRET })) : ideaRows(input)),
      },
    })
    const { output } = await s.run()
    const calls = ((detailOf(s.tables, 'b2').result as Row)?.calls ?? []) as Row[]
    check('one of three seeds fails: b2 is done with the other two, the failure is a code on its seed',
      stepRow(s.tables, 'b2').status === 'done' && calls.find((c) => c.seed === 'site')?.code === 'keyword_ideas_failed' && calls.filter((c) => c.ok).length === 2,
      JSON.stringify(calls))
    check('…no row for the failed seed; its message is nowhere', seedRows(s.tables, 'seed:site:').length === 0 && !JSON.stringify(s.tables).includes(SECRET) && !output.includes(SECRET))
  }
  {
    const s = await setupB()
    s.tables.projects[0].country = 'ZZ'
    await s.run()
    check('a market Google Ads does not know: b2 and b3 skipped market_unsupported, zero calls',
      stepRow(s.tables, 'b2').error_code === 'market_unsupported' && stepRow(s.tables, 'b3').error_code === 'market_unsupported'
      && stepRow(s.tables, 'b2').status === 'skipped' && s.fakes.ideas.calls.length === 0, statusLine(s.tables))
  }
  {
    const s = await setupB()
    const summary = runRow(s.tables).summary as { competitors: { validated: boolean }[] }
    for (const c of summary.competitors) c.validated = false
    await s.run()
    check('no validated competitor: b3 skipped no_validated_competitors, only b2 calls Google Ads',
      stepRow(s.tables, 'b3').status === 'skipped' && stepRow(s.tables, 'b3').error_code === 'no_validated_competitors' && s.fakes.ideas.calls.length === 3, statusLine(s.tables))
  }
  {
    const s = await setupB()
    const { value, output } = await s.run({ siteVocabulary: async () => { throw new Error(SECRET) } })
    check('a step that throws is failed internal_error; the run carries on',
      stepRow(s.tables, 'b2').error_code === 'internal_error' && stepRow(s.tables, 'b4').status === 'done' && value.outcome === 'finished' && value.status === 'partial', statusLine(s.tables))
    check('…the log names the error class only', output.includes('[seed-scan] step threw') && !output.includes(SECRET))
  }

  // ── 5. b4: the content plan ───────────────────────────────────────────────
  console.log('\n5) b4: the engine route, and what its answers mean')
  {
    const v = (status: number, body: unknown = {}) => {
      const r = contentVerdict({ status, body })
      return `${r.status}:${r.code ?? '-'}:${r.topics}`
    }
    const table = [
      [v(200, { meta: { newlyAddedCount: 5 } }), 'done:-:5'],
      [v(401), 'skipped:content_session_required:0'],
      [v(402), 'skipped:content_entitlement_required:0'],
      [v(403), 'skipped:content_entitlement_required:0'],
      [v(404, { error: 'Not found' }), 'skipped:content_engine_disabled:0'],
      [v(404, { error: 'Project not found' }), 'failed:content_engine_failed:0'],
      [v(409), 'failed:content_engine_busy:0'],
      [v(502), 'failed:content_engine_unavailable:0'],
      [v(503), 'failed:content_engine_unavailable:0'],
      [v(500, { error: SECRET }), 'failed:content_engine_failed:0'],
    ]
    check('the route\'s status decides the verdict; only a count is read from its body', table.every(([a, b]) => a === b), JSON.stringify(table.filter(([a, b]) => a !== b)))
    check('the scan route likewise (b6): 200 ok, 401 session, 403 quota, 504 timeout, anything else failed',
      [rankVerdict({ status: 200, body: {} }), rankVerdict({ status: 401, body: {} }), rankVerdict({ status: 403, body: {} }), rankVerdict({ status: 504, body: {} }), rankVerdict({ status: 500, body: { error: SECRET } })].join(',')
      === ',rank_check_session_required,rank_check_quota,rank_check_timeout,rank_check_failed')
  }
  {
    const s = await setupB()
    const { value } = await s.run({ contentPlan: null, rankCheck: null })
    check('without the merchant\'s session (the cron): b4 skipped content_session_required, b6 skipped rank_check_session_required, nothing asked',
      stepRow(s.tables, 'b4').error_code === 'content_session_required' && stepRow(s.tables, 'b6').error_code === 'rank_check_session_required'
      && s.fakes.content.calls.length === 0 && s.fakes.rank.calls.length === 0 && value.outcome === 'finished' && value.status === 'done', statusLine(s.tables))
  }
  {
    const s = await setupB({ fakes: { content: fakeRoute<{ projectId: string; runId: string }>(() => Promise.reject(new Error(SECRET))) } })
    const { output } = await s.run()
    check('the engine route throws: b4 failed content_engine_failed, nothing of it kept or logged',
      stepRow(s.tables, 'b4').error_code === 'content_engine_failed' && !JSON.stringify(s.tables).includes(SECRET) && !output.includes(SECRET), statusLine(s.tables))
  }
  {
    const s = await setupB({ fakes: { content: fakeRoute<{ projectId: string; runId: string }>(() => new Promise(() => undefined)) } })
    await s.run({ budgets: { contentMs: 50 } })
    check('the engine route hangs: b4 failed content_engine_timeout at its budget', stepRow(s.tables, 'b4').error_code === 'content_engine_timeout', statusLine(s.tables))
  }

  // ── 6. b5: AI-visibility questions ────────────────────────────────────────
  console.log('\n6) b5: when the questions are not asked, or fail')
  {
    const s = await setupB()
    await s.run({ env: { GEMINI_API_KEY: 'qa-key' } })
    check('AI visibility off: b5 skipped ai_visibility_disabled, no model call', stepRow(s.tables, 'b5').error_code === 'ai_visibility_disabled' && s.fakes.questions.calls.length === 0)
  }
  {
    const s = await setupB()
    await s.run({ env: { ENABLE_AI_VISIBILITY: 'true' } })
    check('no model key: b5 skipped questions_unavailable, no model call', stepRow(s.tables, 'b5').error_code === 'questions_unavailable' && s.fakes.questions.calls.length === 0)
  }
  {
    const s = await setupB()
    s.tables.project_profiles.length = 0
    s.tables.project_audiences.length = 0
    await s.run()
    check('no niche and no audiences: b5 skipped no_business_profile, no model call', stepRow(s.tables, 'b5').error_code === 'no_business_profile' && s.fakes.questions.calls.length === 0)
  }
  {
    const s = await setupB({ fakes: { questions: fakeQuestions([]) } })
    await s.run()
    check('the model answers nothing: b5 failed questions_failed, nothing written', stepRow(s.tables, 'b5').error_code === 'questions_failed' && s.fakes.cache.calls.length === 0)
  }
  {
    const s = await setupB({ fakes: { questions: fakeQuestions(() => Promise.reject(new Error(SECRET))) } })
    const { output } = await s.run()
    check('the model call throws with provider text: questions_failed, the text nowhere',
      stepRow(s.tables, 'b5').error_code === 'questions_failed' && !JSON.stringify(s.tables).includes(SECRET) && !output.includes(SECRET))
  }
  {
    const s = await setupB({ fakes: { questions: fakeQuestions(() => new Promise(() => undefined)) } })
    await s.run({ budgets: { questionsMs: 50 } })
    check('the model hangs: b5 failed questions_timeout at its budget', stepRow(s.tables, 'b5').error_code === 'questions_timeout')
  }
  {
    const s = await setupB({ fakes: { cache: fakeSuggestionCache(() => ({ success: false, contextHash: 'ctx', rowsAttempted: 12, rowsInserted: 0, rowsAlreadyPresent: 0, rowsVisibleAfterWrite: 0, errorCode: 'db', errorMessage: SECRET, sampleQuestionHashes: [] })) } })
    const { output } = await s.run()
    check('the suggestion cache refuses: b5 failed questions_write_failed, its message nowhere',
      stepRow(s.tables, 'b5').error_code === 'questions_write_failed' && !JSON.stringify(s.tables).includes(SECRET) && !output.includes(SECRET))
  }

  // ── 7. b6: the first rank check ───────────────────────────────────────────
  console.log('\n7) b6: which keywords, the quota, and nothing added')
  {
    const s = await setupB({ targets: [] })
    const { value } = await s.run()
    check('no keyword added: b6 skipped no_keywords_added, no check; the run is done',
      stepRow(s.tables, 'b6').status === 'skipped' && stepRow(s.tables, 'b6').error_code === 'no_keywords_added' && s.fakes.rank.calls.length === 0 && value.outcome === 'finished' && value.status === 'done')
  }
  {
    const s = await setupB({ targets: [], tracking: { requested: 2, added: 0, code: 'keyword_quota_exceeded' } })
    const { value } = await s.run()
    check("the keyword limit refused them: b6 skipped keyword_quota_exceeded — the reason stays visible; the run is done",
      stepRow(s.tables, 'b6').status === 'skipped' && stepRow(s.tables, 'b6').error_code === 'keyword_quota_exceeded' && s.fakes.rank.calls.length === 0 && value.outcome === 'finished' && value.status === 'done',
      statusLine(s.tables))
  }
  {
    const s = await setupB({ targets: [], tracking: { requested: 2, added: 0, code: 'keywords_add_failed' } })
    const { value } = await s.run()
    check('adding them failed: b6 failed keywords_add_failed; the run is partial',
      stepRow(s.tables, 'b6').status === 'failed' && stepRow(s.tables, 'b6').error_code === 'keywords_add_failed' && value.outcome === 'finished' && value.status === 'partial')
  }
  {
    const s = await setupB({ fakes: { rank: fakeRoute<{ projectId: string; targetId: string }>(() => ({ status: 403, body: { error: 'QUOTA_KEYWORD_CHECKS' } })) } })
    await s.run()
    check('no check allowance left: b6 skipped rank_check_quota after ONE refused check',
      stepRow(s.tables, 'b6').status === 'skipped' && stepRow(s.tables, 'b6').error_code === 'rank_check_quota' && s.fakes.rank.calls.length === 1, statusLine(s.tables))
  }
  {
    let n = 0
    const s = await setupB({ fakes: { rank: fakeRoute<{ projectId: string; targetId: string }>(() => (n++ === 0 ? { status: 200, body: {} } : { status: 403, body: {} })) } })
    await s.run()
    check('the allowance runs out after the first: b6 failed rank_check_quota with one keyword checked',
      stepRow(s.tables, 'b6').status === 'failed' && stepRow(s.tables, 'b6').error_code === 'rank_check_quota' && stepRow(s.tables, 'b6').item_count === 1)
  }
  {
    const s = await setupB({ fakes: { rank: fakeRoute<{ projectId: string; targetId: string }>(() => ({ status: 500, body: { error: SECRET } })) } })
    const { output } = await s.run()
    check('the scan route fails with provider text: rank_check_failed, the text nowhere',
      stepRow(s.tables, 'b6').error_code === 'rank_check_failed' && !JSON.stringify(s.tables).includes(SECRET) && !output.includes(SECRET))
  }
  {
    // The route's work window closes between the two checks.
    const s = await setupB({ fakes: { rank: fakeRoute<{ projectId: string; targetId: string }>(() => ({ status: 200, body: {} })) } })
    const start = s.clk.now().getTime()
    const rank = s.fakes.rank.fn
    await s.run({
      budgets: { contentMs: 1_000 },
      rankCheck: async (input) => {
        s.clk.advance(10_000)
        return rank(input)
      },
    }, start + 55_000)
    check('no time for another check: b6 stops with the rest unchecked (rank_check_timeout), the first one counted',
      stepRow(s.tables, 'b6').error_code === 'rank_check_timeout' && stepRow(s.tables, 'b6').item_count === 1 && s.fakes.rank.calls.length === 1, statusLine(s.tables))
  }

  // ── 8. Every step saved on its own; a resumed run ─────────────────────────
  console.log('\n8) Each step is saved on its own; a resumed run starts at the first unfinished step')
  {
    // The worker dies as b3 begins (at its vocabulary read, before any spend).
    const snap = snapshotter()
    let vocabCalls = 0
    const s = await setupB()
    snap.watch(s.tables)
    await s.run({
      siteVocabulary: async (...args: Parameters<typeof buildSiteVocabulary>) => {
        if (vocabCalls++ === 1) snap.take()
        return buildSiteVocabulary(...args)
      },
    })
    const dead = snap.get()!
    check('at that moment: b1 and b2 done with their counts, b3 running, b4-b6 pending',
      statusLine(dead) === 'b1:done b2:done b3:running b4:pending b5:pending b6:pending' && stepRow(dead, 'b1').item_count === 22 && stepRow(dead, 'b2').item_count === 3,
      statusLine(dead))
    check("…b1's index and b2's research are already saved", (dead.site_crawl_index ?? []).length === 1 && seedRows(dead, 'seed:').length === 3)

    const early = await resumeFrom(dead, s.runId, { advanceMs: 0 })
    check('a resume while the lease is live takes nothing: not_running, not one call',
      early.res.value.outcome === 'stopped' && (early.res.value as { reason: string }).reason === 'not_running'
      && statusLine(early.tables) === statusLine(dead) && early.fakes.ideas.calls.length === 0 && early.web.log.length === 0)

    const late = await resumeFrom(dead, s.runId)
    check('once the lease has lapsed, the run is taken and finished', late.res.value.outcome === 'finished' && late.res.value.status === 'done' && statusLine(late.tables) === ALL_DONE,
      `${JSON.stringify(late.res.value)} ${statusLine(late.tables)}`)
    check('…from b3: no page read again, b2 not asked again, b3 asks its three competitors',
      late.web.log.length === 0 && late.fakes.ideas.calls.length === 3 && late.fakes.ideas.calls.every((c) => c.researchType === 'site' && c.site !== HE_WP.key),
      `${late.web.log.length} ${late.fakes.ideas.calls.map((c) => c.site).join(',')}`)
    check("…b1's and b2's saved results untouched", stepRow(late.tables, 'b1').finished_at === stepRow(dead, 'b1').finished_at && stepRow(late.tables, 'b2').finished_at === stepRow(dead, 'b2').finished_at)
    check('…every query of the resumed worker names the owner', late.audit.offenders(USER).length === 0, late.audit.offenders(USER).join('; '))
  }

  // The worker dies after a step's spend mark, while it spends: the resumed
  // step does not spend again, and says so.
  const killCases: { name: string; code: string; arm: (s: Awaited<ReturnType<typeof setupB>>, take: () => void) => Partial<Fakes> | null; after?: (late: Awaited<ReturnType<typeof resumeFrom>>) => [string, boolean, string?][] }[] = [
    {
      name: 'b1, while reading pages',
      code: 'crawl_interrupted',
      arm: (s, take) => {
        s.web.hooks.push(() => take())
        return null
      },
      after: (late) => [['…not one page read again', late.web.log.length === 0, String(late.web.log.length)]],
    },
    {
      name: 'b2, while Google Ads answers',
      code: 'keyword_ideas_interrupted',
      arm: (_s, take) => ({ ideas: fakeIdeas((input: KeywordIdeasInput) => { take(); return ideaRows(input) }) }),
      after: (late) => [['…b2 calls Google Ads ZERO more times (b3, not yet begun, asks its three)',
        late.fakes.ideas.calls.length === 3 && late.fakes.ideas.calls.every((c) => c.site !== HE_WP.key && c.researchType === 'site'), late.fakes.ideas.calls.map((c) => c.researchType).join(',')]],
    },
    {
      name: 'b4, while the engine works',
      code: 'content_engine_interrupted',
      arm: (_s, take) => ({ content: fakeRoute<{ projectId: string; runId: string }>(() => { take(); return { status: 200, body: { meta: { newlyAddedCount: 7 } } } }) }),
      after: (late) => [['…the engine is not asked again', late.fakes.content.calls.length === 0]],
    },
    {
      name: 'b5, while the model answers',
      code: 'questions_interrupted',
      arm: (_s, take) => ({ questions: fakeQuestions(async () => { take(); return [] }) }),
      after: (late) => [['…the model is not asked again', late.fakes.questions.calls.length === 0]],
    },
    {
      name: 'b6, between two rank checks',
      code: 'rank_check_interrupted',
      arm: (_s, take) => {
        let n = 0
        return { rank: fakeRoute<{ projectId: string; targetId: string }>(() => { if (n++ === 1) take(); return { status: 200, body: {} } }) }
      },
      after: (late) => [
        ['…no keyword checked again, the one already checked still counted', late.fakes.rank.calls.length === 0 && stepRow(late.tables, 'b6').item_count === 1, String(stepRow(late.tables, 'b6').item_count)],
      ],
    },
  ]
  for (const k of killCases) {
    const snap = snapshotter()
    let armed: Partial<Fakes> | null = null
    const s = await setupB({ fakes: {} })
    snap.watch(s.tables)
    armed = k.arm(s, snap.take)
    if (armed) Object.assign(s.fakes, armed)
    await s.run()
    const dead = snap.get()
    const step = k.name.slice(0, 2)
    check(`killed in ${k.name}: the step was marked before it spent`, !!dead && stepRow(dead, step).status === 'running' && (stepRow(dead, step).detail as Row)?.attempted === true,
      dead ? JSON.stringify(stepRow(dead, step).detail).slice(0, 200) : 'no snapshot')
    if (!dead) continue
    const late = await resumeFrom(dead, s.runId)
    const value = late.res.value
    check(`…resumed: ${step} failed ${k.code}, and the run still finishes (partial)`,
      stepRow(late.tables, step).status === 'failed' && stepRow(late.tables, step).error_code === k.code && value.outcome === 'finished' && value.status === 'partial',
      `${statusLine(late.tables)} ${JSON.stringify(value)}`)
    for (const [name, ok, detail] of k.after?.(late) ?? []) check(name, ok, detail)
  }

  // The worker's lease lapses while b1 reads pages and another worker takes
  // the run: the fence after the step (a lease renewal) stops the old worker
  // before it writes b1's outcome over the new worker's run.
  {
    const s = await setupB()
    const taken = new Date(s.clk.now().getTime() + STAGE_B_LEASE_MS + 5 * 60_000).toISOString()
    s.web.hooks.push(() => {
      runRow(s.tables).lease_expires_at = taken
    })
    const { value } = await s.run()
    check('a worker that lost its lease during b1 stops at the fence after it: lease_lost',
      value.outcome === 'stopped' && (value as { reason: string }).reason === 'lease_lost', JSON.stringify(value))
    check("…b1's outcome is not written by it (still running), b2 not begun, the new worker's lease untouched",
      stepRow(s.tables, 'b1').status === 'running' && stepRow(s.tables, 'b2').status === 'pending' && runRow(s.tables).status === 'running'
      && runRow(s.tables).lease_expires_at === taken && s.fakes.ideas.calls.length === 0,
      `${statusLine(s.tables)} ${String(runRow(s.tables).lease_expires_at)}`)
  }

  // ── 9. The time cap ───────────────────────────────────────────────────────
  console.log('\n9) The time cap: the run is handed back before a step that could not finish')
  {
    const s = await setupB()
    const start = s.clk.now().getTime()
    const slowFetch: typeof fetch = async (input, init) => {
      s.clk.advance(2_000)
      return s.web.fetch(input, init)
    }
    const { value, output } = await s.run({ fetchImpl: slowFetch }, start + 60_000)
    check('b1 finishes; before b2 the window is too short: stopped time_cap',
      value.outcome === 'stopped' && (value as { reason: string }).reason === 'time_cap' && stepRow(s.tables, 'b1').status === 'done' && stepRow(s.tables, 'b2').status === 'pending',
      `${JSON.stringify(value)} ${statusLine(s.tables)}`)
    check('…the lease is handed back at once and the run stays running, for the cron', runRow(s.tables).status === 'running' && runRow(s.tables).lease_expires_at === null)
    check('…one log line says so', output.includes('[seed-scan] run stopped') && output.includes('time_cap'))
    const late = await resumeFrom(structuredClone(s.tables), s.runId, { advanceMs: 61_000 })
    check('the next worker takes it at once and continues from b2 — no page read again',
      late.res.value.outcome === 'finished' && statusLine(late.tables) === ALL_DONE && late.web.log.length === 0 && late.fakes.ideas.calls.length === 6,
      `${JSON.stringify(late.res.value)} ${statusLine(late.tables)}`)
  }

  // ── 10. Provider text, through the real libraries ─────────────────────────
  console.log('\n10) Provider text never reaches a row, a result or a log line — the real Google Ads and Gemini libraries too')
  {
    const saved = { fetch: globalThis.fetch, env: { ...process.env } }
    const bodies: Row[] = []
    const stub = (mode: 'ok' | 'api_error' | 'oauth_error'): typeof fetch =>
      async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
        if (url.startsWith('https://oauth2.googleapis.com/')) {
          return mode === 'oauth_error'
            ? Response.json({ error: 'invalid_grant', error_description: SECRET }, { status: 400 })
            : Response.json({ access_token: 'qa-access-token' })
        }
        if (url.startsWith('https://googleads.googleapis.com/')) {
          bodies.push(JSON.parse(String(init?.body ?? '{}')))
          if (mode === 'api_error') return Response.json({ error: { message: SECRET, status: 'INVALID_ARGUMENT' } }, { status: 400 })
          return Response.json({ results: [{ text: 'אינסטלטור בתל אביב', keywordIdeaMetrics: { avgMonthlySearches: '1600', competition: 'MEDIUM' } }] })
        }
        if (url.includes('generativelanguage.googleapis.com')) throw new Error(SECRET)
        throw new Error(`unexpected request ${url}`)
      }
    Object.assign(process.env, {
      GOOGLE_ADS_CLIENT_ID: 'qa-client',
      GOOGLE_ADS_CLIENT_SECRET: 'qa-client-secret',
      GOOGLE_ADS_DEVELOPER_TOKEN: 'qa-developer-token',
      GOOGLE_ADS_REFRESH_TOKEN: 'qa-refresh-token',
      GOOGLE_ADS_CUSTOMER_ID: '1234567890',
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: '1234567890',
      GEMINI_API_KEY: 'qa-gemini-key',
    })
    try {
      globalThis.fetch = stub('ok')
      const ideas = await captureConsole(() =>
        generateKeywordIdeas({ researchType: 'site', keywords: [], site: HE_WP.key, country: 'IL', language: 'he', minMonthlySearches: 30, resultsLimit: 250 }))
      check("a 'site' request carries siteSeed { site } and no other seed", bodies.length === 1 && (bodies[0].siteSeed as Row)?.site === HE_WP.key
        && !('urlSeed' in bodies[0]) && !('keywordSeed' in bodies[0]) && !('keywordAndUrlSeed' in bodies[0]) && ideas.value.results.length === 1, JSON.stringify(bodies[0]))

      for (const mode of ['api_error', 'oauth_error'] as const) {
        globalThis.fetch = stub(mode)
        const s = await setupB({ targets: [] })
        // The live Google Ads and question libraries: no keywordIdeas, no questions fake.
        const { output } = await s.run({ keywordIdeas: undefined, questions: undefined })
        const expected = mode === 'api_error' ? 'keyword_ideas_failed' : 'keyword_ideas_unavailable'
        check(`Google Ads ${mode === 'api_error' ? 'refuses the request' : 'refuses the credentials'} with provider text: b2 and b3 fail ${expected}`,
          stepRow(s.tables, 'b2').error_code === expected && stepRow(s.tables, 'b3').error_code === expected, statusLine(s.tables))
        check('…the Gemini call fails too (questions_failed)', stepRow(s.tables, 'b5').error_code === 'questions_failed', statusLine(s.tables))
        check('…and the provider text is in no row and no log line, the libraries\' own lines included',
          !JSON.stringify(s.tables).includes(SECRET) && !output.includes(SECRET) && output.includes('[Gemini Enrichment] Generation failed'),
          output.split('\n').filter((l) => l.includes(SECRET)).join(' | ').slice(0, 300))
      }
    } finally {
      globalThis.fetch = saved.fetch
      for (const key of Object.keys(process.env)) if (!(key in saved.env)) delete process.env[key]
      Object.assign(process.env, saved.env)
    }
  }

  finish()
  // The Gemini SDK leaves its 60-second request timer armed after a failed
  // call (section 10: two of them, and nothing else is pending). Exit now
  // rather than wait a minute for it.
  process.exit(0)
}

main().catch((err) => {
  console.error('suite crashed', err)
  process.exit(1)
})
export {}
