/**
 * STRUCTURED DATA IN ANY FORM, AND A REASON ON EVERY STORE ROW WITHOUT A FIX.
 *
 *   A) schema.org declared as microdata (itemscope itemtype) or RDFa (typeof, vocab) counts as
 *      structured data, the way JSON-LD always did. Many Shopify themes emit microdata only, and
 *      such a store read "pages without structured data" on every page.
 *   B) What reads schemaTypes keeps its meaning: the site-health rule, the free check's findings and
 *      AI-readiness signal, and the seed crawl's page kind (which reads JSON-LD only, so a theme's
 *      microdata product cards never make a home page a product).
 *   C) On a Shopify store a "no structured data" row has no "Open in Shopify": it comes from the
 *      theme, so the row says so instead, and promises nothing Go Top does.
 *   D) A store's product and collection rows say why they are fixed in Shopify, once, in the same
 *      words as the product-photo note; never a scope name.
 *   E) Every line in every dashboard language (the list is lib/i18n/locales.ts PUBLIC_LOCALES).
 *
 * Each guard has a MUTATION CONTROL that breaks the code on purpose and shows the guard fails.
 *
 * Run: npx tsx lib/site-health/__qa__/shopify-row-notes.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { extractSiteSignals, type SiteSignals } from '@/lib/free-check/html-signals'
import { buildFindings as freeFindings, buildGeoSignals } from '@/lib/free-check/findings'
import { buildFindings } from '@/lib/site-health/rules'
import { rowGuidance } from '@/lib/site-health/row-note'
import type { Finding, FindingPage, PageFacts } from '@/lib/site-health/types'
import { wpTypeHint } from '@/lib/seed-scan/crawl'
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
  const dir = mkdtempSync(join(tmpdir(), 'shopify-row-notes-mutant-'))
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

const SITE = 'https://shop.example.org'
const signals = (html: string, extract = extractSiteSignals) => extract(html, `${SITE}/`, { robotsTxt: null, llmsTxt: false })

// A Dawn-era theme: microdata only, no JSON-LD at all.
const MICRODATA = `<!doctype html><html><head><title>Boots</title></head><body>
<header itemscope itemtype="http://schema.org/Organization"><a itemprop="url" href="/">Shop</a></header>
<nav itemscope itemtype="https://www.schema.org/BreadcrumbList"><span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">Home</span></nav>
<article itemscope itemtype="https://schema.org/Article/"><h1 itemprop="headline">Care guide</h1></article>
<div itemscope itemtype="HTTPS://SCHEMA.ORG/Product"><div itemprop="offers" itemscope itemtype="https://schema.org/Offer"></div></div>
<div itemscope itemtype="https://data-vocabulary.org/Breadcrumb"></div>
<script>if (typeof window.x === 'undefined') { var s = ' itemtype="https://schema.org/Recipe"' }</script>
<p>Text that says itemtype="https://schema.org/Event" is not markup.</p>
</body></html>`

const RDFA = `<html vocab="https://schema.org/"><body>
<div typeof="BlogPosting"><span property="author" typeof="Person">A</span></div>
<div typeof="schema:Organization foaf:Organization"></div>
<div typeof="http://schema.org/FAQPage"></div>
</body></html>`

const RDFA_OTHER_VOCAB = `<html><body><div typeof="sioc:Item foaf:Document"></div><div typeof="Article"></div></body></html>`

const JSONLD_AND_MICRODATA = `<html><head><script type="application/ld+json">{"@type":"Organization"}</script></head>
<body><div itemscope itemtype="https://schema.org/Organization"></div><div itemscope itemtype="https://schema.org/Product"></div></body></html>`

const page = (path: string, over: Partial<PageFacts> = {}): PageFacts => ({
  url: `${SITE}${path}`, kind: 'page', ok: true, status: 200, title: 'A good title for this page here', description: 'd'.repeat(120),
  h1: ['One'], images: { total: 0, missingAlt: 0 }, noindex: false, viewport: true, links: [], adminUrl: null, canonical: `${SITE}${path}`, faq: true, ...over,
})
const SITE_FACTS = { siteUrl: `${SITE}/`, homeReachable: true, robots: { blocksAll: false, blocksAi: false, blockedBots: [], readable: true }, sitemapFound: true, brokenLinks: [], orphanPages: [], llmsFound: true }
const CTX = { platform: 'shopify' as const, connections: { shopify: true, wordpress: false, wix: false } }

function main() {
  console.log('A) microdata and RDFa count as structured data')
  const m = signals(MICRODATA)
  const has = (s: SiteSignals, ...t: string[]) => t.every((x) => s.schemaTypes.includes(x))
  check('A1: microdata types are read, http and https, with and without www, any case, trailing slash', has(m, 'Organization', 'BreadcrumbList', 'Article', 'Product'), JSON.stringify(m.schemaTypes))
  check('A2: only top-level items count (an itemprop item is part of its parent, like a nested JSON-LD object)', !m.schemaTypes.includes('Offer') && !m.schemaTypes.includes('ListItem'), JSON.stringify(m.schemaTypes))
  check('A3: another vocabulary, a script and body text are not structured data', !m.schemaTypes.some((t) => ['Breadcrumb', 'Recipe', 'Event'].includes(t)), JSON.stringify(m.schemaTypes))
  check('A4: the JSON-LD list stays JSON-LD only', Array.isArray(m.jsonLdTypes) && m.jsonLdTypes.length === 0)
  const r = signals(RDFA)
  check('A5: RDFa: a bare type under vocab=schema.org, schema:Type, and a full IRI', has(r, 'BlogPosting', 'Organization', 'FAQPage'), JSON.stringify(r.schemaTypes))
  check('A6: RDFa: a nested (property) item and a foaf: type do not count', !r.schemaTypes.includes('Person') && !r.schemaTypes.some((t) => t.includes(':')), JSON.stringify(r.schemaTypes))
  const o = signals(RDFA_OTHER_VOCAB)
  check('A7: RDFa without the schema.org vocabulary is not schema.org', o.schemaTypes.length === 0, JSON.stringify(o.schemaTypes))
  const both = signals(JSONLD_AND_MICRODATA)
  check('A8: JSON-LD and microdata are merged and deduplicated', both.schemaTypes.filter((t) => t === 'Organization').length === 1 && both.schemaTypes.includes('Product') && JSON.stringify(both.jsonLdTypes) === '["Organization"]', JSON.stringify(both))
  const hostile = '<div x itemtype=' .repeat(150_000) + ' typeof='.repeat(150_000)
  const t0 = Date.now()
  const h = signals(hostile)
  check('A9: hostile markup (unclosed tags, attributes outside tags) stays fast and finds nothing', Date.now() - t0 < 3_000 && h.schemaTypes.length === 0, `${Date.now() - t0} ms`)

  console.log('\nB) what reads schemaTypes keeps its meaning')
  const findingsFor = (types: string[]) => buildFindings(SITE_FACTS, [page('/', { kind: 'home', schemaTypes: types }), page('/pages/about', { schemaTypes: types })], CTX)
  check('B1: a page with microdata only no longer reads "no structured data"', !findingsFor(m.schemaTypes).some((f) => f.id === 'schema_missing'))
  check('B2: a page with none still does', findingsFor([]).some((f) => f.id === 'schema_missing'))
  check('B3: free check: Organization microdata is business structured data (no "no_schema" finding, AI-readiness passes)',
    m.hasOrganizationSchema && !freeFindings(m, 'en').some((f) => f.id === 'no_schema') && buildGeoSignals(m, 'en').find((g) => g.id === 'schema')?.ok === true)
  check('B4: free check: FAQPage in RDFa is FAQ structured data', r.hasFaqSchema && r.hasFaqSection)
  check('B5: free check: a page with no structured data still gets the finding', freeFindings(signals('<html><body><p>x</p></body></html>'), 'en').some((f) => f.id === 'no_schema'))
  check('B6: the contact block is still read from JSON-LD only', m.contact.address === null && m.contact.phone === null)
  // A home page whose theme marks its product cards up as microdata is still a page to the crawl.
  check('B7: the crawl reads the kind from JSON-LD, so microdata product cards do not make a page a product',
    wpTypeHint(m.jsonLdTypes ?? m.schemaTypes, 'other') === 'page' && wpTypeHint(m.schemaTypes, 'other') === 'product')
  const stepsB = strip(read('lib/seed-scan/steps-b.ts'))
  const crawlReadsJsonLd = (src: string) => /schemaTypes: signals\.jsonLdTypes \?\? signals\.schemaTypes/.test(src) && /schemaTypes: stored\.jsonLdTypes \?\? stored\.schemaTypes/.test(src)
  check('B8: the seed crawl hands wpTypeHint the JSON-LD types (fresh and stored home page)', crawlReadsJsonLd(stepsB))
  check('MUTATION CONTROL: B8 fails when the crawl takes every type', !crawlReadsJsonLd(stepsB.replace('signals.jsonLdTypes ?? signals.schemaTypes', 'signals.schemaTypes')))
  const noMarkup = mutant<typeof import('@/lib/free-check/html-signals')>('lib/free-check/html-signals.ts', '...markupTypes(clean)', '')
  const mm = noMarkup.mod ? signals(MICRODATA, noMarkup.mod.extractSiteSignals) : null
  check('MUTATION CONTROL: with JSON-LD only (the old reading) A1 and B1 fail', noMarkup.found && !!mm && !has(mm, 'Product') && findingsFor(mm.schemaTypes).some((f) => f.id === 'schema_missing'))
  const nested = mutant<typeof import('@/lib/free-check/html-signals')>('lib/free-check/html-signals.ts', "attrOf(tag, 'itemprop') === null", 'true')
  check('MUTATION CONTROL: counting nested items is caught by A2', nested.found && !!nested.mod && signals(MICRODATA, nested.mod.extractSiteSignals).schemaTypes.includes('Offer'))

  console.log('\nC) structured data on a store: the theme\'s, and no admin link')
  const f = (id: Finding['id']): Pick<Finding, 'id'> => ({ id })
  const row = (over: Partial<FindingPage> = {}): Pick<FindingPage, 'kind' | 'outside' | 'adminUrl'> => ({ kind: 'article', adminUrl: 'https://s.myshopify.com/admin/articles/1', ...over })
  const store = { platform: 'shopify' as const, storeConnected: true }
  const schemaRow = rowGuidance(f('schema_missing'), row(), store)
  check('C1: a store\'s "no structured data" article row: the theme note, and no "Open in Shopify"', schemaRow.note === 'schemaFromTheme' && schemaRow.adminLink === false)
  check('C2: the same on its home page and a page, connected or not', rowGuidance(f('schema_missing'), row({ kind: 'home', adminUrl: null }), store).note === 'schemaFromTheme'
    && rowGuidance(f('schema_missing'), row({ kind: 'page' }), { platform: 'shopify', storeConnected: false }).adminLink === false)
  check('C3: other findings on the same article keep their admin link', rowGuidance(f('title_long'), row(), store).adminLink === true && rowGuidance(f('title_long'), row(), store).note === null)
  check('C4: WordPress keeps its rows as they were (no store note)', rowGuidance(f('schema_missing'), row({ adminUrl: null }), { platform: 'wordpress', storeConnected: false }).note === null)
  const noSchemaRule = mutant<typeof import('@/lib/site-health/row-note')>('lib/site-health/row-note.ts', "if (shopify && finding.id === 'schema_missing') return { note: 'schemaFromTheme', adminLink: false }", '')
  check('MUTATION CONTROL: without the rule the schema row links to Shopify again (C1 fails)', noSchemaRule.found && !!noSchemaRule.mod && noSchemaRule.mod.rowGuidance(f('schema_missing'), row(), store).adminLink === true)

  console.log('\nD) product and collection rows say why, once')
  const product = rowGuidance(f('title_long'), row({ kind: 'product', adminUrl: 'https://s.myshopify.com/admin/products/1' }), store)
  const collection = rowGuidance(f('description_missing'), row({ kind: 'collection', adminUrl: 'https://s.myshopify.com/admin/collections/1' }), store)
  check('D1: a product row: the product note, and it keeps "Open in Shopify"', product.note === 'productPage' && product.adminLink)
  check('D2: a collection row: the collection note, and it keeps "Open in Shopify"', collection.note === 'collectionPage' && collection.adminLink)
  check('D3: a product\'s own photos: the photo note only (not a second product line)', rowGuidance(f('images_alt'), row({ kind: 'product', outside: 'product' }), store).note === 'inProduct')
  check('D4: a collection\'s photos read as a collection row', rowGuidance(f('images_alt'), row({ kind: 'collection', outside: 'product' }), store).note === 'collectionPage')
  check('D5: theme and builder rows keep their notes', rowGuidance(f('images_alt'), row({ outside: 'theme' }), store).note === 'inTheme' && rowGuidance(f('images_alt'), row({ outside: 'builder' }), { platform: 'wordpress', storeConnected: false }).note === 'inBuilder')
  check('D6: a broken link row and an unconnected store say nothing about the store\'s access', rowGuidance(f('broken_links'), row({ kind: 'product' }), store).note === null
    && rowGuidance(f('title_long'), row({ kind: 'product', adminUrl: null }), { platform: 'shopify', storeConnected: false }).note === null)
  check('D7: a WooCommerce product says nothing about a store', rowGuidance(f('title_long'), row({ kind: 'product', adminUrl: null }), { platform: 'wordpress', storeConnected: false }).note === null)
  const noProductNote = mutant<typeof import('@/lib/site-health/row-note')>('lib/site-health/row-note.ts', "if (page.kind === 'product') return { note: 'productPage', adminLink }", '')
  check('MUTATION CONTROL: without the product line D1 fails', noProductNote.found && !!noProductNote.mod && noProductNote.mod.rowGuidance(f('title_long'), row({ kind: 'product' }), store).note === null)

  const card = strip(read('components/site-health/FindingCard.tsx'))
  const cardOk = (src: string) => /const guidance = rowGuidance\(finding, page, \{ platform, storeConnected \}\)/.test(src)
    && /guidance\.adminLink && page\.adminUrl \?/.test(src)
    && (src.match(/copy\[guidance\.note\]/g) ?? []).length === 1
    && !/copy\.(inProduct|inTheme|inBuilder|productPage|collectionPage|schemaFromTheme)\b/.test(src)
  check('D8: the card renders one note per row from rowGuidance, and the admin link only where it allows', cardOk(card))
  check('MUTATION CONTROL: D8 fails on a card that links to Shopify regardless', !cardOk(card.replace('guidance.adminLink && page.adminUrl ?', 'page.adminUrl ?')))
  check('MUTATION CONTROL: D8 fails on a card that adds a second, direct note', !cardOk(card.replace('{copy[guidance.note]}', '{copy[guidance.note]}{copy.inProduct}')))
  const screen = strip(read('components/site-health/SiteHealthScreen.tsx'))
  check('D9: the screen tells the card whether the store is connected', /storeConnected=\{!!report\.connections\?\.shopify\}/.test(screen))

  console.log('\nE) every dashboard language')
  const KEYS = ['schemaFromTheme', 'productPage', 'collectionPage', 'inProduct'] as const
  type Lines = Record<(typeof KEYS)[number], string>
  const linesOf = (l: (typeof PUBLIC_LOCALES)[number]) => getDashboardDictionary(l).siteHealth as unknown as Lines
  const gapsIn = (get: typeof linesOf) => PUBLIC_LOCALES.flatMap((l) => KEYS.filter((k) => typeof get(l)[k] !== 'string' || !get(l)[k].trim()).map((k) => `${l}.${k}`))
  check('E1: the lines exist in every dashboard language', PUBLIC_LOCALES.length >= 4 && gapsIn(linesOf).length === 0, gapsIn(linesOf).join(','))
  // es and pt-BR lay over English: a missing line would silently read English, so each must be its own.
  const english = linesOf('en')
  const borrowed = PUBLIC_LOCALES.filter((l) => l !== 'en').flatMap((l) => KEYS.filter((k) => linesOf(l)[k] === english[k]).map((k) => `${l}.${k}`))
  check('E2: each language has its own words, not the English line', borrowed.length === 0, borrowed.join(','))
  const broken = (l: (typeof PUBLIC_LOCALES)[number]) => (l === 'pt-BR' ? { ...linesOf(l), productPage: '' } : linesOf(l))
  check('MUTATION CONTROL: a language without a line is caught by E1', gapsIn(broken).includes('pt-BR.productPage'))
  const SCOPE = /scope|read_|write_|_content|_products|API|permiss|הרשא|permis/i
  const scoped = PUBLIC_LOCALES.flatMap((l) => KEYS.filter((k) => SCOPE.test(linesOf(l)[k])).map((k) => `${l}.${k}`))
  check('E3: no scope or permission name reaches a merchant', scoped.length === 0, scoped.join(','))
  check('MUTATION CONTROL: a scope name is caught by E3', SCOPE.test('Go Top has write_content on the store'))
  // The theme note states where structured data is added; it never says Go Top adds it.
  const PROMISE = /Go Top|\bwe\b|\bour\b|אנחנו|נוסיף|שלנו|nosotros|añadiremos|nós|adicionaremos/i
  const promises = PUBLIC_LOCALES.filter((l) => PROMISE.test(linesOf(l).schemaFromTheme)).map((l) => l)
  check('E4: the structured-data note promises nothing Go Top does', promises.length === 0, promises.join(','))
  check('MUTATION CONTROL: a promise is caught by E4', PROMISE.test('Go Top adds it for you on Shopify') && PROMISE.test('אנחנו נוסיף סימון מובנה'))
  const THEME = /theme|תבנית|tema/i
  check('E5: the structured-data note names the theme in every language', PUBLIC_LOCALES.every((l) => THEME.test(linesOf(l).schemaFromTheme)))
  // The product, collection and photo notes give the same reason in the same words.
  const reasonOf = (s: string) => s.slice(s.indexOf('Go Top'))
  const inconsistent = PUBLIC_LOCALES.filter((l) => {
    const d = linesOf(l)
    const reason = reasonOf(d.productPage)
    return !d.productPage.includes('Go Top') || reasonOf(d.collectionPage) !== reason || !d.inProduct.endsWith(reason)
  })
  check('E6: product, collection and photo notes share one reason, word for word', inconsistent.length === 0, inconsistent.join(','))
  check('MUTATION CONTROL: a photo note with the old reason is caught by E6', !"These are the product's own photos. Their descriptions are set on the product (in its media), and we never change products, so there is no automatic fix here. The steps below show how to fix it.".endsWith(reasonOf(english.productPage)))
  const legacy = PUBLIC_LOCALES.filter((l) => /we never change products|nunca cambiamos productos|nunca alteramos produtos|ואנחנו לא משנים מוצרים/.test(linesOf(l).inProduct))
  check('E7: the old "we never change products" photo note is gone everywhere', legacy.length === 0, legacy.join(','))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
export {}
