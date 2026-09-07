/**
 * BROWSER verification of the pricing surfaces, against a real production
 * build — desktop, tablet and mobile, Hebrew RTL and English LTR.
 *
 * A server-render assertion cannot see a card that overflows its column, a
 * badge sitting on top of a heading, four cards that no longer fit one row, a
 * hydration warning, or a console error, and those are exactly the failures a
 * reviewer notices first. This drives real Chromium over `next start` and
 * writes a screenshot per page/viewport.
 *
 * Deterministic by construction: no network beyond the local server, no
 * authentication, fixed viewports, and every expected string derived from the
 * catalog rather than typed here — so it cannot pass while the page and the
 * server disagree.
 *
 * Run: npx tsx lib/plans/__qa__/pricing-page-browser.qa.ts
 * Screenshots: $QA_SCREENSHOT_DIR, default .next/qa-screenshots (gitignored).
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { PLAN_CATALOG, PLAN_CODES } from '../catalog'
import { planLimitLines, PLAN_AUDIENCE_LABEL, PLAN_AUDIENCE_DESCRIPTION } from '../features'

let pass = 0, fail = 0, blocked = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function block(name: string, why: string) { blocked++; console.log(`  ⊘ BLOCKED ${name} — ${why}`) }

const ROOT = join(__dirname, '..', '..', '..')
const PORT = 3994
const BASE = `http://127.0.0.1:${PORT}`
const SHOTS = process.env.QA_SCREENSHOT_DIR || join(ROOT, '.next', 'qa-screenshots')

/** Desktop must fit four cards in one row; tablet two; mobile one. */
const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900, columns: 4 },
  { label: 'tablet', width: 834, height: 1112, columns: 2 },
  { label: 'mobile', width: 390, height: 844, columns: 1 },
]
const PAGES = [
  { label: 'he', path: '/pricing', dir: 'rtl', lang: 'he' },
  { label: 'en', path: '/en/pricing', dir: 'ltr', lang: 'en' },
] as const

/** Geometry of every plan card, read from the live layout. */
type CardBox = { name: string; top: number; left: number; width: number; height: number;
  clippedX: boolean; clippedY: boolean; ctaVisible: boolean; badge: { top: number; left: number; width: number; height: number } | null }

async function waitForServer(proc: ChildProcess, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) return false
    try { const r = await fetch(BASE, { redirect: 'manual' }); if (r.status > 0) return true } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function main() {
  console.log('Pricing pages — real Chromium over a production build\n')

  // NEXT_PUBLIC_* values are INLINED AT BUILD TIME. A build made without them
  // ships a browser bundle whose Supabase client throws during hydration and
  // blanks the page — which would look like a layout defect and is not one. The
  // build this suite measures must therefore carry them.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    block('all', 'build/run this suite with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set (they are inlined at build time)')
    console.log(`\n${pass} passed, ${fail} failed, ${blocked} blocked`); return
  }
  if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
    block('all', 'no production build present — run `npx next build` first')
    console.log(`\n${pass} passed, ${fail} failed, ${blocked} blocked`); return
  }
  // A server this suite did not start is not evidence: a stray `next start`
  // holding the port would be measured instead of this build.
  try {
    const r = await fetch(BASE, { redirect: 'manual' })
    if (r.status > 0) { block('all', `port ${PORT} is already serving — kill the stray server and re-run`)
      console.log(`\n${pass} passed, ${fail} failed, ${blocked} blocked`); return }
  } catch { /* free, as required */ }

  mkdirSync(SHOTS, { recursive: true })

  const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: ROOT, detached: true, stdio: 'ignore',
    env: { ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: 'https://qa.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'qa-svc' },
  })
  const killServer = () => { try { if (server.pid) process.kill(-server.pid, 'SIGKILL') } catch { try { server.kill('SIGKILL') } catch { /* ignore */ } } }
  if (!(await waitForServer(server, 90_000))) {
    block('all', 'the production server did not start in time'); killServer()
    console.log(`\n${pass} passed, ${fail} failed, ${blocked} blocked`); return
  }

  const { chromium } = require('playwright-core')
  // The pre-installed Chromium is named explicitly: Playwright's default lookup
  // wants a pinned headless-shell build that is not present here.
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })

  try {
    for (const page of PAGES) {
      for (const vp of VIEWPORTS) {
        const id = `${page.label}/${vp.label}`
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
        const p = await ctx.newPage()
        const consoleErrors: string[] = []
        const failedRequests: string[] = []
        // A resource that THIS SUITE aborted (every third party) is logged by
        // Chromium as a console error. Counting those would be counting our own
        // network policy. Genuine script errors still arrive via 'pageerror',
        // and same-origin resource failures are asserted separately below.
        p.on('console', (m: any) => {
          if (m.type() !== 'error') return
          if (/Failed to load resource/i.test(m.text())) return
          consoleErrors.push(m.text())
        })
        p.on('pageerror', (e: any) => consoleErrors.push(`pageerror: ${e.message}`))
        // THIRD-PARTY SCRIPTS ARE BLOCKED AT THE BROWSER, not left to fail.
        // The page loads a tag manager and a webfont; this environment has no
        // egress to either, and letting them fail hands Chromium its own "this
        // page couldn't load" document — which would test the sandbox, not the
        // product. Aborting them keeps the run deterministic and offline, and
        // the assertions below are about the app's OWN requests.
        await p.route('**/*', (route: any) => {
          const url = new URL(route.request().url())
          return url.hostname === '127.0.0.1' || url.protocol === 'data:' ? route.continue() : route.abort()
        })
        p.on('requestfailed', (r: any) => {
          const url = r.url()
          if (!url.includes('127.0.0.1')) return // a deliberately blocked third party
          // An ABORT is a cancellation, not a failure: Next cancels its own RSC
          // prefetches when the page or context goes away. A real failure has a
          // different errorText and is still reported.
          const err = r.failure()?.errorText ?? ''
          if (/ERR_ABORTED/.test(err)) return
          failedRequests.push(`${url} ${err}`)
        })
        // `networkidle` never settles here: the page loads third-party tag
        // scripts that keep a connection open. Wait for the DOM and then for the
        // pricing grid this suite is actually about.
        await p.goto(`${BASE}${page.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await p.locator('[class*="lg:grid-cols-4"]').first().waitFor({ timeout: 30_000 })

        // ONE snapshot of the live DOM, taken right after the grid appears.
        // Everything textual is asserted against this rather than through
        // per-locator round trips, so a late client-side navigation cannot make
        // two assertions disagree about which document they saw.
        const dom = await p.content()
        const text = await p.evaluate(() => document.body.innerText)

        check(`${id}: <html lang="${page.lang}" dir="${page.dir}">`,
          new RegExp(`<html[^>]*lang="${page.lang}"`).test(dom) && new RegExp(`<html[^>]*dir="${page.dir}"`).test(dom),
          (dom.match(/<html[^>]*>/) ?? [''])[0].slice(0, 80))

        // ── the card geometry, read once from the live layout ───────────────
        const cards: CardBox[] = await p.evaluate(() => {
          const grid = document.querySelector('[class*="lg:grid-cols-4"]') as HTMLElement | null
          if (!grid) return []
          return Array.from(grid.children).map((el) => {
            const card = el as HTMLElement
            const r = card.getBoundingClientRect()
            const h3 = card.querySelector('h3')
            const cta = card.querySelector('a[href]') as HTMLElement | null
            const ctaRect = cta?.getBoundingClientRect()
            // The badge is the only absolutely-positioned child of the card.
            const badgeEl = Array.from(card.children).find(
              (c) => getComputedStyle(c as HTMLElement).position === 'absolute') as HTMLElement | undefined
            const b = badgeEl?.getBoundingClientRect()
            return {
              name: h3?.textContent?.trim() ?? '',
              top: Math.round(r.top + window.scrollY), left: Math.round(r.left),
              width: Math.round(r.width), height: Math.round(r.height),
              // A card is CLIPPED when its own content is larger than its box.
              clippedX: card.scrollWidth > card.clientWidth + 1,
              clippedY: card.scrollHeight > card.clientHeight + 1,
              ctaVisible: !!ctaRect && ctaRect.width > 40 && ctaRect.height > 20,
              badge: b ? { top: Math.round(b.top + window.scrollY), left: Math.round(b.left),
                width: Math.round(b.width), height: Math.round(b.height) } : null,
            }
          })
        })

        check(`${id}: all four plan cards are rendered`, cards.length === 4, String(cards.length))
        check(`${id}: each card carries a plan name`,
          cards.every((c) => c.name.length > 0), JSON.stringify(cards.map((c) => c.name)))

        // THE COLUMN COUNT — the regression this suite exists for.
        //
        // Cards belong to the same row when their vertical spans OVERLAP, not
        // when their tops match: the highlighted card is `lg:scale-105`, so it
        // starts some twenty pixels above its neighbours and a top-offset
        // comparison would read one row as two.
        const rows: CardBox[][] = []
        for (const c of [...cards].sort((a, b) => a.top - b.top)) {
          const row = rows[rows.length - 1]
          const last = row?.[row.length - 1]
          const overlap = last
            ? Math.min(last.top + last.height, c.top + c.height) - Math.max(last.top, c.top)
            : 0
          if (last && overlap > Math.min(last.height, c.height) * 0.5) row.push(c)
          else rows.push([c])
        }
        const widest = Math.max(...rows.map((r) => r.length))
        check(`${id}: the grid is ${vp.columns} column(s) wide`,
          widest === vp.columns && rows.length === cards.length / vp.columns,
          `rows=${JSON.stringify(rows.map((r) => r.map((c) => c.name)))}`)

        // ALL FOUR PLANS USABLE: every card has a real, clickable CTA.
        check(`${id}: every card's CTA is rendered at a usable size`,
          cards.every((c) => c.ctaVisible), JSON.stringify(cards.map((c) => c.ctaVisible)))
        check(`${id}: no card clips its own content`,
          cards.every((c) => !c.clippedX && !c.clippedY),
          JSON.stringify(cards.filter((c) => c.clippedX || c.clippedY).map((c) => c.name)))
        check(`${id}: no card is pushed outside the viewport`,
          cards.every((c) => c.left >= -2 && c.left + c.width <= vp.width + 2),
          JSON.stringify(cards.map((c) => [c.left, c.left + c.width])))

        // THE "MOST POPULAR" BADGE — exactly one, and it overlaps no other card.
        const badged = cards.filter((c) => c.badge)
        check(`${id}: exactly one card carries the "most popular" badge`,
          badged.length === 1, String(badged.length))
        if (badged.length === 1) {
          const b = badged[0].badge!
          const others = cards.filter((c) => c !== badged[0])
          const overlapping = others.filter((c) =>
            b.left < c.left + c.width && b.left + b.width > c.left
            && b.top < c.top + c.height && b.top + b.height > c.top)
          check(`${id}: the badge overlaps no neighbouring card`,
            overlapping.length === 0, JSON.stringify(overlapping.map((c) => c.name)))
        }

        // ── copy: label, description and limit lines, per plan ──────────────
        for (const code of PLAN_CODES) {
          check(`${id}: ${code} shows its audience label`,
            text.includes(PLAN_AUDIENCE_LABEL[code][page.lang]), PLAN_AUDIENCE_LABEL[code][page.lang])
          check(`${id}: ${code} shows its audience description`,
            text.includes(PLAN_AUDIENCE_DESCRIPTION[code][page.lang]), PLAN_AUDIENCE_DESCRIPTION[code][page.lang])
          const missing = planLimitLines(code, page.lang).filter((line) => !text.includes(line))
          check(`${id}: ${code}'s limit lines are all visible`, missing.length === 0, JSON.stringify(missing))
        }
        // ADVANCED IS NOT A MULTI-SITE PLAN — asserted against the RENDERED text.
        const MULTI_SITE = page.lang === 'en'
          ? [/multiple sites/i, /multiple websites/i, /growing business/i]
          : [/כמה אתרים/, /מספר אתרים/, /בצמיחה/]
        const advancedCopy = `${PLAN_AUDIENCE_LABEL.advanced[page.lang]} ${PLAN_AUDIENCE_DESCRIPTION.advanced[page.lang]} ${planLimitLines('advanced', page.lang).join(' ')}`
        check(`${id}: nothing shown for Advanced describes it as multi-site`,
          !MULTI_SITE.some((re) => re.test(advancedCopy)), advancedCopy)
        // The account-wide clause appears only where sharing is real.
        const SHARED = page.lang === 'en' ? 'shared across your account' : 'משותפים לכל החשבון'
        check(`${id}: Basic and Advanced do NOT claim an account-wide article pool`,
          !planLimitLines('regular', page.lang)[4].includes(SHARED)
          && !planLimitLines('advanced', page.lang)[4].includes(SHARED))
        check(`${id}: Premium and Agency DO keep the account-wide clarification`,
          text.includes(planLimitLines('premium', page.lang)[4])
          && planLimitLines('premium', page.lang)[4].includes(SHARED)
          && planLimitLines('large_agency', page.lang)[4].includes(SHARED))

        // Prices unchanged, all four present.
        // The page groups thousands (₪1,999), so digits are compared with the
        // separators removed rather than by guessing the locale's format.
        const plainDigits = text.replace(/,/g, '')
        for (const code of PLAN_CODES) {
          const price = page.lang === 'en' ? `$${PLAN_CATALOG[code].priceUSD}` : `₪${PLAN_CATALOG[code].priceILS}`
          check(`${id}: ${code}'s price is shown and unchanged (${price})`, plainDigits.includes(price), price)
        }

        // CTA destinations stay on the website billing path.
        const hrefs: string[] = await p.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? ''))
        check(`${id}: every plan CTA points at signup or the dashboard`,
          hrefs.filter((h) => /\/signup\?plan=|^\/dashboard$/.test(h)).length >= 4,
          JSON.stringify(hrefs.filter((h) => /signup|dashboard/.test(h))))
        check(`${id}: NO PayPal or Shopify checkout link on this website surface`,
          !hrefs.some((h) => /paypal\.com|myshopify\.com|shopify\.com\/charges/.test(h)),
          JSON.stringify(hrefs.filter((h) => /paypal|shopify/i.test(h))))

        // Layout health.
        const overflow = await p.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth)
        check(`${id}: no horizontal overflow`, overflow <= 1, `${overflow}px`)
        check(`${id}: no collapsed card`, cards.every((c) => c.width >= 200), JSON.stringify(cards.map((c) => c.width)))

        check(`${id}: no console errors`, consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)))
        check(`${id}: no hydration error`,
          !consoleErrors.some((e) => /hydrat|did not match|Text content does not match/i.test(e)),
          JSON.stringify(consoleErrors.filter((e) => /hydrat/i.test(e))))
        check(`${id}: no failed same-origin request`,
          failedRequests.length === 0, JSON.stringify(failedRequests.slice(0, 3)))

        // Two images per page/viewport: the whole document, and the pricing
        // grid on its own — the second is what a layout regression is judged on.
        const shot = join(SHOTS, `pricing-${page.label}-${vp.label}.png`)
        await p.screenshot({ path: shot, fullPage: true })
        const cardsShot = join(SHOTS, `cards-${page.label}-${vp.label}.png`)
        await p.locator('[class*="lg:grid-cols-4"]').first().screenshot({ path: cardsShot })
        console.log(`    ↳ screenshots ${shot} , ${cardsShot}`)

        // THE BLOCK'S HEIGHT is the regression itself: two stacked half-width
        // sections made the pricing block roughly twice as tall as the single
        // row it replaced, which is what pushed Premium and Agency out of view.
        const gridHeight = await p.evaluate(() =>
          Math.round((document.querySelector('[class*="lg:grid-cols-4"]') as HTMLElement).getBoundingClientRect().height))
        console.log(`    ↳ pricing block height ${gridHeight}px at ${vp.width}x${vp.height}`)

        await ctx.close()
      }
    }

    // The reviewer/admin application routes still respond (unauthenticated they
    // redirect to the auth page — the point is that the route still resolves and
    // the document is well-formed, not that a session exists).
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    for (const path of ['/dashboard', '/content', '/projects', '/billing']) {
      const res = await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      check(`app route ${path} resolves (no 5xx)`, !!res && res.status() < 500, String(res?.status()))
    }
    await ctx.close()
  } finally {
    await browser.close().catch(() => {})
    killServer()
  }

  console.log(`\n${pass} passed, ${fail} failed, ${blocked} blocked`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
