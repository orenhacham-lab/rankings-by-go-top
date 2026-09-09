/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * The reviewer's keyword workflow in real Chromium, over a real production
 * build, with no network beyond the local server and the Supabase stub.
 *
 * Both providers are UNREACHABLE from this container by design. That is the
 * case under test: before this change, an unreachable provider meant the
 * request ran until the platform killed it and the merchant was told nothing.
 * What is asserted here is that every operation now ENDS, says something true
 * in the merchant's language, clears its loading state, and writes nothing it
 * did not really write.
 */
const { spawn } = require('child_process')
const { join } = require('path')
const { mkdirSync } = require('fs')
const PORT = 3990, BASE = `http://127.0.0.1:${PORT}`
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/keyword-journey'
const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

;(async () => {
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:5555',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
    SERPER_API_KEY: 'unreachable-by-design',
    GOOGLE_ADS_CLIENT_ID: 'x', GOOGLE_ADS_CLIENT_SECRET: 'x', GOOGLE_ADS_DEVELOPER_TOKEN: 'x',
    GOOGLE_ADS_REFRESH_TOKEN: 'x', GOOGLE_ADS_CUSTOMER_ID: '1', GOOGLE_ADS_LOGIN_CUSTOMER_ID: '1',
  }
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: '/home/user/rankings-by-go-top', detached: true, stdio: 'ignore', env,
  })
  const kill = () => { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); return }

  // A FRESH FIXTURE, whatever ran before. These journeys share one stub
  // process; without this the second one to run inherits the first one's rows
  // and fails for a reason that has nothing to do with the code under test.
  await fetch('http://127.0.0.1:5555/__stub/reset', { method: 'GET' }).catch(() => {})

  const { chromium } = require('/home/user/rankings-by-go-top/node_modules/playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const consoleErrors = []
    const volumeCalls = []
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(m.text()) })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
    page.on('request', (r) => { if (r.url().includes('/api/google-ads/keyword-metrics')) volumeCalls.push(Date.now()) })
    // Server-side operation durations, measured at the response rather than by
    // polling the DOM — a polling timeout would otherwise be reported as the
    // operation's own duration.
    const opTiming = []
    page.on('response', async (r) => {
      const u = r.url()
      if (!/\/api\/(scan|google-ads\/keyword-metrics)/.test(u)) return
      let body = null
      try { body = await r.json() } catch { /* not json */ }
      opTiming.push({ url: u.replace(BASE, ''), status: r.status(), body })
    })
    await page.route('**/*', (route) => {
      const h = new URL(route.request().url()).hostname
      return h === '127.0.0.1' ? route.continue() : route.abort()
    })

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.getByRole('button', { name: /Add keyword|הוסף מילת מפתח/ }).first().waitFor({ timeout: 30000 })

    // ── add the keyword, and watch the automatic volume refresh fire once ──
    volumeCalls.length = 0
    await page.getByRole('button', { name: /Add keyword|הוסף מילת מפתח/ }).first().click()
    const form = page.locator('form:has(input[name="keyword"])').first()
    await form.locator('input[name="keyword"]').fill('shopify')
    await form.locator('button[type="submit"]').first().click()
    await page.waitForTimeout(1500)
    check('the keyword row appears in the table',
      (await page.locator('td', { hasText: /^shopify$/ }).count()) > 0)
    await page.waitForTimeout(12000)   // let the automatic refresh finish
    check('creating a keyword schedules exactly ONE automatic volume refresh',
      volumeCalls.length === 1, String(volumeCalls.length))
    await page.screenshot({ path: join(SHOTS, 'kw-1-after-add.png'), fullPage: true })

    // ── the manual volume button: bounded, truthful, loading clears ────────
    volumeCalls.length = 0
    const volBtn = page.getByRole('button', { name: /Update search volumes|עדכן נפחי חיפוש/ }).first()
    await volBtn.click()
    // The outcome toast clears itself after five seconds, so poll for it
    // rather than reading the page once the wait is over.
    let volText = ''
    await page.waitForFunction(() => {
      const t = document.body.innerText
      return !/Updating search volumes|מעדכן נפחי חיפוש/.test(t)
        && /did not respond|לא הגיב|not configured|לא הוגדר|rate limit|הגעת למגבלת|updated for|עודכנו|up to date|מעודכנים|No search volume|לא נמצאו|could not be saved|לא נשמרו|Error updating|שגיאה בעדכון/.test(t)
    }, undefined, { timeout: 40000 }).then(async () => {
      volText = await page.evaluate(() => document.body.innerText)
    }).catch(async () => { volText = await page.evaluate(() => document.body.innerText) })
    const volResp = opTiming.filter((o) => o.url.includes('keyword-metrics')).pop()
    check('the volume update ENDS with a real HTTP answer, not a platform kill',
      !!volResp && volResp.status < 600, JSON.stringify(volResp))
    console.log(`    ↳ volume answer: ${volResp?.status} ${JSON.stringify(volResp?.body)}`)
    check('its loading state clears', !/Updating search volumes|מעדכן נפחי חיפוש/.test(volText))
    check('and it says something true and localized about an unreachable provider',
      /did not respond|לא הגיב|not configured|לא הוגדר|Error updating|שגיאה בעדכון|No search volume|לא נמצאו|up to date|מעודכנים/.test(volText),
      volText.replace(/\s+/g, ' ').slice(0, 200))
    check('one click is one request', volumeCalls.length === 1, String(volumeCalls.length))
    await page.screenshot({ path: join(SHOTS, 'kw-2-volume-result.png'), fullPage: true })

    // ── the ranking scan: bounded, truthful, loading clears ────────────────
    const scanBtn = page.getByRole('button', { name: /^(Scan|סרוק)$/ }).first()
    const s0 = Date.now()
    await scanBtn.click()
    await page.waitForFunction(
      () => !/Scanning|סורק/.test(document.body.innerText), undefined, { timeout: 50000 }).catch(() => {})
    const scanMs = Date.now() - s0
    let scanText = await page.evaluate(() => document.body.innerText)
    if (!/too long|נכשלה|יותר מדי זמן|failed|completed|הושלמה/.test(scanText)) {
      await page.waitForTimeout(500); scanText = await page.evaluate(() => document.body.innerText)
    }
    const scanResp = opTiming.filter((o) => o.url.includes('/api/scan')).pop()
    check('the ranking scan ENDS with a real HTTP answer, not a platform kill',
      !!scanResp && scanMs < 50000, `${scanMs}ms ${JSON.stringify(scanResp)}`)
    console.log(`    ↳ scan answer: ${scanResp?.status} ${JSON.stringify(scanResp?.body).slice(0, 200)}`)
    check('its loading state clears', !/Scanning\.\.\.|סורק\.\.\./.test(scanText))
    check('no raw provider or database text reaches the merchant',
      !/Serper|fetch failed|ECONNREFUSED|PGRST|at Object\.|TypeError/.test(scanText),
      (scanText.match(/.{0,60}(Serper|fetch failed|ECONNREFUSED|PGRST|TypeError).{0,60}/) || [''])[0])
    await page.screenshot({ path: join(SHOTS, 'kw-3-scan-result.png'), fullPage: true })

    // ── what actually landed in the database ──────────────────────────────
    const db = await (await fetch('http://127.0.0.1:5555/__stub/db')).json()
    check('the keyword was created exactly once',
      db.tracking_targets.filter((t) => t.keyword === 'shopify').length === 1,
      String(db.tracking_targets.length))
    check('no volume was invented for a provider that never answered',
      db.tracking_targets.every((t) => t.avg_monthly_searches == null))
    check('the scan recorded a truthful outcome rather than nothing at all',
      db.scans.length >= 1 && db.scans.every((s) => s.status !== 'running'),
      JSON.stringify(db.scans.map((s) => s.status)))
    check('no console error on the journey', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 2)))

    await ctx.close()
  } finally { await browser.close().catch(() => {}); kill() }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})()
