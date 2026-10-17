/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * THE CONSENT UPDATE IS NOT JUST SENT, IT IS READ.
 *
 * consent-tags.js proves the loader: googletagmanager.com is not contacted
 * before a decision, and is contacted after one. That is a different claim from
 * "the tags inside the container then do their job", and the gap between the two
 * hid a real defect for months.
 *
 * Measured on the live site on 17 October 2026: after "accept all", the GA4 hit
 * carried `gcs=G100` — ad_storage denied, analytics_storage denied — because the
 * update was pushed as a plain array and Google reads a consent command only as
 * the `arguments` object gtag() pushes. Google answers 204 to such a hit and
 * keeps nothing, so the property stayed empty while the tag looked installed.
 *
 * The observable that distinguishes the two shapes, without sending anything to
 * Google or to Meta: GTM stamps every dataLayer entry it PROCESSES with
 * `gtm.uniqueEventId`. An entry it ignores never gets one. So:
 *
 *   A  before any choice           → no googletagmanager request
 *   B  after accept all            → gtm.js is requested
 *   C  the consent entries         → every `consent` command is arguments-shaped
 *   D  the update                  → carries gtm.uniqueEventId, i.e. GTM read it
 *   E  the granted state           → analytics_storage granted in that entry
 *
 * The REAL container is allowed to load, because an empty stub would stamp
 * nothing and the assertion would be vacuous. google-analytics.com and
 * connect.facebook.net are blocked, so this journey sends no data anywhere.
 *
 * Mutation control (run by hand on 17 Oct 2026): with the array-shaped push
 * restored, C and D fail and B still passes — which is exactly how the defect
 * escaped the loader journey.
 *
 *   node lib/__qa__/reviewer-journey/consent-signal-read.js
 */
const { spawn } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3987)
const BASE = process.env.JOURNEY_BASE || `http://127.0.0.1:${PORT}`
const APP_DIR = process.env.JOURNEY_APP_DIR || join(__dirname, '..', '..', '..')
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/consent-signal-read'
mkdirSync(SHOTS, { recursive: true })

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d === undefined ? '' : ` — ${JSON.stringify(d)}`}`) } }

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/**
 * The container must come from Google; without it nothing stamps anything, and
 * the assertion would pass vacuously. Probed through the BROWSER's request
 * context, because that is the client that has to reach Google and Node's own
 * fetch ignores HTTPS_PROXY.
 */
async function googleReachable(ctx) {
  try {
    const r = await ctx.request.get('https://www.googletagmanager.com/gtm.js?id=GTM-PC29G3NQ', { timeout: 30000 })
    if (r.status() !== 200) return false
    return (await r.text()).includes('"tags"')
  } catch { return false }
}

;(async () => {
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: APP_DIR, detached: true, stdio: 'ignore',
    env: { ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:5555',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key' },
  })
  const kill = () => { try { process.kill(-server.pid, 'SIGKILL') } catch {} }
  if (!(await waitFor(server, 120000))) { console.log('server did not start'); kill(); return }

  const { chromium } = require(join(APP_DIR, 'node_modules', 'playwright-core'))
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--ignore-certificate-errors'],
    // The container comes from Google, so this browser needs the egress proxy —
    // but the app under test is plain HTTP on localhost, which that proxy
    // refuses, so localhost must bypass it.
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost,::1' } }
      : {}),
  })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
    if (!(await googleReachable(ctx))) {
      console.log('skipped (needs its own build): googletagmanager.com is not reachable from this browser')
      return
    }
    const page = await ctx.newPage()
    const reqs = []
    page.on('request', (r) => reqs.push(r.url()))
    // Our own server and Google's container only. Nothing is reported anywhere.
    await page.route('**/*', (route) => {
      const h = new URL(route.request().url()).hostname
      return h === '127.0.0.1' || h === 'www.googletagmanager.com' ? route.continue() : route.abort()
    })

    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90000 })
    // The banner is client-rendered; a cold `next start` needs more than a
    // couple of seconds for the first page, so wait for the control itself.
    await page.getByRole('button', { name: /אישור הכל/ }).first()
      .waitFor({ state: 'visible', timeout: 45000 }).catch(() => {})
    check('A: before any choice, googletagmanager is not contacted',
      reqs.filter((u) => /googletagmanager\.com/.test(u)).length === 0)
    await page.screenshot({ path: join(SHOTS, 'a-before.png') })

    const accept = page.getByRole('button', { name: /אישור הכל/ }).first()
    const found = await accept.count() > 0
    check('the accept-all control is on the page', found,
      found ? undefined : (await page.locator('button').allInnerTexts()).slice(0, 14))
    if (!found) return
    await accept.click()
    await page.waitForTimeout(9000)
    await page.screenshot({ path: join(SHOTS, 'b-after.png') })

    check('B: after accepting, gtm.js is requested',
      reqs.some((u) => /googletagmanager\.com\/gtm\.js/.test(u)))

    const consent = await page.evaluate(() => (window.dataLayer || [])
      .map((e, i) => ({ i, entry: e }))
      .filter(({ entry }) => entry && typeof entry === 'object' && entry[0] === 'consent')
      .map(({ i, entry }) => ({
        i,
        command: entry[1],
        // An arguments object is array-LIKE but not an Array; that is the shape
        // Google reads, and the one thing this journey exists to pin down.
        isArray: Array.isArray(entry),
        stamped: Object.prototype.hasOwnProperty.call(entry, 'gtm.uniqueEventId'),
        analytics: entry[2] && entry[2].analytics_storage,
      })))
    console.log('   consent entries:', JSON.stringify(consent))

    check('C: no consent command is a plain array',
      consent.length > 0 && consent.every((c) => !c.isArray), consent)
    const updates = consent.filter((c) => c.command === 'update')
    check('D: GTM read the update (it carries gtm.uniqueEventId)',
      updates.length > 0 && updates.some((c) => c.stamped), updates)
    check('E: the update GTM read grants analytics_storage',
      updates.some((c) => c.stamped && c.analytics === 'granted'), updates)
  } finally {
    await browser.close(); kill()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})()
