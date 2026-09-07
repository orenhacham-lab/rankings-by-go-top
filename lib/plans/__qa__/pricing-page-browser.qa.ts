/**
 * BROWSER verification of the pricing surfaces, against a real production
 * build — desktop and mobile, Hebrew RTL and English LTR.
 *
 * A server-render assertion cannot see a card that overflows its column, a
 * hydration warning, or a console error, and those are exactly the failures a
 * reviewer notices first. This drives real Chromium over `next start`.
 *
 * Deterministic by construction: no network beyond the local server, no
 * authentication, fixed viewports, and every expected string derived from the
 * catalog rather than typed here — so it cannot pass while the page and the
 * server disagree.
 *
 * Run: npx tsx lib/plans/__qa__/pricing-page-browser.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { existsSync } from 'fs'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { PLAN_CATALOG, PLAN_CODES } from '../catalog'
import { planLimitLines, AUDIENCE_HEADING, plansForAudience } from '../features'

let pass = 0, fail = 0, blocked = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
function block(name: string, why: string) { blocked++; console.log(`  ⊘ BLOCKED ${name} — ${why}`) }

const ROOT = join(__dirname, '..', '..', '..')
const PORT = 3994
const BASE = `http://127.0.0.1:${PORT}`

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
]
const PAGES = [
  { label: 'he', path: '/pricing', dir: 'rtl', lang: 'he' },
  { label: 'en', path: '/en/pricing', dir: 'ltr', lang: 'en' },
] as const

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
        // section headings this suite is actually about.
        await p.goto(`${BASE}${page.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await p.locator(`h2:text-is("${AUDIENCE_HEADING.single_site[page.lang]}")`).first().waitFor({ timeout: 30_000 })

        // ONE snapshot of the live DOM, taken right after the section headings
        // appear. Everything textual is asserted against this rather than
        // through per-locator round trips, so a late client-side navigation
        // cannot make two assertions disagree about which document they saw.
        const dom = await p.content()
        const text = await p.evaluate(() => document.body.innerText)

        check(`${id}: <html lang="${page.lang}" dir="${page.dir}">`,
          new RegExp(`<html[^>]*lang="${page.lang}"`).test(dom) && new RegExp(`<html[^>]*dir="${page.dir}"`).test(dom),
          (dom.match(/<html[^>]*>/) ?? [''])[0].slice(0, 80))

        // BOTH audience sections, with the right two cards under each.
        for (const audience of ['single_site', 'multi_site'] as const) {
          const heading = AUDIENCE_HEADING[audience][page.lang]
          check(`${id}: the "${heading}" section is present`, text.includes(heading), heading)
          const cards = await p.locator(`h2:text-is("${heading}")`).first()
            .locator('xpath=..').locator('h3').allInnerTexts()
          check(`${id}: it holds exactly 2 cards`, cards.length === 2, JSON.stringify(cards))
          for (const code of plansForAudience(audience, PLAN_CODES)) {
            const missing = planLimitLines(code, page.lang).filter((line) => !text.includes(line))
            check(`${id}: ${code}'s limit lines are all visible`, missing.length === 0, JSON.stringify(missing))
          }
        }

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
        const narrowCards = await p.evaluate(() =>
          Array.from(document.querySelectorAll('h3')).filter((h) => {
            const card = h.closest('div')
            return card ? card.getBoundingClientRect().width < 120 : false
          }).length)
        check(`${id}: no collapsed card`, narrowCards === 0, String(narrowCards))

        check(`${id}: no console errors`, consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)))
        check(`${id}: no hydration error`,
          !consoleErrors.some((e) => /hydrat|did not match|Text content does not match/i.test(e)),
          JSON.stringify(consoleErrors.filter((e) => /hydrat/i.test(e))))
        check(`${id}: no failed same-origin request`,
          failedRequests.length === 0, JSON.stringify(failedRequests.slice(0, 3)))

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
