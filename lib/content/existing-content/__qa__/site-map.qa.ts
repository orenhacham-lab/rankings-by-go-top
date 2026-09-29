/**
 * The full-site mapping of the existing-content screen, and the counts it shows.
 *
 *   S) CLASSIFICATION: every URL lands in the right tab (products, articles,
 *      pages, categories), by the strongest evidence: the platform's type, then
 *      the index's, then the sitemap's name, then the URL; and what is not
 *      content (cart, tags, feeds, files, query strings) is in no tab at all;
 *   T) COUNTS on a big-site fixture (912 products, 80 articles, 40 pages, 24
 *      categories): the tabs carry the TRUE totals while the list shows 50 rows;
 *      one page spelled three ways is one page; a Search Console page is merged,
 *      not added twice;
 *   W) the SITEMAP WALK keeps robots.txt, stays on the site, follows indexes to
 *      a bounded depth, skips tag/author sitemaps, and stops at its caps and its
 *      time budget, saying so;
 *   R) the RUN and its STORE: one run at a time (lease), a minimum interval, the
 *      owner filter on every write, a failed run keeps the previous result, and
 *      the missing table degrades to "unavailable" instead of failing;
 *   H) the ROUTE authenticates, answers with stable codes, and schedules the
 *      work after answering;
 *   U) the SCREEN: tabs read the payload's totals, the list is paged on the
 *      server, a skeleton (never a zero) comes first, and a row carries an
 *      action only when the model gave it one.
 *
 * Every guard has a MUTATION CONTROL: the same check against a broken copy of
 * the code (written to a temp dir and loaded) or a broken source must fail.
 *
 * Run: npx tsx lib/content/existing-content/__qa__/site-map.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import * as CLS from '../classify'
import * as MODEL from '../model'
import * as WALK from '../sitemap-walk'
import * as STORE from '../site-map-store'
import * as RUN from '../site-map-run'
import * as HTTP from '../map-http'
import * as LOAD from '../load'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** A broken copy of a module, loaded from a temp dir with its imports made absolute. */
function mutant<T>(rel: string, from: string, to: string, all = false): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  const dir = mkdtempSync(join(tmpdir(), 'site-map-mutant-'))
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

const SITE = 'https://shop.example.co.il'
type Cls = typeof CLS
type Model = typeof MODEL
type Walk = typeof WALK
type Store = typeof STORE

// ── S) classification ────────────────────────────────────────────────────────
const HINTS: [string, ReturnType<typeof CLS.sitemapKindHint>][] = [
  ['/product-sitemap.xml', 'product'], ['/sitemap_products_1.xml?from=1&to=999', 'product'], ['/wp-sitemap-posts-product-1.xml', 'product'],
  ['/product_cat-sitemap.xml', 'category'], ['/sitemap_collections_1.xml', 'category'], ['/wp-sitemap-taxonomies-category-1.xml', 'category'],
  ['/post-sitemap.xml', 'article'], ['/wp-sitemap-posts-post-1.xml', 'article'], ['/sitemap_blogs_1.xml', 'article'],
  ['/page-sitemap.xml', 'page'], ['/wp-sitemap-posts-page-1.xml', 'page'], ['/sitemap_pages_1.xml', 'page'],
  ['/author-sitemap.xml', 'exclude'], ['/wp-sitemap-users-1.xml', 'exclude'], ['/wp-sitemap-taxonomies-post_tag-1.xml', 'exclude'], ['/product_tag-sitemap.xml', 'exclude'],
  ['/sitemap.xml', null], ['/sitemap-1.xml', null],
]
const URLS: [string, CLS.SiteKind][] = [
  ['/', 'page'], ['/products/trail-runner', 'product'], ['/product/merino-socks', 'product'], ['/collections/shoes/products/runner', 'product'],
  ['/collections/shoes', 'category'], ['/collections', 'category'], ['/product-category/boots', 'category'], ['/shop', 'category'], ['/category/news-and-tips', 'category'],
  ['/blogs/news/how-to-choose', 'article'], ['/blogs/news', 'page'], ['/blog/small-apartment-tips', 'article'], ['/blog', 'page'], ['/2024/05/a-post', 'article'],
  ['/מאמרים/נעלי-ריצה', 'article'], ['/pages/about', 'page'], ['/services/kitchen-design', 'page'], ['/products', 'category'],
]
const NOT_CONTENT = ['/cart', '/checkout', '/my-account/orders', '/search', '/tag/shoes', '/blogs/news/tagged/sale', '/author/admin', '/feed', '/page/2',
  '/wp-json/wp/v2/posts', '/wp-content/uploads/a.jpg', '/files/catalog.pdf', '/products/x?variant=12', '/עגלה']

function classifyChecks(c: Cls) {
  const hintMiss = HINTS.filter(([p, want]) => c.sitemapKindHint(`${SITE}${p}`) !== want).map(([p]) => p)
  const urlMiss = URLS.filter(([p, want]) => c.kindFromUrl(`${SITE}${p}`) !== want).map(([p]) => p)
  const ncMiss = NOT_CONTENT.filter((p) => c.isContentUrl(`${SITE}${p}`))
  const contentMiss = URLS.filter(([p]) => !c.isContentUrl(`${SITE}${p}`)).map(([p]) => p)
  return {
    S1: hintMiss.length === 0, hintMiss,
    S2: urlMiss.length === 0, urlMiss,
    S3: ncMiss.length === 0 && contentMiss.length === 0, ncMiss: [...ncMiss, ...contentMiss],
    // The platform wins over the sitemap, the sitemap over the URL.
    S4: c.resolveKind({ url: `${SITE}/p/123`, platform: 'product', sitemap: 'page' }) === 'product'
      && c.resolveKind({ url: `${SITE}/p/123`, sitemap: 'product' }) === 'product'
      && c.resolveKind({ url: `${SITE}/collections/x`, sitemap: 'page' }) === 'page'
      && c.resolveKind({ url: `${SITE}/pages/sale`, platform: 'collection' }) === 'category',
    // The crawl's default 'page' is not evidence; its schema-based product is.
    S5: c.resolveKind({ url: `${SITE}/products/x`, index: { type: 'page', authoritative: false } }) === 'product'
      && c.resolveKind({ url: `${SITE}/some-thing`, index: { type: 'product', authoritative: false } }) === 'product'
      && c.resolveKind({ url: `${SITE}/products/x`, index: { type: 'page', authoritative: true } }) === 'page',
    // A blog's own listing, filed in the blog's sitemap, is a page; the home page is always a page.
    S6: c.resolveKind({ url: `${SITE}/blogs/news`, sitemap: 'article' }) === 'page' && c.resolveKind({ url: `${SITE}/`, sitemap: 'product' }) === 'page',
    S7: c.titleFromUrl(`${SITE}/products/%D7%A0%D7%A2%D7%9C%D7%99-%D7%A8%D7%99%D7%A6%D7%94`) === 'נעלי ריצה' && c.titleFromUrl(`${SITE}/blog/small-apartment_tips.html`) === 'Small apartment tips',
  }
}

// ── T) the big-site fixture ─────────────────────────────────────────────────
const BIG = { product: 912, article: 80, page: 40, category: 24 }
function bigSitemapEntries(): MODEL.SiteMapEntry[] {
  const out: MODEL.SiteMapEntry[] = []
  for (let i = 1; i <= BIG.product; i++) out.push({ u: `${SITE}/products/item-${i}`, k: 'product', m: '2026-09-01' })
  for (let i = 1; i <= BIG.article; i++) out.push({ u: `${SITE}/blogs/news/post-${i}`, k: 'article' })
  // The blog's own listing sits in the blog sitemap too: a page, not an article.
  out.push({ u: `${SITE}/blogs/news`, k: 'article' })
  // 38 pages here + the blog listing + the size guide Search Console adds = 40.
  for (let i = 1; i <= BIG.page - 2; i++) out.push({ u: `${SITE}/pages/page-${i}`, k: 'page' })
  for (let i = 1; i <= BIG.category; i++) out.push({ u: `${SITE}/collections/cat-${i}`, k: 'category' })
  return out
}
function countChecks(m: Model) {
  const entries = bigSitemapEntries()
  // The same product again through the store (another host, a trailing slash), a
  // Search Console page that is already listed (www), one it adds, and noise.
  const shop = m.sourceFromShopify([{ shopify_gid: 'gid://shopify/Product/1', entity_type: 'product', title: 'Item one', handle: 'item-1', canonical_url: 'https://acme.myshopify.com/products/item-1/', is_active: true }])
  const gscRows: MODEL.GscRowLite[] = [
    { query: 'item one', page: 'https://www.shop.example.co.il/products/item-1', clicks: 5, impressions: 400, position: 12 },
    { query: 'size guide', page: `${SITE}/pages/size-guide`, clicks: 1, impressions: 50, position: 6 },
    { query: 'cart', page: `${SITE}/cart`, clicks: 0, impressions: 10, position: 3 },
  ]
  const items = m.annotate(m.mergeSources([shop, m.sourceFromMap(entries), m.sourceFromGsc(gscRows)]), { gscRows, ownership: null, plannedKeys: null })
  const counts = m.countTabs(items)
  const index = { counts, items } as unknown as MODEL.ExistingContentIndex
  const view: MODEL.ExistingContentView = { tab: 'product', q: '', sort: 'impressions', risk: false, offset: 0, limit: 50 }
  const page = m.toPayload(index, view)
  const more = m.toPayload(index, { ...view, offset: 50 })
  const search = m.toPayload(index, { ...view, tab: 'all', q: 'ITEM-9' })
  const one = items.find((i) => i.key === '/products/item-1')
  return {
    T1: counts.product === BIG.product && counts.article === BIG.article && counts.page === BIG.page && counts.category === BIG.category
      && counts.all === BIG.product + BIG.article + BIG.page + BIG.category, counts: JSON.stringify(counts),
    T2: page.items.length === 50 && page.matching === BIG.product && page.counts.product === BIG.product && page.counts.all === counts.all,
    T3: more.items.length === 50 && more.items[0].key !== page.items[0].key && !more.items.some((i) => page.items.some((p) => p.key === i.key)),
    T4: !!one && one.title === 'Item one' && one.sources.join(',') === 'shopify,map,gsc' && one.metrics?.clicks === 5 && page.items[0]?.key === '/products/item-1',
    // item-9, item-90…99 and item-900…912: 1 + 10 + 13, across every tab, not just the 50 shown.
    T5: search.matching === 24 && search.items.length === 24 && search.items.every((i) => i.key.includes('item-9')), search: search.matching,
  }
}

// ── A) the action a row earns ───────────────────────────────────────────────
function actionChecks(m: Model) {
  const met = (position: number, impressions = 400) => ({ clicks: 3, impressions, position, topQuery: 'נעלי ריצה', topQueryPosition: position })
  const ours = (position: number, impressions?: number) => m.rowAction({ origin: 'ours', articleId: 'ga-1', metrics: met(position, impressions), supportTopicPlanned: false })
  const theirs = (position: number, impressions?: number, planned = false) => m.rowAction({ origin: 'site', articleId: null, metrics: met(position, impressions), supportTopicPlanned: planned })
  const improve = ours(8)
  const support = theirs(15)
  return {
    A1: improve?.kind === 'improve' && improve.articleId === 'ga-1' && improve.query === 'נעלי ריצה' && ours(2) === null && ours(25) === null,
    A2: support?.kind === 'support' && support.position === 15 && theirs(29) !== null,
    // On the first page, too deep, too little demand, already planned, or no figures: no action.
    A3: theirs(5) === null && theirs(10) === null && theirs(45) === null && theirs(15, 10) === null && theirs(15, 400, true) === null
      && m.rowAction({ origin: 'site', articleId: null, metrics: null, supportTopicPlanned: false }) === null,
  }
}

// ── W) the walker ────────────────────────────────────────────────────────────
function fakeSite(opts: { robots?: { status: number; text: string } | null; docs: Record<string, string>; clock?: { t: number; step: number } }) {
  const requested: string[] = []
  const deps: WALK.WalkDeps = {
    fetchRobots: async () => ({ read: opts.robots === undefined ? { status: 404, text: '' } : opts.robots, complete: true }),
    fetchDoc: async (url) => {
      requested.push(url.toString())
      if (opts.clock) opts.clock.t += opts.clock.step
      const text = opts.docs[url.pathname + url.search] ?? opts.docs[url.toString()]
      return text === undefined ? { ok: false } : { ok: true, text }
    },
    now: () => opts.clock?.t ?? 0,
  }
  return { deps, requested }
}
const urlset = (paths: string[], host = SITE) => `<?xml version="1.0"?><urlset>${paths.map((p) => `<url><loc>${host}${p}</loc><lastmod>2026-09-01</lastmod></url>`).join('')}</urlset>`
const index = (paths: string[], host = SITE) => `<sitemapindex>${paths.map((p) => `<sitemap><loc>${host}${p}</loc></sitemap>`).join('')}</sitemapindex>`
const LIM: WALK.MapLimits = { ...WALK.MAP_LIMITS }

async function walkChecks(w: Walk) {
  const site = fakeSite({
    robots: { status: 200, text: 'User-agent: *\nDisallow: /private\nSitemap: https://shop.example.co.il/sitemap_index.xml\n' },
    docs: {
      '/sitemap_index.xml': index(['/product-sitemap.xml', '/post-sitemap.xml', '/author-sitemap.xml', '/private/sitemap.xml', '/nested-index.xml']) + '<sitemap><loc>https://evil.example.net/sitemap.xml</loc></sitemap>',
      '/product-sitemap.xml': urlset(['/product/a', '/product/b', '/private/secret-product']) + urlset(['/product/c'], 'https://evil.example.net'),
      '/post-sitemap.xml': urlset(['/blog/one', '/blog/two']) + urlset(['/blog/one/'], 'https://www.shop.example.co.il'),
      '/author-sitemap.xml': urlset(['/author/admin', '/someone']),
      '/private/sitemap.xml': urlset(['/private/x']),
      '/nested-index.xml': index(['/page-sitemap.xml']),
      '/page-sitemap.xml': urlset(['/about', '/cart']),
    },
  })
  const r = await w.walkSitemaps(new URL(SITE), site.deps, LIM)
  const urls = r.entries.map((e) => new URL(e.u).pathname)
  const kinds = Object.fromEntries(r.entries.map((e) => [new URL(e.u).pathname, e.k]))
  const blocked = fakeSite({ robots: { status: 503, text: '' }, docs: { '/sitemap.xml': urlset(['/a']) } })
  const rb = await w.walkSitemaps(new URL(SITE), blocked.deps, LIM)
  const noRobots = fakeSite({ robots: { status: 404, text: '' }, docs: { '/sitemap.xml': urlset(['/a', '/b']) } })
  const rn = await w.walkSitemaps(new URL(SITE), noRobots.deps, LIM)
  const many = fakeSite({ docs: { '/sitemap.xml': urlset(Array.from({ length: 30 }, (_, i) => `/products/p-${i}`)) } })
  const rc = await w.walkSitemaps(new URL(SITE), many.deps, { ...LIM, MAX_URLS: 10 })
  const deep = fakeSite({ docs: { '/sitemap.xml': index(['/l1.xml']), '/l1.xml': index(['/l2.xml']), '/l2.xml': index(['/l3.xml']), '/l3.xml': index(['/l4.xml']), '/l4.xml': urlset(['/too-deep']) } })
  const rd = await w.walkSitemaps(new URL(SITE), deep.deps, LIM)
  const clock = { t: 0, step: 400 }
  const slow = fakeSite({ clock, docs: { '/sitemap.xml': index(Array.from({ length: 20 }, (_, i) => `/s-${i}.xml`)), ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`/s-${i}.xml`, urlset([`/p/${i}`])])) } })
  const rt = await w.walkSitemaps(new URL(SITE), slow.deps, { ...LIM, BUDGET_MS: 2_000, CONCURRENCY: 1 })
  return {
    W1: urls.includes('/product/a') && urls.includes('/product/b') && urls.includes('/blog/one') && urls.includes('/about') && kinds['/product/a'] === 'product' && kinds['/blog/one'] === 'article' && kinds['/about'] === 'page',
    W2: !urls.includes('/private/secret-product') && !site.requested.some((u) => u.includes('/private/')) && r.disallowed === 1,
    W3: !site.requested.some((u) => u.includes('evil.example.net')) && !urls.includes('/product/c'),
    W4: !site.requested.some((u) => u.includes('author-sitemap')) && !urls.includes('/someone'),
    W5: urls.filter((u) => u === '/blog/one').length === 1 && !urls.includes('/cart'),
    W6: rb.robots === 'unreadable' && rb.entries.length === 0 && blocked.requested.length === 0,
    W7: rn.robots === 'absent' && rn.entries.length === 2,
    W8: rc.capped && rc.entries.length === 10,
    W9: !rd.entries.some((e) => e.u.endsWith('/too-deep')) && !deep.requested.some((u) => u.endsWith('/l4.xml')),
    W10: rt.timedOut && rt.entries.length < 20,
    requested: site.requested.join(' '),
  }
}

// ── R) store and run ─────────────────────────────────────────────────────────
const P = 'proj-1', U = 'owner-1', X = 'intruder-9'
const scope = { projectId: P, userId: U }
const T0 = Date.parse('2026-09-29T10:00:00Z')
async function storeChecks(s: Store) {
  const admin = new FakeAdmin({ site_page_map: [{ project_id: P, user_id: X, status: 'completed', finished_at: '2026-09-01T00:00:00Z', entries: [{ u: `${SITE}/leak` }] }] })
  const c1 = await s.claimSiteMap(admin as never, scope, { siteUrl: SITE, now: T0 })
  const c2 = await s.claimSiteMap(admin as never, scope, { siteUrl: SITE, now: T0 + 10_000 })
  const own = admin.tables.site_page_map.find((r) => r.user_id === U)
  const intruder = admin.tables.site_page_map.find((r) => r.user_id === X)
  await s.finishSiteMap(admin as never, scope, { status: 'completed', entries: [{ u: `${SITE}/a` }], counts: { all: 1, product: 0, article: 0, page: 1, category: 0 }, capped: false, stopReason: null, docsRead: 1, docsSeen: 1, now: T0 + 20_000 })
  const c3 = await s.claimSiteMap(admin as never, scope, { siteUrl: SITE, now: T0 + 30_000 })
  const c4 = await s.claimSiteMap(admin as never, scope, { siteUrl: SITE, now: T0 + 20_000 + s.MAP_MIN_INTERVAL_MS + 1 })
  // A run that died: its lease ran out while still "running".
  const dead = new FakeAdmin({ site_page_map: [{ project_id: P, user_id: U, status: 'running', lease_expires_at: new Date(T0 - 1).toISOString(), entries: [] }] })
  const c5 = await s.claimSiteMap(dead as never, scope, { siteUrl: SITE, now: T0 })
  const deadStatus = s.mapStatus({ available: true, row: { status: 'running', lease_expires_at: new Date(T0 - 1).toISOString() } as STORE.SiteMapRow }, true, T0)
  const missing = new FakeAdmin({}, { site_page_map: { select: () => ({ code: 'PGRST205', message: 'Could not find the table' }) } })
  const c6 = await s.claimSiteMap(missing as never, scope, { siteUrl: SITE, now: T0 })
  const r6 = await s.readSiteMap(missing as never, scope, { entries: false })
  return {
    R1: c1 === 'claimed' && c2 === 'running' && own?.status === 'running' && !!own?.lease_expires_at,
    R2: intruder?.status === 'completed' && Array.isArray(intruder?.entries) && (intruder.entries as unknown[]).length === 1,
    R3: c3 === 'recent' && c4 === 'claimed',
    R4: c5 === 'claimed' && deadStatus.state === 'failed',
    R5: c6 === 'unavailable' && r6.available === false,
  }
}

async function runChecks() {
  const admin = new FakeAdmin({ site_page_map: [{ project_id: P, user_id: U, status: 'completed', finished_at: '2026-09-01T00:00:00Z', entries: [{ u: `${SITE}/old` }], counts: {} }] })
  await STORE.claimSiteMap(admin as never, scope, { siteUrl: SITE, now: T0 })
  let t = T0
  const walkResult: WALK.WalkResult = { robots: 'rules', entries: bigSitemapEntries(), docsRead: 5, docsSeen: 5, docsFailed: 0, capped: false, timedOut: false, disallowed: 0 }
  const res = await RUN.runSiteMap(admin as never, scope, new URL(SITE), {
    now: () => (t += 100),
    walk: async (_o, onProgress) => { await onProgress({ docsRead: 2, docsSeen: 5, found: 300 }); return walkResult },
    platform: async () => [{ u: `${SITE}/products/item-1/`, p: 'product', t: 'Item One (from WordPress)' }, { u: `${SITE}/new-landing`, p: 'page', t: 'Landing' }],
  })
  const row = admin.tables.site_page_map[0]
  const entries = row.entries as MODEL.SiteMapEntry[]
  const counts = row.counts as MODEL.TabCounts
  // A run that fails keeps the previous result.
  const failing = new FakeAdmin({ site_page_map: [{ project_id: P, user_id: U, status: 'completed', finished_at: '2026-09-01T00:00:00Z', entries: [{ u: `${SITE}/kept` }], counts: { all: 1 } }] })
  await STORE.claimSiteMap(failing as never, scope, { siteUrl: SITE, now: T0 })
  const bad = await RUN.runSiteMap(failing as never, scope, new URL(SITE), { now: () => T0, walk: async () => { throw new Error('ECONNRESET 10.0.0.1') }, platform: async () => [] })
  const frow = failing.tables.site_page_map[0]
  const blocked = new FakeAdmin({ site_page_map: [{ project_id: P, user_id: U, status: 'running', entries: [] }] })
  await RUN.runSiteMap(blocked as never, scope, new URL(SITE), { now: () => T0, walk: async () => ({ ...walkResult, robots: 'unreadable', entries: [], docsRead: 0 }), platform: async () => [] })
  return {
    R6: res.status === 'completed' && row.status === 'completed' && entries.length === 912 + 80 + 39 + 24 + 1
      && counts.product === 912 && counts.page === 40 && row.stop_reason === null,
    R7: entries.find((e) => e.u.includes('/products/item-1'))?.t === 'Item One (from WordPress)' && entries.find((e) => e.u.includes('/products/item-1'))?.m === '2026-09-01',
    R8: bad.status === 'failed' && frow.status === 'failed' && frow.stop_reason === 'error' && (frow.entries as MODEL.SiteMapEntry[])[0]?.u === `${SITE}/kept`,
    R9: blocked.tables.site_page_map[0].status === 'failed' && blocked.tables.site_page_map[0].stop_reason === 'robots_unreadable',
  }
}

// ── H) the route ─────────────────────────────────────────────────────────────
async function httpChecks(h: typeof HTTP) {
  const scheduled: (() => Promise<unknown>)[] = []
  const mk = (admin: FakeAdmin, authed = true): HTTP.MapRouteDeps => ({
    enabled: () => true,
    auth: async (pid) => (!authed ? { error: 'Unauthorized', status: 401 } : pid !== P ? { error: 'Forbidden', status: 403 } : { user: { id: U }, admin: admin as never, project: { id: P, user_id: U } }),
    schedule: (task) => { scheduled.push(task) },
    now: () => T0,
    runDeps: () => ({ now: () => T0, walk: async () => ({ robots: 'absent', entries: [], docsRead: 0, docsSeen: 0, docsFailed: 0, capped: false, timedOut: false, disallowed: 0 }), platform: async () => [] }),
  })
  const post = (body: unknown) => new Request('http://x/api/content/existing/map', { method: 'POST', body: JSON.stringify(body) })
  const base = () => new FakeAdmin({ projects: [{ id: P, user_id: U, target_domain: 'shop.example.co.il' }], site_page_map: [] })
  const a = base()
  const r1 = await h.handleMapPost(post({ projectId: P }), mk(a))
  const b1 = await r1.json()
  const queuedAfterFirst = scheduled.length
  const r2 = await h.handleMapPost(post({ projectId: P }), mk(a))
  const r3 = await h.handleMapPost(post({ projectId: P }), mk(base(), false))
  const r4 = await h.handleMapPost(post({ projectId: 'someone-elses' }), mk(base()))
  const noSite = new FakeAdmin({ projects: [{ id: P, user_id: U, target_domain: '' }] })
  const r5 = await h.handleMapPost(post({ projectId: P }), mk(noSite))
  const missing = new FakeAdmin({ projects: [{ id: P, user_id: U, target_domain: 'shop.example.co.il' }] }, { site_page_map: { select: () => ({ code: 'PGRST205', message: 'Could not find the table' }) } })
  const r6 = await h.handleMapPost(post({ projectId: P }), mk(missing))
  const b6 = await r6.json()
  const g = await h.handleMapGet(new Request(`http://x/api/content/existing/map?projectId=${P}`), mk(a))
  const gb = await g.json()
  return {
    H1: r1.status === 202 && b1.state === 'running' && queuedAfterFirst === 1,
    H2: r2.status === 202 && scheduled.length === 1,
    H3: r3.status === 401 && r4.status === 403,
    H4: r5.status === 409 && (await r5.json()).error === 'no_site' && r6.status === 409 && b6.error === 'map_unavailable',
    H5: g.status === 200 && gb.map?.state === 'running' && !('entries' in (gb.map ?? {})),
  }
}

async function main() {
  console.log('S) classification: each URL in the right tab, and non-content in none')
  {
    const r = classifyChecks(CLS)
    check('S1: a sitemap\'s name files its URLs (product_cat before product, posts-page before posts; tags and authors excluded)', r.S1, r.hintMiss.join(', '))
    check('S2: the URL alone: products, categories, articles, blog listings and pages (Hebrew segments too)', r.S2, r.urlMiss.join(', '))
    check('S3: cart, account, search, tags, feeds, pagination, files and query strings are not content', r.S3, r.ncMiss.join(', '))
    check('S4: the platform\'s type beats the sitemap, the sitemap beats the URL', r.S4)
    check('S5: the crawl\'s default "page" is not evidence; WordPress\'s own type is', r.S5)
    check('S6: a blog\'s listing is a page even in the blog\'s sitemap; the home page is always a page', r.S6)
    check('S7: a page nobody named is titled from its address, decoded', r.S7)
    const m1 = mutant<Cls>('lib/content/existing-content/classify.ts',
      "  if (has(/(^|[^a-z])(product[_-]?cat",
      "  if (has(/(^|[^a-z])products?([^a-z]|$)/)) return 'product'\n  if (has(/(^|[^a-z])(product[_-]?cat")
    check('MUTATION CONTROL: checking "product" before "product_cat" is caught by S1', m1.found && !!m1.mod && !classifyChecks(m1.mod).S1)
    const m2 = mutant<Cls>('lib/content/existing-content/classify.ts', '  if (isBlogListing(raw)) return \'page\'\n', '')
    check('MUTATION CONTROL: dropping the blog-listing rule is caught by S2', m2.found && !!m2.mod && !classifyChecks(m2.mod).S2)
    const m3 = mutant<Cls>('lib/content/existing-content/classify.ts', '  if (url.search) return false\n', '')
    check('MUTATION CONTROL: counting query-string URLs is caught by S3', m3.found && !!m3.mod && !classifyChecks(m3.mod).S3)
    const m4 = mutant<Cls>('lib/content/existing-content/classify.ts', 'if (k && (e.index.authoritative || k !== \'page\')) return k', 'if (k) return k')
    check('MUTATION CONTROL: taking the crawl\'s default "page" as evidence is caught by S5', m4.found && !!m4.mod && !classifyChecks(m4.mod).S5)
  }

  console.log('\nT) the counts on a big site: true totals on every tab, one page once')
  {
    const r = countChecks(MODEL)
    check(`T1: 912 products, 80 articles, 40 pages, 24 categories are counted exactly (${r.counts})`, r.T1)
    check('T2: the products tab carries 912 while its first page lists 50', r.T2)
    check('T3: "show more" continues the list without repeating a row', r.T3)
    check('T4: one product from the store, the sitemap and Search Console (three spellings) is one row, with the store\'s title and Google\'s figures', r.T4)
    check('T5: the search matches the address and counts every hit, not only the page shown', r.T5)
    const m1 = mutant<Model>('lib/content/existing-content/model.ts', '      if (!isContentUrl(s.url)) continue\n', '')
    const r1 = m1.mod ? countChecks(m1.mod) : null
    check('MUTATION CONTROL: a merge that keeps non-content pages is caught by T1 (the cart is counted)', m1.found && !!r1 && !r1.T1)
    const m2 = mutant<Model>('lib/content/existing-content/model.ts', 'return { ...summary, view, matching: page.matching, items: page.items }', 'return { ...summary, counts: countTabs(page.items), view, matching: page.matching, items: page.items }')
    const r2 = m2.mod ? countChecks(m2.mod) : null
    check('MUTATION CONTROL: counting the page shown instead of the site is caught by T2', m2.found && !!r2 && !r2.T2)
    const m3 = mutant<Model>('lib/content/existing-content/model.ts', '      const key = pageKey(s.url)\n      if (!key) continue\n      let a', '      const key = s.url\n      if (!key) continue\n      let a')
    const r3 = m3.mod ? countChecks(m3.mod) : null
    check('MUTATION CONTROL: merging by full URL instead of by page is caught by T4', m3.found && !!r3 && !r3.T4)
  }

  console.log('\nW) the sitemap walk: robots.txt, this site only, bounded')
  {
    const r = await walkChecks(WALK)
    check('W1: an index is followed to its product, post and (nested) page sitemaps, each URL filed by its sitemap', r.W1, r.requested)
    check('W2: robots.txt: a disallowed sitemap is never requested and a disallowed URL is not counted', r.W2)
    check('W3: an index pointing at another host is not followed; another host\'s URL is not counted', r.W3)
    check('W4: an author sitemap is not read', r.W4)
    check('W5: one page spelled twice is listed once; the cart is not listed', r.W5)
    check('W6: an unreadable robots.txt (503) means nothing else is read', r.W6)
    check('W7: no robots.txt (404) allows everything; /sitemap.xml is the fallback', r.W7)
    check('W8: the URL cap stops the walk and says so', r.W8)
    check('W9: index nesting stops at MAX_DEPTH', r.W9)
    check('W10: the time budget stops the walk and says so', r.W10)
    const m1 = mutant<Walk>('lib/content/existing-content/sitemap-walk.ts', '    if (!allow(job.url)) { result.docsFailed++; return }\n', '')
    const r1 = m1.mod ? await walkChecks(m1.mod) : null
    check('MUTATION CONTROL: a walk that requests disallowed sitemaps is caught by W2', m1.found && !!r1 && !r1.W2)
    const m2 = mutant<Walk>('lib/content/existing-content/sitemap-walk.ts', "if (!url || !sameSite(url) || depth > limits.MAX_DEPTH) return", 'if (!url || depth > limits.MAX_DEPTH) return')
    const r2 = m2.mod ? await walkChecks(m2.mod) : null
    check('MUTATION CONTROL: a walk that follows another host\'s sitemap is caught by W3', m2.found && !!r2 && !r2.W3)
    const m3 = mutant<Walk>('lib/content/existing-content/sitemap-walk.ts', "  if (answer.state === 'unreadable') return result\n", '')
    const r3 = m3.mod ? await walkChecks(m3.mod) : null
    check('MUTATION CONTROL: a walk that reads the site despite an unreadable robots.txt is caught by W6', m3.found && !!r3 && !r3.W6)
    const m4 = mutant<Walk>('lib/content/existing-content/sitemap-walk.ts', "      if (result.entries.length >= limits.MAX_URLS) { result.capped = true; return }\n      const u = toUrl", '      const u = toUrl')
    const r4 = m4.mod ? await walkChecks(m4.mod) : null
    check('MUTATION CONTROL: a walk without the URL cap is caught by W8', m4.found && !!r4 && !r4.W8)
  }

  console.log('\nR) one run at a time, the owner\'s row only, and a missing table degrades')
  {
    const r = await storeChecks(STORE)
    check('R1: a start claims the row; a second start while it runs is refused', r.R1)
    check('R2: another owner\'s row of the same project is never touched', r.R2)
    check('R3: a run that just ended is "recent"; after the interval a new one may start', r.R3)
    check('R4: a run whose lease ran out is shown as failed and may be taken over', r.R4)
    check('R5: a missing table answers "unavailable", never an error', r.R5)
    const m1 = mutant<Store>('lib/content/existing-content/site-map-store.ts', ".eq('user_id', userId)\n      .or(", '.or(')
    const r1 = m1.mod ? await storeChecks(m1.mod) : null
    check('MUTATION CONTROL: a claim without the owner filter is caught by R2', m1.found && !!r1 && !r1.R2)
    const m2 = mutant<Store>('lib/content/existing-content/site-map-store.ts', "if (row.status === 'running' && row.lease_expires_at && Date.parse(row.lease_expires_at) >= opts.now) return 'running'", '')
    const m2b = m2.mod ? await storeChecks(m2.mod) : null
    // Without the early refusal, the conditional update is the second line of defence: it must still hold.
    check('MUTATION CONTROL (defence in depth): without the early check, the conditional update still refuses a live run', m2.found && !!m2b && m2b.R1)
    const m3 = mutant<Store>('lib/content/existing-content/site-map-store.ts', "if (row.status !== 'running' && row.finished_at && opts.now - Date.parse(row.finished_at) < minInterval) return 'recent'", '')
    const r3 = m3.mod ? await storeChecks(m3.mod) : null
    check('MUTATION CONTROL: dropping the minimum interval is caught by R3', m3.found && !!r3 && !r3.R3)

    const rr = await runChecks()
    check('R6: a run stores every page it found (the big site plus the platform\'s extra page) and the counts per tab', rr.R6)
    check('R7: the platform\'s title and type win for a page the sitemap also listed, the sitemap\'s date stays', rr.R7)
    check('R8: a run that fails keeps the previous result and records a stable code, never the error text', rr.R8)
    check('R9: an unreadable robots.txt ends as failed with its own code', rr.R9)
  }

  console.log('\nA) a row earns an action only when Search Console gives it a reason')
  {
    const r = actionChecks(MODEL)
    check('A1: our own article close to the first page gets "improve" (and not when it is already there or far off)', r.A1)
    check('A2: another page on Google\'s second or third page gets "write a supporting article"', r.A2)
    check('A3: no action on the first page, too deep, without demand, already planned, or without figures', r.A3)
    const m1 = mutant<Model>('lib/content/existing-content/model.ts', 'qpos > ACTION_RULES.SUPPORT_MIN', 'qpos > 0')
    check('MUTATION CONTROL: offering support to a first-page result is caught by A3', m1.found && !!m1.mod && !actionChecks(m1.mod).A3)
    const m2 = mutant<Model>('lib/content/existing-content/model.ts', 'm.impressions < ACTION_RULES.MIN_IMPRESSIONS', 'm.impressions < 0')
    check('MUTATION CONTROL: acting without demand is caught by A3', m2.found && !!m2.mod && !actionChecks(m2.mod).A3)
  }

  console.log('\nH) the route: auth, ownership, stable codes, answers before working')
  {
    const r = await httpChecks(HTTP)
    check('H1: a start answers 202 and schedules the run (it does not run it inline)', r.H1)
    check('H2: a second start while it runs schedules nothing', r.H2)
    check('H3: no session is 401; another owner\'s project is 403', r.H3)
    check('H4: no site is 409 no_site; the missing table is 409 map_unavailable', r.H4)
    check('H5: the progress read answers the state without the entries', r.H5)
    const route = strip(read('app/api/content/existing/map/route.ts'))
    const wired = (s: string) => /schedule: \(task\) => after\(task\)/.test(s) && /auth: \(projectId\) => authContentProject\(projectId\)/.test(s) && /enabled: \(\) => isContentModuleEnabled\(\)/.test(s)
    check('H6: the live route schedules with after(), authenticates with authContentProject, and checks the module flag', wired(route))
    check('MUTATION CONTROL: a route that awaits the task inline is caught', !wired(route.replace('schedule: (task) => after(task)', 'schedule: (task) => { void task() }')))
    const noRaw = (s: string) => !/\.message\b/.test(s.replace(/console\.error\([^)]*\)/g, ''))
    const http = strip(read('lib/content/existing-content/map-http.ts'))
    check('H7: the route never answers with an error\'s own text', noRaw(http) && noRaw(route))
    check('MUTATION CONTROL: an answer carrying e.message is caught', !noRaw(http + "\nreturn json({ error: (e as Error).message })"))
  }

  console.log('\nL) the loader merges the mapping and says when it is partial')
  {
    const base = (extra: Record<string, unknown[]> = {}) => new FakeAdmin({
      projects: [{ id: P, user_id: U, target_domain: 'shop.example.co.il' }],
      site_page_map: [{ project_id: P, user_id: U, status: 'completed', finished_at: '2026-09-28T00:00:00Z', urls_found: 1057, capped: false, entries: bigSitemapEntries() }],
      ...extra,
    })
    const flags = { gscEnabled: false, wordpressRefreshEnabled: false }
    const full = await LOAD.loadExistingContent(base() as never, scope, flags, T0)
    const capped = base(); (capped.tables.site_page_map[0] as Record<string, unknown>).capped = true; (capped.tables.site_page_map[0] as Record<string, unknown>).status = 'partial'
    const cp = await LOAD.loadExistingContent(capped as never, scope, flags, T0)
    const other = new FakeAdmin({ projects: [{ id: P, user_id: U, target_domain: 'shop.example.co.il' }], site_page_map: [{ project_id: P, user_id: X, status: 'completed', entries: [{ u: `${SITE}/products/leaked` }] }] })
    const ol = await LOAD.loadExistingContent(other as never, scope, flags, T0)
    const missing = new FakeAdmin({ projects: [{ id: P, user_id: U, target_domain: 'shop.example.co.il' }] }, { site_page_map: { select: () => ({ code: '42P01', message: 'relation does not exist' }) } })
    const ml = await LOAD.loadExistingContent(missing as never, scope, flags, T0)
    const broken = new FakeAdmin({ projects: [{ id: P, user_id: U, target_domain: 'shop.example.co.il' }] }, { site_page_map: { select: () => ({ code: '57014', message: 'timeout' }) } })
    let threw: unknown = null
    try { await LOAD.loadExistingContent(broken as never, scope, flags, T0) } catch (e) { threw = e }
    check('L1: a finished mapping is the whole site: its counts, not partial, source "map"',
      full.counts.product === 912 && full.counts.all === 1055 && !full.partial && full.source === 'map' && full.map.state === 'completed')
    check('L2: a mapping that hit its cap says so ("at least")', cp.partial && cp.partialReason === 'map_capped' && cp.map.capped)
    check('L3: another owner\'s mapping of the project is not read', ol.counts.all === 0 && ol.map.state === 'never')
    check('L4: the missing table hides the mapping and fails nothing', ml.map.state === 'unavailable' && ml.counts.all === 0)
    check('L5: any other read error is an error, never an empty list', threw instanceof LOAD.ExistingContentLoadError)
    const m = mutant<typeof LOAD>('lib/content/existing-content/load.ts', "  if (map.capped && sources.map > 0) partialReason = 'map_capped'\n  else ", '  ')
    const mm = m.mod ? await m.mod.loadExistingContent(capped as never, scope, flags, T0) : null
    check('MUTATION CONTROL: a loader that hides the cap is caught by L2', m.found && !!mm && mm.partialReason !== 'map_capped')
  }

  console.log('\nU) the screen: totals on the tabs, paged on the server, skeleton first, actions only with a reason')
  {
    const dir = 'components/content/workspace/existing'
    const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    const parts = Object.fromEntries(files.map((f) => [f, strip(read(`${dir}/${f}`))]))
    const screen = strip(read('components/content/workspace/ExistingContentScreen.tsx'))
    const tabs = parts['KindTabs.tsx'] ?? ''
    const table = parts['ContentTable.tsx'] ?? ''
    const tabTotals = (s: string) => /\{num\.format\(counts\[t\]\)\}/.test(s) && /counts=\{payload\.counts\}/.test(screen)
    check('U1: each tab shows the payload\'s TRUE total for its kind', tabTotals(tabs))
    check('MUTATION CONTROL: a tab that counts the rows shown is caught', !tabTotals(tabs.replace('{num.format(counts[t])}', '{num.format(items.length)}')))
    const paged = (s: string) => /limit: String\(PAGE_SIZE\)/.test(s) && /offset: String\(offset\)/.test(s) && /fetchList\(viewRef\.current, rows\.length\)/.test(s)
    check('U2: the list is paged on the server ("show more" asks for the next offset)', paged(screen))
    check('MUTATION CONTROL: a screen that loads everything at once is caught', !paged(screen.replace('limit: String(PAGE_SIZE)', "limit: '100000'")))
    const skeletonFirst = (s: string) => /if \(!payload\) return <ExistingSkeleton/.test(s) && s.indexOf('if (!payload) return <ExistingSkeleton') < s.indexOf('payload.counts.all === 0')
    check('U3: a skeleton comes before any data-dependent state (no "0 pages" flash)', skeletonFirst(screen))
    check('MUTATION CONTROL: a screen that shows the empty state before the data is caught', !skeletonFirst(screen.replace('if (!payload) return <ExistingSkeleton label={x.loading} />', '')))
    // Never mapped: the start is already on its way, so the empty "nothing collected" state
    // (with its button) must not flash before the mapping takes over.
    const noIdleFlash = (s: string) => /const mapStarting = payload\.map\.state === 'never' && !autoFailed/.test(s)
      && /const mapIdle = payload\.map\.state !== 'running' && !mapStarting/.test(s) && /\{!mapIdle \? \(/.test(s)
      && /if \(r !== 'running'\) setAutoFailed\(true\)/.test(s)
    check('U7: a site never mapped reads as "mapping" until its start fails (no flash of the empty state)', noIdleFlash(screen))
    check('MUTATION CONTROL: a screen that shows the idle empty state while the first start is on its way is caught',
      !noIdleFlash(screen.replace("payload.map.state !== 'running' && !mapStarting", "payload.map.state !== 'running'")))
    const reasoned = (s: string) => /if \(a\?\.kind === 'improve'\)/.test(s) && /if \(a\?\.kind === 'support' && !planned\)/.test(s) && /actions\.improveWhy/.test(s) && /actions\.supportWhy/.test(s)
    check('U4: a row shows an action only when the model gave it one, with the reason under it', reasoned(table))
    check('MUTATION CONTROL: a support button on every row is caught', !reasoned(table.replace("if (a?.kind === 'support' && !planned)", 'if (!planned)')))
    const rawColor = (s: string) => /\b(?:text|bg|border|ring|from|to|fill|stroke)-(?:slate|blue|gray|zinc|neutral|red|green|amber|yellow|emerald|sky|indigo|rose)-\d/.test(s)
    const all = [screen, ...Object.values(parts)].join('\n')
    check('U5: the screen and its parts use the design tokens only', !rawColor(all))
    check('MUTATION CONTROL: a raw colour in a part is caught', rawColor(all + '\n<span className="bg-emerald-500" />'))
    // JSX text: a tag's '>' (not an arrow's '=>' or a comparison) followed by words.
    const noLiteral = (s: string) => !/(?<![=\s])>\s*[A-Za-zא-ת][^<>{}()=;&|]*</.test(s.replace(/<caption[\s\S]*?<\/caption>/g, ''))
    check('U6: no literal copy in the parts (every string from the dictionary)', Object.values(parts).every(noLiteral) && noLiteral(screen))
    check('MUTATION CONTROL: a hard-coded label is caught', !noLiteral(tabs + '\n<span>מוצרים</span>'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })

export {}
