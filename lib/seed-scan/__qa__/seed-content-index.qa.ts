/**
 * The site index the recommendation engine reads (lib/content/content-index.ts):
 * the WordPress index when WordPress is connected and that index has targets,
 * else the seeding scan's crawl index (site_crawl_index, written by b1), read
 * for the project's owner only.
 *
 * 1) getContentIndex against a FakeAdmin: each connection state, with and
 *    without a WordPress row and a crawl row, the owner filter, failed reads.
 * 2) The real engine (generateFromBriefs, offline against the fixture Gemini
 *    server of lib/content/__qa__/_reco-harness): for a WordPress project, a
 *    crawl index next to it changes NOTHING — suggestions and the full
 *    diagnostics are byte-identical and the crawl table is not even read; the
 *    same for a Shopify-synced project (its callers add the store's entities
 *    themselves: a crawl of that storefront would count its pages twice); for
 *    a project with neither, the crawl index is what it reads, and another
 *    account's crawl row is not.
 * 3) Source guard: every read of the site index in the recommendation engine
 *    goes through getContentIndex (no getCachedIndex left in its five files),
 *    with a mutation control.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-content-index.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { fakeAdmin, genTitle, startFakeGenai } from '@/lib/content/__qa__/_reco-harness'
import { getContentIndex, getCrawlIndex } from '@/lib/content/content-index'
import { resetRecoGenAiClient } from '@/lib/content/recommendations/genai-client'
import { resetModelResolutionCache } from '@/lib/content/recommendations/model-availability'
import { makeChecker, OTHER_USER, PROJECT, USER } from './_fixtures'

const { check, finish } = makeChecker()

type Row = Record<string, unknown>
type Admin = Parameters<typeof getContentIndex>[2]

/** A ScannedTarget as the WordPress scanner (and b1) store it. */
const target = (url: string, title: string, type = 'page', eligibility = 'yes'): Row => ({
  targetUrl: url,
  targetType: type,
  targetTitle: title,
  inboundLinkCount: 0,
  eligibility,
  eligibilityReason: eligibility === 'yes' ? null : 'utility_page',
  targetRole: 'supporting',
  targetPriority: 'normal',
  keywordSource: 'title',
  primaryKeywordCandidate: title,
  keywordAvailable: true,
  usableAnchorsCount: 0,
  cautionAnchorsCount: 0,
  rejectedAnchorsCount: 0,
  onlyGenericAnchors: false,
  usableAnchors: [],
  cautionAnchors: [],
  rejectedAnchors: [],
  exampleSources: [],
  matchedGeneratedArticleId: null,
  matchedGeneratedArticleTitle: null,
  contentSkipped: false,
})

const indexRow = (id: string, projectId: string, userId: string, host: string, targets: Row[]): Row => ({
  id,
  project_id: projectId,
  user_id: userId,
  site_url: `https://${host}`,
  site_host: host,
  scan_status: 'complete',
  scanner_version: 'qa',
  scan_params: {},
  summary: {},
  targets,
  sample_links: [],
  warnings: {},
  error_message: null,
  scan_started_at: '2026-09-27T09:00:00.000Z',
  scan_completed_at: '2026-09-27T09:01:00.000Z',
  scan_duration_ms: 60_000,
  expires_at: '2026-10-27T09:01:00.000Z',
  created_at: '2026-09-27T09:00:00.000Z',
  updated_at: '2026-09-27T09:01:00.000Z',
})

// ── 1. getContentIndex ──────────────────────────────────────────────────────

const HOST = 'plumber-tlv.co.il'
const WP_TARGETS = [target(`https://${HOST}/services`, 'שירותי אינסטלציה', 'page')]
const CRAWL_TARGETS = [target(`https://${HOST}/about`, 'אודות', 'page'), target(`https://${HOST}/blog/post-1`, 'מדריך אינסטלציה', 'post')]
const wpRow = (targets: Row[] = WP_TARGETS) => indexRow('wp-row', PROJECT, USER, HOST, targets)
const crawlRow = (userId: string = USER) => indexRow(`crawl-${userId === USER ? 'owner' : 'other'}`, PROJECT, userId, HOST, CRAWL_TARGETS)

type Case = {
  name: string
  connection?: string
  wp?: Row
  crawl?: Row[]
  /** The project's owner in `projects`; null: no project row. */
  owner?: string | null
  /** What the caller passes; null: not known (read from the project). */
  userId: string | null
  hooks?: Record<string, unknown>
  /** The project's shopify_entities rows. */
  shopify?: Row[]
  want: string | null
  crawlRead?: boolean
}

function db(c: Case) {
  const tables: Record<string, Row[]> = {
    projects: c.owner === null ? [] : [{ id: PROJECT, user_id: c.owner ?? USER }],
    wordpress_connections: c.connection ? [{ project_id: PROJECT, connection_status: c.connection }] : [],
    wordpress_content_index: c.wp ? [c.wp] : [],
    site_crawl_index: c.crawl ?? [],
    shopify_entities: c.shopify ?? [],
  }
  const fake = new FakeAdmin(tables, (c.hooks ?? {}) as never)
  const reads: { table: string; eqs: [string, unknown][] }[] = []
  const from = fake.from.bind(fake)
  ;(fake as unknown as { from: (name: string) => unknown }).from = (name: string) => {
    const q = from(name) as unknown as { eq: (col: string, val: unknown) => unknown }
    const rec = { table: name, eqs: [] as [string, unknown][] }
    reads.push(rec)
    const eq = q.eq.bind(q)
    q.eq = (col: string, val: unknown) => {
      rec.eqs.push([col, val])
      return eq(col, val)
    }
    return q
  }
  return { admin: fake as unknown as Admin, reads }
}

const FAIL = { select: () => ({ code: 'XX000', message: 'read failed' }) }
const SHOPIFY_ENTITY: Row = { id: 'se1', project_id: PROJECT, is_active: true, title: 'שירותי אינסטלציה', handle: 'services', entity_type: 'page', canonical_url: `https://${HOST}/services` }

const CASES: Case[] = [
  { name: "WordPress 'connected' with targets, a crawl next to it → the WordPress row, the crawl not even read", connection: 'connected', wp: wpRow(), crawl: [crawlRow()], userId: USER, want: 'wp-row', crawlRead: false },
  { name: "WordPress 'untested' (how a WordPress-only project is saved) → the WordPress row", connection: 'untested', wp: wpRow(), crawl: [crawlRow()], userId: USER, want: 'wp-row', crawlRead: false },
  { name: "the connection 'failed' → the crawl", connection: 'failed', wp: wpRow(), crawl: [crawlRow()], userId: USER, want: 'crawl-owner' },
  { name: 'no connection row (WordPress disconnected) → the crawl', wp: wpRow(), crawl: [crawlRow()], userId: USER, want: 'crawl-owner' },
  { name: 'connected, but its index has no targets → the crawl', connection: 'connected', wp: wpRow([]), crawl: [crawlRow()], userId: USER, want: 'crawl-owner' },
  { name: 'connected, no WordPress row yet → the crawl', connection: 'connected', crawl: [crawlRow()], userId: USER, want: 'crawl-owner' },
  { name: 'the connection cannot be read → the WordPress row, as before', connection: 'connected', wp: wpRow(), crawl: [crawlRow()], userId: USER, hooks: { wordpress_connections: FAIL }, want: 'wp-row' },
  { name: "no WordPress; the only crawl row is another account's → nothing", crawl: [crawlRow(OTHER_USER)], userId: USER, want: null },
  { name: "owner not passed: read from the project → the owner's crawl, never the other account's", crawl: [crawlRow(OTHER_USER), crawlRow()], userId: null, want: 'crawl-owner' },
  { name: 'owner not passed and the project is gone → no crawl read at all', crawl: [crawlRow()], owner: null, userId: null, want: null, crawlRead: false },
  { name: 'a WordPress row without targets and no crawl → that row, as before', connection: 'connected', wp: wpRow([]), userId: USER, want: 'wp-row' },
  { name: 'nothing anywhere → null', userId: USER, want: null },
  { name: 'the crawl read fails → no index, never a throw', crawl: [crawlRow()], userId: USER, hooks: { site_crawl_index: FAIL }, want: null },
  { name: 'the WordPress read fails, a crawl exists → the crawl', connection: 'connected', wp: wpRow(), crawl: [crawlRow()], userId: USER, hooks: { wordpress_content_index: FAIL }, want: 'crawl-owner' },
  { name: 'a Shopify-synced project, no WordPress, a crawl → nothing, as before (the crawl not even read)', shopify: [SHOPIFY_ENTITY], crawl: [crawlRow()], userId: USER, want: null, crawlRead: false },
  { name: 'a Shopify-synced project whose WordPress row has no targets → that row, as before', shopify: [SHOPIFY_ENTITY], connection: 'connected', wp: wpRow([]), crawl: [crawlRow()], userId: USER, want: 'wp-row', crawlRead: false },
  { name: 'a Shopify-synced project with WordPress connected → the WordPress row, as before', shopify: [SHOPIFY_ENTITY], connection: 'connected', wp: wpRow(), crawl: [crawlRow()], userId: USER, want: 'wp-row', crawlRead: false },
  { name: 'Shopify entities all inactive → still no crawl', shopify: [{ ...SHOPIFY_ENTITY, is_active: false }], crawl: [crawlRow()], userId: USER, want: null, crawlRead: false },
  { name: 'shopify_entities cannot be read → no crawl (withheld, never a throw)', crawl: [crawlRow()], userId: USER, hooks: { shopify_entities: FAIL }, want: null, crawlRead: false },
  { name: "another project's Shopify entities do not withhold this project's crawl", shopify: [{ ...SHOPIFY_ENTITY, project_id: 'another-project' }], crawl: [crawlRow()], userId: USER, want: 'crawl-owner' },
]

async function part1() {
  console.log('1) getContentIndex: WordPress when connected and usable, else the crawl, for the owner only')
  const crawlReads: { table: string; eqs: [string, unknown][] }[] = []
  for (const c of CASES) {
    const { admin, reads } = db(c)
    let got: Row | null = null
    let threw = false
    try {
      got = (await getContentIndex(PROJECT, c.userId, admin)) as Row | null
    } catch {
      threw = true
    }
    const read = reads.some((r) => r.table === 'site_crawl_index')
    crawlReads.push(...reads.filter((r) => r.table === 'site_crawl_index'))
    check(c.name, !threw && ((got?.id as string | undefined) ?? null) === c.want && (c.crawlRead === undefined || read === c.crawlRead),
      `${threw ? 'threw' : String(got?.id ?? null)} crawl read ${read}`)
  }
  check('every read of site_crawl_index names the project AND its owner',
    crawlReads.length > 0 && crawlReads.every((r) => r.eqs.some(([c, v]) => c === 'project_id' && v === PROJECT) && r.eqs.some(([c, v]) => c === 'user_id' && v === USER)),
    JSON.stringify(crawlReads.map((r) => r.eqs)))
  {
    const { admin } = db({ name: '', crawl: [crawlRow(OTHER_USER)], userId: USER, want: null })
    check("getCrawlIndex for the owner does not return another account's row", (await getCrawlIndex(admin, PROJECT, USER)) === null && ((await getCrawlIndex(admin, PROJECT, OTHER_USER)) as Row | null)?.id === 'crawl-other')
  }
}

// ── 2. The engine, both ways ────────────────────────────────────────────────

const SHOP = 'natural-shop.co.il'
const ENGINE_OWNER = 'u1'

/** The engine suites' Hebrew health store, with an owner on its project row. */
function shopTables(): Record<string, Row[]> {
  return {
    projects: [{ id: 'p1', user_id: ENGINE_OWNER, business_name: 'הצמחייה', target_domain: `https://${SHOP}`, language: 'he', country: 'IL' }],
    tracking_targets: [{ project_id: 'p1', keyword: 'תוספי תזונה טבעיים' }],
    keyword_research_cache: [
      {
        project_id: 'p1',
        fetched_at: '2026-07-01',
        results_json: [
          { keyword: 'מגנזיום לילדים מינון', avgMonthlySearches: 320 },
          { keyword: 'איך לבחור אבקת חלבון', avgMonthlySearches: 210 },
          { keyword: 'אנזימי עיכול טבעיים', avgMonthlySearches: 140 },
          { keyword: 'יתרונות אומגה 3', avgMonthlySearches: 90 },
          { keyword: 'ויטמין C לילדים', avgMonthlySearches: 500 },
          { keyword: 'חיזוק מערכת החיסון בחורף', avgMonthlySearches: 170 },
        ],
      },
    ],
    shopify_entities: [],
    generated_articles: [{ project_id: 'p1', title: 'מגנזיום לשינה - המדריך המלא' }],
    article_topics: [],
    content_topic_ideas: [],
    wordpress_content_index: [],
    wordpress_connections: [],
    site_crawl_index: [],
  }
}

const SHOP_WP_TARGETS = [
  target(`https://${SHOP}/c/vitamins`, 'ויטמינים ומינרלים', 'category'),
  target(`https://${SHOP}/c/protein`, 'אבקות חלבון', 'category'),
  target(`https://${SHOP}/about`, 'אודות הצמחייה', 'page'),
]
const SHOP_CRAWL_TARGETS = [
  target(`https://${SHOP}/c/herbs`, 'צמחי מרפא', 'category'),
  target(`https://${SHOP}/blog/sleep`, 'שינה טובה בלי תרופות', 'post'),
  target(`https://${SHOP}/privacy`, 'מדיניות פרטיות', 'page', 'no'),
]

function withWordPress(t: Record<string, Row[]>, status = 'connected') {
  t.wordpress_content_index = [indexRow('wp-shop', 'p1', ENGINE_OWNER, SHOP, SHOP_WP_TARGETS)]
  t.wordpress_connections = [{ project_id: 'p1', connection_status: status }]
  return t
}
function withCrawl(t: Record<string, Row[]>, userId = ENGINE_OWNER) {
  t.site_crawl_index = [indexRow('crawl-shop', 'p1', userId, SHOP, SHOP_CRAWL_TARGETS)]
  return t
}

const respond = (briefs: { id: string; subject: string; aligned_query?: string }[]) =>
  briefs.map((b, i) => ({ briefId: b.id, skip: false, title: genTitle(b.subject, i), primaryKeyword: b.aligned_query ?? b.subject, secondaryKeywords: [], intent: 'informational' }))

/** Canonical JSON (sorted keys), so two runs compare by value. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const o = val as Record<string, unknown>
      return Object.keys(o)
        .sort()
        .reduce((acc, k) => {
          acc[k] = o[k]
          return acc
        }, {} as Record<string, unknown>)
    }
    return val
  })
}

async function part2() {
  console.log('\n2) The engine: a WordPress project reads exactly what it read before; a project without WordPress reads the crawl')
  const { server, port, calls } = await startFakeGenai({ models: ['gemini-2.5-flash', 'gemini-2.5-pro'], respond })
  const saved = { key: process.env.GEMINI_API_KEY, base: process.env.RECO_GENAI_BASE_URL }
  process.env.GEMINI_API_KEY = 'qa-key'
  process.env.RECO_GENAI_BASE_URL = `http://127.0.0.1:${port}`
  try {
    const { generateFromBriefs } = await import('@/lib/content/recommendations/generate-from-briefs')
    const { newRunCostController } = await import('@/lib/content/recommendations/run-cost-controller')
    const run = async (tables: Record<string, Row[]>) => {
      resetModelResolutionCache()
      resetRecoGenAiClient()
      const inner = fakeAdmin(tables) as unknown as { from: (t: string) => unknown }
      const tablesRead: string[] = []
      const admin = { from: (t: string) => (tablesRead.push(t), inner.from(t)) } as never
      const before = calls.length
      const out = await generateFromBriefs(admin, { projectId: 'p1', targetCount: 5, qualityMode: 'standard' }, newRunCostController('standard', 'qa', 5))
      return { ...out, providerCalls: calls.length - before, tablesRead }
    }

    const wpOnly = await run(withWordPress(shopTables()))
    const wpAndCrawl = await run(withCrawl(withWordPress(shopTables())))
    check('WordPress project: the engine produced suggestions from its WordPress index',
      wpOnly.suggestions.length > 0 && wpOnly.diagnostics.evidence_inventory.site_scan_entities === SHOP_WP_TARGETS.length, JSON.stringify(wpOnly.diagnostics.evidence_inventory))
    check('…with a crawl index next to it: suggestions and their order byte-identical', canon(wpOnly.suggestions) === canon(wpAndCrawl.suggestions),
      `${wpOnly.suggestions.length} vs ${wpAndCrawl.suggestions.length}`)
    check('…the FULL diagnostics byte-identical, and as many model calls', canon(wpOnly.diagnostics) === canon(wpAndCrawl.diagnostics) && wpOnly.providerCalls === wpAndCrawl.providerCalls,
      `${wpOnly.providerCalls} vs ${wpAndCrawl.providerCalls}`)
    check('…and the crawl table was never read', !wpAndCrawl.tablesRead.includes('site_crawl_index'), wpAndCrawl.tablesRead.join(','))

    const bare = await run(shopTables())
    const crawled = await run(withCrawl(shopTables()))
    const foreign = await run(withCrawl(shopTables(), 'u2'))
    check('no WordPress, no crawl: no site entities', bare.diagnostics.evidence_inventory.site_scan_entities === 0)
    check("no WordPress, the owner's crawl: its eligible pages are the site entities, the utility page excluded",
      crawled.diagnostics.evidence_inventory.site_scan_entities === 2 && crawled.diagnostics.evidence_inventory.ineligible_pages_excluded === 1,
      JSON.stringify(crawled.diagnostics.evidence_inventory))
    check("another account's crawl row for this project is not read into it: identical to no crawl",
      canon(foreign.diagnostics) === canon(bare.diagnostics) && canon(foreign.suggestions) === canon(bare.suggestions))

    const failedWp = await run(withCrawl(withWordPress(shopTables(), 'failed')))
    check("WordPress connection 'failed': the crawl, not the stale WordPress index", failedWp.diagnostics.evidence_inventory.site_scan_entities === 2)

    // A Shopify-synced store: the engine adds its entities itself.
    const synced = (t: Record<string, Row[]>) => {
      t.shopify_entities = [
        { id: 'se1', project_id: 'p1', is_active: true, title: 'צמחי מרפא', handle: 'herbs', entity_type: 'collection', canonical_url: `https://${SHOP}/c/herbs` },
        { id: 'se2', project_id: 'p1', is_active: true, title: 'שינה טובה בלי תרופות', handle: 'sleep', entity_type: 'blog', canonical_url: `https://${SHOP}/blog/sleep` },
      ]
      return t
    }
    const shopOnly = await run(synced(shopTables()))
    const shopAndCrawl = await run(withCrawl(synced(shopTables())))
    check('Shopify-synced project: its entities are read, as before',
      shopOnly.suggestions.length > 0 && Number(shopOnly.diagnostics.evidence_inventory.shopify_entities ?? 0) === 2, JSON.stringify(shopOnly.diagnostics.evidence_inventory))
    check('…with a crawl of the same storefront next to it: suggestions and the FULL diagnostics byte-identical (no page counted twice)',
      canon(shopOnly.suggestions) === canon(shopAndCrawl.suggestions) && canon(shopOnly.diagnostics) === canon(shopAndCrawl.diagnostics) && shopOnly.providerCalls === shopAndCrawl.providerCalls,
      `${JSON.stringify(shopOnly.diagnostics.evidence_inventory)} vs ${JSON.stringify(shopAndCrawl.diagnostics.evidence_inventory)}`)
    check('…and the crawl table was never read', !shopAndCrawl.tablesRead.includes('site_crawl_index'), shopAndCrawl.tablesRead.join(','))
  } finally {
    server.close()
    if (saved.key === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = saved.key
    if (saved.base === undefined) delete process.env.RECO_GENAI_BASE_URL
    else process.env.RECO_GENAI_BASE_URL = saved.base
  }
}

// ── 3. Source guard ─────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** Engine files and how many index reads each makes. */
const ENGINE_READS: Record<string, number> = {
  'lib/content/recommendations/engine.ts': 3,
  'lib/content/recommendations/generate-from-briefs.ts': 1,
  'lib/content/recommendations/generate-opportunities.ts': 1,
  'lib/content/recommendations/keyword-guard.ts': 1,
  'lib/content/recommendations/site-scan.ts': 1,
}

/** The guard: no getCachedIndex call and exactly the expected getContentIndex calls. */
function engineReadsViolations(read: (file: string) => string): string[] {
  const out: string[] = []
  for (const [file, n] of Object.entries(ENGINE_READS)) {
    const src = stripComments(read(file))
    const direct = (src.match(/\bgetCachedIndex\s*\(/g) ?? []).length
    const routed = (src.match(/\bgetContentIndex\s*\(/g) ?? []).length
    if (direct > 0) out.push(`${file}: getCachedIndex( ×${direct}`)
    if (routed !== n) out.push(`${file}: getContentIndex( ×${routed}, expected ${n}`)
  }
  return out
}

function part3() {
  console.log('\n3) Every site-index read of the engine goes through getContentIndex')
  const real = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  const violations = engineReadsViolations(real)
  check('the five engine files: no getCachedIndex call, every read through getContentIndex', violations.length === 0, violations.join('; '))
  const mutated = (file: string) =>
    file.endsWith('keyword-guard.ts') ? real(file).replace('getContentIndex(projectId, null, admin)', 'getCachedIndex(admin, projectId)') : real(file)
  const caught = engineReadsViolations(mutated)
  check('MUTATION CONTROL: one read switched back to getCachedIndex is caught', caught.length === 2 && caught.every((v) => v.startsWith('lib/content/recommendations/keyword-guard.ts')), caught.join('; '))
}

async function main() {
  await part1()
  await part2()
  part3()
  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
