/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * The free site check, in real Chromium over a real production build: the hero
 * field on the landing page, the loading screen, the results screen with its
 * locked block, both error paths, the rate limit, and the English route.
 *
 * WHAT THIS JOURNEY CANNOT DO, and why that is the design working. The check
 * only ever fetches PUBLIC websites: lib/free-check/url-guard.ts refuses IP
 * literals and refuses any hostname that resolves to a private or link-local
 * address, so a fixture site on 127.0.0.1 is unreachable ON PURPOSE, and this
 * container's egress proxy answers 403 for arbitrary public hosts. So the live
 * crawl is proved where it can be proved honestly — against injected
 * fetch/insight functions in lib/free-check/__qa__/*.qa.ts — and what runs here
 * is everything a visitor touches: the whole UI, both error codes as the real
 * route returns them, the rate limit, and the results screen fed through the
 * real cache path (a seeded ledger row, read back by the real gate).
 */
const { spawn } = require('child_process')
const { createHash } = require('crypto')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = 3987, BASE = `http://127.0.0.1:${PORT}`
const STUB = 'http://127.0.0.1:5555'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/free-site-check'
mkdirSync(SHOTS, { recursive: true })
let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

/**
 * Mirrors lib/free-check/store.ts hashClient. Which address the route sees for a
 * loopback request depends on whether `next start` set x-forwarded-for, so the
 * journey seeds a bucket for each possibility rather than guessing one.
 */
const clientHash = (ip) => createHash('sha256').update(`${process.env.FREE_CHECK_IP_SALT ?? ''}|${ip}`).digest('hex')
const LOOPBACK_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'unknown']

const DOMAIN = 'perfumeclub.co.il'
function seededResult(locale) {
  const he = locale === 'he'
  return {
    url: `https://${DOMAIN}/`,
    domain: DOMAIN,
    scannedAt: new Date().toISOString(),
    locale,
    business: {
      summary: he
        ? 'חנות בשמים אונליין שמוכרת בשמי יוקרה מקוריים לנשים ולגברים, כולל בשמי נישה ובוטיק, עם משלוח לכל הארץ.'
        : 'An online perfume store selling original luxury fragrances for women and men, including niche and boutique scents, shipping nationwide.',
      audiences: he
        ? ['נשים שמחפשות בושם יוקרתי ליום יום', 'גברים שמחפשים מותג מוביל במחיר משתלם', 'אספני בשמי נישה']
        : ['Women looking for a luxury everyday fragrance', 'Men after a leading brand at a fair price', 'Niche fragrance collectors'],
      niche: he ? 'בשמים יוקרתיים אונליין' : 'Luxury fragrance e-commerce',
      platform: 'WordPress',
    },
    keywords: he
      ? ['בשמים יוקרתיים לנשים', 'בשמי גברים ממותגים', 'בשמי נישה לרכישה', 'טום פורד בושם', 'בשמי בוטיק במחיר משתלם']
      : ['luxury perfume for women', 'branded mens fragrance', 'buy niche perfume', 'tom ford cologne', 'boutique perfume deals'],
    articles: he
      ? ['בשמי גברים הכי מבוקשים ב-2026', 'בשמי נישה לעומת בשמי מותג', 'איך בוחרים בושם במתנה']
      : ['The most wanted mens fragrances of 2026', 'Niche versus designer perfume', 'How to choose perfume as a gift'],
    competitors: ['amazing-troy.com', 'famashop.de'],
    lockedCompetitors: 4,
    findings: [
      { id: 'no_faq', severity: 'warning', title: he ? 'אין מקטע שאלות ותשובות' : 'No questions and answers section', detail: he ? 'מנועי AI עונים לשאלות, ולכן מצטטים עמודים שעונים על שאלות.' : 'AI engines answer questions, so they cite pages that answer questions.' },
      { id: 'images_alt', severity: 'warning', title: he ? 'לתמונות חסר טקסט חלופי (ALT)' : 'Images are missing alt text', detail: he ? 'גוגל לא רואה תמונות, הוא קורא ALT.' : 'Google does not see images, it reads alt text.', evidence: he ? '12 מתוך 48 תמונות' : '12 of 48 images' },
    ],
    lockedFindings: 3,
    geo: {
      passed: 3,
      total: 4,
      signals: [
        { id: 'schema', ok: true, title: he ? 'הנתונים המובנים מזהים את העסק' : 'Structured data identifies the business', detail: he ? 'מנועי AI יודעים מי אתם.' : 'AI engines know who you are.' },
        { id: 'faq', ok: false, title: he ? 'אין מקטע שאלות ותשובות' : 'No questions and answers section', detail: he ? 'עמוד בלי שאלות כמעט לא מצוטט.' : 'A page without questions is rarely cited.' },
        { id: 'robots', ok: true, title: he ? 'מנועי AI יכולים לקרוא את האתר' : 'AI engines can read the site', detail: 'robots.txt' },
        { id: 'llms', ok: true, title: he ? 'קובץ llms.txt קיים' : 'An llms.txt file exists', detail: 'llms.txt' },
      ],
    },
    counters: { keywords: 5, fixes: 5, geoPassed: 3, geoTotal: 4, articles: 3 },
    aiUsed: true,
    cached: false,
  }
}

async function seedLedger(rows) {
  const res = await fetch(`${STUB}/rest/v1/free_site_checks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer stub-service-key', prefer: 'return=representation' },
    body: JSON.stringify(rows),
  })
  return res.status
}

/**
 * Fill the check form and submit it, then wait for the merchant-facing error.
 *
 * The retry is not papering over a product bug: Playwright can click before
 * React has hydrated the page, and a pre-hydration click on a form whose
 * onSubmit is not attached yet simply does nothing. Waiting for the network to
 * settle first, and clicking once more if no alert appeared, removes that race
 * from the test without weakening what it asserts.
 */
/**
 * Fill the check form and read the message the visitor gets back.
 *
 * The retry loop is not politeness: until React hydrates, the submit button is
 * inert and a click on it does nothing, and a `next start` build hydrates when
 * it hydrates. Waiting for `window.next` is the closest observable signal, and
 * a full re-navigation per attempt is what makes the read deterministic — a
 * bare second click on a page that has meanwhile navigated reads an empty
 * alert, which every assertion on the message then passes vacuously.
 */
async function submitAndReadAlert(page, base, value) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`${base}/free-check`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForFunction(() => !!window.next, { timeout: 10000 }).catch(() => {})
    await page.waitForSelector('form:has(#free-check-url) button[type=submit]')
    await page.fill('#free-check-url', value)
    // The request is the signal that the click actually reached React. Waiting
    // for the alert alone cannot tell "never submitted" from "still running",
    // and an unhydrated button swallows the click silently.
    const posted = page
      .waitForResponse((r) => r.url().includes('/api/free-check'), { timeout: 20000 })
      .catch(() => null)
    await page.click('form:has(#free-check-url) button[type=submit]')
    if (!(await posted)) continue
    const alert = await page
      .waitForSelector('[role=alert]', { timeout: 15000 })
      .then((h) => h.innerText())
      .catch(() => '')
    if (alert) return alert
  }
  return ''
}

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
    NEXT_PUBLIC_SUPABASE_URL: STUB,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
  }
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: '/home/user/rankings-by-go-top', detached: true, stdio: 'ignore', env,
  })
  const kill = () => { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 120000))) { console.log('server did not start'); kill(); return }
  await fetch(`${STUB}/__stub/reset`).catch(() => {})

  const { chromium } = require('/home/user/rankings-by-go-top/node_modules/playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    // ── 1. the API's own answers, read without a browser ──────────────────
    console.log('1) the public route admits only public websites')
    const post = async (body) => {
      const res = await fetch(`${BASE}/api/free-check`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      let json = null
      try { json = await res.json() } catch { /* non-JSON */ }
      return { status: res.status, json, cacheControl: res.headers.get('cache-control') }
    }
    const garbage = await post({ url: 'not a url at all', locale: 'he' })
    check('1a: nonsense input → 400 invalid_url', garbage.status === 400 && garbage.json?.code === 'invalid_url', JSON.stringify(garbage.json))
    const metadata = await post({ url: 'http://169.254.169.254/latest/meta-data/', locale: 'he' })
    check('1b: cloud metadata IP → 400 blocked_url', metadata.status === 400 && metadata.json?.code === 'blocked_url', JSON.stringify(metadata.json))
    const loopback = await post({ url: `http://127.0.0.1:${PORT}/`, locale: 'he' })
    check('1c: our own loopback port → blocked, the scanner cannot reach us',
      loopback.status === 400 && loopback.json?.code === 'blocked_url', JSON.stringify(loopback.json))
    const internal = await post({ url: 'http://db.internal/', locale: 'he' })
    check('1d: an internal hostname → blocked', internal.status === 400 && internal.json?.code === 'blocked_url')
    const noBody = await fetch(`${BASE}/api/free-check`, { method: 'POST' })
    check('1e: a bodyless POST is refused, not a 500', noBody.status === 400)
    check('1f: answers are never cached by an intermediary', garbage.cacheControl === 'no-store', String(garbage.cacheControl))

    // ── 2. the cache path: the real gate replays a seeded run ─────────────
    console.log('\n2) a run recorded today is replayed instead of re-scanned')
    await seedLedger([{
      domain: DOMAIN, locale: 'he', url: `https://${DOMAIN}/`, result: seededResult('he'),
      ai_used: true, client_hash: 'someone-else', created_at: new Date(Date.now() - 3600_000).toISOString(),
    }])
    const cached = await post({ url: `https://www.${DOMAIN}/`, locale: 'he' })
    check('2a: the seeded domain returns a result', cached.status === 200 && cached.json?.ok === true)
    check('2b: it is marked as a replay', cached.json?.result?.cached === true)
    check('2c: www and bare domain share one cache key', cached.json?.result?.domain === DOMAIN)
    check('2c1: a replayed scan still carries its own claim token',
      typeof cached.json?.claimToken === 'string' && /^[a-f0-9]{64}$/.test(cached.json.claimToken), String(cached.json?.claimToken))
    const enMiss = await post({ url: `https://${DOMAIN}/`, locale: 'en' })
    check('2d: an English visitor does NOT get the Hebrew copy replayed',
      enMiss.json?.ok !== true || enMiss.json?.result?.cached !== true)

    // ── 3. the hero field hands the address to the check ─────────────────
    console.log('\n3) the landing page hero starts the check')
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const home = await desktop.newPage()
    await home.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    const heroField = await home.$('#hero-free-check-url')
    check('3a: the hero has a URL field', !!heroField)
    await home.screenshot({ path: join(SHOTS, 'landing-hero-1440-he.png') })
    if (heroField) {
      await heroField.fill(DOMAIN)
      await Promise.all([home.waitForURL(/\/free-check\?url=/, { timeout: 15000 }).catch(() => {}), home.click('form:has(#hero-free-check-url) button[type=submit]')])
      check('3b: submitting navigates to the check with the address', /\/free-check\?url=/.test(home.url()), home.url())
    }

    // ── 4. loading → results, with the locked block ──────────────────────
    console.log('\n4) the results screen')
    const page = await desktop.newPage()
    // The API answers a cached domain in milliseconds, which is the right
    // behaviour and a useless screenshot: hold its RESPONSE for two seconds so
    // the progress screen can be seen and captured as a visitor on a slow scan
    // would see it. Only the transport is delayed — the response itself is the
    // real one the route produced.
    await page.route('**/api/free-check', async (route) => {
      await new Promise((r) => setTimeout(r, 2000))
      await route.continue()
    })
    await page.goto(`${BASE}/free-check?url=${encodeURIComponent(DOMAIN)}`, { waitUntil: 'domcontentloaded' })
    const sawProgress = await page.waitForSelector('[aria-busy="true"]', { timeout: 8000 }).then(() => true).catch(() => false)
    check('4a: a progress screen is shown while the check runs', sawProgress)
    if (sawProgress) {
      const progressText = await page.innerText('[aria-busy="true"]').catch(() => '')
      check('4a1: it names the step it is on, from the four it lists',
        progressText.includes('קוראים את האתר') && progressText.includes('מחפשים מי המתחרים שלכם'), progressText.slice(0, 80))
      await page.screenshot({ path: join(SHOTS, 'scanning-1440-he.png') })
    }
    const body = await page.waitForFunction(() => document.body.innerText.includes('תמצית מחקר ראשונה') ? document.body.innerText : null, { timeout: 45000 })
      .then((h) => h.jsonValue()).catch(() => '')
    check('4b: the results screen renders', typeof body === 'string' && body.includes('תמצית מחקר ראשונה'))
    check('4c: the scanned domain is named', body.includes(DOMAIN))
    check('4d: the four counter tiles are there', body.includes('מילות מפתח שנקדם') && body.includes('דברים לתקן באתר')
      && body.includes('מוכנות לתשובות AI') && body.includes('מאמרים מוכנים לכתיבה'))
    check('4e: the business summary is shown', body.includes('מה הבנו על העסק') && body.includes('חנות בשמים אונליין'))
    check('4f: audiences are listed', body.includes('מי הלקוחות שלכם'))
    check('4g: two competitors are shown and the rest are locked',
      body.includes('amazing-troy.com') && body.includes('+4'))
    check('4h: findings are shown with their evidence', body.includes('לתמונות חסר טקסט חלופי') && body.includes('12 מתוך 48'))
    check('4i: further findings are locked and counted', body.includes('+3'))
    check('4j: the AI readiness block scores 3/4', body.includes('כמה מוכנים אתם לתשובות של AI') && body.includes('3/4'))
    check('4k: the article list is shown', body.includes('המאמרים שהיינו כותבים לכם'))
    check('4l: the signup gate closes the page', body.includes('פתחו חשבון חינם'))
    // Scoped to <main>: the public nav has its own /signup button, and it is
    // first in the DOM, so an unscoped selector reads the nav's link and the
    // claim assertion below silently passes on the wrong element.
    const signupHref = await page.$eval('main a[href^="/signup"]', (a) => a.getAttribute('href')).catch(() => null)
    check('4m: the gate leads into the existing signup', typeof signupHref === 'string' && signupHref.startsWith('/signup'), String(signupHref))
    // The claim token is how this exact scan seeds the account that is about to
    // be created, instead of the signup looking a scan up by domain and finding
    // a stranger's. It must be on the link, and it must be a fresh one.
    check('4m1: the signup link carries a one-time claim token',
      typeof signupHref === 'string' && /^\/signup\?lang=he&claim=[a-f0-9]{64}$/.test(signupHref), String(signupHref))
    const claimed = await fetch(`${STUB}/rest/v1/free_site_check_claims?select=token_hash,check_id`, {
      headers: { authorization: 'Bearer stub-service-key' },
    }).then((r) => r.json()).catch(() => [])
    const rawToken = typeof signupHref === 'string' ? (signupHref.split('claim=')[1] || '') : ''
    check('4m2: only its hash is stored, never the token itself',
      Array.isArray(claimed) && claimed.length > 0 && !JSON.stringify(claimed).includes(rawToken))
    await page.screenshot({ path: join(SHOTS, 'results-1440-he.png'), fullPage: true })

    const mobile = await browser.newContext({ viewport: { width: 360, height: 820 } })
    const mPage = await mobile.newPage()
    await mPage.goto(`${BASE}/free-check?url=${encodeURIComponent(DOMAIN)}`, { waitUntil: 'domcontentloaded' })
    await mPage.waitForFunction(() => document.body.innerText.includes('תמצית מחקר ראשונה'), { timeout: 45000 }).catch(() => {})
    const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check('4n: no horizontal overflow at 360px', overflow <= 1, `${overflow}px`)
    await mPage.screenshot({ path: join(SHOTS, 'results-360-he.png'), fullPage: true })
    const mForm = await mobile.newPage()
    await mForm.goto(`${BASE}/free-check`, { waitUntil: 'domcontentloaded' })
    await mForm.screenshot({ path: join(SHOTS, 'form-360-he.png') })

    // ── 5. the error path a visitor actually sees ────────────────────────
    console.log('\n5) an invalid address returns the visitor to the form with safe copy')
    const errPage = await desktop.newPage()
    const alert = await submitAndReadAlert(errPage, BASE, 'http://10.0.0.5/')
    check('5a: the blocked-address message is shown', alert.includes('אתרים ציבוריים'), alert)
    check('5b: no provider or platform detail leaks into it', !/fetch|ENOTFOUND|EAI_AGAIN|169\.254|undici/i.test(alert), alert)
    await errPage.screenshot({ path: join(SHOTS, 'error-1440-he.png') })

    // ── 6. the rate limit, as the route enforces it ─────────────────────
    console.log('\n6) the rate limit refuses a burst from one visitor')
    await seedLedger(LOOPBACK_IPS.flatMap((ip) =>
      Array.from({ length: 5 }, (_, i) => ({
        domain: `burst-${i}.co.il`, locale: 'he', url: `https://burst-${i}.co.il/`, result: { domain: `burst-${i}.co.il` },
        ai_used: false, client_hash: clientHash(ip), created_at: new Date(Date.now() - 30_000).toISOString(),
      }))))
    const limited = await post({ url: 'https://example.co.il/', locale: 'he' })
    check('6a: the sixth check in the window is refused with 429',
      limited.status === 429 && limited.json?.code === 'rate_limited', `${limited.status} ${JSON.stringify(limited.json)}`)
    const limitedPage = await desktop.newPage()
    const limitAlert = await submitAndReadAlert(limitedPage, BASE, 'example.co.il')
    check('6b: the visitor is told to try again shortly', limitAlert.includes('נסו שוב'), limitAlert)

    // ── 7. the English route ────────────────────────────────────────────
    console.log('\n7) the English route is English')
    await fetch(`${STUB}/__stub/reset`).catch(() => {})
    await seedLedger([{
      domain: DOMAIN, locale: 'en', url: `https://${DOMAIN}/`, result: seededResult('en'),
      ai_used: true, client_hash: 'someone-else', created_at: new Date(Date.now() - 3600_000).toISOString(),
    }])
    const enPage = await desktop.newPage()
    await enPage.goto(`${BASE}/en/free-check?url=${encodeURIComponent(DOMAIN)}`, { waitUntil: 'domcontentloaded' })
    const enBody = await enPage.waitForFunction(() => document.body.innerText.includes('Your first research summary') ? document.body.innerText : null, { timeout: 45000 })
      .then((h) => h.jsonValue()).catch(() => '')
    check('7a: the English results screen renders', typeof enBody === 'string' && enBody.includes('Your first research summary'))
    check('7b: its counters and gate are English', typeof enBody === 'string' && enBody.includes('Keywords to target') && enBody.includes('Open a free account'))
    check('7c: no Hebrew leaks into the English screen', typeof enBody === 'string' && !/מילות מפתח|תמצית מחקר/.test(enBody))
    const enDir = await enPage.$eval('main div[dir]', (el) => el.getAttribute('dir')).catch(() => null)
    check('7d: the English screen is LTR', enDir === 'ltr', String(enDir))
    await enPage.screenshot({ path: join(SHOTS, 'results-1440-en.png'), fullPage: true })
    const enMobile = await mobile.newPage()
    await enMobile.goto(`${BASE}/en/free-check?url=${encodeURIComponent(DOMAIN)}`, { waitUntil: 'domcontentloaded' })
    await enMobile.waitForFunction(() => document.body.innerText.includes('Your first research summary'), { timeout: 45000 }).catch(() => {})
    await enMobile.screenshot({ path: join(SHOTS, 'results-360-en.png'), fullPage: true })
    const enHero = await enMobile.goto(`${BASE}/en`, { waitUntil: 'domcontentloaded' }).then(() => enMobile.$('#hero-free-check-url')).catch(() => null)
    check('7e: the English landing hero has the field too', !!enHero)
    await enMobile.screenshot({ path: join(SHOTS, 'landing-hero-360-en.png') })

    console.log(`\nscreenshots: ${SHOTS}`)
    console.log(`\n${pass} passed, ${fail} failed`)
  } catch (err) {
    console.log('journey crashed:', err && err.message)
    fail++
    console.log(`\n${pass} passed, ${fail} failed`)
  } finally {
    await browser.close().catch(() => {})
    kill()
  }
  if (fail > 0) process.exitCode = 1
})()
