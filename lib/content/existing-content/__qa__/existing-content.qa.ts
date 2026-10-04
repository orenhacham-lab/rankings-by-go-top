/**
 * The existing-content screen (C6 v1): what is already on the merchant's site.
 *
 *   A) cannibalization RISK: a query for which two or more of the site's own pages
 *      get impressions — and nothing else counts as one;
 *   B) the OWNER filter: the admin client bypasses RLS, so every read is filtered by
 *      the project and its owner, and the Search Console rows by the project's run;
 *   C) the PARTIAL-LIST flag: the crawl (at most 25 key pages) is never the whole
 *      site, and the screen must say so;
 *   D) the route authenticates itself, fails closed with a stable code, and the
 *      screen calls only routes that already exist (no model call on "write a
 *      supporting article"); both languages carry the same copy.
 *
 * Every guard has a MUTATION CONTROL: the same check against a broken copy of the
 * code (written to a temp dir and loaded) or a broken source must fail.
 *
 * Run: npx tsx lib/content/existing-content/__qa__/existing-content.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import * as REAL_MODEL from '../model'
import * as REAL_LOAD from '../load'
import { validateTopicBrief } from '../../topic-brief'
import { getDashboardDictionary } from '../../../i18n/dashboard/getDashboardDictionary'
import type { GscRowLite } from '../model'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

type Model = typeof REAL_MODEL
type Load = typeof REAL_LOAD

/** A broken copy of a module, loaded from a temp dir with its imports made absolute. */
function mutant<T>(rel: string, from: string, to: string, all = false): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  const dir = mkdtempSync(join(tmpdir(), 'existing-content-mutant-'))
  try {
    const here = join(ROOT, rel, '..')
    const body = (all ? src.split(from).join(to) : src.replace(from, to))
      .replace(/from '@\/([^']+)'/g, (_m, p) => `from '${join(ROOT, p)}'`)
      .replace(/from '\.\/([^']+)'/g, (_m, p) => `from '${join(here, p)}'`)
    const file = join(dir, rel.split('/').pop()!)
    writeFileSync(file, body)
    return { mod: require(file) as T, found }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const SITE = 'https://shop.example.org'
const row = (query: string, path: string, clicks: number, impressions: number, host = SITE): GscRowLite =>
  ({ query, page: `${host}${path}`, clicks, impressions })

// ── A) cannibalization ───────────────────────────────────────────────────────
const A_ROWS = {
  two: [row('running shoes', '/collections/running', 10, 500), row('running shoes', '/products/trail-2', 2, 90)],
  one: [row('running shoes', '/collections/running', 10, 500), row('trail runner', '/products/trail-2', 3, 40)],
  zero: [row('running shoes', '/collections/running', 10, 500), row('running shoes', '/products/trail-2', 0, 0)],
  spellings: [
    row('running shoes', '/collections/running', 10, 500),
    row('running shoes', '/collections/running/', 1, 20, 'http://www.shop.example.org'),
    row('running shoes', '/collections/running?utm_source=x', 1, 5),
  ],
  caseQ: [row('Running Shoes', '/collections/running', 10, 500), row(' running shoes ', '/products/trail-2', 1, 200)],
  riskiest: [
    row('socks', '/products/socks', 1, 50), row('socks', '/collections/running', 1, 60),
    row('running shoes', '/collections/running', 10, 900), row('running shoes', '/pages/about', 0, 300),
  ],
  // One page takes a token share of a query the rest of the site owns. This is the
  // shape that stamped "47 of your pages…" on nearly every row (owner, 5 Oct 2026).
  sliver: [row('gifts', '/collections/gifts', 10, 500), row('gifts', '/products/mug', 0, 10)],
  // Each page holds half, but the query is too small for one stray view to decide.
  tiny: [row('gifts', '/collections/gifts', 0, 8), row('gifts', '/products/mug', 0, 8)],
  // '/p' really splits both queries, but draws more of its own traffic from the
  // SMALLER one. The old rule labelled it by the site-wide total and said 'big'.
  mine: [
    row('big', '/p', 0, 200), row('big', '/q', 0, 800),
    row('small', '/p', 0, 300), row('small', '/r', 0, 100),
  ],
}
function cannibalChecks(m: Model) {
  const two = m.cannibalizationByPage(A_ROWS.two)
  const res = {
    A1: two.size === 2 && two.get('/collections/running')?.pages === 2 && two.get('/products/trail-2')?.query === 'running shoes',
    A2: m.cannibalizationByPage(A_ROWS.one).size === 0,
    A3: m.cannibalizationByPage(A_ROWS.zero).size === 0,
    A4: m.cannibalizationByPage(A_ROWS.spellings).size === 0,
    A5: m.cannibalizationByPage(A_ROWS.caseQ).size === 2,
    A6: m.cannibalizationByPage(A_ROWS.riskiest).get('/collections/running')?.query === 'running shoes'
      && m.cannibalizationByPage(A_ROWS.riskiest).get('/products/socks')?.query === 'socks',
    A9: m.cannibalizationByPage(A_ROWS.sliver).size === 0,
    A10: m.cannibalizationByPage(A_ROWS.tiny).size === 0,
    A11: m.cannibalizationByPage(A_ROWS.mine).get('/p')?.query === 'small',
  }
  return res
}

async function main() {
  console.log('A) cannibalization risk: two or more of the site\'s pages with impressions on one query')
  {
    const r = cannibalChecks(REAL_MODEL)
    check('A1: two pages with impressions on one query are both flagged, with the query and the count', r.A1)
    check('A2: one page per query is not a risk', r.A2)
    check('A3: a page with zero impressions for the query is not a second page', r.A3)
    check('A4: one page spelled three ways (www, trailing slash, UTM) is one page, not a risk', r.A4)
    check('A5: the same query in another case or with spaces is the same query', r.A5)
    check('A6: a page in two shared queries carries the one with more impressions', r.A6)
    // The fix for "almost every page looks cannibalized" (owner, 5 October 2026): the
    // same rule the keyword-research screen already states, each page holding at least
    // COMPETING_MIN_SHARE of a query with at least COMPETING_MIN_IMPRESSIONS.
    check('A9: a page with a token share of someone else\'s query is not a risk', r.A9)
    check('A10: a query below the impressions floor is not a risk', r.A10)
    check('A11: a page is labelled by the shared query IT draws most from, not the site\'s biggest', r.A11)
    // A custom domain on the store and the myshopify host in Search Console: matched by path.
    const items = REAL_MODEL.mergeSources([REAL_MODEL.sourceFromShopify([
      { shopify_gid: 'gid://shopify/Collection/1', entity_type: 'collection', title: 'Running', handle: 'running', canonical_url: 'https://acme.myshopify.com/collections/running', is_active: true },
    ])])
    const annotated = REAL_MODEL.annotate(items, { gscRows: A_ROWS.two, ownership: null, plannedKeys: null })
    check('A7: the flag and the figures reach the store\'s item by path, whatever the host',
      annotated[0].cannibalization?.query === 'running shoes' && annotated[0].metrics?.impressions === 500 && annotated[0].metrics?.topQuery === 'running shoes')
    const top = REAL_MODEL.pageMetrics([row('a', '/p', 5, 100), row('b', '/p', 9, 10), row('c', '/p', 9, 50)])
    check('A8: the top query is the one with the most clicks, impressions breaking a tie', top.get('/p')?.topQuery === 'c' && top.get('/p')?.clicks === 23)

    const m1 = mutant<Model>('lib/content/existing-content/model.ts', 'if (real.length < 2) continue', 'if (real.length < 1) continue')
    check('MUTATION CONTROL: the threshold the control breaks is where it expects it', m1.found)
    check('MUTATION CONTROL: a copy that flags a query with ONE page is caught by A2', !!m1.mod && !cannibalChecks(m1.mod).A2)
    const m4 = mutant<Model>('lib/content/existing-content/model.ts', 'imp / e.impressions >= COMPETING_MIN_SHARE', 'imp > 0')
    check('MUTATION CONTROL: a copy that flags any shared impression is caught by A9', m4.found && !!m4.mod && !cannibalChecks(m4.mod).A9)
    const m5 = mutant<Model>('lib/content/existing-content/model.ts', 'if (e.impressions < COMPETING_MIN_IMPRESSIONS) continue', '')
    check('MUTATION CONTROL: a copy with no impressions floor is caught by A10', m5.found && !!m5.mod && !cannibalChecks(m5.mod).A10)
    const m6 = mutant<Model>('lib/content/existing-content/model.ts', 'out.set(page, { query, pages: real.length, mine })', 'out.set(page, { query, pages: real.length, mine: e.impressions })')
    check('MUTATION CONTROL: a copy that ranks by the site-wide total is caught by A11', m6.found && !!m6.mod && !cannibalChecks(m6.mod).A11)
    const m2 = mutant<Model>('lib/content/existing-content/model.ts', 'imp / e.impressions >= COMPETING_MIN_SHARE', 'imp / e.impressions >= 0')
    check('MUTATION CONTROL: a copy that counts zero-impression pages is caught by A3', m2.found && !!m2.mod && !cannibalChecks(m2.mod).A3)
    const m3 = mutant<Model>('lib/content/existing-content/model.ts', "const q = String(r.query || '').trim().toLowerCase()", "const q = String(r.query || '')")
    check('MUTATION CONTROL: a copy that splits one query by case is caught by A5', m3.found && !!m3.mod && !cannibalChecks(m3.mod).A5)
  }

  console.log('\nB) every read is filtered by the project and its owner')
  const P = 'proj-1', U = 'owner-1', OTHER = 'intruder-9', Q = 'proj-2'
  const fixture = () => new FakeAdmin({
    shopify_connections: [
      { id: 'c1', project_id: P, user_id: U, connection_status: 'connected', archived_at: null },
    ],
    shopify_entities: [
      { id: 'e1', project_id: P, user_id: U, shopify_gid: 'gid://shopify/Product/1', entity_type: 'product', title: 'Trail Runner 2', handle: 'trail-runner-2', canonical_url: `${SITE}/products/trail-runner-2`, is_active: true, shopify_updated_at: '2026-09-01T00:00:00Z' },
      { id: 'e2', project_id: P, user_id: U, shopify_gid: 'gid://shopify/Article/7', entity_type: 'article', title: 'How to choose', handle: 'how-to-choose', canonical_url: `${SITE}/blogs/news/how-to-choose`, is_active: true, shopify_updated_at: null },
      { id: 'e3', project_id: P, user_id: U, shopify_gid: 'gid://shopify/Product/3', entity_type: 'product', title: 'Retired', handle: 'retired', canonical_url: `${SITE}/products/retired`, is_active: false },
      // Not this owner's, not this project's: must never appear.
      { id: 'e4', project_id: P, user_id: OTHER, shopify_gid: 'gid://shopify/Product/4', entity_type: 'product', title: 'LEAKED ENTITY', handle: 'x', canonical_url: `${SITE}/products/leaked`, is_active: true },
      { id: 'e5', project_id: Q, user_id: U, shopify_gid: 'gid://shopify/Product/5', entity_type: 'product', title: 'OTHER PROJECT', handle: 'y', canonical_url: `${SITE}/products/other`, is_active: true },
    ],
    generated_articles: [
      { project_id: P, user_id: OTHER, shopify_article_id: 'gid://shopify/Article/7', shopify_article_url: null },
    ],
    article_topics: [
      { project_id: P, user_id: OTHER, status: 'approved', anchors_json: [{ target_url: `${SITE}/products/trail-runner-2`, type: 'internal' }] },
    ],
    project_gsc_properties: [{ project_id: P }],
    gsc_sync_runs: [{ id: 'run-1', project_id: P, window_days: 28, status: 'succeeded', started_at: '2026-09-20T00:00:00Z', start_date: '2026-08-21', end_date: '2026-09-17' }],
    gsc_query_page_metrics: [
      { sync_run_id: 'run-1', project_id: P, query: 'trail runner', page: `${SITE}/products/trail-runner-2`, clicks: 12, impressions: 300 },
      // Another project's row under the same run id: must not be summed in.
      { sync_run_id: 'run-1', project_id: Q, query: 'trail runner', page: `${SITE}/products/trail-runner-2`, clicks: 999, impressions: 99999 },
    ],
    site_crawl_index: [
      // This project, another owner: must not make it a crawl project.
      { project_id: P, user_id: OTHER, targets: [{ targetUrl: `${SITE}/leak`, targetTitle: 'LEAKED CRAWL', targetType: 'page', eligibility: 'yes' }], scan_status: 'completed', scan_completed_at: null },
    ],
  })
  const FLAGS = { gscEnabled: true, wordpressRefreshEnabled: true }
  const ownerChecks = async (l: Load) => {
    const p = await l.loadExistingContent(fixture() as never, { projectId: P, userId: U }, FLAGS)
    const titles = p.items.map((i) => i.title)
    const trail = p.items.find((i) => i.title === 'Trail Runner 2')
    const article = p.items.find((i) => i.title === 'How to choose')
    return {
      B1: titles.length === 2 && titles.includes('Trail Runner 2') && titles.includes('How to choose') && !titles.includes('LEAKED ENTITY') && !titles.includes('OTHER PROJECT'),
      B2: article?.origin === 'site',
      B3: trail?.supportTopicPlanned === false,
      B4: trail?.metrics?.impressions === 300 && trail?.metrics?.clicks === 12,
      B5: p.source === 'shopify' && !p.partial && p.counts.all === 2 && p.counts.product === 1 && p.counts.article === 1,
      titles: titles.join(', '),
    }
  }
  {
    const r = await ownerChecks(REAL_LOAD)
    check('B1: only the owner\'s ACTIVE entities of this project are listed', r.B1, r.titles)
    check('B2: another owner\'s generated article does not make a page "ours"', r.B2)
    check('B3: another owner\'s topic does not mark a product as planned', r.B3)
    check('B4: another project\'s Search Console row under the same run id is not summed in', r.B4)
    check('B5: the counts are of what is listed, per kind', r.B5)
    const own = await REAL_LOAD.loadExistingContent(new FakeAdmin({
      shopify_entities: [{ project_id: P, user_id: U, shopify_gid: 'gid://shopify/Article/7', entity_type: 'article', title: 'Ours', canonical_url: `${SITE}/blogs/news/ours`, is_active: true }],
      generated_articles: [{ project_id: P, user_id: U, shopify_article_id: 'gid://shopify/Article/7' }],
      article_topics: [{ project_id: P, user_id: U, status: 'suggested', anchors_json: [{ target_url: `${SITE}/blogs/news/ours/`, type: 'internal' }] }],
    }) as never, { projectId: P, userId: U }, FLAGS)
    check('B6: the owner\'s own article IS "ours", and its own topic IS planned', own.items[0]?.origin === 'ours' && own.items[0]?.supportTopicPlanned === true)

    const m1 = mutant<Load>('lib/content/existing-content/load.ts', ".eq('user_id', userId)", '', true)
    check('MUTATION CONTROL: the owner filter the control removes is where it expects it', m1.found)
    const r1 = m1.mod ? await ownerChecks(m1.mod) : null
    check('MUTATION CONTROL: a loader without the owner filter is caught by B1 (another owner\'s entity leaks)', !!r1 && !r1.B1, r1?.titles)
    check('MUTATION CONTROL: …and by B2 (another owner\'s article makes a page "ours")', !!r1 && !r1.B2)
    const gscFilter = ".eq('sync_run_id', run.id)\n      .eq('project_id', projectId)"
    const m2 = mutant<Load>('lib/content/existing-content/load.ts', gscFilter, ".eq('sync_run_id', run.id)")
    const r2 = m2.mod ? await ownerChecks(m2.mod) : null
    check('MUTATION CONTROL: a loader that reads metric rows by run id alone is caught by B4', m2.found && !!r2 && !r2.B4)
  }

  console.log('\nC) the partial-list flag')
  const crawlOnly = () => new FakeAdmin({
    site_crawl_index: [{ project_id: P, user_id: U, scan_status: 'completed', scan_completed_at: '2026-09-27T10:00:00Z', targets: [
      { targetUrl: `${SITE}/`, targetTitle: 'Home', targetType: 'page', targetRole: 'homepage', eligibility: 'caution' },
      { targetUrl: `${SITE}/services/repair`, targetTitle: 'Repair', targetType: 'page', targetRole: 'strategic_content_page', eligibility: 'yes' },
      { targetUrl: `${SITE}/product-category/boots`, targetTitle: 'Boots', targetType: 'category', targetRole: 'commercial_category_or_service_hub', eligibility: 'yes' },
      { targetUrl: `${SITE}/contact`, targetTitle: 'Contact', targetType: 'unknown', targetRole: 'utility_system', eligibility: 'no' },
    ] }],
  })
  const partialChecks = async (l: Load) => {
    const crawl = await l.loadExistingContent(crawlOnly() as never, { projectId: P, userId: U }, FLAGS)
    const shopWithCrawl = fixture()
    shopWithCrawl.tables.site_crawl_index = [{ project_id: P, user_id: U, scan_status: 'completed', targets: [{ targetUrl: `${SITE}/x`, targetTitle: 'X', targetType: 'page', eligibility: 'yes' }] }]
    const shop = await l.loadExistingContent(shopWithCrawl as never, { projectId: P, userId: U }, FLAGS)
    const wpDone = await l.loadExistingContent(new FakeAdmin({
      wordpress_connections: [{ project_id: P, user_id: U, connection_status: 'connected' }],
      wordpress_content_index: [{ project_id: P, user_id: U, scan_status: 'completed', targets: [{ targetUrl: `${SITE}/blog/post-1`, targetTitle: 'Post 1', targetType: 'post', eligibility: 'yes', matchedGeneratedArticleId: 'ga-1' }] }],
    }) as never, { projectId: P, userId: U }, FLAGS)
    const wpCut = await l.loadExistingContent(new FakeAdmin({
      wordpress_connections: [{ project_id: P, user_id: U, connection_status: 'connected' }],
      wordpress_content_index: [{ project_id: P, user_id: U, scan_status: 'partial', targets: [{ targetUrl: `${SITE}/blog/post-1`, targetTitle: 'Post 1', targetType: 'post', eligibility: 'yes' }] }],
    }) as never, { projectId: P, userId: U }, FLAGS)
    const empty = await l.loadExistingContent(new FakeAdmin({}) as never, { projectId: P, userId: U }, FLAGS)
    return {
      C1: crawl.source === 'crawl' && crawl.partial && crawl.partialReason === 'crawl',
      C2: crawl.items.length === 3 && !crawl.items.some((i) => i.title === 'Contact') && crawl.items.find((i) => i.title === 'Boots')?.group === 'commerce',
      // The crawl no longer hides behind the store: its page the store does not list joins the list.
      C3: shop.source === 'shopify' && !shop.partial && shop.partialReason === null && shop.items.some((i) => i.key === '/x') && shop.items.length === 3,
      C4: wpDone.source === 'wordpress' && !wpDone.partial && wpDone.items[0]?.origin === 'ours' && wpDone.resync === 'wordpress',
      C5: wpCut.partial && wpCut.partialReason === 'index_partial',
      C6: empty.source === 'none' && !empty.partial && empty.items.length === 0 && empty.resync === null && empty.gsc.state === 'not_connected',
    }
  }
  {
    const r = await partialChecks(REAL_LOAD)
    check('C1: a crawl-only project is listed from the crawl, and flagged partial', r.C1)
    check('C2: the crawl\'s utility pages are left out; a product category is a collection', r.C2)
    check('C3: a store with synced entities is not partial; the crawl only adds the pages the store does not list', r.C3)
    check('C4: a connected WordPress index is complete; its matched article is "ours"; resync is its refresh', r.C4)
    check('C5: a WordPress scan that was cut short says so', r.C5)
    check('C6: a project with nothing is "none": no items, no resync, not partial', r.C6)
    const m = mutant<Load>('lib/content/existing-content/load.ts', "else if (sources.wordpress === 0 && sources.crawl > 0) partialReason = 'crawl'", '')
    const rm = m.mod ? await partialChecks(m.mod) : null
    check('MUTATION CONTROL: a loader that forgets to flag the crawl as partial is caught by C1', m.found && !!rm && !rm.C1)

    const screen = strip(read('components/content/workspace/ExistingContentScreen.tsx'))
    const saysPartial = (s: string) => /\{payload\.partial && mapIdle && \(/.test(s) && /x\.partialCrawlBody/.test(s) && /x\.partialTitle/.test(s)
    check('C7: the screen states the partial list in words whenever the payload says partial', saysPartial(screen))
    check('MUTATION CONTROL: a screen that drops the partial note is caught', !saysPartial(screen.replace('{payload.partial && mapIdle && (', '{false && (')))
  }

  console.log('\nD) the route, the actions and the copy')
  {
    const flags = { gscEnabled: false, wordpressRefreshEnabled: false }
    const off = await REAL_LOAD.loadExistingContent(fixture() as never, { projectId: P, userId: U }, flags)
    check('D1: with Search Console off, no figures and no risk are shown', off.gsc.state === 'off' && off.items.every((i) => i.metrics === null && i.cannibalization === null))
    const unsynced = fixture(); unsynced.tables.gsc_sync_runs = []
    const us = await REAL_LOAD.loadExistingContent(unsynced as never, { projectId: P, userId: U }, FLAGS)
    check('D2: connected but never synced is its own state', us.gsc.state === 'not_synced')

    const broken = new FakeAdmin(fixture().tables, { shopify_entities: { select: () => ({ code: '57014', message: 'canceling statement due to statement timeout' }) } })
    let threw: unknown = null
    try { await REAL_LOAD.loadExistingContent(broken as never, { projectId: P, userId: U }, FLAGS) } catch (e) { threw = e }
    check('D3: a failed read is an error, never an empty list', threw instanceof REAL_LOAD.ExistingContentLoadError)
    const missing = new FakeAdmin({}, { site_crawl_index: { select: () => ({ code: 'PGRST205', message: 'Could not find the table' }) } })
    const mp = await REAL_LOAD.loadExistingContent(missing as never, { projectId: P, userId: U }, FLAGS)
    check('D4: a table this database does not have yet is no data, not a failure', mp.source === 'none')

    const route = strip(read('app/api/content/existing/route.ts'))
    const authFirst = (s: string) => {
      const iAuth = s.indexOf('await authContentProject(projectId)')
      const iLoad = s.indexOf('loadExistingContent(')
      return iAuth > 0 && iLoad > iAuth && /if \('error' in auth\) return/.test(s)
        && /projectId: auth\.project\.id, userId: auth\.user\.id/.test(s)
        && /if \(!isContentModuleEnabled\(\)\) return/.test(s)
    }
    check('D5: the route checks the flag, then the session and ownership, and loads with the VERIFIED ids', authFirst(route))
    check('MUTATION CONTROL: a route that loads with the raw query id is caught',
      !authFirst(route.replace('projectId: auth.project.id, userId: auth.user.id', 'projectId: projectId!, userId: auth.user.id')))
    const noRaw = (s: string) => !/\.message\b/.test(s.replace(/console\.error\([^)]*\)/g, '')) && /error: 'existing_content_read_failed'/.test(s)
    check('D6: a failure answers with a stable code, never database text', noRaw(route))
    check('MUTATION CONTROL: a route returning the error message is caught', !noRaw(route.replace("error: 'existing_content_read_failed'", 'error: (e as Error).message')))

    const screen = strip(read('components/content/workspace/ExistingContentScreen.tsx'))
    const ALLOWED = ['/api/content/existing', '/api/content/existing/map', '/api/shopify/sync', '/api/content/automation/internal-links/index/refresh', '/api/content/topics']
    // fetch('…') and the screen's post('…') helper alike.
    const fetched = (s: string) => [...s.matchAll(/\b(?:fetch|post)\(\s*[`'"]([^`'"?$]+)/g)].map((m) => m[1])
    const onlyExisting = (s: string) => fetched(s).length > 0 && fetched(s).every((u) => ALLOWED.includes(u))
    check(`D7: the screen calls only existing routes (${fetched(screen).join(', ')})`, onlyExisting(screen))
    check('MUTATION CONTROL: a screen that calls a Shopify product API of its own is caught',
      !onlyExisting(screen + "\nfetch('/api/shopify/products')"))
    check('MUTATION CONTROL: …also through the post() helper', !onlyExisting(screen + "\npost('/api/shopify/products', {})"))
    const noModel = (s: string) => !/recommendations|gemini|generate|improve/i.test(s.match(/const writeSupport[\s\S]*?\n {2}\}, \[/)?.[0] ?? 'generate')
    check('D8: "write a supporting article" posts a topic and calls no model', noModel(screen) && /fetch\('\/api\/content\/topics'/.test(screen))
    check('MUTATION CONTROL: a click that asks the recommendation engine is caught',
      !noModel(screen.replace("fetch('/api/content/topics'", "fetch('/api/content/automation/recommendations'")))

    const item = { title: 'Trail Runner 2', url: `${SITE}/products/trail-runner-2`, metrics: { clicks: 1, impressions: 10, position: 12, topQuery: 'trail runner', topQueryPosition: 12 } }
    const bodyHe = REAL_MODEL.supportTopicBody(item, P, 'he', getDashboardDictionary('he').existingContent.supportTopic)
    const v = validateTopicBrief(bodyHe)
    const anchor = 'value' in v ? v.value.anchors_json[0] : null
    check('D9: the topic passes the existing route\'s own validation, with the product as a REQUIRED internal link',
      'value' in v && anchor?.target_url === item.url && anchor?.required === true && anchor?.type === 'internal'
      && v.value.search_intent === 'commercial' && v.value.primary_keyword === 'trail runner' && v.value.language === 'he' && /[א-ת]/.test(v.value.topic))
    check('D10: the topic is in the PROJECT\'s language, not the dashboard\'s',
      REAL_MODEL.topicLanguage('en-US') === 'en' && REAL_MODEL.topicLanguage('he') === 'he' && REAL_MODEL.topicLanguage(null) === 'he'
      && /\bwriteSupport\b[\s\S]*topicLanguage\(selectedProject\?\.language\)/.test(screen) // The dictionary is derived from the PROJECT language; it may be narrowed on the
      // way in, because the dashboard dictionaries have no Spanish yet.
      && /getDashboardDictionary\((?:toHebrewOrEnglish\()?lang\)?\)\.existingContent\.supportTopic/.test(screen))

    // Both dictionaries carry the same keys; Hebrew is Hebrew, English is English.
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object')
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v2]) => keys(v2, `${p}.${k}`)) : [p]
    const he = getDashboardDictionary('he').existingContent, en = getDashboardDictionary('en').existingContent
    const same = (a: unknown, b: unknown) => JSON.stringify(keys(a).sort()) === JSON.stringify(keys(b).sort())
    check('D11: both languages carry the same keys', same(he, en))
    const { retry: _dropped, ...enWithoutRetry } = en
    void _dropped
    check('MUTATION CONTROL: a key missing in English is caught', !same(he, enWithoutRetry))
    const heVals = keys(he).map((k) => k.split('.').slice(1).reduce((o: unknown, s) => (o as Record<string, unknown>)[s], he) as string)
    const enVals = keys(en).map((k) => k.split('.').slice(1).reduce((o: unknown, s) => (o as Record<string, unknown>)[s], en) as string)
    const HEB = /[א-ת]/
    const heOk = heVals.filter((s) => typeof s === 'string' && s.replace(/Search Console|\{[a-z]+\}/g, '').replace(/[^A-Za-zא-ת]/g, '').length > 0).every((s) => HEB.test(s))
    const enOk = enVals.every((s) => typeof s !== 'string' || !HEB.test(s))
    check('D12: every Hebrew string is Hebrew, and no English string has Hebrew in it', heOk && enOk)
    check('D13: the screen and the nav both name it',
      getDashboardDictionary('he').contentHub.screens.existing === 'תוכן קיים' && (getDashboardDictionary('en').contentHub.screens.existing as string) === 'Existing content')

    const rawColor = (s: string) => /\b(?:text|bg|border|ring)-(?:slate|blue|gray|zinc|neutral|red|green|amber|yellow)-\d/.test(s)
    const partsDir = 'components/content/workspace/existing'
    const withParts = [screen, ...readdirSync(join(ROOT, partsDir)).map((f) => strip(read(`${partsDir}/${f}`)))].join('\n')
    check('D14: the screen and its parts use the design tokens only', !rawColor(withParts))
    check('MUTATION CONTROL: a raw slate colour is caught', rawColor(screen + '\n<p className="text-slate-500" />'))
    check('D15: no "no supporting article" flag is claimed — the link plans cannot see the merchant\'s own posts',
      !/noSupport|unsupported/i.test(screen) && !/noSupport/i.test(JSON.stringify(he)))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })

export {}
