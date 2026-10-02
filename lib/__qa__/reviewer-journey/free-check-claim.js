/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * Scan before sign-up, carried into the account: an anonymous visitor checks
 * their site, opens the full research, signs up, and lands on the project that
 * sign-up created from that scan. No "create a project" screen on the way.
 *
 *   A. email confirmation off (production today): sign-up answers with a
 *      session and the browser goes straight on;
 *   B. email confirmation on, and the confirmation link opened in ANOTHER tab
 *      of the same browser: the auth callback carries the visitor on.
 *
 * The scan itself is a ledger row replayed by the real free-check route (the
 * container cannot fetch public sites, see free-site-check.js); everything
 * after it is the real app: the claim link, the sign-up form, the claim cookie,
 * the new-project screen, the create and start routes, the seed route
 * redeeming the claim, and the project's summary. Assertions read the stub's
 * database, not only the screen.
 *
 *   node lib/__qa__/reviewer-journey/free-check-claim.js
 *
 * JOURNEY_BASE=<url> drives an app that is already running instead of starting
 * `next start`; STUB_URL points at a stub on another port.
 */
const { spawn } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3988)
// localhost, not 127.0.0.1: `next start` builds request.nextUrl (and so the auth
// callback's redirect origin) on localhost, and a session cookie set on one host
// is not sent to the other, which read as "not signed in" after the callback.
const BASE = process.env.JOURNEY_BASE || `http://localhost:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || '/home/user/rankings-by-go-top'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/free-check-claim'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const USER_ID = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06' // the stub's one user
const DOMAIN = 'perfumeclub.co.il'
const SUMMARY_URL = /\/projects\/([^/?#]+)\/summary/
const BUSINESS = {
  he: 'חנות בשמים אונליין שמוכרת בשמי יוקרה מקוריים לנשים ולגברים.',
  en: 'An online perfume store selling original luxury fragrances for women and men.',
}

function seededResult(locale) {
  const he = locale === 'he'
  return {
    url: `https://${DOMAIN}/`, domain: DOMAIN, scannedAt: new Date().toISOString(), locale,
    business: {
      summary: BUSINESS[locale],
      audiences: he ? ['נשים שמחפשות בושם יוקרתי', 'אספני בשמי נישה'] : ['Women looking for a luxury fragrance', 'Niche fragrance collectors'],
      niche: he ? 'בשמים יוקרתיים אונליין' : 'Luxury fragrance e-commerce',
      platform: 'WordPress',
    },
    keywords: he ? ['בשמים יוקרתיים לנשים', 'בשמי נישה לרכישה', 'בשמי גברים ממותגים'] : ['luxury perfume for women', 'buy niche perfume', 'branded mens fragrance'],
    articles: he ? ['איך בוחרים בושם במתנה'] : ['How to choose perfume as a gift'],
    competitors: ['amazing-troy.com', 'famashop.de'], lockedCompetitors: 0,
    findings: [{ id: 'no_faq', severity: 'warning', title: he ? 'אין מקטע שאלות ותשובות' : 'No questions and answers section', detail: he ? 'מנועי AI מצטטים עמודים שעונים על שאלות.' : 'AI engines cite pages that answer questions.' }],
    lockedFindings: 0,
    geo: { passed: 1, total: 2, signals: [
      { id: 'schema', ok: true, title: he ? 'הנתונים המובנים מזהים את העסק' : 'Structured data identifies the business', detail: 'schema' },
      { id: 'faq', ok: false, title: he ? 'אין מקטע שאלות ותשובות' : 'No questions and answers section', detail: 'faq' },
    ] },
    counters: { keywords: 3, fixes: 1, geoPassed: 1, geoTotal: 2, articles: 1 },
    aiUsed: true, cached: false,
  }
}

const stub = (path) => fetch(`${STUB}${path}`).then((r) => r.json()).catch(() => null)
const rows = async (table) => ((await stub('/__stub/db')) || {})[table] || []

async function freshAccount({ confirm, locale }) {
  await stub('/__stub/reset')
  await stub(`/__stub/fixture?account=new&confirm=${confirm ? 'on' : 'off'}`)
  const res = await fetch(`${STUB}/rest/v1/free_site_checks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer stub-service-key', prefer: 'return=representation' },
    body: JSON.stringify([{ domain: DOMAIN, locale, url: `https://${DOMAIN}/`, result: seededResult(locale), seed: null,
      ai_used: true, client_hash: 'someone-else', created_at: new Date(Date.now() - 3600_000).toISOString() }]),
  })
  return res.status
}

/**
 * Records, in the tab's sessionStorage, whether the new-project form (its
 * address field) was EVER on screen, across client-side navigations: the
 * journey's claim is "no create-a-project step", not just "ended elsewhere".
 */
function watchForCreateForm() {
  const mark = () => { if (document.querySelector('#seed-site-address, form input[name="target_domain"]')) sessionStorage.setItem('sawCreateForm', '1') }
  new MutationObserver(mark).observe(document, { childList: true, subtree: true })
  document.addEventListener('DOMContentLoaded', mark)
}

async function scanAndOpenSignup(page, locale, run) {
  const prefix = locale === 'en' ? '/en' : ''
  await page.goto(`${BASE}${prefix}/free-check?url=${encodeURIComponent(DOMAIN)}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const shown = await page.waitForFunction((text) => document.body.innerText.includes(text), BUSINESS[locale].slice(0, 30), { timeout: 90000 })
    .then(() => true).catch(() => false)
  check(`${locale}: the anonymous scan shows its report`, shown)
  await page.screenshot({ path: join(SHOTS, `${locale}-${run}1-scan-report.png`), fullPage: true })
  const href = await page.$eval('main a[href*="signup"][href*="claim="]', (a) => a.getAttribute('href')).catch(() => null)
  check(`${locale}: "open the full research" carries a one-time claim`, typeof href === 'string' && /claim=[a-f0-9]{64}/.test(href), String(href))
  check(`${locale}: …to an internal sign-up path only`, typeof href === 'string' && href.startsWith('/') && !href.startsWith('//'), String(href))
  await Promise.all([
    page.waitForURL(/\/signup/, { timeout: 60000 }).catch(() => {}),
    page.click('main a[href*="signup"][href*="claim="]'),
  ])
  // The page hands the token to the server and takes it out of the address.
  await page.waitForFunction(() => !location.search.includes('claim='), { timeout: 30000 }).catch(() => {})
  check(`${locale}: the sign-up page no longer shows the token in the address`, !page.url().includes('claim='), page.url())
  const cookies = await page.context().cookies()
  const kept = cookies.find((c) => c.name === 'gotop-seed-claim')
  check(`${locale}: the claim is kept in an httpOnly, SameSite=Lax cookie`, !!kept && kept.httpOnly && kept.sameSite === 'Lax')
  await page.screenshot({ path: join(SHOTS, `${locale}-${run}2-signup.png`), fullPage: true })
}

async function fillSignup(page) {
  await page.waitForFunction(() => !!window.next, { timeout: 30000 }).catch(() => {})
  // Sign-up (w9): full name, company (optional, left empty here: it is optional), email, phone, the
  // password and its confirmation; the terms are the consent line.
  await page.fill('input[autocomplete="name"]', 'Claim Journey')
  await page.fill('input[autocomplete="email"]', 'claim-journey@example.com')
  await page.fill('input[autocomplete="tel"]', '050-1234567')
  await page.fill('#signup-password', 'Str0ng!Passw0rd#2026')
  await page.fill('#signup-password-confirm', 'Str0ng!Passw0rd#2026')
  await page.click('form button[type=submit]')
}

async function assertLandedOnProject(page, locale, label) {
  await page.waitForURL(SUMMARY_URL, { timeout: 120000 }).catch(() => {})
  const url = page.url()
  const projectId = (SUMMARY_URL.exec(url) || [])[1] || null
  check(`${label}: lands on the new project's summary`, !!projectId, url)
  const sawForm = await page.evaluate(() => sessionStorage.getItem('sawCreateForm')).catch(() => null)
  check(`${label}: the "create a project" form was never shown`, sawForm !== '1')

  const projects = await rows('projects')
  const mine = projects.filter((p) => p.user_id === USER_ID)
  check(`${label}: exactly one project was created, for the scanned site`, mine.length === 1 && mine[0].target_domain === DOMAIN && mine[0].id === projectId,
    JSON.stringify(mine.map((p) => [p.id, p.target_domain])))
  const runs = (await rows('project_seed_runs')).filter((r) => r.project_id === projectId)
  check(`${label}: its research was seeded from the claim, not a new scan`, runs.length === 1 && runs[0].trigger === 'claim', JSON.stringify(runs.map((r) => r.trigger)))
  const claims = await rows('free_site_check_claims')
  check(`${label}: the claim was spent exactly once`, claims.length === 1 && !!claims[0].consumed_at)
  const cookies = await page.context().cookies()
  check(`${label}: the claim cookie is gone`, !cookies.some((c) => c.name === 'gotop-seed-claim'))

  // The scan's own data is on the project's screen.
  const hasData = await page.waitForFunction(({ domain, text }) => document.body.innerText.includes(domain) && document.body.innerText.includes(text),
    { domain: DOMAIN, text: BUSINESS[locale].slice(0, 30) }, { timeout: 90000 }).then(() => true).catch(() => false)
  check(`${label}: the summary shows the site and what the scan learned about the business`, hasData)
  // The screen's own content: the sidebar's language switch names both languages.
  const body = await page.innerText('main').catch(() => '')
  check(`${label}: the screen is in the visitor's language`, body.length > 0 && (locale === 'he' ? /[\u0590-\u05FF]/.test(body) : !/[\u0590-\u05FF]/.test(body)))
  return projectId
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

;(async () => {
  let server = null
  if (!process.env.JOURNEY_BASE) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: APP_DIR, detached: true, stdio: 'ignore',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', ENABLE_SEED_SCAN: 'true' },
    })
  }
  const kill = () => { if (server) try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 120000))) { console.log('server did not start'); kill(); console.log('\n0 passed, 1 failed'); process.exitCode = 1; return }

  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    // ── A. confirmation off: sign-up has a session, the browser goes straight on ──
    for (const [label, locale] of [['A', 'he'], ['A-en', 'en']]) {
      console.log(`\n${label}) scan → sign-up (no email confirmation) → the project [${locale}]`)
      check(`${label}: the scan is on record`, (await freshAccount({ confirm: false, locale })) === 201)
      const a = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: locale === 'he' ? 'he-IL' : 'en-US' })
      await a.addInitScript(watchForCreateForm)
      const pageA = await a.newPage()
      await scanAndOpenSignup(pageA, locale, 'a')
      await fillSignup(pageA)
      // The in-between screen, if it is up long enough to be seen.
      await pageA.waitForSelector('[data-claim-start]', { timeout: 20000 }).then(() => pageA.screenshot({ path: join(SHOTS, `${locale}-a3-setting-up.png`) })).catch(() => {})
      await assertLandedOnProject(pageA, locale, label)
      await pageA.screenshot({ path: join(SHOTS, `${locale}-a4-project-summary.png`), fullPage: true })
      await a.close()
    }

    // ── B. confirmation on, the link opened in another tab ──
    console.log('\nB) scan → sign-up → email confirmation opened in another tab → the project')
    check('B: the scan is on record', (await freshAccount({ confirm: true, locale: 'he' })) === 201)
    const b = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' })
    await b.addInitScript(watchForCreateForm)
    const pageB = await b.newPage()
    await scanAndOpenSignup(pageB, 'he', 'b')
    await fillSignup(pageB)
    const told = await pageB.waitForSelector('[role=status]', { timeout: 30000 }).then((h) => h.innerText()).catch(() => '')
    check('B: sign-up asks the visitor to confirm their email', told.includes('בדקו את תיבת האימייל'), told)
    await pageB.screenshot({ path: join(SHOTS, 'he-b3-check-email.png'), fullPage: true })
    // The confirmation email's link, after Supabase verifies it, lands on the
    // app's callback with the redirect the sign-up form asked for.
    const tab = await b.newPage()
    await tab.goto(`${BASE}/api/auth/callback?code=stub-code&next=${encodeURIComponent('/dashboard')}&lang=he`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await tab.waitForSelector('[data-claim-start]', { timeout: 20000 }).then(() => tab.screenshot({ path: join(SHOTS, 'he-b4-setting-up.png') })).catch(() => {})
    await assertLandedOnProject(tab, 'he', 'B')
    await tab.screenshot({ path: join(SHOTS, 'he-b5-project-summary.png'), fullPage: true })

    // ── C. the same callback with no claim, and with an outside `next` ──
    console.log('\nC) the callback without a claim is unchanged, and never leaves the site')
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const pageC = await c.newPage()
    await pageC.goto(`${BASE}/signup?lang=he`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await pageC.evaluate(() => document.cookie = 'sb-127-auth-token-code-verifier=stub; path=/')
    const plain = await pageC.request.get(`${BASE}/api/auth/callback?code=stub-code&next=${encodeURIComponent('/dashboard')}&lang=he`, { maxRedirects: 0 })
    const plainTo = plain.headers()['location'] || ''
    check('C: no claim → the dashboard, as before', /^http:\/\/[^/]+\/dashboard\?lang=he$/.test(plainTo) || /\/login\?error=oauth/.test(plainTo), plainTo)
    await c.addCookies([{ name: 'gotop-seed-claim', value: 'a'.repeat(64), url: BASE }])
    for (const evil of ['//evil.example/x', 'https://evil.example/', '/\\evil.example']) {
      const res = await pageC.request.get(`${BASE}/api/auth/callback?code=stub-code&next=${encodeURIComponent(evil)}&lang=he`, { maxRedirects: 0 })
      const to = new URL(res.headers()['location'] || 'http://x/', BASE)
      check(`C: an outside next (${evil}) stays on this site`, to.origin === new URL(BASE).origin, to.href)
    }
    await c.close()
    await b.close()

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
