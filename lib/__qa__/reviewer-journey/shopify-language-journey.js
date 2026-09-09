/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * The Shopify reviewer's language journey, in real Chromium over a real
 * production build: embedded app -> Open dashboard -> login -> project page.
 *
 * The browser starts with `dashboard-language=he` — the exact production
 * condition, a cookie written durably by the dashboard provider on an earlier
 * visit to an account whose signup language was Hebrew. Without the fix that
 * cookie decides the whole journey; the assertions below are about the RAW
 * server response, read before any effect has run, so nothing here can pass
 * because hydration corrected it afterwards.
 */
const { spawn } = require('child_process')
const { join } = require('path')
const { mkdirSync } = require('fs')
const PORT = 3988, BASE = `http://127.0.0.1:${PORT}`
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/shopify-language'
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

/** The <html> attributes as the SERVER sent them, before any script ran. */
function rawHtmlLocale(html) {
  const tag = (html.match(/<html[^>]*>/) || [''])[0]
  return {
    lang: (tag.match(/lang="([^"]*)"/) || [, ''])[1],
    dir: (tag.match(/dir="([^"]*)"/) || [, ''])[1],
  }
}

;(async () => {
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:5555',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
  }
  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: '/home/user/rankings-by-go-top', detached: true, stdio: 'ignore', env,
  })
  const kill = () => { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); return }

  const { chromium } = require('/home/user/rankings-by-go-top/node_modules/playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    // ── the raw server responses, with the production cookie in place ──────
    // Read with fetch, not a page load, so what is asserted is exactly what
    // the server sent — no hydration, no effects, no client correction.
    const raw = async (path, cookie) => {
      const res = await fetch(`${BASE}${path}`, {
        redirect: 'manual',
        headers: {
          'accept-language': 'en-US,en;q=0.9',
          ...(cookie ? { cookie } : {}),
        },
      })
      const body = res.status < 300 ? await res.text() : ''
      return { status: res.status, location: res.headers.get('location'), setCookie: res.headers.get('set-cookie'), body }
    }
    const HE_COOKIE = 'dashboard-language=he'

    // 1 — the handoff endpoint. Unauthenticated it must hand out no dashboard
    // URL at all; the SHAPE of the URL it builds when authenticated is proved
    // against the real builder in lib/i18n/__qa__/shopify-english-journey.qa.ts
    // (1d-1g), which is where that assertion can be non-vacuous.
    const appHome = await fetch(`${BASE}/api/shopify/app-home`, { headers: { cookie: HE_COOKIE } })
    let handoff
    try { handoff = (await appHome.json()).dashboardUrl } catch { handoff = undefined }
    check('1: unauthenticated, the handoff endpoint discloses no dashboard URL',
      typeof handoff !== 'string', `dashboardUrl=${handoff}`)

    // 2 — logged out, that URL redirects to a login that KEEPS the language.
    const guarded = await raw(`/projects/${PROJECT_ID}?lang=en`, HE_COOKIE)
    check('2a: a logged-out visit redirects to /login with the destination preserved',
      guarded.status >= 300 && guarded.status < 400
      && (guarded.location || '').includes(`next=%2Fprojects%2F${PROJECT_ID}`),
      `${guarded.status} ${guarded.location}`)
    check('2b: and the language travels with the redirect',
      (guarded.location || '').includes('lang=en'), guarded.location)
    check('2c: the redirect also persists it, so it survives the round trip',
      (guarded.setCookie || '').includes('dashboard-language=en'), guarded.setCookie)

    const loginPage = await raw(`/login?next=%2Fprojects%2F${PROJECT_ID}&lang=en`, HE_COOKIE)
    const loginLocale = rawHtmlLocale(loginPage.body)
    check('2d: the login page is English/LTR in the RAW server response',
      loginLocale.lang === 'en' && loginLocale.dir === 'ltr', JSON.stringify(loginLocale))
    check('2e: with English copy — the attributes and the words agree',
      /Sign in|Log in/.test(loginPage.body) && !/כניסה|התחברות/.test(loginPage.body))

    // 4 — a refresh with no ?lang keeps English, because the cookie was rewritten.
    const refreshed = await raw('/login', 'dashboard-language=en')
    const refreshedLocale = rawHtmlLocale(refreshed.body)
    check('4: a refresh with no parameter stays English',
      refreshedLocale.lang === 'en' && refreshedLocale.dir === 'ltr', JSON.stringify(refreshedLocale))

    // 6 — a Hebrew handoff produces a Hebrew journey. Nothing is pinned.
    const heLogin = await raw('/login?lang=he', 'dashboard-language=en')
    const heLocale = rawHtmlLocale(heLogin.body)
    check('6: a Hebrew handoff gives a Hebrew login, raw',
      heLocale.lang === 'he' && heLocale.dir === 'rtl' && /כניסה|התחברות/.test(heLogin.body),
      JSON.stringify(heLocale))

    // 8/9 — routes that own their language are untouched by any of this.
    const privacyHe = rawHtmlLocale((await raw('/privacy?lang=en', 'dashboard-language=en')).body)
    check('8: /privacy stays Hebrew even with an English preference and ?lang=en',
      privacyHe.lang === 'he' && privacyHe.dir === 'rtl', JSON.stringify(privacyHe))
    const privacyEn = rawHtmlLocale((await raw('/en/privacy?lang=he', HE_COOKIE)).body)
    check('9: /en/privacy stays English even with a Hebrew preference and ?lang=he',
      privacyEn.lang === 'en' && privacyEn.dir === 'ltr', JSON.stringify(privacyEn))

    // 10 — a hostile `next` never leaves the origin.
    for (const evil of ['https://evil.com', '//evil.com', '/%5Cevil.com']) {
      const r = await raw(`/login?next=${encodeURIComponent(evil)}&lang=en`, HE_COOKIE)
      check(`10 (${evil}): the login page still renders on this origin`,
        r.status === 200 && rawHtmlLocale(r.body).lang === 'en', `${r.status}`)
    }

    // ── 3 and 12 — the real browser journey, including a real sign-in ──────
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
      extraHTTPHeaders: { 'accept-language': 'en-US,en;q=0.9' },
    })
    // The production condition, set before anything loads.
    await ctx.addCookies([{ name: 'dashboard-language', value: 'he', domain: '127.0.0.1', path: '/' }])
    const page = await ctx.newPage()
    const consoleErrors = []
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) consoleErrors.push(m.text()) })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
    await page.route('**/*', (route) => {
      const h = new URL(route.request().url()).hostname
      return h === '127.0.0.1' ? route.continue() : route.abort()
    })

    // Follow exactly what "Open dashboard" does: a top-level navigation to the
    // handoff URL, which is guarded and bounces through /login.
    const firstResponse = await page.goto(`${BASE}/projects/${PROJECT_ID}?lang=en`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    check('3a: the guarded destination lands on the login page',
      page.url().includes('/login'), page.url())
    const beforeHydration = await page.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
    }))
    check('3b: the login document is English/LTR', beforeHydration.lang === 'en' && beforeHydration.dir === 'ltr',
      JSON.stringify(beforeHydration))
    check('3c: served from this origin', !!firstResponse && new URL(page.url()).hostname === '127.0.0.1')
    await page.screenshot({ path: join(SHOTS, 'lang-1-login.png'), fullPage: true })

    await page.fill('input[type="email"]', 'reviewer@example.com')
    await page.fill('input[type="password"]', 'whatever')
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    check('3d: sign-in lands on the exact internal project destination',
      page.url().includes(`/projects/${PROJECT_ID}`), page.url())
    const afterLogin = await page.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
    }))
    check('3e: and the destination is English/LTR',
      afterLogin.lang === 'en' && afterLogin.dir === 'ltr', JSON.stringify(afterLogin))
    const visible = await page.evaluate(() => document.body.innerText)
    check('3f: with English dashboard copy, not Hebrew',
      /Keywords|Add keyword|Dashboard|Projects/.test(visible) && !/מילות מפתח|לוח בקרה|פרויקטים/.test(visible),
      visible.replace(/\s+/g, ' ').slice(0, 120))
    await page.screenshot({ path: join(SHOTS, 'lang-2-project.png'), fullPage: true })

    // 4 — a real reload, with no ?lang anywhere. The response body is kept so
    // the SERVED document can be compared with the settled one below.
    const reloadResponse = await page.goto(`${BASE}/projects/${PROJECT_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const servedHtml = await reloadResponse.text()
    const reloaded = await page.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
    }))
    check('4b: a plain reload of the destination is still English',
      reloaded.lang === 'en' && reloaded.dir === 'ltr', JSON.stringify(reloaded))

    // 12 — no hydration flip, in either direction.
    check('12a: no console error and no hydration mismatch on the journey',
      consoleErrors.length === 0 && !consoleErrors.some((e) => /hydrat|did not match/i.test(e)),
      JSON.stringify(consoleErrors.slice(0, 2)))
    // The SERVED html and the SETTLED DOM must agree. Comparing the two for the
    // same authenticated navigation is what proves there was no flip: an
    // unauthenticated fetch of a guarded path only yields a redirect, and
    // comparing against that would prove nothing.
    const settled = await page.evaluate(() => document.documentElement.lang)
    const served = rawHtmlLocale(servedHtml)
    check('12b: the served document and the settled document declare the same language',
      served.lang !== '' && served.lang === settled, `served=${served.lang} settled=${settled}`)

    await ctx.close()
  } finally { await browser.close().catch(() => {}); kill() }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
})()
