/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * THE PER-SCREEN TOURS, WALKED IN A REAL BROWSER.
 *
 * The owner's complaint on 5 October 2026 was about the tours themselves: the
 * guide "is not detailed enough in many of the tabs and only talks about the
 * title". lib/guide/__qa__/guide-tours.qa.ts proves the step LISTS are long and
 * that every selector they name exists in the code. Neither can prove that a
 * step is actually SHOWN: the runner silently skips a step whose target is not
 * on the page, which is exactly how a tour ends up talking about the title and
 * nothing else — and what a tab panel does, because it is not in the document
 * until its tab is open.
 *
 * So this journey opens the Guide pill on every screen, clicks "a tour of this
 * screen", and walks the tour to its end, step by step, asserting on each one:
 *
 *   1. the bubble names a step of THIS screen's tour (`data-tour-bubble` is the
 *      step key the runner resolved, variants included), in the tour's order and
 *      never twice;
 *   2. its title and its body are, character for character, the Hebrew
 *      dictionary's text for that key — read from the dictionary at run time, so
 *      a renamed key or an empty string cannot pass;
 *   3. the bubble is pointing at something: the spotlight is on a real element
 *      with a real size, never at thin air;
 *   4. and the screen's tour as a whole is not back to its title: at least five
 *      steps shown, at least four of them about the screen's own cards and
 *      controls.
 *
 * THE TABS, which is the part that was silent. A step inside a tab carries the
 * tab's own control (`activate` in lib/guide/tours.ts); the runner clicks it
 * once and waits for the panel. The two screens built out of tabs must show
 * their tab steps here, by key:
 *
 *   - AI visibility: results, questions, suggested questions, insights, rivals;
 *   - the article editor: the metadata, the body, the FAQ and the image (all in
 *     the edit column, which opens only when a step opens it), publishing, the
 *     save bar, and the "markup for Google" tab.
 *
 * A screenshot per step goes to QA_SCREENSHOT_DIR (mirrored to
 * /mnt/project-files/tours when that exists), so the wording can be read as a
 * merchant sees it rather than as a dictionary entry.
 *
 * Standalone, against a server and stub that are already running:
 *   TOURS_BASE_URL=http://127.0.0.1:3995 node lib/__qa__/reviewer-journey/screen-tours.js
 */
const { spawn, spawnSync } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync, copyFileSync, readdirSync } = require('fs')

const ROOT = resolve(__dirname, '../../..')
const OWN_SERVER = !process.env.TOURS_BASE_URL
const PORT = Number(process.env.JOURNEY_PORT || 3995)
const BASE = process.env.TOURS_BASE_URL || `http://127.0.0.1:${PORT}`
const STUB = process.env.TOURS_STUB_URL || 'http://127.0.0.1:5555'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/screen-tours'
const MIRROR = '/mnt/project-files/tours'
const PID = 'a1111111-2222-3333-4444-555555555555'
const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'

mkdirSync(SHOTS, { recursive: true })
let mirror = null
try { mkdirSync(MIRROR, { recursive: true }); mirror = MIRROR } catch { /* not this container */ }

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
const done = () => console.log(`\n${pass} passed, ${fail} failed`)

// ── the tours and their texts, read at run time ─────────────────────────────
// Never copied into this file: the assertion is that the screen shows what the
// dictionary says, so both sides have to come from the product.
function productFacts() {
  const code = `
    const { SCREEN_TOURS } = require('./lib/guide/tours')
    const { dashboardHe } = require('./lib/i18n/dashboard/he')
    const tours = {}
    const targets = {}
    for (const [screen, tour] of Object.entries(SCREEN_TOURS)) {
      tours[screen] = {
        path: tour.path,
        steps: tour.steps.map((s) => ({ key: s.key, activate: s.activate ?? null, variants: Object.values(s.variants ?? {}) })),
      }
      targets[screen] = Object.fromEntries(tour.steps.map((s) => [s.key, s.target]))
    }
    process.stdout.write(JSON.stringify({
      tours,
      targets,
      steps: dashboardHe.guide.steps,
      menu: { screenTour: dashboardHe.guide.screenTour, next: dashboardHe.guide.tour.next, done: dashboardHe.guide.tour.done },
    }))`
  const r = spawnSync(join(ROOT, 'node_modules/.bin/tsx'), ['-e', code], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`reading the tours failed: ${(r.stderr || '').split('\n').slice(-6).join(' ')}`)
  return JSON.parse(r.stdout)
}

/** The screens, in the order a merchant meets them. `ready` is what says the screen arrived. */
const SCREENS = [
  { screen: 'dashboard', name: '01-dashboard', path: `/dashboard?projectId=${PID}`, ready: '[data-dashboard-widget="hero"]' },
  { screen: 'projects', name: '02-projects', path: '/projects' },
  { screen: 'keywordResearch', name: '03-keyword-research', path: `/keyword-research?projectId=${PID}`, ready: '#research-table' },
  { screen: 'keywords', name: '04-keywords', path: `/keywords?projectId=${PID}` },
  { screen: 'content', name: '05-content', path: `/content?projectId=${PID}` },
  { screen: 'editor', name: '06-article-editor', path: `/content/articles/ga-1?projectId=${PID}`, ready: '[data-testid="article-top-bar"]' },
  { screen: 'strategy', name: '07-strategy', path: `/content/strategy?projectId=${PID}` },
  { screen: 'aiVisibility', name: '08-ai-visibility', path: `/ai-visibility?projectId=${PID}`, ready: '[data-ai-tablist]' },
  { screen: 'siteHealth', name: '09-site-health', path: `/site-health?projectId=${PID}` },
  { screen: 'siteLinks', name: '10-site-links', path: `/site-links?projectId=${PID}` },
  { screen: 'reports', name: '11-reports', path: `/reports?projectId=${PID}` },
  { screen: 'settings', name: '12-settings', path: `/settings?projectId=${PID}`, ready: '#profile' },
  { screen: 'billing', name: '13-billing', path: '/billing' },
  { screen: 'mapsPosts', name: '14-maps-posts', path: `/maps-posts?projectId=${PID}` },
]

/**
 * The screens whose cards this BUILD cannot put on the page, with the reason.
 * A tour that is thin here is thin because the screen is, and the walk proves it
 * by looking for every unshown step's target in the live DOM. A screen missing
 * from this table must walk its five steps or the journey fails.
 */
const THIN_BY_BUILD = {
  siteHealth: 'the project has never been scanned here, so the screen is its first-run card and the scan button',
  billing: 'no payment provider is configured against the stub, so the plan cards and the manage card do not render',
  mapsPosts: 'Google Business Profile posts are off everywhere until Google approves the API, and the route 404s without the flag',
}

/** The tab steps that were unreachable before the runner learned to open a tab. */
const TAB_STEPS = {
  aiVisibility: ['aiResults', 'aiQueries', 'aiSuggested', 'aiInsights', 'aiCompetitors'],
  editor: ['editorMetadata', 'editorContent', 'editorImage', 'editorPublish', 'editorSave', 'editorSchema'],
}

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// ── the fixture: a project with enough in it that the cards actually render ──
const H = { 'content-type': 'application/json', authorization: 'Bearer stub-service-key', apikey: 'stub-service-key' }
const iso = (ms) => new Date(ms).toISOString()
async function rest(method, path, body) {
  const r = await fetch(`${STUB}/rest/v1/${path}`, { method, headers: H, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}`)
}
async function seed() {
  await fetch(`${STUB}/__stub/reset`).catch(() => {})
  const now = Date.now()
  await rest('PATCH', `projects?id=eq.${PID}`, { name: 'מוסך הצפון', business_name: 'מוסך הצפון',
    target_domain: 'mosach-tsafon.co.il', country: 'IL', city: 'חיפה', language: 'he', device_type: 'desktop', scan_frequency: 'monthly' })
  const KW = [['מוסך בחיפה', 'google_maps', 3, 2], ['טיפול שנתי לרכב', 'google_search', 5, 3],
    ['בדיקת בלמים', 'google_search', 19, 17], ['מוסך מורשה', 'google_search', null, null]]
  await rest('POST', 'tracking_targets', KW.map(([keyword, engine_type], i) => ({ id: `tt-${i + 1}`, project_id: PID, user_id: USER, keyword, engine_type,
    is_active: true, avg_monthly_searches: 1000 + i, created_at: iso(now - 35 * 86400000) })))
  const D1 = now - 30 * 86400000, D2 = now - 3 * 3600000
  await rest('POST', 'scan_results', KW.flatMap(([keyword, engine_type, before, after], i) => [
    { id: `sr-${i}-a`, scan_id: 'scan-1', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: before !== null, position: before, checked_at: iso(D1) },
    { id: `sr-${i}-b`, scan_id: 'scan-2', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: after !== null, position: after,
      change_value: before && after ? before - after : null, checked_at: iso(D2), result_url: after ? 'https://mosach-tsafon.co.il/services' : null },
  ]))
  await rest('POST', 'ai_visibility_competitors', [{ id: 'c1', project_id: PID, user_id: USER, name: 'מוסך מתחרה',
    domain: 'rival-garage.co.il', is_active: true, created_at: iso(now - 20 * 86400000) }])
  await rest('POST', 'keyword_competitor_positions', [2, 3].map((n) => ({ tracking_target_id: `tt-${n}`,
    competitor_domain: 'rival-garage.co.il', position: n, url: 'https://rival-garage.co.il/', checked_at: iso(D2) })))
  await rest('POST', 'generated_articles', [
    { id: 'ga-1', project_id: PID, user_id: USER, title: 'כל מה שצריך לדעת על טיפול שנתי', status: 'draft',
      created_at: iso(now - 2 * 86400000), updated_at: iso(now - 86400000) },
    { id: 'ga-2', project_id: PID, user_id: USER, title: 'מתי מחליפים רפידות בלמים', status: 'published',
      created_at: iso(now - 86400000), updated_at: iso(now - 86400000), published_at: iso(now - 86400000) },
  ])
}

/** The seeding scan, answered in the browser so nothing calls a provider. */
const START = Date.now() - 3 * 86400000
const seedRun = { ok: true, run: { id: 'run-1', stage: 'b', status: 'done', stalled: false, startedAt: iso(START),
  steps: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((step) => ({ step, status: 'done', errorCode: null, itemCount: null, startedAt: null, finishedAt: null })),
  summary: { version: 1, source: 'scan', domain: 'mosach-tsafon.co.il', url: 'https://mosach-tsafon.co.il/', scannedAt: iso(START), locale: 'he',
    storefrontLocked: false, siteAccess: 'direct', business: null, audiences: [], seedKeywords: ['מוסך'], topics: [],
    findings: [], findingsOmitted: 0, geo: { state: 'measured', unavailableReason: null, passed: 3, total: 4, signals: [] }, competitors: [],
    counters: { keywords: 6, fixes: 0, geo: 3, articles: 0, competitors: 1 }, sitemapUrlCount: 40, sitemapTruncated: false } } }
const LEVELS = ['LOW', 'MEDIUM', 'HIGH']
const research = { ok: true, market: { country: 'IL', language: 'he' }, fetchedAt: iso(START + 60000), truncated: false, tracked: [],
  keywords: ['טיפול שנתי', 'החלפת בלמים', 'מוסך מורשה', 'בדיקת מזגן לרכב', 'תיקון תיבת הילוכים', 'טסט לרכב'].map((keyword, i) => ({ keyword,
    avgMonthlySearches: 5000 - i * 400, competition: LEVELS[i % 3], competitionIndex: 15 + i * 13, lowTopOfPageBid: 1.5 + i, highTopOfPageBid: 6 + i * 2,
    currency: 'ILS', origins: ['site'], competitors: [], relevant: true })) }

;(async () => {
  let facts
  try { facts = productFacts() } catch (e) { check('the tours and their Hebrew texts are readable', false, e.message); done(); process.exitCode = 1; return }
  check('every screen with a tour is walked here',
    Object.keys(facts.tours).every((s) => SCREENS.some((x) => x.screen === s)),
    Object.keys(facts.tours).filter((s) => !SCREENS.some((x) => x.screen === s)).join(','))

  let server = null
  if (OWN_SERVER) {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', SERPER_API_KEY: 'unreachable-by-design',
      ENABLE_CONTENT: 'true', NEXT_PUBLIC_ENABLE_CONTENT: 'true',
      ENABLE_AI_VISIBILITY: 'true', NEXT_PUBLIC_ENABLE_AI_VISIBILITY: 'true' }
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, detached: true, stdio: 'ignore', env })
  }
  const kill = () => { if (server) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); console.log(`${pass} passed, ${fail + 1} failed`); process.exitCode = 1; return }
  try { await seed() } catch (e) { check('the fixture seeds', false, e.message) }

  const { chromium } = require(require.resolve('playwright-core', { paths: [ROOT] }))
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' })
    await ctx.addCookies([{ name: 'dashboard-language', value: 'he', url: BASE }])
    const page = await ctx.newPage()
    await page.route('**/*', (route) => {
      const req = route.request()
      const u = new URL(req.url())
      if (u.hostname !== '127.0.0.1') return route.abort()
      if (u.pathname === `/api/projects/${PID}/seed` && req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seedRun) })
      if (u.pathname === '/api/keyword-research/scan') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(research) })
      return route.continue()
    })
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')])

    /** Open the Guide pill and start this screen's own tour. */
    const startScreenTour = async () => {
      // A new account gets a tour on its own (the full tour on the dashboard),
      // and while it runs it holds the page: the pill is behind its overlay. The
      // merchant closes it with Escape, and so does this.
      if (await page.locator('[role="dialog"][data-tour-bubble]').count()) {
        await page.keyboard.press('Escape')
        await page.locator('[role="dialog"][data-tour-bubble]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {})
      }
      await page.click('[data-tour="guide"]')
      const entry = page.locator('[role="menuitem"]', { hasText: facts.menu.screenTour }).first()
      await entry.waitFor({ timeout: 10000 })
      if (await entry.isDisabled()) return false
      await entry.click()
      await page.locator('[role="dialog"][data-tour-bubble]').waitFor({ timeout: 15000 })
      return true
    }

    /** One step, as the merchant sees it. */
    const readStep = () => page.evaluate(() => {
      const bubble = document.querySelector('[role="dialog"][data-tour-bubble]')
      if (!bubble) return null
      const spot = document.querySelector('[data-tour-spotlight]')
      const box = spot ? spot.getBoundingClientRect() : null
      const buttons = [...bubble.querySelectorAll('button')]
      const primary = buttons[buttons.length - 1]
      return {
        key: bubble.getAttribute('data-tour-bubble'),
        title: (bubble.querySelector('h2') || {}).textContent || '',
        body: (bubble.querySelector('p') || {}).textContent || '',
        counter: (bubble.querySelector('span') || {}).textContent || '',
        spotlight: !!box && box.width > 8 && box.height > 8,
        primaryLabel: primary ? (primary.textContent || '').trim() : null,
      }
    })

    for (const s of SCREENS) {
      const tour = facts.tours[s.screen]
      console.log(`\n${s.name} — ${s.path}`)
      const resp = await page.goto(`${BASE}${s.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null)
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
      if (s.ready) await page.locator(s.ready).first().waitFor({ timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(1200)
      // A tour that never starts is dismissed by its own "seen" flag on a second
      // visit, so each screen is visited once and the flags are cleared first.
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('rankings_tour_screen')) localStorage.removeItem(k) })
      check(`${s.name}: the screen answered 200`, (resp && resp.status()) === 200, String(resp && resp.status()))

      let started = false
      try { started = await startScreenTour() } catch (e) { check(`${s.name}: the Guide pill offers a tour of this screen`, false, e.message) }
      if (!started) { check(`${s.name}: the Guide pill offers a tour of this screen`, false, 'the entry was disabled'); continue }

      const seen = []
      const bad = []
      let stuck = null
      for (let i = 0; i < 40; i++) {
        const step = await readStep()
        if (!step) break
        const text = facts.steps[step.key]
        if (!text) bad.push(`${step.key}: no dictionary text`)
        else if (step.title !== text.title || step.body !== text.body) bad.push(`${step.key}: the bubble is not the dictionary text`)
        if (!step.spotlight) bad.push(`${step.key}: the bubble points at nothing`)
        seen.push(step.key)
        const file = `${s.name}-${String(seen.length).padStart(2, '0')}-${step.key}.png`
        await page.screenshot({ path: join(SHOTS, file), fullPage: false }).catch(() => {})
        const last = step.primaryLabel === facts.menu.done
        await page.locator('[role="dialog"][data-tour-bubble] button').last().click().catch(() => {})
        if (last) { await page.waitForTimeout(400); break }
        // The runner holds the current bubble while it looks for the next target
        // (a card that has not rendered yet, or a tab it has just opened), so the
        // walk waits for the bubble to actually change rather than clicking on a
        // timer and skipping past steps nobody saw.
        // The step KEY is what says the bubble moved. The counter is not: it
        // reads "N of M", and M shrinks as the runner skips steps whose cards
        // this project has nothing in, which changes the line while the same
        // step is still on screen.
        // Each step the runner has to give up on costs it LAZY_WAIT_MS (2.5s in
        // components/onboarding/DashboardOnboardingTour.tsx), so the last step
        // of a thin screen can take half a minute to walk past the rest.
        const moved = await page.waitForFunction((prev) => {
          const b = document.querySelector('[role="dialog"][data-tour-bubble]')
          return !b || b.getAttribute('data-tour-bubble') !== prev
        }, step.key, { timeout: 30000 }).then(() => true).catch(() => false)
        if (!moved) { stuck = step.key; break }
        await page.waitForTimeout(400)
      }

      const order = tour.steps.flatMap((x) => [x.key, ...x.variants])
      const inOrder = (() => { let at = -1; return seen.every((k) => { const n = order.indexOf(k); if (n <= at) return false; at = n; return true }) })()
      const headerish = new Set(tour.steps.filter((x) => /Header$/.test(x.key) || x.key === 'projectScope').map((x) => x.key))
      const own = seen.filter((k) => !headerish.has(k))
      check(`${s.name}: every step shown is a step of this tour, once, in order`,
        inOrder && new Set(seen).size === seen.length && seen.every((k) => order.includes(k)), seen.join(' → '))
      check(`${s.name}: the bubbles are the dictionary's own words, pointing at real elements`, bad.length === 0, bad.join('; '))
      check(`${s.name}: every step either moves the tour on or ends it`, stuck === null, stuck ? `stopped on ${stuck}` : '')
      // A step the walk never saw must be a step with nothing to point at on
      // this page. That is what separates "this project has no findings yet"
      // from "the tour lost a step": the missing targets are looked for in the
      // live DOM, and any that IS there is a defect.
      const unseen = tour.steps.filter((x) => !seen.includes(x.key) && !x.variants.some((v) => seen.includes(v)))
      const present = []
      for (const x of unseen) {
        const sel = (facts.targets[s.screen] || {})[x.key]
        if (!sel) continue
        const visible = await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false)
        if (visible) present.push(x.key)
      }
      check(`${s.name}: every step the tour did not show has nothing on the page to point at`,
        present.length === 0, present.join(', '))
      const thin = seen.length < 5 || own.length < 4
      check(`${s.name}: the tour walks the screen — ${seen.length} steps, ${own.length} about the screen itself`,
        !thin || THIN_BY_BUILD[s.screen] !== undefined,
        thin ? `${seen.join(' → ')} (and no reason recorded for a screen this thin)` : '')
      if (thin && THIN_BY_BUILD[s.screen]) console.log(`    (${THIN_BY_BUILD[s.screen]})`)
      if (TAB_STEPS[s.screen]) {
        const missing = TAB_STEPS[s.screen].filter((k) => !seen.includes(k))
        check(`${s.name}: the steps inside its tabs are shown, not skipped`, missing.length === 0, `missing ${missing.join(', ')}`)
      }
      // Whatever state the walk left, the next screen starts from a closed tour.
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
    }
  } finally {
    await browser.close().catch(() => {})
    kill()
  }

  if (mirror) {
    let copied = 0
    for (const f of readdirSync(SHOTS)) {
      if (!f.endsWith('.png')) continue
      try { copyFileSync(join(SHOTS, f), join(mirror, f)); copied++ } catch { /* best effort */ }
    }
    console.log(`\nscreenshots: ${copied} copied to ${mirror}`)
  }
  done()
  if (fail > 0) process.exitCode = 1
})()
