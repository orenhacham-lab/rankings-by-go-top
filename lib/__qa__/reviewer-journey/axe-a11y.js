/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * axe (WCAG 2.x A and AA) over the screens the UX review of 2026-09-27 measured:
 * keyword research (with a scan's results), the keywords table and its row
 * menu, the dashboard, the articles table and its row menu, the content
 * strategy, the settings and AI visibility. In real Chromium, over a real
 * production build, with no network beyond the local server and the stub.
 *
 * The review found 70 contrast failures, 31 checkboxes without a label and 4
 * selects without a name. Each screen here must have NO axe violation inside
 * its <main> (the sidebar and the top bar have their own owners), and an open
 * row menu none either.
 *
 * axe-core is not a dependency of its own: it is already in node_modules
 * (eslint-plugin-jsx-a11y, through eslint-config-next, depends on it). It is
 * injected into the page from there; nothing is installed.
 *
 * Standalone, against a server and stub that are already running:
 *   AXE_BASE_URL=http://127.0.0.1:3814 AXE_STUB_URL=http://127.0.0.1:5814 node lib/__qa__/reviewer-journey/axe-a11y.js
 * Under scripts/qa/journeys.sh it starts its own `next start` on :3991 over the
 * stub on :5555.
 */
const { spawn } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync } = require('fs')

const ROOT = resolve(__dirname, '../../..')
const OWN_SERVER = !process.env.AXE_BASE_URL
const PORT = 3991
const BASE = process.env.AXE_BASE_URL || `http://127.0.0.1:${PORT}`
const STUB = process.env.AXE_STUB_URL || 'http://127.0.0.1:5555'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/axe-journey'
const AXE = require.resolve('axe-core/axe.min.js', { paths: [ROOT] })
const PID = 'a1111111-2222-3333-4444-555555555555'
const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
mkdirSync(SHOTS, { recursive: true })

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// ── the fixture: the reviewer's project with keywords, checks, competitors and articles ──
const H = { 'content-type': 'application/json', authorization: 'Bearer stub-service-key', apikey: 'stub-service-key' }
const iso = (ms) => new Date(ms).toISOString()
async function rest(method, path, body) {
  const r = await fetch(`${STUB}/rest/v1/${path}`, { method, headers: H, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}`)
}
async function seed() {
  await fetch(`${STUB}/__stub/reset`).catch(() => {})
  const now = Date.now()
  await rest('PATCH', `projects?id=eq.${PID}`, { name: 'אינסטלציה מהירה', business_name: 'אינסטלציה מהירה', target_domain: 'plumber-tlv.co.il',
    country: 'IL', city: 'תל אביב', language: 'he', device_type: 'desktop', scan_frequency: 'monthly' })
  const KW = [['אינסטלטור בתל אביב', 'google_maps', 3, 2], ['תיקון דוד שמש', 'google_search', 5, 3], ['פתיחת סתימות', 'google_search', 19, 17], ['אינסטלטור חירום', 'google_search', null, null]]
  await rest('POST', 'tracking_targets', KW.map(([keyword, engine_type], i) => ({ id: `tt-${i + 1}`, project_id: PID, user_id: USER, keyword, engine_type,
    is_active: true, avg_monthly_searches: 1000 + i, created_at: iso(now - 35 * 86400000) })))
  const D1 = now - 30 * 86400000, D2 = now - 3 * 3600000
  await rest('POST', 'scan_results', KW.flatMap(([keyword, engine_type, before, after], i) => [
    { id: `sr-${i}-a`, scan_id: 'scan-1', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: before !== null, position: before, checked_at: iso(D1) },
    { id: `sr-${i}-b`, scan_id: 'scan-2', tracking_target_id: `tt-${i + 1}`, keyword, engine_type, found: after !== null, position: after,
      change_value: before && after ? before - after : null, checked_at: iso(D2), result_url: after ? 'https://plumber-tlv.co.il/services' : null },
  ]))
  await rest('POST', 'ai_visibility_competitors', [{ id: 'c1', project_id: PID, user_id: USER, name: 'Rival Plumber', domain: 'rival-plumber.co.il', is_active: true, created_at: iso(now - 20 * 86400000) }])
  await rest('POST', 'keyword_competitor_positions', [2, 3].map((n) => ({ tracking_target_id: `tt-${n}`, competitor_domain: 'rival-plumber.co.il', position: n, url: 'https://rival-plumber.co.il/', checked_at: iso(D2) })))
  await rest('POST', 'generated_articles', [
    { id: 'ga-1', project_id: PID, user_id: USER, title: 'איך לפתוח סתימה בכיור לבד', status: 'published', created_at: iso(now - 2 * 86400000), updated_at: iso(now - 86400000), published_at: iso(now - 86400000) },
    { id: 'ga-2', project_id: PID, user_id: USER, title: 'כמה עולה איתור נזילה', status: 'draft', created_at: iso(now - 86400000), updated_at: iso(now - 86400000) },
  ])
}

// The seeding scan and a keyword-research scan, answered in the browser (both call providers).
const START = Date.now() - 3 * 86400000
const seedRun = { ok: true, run: { id: 'run-1', stage: 'b', status: 'done', stalled: false, startedAt: iso(START),
  steps: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((step) => ({ step, status: 'done', errorCode: null, itemCount: null, startedAt: null, finishedAt: null })),
  summary: { version: 1, source: 'scan', domain: 'plumber-tlv.co.il', url: 'https://plumber-tlv.co.il/', scannedAt: iso(START), locale: 'he',
    storefrontLocked: false, siteAccess: 'direct', business: null, audiences: [], seedKeywords: ['אינסטלטור'], topics: [],
    findings: [], findingsOmitted: 0, geo: { state: 'measured', unavailableReason: null, passed: 3, total: 4, signals: [] }, competitors: [],
    counters: { keywords: 6, fixes: 0, geo: 3, articles: 0, competitors: 1 }, sitemapUrlCount: 40, sitemapTruncated: false } } }
const LEVELS = ['LOW', 'MEDIUM', 'HIGH']
const research = { ok: true, market: { country: 'IL', language: 'he' }, fetchedAt: iso(START + 60000), truncated: false, tracked: [],
  keywords: ['פתיחת סתימות', 'איתור נזילות', 'רטיבות בקיר', 'תיקון דוד שמש', 'ניקוי ביוב', 'איטום מקלחת'].map((keyword, i) => ({ keyword,
    avgMonthlySearches: 5000 - i * 400, competition: LEVELS[i % 3], competitionIndex: 15 + i * 13, lowTopOfPageBid: 1.5 + i, highTopOfPageBid: 6 + i * 2,
    currency: 'ILS', origins: ['site'], competitors: [], relevant: true })) }

;(async () => {
  let server = null
  if (OWN_SERVER) {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', SERPER_API_KEY: 'unreachable-by-design' }
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, detached: true, stdio: 'ignore', env })
  }
  const kill = () => { if (server) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); console.log(`${pass} passed, ${fail + 1} failed`); return }
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

    /** axe on one part of the page; every violation is listed as rule × nodes, with the first targets. */
    const audit = async (label, selector) => {
      await page.addScriptTag({ path: AXE })
      const out = await page.evaluate(async (sel) => {
        const root = document.querySelector(sel)
        if (!root) return { missing: true, violations: [] }
        // eslint-disable-next-line no-undef
        const r = await axe.run(root, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] })
        return { missing: false, violations: r.violations.map((v) => ({ id: v.id, n: v.nodes.length, where: v.nodes.slice(0, 3).map((x) => x.target.join(' ')), why: (v.nodes[0] && v.nodes[0].failureSummary || '').split('\n')[1] || '' })) }
      }, selector)
      const total = out.violations.reduce((a, v) => a + v.n, 0)
      const detail = out.missing ? `${selector} not found` : out.violations.map((v) => `${v.id}×${v.n} [${v.where.join(' | ')}] ${v.why}`).join('; ')
      check(`${label}: no WCAG A/AA violation (axe)`, !out.missing && total === 0, detail)
      return out
    }
    const go = async (path, ready) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
      if (ready) await page.locator(ready).first().waitFor({ timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(1200)
    }
    const openRowMenu = async (label) => {
      const btn = page.locator('[data-row-menu] button[aria-haspopup="menu"]').first()
      if (!(await btn.count())) { check(`${label}: the row menu is there`, false); return }
      await btn.click()
      await page.locator('[role="menu"]').first().waitFor({ timeout: 5000 }).catch(() => {})
      await audit(`${label} (row menu open)`, '[role="menu"]')
      await page.keyboard.press('Escape')
    }

    await go(`/keyword-research?projectId=${PID}`, '#research-table')
    await audit('keyword research, with results', 'main')
    await go(`/keywords?projectId=${PID}`, '[data-row-menu]')
    await audit('keywords', 'main')
    await openRowMenu('keywords')
    await go(`/dashboard?projectId=${PID}`, '[data-dashboard-widget="hero"]')
    await audit('dashboard', 'main')
    await go(`/content?projectId=${PID}`, '[data-row-menu]')
    await audit('articles', 'main')
    await openRowMenu('articles')
    await go(`/content/strategy?projectId=${PID}`)
    await audit('content strategy', 'main')
    await go(`/settings?projectId=${PID}`, '#profile')
    await audit('settings', 'main')
    await go(`/ai-visibility?projectId=${PID}`)
    await audit('AI visibility', 'main')
    await page.screenshot({ path: join(SHOTS, 'axe-last.png') }).catch(() => {})
  } catch (e) {
    check('the journey ran to its end', false, e.message)
  } finally {
    await browser.close()
    kill()
    console.log(`\n${pass} passed, ${fail} failed`)
  }
})()
