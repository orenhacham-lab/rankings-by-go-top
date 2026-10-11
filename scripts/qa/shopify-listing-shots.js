/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * SHOPIFY APP STORE LISTING SCREENSHOTS, 1600x900, from the CURRENT app.
 *
 * Not a QA journey: a deliverable generator. It signs in to a real `next start`
 * production build over the Supabase stub, seeds a FICTIONAL US coffee store
 * (Shopify's screenshot rules forbid personally identifiable information and
 * real customer data), and photographs each listing screen at exactly
 * 1600x900 with no browser chrome — Playwright paints the page alone, so there
 * is nothing to crop.
 *
 *   bash scripts/qa/journeys.sh --no-build            # build first, once
 *   node scripts/qa/shopify-listing-shots.js          # then this
 *
 * Standalone against a server and stub already up:
 *   SL_BASE_URL=http://127.0.0.1:3991 SL_STUB_URL=http://127.0.0.1:5555 node scripts/qa/shopify-listing-shots.js
 */
const { spawn } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync, copyFileSync, existsSync, readFileSync } = require('fs')

const ROOT = resolve(__dirname, '../..')
const OWN_SERVER = !process.env.SL_BASE_URL
const PORT = 3991
const BASE = process.env.SL_BASE_URL || `http://127.0.0.1:${PORT}`
const STUB = process.env.SL_STUB_URL || 'http://127.0.0.1:5555'
/*
 * The UI language of the shots. The dashboard reads it from the
 * `dashboard-language` cookie (lib/i18n/request-locale.ts), and Spanish only
 * exists in a build made with NEXT_PUBLIC_SPANISH_SITE_ENABLED=true, because
 * Next inlines that at BUILD time — see lib/i18n/spanish-site.ts. So:
 *
 *   SL_LANG=es node scripts/qa/shopify-listing-shots.js
 *
 * with the build made under that flag. A run under the wrong build does not
 * fail quietly: MARKERS below asserts words only that language's dictionary
 * has, because Spanish is English with the translated sections laid over it
 * (lib/i18n/dashboard/getDashboardDictionary.ts), so a missing flag renders a
 * perfectly valid ENGLISH page that would otherwise pass every other check.
 */
const LANG = process.env.SL_LANG || 'en'
const LOCALES = { en: 'en-US', es: 'es-ES', he: 'he-IL', 'pt-BR': 'pt-BR' }
const LOCALE = process.env.SL_LOCALE || LOCALES[LANG] || 'en-US'
const SUFFIX = LANG === 'en' ? '' : `-${LANG}`
/** Words the language's own dictionary has and English does not. */
const MARKERS = { es: ['Palabras clave', 'Visibilidad en IA', 'Cerrar sesión'] }
const SHOTS = process.env.SL_SHOT_DIR || `/tmp/qa-logs/shopify-listing${SUFFIX}`
const MIRROR = `/mnt/project-files/shopify-listing/screenshots${SUFFIX}`
const PID = 'a1111111-2222-3333-4444-555555555555'
const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const W = 1600, H = 900
// The phone is captured portrait at 900x1600, then centred on a 1600x900 canvas,
// because the listing form takes every screenshot at 1600x900 (owner, 2026-10-11).
const MW = 900, MH = 1600
const CANVAS = '#f7f6f2'   // the app's own page colour, sampled from a desktop shot
const PHONE_H = Number(process.env.SL_PHONE_H || 800) // leaves air above and below for the corner and shadow

mkdirSync(SHOTS, { recursive: true })
let mirror = null
try { mkdirSync(MIRROR, { recursive: true }); mirror = MIRROR } catch { /* not this container */ }

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const SCREENS = [
  { name: '01-dashboard', path: `/dashboard?projectId=${PID}`, ready: '[data-dashboard-widget="hero"]' },
  { name: '02-ai-visibility', path: `/ai-visibility?projectId=${PID}` },
  { name: '04-keyword-research', path: `/keyword-research?projectId=${PID}`, ready: '#research-table' },
  { name: '05-content', path: `/content?projectId=${PID}` },
  { name: '06-keywords', path: `/keywords?projectId=${PID}` },
  { name: '07-reports', path: `/reports?projectId=${PID}` },
]

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// ── the fixture: a FICTIONAL coffee roaster, no real person or customer in it ──
/*
 * One per listing language, because a Spanish merchant reading the listing
 * should see a Spanish shop: Shopify's screenshot rules forbid real customer
 * data, and an English shop inside a Spanish screenshot reads as a translated
 * demo rather than the product. Everything here is invented; `.example` can
 * never resolve.
 */
const FIXTURES = {
  en: {
    name: 'Harbor Coffee Roasters', domain: 'harbor-coffee.example', shop: 'harbor-coffee.myshopify.com', country: 'US', city: 'Portland', lang: 'en',
    keywords: [
      ['single origin coffee beans', 'google_search', 14, 6],
      ['cold brew concentrate', 'google_search', 9, 4],
      ['coffee roaster portland', 'google_maps', 7, 3],
      ['espresso beans online', 'google_search', 22, 18],
      ['pour over coffee kit', 'google_search', null, 27],
    ],
    competitor: { name: 'Lighthouse Coffee Co.', domain: 'lighthouse-coffee.example' },
    questions: [
      ['Where can I buy single origin coffee beans online?', true, true],
      ['Best cold brew concentrate to order', true, false],
      ['Which Portland roaster ships nationwide?', true, true],
    ],
    mentioned: 'Harbor Coffee Roasters is named among the recommended roasters.',
    notMentioned: 'The answer names other roasters only.',
    collection: 'https://harbor-coffee.example/collections/beans',
    citationTitle: 'Single origin beans',
    blog: 'News',
    articles: ['How to brew cold brew concentrate at home', 'Single origin vs blend: which beans to buy', 'A pour over guide for your first kit'],
    seedKeyword: 'coffee beans', currency: 'USD',
    research: ['cold brew concentrate', 'single origin coffee beans', 'best espresso beans', 'pour over coffee kit',
      'whole bean coffee subscription', 'light roast coffee online'],
  },
  es: {
    name: 'Tostadores Río Café', domain: 'tostadores-rio.example', shop: 'tostadores-rio.myshopify.com', country: 'ES', city: 'Madrid', lang: 'es',
    keywords: [
      ['café de origen único', 'google_search', 14, 6],
      ['café en grano para espresso', 'google_search', 9, 4],
      ['tostador de café madrid', 'google_maps', 7, 3],
      ['comprar café recién tostado', 'google_search', 22, 18],
      ['kit de café de filtro', 'google_search', null, 27],
    ],
    competitor: { name: 'Faro Café', domain: 'faro-cafe.example' },
    questions: [
      ['¿Dónde comprar café de origen único por internet?', true, true],
      ['Mejor café en grano para espresso en casa', true, false],
      ['¿Qué tostador de Madrid envía a toda España?', true, true],
    ],
    mentioned: 'Tostadores Río Café aparece entre los tostadores recomendados.',
    notMentioned: 'La respuesta solo menciona a otros tostadores.',
    collection: 'https://tostadores-rio.example/colecciones/cafe',
    citationTitle: 'Café de origen único',
    blog: 'Noticias',
    articles: ['Cómo preparar café de filtro en casa', 'Origen único o mezcla: qué grano comprar', 'Guía para empezar con el café de filtro'],
    seedKeyword: 'café en grano', currency: 'EUR',
    research: ['café en grano para espresso', 'café de origen único', 'mejor café para cafetera italiana', 'kit de café de filtro',
      'suscripción de café en grano', 'café de tueste claro online'],
  },
}
const F = FIXTURES[LANG] || FIXTURES.en
const H_ = { 'content-type': 'application/json', authorization: 'Bearer stub-service-key', apikey: 'stub-service-key' }
const iso = (ms) => new Date(ms).toISOString()
async function rest(method, path, body) {
  const r = await fetch(`${STUB}/rest/v1/${path}`, { method, headers: H_, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}`)
}
async function seed() {
  await fetch(`${STUB}/__stub/reset`).catch(() => {})
  const now = Date.now()
  await rest('PATCH', `projects?id=eq.${PID}`, {
    name: F.name, business_name: F.name,
    target_domain: F.domain, country: F.country, city: F.city,
    language: F.lang, device_type: 'desktop', scan_frequency: 'monthly',
    // The last check: without it the hero said "not checked yet" beside the figures it had just checked.
    last_scan_at: iso(now - 3 * 3600000),
  })
  const KW = F.keywords
  await rest('POST', 'tracking_targets', KW.map(([keyword, engine_type], i) => ({
    id: `tt-${i + 1}`, project_id: PID, user_id: USER, keyword, engine_type, is_active: true,
    avg_monthly_searches: 2400 - i * 300, created_at: iso(now - 40 * 86400000),
  })))
  const D1 = now - 30 * 86400000, D2 = now - 3 * 3600000
  await rest('POST', 'scan_results', KW.flatMap(([keyword, engine_type, before, after], i) => [
    { id: `sr-${i}-a`, scan_id: 'scan-1', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: before !== null, position: before, checked_at: iso(D1) },
    { id: `sr-${i}-b`, scan_id: 'scan-2', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: after !== null, position: after,
      change_value: before && after ? before - after : null, checked_at: iso(D2),
      result_url: after ? F.collection : null },
  ]))
  await rest('POST', 'ai_visibility_competitors', [{ id: 'c1', project_id: PID, user_id: USER,
    name: F.competitor.name, domain: F.competitor.domain, is_active: true, created_at: iso(now - 25 * 86400000) }])
  await rest('POST', 'keyword_competitor_positions', [2, 3].map((n) => ({
    tracking_target_id: `tt-${n}`, competitor_domain: F.competitor.domain, position: n + 1,
    url: `https://${F.competitor.domain}/`, checked_at: iso(D2) })))
  // AI visibility: three questions checked across the three engines of the automatic check.
  const QS = F.questions
  await rest('POST', 'ai_prompts', QS.map(([prompt], i) => ({ id: `p${i + 1}`, project_id: PID, prompt,
    target_domain: F.domain, target_brand_name: F.name,
    country: F.country, language: F.lang, is_active: true,
    created_at: iso(now - 20 * 86400000), updated_at: iso(now - 20 * 86400000) })))
  const ENGINES = ['chatgpt', 'gemini', 'google_ai_mode']
  await rest('POST', 'ai_scan_runs', [{ id: 'ai-run-1', project_id: PID, user_id: USER, provider: 'scrapellm',
    status: 'completed', triggered_by: 'schedule', total_prompts: QS.length, total_engines: ENGINES.length,
    total_tasks: QS.length * ENGINES.length, completed_tasks: QS.length * ENGINES.length, failed_tasks: 0,
    total_credits_used: QS.length * ENGINES.length, started_at: iso(now - 2 * 86400000),
    completed_at: iso(now - 2 * 86400000 + 120000), error_message: null, created_at: iso(now - 2 * 86400000) }])
  const results = []
  const cites = []
  QS.forEach(([, mentioned, cited], i) => ENGINES.forEach((engine, e) => {
    const on = mentioned && (e < 2 || cited)
    const id = `air-${i}-${e}`
    results.push({ id, run_id: 'ai-run-1', project_id: PID, prompt_id: `p${i + 1}`, engine, provider: 'scrapellm',
      mentioned: on, target_cited: on && cited, mention_positions: null, citation_count: on && cited ? 1 : 0,
      source_count: 4 + e, competitors_mentioned: null,
      response_summary: on ? F.mentioned : F.notMentioned,
      response_text: null, raw_response: null, visibility_score: on ? 72 + e * 6 : 0, credits_used: 1,
      status: 'success', error_message: null, scanned_at: iso(now - 2 * 86400000), created_at: iso(now - 2 * 86400000) })
    if (on && cited) cites.push({ id: `aic-${i}-${e}`, result_id: id, project_id: PID, prompt_id: `p${i + 1}`, engine,
      provider: 'scrapellm', url: F.collection, domain: F.domain,
      title: F.citationTitle, snippet: null, citation_position: 1, is_target_domain: true, created_at: iso(now - 2 * 86400000) })
  }))
  await rest('POST', 'ai_scan_results', results)
  if (cites.length) await rest('POST', 'ai_citations', cites)

  /*
   * The store IS connected. Without this row the articles screen drew "connect a
   * platform" across the top, which is the one thing a Shopify App Store listing
   * must not show. Seeded rather than intercepted, so every screen that asks
   * about the connection gets the same answer. The token is a placeholder: the
   * column is NOT NULL and nothing in these shots ever calls Shopify.
   */
  await rest('POST', 'shopify_connections', [{ id: 'sc-1', user_id: USER, project_id: PID,
    shop_domain: F.shop, storefront_domain: F.domain, access_token_encrypted: 'stub:stub:stub',
    api_version: '2026-07', connection_status: 'connected', last_tested_at: iso(now - 86400000),
    last_synced_at: iso(now - 86400000), last_error: null, auth_method: 'oauth',
    granted_scopes: ['read_products', 'read_content', 'write_content'], default_blog_id: '1',
    created_at: iso(now - 40 * 86400000), updated_at: iso(now - 86400000) }])
  const ENTITY_COUNTS = { product: 42, collection: 6, page: 9, blog: 1, article: 3 }
  await rest('POST', 'shopify_entities', Object.entries(ENTITY_COUNTS).flatMap(([entity_type, n]) =>
    Array.from({ length: n }, (_, k) => ({ id: `se-${entity_type}-${k}`, user_id: USER, project_id: PID,
      connection_id: 'sc-1', shopify_gid: `gid://shopify/${entity_type}/${k + 1}`, entity_type,
      shopify_numeric_id: String(k + 1), title: null, handle: null, canonical_url: null, is_active: true,
      created_at: iso(now - 30 * 86400000), updated_at: iso(now - 86400000) }))))

  await rest('POST', 'generated_articles', [
    { id: 'ga-1', project_id: PID, user_id: USER, title: F.articles[0], status: 'published',
      created_at: iso(now - 4 * 86400000), updated_at: iso(now - 3 * 86400000), published_at: iso(now - 3 * 86400000) },
    { id: 'ga-2', project_id: PID, user_id: USER, title: F.articles[1], status: 'draft',
      created_at: iso(now - 2 * 86400000), updated_at: iso(now - 86400000) },
    { id: 'ga-3', project_id: PID, user_id: USER, title: F.articles[2], status: 'scheduled',
      created_at: iso(now - 86400000), updated_at: iso(now - 3600000) },
  ])
}

const START = Date.now() - 3 * 86400000
const seedRun = { ok: true, run: { id: 'run-1', stage: 'b', status: 'done', stalled: false, startedAt: iso(START),
  steps: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((step) => ({ step, status: 'done', errorCode: null, itemCount: null, startedAt: null, finishedAt: null })),
  summary: { version: 1, source: 'scan', domain: F.domain, url: `https://${F.domain}/`, scannedAt: iso(START), locale: F.lang,
    storefrontLocked: false, siteAccess: 'direct', business: null, audiences: [], seedKeywords: [F.seedKeyword], topics: [],
    findings: [], findingsOmitted: 0, geo: { state: 'measured', unavailableReason: null, passed: 3, total: 4, signals: [] }, competitors: [],
    counters: { keywords: 5, fixes: 0, geo: 3, articles: 3, competitors: 1 }, sitemapUrlCount: 62, sitemapTruncated: false } } }
/** The store IS connected in these screenshots: a listing shows the product at work, not its first run. */
const waiting = { ok: true, connectionDown: false, articles: 0, topics: 0, queued: 0, queueEndsAt: null,
  pluginConnected: false, siteConnected: true, gscConnected: true }

const LEVELS = ['LOW', 'MEDIUM', 'HIGH']
const research = { ok: true, market: { country: F.country, language: F.lang }, fetchedAt: iso(START + 60000), truncated: false, tracked: [],
  keywords: F.research.map((keyword, i) => ({ keyword,
    avgMonthlySearches: 9900 - i * 1200, competition: LEVELS[i % 3], competitionIndex: 18 + i * 12,
    lowTopOfPageBid: 0.9 + i * 0.3, highTopOfPageBid: 3.4 + i * 1.1, currency: F.currency,
    origins: ['site'], competitors: [], relevant: true })) }

;(async () => {
  if (!existsSync(join(ROOT, '.next'))) { console.log('no .next build — run: bash scripts/qa/journeys.sh (builds once)'); process.exitCode = 1; return }

  let server = null
  if (OWN_SERVER) {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', SERPER_API_KEY: 'unreachable-by-design',
      ENABLE_CONTENT: 'true', NEXT_PUBLIC_ENABLE_CONTENT: 'true',
      ENABLE_AI_VISIBILITY: 'true', NEXT_PUBLIC_ENABLE_AI_VISIBILITY: 'true' }
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, detached: true, stdio: 'ignore', env })
  }
  const kill = () => { if (server) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* gone */ } } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); process.exitCode = 1; return }
  try { await seed() } catch (e) { check('the fixture seeds', false, e.message) }

  const { chromium } = require(require.resolve('playwright-core', { paths: [ROOT] }))
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })

  /**
   * One pass over every screen at one size. Desktop is the 1600x900 the listing
   * asks for; mobile is the same ratio turned on its side (450x800 CSS at 2x =
   * 900x1600), because Shopify documents no mobile size and ships no mobile
   * template — only the 16:9 Screenshot.psd.
   */
  const capture = async ({ tag, width, height, scale, mobile }) => {
    const ctx = await browser.newContext({
      viewport: { width, height }, locale: LOCALE, deviceScaleFactor: scale,
      isMobile: mobile, hasTouch: mobile,
    })
    await ctx.addCookies([{ name: 'dashboard-language', value: LANG, url: BASE }])
    const page = await ctx.newPage()
    await page.route('**/*', (route) => {
      const req = route.request()
      const u = new URL(req.url())
      if (u.hostname !== '127.0.0.1') return route.abort()
      if (u.pathname === `/api/projects/${PID}/seed` && req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seedRun) })
      if (u.pathname === '/api/keyword-research/scan') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(research) })
      if (u.pathname === `/api/projects/${PID}/waiting`) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(waiting) })
      // The destination card asks Shopify itself which blogs the store has. The
      // stub cannot answer, and the card then says, correctly, that it could not
      // read them — in red, across the listing image.
      if (u.pathname === '/api/shopify/blogs') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blogs: [{ id: '1', title: F.blog, handle: 'news' }] }) })
      return route.continue()
    })
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')])

    const dismissTour = async () => {
      for (let i = 0; i < 3; i++) {
        const skip = page.locator('button', { hasText: /^(skip|close|got it|finish|done)$/i }).first()
        if (!(await skip.isVisible().catch(() => false))) break
        await skip.click({ timeout: 3000 }).catch(() => {})
        await page.waitForTimeout(400)
      }
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(400)
    }

    const go = async (path, ready) => {
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null)
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
      if (ready) await page.locator(ready).first().waitFor({ timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(1200)
      await dismissTour()
      return resp ? resp.status() : null
    }

    // The guided tour opens by itself on a fresh account and would cover the screen.
    await go(`/dashboard?projectId=${PID}`, '[data-dashboard-widget="hero"]')

    for (const sc of SCREENS) {
      const status = await go(sc.path, sc.ready)
      const name = `${tag === 'mobile' ? 'rawmobile' : tag}-${sc.name}`
      const file = join(SHOTS, `${name}.png`)
      // Viewport-only, never fullPage: the listing wants an exact size.
      await page.screenshot({ path: file }).catch(() => {})
      if (mirror) { try { copyFileSync(file, join(mirror, `${name}.png`)) } catch { /* best effort */ } }
      // `200 and some text` is not enough: a bounce to /login answers 200 too, and
      // every screen then photographs identically. The screen must still be itself.
      const body = await page.evaluate(() => (document.body.innerText || '').trim().length)
      const here = new URL(page.url()).pathname
      const want = new URL(sc.path, BASE).pathname
      check(`${name}: rendered its own screen (${body} chars)`,
        status === 200 && body > 200 && here === want, `status=${status} at=${here} want=${want}`)
      // A wrong build serves English under an `es` cookie, and every check above
      // still passes. One word of the language's own dictionary settles it.
      const want2 = MARKERS[LANG]
      if (want2 && tag === 'desktop') {
        const text = await page.evaluate(() => document.body.innerText || '')
        const hit = want2.find((w) => text.includes(w))
        check(`${name}: is in ${LANG} (${hit || 'none of ' + want2.join(', ')})`, Boolean(hit))
      }
    }
    await ctx.close().catch(() => {})
  }

  /**
   * The listing form takes mobile screenshots at 1600x900 too, so a portrait
   * phone capture cannot be uploaded as it stands. Each one is centred on a
   * 1600x900 canvas painted the app's own page colour, as tall as the frame
   * allows. Chromium does the compositing, so nothing is added to the toolchain
   * and the rounded corner and shadow come from CSS.
   */
  const composeMobile = async () => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    for (const sc of SCREENS) {
      const src = join(SHOTS, `rawmobile-${sc.name}.png`)
      if (!existsSync(src)) { check(`mobile-${sc.name}: portrait capture exists`, false, src); continue }
      const b64 = readFileSync(src).toString('base64')
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>
        html,body{margin:0;height:100%}
        body{background:${CANVAS};display:flex;align-items:center;justify-content:center}
        img{height:${PHONE_H}px;width:auto;display:block;border-radius:18px;
            box-shadow:0 18px 48px rgba(16,24,40,.18),0 2px 6px rgba(16,24,40,.08)}
      </style><img src="data:image/png;base64,${b64}">`, { waitUntil: 'load' })
      await page.waitForTimeout(250)
      const name = `mobile-${sc.name}`
      const file = join(SHOTS, `${name}.png`)
      await page.screenshot({ path: file }).catch(() => {})
      if (mirror) { try { copyFileSync(file, join(mirror, `${name}.png`)) } catch { /* best effort */ } }
      const { width, height } = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      check(`${name}: composed at ${W}x${H}`, width === W && height === H, `${width}x${height}`)
    }
    await ctx.close().catch(() => {})
  }

  /*
   * The submission form takes ONE feature image, THREE desktop screenshots and
   * SIX mobile ones (owner, from the live form, 2026-10-11), each in upload
   * order. The captures are named after the screen; these are the files to
   * upload, named after the box they go in, so nothing has to be matched by eye.
   */
  const FINAL = [
    ['desktop-01-dashboard', 'feature-media-1600x900'],
    ['desktop-06-keywords', 'desktop-1-rank-tracking'],
    ['desktop-02-ai-visibility', 'desktop-2-ai-visibility'],
    ['desktop-05-content', 'desktop-3-articles'],
    ['mobile-01-dashboard', 'mobile-1-dashboard'],
    ['mobile-06-keywords', 'mobile-2-rank-tracking'],
    ['mobile-02-ai-visibility', 'mobile-3-ai-visibility'],
    ['mobile-05-content', 'mobile-4-articles'],
    ['mobile-04-keyword-research', 'mobile-5-keyword-research'],
    ['mobile-07-reports', 'mobile-6-reports'],
  ]
  const nameForUpload = () => {
    for (const [from, to] of FINAL) {
      const src = join(SHOTS, `${from}.png`)
      if (!existsSync(src)) { check(`${to}: its capture exists`, false, src); continue }
      copyFileSync(src, join(SHOTS, `${to}.png`))
      if (mirror) { try { copyFileSync(src, join(mirror, `${to}.png`)) } catch { /* best effort */ } }
    }
    check(`the ${FINAL.length} files to upload are named after their box`, true)
  }

  try {
    await capture({ tag: 'desktop', width: W, height: H, scale: 1, mobile: false })
    await capture({ tag: 'mobile', width: MW / 2, height: MH / 2, scale: 2, mobile: true })
    await composeMobile()
    nameForUpload()
  } finally {
    await browser.close().catch(() => {})
    kill()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  console.log(`shots in ${SHOTS}${mirror ? ` (mirrored to ${mirror})` : ''}`)
  if (fail) process.exitCode = 1
})()
