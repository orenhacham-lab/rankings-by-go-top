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
 *   E) THE MEDIA LIBRARY (lib/site-fix/media-alt.ts). With the site's application password, an image
 *      outside the page's text that is a Media Library item without alt text gets it there: found by
 *      its file (any size, a CDN host), offered only while empty (a logo gets the business's name),
 *      written as alt_text only, checked before and read back, undone only while still ours.
 *   G) THE SCREEN. The theme's line shows "fix it for me" when the Media Library holds those images; a
 *      Media Library row asks the preview for the Media Library; the screen offers it only with the
 *      application password and never on a store.
 *   F) THE QUEUE. Approving it goes through the application password even where the plugin writes the
 *      pages (nothing is sent to the plugin), only with via 'media', never in a batch; undo puts the
 *      empty value back. The scan keeps a button on such a row and one on the theme's site-wide line.
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
import * as MEDIA from '@/lib/site-fix/media-alt'
import * as API from '@/lib/site-fix/api'
import { validateFix } from '@/lib/site-fix/whitelist'
import { FIX_TYPES } from '@/lib/site-fix/types'
import type { WpMediaItem } from '@/lib/wordpress/client'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FindingCard from '@/components/site-health/FindingCard'
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

    const mut = mutant<typeof READ_POOL>('lib/site-fix/read-pool.ts', 'const queue = items.slice(0, opts.max ?? MAX_READS)', 'const queue = items.slice(0, 12)')
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

  console.log('\nE) The Media Library: alt text on the image itself')
  const creds = { siteUrl: SITE, username: 'owner', applicationPassword: 'x' }
  const library = (): { items: Map<number, WpMediaItem>; writes: { id: number; alt: string }[]; searches: string[]; deps: MEDIA.MediaDeps } => {
    const items = new Map<number, WpMediaItem>([
      [7, { id: 7, sourceUrl: `${SITE}/wp-content/uploads/2024/05/site-logo.png`, sizeUrls: [`${SITE}/wp-content/uploads/2024/05/site-logo-300x120.png`], alt: '', title: 'site-logo' }],
      [8, { id: 8, sourceUrl: `${SITE}/wp-content/uploads/2024/05/office-team.jpg`, sizeUrls: [`${SITE}/wp-content/uploads/2024/05/office-team-1024x683.jpg`], alt: '', title: 'Our team at work' }],
      [9, { id: 9, sourceUrl: `${SITE}/wp-content/uploads/2024/05/badge.png`, sizeUrls: [], alt: 'Already described', title: 'badge' }],
    ])
    const writes: { id: number; alt: string }[] = []
    const searches: string[] = []
    const deps: MEDIA.MediaDeps = {
      // By title: the titles here were renamed for item 8 (found by slug only, as WordPress keeps it).
      searchMedia: async (_c, term, by = 'title') => {
        searches.push(`${by}:${term}`)
        return [...items.values()].filter((m) => (by === 'slug' ? m.sourceUrl.includes(term) : m.title === term)).map((m) => ({ ...m }))
      },
      getMedia: async (_c, id) => { const m = items.get(id); return m ? { ...m } : null },
      setMediaAlt: async (_c, id, alt) => { writes.push({ id, alt }); const m = items.get(id); if (!m) return null; m.alt = alt; return { ...m } },
    }
    return { items, writes, searches, deps }
  }
  {
    check('E1: the file\'s own name, without the size WordPress added, -scaled or a WebP copy\'s extra extension',
      MEDIA.mediaSearchTerm(`${SITE}/wp-content/uploads/2024/05/site-logo-300x120.png`) === 'site-logo'
      && MEDIA.mediaSearchTerm(`${SITE}/wp-content/uploads/a/office-team-scaled.jpg`) === 'office-team'
      && MEDIA.mediaSearchTerm(`${SITE}/wp-content/uploads/a/office-team.jpg.webp`) === 'office-team')
    check('E2: the same file from a CDN host and with a query is the same file; another folder is not',
      MEDIA.sameFile('https://cdn.example.net/wp-content/uploads/2024/05/x.jpg?ver=2', `${SITE}/wp-content/uploads/2024/05/x.jpg`)
      && !MEDIA.sameFile(`${SITE}/wp-content/themes/t/x.jpg`, `${SITE}/wp-content/uploads/2024/05/x.jpg`))
    const lib = library()
    const offered = await MEDIA.previewMediaAlt(creds, [
      `${SITE}/wp-content/uploads/2024/05/site-logo-300x120.png`,
      `https://cdn.example.net/wp-content/uploads/2024/05/office-team-1024x683.jpg`,
      `${SITE}/wp-content/uploads/2024/05/badge.png`,
      `${SITE}/wp-content/themes/clean/img/arrow.svg`,
    ], { pageTitle: 'ניקיון משרדים ברמת גן', siteName: 'הלהיט בניקיון' }, lib.deps)
    check('E3: offered: the logo (in any size) and the photo (from the CDN); not the one already described, not a theme file',
      JSON.stringify(offered.map((o) => o.media)) === '[7,8]', JSON.stringify(offered))
    check('E4: the logo is offered the business\'s name', offered[0]?.after === 'הלהיט בניקיון', offered[0]?.after)
    check('E5: reading for the preview writes nothing', lib.writes.length === 0)
    check('E5b: an item whose title was renamed is found by its slug', lib.searches.includes('slug:office-team') && offered.some((o) => o.media === 8))
    const mutSlug = mutant<typeof MEDIA>('lib/site-fix/media-alt.ts', " ?? match(await deps.searchMedia(creds, term, 'slug'))", '')
    const mutOffered = mutSlug.mod ? await mutSlug.mod.previewMediaAlt(creds, [`${SITE}/wp-content/uploads/2024/05/office-team-1024x683.jpg`], { pageTitle: 'x', siteName: null }, library().deps) : []
    check('MUTATION CONTROL: by title only, the renamed item is missed (E5b catches it)', mutSlug.found && mutOffered.length === 0)

    const done = await MEDIA.applyMediaAlt(creds, [{ media: 7, alt: 'הלהיט בניקיון' }, { media: 8, alt: 'צוות ניקיון במשרד' }], lib.deps)
    check('E6: written as alt text on each item, then read back', done.ok && done.status === 'applied' && lib.items.get(7)?.alt === 'הלהיט בניקיון' && lib.writes.length === 2)
    const again = await MEDIA.applyMediaAlt(creds, [{ media: 7, alt: 'הלהיט בניקיון' }], lib.deps)
    check('E7: the same words again: nothing written ("already")', again.ok && again.status === 'already' && lib.writes.length === 2)
    lib.items.get(8)!.alt = 'The owner\'s own words'
    const theirs = await MEDIA.applyMediaAlt(creds, [{ media: 8, alt: 'Other words' }], lib.deps)
    check('E8: words someone wrote since the preview stay: refused, nothing written', !theirs.ok && theirs.code === 'changed_since_preview' && lib.writes.length === 2)
    const mutCas = mutant<typeof MEDIA>('lib/site-fix/media-alt.ts', "if (now.some((m, n) => m!.alt.trim() !== '' && m!.alt !== items[n].alt)) return { ok: false, code: 'changed_since_preview' }", '')
    const lib2 = library()
    lib2.items.get(8)!.alt = 'The owner\'s own words'
    const mutTheirs = mutCas.mod ? await mutCas.mod.applyMediaAlt(creds, [{ media: 8, alt: 'Other words' }], lib2.deps) : null
    check('MUTATION CONTROL: without the check the owner\'s words are overwritten (E8 catches it)', mutCas.found && !!mutTheirs?.ok && lib2.items.get(8)?.alt === 'Other words')

    if (done.ok && done.undo) {
      const undone = await MEDIA.revertMediaAlt(creds, done.undo, lib.deps)
      check('E9: undo puts back what was there (empty) only where our words still are; the owner\'s change refuses it',
        !undone.ok && lib.items.get(7)?.alt === 'הלהיט בניקיון')
      lib.items.get(8)!.alt = 'צוות ניקיון במשרד'
      const undone2 = await MEDIA.revertMediaAlt(creds, done.undo, lib.deps)
      check('E10: with our words still there, undo empties both', undone2.ok && lib.items.get(7)?.alt === '' && lib.items.get(8)?.alt === '')
    } else check('E9: applied with an undo', false)

    const v = (images: unknown) => validateFix({ type: 'image_alt', images }, `${SITE}/`, new Set(['cleaning.example.org']))
    check('E11: the whitelist takes a Media Library id on every image', v([{ src: `${SITE}/a.png`, alt: 'A', media: 7 }]).ok)
    check('E12: and refuses it on some images only, a non-whole id, or an unknown key',
      !v([{ src: `${SITE}/a.png`, alt: 'A', media: 7 }, { src: `${SITE}/b.png`, alt: 'B' }]).ok && !v([{ src: `${SITE}/a.png`, alt: 'A', media: 1.5 }]).ok
      && !v([{ src: `${SITE}/a.png`, alt: 'A', file: 'x' }]).ok)
  }

  console.log('\nF) The queue: through the application password, never the plugin, never in a batch')
  {
    const U = '11111111-1111-4111-8111-111111111111'
    const P = 'a1111111-2222-4333-8444-555555555555'
    let n = 0
    const newId = () => `${String(++n).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(n).padStart(12, '0')}`
    const admin = new FakeAdmin({
      projects: [{ id: P, user_id: U, target_domain: 'cleaning.example.org', business_name: 'הלהיט בניקיון', name: 'Cleaning' }],
      project_profiles: [{ project_id: P, user_id: U, detected_platform: 'wordpress' }],
      wordpress_connections: [{ project_id: P, user_id: U, site_url: SITE, wp_username: 'owner', wp_application_password_encrypted: 'enc:app', connection_status: 'connected' }],
      site_fix_plugin_links: [{ project_id: P, user_id: U, site_url: SITE, key_id: 'gtk_0123456789abcdef', secret_encrypted: 'enc:secret', secret_hint: '••••abcd', status: 'connected', plugin_version: '2.1.0', seo_plugin: 'yoast', last_seen_at: null, last_error_code: null }],
      site_fix_jobs: [], site_fix_audit: [],
    })
    const pluginCalls: string[] = []
    const lib = library()
    const deps: API.FixesDeps = {
      userId: U, ip: '203.0.113.9', admin: admin as never,
      decrypt: (s) => (s === 'enc:secret' ? 'A'.repeat(43) : 'app-pass'), encrypt: (s) => `enc:${s.length}`,
      wp: { media: lib.deps } as unknown as API.FixesDeps['wp'],
      readLive: async () => ({ title: 'Home', description: null, h1: 'ניקיון משרדים', canonical: null, schemaTypes: [], html: '', missingAlt: [`${SITE}/wp-content/uploads/2024/05/site-logo-300x120.png`] }),
      pluginPost: (async (_s: string, route: string) => { pluginCalls.push(route); return { status: 200, body: JSON.stringify({ ok: true, version: '2.1.0', seo_plugin: 'yoast', fix_types: [...FIX_TYPES] }) } }) as unknown as API.FixesDeps['pluginPost'],
      newId,
    }
    const pv = await API.handleFixesPost({ projectId: P, action: 'preview', type: 'image_alt', kind: 'images_alt', url: `${SITE}/`, media: true }, deps)
    const body = pv.body as { ok?: boolean; via?: string; channel?: string; images?: { media?: number; after?: string }[] }
    check('F1: the preview offers the logo\'s Media Library item, through the application password', pv.status === 200 && body.via === 'media' && body.channel === 'app_password' && body.images?.[0]?.media === 7,
      JSON.stringify(pv.body))
    const fix = { type: 'image_alt', images: [{ src: `${SITE}/wp-content/uploads/2024/05/site-logo-300x120.png`, alt: 'הלהיט בניקיון', media: 7 }] }
    const base = { projectId: P, action: 'approve', approved: true, kind: 'images_alt', pageUrl: `${SITE}/`, fix, expected: null, before: null }
    const noVia = await API.handleFixesPost({ ...base, via: null }, deps)
    check('F2: a Media Library fix without via "media" is refused', noVia.status !== 200 && (noVia.body as { code?: string }).code === 'value_invalid')
    const bulk = await API.handleFixesPost({ ...base, via: 'media', bulk: { batch: 'b1111111-2222-4333-8444-555555555555' } }, deps)
    check('F3: never in an "apply all" batch', (bulk.body as { code?: string }).code === 'not_bulk_safe')
    const ok = await API.handleFixesPost({ ...base, via: 'media' }, deps)
    const job = (ok.body as { job?: { id: string; status: string; channel: string; canUndo: boolean } }).job
    check('F4: approved and applied through the application password; nothing sent to the plugin', job?.status === 'applied' && job.channel === 'app_password' && !pluginCalls.includes('/fix') && lib.items.get(7)?.alt === 'הלהיט בניקיון',
      JSON.stringify(ok.body))
    const audit = (admin.tables.site_fix_audit ?? []) as { action?: string }[]
    check('F5: on the record: approved, then applied', audit.some((a) => a.action === 'approved') && audit.some((a) => a.action === 'applied'))
    const undo = job ? await API.handleFixesPost({ projectId: P, action: 'undo', jobId: job.id }, deps) : null
    check('F6: undo empties it again', !!job?.canUndo && undo?.status === 200 && lib.items.get(7)?.alt === '', JSON.stringify(undo?.body))
    const mutApi = mutant<typeof API>('lib/site-fix/api.ts', "if (onMedia !== (via === 'media')) return refuse('value_invalid')", '')
    const mutNoVia = mutApi.mod ? await mutApi.mod.handleFixesPost({ ...base, via: null }, { ...deps, newId }) : null
    check('MUTATION CONTROL: without the via check a Media Library fix goes through unmarked (F2 catches it)', mutApi.found && mutNoVia?.status === 200)

    // The scan: a row whose images are Media Library items keeps its button; the theme's line gets one.
    const pages = [page('/'), ...Array.from({ length: 6 }, (_, i) => page(`/p-${i}`))].map((p, i) => ({
      ...p, images: { total: 4, missingAlt: 2, missing: [LOGO, `${SITE}/wp-content/uploads/feat-${i}.jpg`] },
    }))
    pages[3] = { ...pages[3], images: { total: 4, missingAlt: 2, missing: [LOGO, `${SITE}/wp-content/themes/t/deco.svg`] } }
    const run = async (mod: typeof WP_SCAN) => {
      const findings = RULES.buildFindings(site(), pages, WP)
      await mod.markWordPressOutsideContent(findings, pages, async () => ({ content: '<p>Text only</p>', builder: false }), {
        ...WP, homeHost: 'cleaning.example.org',
        findMedia: async (src) => (src === LOGO || src.includes('/uploads/feat-') ? { alt: '' } : null),
      })
      return altOf(findings)
    }
    const alt = await run(WP_SCAN)
    const rows = rowsOf(alt)
    check('F7: rows whose featured image is a Media Library item keep their button (6 of 7; the theme file\'s row does not)',
      rows.filter((r) => r.media && r.fixable && !r.outside).length === 6 && !rows.some((r) => r.path === '/p-2' && !r.outside), JSON.stringify(rows.map((r) => [r.path, r.media, r.outside])))
    check('F8: each counts its own image (1), the logo apart', rows.filter((r) => r.media).every((r) => r.measure === 1 && r.themeMissing === 1))
    check('F9: the logo (on every page) is offered once, on the site-wide line', alt?.themeAlt?.media === true)
    const mutScan = mutant<typeof WP_SCAN>('lib/site-fix/wordpress-scan.ts', 'findMedia ? readAll(', 'false ? readAll(')
    const mutAlt = mutScan.mod ? await run(mutScan.mod) : undefined
    check('MUTATION CONTROL: without the Media Library lookup those rows go back to "theme" with no button (F7 catches it)',
      mutScan.found && rowsOf(mutAlt).filter((r) => r.media).length === 0)
  }

  console.log('\nG) The screen')
  {
    const he = getDashboardDictionary('he').siteHealth
    const finding: Finding = { id: 'images_alt', severity: 'important', pages: [], total: 0, field: 'alt', guide: 'alt', fixable: true, fixType: 'image_alt', themeAlt: { pages: 25, images: 2, media: true } }
    const theme = { url: `${SITE}/`, path: '/', kind: 'home' as const, value: null, measure: 2, fixable: true, adminUrl: null, media: true }
    const render = (themeFix: typeof theme | null, state: 'applied' | null = null) => renderToStaticMarkup(createElement(FindingCard, {
      finding, copy: he, platform: 'wordpress', fixed: new Set<string>(), onFix: () => {}, themeFix, fixModeFor: () => 'fix' as const, jobStateFor: () => state, onInstall: () => {},
    }))
    check('G1: the theme\'s line has its "fix it for me" when the Media Library holds those images', /data-fix-button="image_alt_media"/.test(render(theme)) && render(theme).includes(he.themeAltMedia))
    check('G2: none without it, and "fixed" once done', !/data-fix-button="image_alt_media"/.test(render(null)) && /data-theme-alt-fix="applied"/.test(render(theme, 'applied')))
    const screen = strip(read('components/site-health/SiteHealthScreen.tsx'))
    // 3.1.0: the GO TOP plugin writes Media Library alt text too (caps.mediaAlt, lib/site-fix/channel.ts); an
    // answer from before it has no mediaAlt and falls back to the application password.
    const gate = /if \(finding\.fixType === 'image_alt' && page\.media\) return !caps\.shopify && \(caps\.mediaAlt \?\? caps\.appPassword\) \? 'fix' : null/
    check('G3: a Media Library row is fixable only where the Media Library can be written (plugin 3.1 or the application password), never on a store', gate.test(screen))
    check('MUTATION CONTROL: G3 fails on a screen that offers it with no way to write it', !gate.test(screen.replace('&& (caps.mediaAlt ?? caps.appPassword) ', '')))
    check('G4: the theme\'s line needs the same and a WordPress site too', /caps\.shopify \|\| !\(caps\.mediaAlt \?\? caps\.appPassword\)/.test(screen))
    const modal = strip(read('components/site-health/ApproveFixModal.tsx'))
    check('G5: the approve window asks for the Media Library on such a row, keeps each item\'s id and sends via "media"',
      /type === 'image_alt' && page\.media \? \{ media: true \}/.test(modal) && /media: i\.media/.test(modal) && /p\.via === 'media'/.test(modal))
    for (const locale of PUBLIC_LOCALES) {
      const d = getDashboardDictionary(locale) as unknown as { siteHealth: { themeAltMedia?: string; autofix: { approve: { via: { media?: string } } } } }
      check(`G6 [${locale}]: the line under the button and the "where it is saved" sentence`, (d.siteHealth.themeAltMedia ?? '').length > 40 && (d.siteHealth.autofix.approve.via.media ?? '').length > 40)
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })

export {}
