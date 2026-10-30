/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS script, run with `node`, never bundled. */
/*
 * NOTHING IN THE HEADER, OR IN THE LANGUAGE SWITCH, IS CUT OFF — IN ANY LANGUAGE.
 *
 * Two faults the owner found on 23 October 2026, hours after Italian went live,
 * and neither of them was visible to any suite we had, because both live in the
 * rendered WIDTH of a word rather than in a function:
 *
 *   1. "באתר עצמו בשפה הצרפתית והספרדית הכפתור של הניסיון חינם בהדר נחתך בצד
 *      ימין" — the public header's row is three groups (the lockup, eight nav
 *      links, the language control and two buttons) inside the hero's own
 *      max-w-7xl frame, which is 1216px of content at every viewport width
 *      above 1280. Measured before the fix, at 1440×900: the row's intrinsic
 *      width was 1389px in French, 1359 in Spanish, 1314 in Portuguese and
 *      1274 in Italian, against English's 1216 — so in four languages the
 *      right-hand button hung past the frame and was clipped. Raising the
 *      breakpoint could not have helped: the frame is capped, so the overflow
 *      was the same at 1920 as at 1280.
 *   2. "הכפתור בתוך הדאשבורד של מעבר שפה גורם לזה שהמילה עברית בכפתור של השפה
 *      העברית חתוך, בגלל שיש שם כבר הרבה אופציות" — the dashboard's switcher
 *      was a grid of EQUAL columns, so with six languages each chip got 34.5px
 *      of a 223px rail while "עברית" needs 39px, and the product's own language
 *      was the one cut.
 *
 * So this measures both, in every language the build serves, at five widths.
 * The invariants are the ones a reader would state:
 *
 *   A. the header's row never needs more width than its frame gives it;
 *   B. the right-hand button ends inside the frame, not past it;
 *   C. no element of the header is clipped (scrollWidth > clientWidth);
 *   D. in the dashboard, no language chip is clipped, and every chip is visible.
 *
 * A LANGUAGE IS MEASURED ONLY WHERE THE BUILD SERVES IT. Each locale's home
 * page is probed first and a 404 is skipped, exactly as
 * language-switch-direction.js does it, so this runs inside the shared
 * journeys.sh build (Hebrew and English there) and over all six languages when
 * the build has their flags:
 *
 *   NEXT_PUBLIC_SPANISH_SITE_ENABLED=true NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED=true \
 *   NEXT_PUBLIC_FRENCH_SITE_ENABLED=true NEXT_PUBLIC_ITALIAN_SITE_ENABLED=true \
 *   bash scripts/qa/journeys.sh header-fits
 *
 * MUTATION CONTROLS, because a fits-check that measures nothing fits forever.
 * Three, one per instrument: the signup button's label is replaced in the page
 * with a word long enough to overflow and A, B and C must all go red; a chip in
 * the dashboard switcher is squeezed to 12px and D must go red. The skipped
 * languages are printed, so a run that silently measured one language cannot
 * read as a clean sweep.
 *
 * Standalone, against a server and stub already running:
 *   HF_BASE_URL=http://127.0.0.1:3993 HF_STUB_URL=http://127.0.0.1:5555 \
 *   node lib/__qa__/reviewer-journey/header-fits.js
 */
const { spawn } = require('child_process')
const { join, resolve } = require('path')
const { mkdirSync, copyFileSync } = require('fs')

const ROOT = resolve(__dirname, '../../..')
const OWN_SERVER = !process.env.HF_BASE_URL
const PORT = 3994
const BASE = process.env.HF_BASE_URL || `http://127.0.0.1:${PORT}`
const STUB = process.env.HF_STUB_URL || 'http://127.0.0.1:5555'
const SHOTS = process.env.QA_SCREENSHOT_DIR || '/tmp/header-fits'
const MIRROR = '/mnt/project-files/ux-build/header-fits'
const PID = 'a1111111-2222-3333-4444-555555555555'

/** The public tree of each language, in the order a reader meets them. */
const LOCALE_PATH = { he: '/', en: '/en', es: '/es', 'pt-BR': '/pt-BR', fr: '/fr', it: '/it' }
/** 1280 is where the eight nav links appear; above it the frame stops growing. */
const WIDTHS = [1280, 1366, 1440, 1600, 1920]

mkdirSync(SHOTS, { recursive: true })
let mirror = null
try { mkdirSync(MIRROR, { recursive: true }); mirror = MIRROR } catch { /* not this container */ }

let pass = 0, fail = 0
const check = (n, c, d) => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`) } }
const done = () => console.log(`\n${pass} passed, ${fail} failed`)

async function waitFor(proc, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (proc && proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/**
 * THE MEASUREMENT, in the page: the header's row, the frame that caps it, and
 * the last button in the row.
 *
 * `scrollWidth > clientWidth` is the whole test for "cut off": a flex row whose
 * children need more than it has does not grow the document (the frame is
 * `mx-auto max-w-7xl`), it overflows, and the overflow is what the reader sees
 * clipped at the right edge. The right-hand button is measured against the
 * FRAME's content edge rather than the viewport's, because that is the line the
 * design draws — a button past it is misaligned with the hero below even on a
 * screen wide enough to show it.
 */
const measureHeader = (page) => page.evaluate(() => {
  const row = document.querySelector('header div.flex.items-center.justify-between')
  if (!row) return { row: null }
  const frame = row.parentElement
  const cs = getComputedStyle(frame)
  const fb = frame.getBoundingClientRect()
  const inner = { left: fb.left + parseFloat(cs.paddingLeft || '0'), right: fb.right - parseFloat(cs.paddingRight || '0') }
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0
  const groups = [...row.children].filter((k) => k.getBoundingClientRect().width > 0)
  const need = Math.round(groups.reduce((a, k) => a + k.getBoundingClientRect().width, 0) + gap * Math.max(0, groups.length - 1))
  // LEAF CONTROLS ONLY, and only the ones a reader can see. A container is the
  // wrong thing to measure here: each dropdown's trigger sits in a `relative`
  // wrapper that also holds the 54rem panel, absolutely positioned and
  // `invisible` until hover, and an absolutely positioned child counts towards
  // its positioned ancestor's scrollWidth. Measuring the wrappers (or the <nav>
  // around them) reported every language as clipped by ~800px, which is the
  // closed menu's width and not a defect — the first draft of this journey did
  // exactly that and called a header that fits "cut off" in all six languages.
  // So: links and buttons, skipping anything inside a hidden subtree.
  const onScreen = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity || '1') === 0) return false
    }
    return true
  }
  const clipped = [...row.querySelectorAll('a, button')]
    .filter((el) => el.getBoundingClientRect().width > 0 && onScreen(el) && el.scrollWidth - el.clientWidth > 1)
    .slice(0, 6)
    .map((el) => `${el.tagName.toLowerCase()}"${(el.textContent || '').trim().slice(0, 28)}" ${el.scrollWidth}>${el.clientWidth}`)
  // The row's own buttons, left to right; the last one is the right-hand CTA
  // whichever it is (sign-up for a visitor, "to the dashboard" for a reader who
  // is signed in).
  const ctas = [...row.querySelectorAll('a[href]')]
    .filter((a) => a.getBoundingClientRect().width > 0 && /\/(signup|login|dashboard)/.test(a.getAttribute('href') || ''))
  const last = ctas[ctas.length - 1]
  const lb = last ? last.getBoundingClientRect() : null
  return {
    row: { sw: row.scrollWidth, cw: row.clientWidth, need },
    frameInner: { left: Math.round(inner.left), right: Math.round(inner.right), width: Math.round(inner.right - inner.left) },
    cta: lb ? { text: (last.textContent || '').trim(), left: Math.round(lb.left), right: Math.round(lb.right) } : null,
    clipped,
    rtl: getComputedStyle(document.documentElement).direction === 'rtl',
  }
})

const verdict = (m) => {
  if (!m.row) return { ok: false, why: 'no header row found' }
  const overflow = m.row.sw - m.row.cw
  const past = m.cta ? (m.rtl ? Math.round(m.frameInner.left - m.cta.left) : Math.round(m.cta.right - m.frameInner.right)) : 0
  return {
    ok: overflow <= 1 && past <= 1 && m.clipped.length === 0,
    overflow,
    past,
    slack: m.frameInner.width - m.row.need,
    why: `overflow=${overflow} pastFrame=${past} clipped=[${m.clipped.join(' | ')}]`,
  }
}

;(async () => {
  let server = null
  if (OWN_SERVER) {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: STUB, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'stub-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key', SERPER_API_KEY: 'unreachable-by-design',
      ENABLE_CONTENT: 'true', NEXT_PUBLIC_ENABLE_CONTENT: 'true' }
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: ROOT, detached: true, stdio: 'ignore', env })
  }
  const kill = () => { if (server) { try { process.kill(-server.pid, 'SIGKILL') } catch { /* already gone */ } } }
  if (!(await waitFor(server, 90000))) { console.log('server did not start'); kill(); console.log(`${pass} passed, ${fail + 1} failed`); process.exitCode = 1; return }

  const { chromium } = require(require.resolve('playwright-core', { paths: [ROOT] }))
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
  try {
    // Which languages this build serves. A flag that is off answers 404 and the
    // language is skipped rather than failed — that is Production's own state
    // for a language that has not launched.
    const served = []
    const skipped = []
    for (const [loc, path] of Object.entries(LOCALE_PATH)) {
      const r = await fetch(`${BASE}${path}`, { redirect: 'manual' }).catch(() => null)
      if (r && r.status === 200) served.push([loc, path])
      else skipped.push(`${loc} (${r ? r.status : 'unreachable'})`)
    }
    check('at least Hebrew and English are served', served.length >= 2, `served ${served.map((s) => s[0]).join(',')}`)
    console.log(`    · languages measured: ${served.map((s) => s[0]).join(', ')}${skipped.length ? `; skipped: ${skipped.join(', ')}` : ''}`)

    const shoot = async (page, name) => {
      const file = join(SHOTS, `${name}.png`)
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: page.viewportSize().width, height: 120 } }).catch(() => {})
      if (mirror) { try { copyFileSync(file, join(mirror, `${name}.png`)) } catch { /* mirror is best effort */ } }
    }

    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await ctx.newPage()
      // Nothing leaves 127.0.0.1, as every other journey has it: a web font
      // fetched from outside would both hang and change the measurement.
      await page.route('**/*', (route) => (new URL(route.request().url()).hostname !== '127.0.0.1' ? route.abort() : route.continue()))
      for (const [loc, path] of served) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
        await page.waitForTimeout(700)
        const m = await measureHeader(page)
        const v = verdict(m)
        check(`${loc} @ ${width}: the header fits its frame`, v.ok, v.why)
        console.log(`    · ${loc} @ ${width}: needs ${m.row ? m.row.need : '?'} of ${m.frameInner ? m.frameInner.width : '?'} → slack ${v.slack}px; cta="${m.cta ? m.cta.text : '-'}"`)
        if (width === 1440) await shoot(page, `header-${loc}`)
      }
      await ctx.close()
    }

    // ── MUTATION CONTROL for A, B and C ───────────────────────────────────
    // The same measurement, on the same page, with the right-hand button's
    // label replaced by a word that cannot fit. All three invariants must go
    // red; if they do not, every tick above measured nothing.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      await page.route('**/*', (route) => (new URL(route.request().url()).hostname !== '127.0.0.1' ? route.abort() : route.continue()))
      await page.goto(`${BASE}${served[served.length - 1][1]}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(700)
      await page.evaluate(() => {
        const row = document.querySelector('header div.flex.items-center.justify-between')
        const ctas = [...row.querySelectorAll('a[href]')].filter((a) => /\/(signup|login|dashboard)/.test(a.getAttribute('href') || ''))
        const last = ctas[ctas.length - 1]
        if (last) last.textContent = 'Commencer gratuitement votre essai de sept jours sans carte bancaire'
      })
      await page.waitForTimeout(300)
      const v = verdict(await measureHeader(page))
      check('MUT A/B/C (control): an over-long button label is caught', !v.ok, `the detector called it fine: ${v.why}`)
      await shoot(page, 'mutation-overlong-cta')
      await ctx.close()
    }

    // ── D: the dashboard's language switch ────────────────────────────────
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await ctx.newPage()
      await page.route('**/*', (route) => (new URL(route.request().url()).hostname !== '127.0.0.1' ? route.abort() : route.continue()))
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.fill('input[type="email"]', 'reviewer@example.com')
      await page.fill('input[type="password"]', 'whatever')
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {}), page.click('button[type="submit"]')])
      await page.goto(`${BASE}/dashboard?projectId=${PID}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(2000)
      await page.keyboard.press('Escape').catch(() => {})

      // Both directions are read. The chip has a fixed height (h-7) and a label
      // that may wrap, so a word that does not fit can be cut off below as
      // easily as beside: width alone would call that chip fine.
      const chips = () => page.evaluate(() => {
        const btns = [...document.querySelectorAll('button[lang]')].filter((b) => b.getBoundingClientRect().width > 0)
        return btns.map((b) => ({
          text: (b.textContent || '').trim(), lang: b.getAttribute('lang'),
          w: Math.round(b.getBoundingClientRect().width), sw: b.scrollWidth, cw: b.clientWidth,
          sh: b.scrollHeight, ch: b.clientHeight,
          clipped: b.scrollWidth - b.clientWidth > 1 || b.scrollHeight - b.clientHeight > 1,
        }))
      })
      const c = await chips()
      check('D: the switcher offers a chip per served language', c.length === served.length, `${c.length} chips for ${served.length} languages: ${c.map((x) => x.text).join(',')}`)
      const cut = c.filter((x) => x.clipped)
      check('D: no language chip is cut off', cut.length === 0,
        cut.map((x) => `${x.lang}="${x.text}" ${x.sw}>${x.cw} wide, ${x.sh}>${x.ch} tall`).join(' | '))
      console.log('    · chips: ' + c.map((x) => `${x.text}=${x.w}px`).join(', '))
      await page.screenshot({ path: join(SHOTS, 'switcher.png'), fullPage: false }).catch(() => {})

      // MUTATION CONTROL for D: squeeze one chip and the same check must fail.
      await page.evaluate(() => {
        const b = document.querySelector('button[lang="he"]') || document.querySelector('button[lang]')
        // `flex: 1 1 0%` on the chip makes `width` a suggestion the flex line
        // ignores, so the old squeeze left the chip at its 50px and the control
        // could never fail. The flex shorthand is what actually narrows it.
        if (b) { b.style.flex = '0 0 12px'; b.style.minWidth = '0'; b.style.width = '12px'; b.style.maxWidth = '12px'; b.style.overflow = 'hidden' }
      })
      await page.waitForTimeout(200)
      const squeezedAll = await chips()
      const squeezed = squeezedAll.filter((x) => x.clipped)
      check('MUT D (control): a squeezed chip is caught', squeezed.length > 0,
        `the detector saw nothing wrong with a 12px chip: ${squeezedAll.map((x) => `${x.lang} ${x.w}px ${x.sw}/${x.cw} wide ${x.sh}/${x.ch} tall`).join(' | ')}`)
      await ctx.close()
    }

    console.log(`\nscreenshots: ${SHOTS}${mirror ? ` and ${mirror}` : ''}`)
  } catch (e) {
    check('the journey ran to its end', false, e.message)
  } finally {
    await browser.close()
    kill()
    done()
    process.exitCode = fail === 0 ? 0 : 1
  }
})()
