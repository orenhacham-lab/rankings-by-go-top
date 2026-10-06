/**
 * Site fixes: what "fix it for me" can reach (the coverage audit of 2026-10-06, its prioritised list).
 *
 *   B) one click sees every fixable row, not only the ten a finding lists (within the 25-page cap);
 *   O) a page the home page (or its menu) links to is never an orphan;
 *   S) a store's images: counted from what a fix reaches, pages the 20% rule hid are found, rows past
 *      the tenth are checked, at most 12 reads; theme-only pages said once; product photos info only;
 *   W) WordPress: the same check through the plugin's /inspect (or the REST API), page builders;
 *   H) honest buttons: builder pages refused at preview, WooCommerce rows and app-password
 *      descriptions without an SEO plugin and its bridge;
 *   L) the internal-link matcher: whole words only, Hebrew vowel marks folded, the page's title and
 *      address as further words, up to 10 candidates, and a sentence offered only where the plugin's
 *      OWN apply (wordpress-plugin content.php, run here with php) lands on the same words;
 *   I) every new line on the screen in the four languages.
 * Every guard has a mutation control: the same check against a broken copy must fail.
 *
 * Run: npx tsx lib/site-fix/__qa__/site-fix-coverage.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import * as RULES from '../../site-health/rules'
import * as BULK from '../bulk'
import * as NUDGES from '../../nudges/rows'
import * as SHOP_SCAN from '../shopify-scan'
import * as WP_SCAN from '../wordpress-scan'
import * as BUILDER from '../builder'
import * as CHANNEL from '../channel'
import * as PREVIEW from '../preview'
import * as LINK from '../../content/internal-link-insertion'
import * as WPFIX from '../../site-health/wordpress-fix'
import type { PageFacts, SiteFacts } from '../../site-health/types'
import type { ShopCreds, ShopifyFixClient, ShopItem } from '../shopify-admin'
import type { FixCapabilities } from '../types'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  PASS  ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** A broken copy of a module, loaded from a temp dir with its imports made absolute. */
function mutant<T>(rel: string, from: string, to: string): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  const dir = mkdtempSync(join(tmpdir(), 'site-fix-coverage-mutant-'))
  try {
    const here = join(ROOT, rel, '..')
    const body = src.split(from).join(to)
      .replace(/from '@\/([^']+)'/g, (_m, p) => `from '${join(ROOT, p)}'`)
      .replace(/from '\.\/([^']+)'/g, (_m, p) => `from '${join(here, p)}'`)
      .replace(/from '\.\.\/([^']+)'/g, (_m, p) => `from '${join(here, '..', p)}'`)
    const file = join(dir, rel.split('/').pop()!)
    writeFileSync(file, body)
    return { mod: require(file) as T, found }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const SITE = 'https://shop.example.org'
const page = (path: string, over: Partial<PageFacts> = {}): PageFacts => ({
  url: `${SITE}${path}`, kind: path === '/' ? 'home' : 'article', ok: true, status: 200,
  title: `A perfectly reasonable page title for ${path}`, description: `A description of a reasonable length that says what ${path} offers and why a visitor should come in.`,
  h1: ['Heading'], images: { total: 2, missingAlt: 0 }, noindex: false, viewport: true, links: [], adminUrl: null, ...over,
})
const site = (over: Partial<SiteFacts> = {}): SiteFacts => ({
  siteUrl: `${SITE}/`, homeReachable: true, robots: { blocksAll: false, blocksAi: false, blockedBots: [], readable: true },
  sitemapFound: true, brokenLinks: [], orphanPages: [], llmsFound: true, ...over,
})
const WP = { platform: 'wordpress' as const, connections: { wordpress: true, shopify: false, wix: false } }
const SHOP = { platform: 'shopify' as const, connections: { wordpress: false, shopify: true, wix: false } }
const longTitle = (i: number) => `A very long page title number ${i} that keeps going well past the sixty-five characters Google shows`

async function main() {
  console.log('Site fixes: coverage\n')

  // ── B) one click sees every fixable row ───────────────────────────────────
  console.log('B) bulk beyond the first ten rows')
  {
    const pages = [page('/'), ...Array.from({ length: 18 }, (_, i) => page(`/post-${i}`, { title: longTitle(i) }))]
    const findings = RULES.buildFindings(site(), pages, WP)
    const long = findings.find((f) => f.id === 'title_long')!
    check('B1: the finding still lists 10 pages, keeps the other 8 for the batch, and counts all 18',
      long.pages.length === 10 && (long.morePages ?? []).length === 8 && long.total === 18, `${long.pages.length}/${long.morePages?.length}/${long.total}`)
    const plan = (mod: typeof BULK) => mod.bulkPlan(findings, { fixable: () => true, jobs: [], now: Date.now() })
    check('B2: the one-click batch takes all 18 long titles, not the first 10', plan(BULK).rows.filter((r) => r.type === 'seo_title').length === 18)
    const mut = mutant<typeof BULK>('lib/site-fix/bulk.ts', 'for (const p of allRows(f)) {', 'for (const p of f.pages) {')
    check('MUTATION CONTROL: a batch that reads only the listed rows is caught by B2 (10, not 18)', mut.found && !!mut.mod && plan(mut.mod).rows.filter((r) => r.type === 'seo_title').length === 10)
    const many = [page('/'), ...Array.from({ length: 24 }, (_, i) => page(`/p-${i}`, { title: longTitle(i), description: null }))]
    const capped = BULK.bulkPlan(RULES.buildFindings(site(), many, WP), { fixable: () => true, jobs: [], now: Date.now() })
    const distinct = new Set(capped.rows.map((r) => r.url)).size
    check('B3: still at most 25 pages per batch (the terms\' cap); the rest wait with batch_full', distinct <= BULK.BULK_MAX_PAGES && capped.rows.length === 48,
      `${distinct} pages, ${capped.rows.length} rows`)
    // The dashboard nudge counts the same rows, from the scan kept in the browser.
    const caps: FixCapabilities = {
      available: true, readOnly: false, plugin: { state: 'connected', version: '2.1.0', seoPlugin: 'yoast', lastSeenAt: null },
      channelFor: { seo_title: 'plugin', meta_description: 'plugin', image_alt: 'plugin' }, appPassword: false, webhook: false, wordpress: true,
    }
    const raw = JSON.stringify({ v: 1, report: { findings } })
    check('B4: the dashboard nudge counts the same 18, from the same report', NUDGES.safeFixCountFromScan(raw, { capabilities: caps, jobs: [] }) === 18)
    const mutN = mutant<typeof NUDGES>('lib/nudges/rows.ts', 'morePages: rows(f.morePages)', 'morePages: []')
    check('MUTATION CONTROL: a nudge that reads only the listed rows is caught by B4', mutN.found && !!mutN.mod && mutN.mod.safeFixCountFromScan(raw, { capabilities: caps, jobs: [] }) === 10)
    const screen = strip(read('components/site-health/useSafeFixes.tsx'))
    const lookup = /allRows\(f\)\.find\(\(p\) => p\.url === url\)/
    check('B5: the screen\'s batch finds a row among all rows, the unlisted ones too', lookup.test(screen))
    check('MUTATION CONTROL: B5 fails on a screen that looks only at the listed rows', !lookup.test(screen.replace('allRows(f).find', 'f.pages.find')))
  }

  // ── O) orphans the home page links to ─────────────────────────────────────
  console.log('\nO) orphan pages')
  {
    const pages = [page('/', { links: [`${SITE}/%D7%91%D7%9C%D7%95%D7%92/`, `${SITE}/contact`] })]
    const s = site({ orphanPages: [{ url: `${SITE}/בלוג`, title: 'בלוג', keyword: 'בלוג' }, { url: `${SITE}/forgotten-guide/`, title: 'Guide', keyword: 'guide' }] })
    const run = (mod: typeof RULES) => mod.buildFindings(s, pages, WP).find((f) => f.id === 'orphan_page')?.pages.map((p) => p.path) ?? []
    const got = run(RULES)
    check('O1: a page the home page (its menu) links to is not an orphan; a page nothing links to still is', got.length === 1 && got[0] === '/forgotten-guide', got.join(','))
    const mut = mutant<typeof RULES>('lib/site-health/rules.ts', 'if (fromHome.has(pathOf(o.url))) continue', '')
    check('MUTATION CONTROL: without that check, /בלוג is reported again (O1 catches it)', mut.found && !!mut.mod && run(mut.mod).length === 2)
  }

  // ── S) a store's images ───────────────────────────────────────────────────
  console.log('\nS) Shopify: image alt text from what a fix reaches')
  {
    const P = 'a1111111-2222-4333-8444-555555555555'
    const U = '11111111-1111-4111-8111-111111111111'
    const CREDS: ShopCreds = { shopDomain: 'boots.myshopify.com', accessToken: 'shpat_test', apiVersion: '2026-07' }
    const art = (n: number) => `${SITE}/blogs/news/a-${n}`
    const entities = Array.from({ length: 16 }, (_, n) => ({ project_id: P, user_id: U, entity_type: 'article', canonical_url: art(n), shopify_gid: `gid://shopify/Article/${100 + n}`, is_active: true }))
    const store = (body: (n: number) => string, image: (n: number) => ShopItem['image'] = () => null) => {
      const reads: string[] = []
      const client: ShopifyFixClient = {
        async read(_c, ref) {
          reads.push(ref.gid)
          const n = Number(ref.gid.split('/').pop()) - 100
          return { kind: 'article', gid: ref.gid, url: art(n), title: `Article ${n}`, body: body(n), titleTag: null, descriptionTag: null, image: image(n) }
        },
        async write() { throw new Error('never written') },
        async clearMeta() { throw new Error('never written') },
      }
      return { client, reads }
    }
    const scanOf = async (pages: PageFacts[], st: ReturnType<typeof store>, mod: typeof SHOP_SCAN = SHOP_SCAN) => {
      const findings = RULES.buildFindings(site(), pages, SHOP)
      await mod.markShopifyOutsideContent(findings, { admin: new FakeAdmin({ shopify_entities: entities }) as never, scope: { projectId: P, userId: U }, creds: CREDS, client: st.client }, pages)
      return findings.find((f) => f.id === 'images_alt')
    }
    // Page 0: 3 theme images + 1 in the article's text. Page 1: 10 theme images with alt, 1 in its text (1/11 < 20%).
    // Page 2: theme-only (3 theme images, text fine). Page 3: same.
    const pages = [
      page('/'),
      page('/blogs/news/a-0', { images: { total: 5, missingAlt: 4 } }),
      page('/blogs/news/a-1', { images: { total: 11, missingAlt: 1 } }),
      page('/blogs/news/a-2', { images: { total: 4, missingAlt: 3 } }),
      page('/blogs/news/a-3', { images: { total: 4, missingAlt: 3 } }),
    ]
    const body = (n: number) => (n <= 1 ? '<p>Text <img src="https://cdn.shopify.com/s/files/in-text.jpg"></p>' : '<p>Text <img src="x.jpg" alt="fine"></p>')
    const f = await scanOf(pages, store(body))
    const row = (n: number) => f?.pages.find((p) => p.url === art(n))
    check('S1: a row counts what a fix reaches (1), and apart from it what the theme holds (3)', row(0)?.measure === 1 && row(0)?.themeMissing === 3, JSON.stringify(row(0)))
    check('S2: a page the 20% rule hid, whose own text has an image without alt, is listed', !!row(1) && row(1)?.measure === 1 && row(1)?.kind === 'article')
    const mutHidden = mutant<typeof SHOP_SCAN>('lib/site-fix/shopify-scan.ts', "const others = scanned.filter((s) => s.ok && (s.kind === 'article' || s.kind === 'page')).map((s) => s.url)", 'const others: string[] = []')
    const fM = mutHidden.mod ? await scanOf(pages, store(body), mutHidden.mod) : null
    check('MUTATION CONTROL: reading only the listed rows misses the hidden page (S2 catches it)', mutHidden.found && !!fM && !fM.pages.some((p) => p.url === art(1)))
    check('S3: theme-only pages are said once for the whole site, not as dead rows', f?.themeAlt?.pages === 2 && f.themeAlt.images === 3 && !row(2) && !row(3), JSON.stringify(f?.themeAlt))
    check('S4: the count of pages on the card covers them all (2 listed + 2 in the theme)', (f?.total ?? 0) + (f?.themeAlt?.pages ?? 0) === 4)
    const featured = await scanOf([page('/'), page('/blogs/news/a-2', { images: { total: 4, missingAlt: 3 } })], store(() => '<p>fine</p>', () => ({ url: 'https://cdn.shopify.com/f.jpg', alt: '' })))
    check('S5: an article\'s featured image without alt counts as reachable (it is fixed with the article)', featured?.pages[0]?.measure === 1 && !featured.pages[0].outside)
    check('S5b: the featured image is not counted twice when the text holds it too',
      SHOP_SCAN.reachableAlt({ body: '<img src="https://cdn.shopify.com/f.jpg">', image: { url: 'https://cdn.shopify.com/f.jpg', alt: '' } }) === 1)
    const mutF = mutant<typeof SHOP_SCAN>('lib/site-fix/shopify-scan.ts', "!body.includes(item.image.url) ? 1 : 0", '!body.includes(item.image.url) ? 0 : 0')
    check('MUTATION CONTROL: a count without the featured image is caught by S5', mutF.found && !!mutF.mod && mutF.mod.reachableAlt({ body: '<p>x</p>', image: { url: 'f.jpg', alt: '' } }) === 0)
    // No images_alt finding at all on the scan: the store's text still has one.
    const quiet = await scanOf([page('/'), page('/blogs/news/a-1', { images: { total: 11, missingAlt: 1 } })], store(body))
    check('S6: with no finding from the scan, a text image without alt makes one', !!quiet && quiet.pages.length === 1 && quiet.fixType === 'image_alt')
    // 14 listed rows: rows 11-14 are checked too, and the store is read at most 12 times.
    const fourteen = [page('/'), ...Array.from({ length: 14 }, (_, n) => page(`/blogs/news/a-${n}`, { images: { total: 4, missingAlt: 3 } }))]
    const st14 = store((n) => (n >= 10 ? '<p><img src="t.jpg"></p>' : '<p>fine</p>'))
    const f14 = await scanOf(fourteen, st14)
    check('S7: at most 12 reads of the store', st14.reads.length <= 12, String(st14.reads.length))
    check('S8: rows past the tenth are checked, and what a fix reaches is listed first', (f14?.pages ?? []).slice(0, 2).every((p) => p.measure === 1 && !p.outside),
      JSON.stringify(f14?.pages.slice(0, 3)))
    // The same, on the shared counting step alone: every row of the finding is counted, not the first ten.
    const REFINE = require('../scan-refine') as typeof import('../scan-refine')
    const countRows = (mod: typeof REFINE) => {
      const fs = RULES.buildFindings(site(), fourteen, SHOP)
      const reach = new Map(fourteen.slice(1).map((p, n) => [p.url, n >= 10 ? 1 : 0] as const))
      mod.refineImageAlt(fs, fourteen, reach, { fixable: () => false })
      const fx = fs.find((x) => x.id === 'images_alt')!
      return RULES.allRows(fx).filter((p) => p.measure === 1 && !p.outside).length
    }
    check('S8b: all four rows past the tenth are counted', countRows(REFINE) === 4)
    // S1 and S3 against broken copies of the counting step.
    const refineOne = (mod: typeof REFINE) => {
      const fs = RULES.buildFindings(site(), pages, SHOP)
      mod.refineImageAlt(fs, pages, new Map([[art(0), 1], [art(2), 0], [art(3), 0]]), { fixable: () => false })
      return fs.find((x) => x.id === 'images_alt')!
    }
    const mutMeasure = mutant<typeof REFINE>('lib/site-fix/scan-refine.ts', '    p.measure = r\n', '\n')
    check('MUTATION CONTROL: a count that keeps the whole page\'s images is caught by S1', mutMeasure.found && !!mutMeasure.mod && refineOne(mutMeasure.mod).pages.find((p) => p.url === art(0))?.measure === 4)
    const mutTheme = mutant<typeof REFINE>('lib/site-fix/scan-refine.ts', "const rest = all.filter((p) => p.outside !== 'theme')", 'const rest = all')
    check('MUTATION CONTROL: theme-only pages listed one by one again are caught by S3', mutTheme.found && !!mutTheme.mod && refineOne(mutTheme.mod).pages.some((p) => p.url === art(2)))
    const mutRows = mutant<typeof REFINE>('lib/site-fix/scan-refine.ts', 'const rows = f ? allRows(f) : []', 'const rows = f ? f.pages : []')
    check('MUTATION CONTROL: counting only the first ten rows is caught by S8b', mutRows.found && !!mutRows.mod && countRows(mutRows.mod) !== 4)
    // A product page's photos: information only (write_products and the terms would be needed).
    const product = await scanOf([page('/'), page('/products/boot', { kind: 'product', images: { total: 3, missingAlt: 3 }, adminUrl: 'https://boots.myshopify.com/admin/products/1' })], store(body))
    check('S9: a product page\'s photos are marked as the product\'s (no fix, the admin link stays)', product?.pages[0]?.outside === 'product' && product.pages[0].adminUrl !== null && product.pages[0].fixable === false)
    const mutP = mutant<typeof SHOP_SCAN>('lib/site-fix/shopify-scan.ts', "{ p.outside = 'product'; p.fixable = false }", '{}')
    const productM = mutP.mod ? await scanOf([page('/'), page('/products/boot', { kind: 'product', images: { total: 3, missingAlt: 3 } })], store(body), mutP.mod) : null
    check('MUTATION CONTROL: without the product marking S9 is caught', mutP.found && !!productM && productM.pages[0]?.outside === undefined)
    const st = store(body)
    await scanOf(pages, st)
    check('S10: nothing is ever written to the store', true)
  }

  // ── W) WordPress ──────────────────────────────────────────────────────────
  console.log('\nW) WordPress: the same check, through what the connection already reads')
  {
    const contentOf: Record<string, { content: string; builder: boolean | null } | 'not_ours'> = {
      [`${SITE}/text-image`]: { content: '<p>A <img src="/up/a.jpg"> b</p>', builder: false },
      [`${SITE}/theme-only`]: { content: '<p>All fine <img src="/up/b.jpg" alt="B"></p>', builder: false },
      [`${SITE}/elementor`]: { content: '<p>Fallback copy <img src="/up/c.jpg"></p>', builder: true },
      [`${SITE}/wpbakery`]: { content: '[vc_row][vc_column]<p><img src="/up/d.jpg"></p>[/vc_column][/vc_row]', builder: true },
      [`${SITE}/with-link`]: { content: '<p>See <a href="/gone">old</a></p>', builder: false },
    }
    const reads: string[] = []
    const reader: WP_SCAN.WpReader = async (url) => { reads.push(url); return contentOf[url] ?? null }
    const pages = [
      page('/'),
      page('/text-image', { images: { total: 3, missingAlt: 3 } }),
      page('/theme-only', { images: { total: 3, missingAlt: 2 } }),
      page('/elementor', { images: { total: 2, missingAlt: 2 } }),
      page('/wpbakery', { images: { total: 2, missingAlt: 2 } }),
      page('/with-link'),
    ]
    const s = site({ brokenLinks: [{ url: `${SITE}/gone`, from: `${SITE}/with-link` }, { url: `${SITE}/menu-gone`, from: `${SITE}/with-link` }] })
    const runWp = async (mod: typeof WP_SCAN = WP_SCAN) => {
      const findings = RULES.buildFindings(s, pages, WP)
      await mod.markWordPressOutsideContent(findings, pages, reader, { ...WP, homeHost: 'shop.example.org' })
      return findings
    }
    const fs = await runWp()
    const alt = fs.find((f) => f.id === 'images_alt')!
    const rowOf = (path: string) => RULES.allRows(alt).find((p) => p.path === path)
    check('W1: an image in the post\'s own text keeps its button, counted from the text (1 of 3)', rowOf('/text-image')?.measure === 1 && rowOf('/text-image')?.themeMissing === 2 && rowOf('/text-image')?.fixable === true)
    check('W2: a theme-only page is said once for the site, with no dead row', !rowOf('/theme-only') && alt.themeAlt?.pages === 1)
    check('W3: an Elementor-type page is marked as built by a page builder (no button)', rowOf('/elementor')?.outside === 'builder' && rowOf('/elementor')?.fixable === false)
    check('W4: a WPBakery page (it renders from its shortcodes, the content) keeps its button', rowOf('/wpbakery')?.outside === undefined && rowOf('/wpbakery')?.measure === 1)
    const broken = fs.find((f) => f.id === 'broken_links')!
    check('W5: a dead link in the post\'s text keeps its button; one only in the menu is marked as the theme\'s',
      broken.pages.find((p) => p.url === `${SITE}/gone`)?.outside === undefined && broken.pages.find((p) => p.url === `${SITE}/menu-gone`)?.outside === 'theme')
    check('W6: at most 12 reads, each a read of what is there (nothing written)', reads.length <= WP_SCAN.MAX_READS)
    const mutB = mutant<typeof WP_SCAN>('lib/site-fix/wordpress-scan.ts', "if (rendersFromBuilderData(r)) { p.outside = 'builder'; p.fixable = false; continue }", '')
    const fsB = mutB.mod ? await runWp(mutB.mod) : null
    const altB = fsB?.find((f) => f.id === 'images_alt')
    check('MUTATION CONTROL: without the builder check, W3 is caught (the Elementor row keeps a button)', mutB.found && !!altB && RULES.allRows(altB).find((p) => p.path === '/elementor')?.outside !== 'builder')
    check('W7: builder pages: Elementor-type yes; shortcode builders (WPBakery, Divi, Avada) no; 2.0.0 (unknown) no',
      BUILDER.rendersFromBuilderData({ builder: true, content: '<p>x</p>' }) && !BUILDER.rendersFromBuilderData({ builder: true, content: '[et_pb_section]x' })
      && !BUILDER.rendersFromBuilderData({ builder: true, content: '[fusion_builder_container]' }) && !BUILDER.rendersFromBuilderData({ content: '<p>x</p>' }))
    const mutS = mutant<typeof BUILDER>('lib/site-fix/builder.ts', " && !SHORTCODE_BUILDER.test(String(item.content ?? ''))", '')
    check('MUTATION CONTROL: a check that refuses every builder (WPBakery too) is caught by W7', mutS.found && !!mutS.mod && mutS.mod.rendersFromBuilderData({ builder: true, content: '[et_pb_section]x' }))
    const route = strip(read('app/api/site-health/scan/route.ts'))
    const wired = (src: string) => /markWordPressOutsideContent\(/.test(src) && /pluginInspect\(/.test(src) && !/pluginFix|updateItemFields|pluginUndo/.test(src)
    check('W8: the scan wires the WordPress check through the plugin\'s /inspect or the REST read, never a write', wired(route))
    check('MUTATION CONTROL: W8 fails on a route that writes', !wired(`${route}\nawait updateItemFields(c, '/posts', 1, {})`))
    const mutW5 = mutant<typeof WP_SCAN>('lib/site-fix/wordpress-scan.ts', "brokenLinkWords(r.content, p.url, ctx.homeHost).length === 0) { p.outside = 'theme'; p.fixable = false }", 'false) {}')
    const fsW5 = mutW5.mod ? await runWp(mutW5.mod) : null
    check('MUTATION CONTROL: without the link check, W5 is caught (the menu link keeps a button)', mutW5.found && !!fsW5 && fsW5.find((f) => f.id === 'broken_links')!.pages.find((p) => p.url === `${SITE}/menu-gone`)?.outside === undefined)
  }

  // ── H) honest buttons ─────────────────────────────────────────────────────
  console.log('\nH) no button that cannot work')
  {
    const elementor = { post_id: 7, post_type: 'page', link: `${SITE}/landing/`, title: 'Landing', content: '<p><img src="/up/x.jpg"></p>', content_sha: 'abc', seo_plugin: 'none', seo: { title: '', description: '', canonical: '', focus: '', schema: '' }, h1: [], builder: true }
    const post = async (_site: string, route: string) => (route === '/inspect'
      ? { status: 200, body: JSON.stringify({ ok: true, item: elementor }) }
      : { status: 200, body: JSON.stringify({ ok: true, items: [] }) })
    const ctx = { channel: 'plugin' as const, creds: null, link: { siteUrl: SITE, keyId: 'k', secret: 's'.repeat(43) }, siteName: null }
    const deps = { wp: {} as never, readLive: async () => null, pluginPost: post as never }
    const p1 = await PREVIEW.previewFixJob({ type: 'image_alt', url: `${SITE}/landing/`, kind: 'images_alt' }, ctx, deps)
    check('H1: an image fix on a page a builder renders is refused at preview (builder_page), never applied unseen', !p1.ok && p1.code === 'builder_page', JSON.stringify(p1))
    const mutP = mutant<typeof PREVIEW>('lib/site-fix/preview.ts', "if (CONTENT_TYPES_ON_PAGE.includes(req.type) && rendersFromBuilderData(it)) return fail('builder_page')", '')
    const p1m = mutP.mod ? await mutP.mod.previewFixJob({ type: 'image_alt', url: `${SITE}/landing/`, kind: 'images_alt' }, ctx, deps) : null
    check('MUTATION CONTROL: without the refusal H1 is caught (an image fix is offered on the builder page)', mutP.found && !!p1m && p1m.ok === true)
    const faq = await PREVIEW.previewFixJob({ type: 'faq_block', url: `${SITE}/landing/`, kind: 'faq_missing' }, ctx, deps)
    check('H2: an FAQ block on such a page is refused too', !faq.ok && faq.code === 'builder_page')
    const api = strip(read('lib/site-fix/api.ts'))
    const autoSkip = /\(c\.type === 'image_alt' \|\| c\.type === 'broken_link'\) && rendersFromBuilderData\(it\)\) return null/
    check('H3: automatic fixes skip builder pages as well', autoSkip.test(api))
    check('MUTATION CONTROL: H3 fails on a run without the skip', !autoSkip.test(api.replace(autoSkip, '')))

    const screen = strip(read('components/site-health/SiteHealthScreen.tsx'))
    const gate = /if \(!caps\.shopify && \(channel === 'plugin' \|\| channel === 'manual'\) && finding\.fixType !== 'broken_link' && WP_NOT_POSTS\.has\(page\.kind\)\) return null/
    check('H4: WooCommerce product and category rows get no "fix it for me" on the plugin (it edits posts and pages only)', gate.test(screen) && /WP_NOT_POSTS[^=]*= new Set\(\['product', 'collection'\]\)/.test(screen))
    check('MUTATION CONTROL: H4 fails on a screen without that gate', !gate.test(screen.replace(gate, '')))
    const outsideGate = /if \(page\.outside === 'product' \|\| page\.outside === 'builder'\) return null/
    check('H5: a product\'s photos or a builder page get no fix button', outsideGate.test(screen))
    check('MUTATION CONTROL: H5 fails on a screen without that gate', !outsideGate.test(screen.replace(outsideGate, '')))

    // Application password: a meta description needs an SEO plugin AND its bridge.
    const caps = CHANNEL.resolveCapabilities({ shopify: false, wordpressDetected: true, creds: { siteUrl: SITE, username: 'u', applicationPassword: 'p' }, plugin: null, pluginLink: null, webhook: null, siteUrls: [SITE] }, true)
    const none = CHANNEL.withAppPasswordSeo(caps, { plugin: 'none', hasBridge: false })
    const noBridge = CHANNEL.withAppPasswordSeo(caps, { plugin: 'yoast', hasBridge: false })
    const ready = CHANNEL.withAppPasswordSeo(caps, { plugin: 'rankmath', hasBridge: true })
    const unknown = CHANNEL.withAppPasswordSeo(caps, { plugin: 'unknown', hasBridge: false })
    check('H6: without an SEO plugin, or without its bridge, descriptions read "install the plugin"', caps.channelFor.meta_description === 'app_password'
      && none.channelFor.meta_description === 'needs_plugin' && noBridge.channelFor.meta_description === 'needs_plugin')
    check('H7: with both, or when the site did not say, nothing changes; titles and alt text keep their channel',
      ready.channelFor.meta_description === 'app_password' && unknown.channelFor.meta_description === 'app_password' && none.channelFor.seo_title === 'app_password' && none.channelFor.image_alt === 'app_password')
    const mutC = mutant<typeof CHANNEL>('lib/site-fix/channel.ts', 'if (!known || canWrite) return caps', 'return caps')
    check('MUTATION CONTROL: a capability read that ignores the SEO plugin is caught by H6', mutC.found && !!mutC.mod && mutC.mod.withAppPasswordSeo(caps, { plugin: 'none', hasBridge: false }).channelFor.meta_description === 'app_password')
    const applied = /withAppPasswordSeo\(l\.caps, await seoOf\(l\.ctx\.creds, deps\)\)/
    check('H8: the queue read applies it (one REST read, a few seconds at most)', applied.test(api) && /SEO_READ_MS = 3_000/.test(api))
    check('MUTATION CONTROL: H8 fails on a queue read that does not apply it', !applied.test(api.replace(applied, '')))
  }

  // ── L) the internal-link matcher ──────────────────────────────────────────
  console.log('\nL) internal links: whole words, and the plugin lands where the preview said')
  {
    const filler = `<p>${Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ')}.</p>`
    const at = (html: string, kw: string, mod: typeof LINK = LINK) => mod.findNaturalAnchorPlacement(html, kw)
    const start = `${filler}<p>We start the day with coffee.</p>`
    check('L1: "art" is never found inside "start"', !at(start, 'art').found)
    const heb = `${filler}<p>קראו עוד בבלוג שלנו והבלוג החדש.</p>`
    check('L2: "בלוג" is never found inside "בבלוג" or "והבלוג"', !at(heb, 'בלוג').found)
    const whole = `${filler}<p>We start here. The art of coffee.</p>`
    const w = at(whole, 'art')
    check('L3: a whole word is still found, and only it', w.found && whole.slice(w.index!, w.index! + w.matchLength!) === 'art' && whole[w.index! - 1] === ' ')
    const mutW = mutant<typeof LINK>('lib/content/internal-link-insertion.ts', 'if (isWordChar(rawHay[j - 1]) || isWordChar(rawHay[j + nl.length])) continue', '')
    check('MUTATION CONTROL: without the word check, L1 and L2 are caught', mutW.found && !!mutW.mod && at(start, 'art', mutW.mod).found && at(heb, 'בלוג', mutW.mod).found)
    const niqqud = `${filler}<p>זה הבְּלוֹג? לא. זה בְּלוֹג טוב.</p>`
    const n = at(niqqud, 'בלוג')
    const surface = n.found ? niqqud.slice(n.index!, n.index! + n.matchLength!) : ''
    check('L4: vowel marks are folded for matching; the whole original word is linked, its marks included', n.found && surface === 'בְּלוֹג' && niqqud[n.index! - 1] === ' ', surface)
    const mutN = mutant<typeof LINK>('lib/content/internal-link-insertion.ts', 'if (HEBREW_MARK.test(html[i])) continue', '')
    check('MUTATION CONTROL: without folding the vowel marks, L4 is caught', mutN.found && !!mutN.mod && !at(niqqud, 'בלוג', mutN.mod).found)
    const apply = LINK.applyNaturalAnchor(niqqud, 'בלוג', `${SITE}/blog`)
    check('L5: the text is unchanged, only wrapped', !!apply.html && apply.html.replace(/<a [^>]*>|<\/a>/g, '') === niqqud)

    // Parity with the plugin's own apply (content.php), run for real.
    const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
    const cases = [
      { content: '<p>הבלוג שלנו. בְּלוֹג טוב</p>', anchor: 'בְּלוֹג' },
      { content: '<p>We start the art. Art again.</p>', anchor: 'art' },
      { content: '<h2>The art</h2><p>first <a href="/x">art</a> then art here</p>', anchor: 'art' },
      { content: '<table><tr><td>art</td></tr></table><p>art</p>', anchor: 'art' },
      { content: '<p>Tom &amp; Jerry show</p>', anchor: 'Tom &amp; Jerry' },
      { content: '<p>a <code>art</code> <strong>art</strong></p>', anchor: 'art' },
      { content: '<p>x <!-- art --> art</p>', anchor: 'art' },
    ]
    if (!hasPhp) {
      check('L6: php is not installed here: the parity check did not run (report this)', false)
    } else {
      const dir = mkdtempSync(join(tmpdir(), 'site-fix-link-parity-'))
      try {
        const script = join(dir, 'run.php')
        writeFileSync(script, `<?php define('ABSPATH', '/'); require $argv[1];
$cases = json_decode(file_get_contents($argv[2]), true); $out = array();
foreach ($cases as $c) { $r = gotop_seo_bridge_add_internal_link($c['content'], 'https://t.example/x', $c['anchor']);
  $out[] = $r === null ? null : substr($r, 0, strpos($r, '<a href="https://t.example/x">')); }
echo json_encode($out);`)
        writeFileSync(join(dir, 'cases.json'), JSON.stringify(cases))
        const r = spawnSync('php', [script, join(ROOT, 'wordpress-plugin/gotop-seo-bridge/includes/content.php'), join(dir, 'cases.json')], { encoding: 'utf8' })
        const php = JSON.parse(r.stdout || '[]') as (string | null)[]
        const ours = (mod: typeof LINK) => cases.map((c) => { const k = mod.pluginLinkLanding(c.content, c.anchor); return k < 0 ? null : c.content.slice(0, k) })
        const mine = ours(LINK)
        const diff = cases.map((c, i) => (php[i] === mine[i] ? null : `${i}: php=${JSON.stringify(php[i])} ts=${JSON.stringify(mine[i])}`)).filter(Boolean)
        check('L6: pluginLinkLanding lands exactly where the plugin\'s own apply does, on every fixture', r.status === 0 && php.length === cases.length && diff.length === 0, diff.join(' | ') || r.stderr)
        const mutL = mutant<typeof LINK>('lib/content/internal-link-insertion.ts', 'if (Object.values(skip).some((n) => n > 0)) continue', '')
        const diffM = mutL.mod ? cases.filter((_, i) => php[i] !== ours(mutL.mod!)[i]).length : 0
        check('MUTATION CONTROL: a mirror that forgets the skipped tags disagrees with the plugin (L6 catches it)', mutL.found && diffM > 0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }

    // The preview through the plugin: offered only where the plugin would land.
    const TARGET = `${SITE}/blog/`
    const early = `<p>Our blog is new.</p>${filler}<p>Read the blog every week.</p>`
    const later = `${filler}<p>Read the blog every week.</p>`
    const items: Record<string, Record<string, unknown>> = {
      [TARGET]: { post_id: 1, post_type: 'page', link: TARGET, title: 'Blog | Shop', content: '<p>Posts.</p>', content_sha: 't', seo_plugin: 'none', seo: {}, builder: false },
      [`${SITE}/early/`]: { post_id: 2, post_type: 'post', link: `${SITE}/early/`, title: 'Early', content: early, content_sha: 'e', seo_plugin: 'none', seo: {}, builder: false },
      [`${SITE}/later/`]: { post_id: 3, post_type: 'post', link: `${SITE}/later/`, title: 'Later', content: later, content_sha: 'l', seo_plugin: 'none', seo: {}, builder: false },
      [`${SITE}/builder/`]: { post_id: 4, post_type: 'page', link: `${SITE}/builder/`, title: 'Built', content: later, content_sha: 'b', seo_plugin: 'none', seo: {}, builder: true },
    }
    const searched: { term: string; limit: unknown }[] = []
    const mkPost = (hits: string[]) => async (_site: string, route: string, body: string) => {
      const b = JSON.parse(body) as { url?: string; term?: string; limit?: unknown }
      if (route === '/inspect') { const it = items[String(b.url)]; return it ? { status: 200, body: JSON.stringify({ ok: true, item: it }) } : { status: 404, body: JSON.stringify({ code: 'not_in_wordpress' }) } }
      if (route === '/search') { searched.push({ term: String(b.term), limit: b.limit }); return { status: 200, body: JSON.stringify({ ok: true, items: hits.map((u) => ({ post_id: items[u].post_id, link: u, title: items[u].title })) }) } }
      return { status: 404, body: '{}' }
    }
    const ctx = { channel: 'plugin' as const, creds: null, link: { siteUrl: SITE, keyId: 'k', secret: 's'.repeat(43) }, siteName: null }
    const prev = (hits: string[], keyword: string, mod: typeof PREVIEW = PREVIEW) => mod.previewFixJob({ type: 'internal_link', url: TARGET, kind: 'orphan_page', keyword }, ctx, { wp: {} as never, readLive: async () => null, pluginPost: mkPost(hits) as never })
    const e = await prev([`${SITE}/early/`], 'blog')
    check('L7: where the plugin would link the first "blog" (the opening line), that post is not offered', !e.ok && e.code === 'no_safe_place', JSON.stringify(e))
    const mutPrev = mutant<typeof PREVIEW>('lib/site-fix/preview.ts', "pluginLink: { rendersFromBuilder: (id) => { const it = byId.get(id); return !!it && rendersFromBuilderData(it) } },", '')
    const eM = mutPrev.mod ? await prev([`${SITE}/early/`], 'blog', mutPrev.mod) : null
    check('MUTATION CONTROL: a preview that ignores where the plugin lands offers the sentence the plugin would not link (L7 catches it)', mutPrev.found && !!eM && eM.ok === true)
    const l = await prev([`${SITE}/builder/`, `${SITE}/early/`, `${SITE}/later/`], 'blog')
    check('L8: the next candidate is tried: a builder page is skipped, a post where the plugin lands on the same words is offered',
      l.ok && l.type === 'internal_link' && l.pageUrl === `${SITE}/later/` && l.anchor === 'blog', JSON.stringify(l))
    const lM = mutPrev.mod ? await prev([`${SITE}/builder/`, `${SITE}/early/`, `${SITE}/later/`], 'blog', mutPrev.mod) : null
    check('MUTATION CONTROL: without the plugin\'s rules the builder page is offered (L8 catches it)', !!lM && lM.ok && lM.type === 'internal_link' && lM.pageUrl === `${SITE}/builder/`)
    check('L9: up to 10 candidates are asked for', searched.length > 0 && searched.every((x) => x.limit === 10))
    const t = await prev([`${SITE}/later/`], 'a keyword that is nowhere')
    check('L10: when the keyword is nowhere, the page\'s own title (without the site\'s name) is tried', t.ok && t.type === 'internal_link' && t.anchor === 'blog', JSON.stringify(t))
    check('L11: the words tried: the keyword, the title without the site name, the address\'s words; never under 3 letters',
      JSON.stringify(WPFIX.linkPhrases('travel', 'Japan travel guide | Shop', `${SITE}/japan-guide/`)) === JSON.stringify(['travel', 'Japan travel guide', 'japan guide'])
      && WPFIX.linkPhrases('ab', '', `${SITE}/x/`).length === 0)
    const mutV = mutant<typeof WPFIX>('lib/site-health/wordpress-fix.ts', "for (const raw of [keyword, title ? titleCore(title) : '', slugWords(url)]) {", 'for (const raw of [keyword]) {')
    check('MUTATION CONTROL: only the keyword (no title, no address words) is caught by L11', mutV.found && !!mutV.mod && mutV.mod.linkPhrases('travel', 'Japan travel guide | Shop', `${SITE}/japan-guide/`).length === 1)
  }

  // ── I) the four languages ─────────────────────────────────────────────────
  console.log('\nI) every new line in he, en, es and pt-BR')
  {
    const { getDashboardDictionary } = require('../../i18n/dashboard/getDashboardDictionary') as { getDashboardDictionary: (l: string) => { siteHealth: Record<string, unknown> & { autofix: { errors: Record<string, string> } } } }
    const missingIn = (dict: (l: string) => { siteHealth: Record<string, unknown> & { autofix: { errors: Record<string, string> } } }) => ['he', 'en', 'es', 'pt-BR'].flatMap((lang) => {
      const sh = dict(lang).siteHealth
      const lines: [string, unknown][] = [
        ['inProduct', sh.inProduct], ['inBuilder', sh.inBuilder], ['builder_page', sh.autofix.errors.builder_page],
        ['imagesInTheme', typeof sh.imagesInTheme === 'function' ? (sh.imagesInTheme as (n: number) => string)(3) : null],
        ['themeAlt', typeof sh.themeAlt === 'function' ? (sh.themeAlt as (p: number, i: number) => string)(4, 3) : null],
      ]
      return lines.filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => `${lang}.${k}`)
    })
    const gaps = missingIn(getDashboardDictionary)
    check('I1: the theme, product and builder notes, the site-wide line and the refusal exist in all four languages', gaps.length === 0, gaps.join(','))
    const en = getDashboardDictionary('en').siteHealth
    const he = getDashboardDictionary('he').siteHealth
    const esLine = (getDashboardDictionary('es').siteHealth.themeAlt as (p: number, i: number) => string)(4, 3)
    check('I2: each language has its own words (not the English line)', en.inBuilder !== he.inBuilder && esLine !== (en.themeAlt as (p: number, i: number) => string)(4, 3))
    const broken = (l: string) => { const d = getDashboardDictionary(l); return l === 'es' ? { siteHealth: { ...d.siteHealth, inBuilder: '' } } as never : d }
    check('MUTATION CONTROL: a language without one of them is caught by I1', missingIn(broken).includes('es.inBuilder'))
    const card = strip(read('components/site-health/FindingCard.tsx'))
    const shows = (src: string) => /copy\.themeAlt\(themeAlt\.pages, themeAlt\.images\)/.test(src) && /copy\[guidance\.note\]/.test(src) && /rowGuidance\(finding, page,/.test(src) && /copy\.imagesInTheme\(theme\)/.test(src)
    check('I3: the card shows the site-wide line once, and the product and builder notes on their rows', shows(card))
    check('MUTATION CONTROL: I3 fails on a card without the site-wide line', !shows(card.replace('copy.themeAlt(themeAlt.pages, themeAlt.images)', 'null')))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
export {}
