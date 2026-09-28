/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * WordPress from the project settings' connections: choose WordPress in
 * "Choose platform", confirm, and the connection form the modal promised is on
 * screen (site address, username, application password); test and save then
 * run the existing WordPress routes.
 *
 * The bug this holds: confirming set the section's choice to WordPress and at
 * once re-read the connections; the re-read found none connected (nothing is,
 * yet) and reset the choice, so the WordPress panel mounted and vanished and
 * the merchant was left on the empty platform card.
 *
 * The container cannot reach a WordPress site, so the test and the save end in
 * the routes' own "could not reach the site" answer; what is asserted is that
 * the form works, the routes are reached with the typed values, nothing is
 * stored for a site that could not be reached, and the merchant reads our
 * sentence in their own language, never the route's English or a raw network
 * error. The modal's other guidance is checked on the way: the detected
 * platform preselected, Wix's steps, and the custom-built site's way out.
 *
 *   node lib/__qa__/reviewer-journey/wordpress-connect-settings.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running; STUB_URL points at
 * a stub on another port.
 */
const { spawn } = require('child_process')
const { randomBytes } = require('crypto')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3989)
const BASE = process.env.JOURNEY_BASE || `http://127.0.0.1:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || '/home/user/rankings-by-go-top'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/wordpress-connect-settings'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555' // the stub's project
const RAW = /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|undici|TypeError|getaddrinfo|socket hang up|certificate/i

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

async function run(browser, locale) {
  const he = locale === 'he'
  console.log(`\n${locale}) settings → connections → WordPress`)
  await stub('/__stub/reset')
  await stub('/__stub/fixture?account=web')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: he ? 'he-IL' : 'en-US' })
  const page = await ctx.newPage()
  // Until React hydrates, the form is inert: wait for it, and try again once.
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
  check(`${locale}: signed in`, !page.url().includes('/login') && !page.url().includes('/billing'), page.url())
  await page.goto(`${BASE}/settings?projectId=${PROJECT_ID}&lang=${locale}#platform`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const opened = await page.waitForSelector('[data-open-switch]', { timeout: 90000 }).then(() => true).catch(() => false)
  check(`${locale}: the platform card offers "choose platform"`, opened)
  if (!opened) { await page.screenshot({ path: join(SHOTS, `${locale}-0-settings.png`), fullPage: true }); await ctx.close(); return }
  await page.$eval('#platform', (el) => el.scrollIntoView({ block: 'start' })).catch(() => {})
  await page.screenshot({ path: join(SHOTS, `${locale}-1-connections.png`) })

  await page.click('[data-open-switch]')
  await page.waitForSelector('[data-switch-choice]', { timeout: 20000 }).catch(() => {})
  // The scan found WordPress on the site: the modal opens with it chosen, and says why.
  const preselected = await page.$('[data-platform-option="wordpress"][aria-checked="true"]')
  const detectedNote = await page.$('[data-switch-detected="wordpress"]')
  check(`${locale}: the platform the scan detected is chosen when the modal opens, and it says so`, !!preselected && !!detectedNote)
  const note = await page.innerText('[data-switch-fields="wordpress"]').catch(() => '')
  check(`${locale}: the modal promises the connection form`, he ? note.includes('טופס החיבור של WordPress') : note.includes('WordPress connection form opens'), note.slice(0, 200))
  await page.screenshot({ path: join(SHOTS, `${locale}-2-choose-wordpress.png`) })

  // Wix: where the two details are, in steps, and a way to ask for help.
  await page.click('[data-platform-option="wix"]')
  const wixSteps = await page.$$eval('[data-switch-steps] li', (els) => els.length).catch(() => 0)
  const wixHelp = await page.$eval('[data-switch-help="wix"] [data-help-whatsapp]', (a) => a.getAttribute('href')).catch(() => null)
  check(`${locale}: Wix explains where its Site ID and API key are, in three steps`, wixSteps === 3, String(wixSteps))
  check(`${locale}: …with a way to ask us instead (our WhatsApp)`, typeof wixHelp === 'string' && wixHelp.startsWith('https://wa.me/'), String(wixHelp))
  await page.screenshot({ path: join(SHOTS, `${locale}-2b-choose-wix.png`) })
  // Custom-built site: "not sure?" → send it to the developer, or write to us.
  await page.click('[data-platform-option="webhook"]')
  const dev = await page.$eval('[data-switch-help="webhook"] [data-help-developer]', (a) => a.getAttribute('href')).catch(() => null)
  const wa = await page.$eval('[data-switch-help="webhook"] [data-help-whatsapp]', (a) => a.getAttribute('href')).catch(() => null)
  check(`${locale}: the custom-built site has an "I don't know what this is" path: instructions for the developer`, typeof dev === 'string' && dev.startsWith('mailto:?subject='), String(dev))
  check(`${locale}: …or our WhatsApp`, typeof wa === 'string' && wa.startsWith('https://wa.me/'), String(wa))
  await page.screenshot({ path: join(SHOTS, `${locale}-2c-choose-custom.png`) })

  await page.click('[data-platform-option="wordpress"]')
  await page.click('[data-switch-confirm]')

  // The re-read of the connections is what used to take the form away: give it
  // time to answer, then look.
  await page.waitForResponse((r) => r.url().includes('/api/site-platforms/connection'), { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const url = await page.$('#platform input[type="url"]')
  const user = await page.$('#platform input[autocomplete="off"]')
  const pass_ = await page.$('#platform input[type="password"]')
  check(`${locale}: after confirming, the WordPress form is on screen`, !!url && !!user && !!pass_)
  check(`${locale}: …without a second "connect" click`, !(await page.$('#platform [data-wp-connect-button]')))
  const steps = await page.$$eval('#platform [data-wp-steps] li', (els) => els.length).catch(() => 0)
  check(`${locale}: the form says where in wp-admin the application password is made, in short steps`, steps === 3, String(steps))
  await page.screenshot({ path: join(SHOTS, `${locale}-3-wordpress-form.png`) })
  if (!url || !user || !pass_) { await ctx.close(); return }

  await url.fill('https://blog.example.com')
  await user.fill('editor')
  await pass_.fill('abcd efgh ijkl mnop qrst uvwx')
  const testRes = page.waitForResponse((r) => r.url().includes('/api/wordpress/test-connection'), { timeout: 60000 }).catch(() => null)
  await page.click('#platform [data-wp-action="test"]').catch(() => {})
  const tested = await testRes
  check(`${locale}: "test connection" reaches the WordPress test route`, !!tested, 'no request')
  const testBody = tested ? await tested.json().catch(() => ({})) : {}
  await page.waitForTimeout(500)
  const afterTest = await page.innerText('#platform').catch(() => '')
  check(`${locale}: the test answer is shown in the merchant's language, never a raw network error`,
    !RAW.test(afterTest) && !RAW.test(JSON.stringify(testBody)) && (he ? /[\u0590-\u05FF]/.test(afterTest.slice(-120)) : true) && !/could not be resolved/.test(afterTest), afterTest.slice(-200))
  await page.screenshot({ path: join(SHOTS, `${locale}-4-tested.png`) })

  const saveRes = page.waitForResponse((r) => r.url().includes('/api/wordpress/connection') && r.request().method() === 'POST', { timeout: 60000 }).catch(() => null)
  await page.click('#platform [data-wp-action="save"]').catch(() => {})
  const saved = await saveRes
  const sent = saved ? JSON.parse(saved.request().postData() || '{}') : {}
  check(`${locale}: "save" sends the typed site, user and password to the WordPress connection route`,
    !!saved && sent.siteUrl === 'https://blog.example.com' && sent.username === 'editor' && sent.applicationPassword === 'abcd efgh ijkl mnop qrst uvwx' && sent.projectId === PROJECT_ID)
  await page.waitForTimeout(1500)
  // This container cannot reach any website, so the route refuses before it
  // stores anything, and says the site could not be reached.
  const afterSave = await page.innerText('#platform').catch(() => '')
  const unreachable = he ? 'לא הצלחנו להגיע לאתר בכתובת הזאת' : 'We could not reach a site at this address'
  check(`${locale}: the answer is our sentence, in the merchant's language`, afterSave.includes(unreachable), afterSave.slice(-240))
  check(`${locale}: …never the route's English text or a raw network error`, !RAW.test(afterSave) && !/could not be resolved|Could not reach the WordPress site/.test(afterSave))
  const db = await stub('/__stub/db')
  const rows = ((db && db.wordpress_connections) || []).filter((r) => r.project_id === PROJECT_ID)
  check(`${locale}: nothing is stored for a site that could not be reached`, rows.length === 0, JSON.stringify(rows.length))
  check(`${locale}: the form stays open with what was typed, to fix and retry`,
    (await page.inputValue('#platform input[type="url"]').catch(() => '')) === 'https://blog.example.com')
  await page.screenshot({ path: join(SHOTS, `${locale}-5-saved.png`) })
  await ctx.close()
}

;(async () => {
  let server = null
  if (!process.env.JOURNEY_BASE) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: APP_DIR, detached: true, stdio: 'ignore',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', ENABLE_SEED_SCAN: 'true', ENABLE_CONTENT: 'true',
        // A throwaway key for this run only: the save route encrypts the password with it.
        CONTENT_CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('hex') },
    })
  }
  const kill = () => { if (server) try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 120000))) { console.log('server did not start'); kill(); console.log('\n0 passed, 1 failed'); process.exitCode = 1; return }
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    await run(browser, 'he')
    await run(browser, 'en')
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
