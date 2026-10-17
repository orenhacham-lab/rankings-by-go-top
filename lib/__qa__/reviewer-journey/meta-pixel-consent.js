/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * THE META PIXEL LOADS FOR A MARKETING GRANT AND FOR NOTHING ELSE.
 *
 * Measured on the live site on 17 October 2026, while the pixel was still a
 * Custom HTML tag inside the GTM container: a visitor who allowed "measurement"
 * and refused "marketing" loaded connect.facebook.net anyway and had the pixel
 * initialise, because none of the container's tags carried consent settings and
 * our loader fetches gtm.js when EITHER category is granted. The cookie notice
 * promises the opposite, in four languages.
 *
 * So the pixel moved into our code, and this is the journey that holds it:
 *
 *   A  no decision yet         → connect.facebook.net is not contacted
 *   B  measurement only        → still not contacted (the case that leaked)
 *   C  accept all              → contacted, and the pixel is initialised
 *   D  the calls               → exactly init(our id) then track PageView
 *   E  withdrawal              → consent revoke is sent to the loaded pixel
 *
 * Nothing reaches Meta: connect.facebook.net is answered by a stub that plays
 * fbevents' own part — it installs `fbq.callMethod` and replays the queue —
 * and records what it is asked to do. Every other host is aborted, so the real
 * GTM container is not fetched here either; consent-signal-read.js covers that
 * side.
 *
 * Mutation control (run by hand on 17 Oct 2026): with the gate widened to
 * `analytics || marketing`, B fails and the rest still passes.
 *
 *   node lib/__qa__/reviewer-journey/meta-pixel-consent.js
 */
const { spawn } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3989)
const BASE = process.env.JOURNEY_BASE || `http://127.0.0.1:${PORT}`
const APP_DIR = process.env.JOURNEY_APP_DIR || join(__dirname, '..', '..', '..')
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/meta-pixel-consent'
const PIXEL_ID = '1427506179136706'
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

/*
 * What fbevents.js does on arrival, and no more: take over `fbq.callMethod`,
 * replay whatever the page queued before the script landed, and keep recording.
 * The page cannot tell this from the real thing, and Meta is never contacted.
 */
const FBEVENTS_STUB = `
window.__fbCalls = window.__fbCalls || [];
(function () {
  var fbq = window.fbq;
  if (!fbq) return;
  fbq.callMethod = function () { window.__fbCalls.push(Array.prototype.slice.call(arguments)); };
  var queued = fbq.queue || [];
  for (var i = 0; i < queued.length; i++) fbq.callMethod.apply(null, queued[i]);
  fbq.queue = [];
  fbq.loaded = true;
})();
`

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
  })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
    const page = await ctx.newPage()
    const reqs = []
    page.on('request', (r) => reqs.push(r.url()))
    await page.route('**/*', (route) => {
      const url = route.request().url()
      if (/connect\.facebook\.net/.test(url)) {
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: FBEVENTS_STUB })
      }
      return new URL(url).hostname === '127.0.0.1' ? route.continue() : route.abort()
    })
    const metaReqs = () => reqs.filter((u) => /connect\.facebook\.net|facebook\.com\/tr/.test(u))

    // A — nothing answered yet.
    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90000 })
    const accept = page.getByRole('button', { name: /אישור הכל/ }).first()
    await accept.waitFor({ state: 'visible', timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(2500)
    check('A: before any choice, connect.facebook.net is not contacted', metaReqs().length === 0, metaReqs())
    await page.screenshot({ path: join(SHOTS, 'a-no-decision.png') })

    // B — measurement allowed, marketing refused. The case that used to leak.
    const customize = page.getByRole('button', { name: /התאמה אישית/ }).first()
    const hasPanel = (await customize.count()) > 0
    check('the customise control is on the page', hasPanel,
      hasPanel ? undefined : (await page.locator('button').allInnerTexts()).slice(0, 14))
    if (!hasPanel) return
    await customize.click()
    // One checkbox per consent category, in the order the model declares them:
    // necessary (locked), analytics, marketing.
    const boxes = page.locator('input[type=checkbox]')
    await boxes.nth(1).waitFor({ state: 'visible', timeout: 20000 })
    await boxes.nth(1).check()
    if (await boxes.nth(2).isChecked()) await boxes.nth(2).uncheck()
    const picked = {
      analytics: await boxes.nth(1).isChecked(),
      marketing: await boxes.nth(2).isChecked(),
    }
    await page.getByRole('button', { name: /שמירת הבחירה/ }).first().click()
    await page.waitForTimeout(6000)
    await page.screenshot({ path: join(SHOTS, 'b-analytics-only.png') })
    const stored = await page.evaluate(() => localStorage.getItem('gotop-consent'))
    check('the stored decision is measurement-only',
      picked.analytics === true && picked.marketing === false && /"marketing":false/.test(stored || ''),
      { picked, stored })
    check('B: measurement alone does NOT load the pixel', metaReqs().length === 0, metaReqs())
    check('B2: and nothing was tracked', (await page.evaluate(() => window.__fbCalls || [])).length === 0)

    // C — the grant the pixel is actually for.
    // Reopened from the footer, the dialog shows the category panel itself, so
    // the grant is made the way a visitor makes it: tick marketing, save.
    await page.getByRole('button', { name: /הגדרות עוגיות/ }).first().click()
    await boxes.nth(2).waitFor({ state: 'visible', timeout: 20000 })
    await boxes.nth(2).check()
    await page.getByRole('button', { name: /שמירת הבחירה/ }).first().click()
    await page.waitForTimeout(6000)
    await page.screenshot({ path: join(SHOTS, 'c-accept-all.png') })
    check('C: after allowing marketing, fbevents is fetched',
      metaReqs().some((u) => /connect\.facebook\.net/.test(u)), metaReqs())

    const calls = await page.evaluate(() => window.__fbCalls || [])
    console.log('   fbq calls:', JSON.stringify(calls))
    check('D: the pixel is initialised with our id',
      calls.some((c) => c[0] === 'init' && c[1] === PIXEL_ID), calls)
    check('D2: a PageView is tracked, after the init',
      calls.findIndex((c) => c[0] === 'track' && c[1] === 'PageView') > calls.findIndex((c) => c[0] === 'init'), calls)
    check('D3: nothing else is sent to Meta',
      calls.every((c) => c[0] === 'init' || (c[0] === 'track' && c[1] === 'PageView') || c[0] === 'consent'), calls)

    // E — withdrawal. The script cannot be un-run, so revoke is the contract.
    await page.getByRole('button', { name: /הגדרות עוגיות/ }).first().click()
    await boxes.nth(2).waitFor({ state: 'visible', timeout: 20000 })
    await boxes.nth(2).uncheck()
    await page.getByRole('button', { name: /שמירת הבחירה/ }).first().click()
    await page.waitForTimeout(4000)
    const after = await page.evaluate(() => window.__fbCalls || [])
    check('E: withdrawing marketing revokes consent on the loaded pixel',
      after.some((c) => c[0] === 'consent' && c[1] === 'revoke'), after.slice(-4))
    await page.screenshot({ path: join(SHOTS, 'e-withdrawn.png') })
  } finally {
    await browser.close(); kill()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})()
