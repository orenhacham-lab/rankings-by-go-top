/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * THE CLAIM THAT MATTERS, MEASURED IN A REAL BROWSER: no request reaches
 * googletagmanager.com before the visitor has allowed a category.
 *
 * Source guards can only show that the code intends this. Only a browser can
 * show it happens, because the thing being prevented is a NETWORK REQUEST made
 * by a script we do not control. So every request the page makes is recorded,
 * and the assertions are about that list:
 *
 *   A  first visit, nothing clicked      → zero Google tag requests
 *   B  "reject all"                      → still zero, and POST /api/consent
 *   C  reload after rejecting            → still zero, and no banner again
 *   D  "accept all"                      → the tag IS requested (the positive
 *                                          control: a recorder that sees nothing
 *                                          whatever we click proves nothing)
 *   E  withdraw from the footer          → consent update goes to denied
 *   F  Global Privacy Control on         → no banner, no tag, refusal recorded
 *   G  the three buttons are real peers  → measured geometry, not class names
 *
 * Screenshots of every state go to QA_SCREENSHOT_DIR.
 *
 *   node lib/__qa__/reviewer-journey/consent-tags.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running.
 */
const { spawn } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3989)
const BASE = process.env.JOURNEY_BASE || `http://localhost:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || join(__dirname, '..', '..', '..')
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/consent-tags'
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

const GOOGLE_TAG = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|connect\.facebook\.net/

/**
 * A page with two recorders attached: every request URL, and every consent
 * command pushed onto the dataLayer. The dataLayer is read rather than trusted,
 * because "we told Google" is the part a reviewer cannot see from a screenshot.
 */
async function openRecorded(browser, path, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options.context })
  if (options.gpc) {
    // Chromium has no switch for this, so the property is defined before any
    // page script runs — which is exactly what a real GPC browser presents.
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true, configurable: true })
    })
  }
  const page = await ctx.newPage()
  const requests = []
  page.on('request', (r) => requests.push(r.url()))
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {})
  await page.waitForFunction(() => !!window.next, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1200)
  return { ctx, page, requests, tags: () => requests.filter((u) => GOOGLE_TAG.test(u)) }
}

const consentPushes = (page) => page.evaluate(() => (window.dataLayer || [])
  .map((e) => (Array.isArray(e) ? e : Array.from(e || [])))
  .filter((a) => a[0] === 'consent')
  .map((a) => ({ kind: a[1], state: a[2] })))

const clickBanner = async (page, label) => {
  // The desktop card is the one on screen at 1440; the phone card is sm:hidden.
  const button = page.locator(`[data-cookie-desktop] button:has-text("${label}")`).first()
  await button.click({ timeout: 15000 })
  await page.waitForTimeout(1500)
}

async function partA(browser) {
  console.log('\nA) first visit: nothing is asked of Google before the visitor answers')
  for (const [path, lang] of [['/', 'he'], ['/en', 'en']]) {
    const { ctx, page, tags } = await openRecorded(browser, path)
    const banner = await page.locator('[data-cookie-consent]').count()
    check(`${lang}: the notice is shown`, banner === 1)
    check(`${lang}: ZERO requests to a Google or Meta tag host before any click`, tags().length === 0, JSON.stringify(tags()))
    const pushes = await consentPushes(page)
    // The default must be on the dataLayer, and it must be the denied one.
    const def = pushes.find((p) => p.kind === 'default')
    check(`${lang}: a denied Consent Mode default was declared`, !!def
      && def.state.ad_storage === 'denied' && def.state.analytics_storage === 'denied'
      && def.state.ad_user_data === 'denied' && def.state.ad_personalization === 'denied'
      && def.state.security_storage === 'granted', JSON.stringify(def))
    await page.screenshot({ path: join(SHOTS, `banner-${lang}-1440.png`) }).catch(() => {})
    await ctx.close()
  }
  // The phone card, at the size the owner's rule is about.
  const { ctx, page } = await openRecorded(browser, '/', { context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } })
  await page.waitForSelector('[data-cookie-compact]', { timeout: 20000 }).catch(() => {})
  const compact = await page.locator('[data-cookie-compact] button').count()
  check('390 he: the phone card carries all three controls too', compact === 3, String(compact))
  await page.screenshot({ path: join(SHOTS, 'banner-he-390.png') }).catch(() => {})
  await ctx.close()
}

async function partB(browser) {
  console.log('\nB) "reject all": nothing is loaded, and the refusal is recorded')
  const { ctx, page, requests, tags } = await openRecorded(browser, '/')
  await clickBanner(page, 'דחיית הכל')
  check('after refusing, STILL zero Google or Meta tag requests', tags().length === 0, JSON.stringify(tags()))
  check('the notice is gone', (await page.locator('[data-cookie-consent]').count()) === 0)
  const logged = requests.filter((u) => u.includes('/api/consent'))
  check('the refusal was sent to the consent log', logged.length >= 1, JSON.stringify(logged))
  const pushes = await consentPushes(page)
  const update = pushes.filter((p) => p.kind === 'update').pop()
  check('a denied consent update was declared', !!update && update.state.analytics_storage === 'denied' && update.state.ad_storage === 'denied', JSON.stringify(update))
  const stored = await page.evaluate(() => window.localStorage.getItem('gotop-consent'))
  check('the decision is stored with its action and policy version', !!stored && /"action":"reject_all"/.test(stored) && /"policy":"2026-10-03"/.test(stored), String(stored))
  check('the old accept-only flag is not written', (await page.evaluate(() => window.localStorage.getItem('cookie-consent-accepted'))) === null)
  await page.screenshot({ path: join(SHOTS, 'after-reject-he-1440.png') }).catch(() => {})

  console.log('\nC) a reload after refusing does not ask again and does not load anything')
  const after = []
  page.on('request', (r) => after.push(r.url()))
  await page.reload({ waitUntil: 'networkidle', timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(1500)
  check('no notice on the second visit', (await page.locator('[data-cookie-consent]').count()) === 0)
  check('no Google or Meta tag request on the second visit either', after.filter((u) => GOOGLE_TAG.test(u)).length === 0, JSON.stringify(after.filter((u) => GOOGLE_TAG.test(u))))
  await ctx.close()
}

async function partD(browser) {
  console.log('\nD) POSITIVE CONTROL — "accept all": the tag IS requested')
  const { ctx, page, tags } = await openRecorded(browser, '/')
  await clickBanner(page, 'אישור הכל')
  await page.waitForTimeout(2500)
  check('the tag container was requested once consent allowed it', tags().some((u) => /googletagmanager\.com\/gtm\.js/.test(u)), JSON.stringify(tags()))
  const pushes = await consentPushes(page)
  const update = pushes.filter((p) => p.kind === 'update').pop()
  check('a granted consent update was declared', !!update && update.state.analytics_storage === 'granted' && update.state.ad_storage === 'granted', JSON.stringify(update))
  const stored = await page.evaluate(() => window.localStorage.getItem('gotop-consent'))
  check('the grant is stored as accept_all', !!stored && /"action":"accept_all"/.test(stored))
  await page.screenshot({ path: join(SHOTS, 'after-accept-he-1440.png') }).catch(() => {})

  console.log('\nE) withdrawal from the footer, on the same page view')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(400)
  await page.locator('[data-cookie-settings-link]').first().click({ timeout: 15000 })
  await page.waitForSelector('[data-consent-preferences]', { timeout: 15000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(SHOTS, 'preferences-he-1440.png') }).catch(() => {})
  const locked = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-consent-preferences] input[type="checkbox"]')]
    return boxes.map((b) => ({ checked: b.checked, disabled: b.disabled }))
  })
  check('the panel shows three categories, with the necessary one locked on', locked.length === 3 && locked[0].disabled === true && locked[0].checked === true, JSON.stringify(locked))
  await page.locator('[data-consent-preferences] button:has-text("דחיית הכל")').first().click()
  await page.waitForTimeout(1500)
  const pushes2 = await consentPushes(page)
  const last = pushes2.filter((p) => p.kind === 'update').pop()
  check('withdrawing pushes a denied update without a reload', !!last && last.state.analytics_storage === 'denied' && last.state.ad_storage === 'denied', JSON.stringify(last))
  const stored2 = await page.evaluate(() => window.localStorage.getItem('gotop-consent'))
  check('the withdrawal is recorded as a withdrawal, not as a fresh refusal', !!stored2 && /"action":"withdraw"/.test(stored2), String(stored2))
  await ctx.close()
}

async function partF(browser) {
  console.log('\nF) a browser that sends Global Privacy Control is not asked twice')
  const { ctx, page, requests, tags } = await openRecorded(browser, '/', { gpc: true })
  check('no notice is shown to a visitor who already opted out', (await page.locator('[data-cookie-consent]').count()) === 0)
  check('no Google or Meta tag request', tags().length === 0, JSON.stringify(tags()))
  const stored = await page.evaluate(() => window.localStorage.getItem('gotop-consent'))
  check('the signal is recorded as a refusal with action gpc', !!stored && /"action":"gpc"/.test(stored), String(stored))
  check('the refusal reached the consent log', requests.filter((u) => u.includes('/api/consent')).length >= 1)
  await ctx.close()
}

async function partG(browser) {
  console.log('\nG) accepting and refusing are peers on screen, measured')
  for (const [path, lang, accept, reject] of [['/', 'he', 'אישור הכל', 'דחיית הכל'], ['/en', 'en', 'Accept all', 'Reject all']]) {
    const { ctx, page } = await openRecorded(browser, path)
    const geom = await page.evaluate(([a, r]) => {
      const find = (text) => [...document.querySelectorAll('[data-cookie-desktop] button')].find((b) => b.textContent.trim() === text)
      const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return { w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.y), size: s.fontSize, weight: s.fontWeight } }
      return { accept: box(find(a)), reject: box(find(r)) }
    }, [accept, reject])
    const { accept: A, reject: R } = geom
    // Equal prominence, as the EDPB's cookie-banner findings describe it: the
    // same size, the same row, the same type. Not "both are buttons".
    check(`${lang}: both decisions are the same height and width, on the same row`,
      !!A && !!R && A.h === R.h && Math.abs(A.w - R.w) <= 1 && Math.abs(A.y - R.y) <= 1, JSON.stringify(geom))
    check(`${lang}: both are set in the same size and weight`, !!A && !!R && A.size === R.size && A.weight === R.weight, JSON.stringify(geom))
    if (lang === 'en') {
      await page.locator('[data-cookie-desktop] button:has-text("Customise")').first().click({ timeout: 15000 })
      await page.waitForSelector('[data-consent-preferences]', { timeout: 15000 })
      await page.waitForTimeout(600)
      await page.screenshot({ path: join(SHOTS, 'preferences-en-1440.png') }).catch(() => {})
      // Escape must close WITHOUT deciding: closing a dialog is not a choice.
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
      check('en: Escape closes the panel without recording a decision',
        (await page.locator('[data-consent-preferences]').count()) === 0
        && (await page.evaluate(() => window.localStorage.getItem('gotop-consent'))) === null)
    }
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
    await partA(browser)
    await partB(browser)
    await partD(browser)
    await partF(browser)
    await partG(browser)
    console.log(`\nscreenshots: ${SHOTS}`)
  } catch (err) {
    console.log('journey crashed:', err && err.message)
    fail++
  } finally {
    console.log(`\n${pass} passed, ${fail} failed`)
    await browser.close().catch(() => {})
    kill()
  }
  if (fail > 0) process.exitCode = 1
})()
