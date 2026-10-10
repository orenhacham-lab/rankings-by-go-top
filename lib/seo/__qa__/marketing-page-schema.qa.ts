/**
 * The marketing pages' structured data: one breadcrumb per page, the questions
 * the page shows declared as questions, one WebSite tied to the Organization,
 * and a price in the currency the reader is quoted.
 *
 * Run: npx tsx lib/seo/__qa__/marketing-page-schema.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { PLAN_CATALOG, PLAN_CODES } from '../../plans/catalog'
import { LOCALE_PREFIX, type PublicLocale } from '../../i18n/locales'
import { faqPageSchema, marketingBreadcrumbSchema, websiteSchema } from '../page-schema'
import { softwareOffer } from '../software-offer'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------- the builders

const faq = faqPageSchema([{ q: 'מה זה עולה?', a: 'החל מ-249 ש״ח לחודש.' }])
check('faqPageSchema is an FAQPage', faq?.['@type'] === 'FAQPage')
check('faqPageSchema carries the question', faq?.mainEntity[0]?.name === 'מה זה עולה?')
check('faqPageSchema carries the visible answer', faq?.mainEntity[0]?.acceptedAnswer.text === 'החל מ-249 ש״ח לחודש.')
check('faqPageSchema is null with no questions', faqPageSchema([]) === null)

const crumbHe = marketingBreadcrumbSchema('he', '/features/keyword-research', 'מחקר ביטויים')
check('breadcrumb has exactly the two pages that exist', crumbHe.itemListElement.length === 2)
check('breadcrumb step 1 is the Hebrew home', crumbHe.itemListElement[0].item === 'https://www.gotopseo.com')
check('breadcrumb step 2 is the page', crumbHe.itemListElement[1].item === 'https://www.gotopseo.com/features/keyword-research')
check('breadcrumb step 2 is named', crumbHe.itemListElement[1].name === 'מחקר ביטויים')

for (const locale of ['en', 'es', 'pt-BR'] as PublicLocale[]) {
  const crumb = marketingBreadcrumbSchema(locale, '/solutions/shopify', 'Shopify')
  check(`breadcrumb home is the ${locale} home, not the Hebrew one`, crumb.itemListElement[0].item === `https://www.gotopseo.com${LOCALE_PREFIX[locale]}`)
  check(`breadcrumb page is under /${locale}`, crumb.itemListElement[1].item === `https://www.gotopseo.com${LOCALE_PREFIX[locale]}/solutions/shopify`)
}

const site = websiteSchema('en', 'Go Top SEO — rank tracking and AI visibility.')
check('websiteSchema is a WebSite', site['@type'] === 'WebSite')
check('websiteSchema url follows the locale', site.url === 'https://www.gotopseo.com/en')
check('websiteSchema names the publishing Organization by id', site.publisher['@id'] === 'https://www.gotopseo.com/#organization')
// A search box Google no longer shows would be markup for a dead feature.
check('websiteSchema declares no SearchAction', !('potentialAction' in site))

const layout = stripComments(read('app/layout.tsx'))
check('the Organization declares the id the WebSite points at', layout.includes("'@id': 'https://www.gotopseo.com/#organization'"))
check('the layout emits the WebSite', /websiteSchema\(locale, schema\.description\)/.test(layout))

// ------------------------------------------------------------- the price range

const ils = PLAN_CODES.map((c) => PLAN_CATALOG[c].priceILS)
const usd = PLAN_CODES.map((c) => PLAN_CATALOG[c].priceUSD)
check('Hebrew is quoted in shekels', softwareOffer('he').priceCurrency === 'ILS')
check('Hebrew low price = cheapest shekel plan', softwareOffer('he').lowPrice === String(Math.min(...ils)))
check('Hebrew high price = dearest shekel plan', softwareOffer('he').highPrice === String(Math.max(...ils)))
for (const locale of ['en', 'es', 'pt-BR'] as PublicLocale[]) {
  const offer = softwareOffer(locale)
  check(`${locale} is quoted in dollars, like its pricing page`, offer.priceCurrency === 'USD')
  check(`${locale} low price = cheapest dollar plan`, offer.lowPrice === String(Math.min(...usd)))
  check(`${locale} high price = dearest dollar plan`, offer.highPrice === String(Math.max(...usd)))
}
check('the layout offer follows the language', /offers:\s*softwareOffer\(locale\)/.test(layout))
check('the layout url follows the language', /url:\s*localeHome,/.test(layout))

// ------------------------------------------------- every marketing page is placed

const PUBLIC = join(ROOT, 'app', '(public)')
const pageFiles = files(PUBLIC).filter((f) => stripComments(readFileSync(f, 'utf8')).includes('<FeaturePage'))
check(`every feature/solution page was found (${pageFiles.length})`, pageFiles.length >= 56)

const missing: string[] = []
const wrong: string[] = []
for (const file of pageFiles) {
  const src = stripComments(readFileSync(file, 'utf8'))
  const m = src.match(/<FeaturePage[^>]*\bpath="([^"]+)"/)
  if (!m) { missing.push(file.slice(ROOT.length + 1)); continue }
  const locale = (src.match(/<FeaturePage locale="([^"]+)"/)?.[1] ?? 'he') as PublicLocale
  // The route this file actually serves, minus its language prefix.
  const route = dirname(file).slice(PUBLIC.length)
  const expected = route.slice(LOCALE_PREFIX[locale].length)
  if (m[1] !== expected) wrong.push(`${file.slice(ROOT.length + 1)}: ${m[1]} ≠ ${expected}`)
}
check(`every page declares its path (missing: ${missing.join(', ')})`, missing.length === 0)
check(`every declared path is the route it serves (${wrong.join('; ')})`, wrong.length === 0)

const feature = stripComments(read('components/public/FeaturePage.tsx'))
check('FeaturePage emits the breadcrumb', /marketingBreadcrumbSchema\(locale, path,/.test(feature))
check('FeaturePage builds the FAQ from its own faq sections', /section\.kind === 'faq' \? section\.items/.test(feature))
check('a page with no path carries no trail rather than a wrong one', /path\s*\?\s*marketingBreadcrumbSchema/.test(feature))

check('the landing page declares its questions', /faqPageSchema\(copy\.faq\.items\)/.test(stripComments(read('components/public/LandingPage.tsx'))))
check('the pricing page declares its questions', /faqPageSchema\(c\.items\.map/.test(stripComments(read('components/public/pricing/PricingSections.tsx'))))

// ------------------------------------- one breadcrumb per page, never two

// The index's trail used to live in the articles LAYOUT, which wraps the
// segment, so every /articles/<slug> carried both it and the article's own
// three-step trail. It belongs to the index page alone.
const articleLayouts = ['', '/en', '/es', '/pt-BR'].map((p) => `app/(public)${p}/articles/layout.tsx`)
for (const rel of articleLayouts) {
  check(`${rel} does not emit the index trail onto every article`, !stripComments(read(rel)).includes('buildArticlesIndexSchema'))
}
check('the articles index emits its own trail', stripComments(read('components/public/articles/ArticlesIndex.tsx')).includes('buildArticlesIndexSchema(locale)'))

// --------------------------------------------- the home pages name themselves

for (const locale of ['en', 'es', 'pt-BR'] as const) {
  const page = stripComments(read(`app/(public)/${locale}/page.tsx`))
  check(`/${locale} declares its own canonical`, page.includes(`canonical: 'https://www.gotopseo.com/${locale}'`))
  // On the LAYOUT it would be inherited by every route under the prefix,
  // pointing the legal pages that declare none of their own at the home page.
  check(`/${locale} does not put the canonical on the language layout`, !stripComments(read(`app/(public)/${locale}/layout.tsx`)).includes('canonical'))
}

// ----------------------------------------------------- MUTATION CONTROLS

check('MUTATION CONTROL: a path that is not the route is caught', (() => {
  const src = '<FeaturePage locale="en" content={CONTENT} path="/features/wrong" />'
  const m = src.match(/<FeaturePage[^>]*\bpath="([^"]+)"/)
  return m?.[1] !== '/features/keyword-research'
})())
check('MUTATION CONTROL: a missing path prop is caught', !/<FeaturePage[^>]*\bpath="([^"]+)"/.test('<FeaturePage locale="he" content={CONTENT} />'))
check('MUTATION CONTROL: the layout offer going back to shekels-everywhere is caught', !/offers:\s*softwareOffer\(locale\)/.test('offers: SOFTWARE_OFFER,'))
check('MUTATION CONTROL: an index trail back in the layout is caught', stripComments("<script dangerouslySetInnerHTML={{ __html: jsonForScriptTag(buildArticlesIndexSchema('he')) }} />").includes('buildArticlesIndexSchema'))
check('MUTATION CONTROL: a commented-out trail does not count as present', !stripComments('// buildArticlesIndexSchema(locale)').includes('buildArticlesIndexSchema'))
check('MUTATION CONTROL: a canonical on the language layout is caught', stripComments("alternates: { canonical: 'https://www.gotopseo.com/en' }").includes('canonical'))

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
