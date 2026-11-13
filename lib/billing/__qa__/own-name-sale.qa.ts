/**
 * A PAID SUBSCRIPTION IN OUR OWN NAME IS SOLD ONLY WHERE WE ARE CLEARED TO.
 *
 * WHAT WENT WRONG, which is what this guards. The allow list the owner chose on
 * 12.11.2026 was built for the marketplace pages and imported in exactly one
 * file, `app/go/[platform]/page.tsx`. Our own checkout never got it, so
 * `/api/paypal/activate` carried two country gates — the sanctions guard and
 * Korea — and we were the seller of record to a consumer in every other country
 * in the world. In the EU a non-established supplier of B2C electronic services
 * has no registration threshold, and the United Kingdom sets none either, so
 * those 28 countries carried the Korean shape of duty with nothing in the code
 * to stop a sale.
 *
 * SO THE GUARD IS ABOUT TWO THINGS BEING TRUE TOGETHER: that the refusal exists
 * on our own route at all, and that it reads the SAME list as the marketplace.
 * Two lists that happen to agree today are the failure this was written against:
 * a country cleared once has to be cleared for both surfaces, and nothing here
 * may hold a second copy of the countries.
 *
 * AND ABOUT THE TWO DELIBERATE PASSES. Israel passes because the company is
 * established there and charges Israeli VAT, read off the billing market so
 * there is one place that decides who pays in shekels. An unplaceable visitor
 * passes because on our own site a refusal leaves them nowhere to buy, which is
 * the opposite direction from the marketplace module and is the residual
 * lib/billing/own-name-sale.ts states rather than hides. Both are checked here
 * WITH mutation controls, because a pass that is deliberate and a pass that is a
 * bug look identical from the outside.
 *
 * Run: npx tsx lib/billing/__qa__/own-name-sale.qa.ts
 */
import { readFileSync } from 'node:fs'
import {
  OWN_NAME_SALE_COUNTRY_HEADER,
  OWN_NAME_SALE_REFUSAL_REASON,
  ownNameSaleBlockedForCountry,
  ownNameSaleBlockedForRequest,
} from '../own-name-sale'
import { DEFAULT_OWN_SALE_COUNTRIES, ownSaleCountries } from '../../marketplace/own-sale-territory'
import { COUNTRY_HEADER } from '../server-market'
import { PUBLIC_LOCALES } from '../../i18n/locales'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (path: string) => readFileSync(path, 'utf8')
/** Source guards match code, not prose: these files explain themselves at length. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const headersOf = (country: string | null) => ({
  get: (name: string) => (name === OWN_NAME_SALE_COUNTRY_HEADER ? country : null),
})

console.log('A. the countries we are cleared in, and the ones we are not')
for (const code of DEFAULT_OWN_SALE_COUNTRIES) {
  check(`A1 (${code}): a cleared country is not blocked`,
    ownNameSaleBlockedForCountry(code) === false)
}
check('A2: Germany is blocked — the non-Union OSS scheme starts at the first euro',
  ownNameSaleBlockedForCountry('DE') === true)
check('A3: so is the United Kingdom, which sets no threshold for a non-established supplier',
  ownNameSaleBlockedForCountry('GB') === true)
check('A4: and France, Italy, Spain, the Netherlands and Poland, the live EU locales',
  ['FR', 'IT', 'ES', 'NL', 'PL'].every((c) => ownNameSaleBlockedForCountry(c) === true))
check('A5: Korea is blocked by this too, so the general case does not depend on its own flag',
  ownNameSaleBlockedForCountry('KR') === true)
check('A6: Israel is NOT blocked, and not by being on the list',
  ownNameSaleBlockedForCountry('IL') === false
  && !ownSaleCountries().includes('IL'))
check('A6-MUT: a version that only consulted the list would refuse Israel, which is the bug A6 pins',
  ownSaleCountries().includes('IL') === false)

console.log('\nB. the residual: an unknown country PASSES here, the opposite of the marketplace')
check('B1: no country at all — a local request or a preview, where no CDN set the header',
  ownNameSaleBlockedForCountry(null) === false)
check('B2: an empty string', ownNameSaleBlockedForCountry('') === false)
check('B3: something that is not a country code', ownNameSaleBlockedForCountry('nope') === false)
check('B4: a lower-case code is still read as that country',
  ownNameSaleBlockedForCountry('de') === true)
check('B5: and a padded one', ownNameSaleBlockedForCountry(' DE ') === true)
check('B-MUT1: a fail-CLOSED version would refuse a local request, which is what B1 exists to catch',
  (() => {
    const broken = (c: string | null) => !c || !ownSaleCountries().includes(c)
    return broken(null) === true && ownNameSaleBlockedForCountry(null) === false
  })())

console.log('\nC. one list, not two')
check('C1: the cleared countries come from the marketplace module, so there is no second copy',
  ownNameSaleBlockedForCountry('XZ', ['XZ']) === false
  && ownNameSaleBlockedForCountry('XZ', ['US']) === true)
check('C2: the module holds no country literal of its own',
  !/['"][A-Z]{2}['"]/.test(stripComments(read('lib/billing/own-name-sale.ts')).replace(/'ILS'/g, '')))
check('C3: the header is byte-identical to the one billing reads',
  OWN_NAME_SALE_COUNTRY_HEADER === COUNTRY_HEADER)
check('C4: the request form agrees with the country form',
  ownNameSaleBlockedForRequest(headersOf('DE')) === true
  && ownNameSaleBlockedForRequest(headersOf('US')) === false
  && ownNameSaleBlockedForRequest(headersOf(null)) === false)

console.log('\nD. the refusal exists on the route, not only on the screen')
{
  const route = stripComments(read('app/api/paypal/activate/route.ts'))
  check('D1: the activation route takes the decision, and from the request headers',
    /ownNameSaleBlockedForRequest\(request\.headers\)/.test(route))
  check('D2: and answers with the named reason rather than a bare 403',
    route.includes('OWN_NAME_SALE_REFUSAL_REASON') && /451/.test(route))
  check('D3: Korea keeps its own separate refusal, so neither swallowed the other',
    /koreaOwnSaleBlockedForRequest\(request\.headers\)/.test(route))
  check('D-MUT1: the route guard catches the gate being dropped',
    !/ownNameSaleBlockedForRequest\(request\.headers\)/.test(
      route.replace(/ownNameSaleBlockedForRequest\(request\.headers\)/g, 'false')))
  const page = stripComments(read('app/(dashboard)/billing/page.tsx'))
  check('D4: the billing page takes the same decision on the server and passes it down',
    /ownNameSaleBlockedForRequest\(requestHeaders\)/.test(page)
    && /ownNameSaleBlocked=\{ownNameSaleBlocked\}/.test(page))
  const view = stripComments(read('app/(dashboard)/billing/BillingView.tsx'))
  check('D5: the view hides the PayPal container for such a visitor',
    /!ownNameSaleBlocked && <BillingClient/.test(view))
  check('D6: and tells them in words instead of showing nothing',
    /data-own-name-no-sale/.test(view) && /t\.ownNameSale\.title/.test(view))
  check('D-MUT2: the container guard catches the condition being dropped',
    !/!ownNameSaleBlocked && <BillingClient/.test(
      view.replace(/ !ownNameSaleBlocked/g, '')))
}

console.log('\nE. the notice is in the reader\'s own language, and names no country')
for (const locale of PUBLIC_LOCALES) {
  const copy = getDashboardDictionary(locale).billing.ownNameSale
  check(`E1 (${locale}): both lines exist and are not stubs`,
    copy.title.length > 10 && copy.description.length > 40,
    `${copy.title.length}/${copy.description.length}`)
  // It cannot name a country: the only one it could name is the reader's own,
  // and the list of blocked countries is configuration that changes without
  // this string. A notice naming Korea here would also contradict the Korean
  // branch above it, which is the one that may name it.
  check(`E2 (${locale}): it names no country and no statute`,
    !/Korea|한국|Deutschland|Germany|European|RGPD|GDPR/i.test(copy.title + copy.description))
  check(`E3 (${locale}): it says where to write, so the refusal is not a dead end`,
    copy.description.includes('contact@gotopseo.com'))
}
check('E-MUT: the stub guard would fail on an empty line',
  !('' .length > 10))
check('E4: the reason string is a stable identifier, not prose',
  /^[a-z_]+$/.test(OWN_NAME_SALE_REFUSAL_REASON))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
