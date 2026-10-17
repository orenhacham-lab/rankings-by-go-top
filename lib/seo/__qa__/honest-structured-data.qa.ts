/**
 * Structured data on gotopseo.com claims nothing that is not true: no made-up
 * review rating, and the price offer is the real plan range from the catalog.
 * Run: npx tsx lib/seo/__qa__/honest-structured-data.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PLAN_CATALOG, PLAN_CODES } from '../../plans/catalog'
import { SOFTWARE_OFFER, softwareOffer } from '../software-offer'

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
check('layout uses the catalog offer, in the visitor\'s currency', /offers:\s*softwareOffer\(market\)/.test(layout))
check('/api/schema uses the catalog offer', /offers:\s*SOFTWARE_OFFER/.test(schemaRoute))
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

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
