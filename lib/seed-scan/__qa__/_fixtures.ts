/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Shared fixtures for the seed-scan suites: a fake network of whole sites, a
 * fake resolver, a counting model and a counting search, and a FakeAdmin world
 * with one project in it.
 *
 * The engine's real fetchers run against the fake network, so the admission,
 * redirect, size and host-pinning rules are exercised for real; only the
 * sockets and DNS are fake. DNS is replaced by patching `dns/promises.lookup`,
 * which the engine's resolver reads at call time.
 */
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { BusinessInsight, FreeCheckResult, InsightResult } from '@/lib/free-check'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { SearchFn, SearchOutcome } from '../serper'

// ── checks ──────────────────────────────────────────────────────────────────

export function makeChecker() {
  const state = { pass: 0, fail: 0 }
  const check = (name: string, cond: boolean, detail?: string) => {
    if (cond) {
      state.pass++
      console.log(`  ✓ ${name}`)
    } else {
      state.fail++
      console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
    }
  }
  const finish = () => {
    console.log(`\n${state.pass} passed, ${state.fail} failed`)
    if (state.fail > 0) process.exit(1)
  }
  return { check, finish, state }
}

// ── ids and clock ───────────────────────────────────────────────────────────

export const USER = '11111111-1111-4111-8111-111111111111'
export const OTHER_USER = '22222222-2222-4222-8222-222222222222'
export const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const OTHER_PROJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const NOW = new Date('2026-09-27T10:00:00.000Z')
export const SECRET = 'SECRET_PROVIDER_TEXT'

/** A clock the test moves by hand. */
export function clock(start: Date = NOW) {
  let t = start.getTime()
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms
    },
    set: (d: Date) => {
      t = d.getTime()
    },
  }
}

// ── DNS ─────────────────────────────────────────────────────────────────────

type Answer = { address: string; family: number }[]
const dnsModule = require('dns/promises') as { lookup: (host: string, opts?: unknown) => Promise<Answer> }
const realLookup = dnsModule.lookup
export const dnsOverrides = new Map<string, Answer | 'fail'>()
export const dnsQueries: string[] = []

/** Every name resolves to a public documentation address unless overridden. */
export function installFakeDns(): void {
  dnsModule.lookup = async (host: string) => {
    dnsQueries.push(host)
    const answer = dnsOverrides.get(host)
    if (answer === 'fail') throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    return answer ?? [{ address: '93.184.216.34', family: 4 }]
  }
}

export function restoreDns(): void {
  dnsModule.lookup = realLookup
}

// ── A fake network ──────────────────────────────────────────────────────────

export type FakeRoute = {
  status: number
  headers?: Record<string, string>
  body?: string
  /** Wait this long before answering (aborts honour the request's signal). */
  delayMs?: number
  /** Send the headers, then never finish the body (until the request is aborted). */
  stallBody?: boolean
}

const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(abortError())
      },
      { once: true },
    )
  })
}

/** Serves whole sites from a URL → response table and records every request. */
export class FakeNetwork {
  requests: string[] = []
  constructor(public routes: Record<string, FakeRoute>) {}

  fetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    this.requests.push(url)
    const route = this.routes[url] ?? { status: 404, headers: { 'content-type': 'text/html' }, body: '<html><body>not found</body></html>' }
    if (route.delayMs) await wait(route.delayMs, init?.signal)
    if (route.stallBody) {
      const signal = init?.signal
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<html><head><title>slow'))
          signal?.addEventListener('abort', () => controller.error(abortError()), { once: true })
        },
      })
      return new Response(stream, { status: route.status, headers: route.headers })
    }
    const nullBody = route.status === 204 || route.status === 304 || (route.status >= 300 && route.status < 400 && !route.body)
    return new Response(nullBody ? null : route.body ?? '', { status: route.status, headers: route.headers })
  }

  hosts(): string[] {
    return [...new Set(this.requests.map((u) => new URL(u).hostname))]
  }
}

const html = (body: string, headers: Record<string, string> = {}): FakeRoute => ({
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  body,
})
const xml = (body: string): FakeRoute => ({ status: 200, headers: { 'content-type': 'application/xml' }, body })
const text = (body: string): FakeRoute => ({ status: 200, headers: { 'content-type': 'text/plain' }, body })
const redirect = (location: string, headers: Record<string, string> = {}, status = 301): FakeRoute => ({
  status,
  headers: { location, ...headers },
})
const urlset = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${u}</loc><lastmod>2026-09-01</lastmod></url>`)
    .join('')}</urlset>`
const sitemapIndex = (children: { loc: string; lastmod: string }[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children
    .map((c) => `<sitemap><loc>${c.loc}</loc><lastmod>${c.lastmod}</lastmod></sitemap>`)
    .join('')}</sitemapindex>`

// ── Fixture 1: a Hebrew WordPress services site ─────────────────────────────

export const HE_WP = {
  target: 'plumber-tlv.co.il',
  key: 'plumber-tlv.co.il',
  home: 'https://www.plumber-tlv.co.il/',
  html: `<!doctype html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>אינסטלטור בתל אביב — שירות 24/7 | אינסטלציה מהירה</title>
<meta name="description" content="אינסטלטור מוסמך בתל אביב והמרכז: פתיחת סתימות, איתור נזילות ותיקון דודים. זמינים 24/7 עם אחריות מלאה.">
<link rel="stylesheet" href="https://www.plumber-tlv.co.il/wp-content/themes/plumb/style.css">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"HomeAndConstructionBusiness","name":"אינסטלציה מהירה","telephone":"+972-3-5550101","address":{"@type":"PostalAddress","streetAddress":"אבן גבירול 50","addressLocality":"תל אביב","addressCountry":"IL"}}</script>
</head><body>
<h1>אינסטלטור בתל אביב</h1>
<h2>איך לפתוח סתימה בכיור?</h2><h2>כמה עולה איתור נזילה?</h2><h2>מתי להחליף דוד?</h2>
<p>אנחנו צוות אינסטלטורים מוסמכים שעובד בתל אביב ובכל אזור המרכז. פתיחת סתימות, איתור נזילות ללא הרס ותיקון דודי שמש.</p>
<img src="/a.jpg" alt="צנרת"><img src="/b.jpg">
<a href="/services">שירותים</a><a href="/contact">צור קשר</a><a href="https://facebook.com/plumber">פייסבוק</a>
</body></html>`,
}

export function heWordPressSite(): Record<string, FakeRoute> {
  const base = 'https://www.plumber-tlv.co.il'
  return {
    'https://plumber-tlv.co.il/': redirect(`${base}/`),
    [`${base}/`]: html(HE_WP.html),
    [`${base}/robots.txt`]: text(`User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: ${base}/wp-sitemap.xml\n`),
    [`${base}/wp-sitemap.xml`]: xml(
      sitemapIndex([
        { loc: `${base}/wp-sitemap-posts-page-1.xml`, lastmod: '2026-09-02' },
        { loc: `${base}/wp-sitemap-posts-post-1.xml`, lastmod: '2026-09-03' },
      ]),
    ),
    [`${base}/wp-sitemap-posts-page-1.xml`]: xml(urlset(['/', '/services', '/contact', '/about', '/areas'].map((p) => `${base}${p}`))),
    [`${base}/wp-sitemap-posts-post-1.xml`]: xml(urlset(Array.from({ length: 7 }, (_, i) => `${base}/blog/post-${i + 1}`))),
  }
}

export const HE_WP_INSIGHT: BusinessInsight = {
  business: {
    summary: 'צוות אינסטלטורים מוסמכים בתל אביב: פתיחת סתימות, איתור נזילות ותיקון דודים, זמינים 24/7.',
    audiences: ['בעלי דירות בתל אביב', 'ועדי בתים', 'בעלי עסקים קטנים', 'משכירי דירות'],
    niche: 'אינסטלציה ביתית',
    platform: 'WordPress',
    companyName: 'אינסטלציה מהירה',
    commerceType: 'service',
    isLocal: true,
    country: 'IL',
    language: 'he',
    address: 'אבן גבירול 50, תל אביב, IL',
    phone: '+972-3-5550101',
  },
  keywords: ['אינסטלטור בתל אביב', 'פתיחת סתימות', 'איתור נזילות', 'תיקון דוד שמש', 'אינסטלטור חירום'],
  articles: ['איך לפתוח סתימה בכיור לבד', 'כמה עולה איתור נזילה', 'מתי להחליף דוד שמש', 'סימנים לנזילה נסתרת', 'מה לעשות בהצפה'],
  competitors: ['rival-plumber.co.il', 'pipes-pro.co.il', 'never-seen.co.il'],
}

/** The three searches of the Hebrew site: what Serper would answer, reduced to domains. */
export const HE_WP_RESULTS: Record<string, string[]> = {
  'אינסטלטור בתל אביב': ['rival-plumber.co.il', 'facebook.com', 'he.wikipedia.org', 'easy.co.il', 'plumber-tlv.co.il', 'zap.co.il'],
  'פתיחת סתימות': ['easy.co.il', 'pipes-pro.co.il', 'youtube.com', 'zap.co.il', 'shop.plumber-tlv.co.il'],
  'איתור נזילות': ['rival-plumber.co.il', 'easy.co.il', 'instagram.com', 'he.wikipedia.org'],
}

// ── Fixture 2: an English Shopify store ─────────────────────────────────────

export const EN_SHOP = {
  target: 'https://northwind-candles.com',
  key: 'northwind-candles.com',
  home: 'https://www.northwind-candles.com/',
  html: `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Northwind Candles — Hand-poured soy candles</title>
<meta name="description" content="Hand-poured soy candles made in Portland. Clean-burning scents, reusable jars and free shipping on orders over $50.">
<link rel="canonical" href="https://www.northwind-candles.com/">
<meta property="og:title" content="Northwind Candles">
<script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"OnlineStore","name":"Northwind Candles"}</script>
</head><body><h1>Hand-poured soy candles</h1><h2>Bestsellers</h2>
<p>Every Northwind candle is poured by hand in small batches in Portland, Oregon.</p>
<a href="/collections/all">Shop</a><a href="/pages/about">About</a>
</body></html>`,
}

const SHOPIFY_HEADERS = { 'x-shopid': '4242', 'powered-by': 'Shopify' }

export function enShopifySite(): Record<string, FakeRoute> {
  const base = 'https://www.northwind-candles.com'
  return {
    'https://northwind-candles.com/': redirect(`${base}/`, SHOPIFY_HEADERS),
    [`${base}/`]: html(EN_SHOP.html, SHOPIFY_HEADERS),
    [`${base}/robots.txt`]: text(`User-agent: *\nDisallow: /checkout\n\nSitemap: ${base}/sitemap.xml\n`),
    [`${base}/llms.txt`]: text('# Northwind Candles\n> Hand-poured soy candles.\n'),
    [`${base}/sitemap.xml`]: xml(
      sitemapIndex([
        // Newest first is how the engine expands an index; the off-host child is
        // the newest, so it is certainly among those expanded.
        { loc: 'https://cdn.evil-sitemaps.com/sitemap_x.xml', lastmod: '2026-09-20' },
        { loc: `${base}/sitemap_products_1.xml?from=1&to=99`, lastmod: '2026-09-10' },
        { loc: `${base}/sitemap_pages_1.xml`, lastmod: '2026-09-09' },
        { loc: `${base}/sitemap_collections_1.xml`, lastmod: '2026-09-08' },
        { loc: `${base}/sitemap_blogs_1.xml`, lastmod: '2026-09-07' },
      ]),
    ),
    [`${base}/sitemap_products_1.xml?from=1&to=99`]: xml(urlset(Array.from({ length: 8 }, (_, i) => `${base}/products/candle-${i + 1}`))),
    [`${base}/sitemap_pages_1.xml`]: xml(urlset([`${base}/pages/about`, `${base}/pages/contact`, `${base}/pages/faq`])),
    [`${base}/sitemap_collections_1.xml`]: xml(urlset([`${base}/collections/all`, `${base}/collections/gifts`])),
    [`${base}/sitemap_blogs_1.xml`]: xml(urlset([`${base}/blogs/journal`])),
    'https://cdn.evil-sitemaps.com/sitemap_x.xml': xml(urlset(['https://cdn.evil-sitemaps.com/x'])),
  }
}

export const EN_SHOP_INSIGHT: BusinessInsight = {
  business: {
    summary: 'Northwind Candles sells hand-poured soy candles in reusable jars, made in small batches in Portland.',
    audiences: ['Gift shoppers', 'Home decor enthusiasts', 'Eco-conscious buyers'],
    niche: 'Soy candles online',
    platform: 'Shopify',
    companyName: 'Northwind Candles',
    commerceType: 'product',
    isLocal: false,
    country: 'US',
    language: 'en',
    address: null,
    phone: null,
  },
  keywords: ['soy candles', 'hand poured candles', 'candle gift set', 'scented candles online', 'reusable jar candles'],
  articles: ['How to make a candle burn evenly', 'Soy vs paraffin wax', 'The best candle gifts', 'Candle care guide', 'Scents for every room'],
  competitors: ['brooklyncandlestudio.com', 'boysmells.com'],
}

// ── Fixture 3: a password-locked Shopify store ──────────────────────────────

export const LOCKED_HTML = `<!doctype html><html lang="en"><head><title>Opening soon</title>
<script src="https://cdn.shopify.com/s/files/1/theme.js"></script></head>
<body class="template-password"><h1>Opening soon</h1>
<form method="post" action="/password" id="login_form" accept-charset="UTF-8"><input type="password" name="password"><button>Enter</button></form>
</body></html>`

/** A development store on its myshopify.com address: / → /password, which answers 401. */
export function lockedShopifySite401(): Record<string, FakeRoute> {
  const base = 'https://dev-store-42.myshopify.com'
  return {
    [`${base}/`]: redirect(`${base}/password`, SHOPIFY_HEADERS, 302),
    [`${base}/password`]: { status: 401, headers: { 'content-type': 'text/html', ...SHOPIFY_HEADERS }, body: LOCKED_HTML },
  }
}

/** A store on its own domain not opened yet: / → /password, which answers 200 with the password form. */
export function lockedShopifySite200(): Record<string, FakeRoute> {
  const base = 'https://locked-candles.com'
  return {
    [`${base}/`]: redirect(`${base}/password`, { 'powered-by': 'Shopify' }, 302),
    [`${base}/password`]: html(LOCKED_HTML, { 'powered-by': 'Shopify' }),
  }
}

// ── Fixture 4: a site with no sitemap ───────────────────────────────────────

export const NO_SITEMAP = {
  target: 'tiny-bakery.com',
  key: 'tiny-bakery.com',
  html: `<!doctype html><html lang="en"><head><title>Tiny Bakery — sourdough in Leeds</title></head>
<body><h1>Tiny Bakery</h1><p>Fresh sourdough every morning.</p></body></html>`,
}

export function noSitemapSite(): Record<string, FakeRoute> {
  return { 'https://tiny-bakery.com/': html(NO_SITEMAP.html) }
}

// ── The model and the search ────────────────────────────────────────────────

export type ModelCall = { locale: string; selfDomain: string; finalUrl: string }

/** A model that answers `answer` (or throws / hangs), and counts every call. */
export function fakeModel(answer: InsightResult | (() => Promise<InsightResult>)) {
  const calls: ModelCall[] = []
  const fn = async (signals: { finalUrl: string }, locale: string, selfDomain: string): Promise<InsightResult> => {
    calls.push({ locale, selfDomain, finalUrl: signals.finalUrl })
    return typeof answer === 'function' ? answer() : answer
  }
  return { fn: fn as unknown as typeof import('@/lib/free-check').fetchBusinessInsight, calls }
}

export type SearchCall = { query: string; gl: string; hl: string }

/** A search that answers from a table by query, and counts every call. */
export function fakeSearch(table: Record<string, string[] | SearchOutcome | (() => Promise<SearchOutcome>)> = {}) {
  const calls: SearchCall[] = []
  const fn: SearchFn = async (query, market) => {
    calls.push({ query, ...market })
    const entry = table[query]
    if (typeof entry === 'function') return entry()
    if (Array.isArray(entry)) return { ok: true, domains: entry }
    return entry ?? { ok: true, domains: [] }
  }
  return { fn, calls }
}

// ── The database ────────────────────────────────────────────────────────────

export type Tables = Record<string, Record<string, unknown>[]>

export function projectRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PROJECT,
    user_id: USER,
    name: 'My site',
    target_domain: HE_WP.target,
    business_name: null,
    country: null,
    language: null,
    city: null,
    // Columns the scan must never touch.
    keywords: ['kept keyword'],
    description: 'kept project description',
    created_at: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

/**
 * A FakeAdmin with one project. FakeAdmin applies no column defaults, so the
 * one default the store relies on is simulated here: project_seed_runs.created_at
 * is `DEFAULT now()` of the inserting transaction, i.e. strictly in insert order
 * (`dbNow` is the database's clock; ties move forward a millisecond).
 */
export function world(
  project: Record<string, unknown> = projectRow(),
  extra: Tables = {},
  hooks: Record<string, unknown> = {},
  dbNow: () => Date = () => NOW,
) {
  const tables: Tables = {
    projects: [project],
    project_profiles: [],
    project_audiences: [],
    project_seed_runs: [],
    project_seed_steps: [],
    ai_visibility_competitors: [],
    ...extra,
  }
  const fake = new FakeAdmin(tables, hooks as never)
  let last = 0
  const from = fake.from.bind(fake)
  ;(fake as unknown as { from: (name: string) => unknown }).from = (name: string) => {
    const query = from(name) as unknown as { insert: (payload: unknown) => unknown }
    if (name === 'project_seed_runs') {
      const insert = query.insert.bind(query)
      query.insert = (payload: unknown) => {
        const withDefault = (row: Record<string, unknown>) => {
          if (row.created_at !== undefined) return row
          last = Math.max(last + 1, dbNow().getTime())
          return { ...row, created_at: new Date(last).toISOString() }
        }
        return insert(Array.isArray(payload) ? payload.map(withDefault) : withDefault(payload as Record<string, unknown>))
      }
    }
    return query
  }
  return { tables, fake, admin: fake as unknown as ServiceRoleClient }
}

// ── Claims ──────────────────────────────────────────────────────────────────

/** A free-check ledger row as consumeClaimToken returns it (the gated, public result). */
export function claimedScan(over: { domain?: string; url?: string; business?: boolean; locale?: 'he' | 'en' } = {}) {
  const domain = over.domain ?? HE_WP.key
  const result: FreeCheckResult = {
    url: over.url ?? `https://www.${domain}/`,
    domain,
    scannedAt: '2026-09-27T09:00:00.000Z',
    locale: over.locale ?? 'he',
    business: over.business === false ? null : { ...HE_WP_INSIGHT.business },
    keywords: over.business === false ? [] : HE_WP_INSIGHT.keywords,
    articles: over.business === false ? [] : HE_WP_INSIGHT.articles,
    competitors: HE_WP_INSIGHT.competitors.slice(0, 2),
    lockedCompetitors: 1,
    findings: [
      { id: 'robots_blocks_ai', severity: 'blocker', title: 'AI blocked', detail: 'robots.txt blocks GPTBot' },
      { id: 'images_alt', severity: 'warning', title: 'Alt text', detail: 'Images without alt', evidence: '1 of 2' },
      { id: 'thin_content', severity: 'warning', title: 'Thin', detail: 'Little text' },
    ],
    lockedFindings: 2,
    geo: {
      passed: 2,
      total: 4,
      signals: [
        { id: 'schema', ok: true, title: 's', detail: 'd' },
        { id: 'faq', ok: true, title: 'f', detail: 'd' },
        { id: 'robots', ok: false, title: 'r', detail: 'd' },
        { id: 'llms', ok: false, title: 'l', detail: 'd' },
      ],
    },
    counters: { keywords: 5, fixes: 5, geoPassed: 2, geoTotal: 4, articles: 5 },
    aiUsed: over.business !== false,
    cached: false,
  }
  // seed: null is a check recorded before free_site_checks.seed existed (09ee926).
  return { checkId: 'check-1', domain, url: result.url, locale: result.locale, result, seed: null }
}

// ── Logs ────────────────────────────────────────────────────────────────────

/** The captures running now, and the console they replaced. */
const captures: string[][] = []
let realConsole: Pick<Console, 'log' | 'warn' | 'error' | 'info'> | null = null

/**
 * Capture everything written to the console while `work` runs (and keep it
 * quiet). Captures may overlap (two requests at once): every line goes to each
 * capture running at that moment, and the real console comes back when the
 * last of them ends, whatever order they end in.
 */
export async function captureConsole<T>(work: () => Promise<T>): Promise<{ value: T; output: string }> {
  const lines: string[] = []
  if (captures.length === 0) {
    realConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info }
    const sink = (...args: unknown[]) => {
      const line = args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ')
      for (const c of captures) c.push(line)
    }
    console.log = sink
    console.warn = sink
    console.error = sink
    console.info = sink
  }
  captures.push(lines)
  try {
    const value = await work()
    return { value, output: lines.join('\n') }
  } finally {
    captures.splice(captures.indexOf(lines), 1)
    if (captures.length === 0 && realConsole) {
      console.log = realConsole.log
      console.warn = realConsole.warn
      console.error = realConsole.error
      console.info = realConsole.info
      realConsole = null
    }
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, x) => (x instanceof Error ? { name: x.name, message: x.message } : x))
  } catch {
    return String(v)
  }
}
