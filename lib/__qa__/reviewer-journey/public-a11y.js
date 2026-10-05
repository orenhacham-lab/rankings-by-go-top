/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * ACCESSIBILITY OVER THE PUBLIC SITE — the pages a visitor can reach without
 * signing in, in Hebrew (RTL) and English, over a real production build in real
 * Chromium.
 *
 * WHY THIS EXISTS SEPARATELY FROM axe-a11y.js. That suite audits the signed-in
 * screens, and only inside <main>, because the sidebar and top bar had their own
 * owners during the UX review. The public site is the part a regulator, a
 * customer or a court actually looks at, and there the chrome IS the page: the
 * cookie banner, the header, the language switcher and the footer are where the
 * legal obligations live. So here the audit runs over the WHOLE document, the
 * banner included.
 *
 * WHAT IT CHECKS, beyond axe's WCAG 2.1 A and AA rules:
 *   - one <h1> per page, because a document outline with none or several is the
 *     thing a screen-reader user navigates by;
 *   - lang and dir on <html>, per language, since a Hebrew page announced as
 *     English is read aloud as gibberish (WCAG 3.1.1);
 *   - no positive tabindex anywhere, which is the usual way a tab order stops
 *     matching the visual order (2.4.3);
 *   - the cookie banner is operable from the keyboard alone and does not trap
 *     focus, and its Reject is reachable without a pointer. A consent notice
 *     that only a mouse can refuse is not a free choice;
 *   - a visible focus indicator on the first interactive element (2.4.7);
 *   - every <img> has an alt attribute (axe covers this, but it is checked
 *     separately so the count appears even when axe is clean).
 *
 * WHAT IT DOES NOT CHECK, stated so the accessibility statement does not
 * overclaim: an automated pass finds roughly a third of real barriers. It
 * cannot judge whether alt text is MEANINGFUL, whether an error message is
 * understandable, or how a screen reader actually announces a widget. Those
 * need a person with assistive technology. The statement says "partially
 * conformant" for exactly that reason, and this suite is what lets it say
 * everything automatable is clean.
 *
 * Spanish and Brazilian Portuguese are rendered by the same components as
 * English through TranslatedLegalPage, so a violation there would show up here;
 * when their build flags are on, set PUBLIC_A11Y_LOCALES to include them.
 *
 * Standalone, against a server that is already running:
 *   PUBLIC_A11Y_BASE_URL=http://127.0.0.1:3814 node lib/__qa__/reviewer-journey/public-a11y.js
 * Under scripts/qa/journeys.sh it starts its own `next start` on :3992.
 */
const { spawn } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync } = require('fs')

const ROOT = resolve(__dirname, '../../..')
const OWN_SERVER = !process.env.PUBLIC_A11Y_BASE_URL
const PORT = 3992
const BASE = process.env.PUBLIC_A11Y_BASE_URL || `http://127.0.0.1:${PORT}`
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/public-a11y'
const AXE = require.resolve('axe-core/axe.min.js', { paths: [ROOT] })
mkdirSync(SHOTS, { recursive: true })

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }

/**
 * The public pages, per language prefix. Hebrew is the bare prefix. Each entry
 * is the path and what must be on screen before the audit runs, so a page is
 * never audited half-rendered.
 */
const PAGES = [
  { path: '', dir: 'rtl', lang: 'he' },
  { path: '/pricing', dir: 'rtl', lang: 'he' },
  { path: '/about', dir: 'rtl', lang: 'he' },
  { path: '/free-check', dir: 'rtl', lang: 'he' },
  { path: '/privacy', dir: 'rtl', lang: 'he' },
  { path: '/terms', dir: 'rtl', lang: 'he' },
  { path: '/refund-policy', dir: 'rtl', lang: 'he' },
  { path: '/accessibility', dir: 'rtl', lang: 'he' },
  { path: '/affiliate-terms', dir: 'rtl', lang: 'he' },
  { path: '/sitemap', dir: 'rtl', lang: 'he' },
  { path: '/en', dir: 'ltr', lang: 'en' },
  { path: '/en/pricing', dir: 'ltr', lang: 'en' },
  { path: '/en/about', dir: 'ltr', lang: 'en' },
  { path: '/en/free-check', dir: 'ltr', lang: 'en' },
  { path: '/en/privacy', dir: 'ltr', lang: 'en' },
  { path: '/en/terms', dir: 'ltr', lang: 'en' },
  { path: '/en/refund-policy', dir: 'ltr', lang: 'en' },
  { path: '/en/accessibility', dir: 'ltr', lang: 'en' },
  { path: '/en/affiliate-terms', dir: 'ltr', lang: 'en' },
  { path: '/en/sitemap', dir: 'ltr', lang: 'en' },
]

/** Extra language trees, audited only when their build flag put them in. */
const EXTRA = (process.env.PUBLIC_A11Y_LOCALES || '').split(',').map((s) => s.trim()).filter(Boolean)
for (const locale of EXTRA) {
  for (const page of ['', '/pricing', '/privacy', '/terms', '/refund-policy', '/accessibility', '/affiliate-terms']) {
    PAGES.push({ path: `/${locale}${page}`, dir: locale === 'he' ? 'rtl' : 'ltr', lang: locale })
  }
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
  if (OWN_SERVER) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:5555',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key',
      },
    })
  }
  const kill = () => { if (server) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); console.log(`${pass} passed, ${fail + 1} failed`); return }

  const { chromium } = require(require.resolve('playwright-core', { paths: [ROOT] }))
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    for (const entry of PAGES) {
      // A fresh context per page, so every page is audited as a first-time
      // visitor sees it, with the cookie banner up and nothing remembered.
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: entry.lang === 'he' ? 'he-IL' : 'en-US' })
      const page = await ctx.newPage()
      // Nothing leaves the machine: a third-party script would make the audit
      // depend on someone else's uptime, and consent gating means none should
      // load before a choice anyway.
      await page.route('**/*', (route) => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()))
      const label = entry.path || '/'
      const res = await page.goto(`${BASE}${entry.path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
      if (!res || res.status() >= 400) {
        check(`${label}: the page is served`, false, res ? `HTTP ${res.status()}` : 'no response')
        await ctx.close()
        continue
      }
      await page.waitForTimeout(800)

      // ── the document outline and the language it declares ──
      const facts = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        h1: document.querySelectorAll('h1').length,
        positiveTabindex: [...document.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0).length,
        imgsWithoutAlt: [...document.querySelectorAll('img')].filter((el) => !el.hasAttribute('alt')).length,
        main: document.querySelectorAll('main').length,
      }))
      check(`${label}: declares lang="${entry.lang}" and dir="${entry.dir}"`,
        facts.lang === entry.lang && facts.dir === entry.dir, `lang=${facts.lang} dir=${facts.dir}`)
      check(`${label}: exactly one h1`, facts.h1 === 1, `h1=${facts.h1}`)
      check(`${label}: one main landmark`, facts.main === 1, `main=${facts.main}`)
      check(`${label}: no positive tabindex`, facts.positiveTabindex === 0, `${facts.positiveTabindex} element(s)`)
      check(`${label}: every image has an alt attribute`, facts.imgsWithoutAlt === 0, `${facts.imgsWithoutAlt} without alt`)

      // ── axe, over the whole document, banner and chrome included ──
      await page.addScriptTag({ path: AXE })
      const out = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          resultTypes: ['violations'],
        })
        return r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          n: v.nodes.length,
          where: v.nodes.slice(0, 3).map((x) => x.target.join(' ')),
          why: ((v.nodes[0] && v.nodes[0].failureSummary) || '').split('\n')[1] || '',
        }))
      })
      const total = out.reduce((a, v) => a + v.n, 0)
      check(`${label}: no WCAG 2.1 A/AA violation (axe, whole document)`, total === 0,
        out.map((v) => `${v.id}(${v.impact})×${v.n} [${v.where.join(' | ')}] ${v.why}`).join('; '))

      await ctx.close()
    }

    // ── the cookie notice, from the keyboard alone ──
    // A consent notice that only a pointer can refuse is not a free choice
    // (GDPR Art. 7(1) and the ePrivacy consent): Reject has to be reachable by
    // tabbing, and the notice must not trap focus on the page behind it.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL' })
      const page = await ctx.newPage()
      await page.route('**/*', (route) => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()))
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
      await page.waitForTimeout(1200)

      const banner = page.locator('[data-cookie-consent], [role="dialog"], [aria-label*="עוגיות"], [aria-label*="cookie" i]').first()
      const hasBanner = (await banner.count()) > 0
      check('the cookie notice is on a first visit', hasBanner)

      if (hasBanner) {
        // Tab through the first 80 stops and see what the keyboard can reach.
        // 80, not 25, because the measurement that started this: the notice
        // used to render AFTER the page, so its first stop was number 47 — past
        // the header, the hero, the whole marketing page and the footer. A
        // limit of 25 reported "unreachable", which was wrong and hid the real
        // defect: 47 keystrokes to refuse against one click to accept is the
        // asymmetry GDPR Art. 7(3) and the EDPB's dark-pattern guidelines are
        // about. Hence NOTICE_WITHIN below: being reachable is not enough, it
        // has to be reachable first.
        const reached = []
        for (let i = 0; i < 80; i++) {
          await page.keyboard.press('Tab')
          const info = await page.evaluate(() => {
            const el = document.activeElement
            if (!el || el === document.body) return null
            const style = getComputedStyle(el)
            return {
              text: (el.textContent || '').trim().slice(0, 40),
              tag: el.tagName,
              inBanner: !!el.closest('[data-cookie-consent], [role="dialog"]'),
              outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
              ring: style.boxShadow !== 'none',
            }
          })
          if (info) reached.push(info)
        }
        const inBanner = reached.filter((r) => r.inBanner)
        check('the keyboard reaches the notice', inBanner.length > 0, `${reached.length} stops, none inside the notice`)
        // The notice is rendered above `children` in app/layout.tsx precisely so
        // this holds. If someone moves it back down, this is the check that says so.
        const NOTICE_WITHIN = 10
        const firstStop = reached.findIndex((r) => r.inBanner) + 1
        check(
          `the notice is among the first ${NOTICE_WITHIN} tab stops`,
          firstStop > 0 && firstStop <= NOTICE_WITHIN,
          firstStop > 0 ? `first reached at stop ${firstStop}` : 'never reached',
        )
        // "דחיית הכל" in Hebrew, so the stem is דחי, not דחה.
        const refuses = inBanner.some((r) => /סרב|דחי|דחה|reject|recha|recus/i.test(r.text))
        check('a refusal is reachable from the keyboard', refuses, inBanner.map((r) => r.text).join(' | '))
        const focusVisible = reached.some((r) => r.outline || r.ring)
        check('the focused element is visibly focused', focusVisible)
      }
      await page.screenshot({ path: join(SHOTS, 'cookie-notice.png') }).catch(() => {})
      await ctx.close()
    }
  } catch (e) {
    check('the audit ran to its end', false, e.message)
  } finally {
    await browser.close()
    kill()
    console.log(`\n${pass} passed, ${fail} failed`)
  }
})()
