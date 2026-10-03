/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * THE DOCUMENT'S LANGUAGE AND DIRECTION, AND THE FOOTER'S, ON EVERY PUBLIC PAGE.
 *
 * Two faults the owner found on 3 October 2026, neither of which any green
 * suite saw, because both live in the rendered document rather than in a
 * function:
 *
 *   1. "בגרסה האנגלית בעמוד free site check, הפוטר בעברית" — /en/free-check
 *      rendered <Footer /> with no locale, so it fell to the default, Hebrew.
 *      One missing prop, on a page that has been live for weeks.
 *   2. "שמשנים מאנגלית לעברית... הכפתורים נשארים בצד ימין, רק אחרי רענון זה
 *      מסתדר" — <html lang/dir> is rendered by the ROOT layout, which sits
 *      above every changing segment, so a client-side navigation into another
 *      language changed the words and left the direction. Measured before the
 *      fix: after clicking עברית on /en the sign-in link stayed at x≈1137 on a
 *      1440px viewport; a refresh moved it to x≈217.
 *
 * So this walks every public page in every language and asserts the document
 * says what it is, the footer speaks the page's language, and then switches
 * language IN THE BROWSER, without reloading, and asserts the direction and the
 * header follow immediately.
 *
 * POSITIVE CONTROL, so a detector that measures nothing cannot pass: the same
 * side measurement must put the sign-in link on the LEFT half in Hebrew and the
 * RIGHT half in English on a cold load. If those two disagree, the measurement
 * is meaningless and the switch assertions below prove nothing.
 *
 * MUTATION CONTROL: build with `<Footer />` restored on app/(public)/en/
 * free-check/page.tsx, or with <DocumentLocaleSync /> removed from
 * app/layout.tsx, and this fails on exactly the two reported symptoms.
 *
 *   node lib/__qa__/reviewer-journey/language-switch-direction.js
 *
 * Spanish is included only when the build has it (NEXT_PUBLIC_SPANISH_SITE_
 * ENABLED): with the flag off /es answers 404 and is skipped, which is the
 * state Production is in.
 */
const { spawn } = require('child_process')
const { mkdirSync } = require('fs')
const { join } = require('path')

const PORT = Number(process.env.JOURNEY_PORT || 3994)
const BASE = process.env.JOURNEY_BASE || `http://localhost:${PORT}`
const STUB = process.env.STUB_URL || 'http://127.0.0.1:5555'
const APP_DIR = process.env.JOURNEY_APP_DIR || join(__dirname, '..', '..', '..')
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/language-switch-direction'
mkdirSync(SHOTS, { recursive: true })

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

const HEBREW = /[֐-׿]/
/** One word of the footer per language, from lib/i18n/public/*.ts. */
const FOOTER_WORD = { he: 'עמודים', en: 'Pages', es: 'Páginas' }
const DOC = { he: { lang: 'he', dir: 'rtl' }, en: { lang: 'en', dir: 'ltr' }, es: { lang: 'es', dir: 'ltr' } }
const PREFIX = { he: '', en: '/en', es: '/es' }
/** Every public page that renders the shared nav and footer. */
const PAGES = ['', '/pricing', '/free-check', '/articles', '/about', '/sitemap']

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** What the document and its footer say, and where the sign-in control sits. */
const READ = () => {
  const footer = document.querySelector('footer')
  const signIn = [...document.querySelectorAll('header a')]
    .find((a) => /Sign in|התחברות|Iniciar sesión/.test(a.textContent || ''))
  const box = signIn ? signIn.getBoundingClientRect() : null
  return {
    path: location.pathname,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    footerText: footer ? (footer.innerText || '').slice(0, 1200) : '',
    signInCentre: box ? Math.round(box.left + box.width / 2) : null,
    width: window.innerWidth,
  }
}

async function read(page) { return page.evaluate(READ) }

async function coldLoad(browser, locale, path) {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  const url = `${BASE}${PREFIX[locale]}${path}`
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  const state = await read(page)
  await page.close()
  return { status: res ? res.status() : 0, ...state }
}

/**
 * Pick a language from the header, WITHOUT reloading.
 *
 * Two shapes, and Production is on the first: with only two languages the
 * switcher is a single link straight to the other one, and it grows a menu
 * only once a third language exists. A journey that knows just the menu
 * passes on the preview and tests nothing on the site that is live.
 */
async function switchTo(page, target) {
  const menu = await page.$('header button[aria-haspopup="menu"]')
  if (menu) {
    await menu.click()
    await page.waitForTimeout(300)
  }
  await page.click(`header a[hreflang="${target}"]`)
  await page.waitForFunction(
    (p) => location.pathname === p,
    target === 'he' ? '/' : `/${target}`,
    { timeout: 30000 },
  )
  // The words arrive with the new server components; give the frame one paint.
  await page.waitForTimeout(1200)
  return read(page)
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
  if (!(await waitFor(server, 120000))) {
    console.log('server did not start'); kill(); console.log('\n0 passed, 1 failed'); process.exitCode = 1; return
  }

  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    const spanish = (await fetch(`${BASE}/es`, { redirect: 'manual' }).then((r) => r.status).catch(() => 0)) === 200
    console.log(`\nA) every public page says what it is (Spanish ${spanish ? 'on' : 'off, skipped'})`)
    const locales = spanish ? ['he', 'en', 'es'] : ['he', 'en']
    for (const locale of locales) {
      for (const path of PAGES) {
        const s = await coldLoad(browser, locale, path)
        const where = `${PREFIX[locale]}${path || '/'}`
        if (s.status !== 200) { check(`A: ${where} answers 200`, false, String(s.status)); continue }
        check(`A: ${where} — <html lang=${DOC[locale].lang} dir=${DOC[locale].dir}>`,
          s.lang === DOC[locale].lang && s.dir === DOC[locale].dir, `got ${s.lang}/${s.dir}`)
        // The reported bug: an English page with a Hebrew footer.
        check(`A: ${where} — the footer speaks ${locale}`,
          s.footerText.includes(FOOTER_WORD[locale]) && (HEBREW.test(s.footerText) === (locale === 'he')),
          s.footerText.replace(/\s+/g, ' ').slice(0, 90))
      }
    }

    console.log('\nB) POSITIVE CONTROL — the side measurement discriminates')
    const heHome = await coldLoad(browser, 'he', '')
    const enHome = await coldLoad(browser, 'en', '')
    check('B1: Hebrew puts sign-in on the left half, English on the right half',
      heHome.signInCentre !== null && enHome.signInCentre !== null
      && heHome.signInCentre < heHome.width / 2 && enHome.signInCentre > enHome.width / 2,
      `he=${heHome.signInCentre} en=${enHome.signInCentre} of ${heHome.width}`)

    console.log('\nC) switching language in the browser flips the document at once')
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE}/en`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForLoadState('networkidle').catch(() => {})

    const twoLanguages = (await page.$('header button[aria-haspopup="menu"]')) === null
    check('C0: the switcher is a direct link with two languages and a menu with three',
      twoLanguages !== spanish, `menu=${!twoLanguages} spanish=${spanish}`)

    const toHe = await switchTo(page, 'he')
    await page.screenshot({ path: join(SHOTS, 'after-switch-to-he.png') })
    check('C1: English to Hebrew — the document turns rtl without a refresh',
      toHe.lang === 'he' && toHe.dir === 'rtl', `${toHe.lang}/${toHe.dir}`)
    check('C2: …and the header controls move to the left, as on a cold Hebrew load',
      toHe.signInCentre !== null && toHe.signInCentre < toHe.width / 2, `x=${toHe.signInCentre}`)
    check('C3: …and the footer is Hebrew', HEBREW.test(toHe.footerText) && toHe.footerText.includes(FOOTER_WORD.he))

    const backToEn = await switchTo(page, 'en')
    check('C4: Hebrew back to English — the document turns ltr without a refresh',
      backToEn.lang === 'en' && backToEn.dir === 'ltr', `${backToEn.lang}/${backToEn.dir}`)
    check('C5: …and the header controls move back to the right',
      backToEn.signInCentre !== null && backToEn.signInCentre > backToEn.width / 2, `x=${backToEn.signInCentre}`)

    if (spanish) {
      const toEs = await switchTo(page, 'es')
      check('C6: English to Spanish — the document says Spanish, still ltr',
        toEs.lang === 'es' && toEs.dir === 'ltr', `${toEs.lang}/${toEs.dir}`)
      check('C7: …and the footer is Spanish', toEs.footerText.includes(FOOTER_WORD.es) && !HEBREW.test(toEs.footerText))
      const esToHe = await switchTo(page, 'he')
      check('C8: Spanish to Hebrew — rtl without a refresh',
        esToHe.lang === 'he' && esToHe.dir === 'rtl' && esToHe.signInCentre < esToHe.width / 2,
        `${esToHe.lang}/${esToHe.dir} x=${esToHe.signInCentre}`)
    }

    console.log('\nD) a refresh agrees with what the switch produced')
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    const refreshed = await read(page)
    check('D1: a cold Hebrew load matches the switched state',
      refreshed.dir === 'rtl' && refreshed.lang === 'he'
      && Math.abs((refreshed.signInCentre ?? 0) - (toHe.signInCentre ?? -999)) <= 24,
      `cold=${refreshed.signInCentre} switched=${toHe.signInCentre}`)
    await page.close()
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
