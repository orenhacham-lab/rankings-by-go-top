/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * "Not connected" is never painted while the status is on its way.
 *
 * The owner's report (2026-09-28): "the page loads and for a second you see things
 * like the Search Console account not connected, although it is connected, because
 * everything loads slowly". Measured here before the fix: every content screen said
 * "the site is not connected for publishing · Search Console is not connected" for
 * as long as the status requests took, to a merchant who had both.
 *
 * A merchant with WordPress AND Search Console connected opens each screen that
 * shows a connection while the stub answers every connection/status table slowly
 * (/__stub/slow, STUB_SLOW_MS, default 1500 ms). From the first byte, the page
 * records every "not connected" sentence or button label it paints (the copy comes
 * from the dictionaries: lib/connection-status/__qa__/disconnected-copy.ts), and
 * when each status request started and answered. The journey fails if any of it is
 * ever painted: before the answer it would be a guess, after it a lie.
 *
 * Positive control, so a detector that sees nothing cannot pass: the same screens
 * with nothing connected must end up saying so. Mutation control: run it against a
 * build of the code before the fix (see the report): it fails on the content
 * screens' setup line.
 *
 *   node lib/__qa__/reviewer-journey/flash-of-disconnected.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running; STUB_URL points at a
 * stub on another port.
 */
const { spawn, execFileSync } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3987)
const BASE = process.env.JOURNEY_BASE || `http://localhost:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || join(__dirname, '..', '..', '..')
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/flash-of-disconnected'
const SLOW_MS = Number(process.env.STUB_SLOW_MS || 1500)
const SETTLE_MS = Number(process.env.SETTLE_MS || 30000)
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const PID = 'a1111111-2222-3333-4444-555555555555' // the stub's project
const SLOW_TABLES = ['gsc_connections', 'project_gsc_properties', 'gsc_sync_runs', 'wordpress_connections', 'shopify_connections', 'site_platform_connections'].join(',')
/** The requests whose answer decides whether something is connected. */
const STATUS_URL = /\/api\/(gsc\/status|wordpress\/connection|shopify\/connection|site-platforms\/connection|content\/overview)/
const SCREENS = [
  { name: 'articles', path: `/content?projectId=${PID}` },
  { name: 'strategy', path: `/content/strategy?projectId=${PID}` },
  { name: 'existing', path: `/content/existing?projectId=${PID}` },
  { name: 'settings', path: `/settings?projectId=${PID}#platform` },
]

const stub = (path) => fetch(`${STUB}${path}`).then((r) => r.json()).catch(() => null)

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// From the first byte: which of the phrases are painted, when, and which status
// requests were still pending at that moment.
const RECORDER = (phrases) => `(() => {
  const phrases = ${JSON.stringify(phrases)}
  const pending = new Set()
  const log = { painted: [], requests: [] }
  window.__flashLog = log
  const of = window.fetch
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (!${STATUS_URL}.test(url)) return of.apply(this, arguments)
    const r = { url: url.replace(location.origin, ''), start: Math.round(performance.now()), end: null }
    log.requests.push(r); pending.add(r)
    const done = () => { r.end = Math.round(performance.now()); pending.delete(r) }
    return of.apply(this, arguments).then((res) => { res.clone().text().then(done, done); return res }, (e) => { done(); throw e })
  }
  function sample() {
    const text = document.body ? document.body.innerText || '' : ''
    for (const p of phrases) {
      if (text.includes(p)) log.painted.push({ phrase: p, at: Math.round(performance.now()), pending: [...pending].map((r) => r.url.slice(0, 60)) })
    }
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
})()`

async function login(page, he) {
  for (let attempt = 0; attempt < 2 && (attempt === 0 || page.url().includes('/login')); attempt += 1) {
    await page.goto(`${BASE}${he ? '' : '/en'}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForFunction(() => !!window.next, { timeout: 30000 }).catch(() => {})
    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 90000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
  }
}

/** Open one screen with the status tables slowed; wait until every status request answered. */
async function visit(ctx, screen, phrases, locale) {
  const page = await ctx.newPage()
  await page.addInitScript(RECORDER(phrases))
  await stub(`/__stub/slow?tables=${SLOW_TABLES}&ms=${SLOW_MS}`)
  await page.goto(`${BASE}${screen.path.replace('?', `?lang=${locale}&`)}`, { waitUntil: 'commit', timeout: 120000 }).catch(() => {})
  // Settled: the status requests all answered, and nothing new was asked for a moment.
  const end = Date.now() + SETTLE_MS
  let quietSince = 0
  while (Date.now() < end) {
    // Busy: no status request made yet, one still pending, or a region still loading.
    const busy = await page.evaluate(() => {
      const l = window.__flashLog
      return !l || l.requests.length === 0 || l.requests.some((r) => r.end === null)
        || !!document.querySelector('main [aria-busy="true"], main [data-skeleton]')
    }).catch(() => true)
    if (!busy) { if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince > 1200) break } else quietSince = 0
    await page.waitForTimeout(100)
  }
  await stub('/__stub/slow')
  const log = await page.evaluate(() => window.__flashLog).catch(() => ({ painted: [], requests: [] }))
  const finalText = await page.evaluate(() => document.body.innerText).catch(() => '')
  await page.screenshot({ path: join(SHOTS, `${locale}-${screen.name}.png`) }).catch(() => {})
  await page.close()
  return { log, finalText }
}

async function run(browser, locale, copy) {
  const he = locale === 'he'
  const phrases = copy[locale]
  console.log(`\n${locale}) WordPress and Search Console connected, status tables ${SLOW_MS} ms slow`)
  await stub('/__stub/slow')
  await stub('/__stub/reset')
  await stub('/__stub/fixture?account=web')
  await stub('/__stub/fixture?gsc=connected')
  await stub('/__stub/fixture?wp=connected')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: he ? 'he-IL' : 'en-US' })
  const page = await ctx.newPage()
  await login(page, he)
  check(`${locale}: signed in`, !page.url().includes('/login') && !page.url().includes('/billing'), page.url())
  await page.close()

  for (const screen of SCREENS) {
    // One unmeasured visit first: a cold route is not what this measures.
    const warm = await ctx.newPage()
    await warm.goto(`${BASE}${screen.path}`, { waitUntil: 'load', timeout: 120000 }).catch(() => {})
    await warm.waitForTimeout(1500)
    await warm.close()

    let seen
    try { seen = await visit(ctx, screen, phrases, locale) } catch (err) {
      check(`${locale} ${screen.name}: the screen opened`, false, err && err.message)
      continue
    }
    const { log, finalText } = seen
    const slowSeen = log.requests.filter((r) => r.end !== null && r.end - r.start >= SLOW_MS * 0.8)
    check(`${locale} ${screen.name}: the status was really on its way for a while (a request took ≥ ${Math.round(SLOW_MS * 0.8)} ms)`,
      slowSeen.length > 0, JSON.stringify(log.requests.map((r) => `${r.url.slice(0, 40)} ${r.end === null ? 'pending' : r.end - r.start}`)))
    const whilePending = log.painted.filter((p) => p.pending.length > 0)
    check(`${locale} ${screen.name}: nothing "not connected" painted while a status request was pending`,
      whilePending.length === 0, whilePending.slice(0, 3).map((p) => `${p.at}ms "${p.phrase}" while ${p.pending.join(', ')}`).join(' | '))
    const ever = [...new Set(log.painted.map((p) => p.phrase))]
    check(`${locale} ${screen.name}: …nor at any time (everything is connected)`, ever.length === 0, ever.join(' | '))
    if (screen.name === 'settings') {
      check(`${locale} settings: in the end the platform card names WordPress`, /WordPress/.test(finalText) && !phrases.some((p) => finalText.includes(p)))
    }
  }

  // Positive control: nothing connected → the screens do end up saying so, so a
  // recorder that saw nothing above is a recorder that works.
  console.log(`\n${locale}) control: nothing connected`)
  await stub('/__stub/fixture?gsc=disconnected')
  await stub('/__stub/fixture?wp=disconnected')
  for (const screen of [SCREENS[0], SCREENS[3]]) {
    let seen
    try { seen = await visit(ctx, screen, phrases, locale) } catch (err) {
      check(`${locale} ${screen.name} (control): the screen opened`, false, err && err.message)
      continue
    }
    const { log, finalText } = seen
    const finalPhrases = phrases.filter((p) => finalText.includes(p))
    check(`${locale} ${screen.name} (control): with nothing connected, the screen says so once the answers are in`, finalPhrases.length > 0 && log.painted.length > 0, finalText.slice(0, 200))
    const early = log.painted.filter((p) => p.pending.length > 0 && !finalPhrases.includes(p.phrase))
    check(`${locale} ${screen.name} (control): …and never something it then took back`, early.length === 0, early.slice(0, 3).map((p) => p.phrase).join(' | '))
  }
  await ctx.close()
}

;(async () => {
  let copy
  try {
    copy = JSON.parse(execFileSync('npx', ['tsx', join(APP_DIR, 'lib/connection-status/__qa__/disconnected-copy.ts')], { cwd: APP_DIR, encoding: 'utf8' }).trim().split('\n').pop())
  } catch (err) {
    console.log('could not read the dictionary copy:', err && err.message)
    console.log('\n0 passed, 1 failed'); process.exitCode = 1; return
  }
  check('the "not connected" copy was read from the dictionaries, in both languages', copy.he.length >= 10 && copy.en.length >= 10)
  let server = null
  if (!process.env.JOURNEY_BASE) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: APP_DIR, detached: true, stdio: 'ignore',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', ENABLE_CONTENT: 'true', GSC_READ_ONLY_ENABLED: 'true' },
    })
  }
  const kill = () => { if (server) try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 120000))) { console.log('server did not start'); kill(); console.log('\n0 passed, 1 failed'); process.exitCode = 1; return }
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    await run(browser, 'he', copy)
    await run(browser, 'en', copy)
    console.log(`\nscreenshots: ${SHOTS}`)
  } catch (err) {
    console.log('journey crashed:', err && err.message)
    fail++
  } finally {
    await stub('/__stub/slow')
    console.log(`\n${pass} passed, ${fail} failed`)
    await browser.close().catch(() => {})
    kill()
  }
  if (fail > 0) process.exitCode = 1
})()
