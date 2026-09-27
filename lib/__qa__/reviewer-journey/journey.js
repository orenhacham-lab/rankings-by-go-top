/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS scripts, run with `node`, never bundled. */
/* The reviewer journey, in real Chromium, against a real production build. */
const { spawn } = require('child_process')
const { join } = require('path')
const { mkdirSync } = require('fs')
const PORT = 3991, BASE = `http://127.0.0.1:${PORT}`
const SHOTS = process.env.QA_SCREENSHOT_DIR
const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

;(async () => {
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: '/home/user/rankings-by-go-top', detached: true, stdio: 'ignore',
    env: { ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:5555',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
      NEXT_PUBLIC_ENABLE_AI_VISIBILITY: 'true', ENABLE_AI_VISIBILITY: 'true',
      // Search Console is on in production; the stub decides connected or not.
      GSC_READ_ONLY_ENABLED: 'true' },
  })
  const kill = () => { try { process.kill(-server.pid, 'SIGKILL') } catch {} }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); return }

  // A FRESH FIXTURE, whatever ran before. These journeys share one stub
  // process; without this the second one to run inherits the first one's rows
  // and fails for a reason that has nothing to do with the code under test.
  await fetch('http://127.0.0.1:5555/__stub/reset', { method: 'GET' }).catch(() => {})

  const { chromium } = require('/home/user/rankings-by-go-top/node_modules/playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    const consoleErrors = [], graph = []
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(m.text()) })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
    page.on('request', (r) => graph.push({ method: r.method(), url: r.url() }))
    // Only the local server and the local stub may be reached.
    await page.route('**/*', (route) => {
      const h = new URL(route.request().url()).hostname
      return h === '127.0.0.1' ? route.continue() : route.abort()
    })

    // ── log in through the real form ──────────────────────────────────────
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    check('reviewer reaches an authenticated page (not bounced to /login or /billing)',
      !page.url().includes('/login') && !page.url().includes('/billing'), page.url())
    await page.screenshot({ path: join(SHOTS, 'journey-1-after-login.png'), fullPage: true })

    // ── the retired project page: an old link opens that project's dashboard ─
    // An HTTP redirect, answered before anything renders (not a page that loads
    // and then navigates), carrying the language and naming the project.
    const hop = await ctx.request.get(`${BASE}/projects/${PROJECT_ID}?lang=en&section=ai-visibility`, { maxRedirects: 0 })
    check('the old address answers with a redirect to the tab that owns the section',
      hop.status() === 307 && hop.headers().location === `/ai-visibility?lang=en&projectId=${PROJECT_ID}`,
      `${hop.status()} ${hop.headers().location}`)
    await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const landed = new URL(page.url())
    check('an old /projects/{id} link lands on that project\'s dashboard',
      landed.pathname === '/dashboard' && landed.searchParams.get('projectId') === PROJECT_ID, page.url())
    let dashboardSettled = false
    try { await page.getByRole('link', { name: /Latest Scans|View all|הכל/ }).first().waitFor({ timeout: 30000 }); dashboardSettled = true } catch {}
    check('…and the dashboard finishes loading for it', dashboardSettled)
    await page.screenshot({ path: join(SHOTS, 'journey-1b-dashboard.png'), fullPage: true })

    // ── a connection result opens settings at the panel that shows it ─────
    // The panel renders after the project loads, later than the browser's own
    // jump to the anchor, so the screen has to scroll to it itself.
    const gscHop = await ctx.request.get(`${BASE}/projects/${PROJECT_ID}?gsc=connected`, { maxRedirects: 0 })
    check('a Search Console result on the old address goes to that section of settings',
      gscHop.status() === 307 && gscHop.headers().location === `/settings?gsc=connected&projectId=${PROJECT_ID}#search-console`,
      `${gscHop.status()} ${gscHop.headers().location}`)
    const sectionInView = async (hash) => {
      await page.goto(`${BASE}/settings?projectId=${PROJECT_ID}${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      try { await page.locator('#search-console').waitFor({ timeout: 30000 }) } catch { return null }
      try {
        // At the top half of the screen, or, for a section too near the end of the
        // page to reach the top, the page scrolled all the way with it in view.
        await page.waitForFunction(() => {
          const r = document.getElementById('search-console')?.getBoundingClientRect()
          const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
          return !!r && r.top >= 0 && (r.top < window.innerHeight / 2 || (atEnd && r.top < window.innerHeight - 120))
        }, null, { timeout: 8000 })
        return true
      } catch {
        lastView = await page.evaluate(() => ({ top: Math.round(document.getElementById('search-console')?.getBoundingClientRect().top ?? -1), inner: window.innerHeight, scrollY: Math.round(window.scrollY), doc: document.documentElement.scrollHeight, hash: location.hash }))
        return false
      }
    }
    let lastView = null
    check('…and settings opens scrolled to that section', (await sectionInView('#search-console')) === true, JSON.stringify(lastView))
    // Control: the same screen without the anchor opens at the top, so the check
    // above measures the scroll and not a screen short enough to show everything.
    check('…while without the anchor it opens at the top', (await sectionInView('')) === false)

    // ── the keywords tab: request graph + completion ──────────────────────
    graph.length = 0
    const t0 = Date.now()
    await page.goto(`${BASE}/keywords?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    let settled = false
    try { await page.getByRole('button', { name: /Add keyword|הוסף מילת מפתח/ }).first().waitFor({ timeout: 30000 }); settled = true } catch {}
    const elapsed = Date.now() - t0
    check('the keywords tab finishes loading (spinner resolves)', settled, `${elapsed}ms`)
    console.log(`    ↳ settled in ${elapsed}ms`)
    const supaCalls = graph.filter((r) => r.url.includes('127.0.0.1:5555'))
    console.log(`    ↳ client request graph: ${supaCalls.length} Supabase calls`)
    for (const c of supaCalls.slice(0, 12)) console.log(`       ${c.method} ${c.url.replace('http://127.0.0.1:5555', '')}`)
    await page.screenshot({ path: join(SHOTS, 'journey-2-project.png'), fullPage: true })

    // ── you vs. competitors, before any competitor exists ─────────────────
    // The top competitor is a line under each position, not a column: the
    // table keeps its nine columns. The summary settles on its one-line empty
    // state, linking to where competitors are managed today.
    const headerCount = await page.locator('thead th').count()
    check('the keywords table keeps its nine columns (no competitor column)', headerCount === 9, String(headerCount))
    let summaryState = null
    try {
      await page.waitForSelector('[data-competitor-summary]:not([data-competitor-summary="loading"])', { timeout: 30000 })
      summaryState = await page.getAttribute('[data-competitor-summary]', 'data-competitor-summary')
    } catch {}
    const manageLinks = await page.locator('[data-competitor-summary] a[href="/ai-visibility?tab=competitors"]').count()
    check('…and with no competitors the summary is one line with a link to manage them',
      summaryState === 'no_competitors' && manageLinks === 1, `${summaryState} links=${manageLinks}`)

    // ── add the keyword `shopify` ─────────────────────────────────────────
    await page.getByRole('button', { name: /Add keyword|הוסף מילת מפתח/ }).first().click()
    const form = page.locator('form:has(input[name="keyword"])').first()
    await form.locator('input[name="keyword"]').fill('shopify')
    await page.screenshot({ path: join(SHOTS, 'journey-3-add-keyword-form.png'), fullPage: true })
    await form.locator('button[type="submit"]').first().click()
    await page.waitForTimeout(3000)
    const errBox = await page.locator('.bg-red-50, .text-red-700').allInnerTexts().catch(() => [])
    const visibleError = errBox.map((s) => s.trim()).filter(Boolean).join(' | ')
    check('no error is shown after submitting the keyword', visibleError === '', visibleError)
    await page.screenshot({ path: join(SHOTS, 'journey-4-after-add.png'), fullPage: true })

    const db = await (await fetch('http://127.0.0.1:5555/__stub/db')).json()
    check('the keyword row was actually created in the database',
      db.tracking_targets.length === 1 && db.tracking_targets[0].keyword === 'shopify',
      JSON.stringify(db.tracking_targets.map((r) => r.keyword)))
    check('…with the submitted engine and the project location mode',
      db.tracking_targets[0]?.engine_type === 'google_search' && db.tracking_targets[0]?.location_mode === 'project',
      JSON.stringify(db.tracking_targets[0] ?? {}))
    // The new keyword's position cell carries the competitor line; with no
    // competitors it is a dash that says why.
    let lineState = null
    try {
      const line = page.locator('tbody tr', { hasText: 'shopify' }).first().locator('[data-top-competitor]').first()
      await line.waitFor({ timeout: 30000 })
      lineState = await line.getAttribute('data-top-competitor')
    } catch {}
    check('…its position cell has the competitor line, a dash while there are no competitors',
      lineState === 'no_competitors', String(lineState))

    // ── the AI allocation, through the real dispatch route ────────────────
    const aiRes = await page.evaluate(async (pid) => {
      const r = await fetch('/api/ai-visibility/runs', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: pid, promptId: 'prompt-1', engine: 'chatgpt' }) })
      let b = null; try { b = await r.json() } catch {}
      return { status: r.status, body: b }
    }, PROJECT_ID)
    check('the AI dispatch is not refused with a zero allowance',
      aiRes.status !== 403 && aiRes.body?.code !== 'QUOTA_AI_SCANS' && aiRes.body?.limit !== 0,
      `${aiRes.status} ${JSON.stringify(aiRes.body).slice(0, 160)}`)
    const db2 = await (await fetch('http://127.0.0.1:5555/__stub/db')).json()
    check('an AI-check allowance was reserved against the real Advanced limit',
      db2.usage_reservations.length === 1, JSON.stringify(db2.usage_reservations))

    // ── you vs. competitors, with a competitor and one recorded check ──────
    // Written the way production writes them: with the service key. The browser
    // key is refused on the new table, as in the migration.
    const SVC = { 'content-type': 'application/json', apikey: 'stub-service-key', authorization: 'Bearer stub-service-key' }
    const put = (table, rows) => fetch(`http://127.0.0.1:5555/rest/v1/${table}`, { method: 'POST', headers: SVC, body: JSON.stringify(rows) })
    const owner = db2.projects[0]?.user_id
    const keywordId = db2.tracking_targets[0]?.id
    const checkedAt = new Date(Date.now() - 3_600_000).toISOString()
    await put('ai_visibility_competitors', [{ id: 'competitor-1', user_id: owner, project_id: PROJECT_ID, name: 'Rival Shoes',
      domain: 'rival-shoes.com', aliases: [], is_active: true }])
    await put('scan_results', [{ id: 'result-1', scan_id: 'scan-1', tracking_target_id: keywordId, engine_type: 'google_search',
      keyword: 'shopify', found: true, position: 7, previous_position: null, change_value: null, checked_at: checkedAt }])
    await put('keyword_competitor_positions', [{ user_id: owner, project_id: PROJECT_ID, tracking_target_id: keywordId,
      competitor_domain: 'rival-shoes.com', position: 3, url: 'https://www.rival-shoes.com/shopify', checked_at: checkedAt }])
    const browserWrite = await fetch('http://127.0.0.1:5555/rest/v1/keyword_competitor_positions', {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: 'stub-anon-key' }, body: '{}' })
    check('the browser key cannot write competitor positions', browserWrite.status === 403, String(browserWrite.status))
    await page.goto(`${BASE}/keywords?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    let comparedReady = false
    try { await page.waitForSelector('[data-competitor-summary="ready"]', { timeout: 30000 }); comparedReady = true } catch {}
    // The position cell: your #7 and, under it, the best-placed competitor of
    // the same check, #3 and ahead of you.
    const cell = page.locator('tbody tr', { hasText: 'shopify' }).first().locator('td:has([data-top-competitor])').first()
    const cellText = comparedReady && (await cell.count()) > 0 ? await cell.innerText() : ''
    const bestState = comparedReady && (await cell.count()) > 0 ? await cell.locator('[data-top-competitor]').getAttribute('data-top-competitor') : null
    check('the position cell shows the best-placed competitor of the same check under your position',
      bestState === 'best' && /#7\b/.test(cellText) && /rival-shoes\.com/.test(cellText) && /#3\b/.test(cellText)
      && /Ranks above you|מדורג מעליך/.test(cellText) && cellText.indexOf('#7') < cellText.indexOf('rival-shoes.com'),
      `${bestState} ${cellText.replace(/\s+/g, ' ').slice(0, 160)}`)
    const summaryText = comparedReady ? await page.locator('[data-competitor-summary]').innerText() : ''
    // Read without waiting: a summary with no meter is a failed check, not a
    // 30-second timeout that ends the journey before its remaining checks.
    const meterEl = page.locator('[data-competitor-summary] [role="meter"]').first()
    const meter = comparedReady && (await meterEl.count()) > 0 ? await meterEl.getAttribute('aria-valuenow') : null
    check('…and the summary counts that competitor above you on 1 of 1 keyword',
      /Rival Shoes/.test(summaryText) && meter === '1', `${meter} ${summaryText.replace(/\s+/g, ' ').slice(0, 160)}`)
    await page.screenshot({ path: join(SHOTS, 'journey-5-competitors.png'), fullPage: true })

    // ── Search Console: a source of the tabs, not a screen of its own ─────
    // The retired screen's address is an HTTP redirect, answered before anything
    // renders, to the Search Console section of settings, where the connection is,
    // keeping every parameter; a connection result goes to that same section.
    const scHop = await ctx.request.get(`${BASE}/content/search-console?projectId=${PROJECT_ID}&lang=en`, { maxRedirects: 0 })
    check('the retired Search Console address redirects to the Search Console section of settings, keeping the project and language',
      scHop.status() === 307 && scHop.headers().location === `/settings?projectId=${PROJECT_ID}&lang=en#search-console`,
      `${scHop.status()} ${scHop.headers().location}`)
    const scDone = await ctx.request.get(`${BASE}/content/search-console?gsc=connected&projectId=${PROJECT_ID}`, { maxRedirects: 0 })
    const scFailed = await ctx.request.get(`${BASE}/content/search-console?gsc_error=access_denied&projectId=${PROJECT_ID}`, { maxRedirects: 0 })
    check('…and a connection result on it goes to that same section',
      scDone.status() === 307 && scDone.headers().location === `/settings?gsc=connected&projectId=${PROJECT_ID}#search-console`
      && scFailed.status() === 307 && scFailed.headers().location === `/settings?gsc_error=access_denied&projectId=${PROJECT_ID}#search-console`,
      `${scDone.status()} ${scDone.headers().location} | ${scFailed.status()} ${scFailed.headers().location}`)
    // In the browser: the section is kept through the hop, and settings shows it.
    await page.goto(`${BASE}/content/search-console?projectId=${PROJECT_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    let scSection = false
    try { await page.locator('#search-console').waitFor({ timeout: 30000 }); scSection = true } catch {}
    const scLanded = new URL(page.url())
    check('…and a browser following it lands on the Search Console section of that project\'s settings',
      scSection && scLanded.pathname === '/settings' && scLanded.searchParams.get('projectId') === PROJECT_ID && scLanded.hash === '#search-console',
      page.url())

    // Every screen that shows Search Console figures, first without a connection
    // (the stub's default), then with one. A widget settles out of "loading";
    // without a connection it keeps its title and offers ONE link, to settings.
    // Keyword research is visited to show it has NONE: its raw opportunity browser is
    // a dev-only diagnostic behind NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED, which this
    // build does not set, so no merchant sees it, connected or not.
    const SETTINGS_GSC = `/settings?projectId=${PROJECT_ID}#search-console`
    const GSC_SCREENS = [
      ['keyword research', `/keyword-research?projectId=${PROJECT_ID}`, []],
      ['dashboard', `/dashboard?projectId=${PROJECT_ID}`, ['clicks', 'top-pages']],
      ['reports', `/reports?projectId=${PROJECT_ID}`, ['performance']],
      ['keywords', `/keywords?projectId=${PROJECT_ID}`, ['keywords']],
    ]
    /** Keyword research, settled: how many Search Console elements it shows, and which
     *  Search Console data it asked for. */
    const gscOnResearch = async (requests) => {
      try { await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30000 }) } catch {}
      return {
        widgets: await page.locator('[data-gsc-widget]').count(),
        asked: requests.filter((r) => r.url.includes('/api/gsc/')).map((r) => r.url.replace(BASE, '')),
      }
    }
    const visitGscScreen = async (path, widgets) => {
      const from = consoleErrors.length
      const fromRequest = graph.length
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      const found = {}
      for (const w of widgets) {
        const sel = `[data-gsc-widget="${w}"]`
        try { await page.waitForSelector(`${sel}:not([data-gsc-state="loading"])`, { timeout: 30000 }) } catch {}
        const el = page.locator(sel).first()
        const present = (await el.count()) > 0
        found[w] = present ? {
          state: await el.getAttribute('data-gsc-state'),
          links: await el.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href'))),
          buttons: await el.locator('button').count(),
          text: (await el.innerText()).replace(/\s+/g, ' '),
        } : null
      }
      // Let the late reads land before counting errors.
      await page.waitForTimeout(1500)
      return { found, errors: consoleErrors.slice(from), requests: graph.slice(fromRequest) }
    }

    for (const [name, path, widgets] of GSC_SCREENS) {
      const { found, errors, requests } = await visitGscScreen(path, widgets)
      if (widgets.length > 0) {
        const wrong = widgets.filter((w) => {
          const f = found[w]
          return !f || f.state !== 'not_connected' || f.links.length !== 1 || f.links[0] !== SETTINGS_GSC || f.buttons !== 0
        })
        check(`${name}, not connected: every Search Console widget is there with one link to settings`, wrong.length === 0,
          JSON.stringify(wrong.map((w) => ({ w, ...(found[w] || {}), text: found[w]?.text.slice(0, 120) }))))
      }
      check(`${name}, not connected: no console error`, errors.length === 0, JSON.stringify(errors.slice(0, 3)))
      if (name === 'keyword research') {
        const research = await gscOnResearch(requests)
        check('…keyword research shows merchants no Search Console section (the raw browser stays behind its dev flag)',
          research.widgets === 0 && research.asked.length === 0, JSON.stringify(research))
        await page.screenshot({ path: join(SHOTS, 'journey-6-keyword-research-gsc-disconnected.png'), fullPage: true })
      }
      if (name === 'keywords') {
        const lines = await page.locator('tbody [data-gsc-keyword]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gsc-keyword')))
        check('…and each keyword row says why it has no Search Console figures yet (no 0)',
          lines.length > 0 && lines.every((s) => s === 'not_connected'), JSON.stringify(lines))
      }
    }

    const connected = await (await fetch('http://127.0.0.1:5555/__stub/fixture?gsc=connected')).json().catch(() => null)
    check('the stub switches to the connected Search Console fixture', connected?.gsc === 'connected', JSON.stringify(connected))
    for (const [name, path, widgets] of GSC_SCREENS) {
      const { found, errors, requests } = await visitGscScreen(path, widgets)
      if (widgets.length > 0) {
        const wrong = widgets.filter((w) => !found[w] || found[w].state !== 'ready' || found[w].links.includes(SETTINGS_GSC))
        check(`${name}, connected: every Search Console widget shows its figures`, wrong.length === 0,
          JSON.stringify(wrong.map((w) => ({ w, ...(found[w] || {}), text: found[w]?.text.slice(0, 120) }))))
      }
      if (name === 'keyword research') {
        const research = await gscOnResearch(requests)
        check('…connected too, keyword research shows merchants no Search Console section',
          research.widgets === 0 && research.asked.length === 0, JSON.stringify(research))
        await page.screenshot({ path: join(SHOTS, 'journey-7-keyword-research-gsc-connected.png'), fullPage: true })
      }
      if (name === 'dashboard') {
        const pages = await page.locator('[data-gsc-widget="top-pages"] li').count()
        check('…the dashboard shows the 28-day clicks and the five most clicked pages',
          /905/.test(found.clicks?.text || '') && pages === 5, `${found.clicks?.text} pages=${pages}`)
      }
      if (name === 'reports') {
        check('…reports show clicks, impressions and position with the change against the previous 28 days',
          /905/.test(found.performance?.text || '') && /28,750/.test(found.performance?.text || '') && /11\.6/.test(found.performance?.text || '')
          && /previous 28 days/.test(found.performance?.text || ''), found.performance?.text.slice(0, 200))
      }
      if (name === 'keywords') {
        let line = null
        try {
          const el = page.locator('tbody tr', { hasText: 'shopify' }).first().locator('[data-gsc-keyword]').first()
          await page.waitForSelector('tbody [data-gsc-keyword="figures"]', { timeout: 30000 })
          line = { state: await el.getAttribute('data-gsc-keyword'), text: (await el.innerText()).replace(/\s+/g, ' ') }
        } catch {}
        check('…the keyword `shopify` shows its clicks and impressions from Search Console',
          line?.state === 'figures' && /128/.test(line.text) && /3\.7K/.test(line.text), JSON.stringify(line))
      }
      check(`${name}, connected: no console error`, errors.length === 0, JSON.stringify(errors.slice(0, 3)))
    }

    check('no console error on the journey', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)))
    check('no hydration mismatch', !consoleErrors.some((e) => /hydrat|did not match/i.test(e)))

    await ctx.close()
  } finally { await browser.close().catch(() => {}); kill() }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})()
