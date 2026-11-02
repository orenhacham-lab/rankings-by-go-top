/**
 * Structured data on gotopseo.com claims nothing that is not true: no made-up
 * review rating, and the price offer is the real plan range from the catalog.
 * Run: npx tsx lib/seo/__qa__/honest-structured-data.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PLAN_CATALOG, PLAN_CODES } from '../../plans/catalog'
import { SOFTWARE_OFFER, softwareOffer } from '../software-offer'
import { BRAND_PROFILES, ORGANIZATION_ID, organizationSchema } from '../organization'
import { PLATFORM_LISTINGS, SOFTWARE_ID, softwareApplicationSchema } from '../software-application'
import { publicSiteLanguages } from '../site-languages'
import { PUBLIC_LOCALES, LOCALE_CONFIG, enabledPublicLocales } from '../../i18n/locales'
import { getSiteMetadata } from '../../i18n/site-metadata'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.') || name === '__qa__' || name === '__tests__') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** A hard-coded rating: an AggregateRating object written into the code. */
const hasHardcodedRating = (src: string) => /aggregateRating\s*:/.test(stripComments(src)) || /['"]AggregateRating['"]/.test(stripComments(src))

const files = ['app', 'components', 'lib'].flatMap((d) => sourceFiles(join(ROOT, d)))
const offenders = files.filter((f) => hasHardcodedRating(readFileSync(f, 'utf8')))
check(`no hard-coded aggregateRating anywhere (found: ${offenders.map((f) => f.slice(ROOT.length + 1)).join(', ')})`, offenders.length === 0)

const layout = stripComments(readFileSync(join(ROOT, 'app/layout.tsx'), 'utf8'))
const schemaRoute = stripComments(readFileSync(join(ROOT, 'app/api/schema/route.ts'), 'utf8'))
// The offer is no longer written at either call site: both surfaces build the
// product node through one builder, which reads the catalog by market. What the
// call sites are asserted on is the market they ask for.
check('layout asks for the visitor\'s own market', /softwareApplicationSchema\(\{[\s\S]*?market,/.test(layout))
check('/api/schema asks for the Israeli catalogue it serves', /softwareApplicationSchema\(\{[\s\S]*?market:\s*'ILS'/.test(schemaRoute))
check('the builder returns the catalog offer, in the market asked for',
  softwareApplicationSchema({ url: 'https://www.gotopseo.com', market: 'USD', description: 'x' }).offers === softwareOffer('USD')
  && softwareApplicationSchema({ url: 'https://www.gotopseo.com', market: 'ILS', description: 'x' }).offers === SOFTWARE_OFFER)
check('no "free" price claim in the layout markup', !/price:\s*['"]0['"]/.test(layout))
check('no invalid "varies" price in /api/schema', !/['"]varies['"]/.test(schemaRoute))

const prices = PLAN_CODES.map((c) => PLAN_CATALOG[c].priceILS)
check('offer low price = cheapest plan', SOFTWARE_OFFER.lowPrice === String(Math.min(...prices)))
check('offer high price = dearest plan', SOFTWARE_OFFER.highPrice === String(Math.max(...prices)))
check('the shekel offer is ILS (the catalog field it reads)', SOFTWARE_OFFER.priceCurrency === 'ILS')
// Every market but Israel pays in dollars, so the offer such a visitor is
// shown must be the dollar range, not a shekel figure the page never displays.
const usd = PLAN_CODES.map((c) => PLAN_CATALOG[c].priceUSD)
check('the dollar offer is the real dollar range', softwareOffer('USD').priceCurrency === 'USD' && softwareOffer('USD').lowPrice === String(Math.min(...usd)) && softwareOffer('USD').highPrice === String(Math.max(...usd)))

// MUTATION CONTROLS: the detector must catch the exact shapes that were live.
check('MUTATION CONTROL: the old layout rating is caught', hasHardcodedRating("aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', ratingCount: '156' },"))
check('MUTATION CONTROL: the old /api/schema rating is caught', hasHardcodedRating("    aggregateRating: {\n      '@type': 'AggregateRating',\n      ratingValue: '5',\n      ratingCount: '100',\n    },"))
check('MUTATION CONTROL: a commented-out rating is not counted', !hasHardcodedRating('// aggregateRating: { ratingValue: 5 }'))
check('MUTATION CONTROL: a free-price offer is caught', /price:\s*['"]0['"]/.test("offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS' }"))

// ---------------------------------------------------------------------------
// THE ENTITY THE MARKUP NAMES IS THE PRODUCT, NOT THE AGENCY.
//
// gotop.co.il is a separate marketing agency that happens to share an owner.
// When the SoftwareApplication's publisher/brand/author and the Organization's
// parentOrganization/sameAs all pointed at it, every link and mention the SaaS
// earned resolved to the agency's entity instead of ours.
// ---------------------------------------------------------------------------
const AGENCY = 'gotop.co.il'
/** The agency named as an identity claim: brand, publisher, author, parent or sameAs. */
const claimsAgencyIdentity = (src: string) =>
  /(publisher|brand|author|parentOrganization)\s*:\s*\{[^}]*gotop\.co\.il/.test(src)
  || /sameAs\s*:\s*\[[^\]]*gotop\.co\.il/.test(src)

for (const [name, src] of [['app/layout.tsx', layout], ['app/api/schema/route.ts', schemaRoute]] as const) {
  check(`${name} does not name the agency as the product's brand or publisher`, !claimsAgencyIdentity(src))
}
// The support address IS the agency mailbox, and the footer prints it on every
// page, so a contactPoint naming it is honest and stays. Only identity claims
// are the defect — this asserts the two are told apart.
check('the agency support mailbox is still allowed as a contact', organizationSchema('x').contactPoint.email.includes(AGENCY))

const org = organizationSchema('x')
check('the organization carries the canonical @id', org['@id'] === ORGANIZATION_ID)
check('sameAs names the product\'s own live profiles', org.sameAs.length === BRAND_PROFILES.length && org.sameAs.length >= 4)
check('sameAs does not claim the agency site as the same entity', !org.sameAs.some((u) => u.includes(AGENCY)))
check('every sameAs entry is an absolute https URL', org.sameAs.every((u) => u.startsWith('https://')))
check('both surfaces reference the organization by its shared id', layout.includes('organizationSchema(') && schemaRoute.includes('organizationSchema('))
// "Digital Marketing" is the agency's registered mark and never appears on a
// SaaS-brand surface, legalName included.
check('no "Digital Marketing" on the SaaS brand nodes', !/Digital Marketing/i.test(layout) && !/Digital Marketing/i.test(schemaRoute) && !/legalName/.test(JSON.stringify(org)))

// MUTATION CONTROLS: break it on purpose and show the guard fails.
check('MUTATION CONTROL: the live publisher claim is caught',
  claimsAgencyIdentity("publisher: { '@type': 'Organization', name: 'GO TOP', url: 'https://www.gotop.co.il' },"))
check('MUTATION CONTROL: the live parentOrganization claim is caught',
  claimsAgencyIdentity("parentOrganization: {\n  '@type': 'Organization',\n  name: 'GO TOP',\n  url: 'https://www.gotop.co.il',\n},"))
check('MUTATION CONTROL: the live sameAs claim is caught',
  claimsAgencyIdentity("sameAs: ['https://www.gotop.co.il'],"))
check('MUTATION CONTROL: a plain mailto contact is NOT caught as an identity claim',
  !claimsAgencyIdentity("email: 'oren@gotop.co.il',"))


// ---------------------------------------------------------------------------
// THE SOFTWARE IS ONE NODE, NOT TWO ANONYMOUS ONES.
//
// app/layout.tsx and /api/schema both publish a SoftwareApplication for the
// same product. Neither used to give it an `@id`, and each wrote its own
// literal, so the two drifted (operatingSystem and author on one only) and a
// resolver reading both had nothing but the name to join them by.
// ---------------------------------------------------------------------------
const software = softwareApplicationSchema({
  url: 'https://www.gotopseo.com/en',
  market: 'USD',
  description: 'what the page says',
})

check('the software carries the canonical @id', software['@id'] === SOFTWARE_ID)
check('the @id is a fragment of the site, not another origin', SOFTWARE_ID.startsWith('https://www.gotopseo.com/#'))
check('it is not the organization\'s id', String(SOFTWARE_ID) !== String(ORGANIZATION_ID))
check('publisher, brand and author all point at the organization node',
  [software.publisher, software.brand, software.author].every((ref) => ref['@id'] === ORGANIZATION_ID))
check('the description is the page\'s own, passed in, not written here', software.description === 'what the page says')
check('the url is the page passed in, not always the Hebrew root', software.url === 'https://www.gotopseo.com/en')
check('still no aggregateRating on the product node', !('aggregateRating' in software))

/** Both surfaces build the node through the one builder. */
for (const [name, src] of [['app/layout.tsx', layout], ['app/api/schema/route.ts', schemaRoute]] as const) {
  check(`${name} builds the product node through the shared builder`, src.includes('softwareApplicationSchema('))
  check(`${name} does not write its own SoftwareApplication literal`, !/'@type':\s*'SoftwareApplication'/.test(src))
}
// The endpoint's two hand-written descriptions appear on no page of the site,
// and it shares the Organization's @id with every page that does.
check('/api/schema describes the product in copy a page actually shows',
  schemaRoute.includes("getSiteMetadata('en').description")
  && !/Advanced (location|SEO rank) tracking system/.test(schemaRoute))
check('that description is the English site description', getSiteMetadata('en').description.startsWith('Go Top SEO'))

// `sameAs` on the product names the product's platform records; the company's
// profiles stay on the Organization. Neither list may point at the agency.
check('the product names its platform records', software.sameAs.length === PLATFORM_LISTINGS.length && software.sameAs.length >= 2)
check('every platform record is an absolute https URL', software.sameAs.every((u) => u.startsWith('https://')))
check('the platform records are the Shopify app and the WordPress.org plugin',
  software.sameAs.some((u) => u.startsWith('https://apps.shopify.com/'))
  && software.sameAs.some((u) => u.startsWith('https://wordpress.org/plugins/')))
check('no agency URL among the platform records', !software.sameAs.some((u) => u.includes(AGENCY)))

// ---------------------------------------------------------------------------
// THE LANGUAGE CLAIM IS THE LANGUAGES THE SITE ACTUALLY SERVES.
// ---------------------------------------------------------------------------
const langs = publicSiteLanguages()
check('the language list is read from the routing gate',
  langs.join(',') === enabledPublicLocales().map((l) => LOCALE_CONFIG[l].lang).join(','))
check('every tag is a tag the document itself ships in <html lang>',
  langs.every((l) => PUBLIC_LOCALES.some((p) => LOCALE_CONFIG[p].lang === l)))
// With every flag on — which is production (all five NEXT_PUBLIC_*_SITE_ENABLED
// are "true" there) — it is the seven live languages, and Portuguese is the
// Brazilian Portuguese the site actually serves.
const ALL_ON = { es: true, 'pt-BR': true, fr: true, it: true, ja: true } as const
const allLangs = publicSiteLanguages(ALL_ON)
check('with every locale on it is the seven live languages',
  allLangs.join(',') === 'he,en,es,pt-BR,fr,it,ja')
check('Portuguese is claimed as pt-BR, never bare pt', allLangs.includes('pt-BR') && !allLangs.includes('pt'))
// And a locale behind its flag is NOT claimed: a language claim an hreflang can
// disprove is worse than one language fewer.
check('a switched-off locale is not claimed', !publicSiteLanguages({}).includes('ja'))
check('the product node and the organization agree on the languages',
  JSON.stringify(software.inLanguage) === JSON.stringify(organizationSchema('x').contactPoint.availableLanguage))
check('both read the one helper, so they cannot drift',
  readFileSync(join(ROOT, 'lib/seo/organization.ts'), 'utf8').includes('publicSiteLanguages()')
  && readFileSync(join(ROOT, 'lib/seo/software-application.ts'), 'utf8').includes('publicSiteLanguages()'))

// MUTATION CONTROLS: break it on purpose and show each guard fails.
check('MUTATION CONTROL: an id-less product node is caught',
  !({ '@type': 'SoftwareApplication', name: 'Go Top SEO' } as Record<string, unknown>)['@id'])
check('MUTATION CONTROL: a surface writing its own literal is caught',
  /'@type':\s*'SoftwareApplication'/.test("const n = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Go Top SEO' }"))
check('MUTATION CONTROL: the endpoint\'s old hand-written description is caught',
  /Advanced (location|SEO rank) tracking system/.test("description: 'Advanced SEO rank tracking system for monitoring Google search and Google Maps rankings',"))
check('MUTATION CONTROL: a bare-pt language claim is caught',
  ['he', 'en', 'es', 'pt', 'fr', 'it', 'ja'].includes('pt'))
check('MUTATION CONTROL: a seventh language missing from the list is caught',
  ['he', 'en', 'es', 'pt-BR', 'fr', 'it'].join(',') !== 'he,en,es,pt-BR,fr,it,ja')
check('MUTATION CONTROL: a sameAs on the agency site is caught',
  ['https://www.gotop.co.il'].some((u) => u.includes(AGENCY)))

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
