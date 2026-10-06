/**
 * IMAGES WITHOUT ALT TEXT THAT LIVE IN THE THEME NEVER GET A "FIX IT FOR ME" BUTTON THAT ENDS IN
 * "NOTHING TO CHANGE".
 *
 * The case (a WordPress site with the Go Top plugin, 2026-10-06): 25 pages listed under "images
 * without a description", each with "2 images" and a fix button; every button answered "we checked
 * again and the page is already fine". The two images were the theme's (outside the page's own text),
 * and the check after the scan read only 12 pages, so every page it did not read kept its button,
 * while the pages it did read were folded into the one site-wide line: what was left on the screen was
 * exactly the dead buttons.
 *
 *   A) The scan keeps the address of each image without alt text (a lazy-load placeholder has none).
 *   B) Images the theme repeats (the same address on many pages) are reported once for the site,
 *      not as a problem of each page; an image on two pages of 25 stays the page's own; an image with
 *      no address is never taken for the theme's; a cached report without addresses reads as before.
 *   C) The check after the scan reads EVERY page the scan read (not 12), a few at a time.
 *   D) A preview that finds no image without alt text in the page's own text says the images are the
 *      theme's, never "the page is already fine" (every dashboard language, lib/i18n/locales.ts).
 *
 * Each guard has a MUTATION CONTROL that breaks the code on purpose and shows the guard fails.
 *
 * Run: npx tsx lib/site-health/__qa__/theme-alt-images.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { extractSiteSignals } from '@/lib/free-check/html-signals'
import * as RULES from '@/lib/site-health/rules'
import type { Finding, PageFacts, SiteFacts } from '@/lib/site-health/types'
import * as WP_SCAN from '@/lib/site-fix/wordpress-scan'
import * as READ_POOL from '@/lib/site-fix/read-pool'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { PUBLIC_LOCALES } from '@/lib/i18n/locales'

let passed = 0
let failed = 0
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** The module at `rel` with `from` replaced by `to`, loaded from a temporary copy (never written in the repo). */
function mutant<T>(rel: string, from: string, to: string): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  const dir = mkdtempSync(join(tmpdir(), 'theme-alt-mutant-'))
  try {
    const here = join(ROOT, rel, '..')
    const body = src.split(from).join(to)
      .replace(/from '@\/([^']+)'/g, (_m, p) => `from '${join(ROOT, p)}'`)
      .replace(/from '\.\/([^']+)'/g, (_m, p) => `from '${join(here, p)}'`)
    const file = join(dir, rel.split('/').pop()!)
    writeFileSync(file, body)
    return { mod: require(file) as T, found }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const SITE = 'https://cleaning.example.org'
const LOGO = `${SITE}/wp-content/uploads/logo.png`
const BADGE = `${SITE}/wp-content/uploads/footer-badge.png`
const page = (path: string, over: Partial<PageFacts> = {}): PageFacts => ({
  url: `${SITE}${path}`, kind: path === '/' ? 'home' : 'article', ok: true, status: 200,
  title: `A perfectly reasonable page title for ${path}`, description: `A description of a reasonable length that says what ${path} offers and why a visitor should come in.`,
  h1: ['Heading'], images: { total: 2, missingAlt: 0, missing: [] }, noindex: false, viewport: true, links: [], adminUrl: null, ...over,
})
const site = (): SiteFacts => ({
  siteUrl: `${SITE}/`, homeReachable: true, robots: { blocksAll: false, blocksAi: false, blockedBots: [], readable: true },
  sitemapFound: true, brokenLinks: [], orphanPages: [], llmsFound: true,
})
const WP = { platform: 'wordpress' as const, connections: { wordpress: true, shopify: false, wix: false } }
const altOf = (fs: Finding[]) => fs.find((f) => f.id === 'images_alt')
const rowsOf = (f: Finding | undefined) => (f ? RULES.allRows(f) : [])

/** The reported site: 25 pages, each with the theme's logo and footer badge (no alt) and 2 images of its own with alt. */
const officeSite = (rules: typeof RULES = RULES) => {
  const pages = [page('/'), ...Array.from({ length: 24 }, (_, i) => page(`/p-${i}`))].map((p) => ({
    ...p, images: { total: 4, missingAlt: 2, missing: [LOGO, BADGE] },
  }))
  return { pages, findings: rules.buildFindings(site(), pages, WP) }
}

async function main() {
  console.log('\nA) The scan keeps the address of each image without alt text')
  {
    const s = extractSiteSignals(`<html><body>
      <img src="/logo.png">
      <img src="data:image/gif;base64,R0" data-src="/up/lazy.jpg?v=2#top" alt="">
      <img src="data:image/gif;base64,R0">
      <img src="/up/ok.jpg" alt="An office">
      <noscript><img src="https://px.example/tr"></noscript>
    </body></html>`, `${SITE}/p/`, { robotsTxt: null, llmsTxt: false })
    check('A1: the counts are unchanged (4 images, 3 without alt; a <noscript> pixel is not a page image)', s.images.total === 4 && s.images.missingAlt === 3)
    check('A2: each address, resolved against the page; a lazy image by its data-src; a placeholder with nothing else as \'\'',
      JSON.stringify(s.images.missing) === JSON.stringify([`${SITE}/logo.png`, `${SITE}/up/lazy.jpg?v=2`, '']), JSON.stringify(s.images.missing))
  }

  console.log('\nB) The theme\'s repeated images are reported once for the site, not on every page')
  {
    const { findings } = officeSite()
    const alt = altOf(findings)
    check('B1: the reported site: no page row with a button for the theme\'s logo and badge', rowsOf(alt).length === 0, `${rowsOf(alt).length} rows`)
    check('B2: said once for the site instead: 25 pages, 2 images each', alt?.themeAlt?.pages === 25 && alt?.themeAlt?.images === 2, JSON.stringify(alt?.themeAlt))
    check('B3: the finding stays (the logo still has no alt text) but offers no fix', !!alt && alt.fixable === false)

    const mut = mutant<typeof RULES>('lib/site-health/rules.ts', 'const alt = ownAltImages(p, themeImages)', 'const alt = ownAltImages(p, new Set<string>())')
    const mutRows = mut.mod ? rowsOf(altOf(officeSite(mut.mod).findings)) : []
    check('MUTATION CONTROL: without the theme check every page is a row with a dead button again (B1 catches it)', mut.found && mutRows.length === 25 && mutRows.filter((r) => r.fixable).length === 24, `${mutRows.length} rows`)

    // A page with an image of its own without alt as well: listed, with what is its own and what the theme's.
    const pages = [page('/'), ...Array.from({ length: 9 }, (_, i) => page(`/p-${i}`))].map((p) => ({ ...p, images: { total: 3, missingAlt: 2, missing: [LOGO, BADGE] } }))
    pages[3] = { ...pages[3], images: { total: 4, missingAlt: 3, missing: [LOGO, `${SITE}/up/own.jpg`, BADGE] } }
    const own = rowsOf(altOf(RULES.buildFindings(site(), pages, WP)))
    check('B4: a page\'s own image without alt is still a row (1 of its own, 2 the theme\'s)', own.length === 1 && own[0].measure === 1 && own[0].themeMissing === 2 && own[0].fixable,
      JSON.stringify(own.map((r) => [r.path, r.measure, r.themeMissing])))
    check('B5: and the other 9 pages are the one site-wide line', altOf(RULES.buildFindings(site(), pages, WP))?.themeAlt?.pages === 9)

    // A stock photo in two articles' text out of 25 pages is the articles' own, not the theme's.
    const stock = [page('/'), ...Array.from({ length: 24 }, (_, i) => page(`/p-${i}`))]
    stock[1] = { ...stock[1], images: { total: 2, missingAlt: 1, missing: [`${SITE}/up/stock.jpg`] } }
    stock[2] = { ...stock[2], images: { total: 2, missingAlt: 1, missing: [`${SITE}/up/stock.jpg`] } }
    const stockRows = rowsOf(altOf(RULES.buildFindings(site(), stock, WP)))
    check('B6: an image on 2 of 25 pages stays a problem of each page (with its button)', stockRows.length === 2 && stockRows.every((r) => r.fixable && r.measure === 1))
    const mutT = mutant<typeof RULES>('lib/site-health/rules.ts', 'const need = Math.max(2, Math.min(3, n), Math.ceil(n * 0.25))', 'const need = 2')
    const mutStock = mutT.mod ? rowsOf(altOf(mutT.mod.buildFindings(site(), stock, WP))) : []
    check('MUTATION CONTROL: with any two pages enough, two articles\' photo is taken for the theme (B6 catches it)', mutT.found && mutStock.length === 0)

    // Lazy-load placeholders have no address: never taken for the theme's.
    const lazy = [page('/'), ...Array.from({ length: 24 }, (_, i) => page(`/p-${i}`))].map((p) => ({ ...p, images: { total: 2, missingAlt: 2, missing: ['', ''] } }))
    check('B7: images without an address of their own are never the theme\'s: each page keeps its row', rowsOf(altOf(RULES.buildFindings(site(), lazy, WP))).length === 25)

    // Two pages, the same logo on both: the whole site, so the theme's.
    const small = [page('/'), page('/about')].map((p) => ({ ...p, images: { total: 2, missingAlt: 1, missing: [LOGO] } }))
    const smallAlt = altOf(RULES.buildFindings(site(), small, WP))
    check('B8: a two-page site with the logo on both: one site-wide line, no rows', rowsOf(smallAlt).length === 0 && smallAlt?.themeAlt?.pages === 2)

    // A report cached before addresses were kept: as before.
    const cached = [page('/'), page('/a')].map((p) => ({ ...p, images: { total: 2, missingAlt: 2 } }))
    check('B9: a cached report without addresses reads as it did', rowsOf(altOf(RULES.buildFindings(site(), cached, WP))).length === 2)
  }

  console.log('\nC) The check after the scan reads every page the scan read')
  {
    // 25 pages, each with two images without alt that are NOT the same on every page (a featured image
    // the theme shows above the text, say) and nothing without alt in the page's own text.
    const pages = [page('/'), ...Array.from({ length: 24 }, (_, i) => page(`/p-${i}`))].map((p, i) => ({
      ...p, images: { total: 3, missingAlt: 2, missing: [`${SITE}/up/featured-${i}.jpg`, `${SITE}/up/hero-${i}.jpg`] },
    }))
    const reads: string[] = []
    let inFlight = 0
    let most = 0
    const reader: WP_SCAN.WpReader = async (url) => {
      reads.push(url); inFlight++; most = Math.max(most, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { content: '<p>Our own words <img src="/up/x.jpg" alt="An office"></p>', builder: false }
    }
    const findings = RULES.buildFindings(site(), pages, WP)
    check('C0: before the check, the scan lists all 25 pages (it sees the theme\'s images on the page)', rowsOf(altOf(findings)).length === 25)
    await WP_SCAN.markWordPressOutsideContent(findings, pages, reader, { ...WP, homeHost: 'cleaning.example.org' })
    const alt = altOf(findings)
    const live = rowsOf(alt).filter((r) => r.fixable && !r.outside)
    check('C1: every page was read, so not one row keeps a button that would answer "nothing to change"', live.length === 0, `${live.length} rows with a button, ${new Set(reads).size} pages read`)
    check('C2: all 25 said once for the site', alt?.themeAlt?.pages === 25)
    check('C3: a few at a time (at most READ_CONCURRENCY), never all at once', most > 1 && most <= READ_POOL.READ_CONCURRENCY, `${most} at once`)
    check('C4: MAX_READS covers a whole scan (lib/site-health/scan.ts MAX_PAGES = 25)', READ_POOL.MAX_READS >= 25)

    const mut = mutant<typeof READ_POOL>('lib/site-fix/read-pool.ts', 'const queue = items.slice(0, MAX_READS)', 'const queue = items.slice(0, 12)')
    let mutReads = 0
    if (mut.mod) await mut.mod.readAll(Array.from({ length: 25 }, (_, i) => i), async () => { mutReads++ })
    let realReads = 0
    await READ_POOL.readAll(Array.from({ length: 25 }, (_, i) => i), async () => { realReads++ })
    check('C5: readAll reads all 25', realReads === 25)
    check('MUTATION CONTROL: the old cap of 12 leaves 13 pages unread (C5 catches it)', mut.found && mutReads === 12)

    // A page that does not answer in time stays as the scan found it; the report never waits long.
    const slow = await (async () => {
      const t = Date.now()
      await READ_POOL.readAll([1, 2], async (_n, deadline) => { if (Date.now() <= deadline) await new Promise((r) => setTimeout(r, 10)) })
      return Date.now() - t
    })()
    check('C6: inside the time budget', slow < READ_POOL.TIME_MS)
  }

  console.log('\nD) "Nothing to change" on images says they are the theme\'s, never "the page is fine"')
  {
    const modal = strip(read('components/site-health/ApproveFixModal.tsx'))
    const guard = (src: string) => /phase\.code === 'nothing_to_fix' && type === 'image_alt' \? t\.altNotInContent/.test(src)
    check('D1: the approve window answers an image preview with nothing in the page\'s text with altNotInContent', guard(modal))
    check('D2: and in a warning, not the green "all fine" notice', /tone=\{phase\.code === 'nothing_to_fix' && type !== 'image_alt' \? 'ok' : 'warn'\}/.test(modal))
    check('MUTATION CONTROL: the old line (a.errors only) fails D1', !guard(modal.replace(/t\.altNotInContent/g, 'a.errors[phase.code]')))
    for (const locale of PUBLIC_LOCALES) {
      const d = getDashboardDictionary(locale) as unknown as { siteHealth: { autofix: { approve: { altNotInContent?: string } ; errors: { nothing_to_fix: string } } } }
      const line = d.siteHealth.autofix.approve.altNotInContent ?? ''
      check(`D3 [${locale}]: the line is there, says the theme, and is not the "already fine" line`, line.length > 80 && line !== d.siteHealth.autofix.errors.nothing_to_fix)
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })

export {}
