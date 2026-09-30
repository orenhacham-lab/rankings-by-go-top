/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * Wave-7 review, public and shell polish, measured in a real browser:
 *
 *   P0-2  the landing's counters show their real figures for a visitor whose
 *         system asks for reduced motion (they read "0" for good before);
 *   P1-1  a trial bar the merchant hid is never painted on the next page load
 *         (it painted, then vanished, and the page jumped up under it);
 *   P2-1  the project switcher never says "loading projects…" as text: while the
 *         list loads it is a skeleton pill;
 *   P2-10 the privacy notice covers neither the English hero headline at 1440
 *         nor touches the accessibility button's slot on a phone.
 * (P2-14, the dashboard fold, needs a project with data and is guarded in
 * lib/__qa__/w7-fix-public.qa.ts instead.)
 *
 * Every "never" has a positive control, so a recorder that sees nothing cannot
 * pass: the counters DO animate with motion allowed, the bar DOES show when it
 * was not hidden, the switcher's skeleton IS seen while the list is slow.
 * Mutation control: run it against the code before the fix (see the report).
 *
 *   node lib/__qa__/reviewer-journey/w7-public-polish.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running; STUB_URL points at a
 * stub on another port.
 */
const { spawn } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3988)
const BASE = process.env.JOURNEY_BASE || `http://localhost:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || join(__dirname, '..', '..', '..')
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/w7-public-polish'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
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

async function login(page) {
  for (let attempt = 0; attempt < 2 && (attempt === 0 || page.url().includes('/login')); attempt += 1) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
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

/** Every landing counter: what it draws (aria-hidden) and what it is (sr-only). */
const readCounters = (page) => page.evaluate(() => [...document.querySelectorAll('span.tabular-nums')]
  .map((el) => ({ shown: el.querySelector(':scope > [aria-hidden="true"]')?.textContent ?? null, value: el.querySelector(':scope > .sr-only')?.textContent ?? null }))
  .filter((c) => c.shown !== null && c.value !== null))

async function scrollThrough(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += 500) { await page.evaluate((top) => window.scrollTo(0, top), y); await page.waitForTimeout(120) }
}

async function counters(browser) {
  console.log('\nP0-2) landing counters under reduced motion')
  for (const path of ['/', '/en']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {})
    await page.waitForFunction(() => !!window.next, { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(800)
    await scrollThrough(page)
    await page.waitForTimeout(1500)
    const list = await readCounters(page)
    check(`${path}: the page has counters to read`, list.length >= 3, JSON.stringify(list))
    const wrong = list.filter((c) => c.shown !== c.value)
    check(`${path}: with reduced motion every counter shows its real figure`, list.length > 0 && wrong.length === 0, JSON.stringify(wrong))
    await page.screenshot({ path: join(SHOTS, `counters-reduced${path === '/' ? '-he' : path.replace(/\//g, '-')}.png`), fullPage: false }).catch(() => {})
    await ctx.close()
  }
  // Positive control: with motion allowed they count up and land on the same figures.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {})
  await page.waitForFunction(() => !!window.next, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(800)
  await scrollThrough(page)
  await page.waitForTimeout(2500)
  const list = await readCounters(page)
  check('control: with motion allowed the counters land on their figures too', list.length >= 3 && list.every((c) => c.shown === c.value), JSON.stringify(list))
  await ctx.close()
}

// From the first byte: was the trial bar ever in the page, was the switcher ever loading text, was its skeleton seen.
const RECORDER = `(() => {
  const log = { bar: false, text: false, skeleton: false }
  window.__polish = log
  function sample() {
    if (document.querySelector('[data-trial-bar]')) log.bar = true
    const ws = document.querySelector('[data-onboarding="workspace"]')
    if (ws && ws.hasAttribute('data-switcher-skeleton')) log.skeleton = true
    if (ws && ws.tagName === 'SPAN' && !ws.hasAttribute('data-switcher-skeleton')) log.text = true
    requestAnimationFrame(sample)
  }
  new MutationObserver(sample).observe(document, { childList: true, subtree: true })
  requestAnimationFrame(sample)
})()`

async function shell(browser) {
  console.log('\nP1-1 / P2-1) the trial bar after it was hidden, and the switcher while it loads')
  await stub('/__stub/reset')
  await stub('/__stub/fixture?account=web')
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'he-IL' })
    await ctx.addInitScript(RECORDER)
    const page = await ctx.newPage()
    await login(page)
    await page.goto(`${BASE}/keywords`, { waitUntil: 'load', timeout: 120000 }).catch(() => {})
    const shown = await page.waitForSelector('[data-trial-bar]', { timeout: 30000 }).then(() => true).catch(() => false)
    check(`${width} control: a trial account sees the bar before hiding it`, shown)
    await page.click('[data-trial-hide]').catch(() => {})
    await page.waitForTimeout(400)
    check(`${width}: hiding takes it away at once`, !(await page.$('[data-trial-bar]')))

    await stub('/__stub/slow?tables=projects&ms=1500')
    for (const path of ['/dashboard', '/keywords']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'commit', timeout: 120000 }).catch(() => {})
      await page.waitForSelector('[data-onboarding="workspace"] button, [data-onboarding="workspace"]:not([data-switcher-skeleton])', { timeout: 60000 }).catch(() => {})
      await page.waitForTimeout(1500)
      const log = await page.evaluate(() => window.__polish).catch(() => null)
      check(`${width} ${path}: the hidden trial bar was never painted (no flash)`, !!log && log.bar === false, JSON.stringify(log))
      check(`${width} ${path}: the switcher never said "loading projects" as text`, !!log && log.text === false, JSON.stringify(log))
      check(`${width} ${path} control: its skeleton pill was seen while the list was slow`, !!log && log.skeleton === true, JSON.stringify(log))
    }
    await stub('/__stub/slow')
    await page.screenshot({ path: join(SHOTS, `shell-after-hide-${width}.png`) }).catch(() => {})

    await ctx.close()
  }
}

const overlap = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

// w9: the privacy notice is the small popup at the left side again (the owner's ask). The wrapper
// [data-cookie-consent] has no box of its own; the card is its visible fixed child.
const cardBox = (page) => page.evaluate(() => {
  const card = [...document.querySelectorAll('[data-cookie-consent] > div')].find((d) => d.getBoundingClientRect().width > 0)
  if (!card) return null
  const b = card.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }
})

async function cookie(browser) {
  console.log('\nP2-10 / w9) the privacy notice is a small popup at the left and clears the headline and the accessibility button')
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/en`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {})
    await page.waitForSelector('[data-cookie-consent]', { timeout: 30000 }).catch(() => {})
    const notice = await cardBox(page)
    const h1 = await page.$('h1').then((h) => h && h.boundingBox()).catch(() => null)
    check('1440 /en: the notice is shown (control)', !!notice)
    check('1440 /en: it does not cover the hero headline', !!notice && !!h1 && !overlap(notice, h1), JSON.stringify({ notice, h1 }))
    check('1440 /en: it is the small popup in the bottom-left corner (340px wide, not a bar)', !!notice && notice.width <= 360 && notice.x <= 32 && notice.y + notice.height >= 900 - 40, JSON.stringify(notice))
    await page.screenshot({ path: join(SHOTS, 'cookie-en-1440.png') }).catch(() => {})
    await ctx.close()
  }
  for (const path of ['/', '/en']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {})
    await page.waitForSelector('[data-cookie-consent]', { timeout: 30000 }).catch(() => {})
    const boxes = await page.evaluate(() => {
      const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } }
      return { a11y: r(document.querySelector('[data-a11y-trigger]')), bar: r(document.querySelector('[data-mobile-contact-bar]')) }
    })
    const notice = await cardBox(page)
    check(`390 ${path}: the small card sits clear of the accessibility button and above the contact bar`, !!notice && !!boxes.a11y && !overlap(notice, boxes.a11y) && (!boxes.bar || notice.y + notice.height <= boxes.bar.y), JSON.stringify({ notice, ...boxes }))
    await page.screenshot({ path: join(SHOTS, `cookie${path === '/' ? '-he' : path.replace(/\//g, '-')}-390.png`) }).catch(() => {})
    await ctx.close()
  }
}

;(async () => {
  let server = null
  if (!process.env.JOURNEY_BASE) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: APP_DIR, detached: true, stdio: 'ignore',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key' },
    })
  }
  const kill = () => { if (server) try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 120000))) { console.log('server did not start'); kill(); console.log('\n0 passed, 1 failed'); process.exitCode = 1; return }
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    await counters(browser)
    await shell(browser)
    await cookie(browser)
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
