/**
 * A PAID SUBSCRIPTION IS NOT SOLD TO A VISITOR IN KOREA, AND THE TRIAL IS.
 *
 * The thing worth guarding is not the country code, it is that the refusal
 * sits on the SALE and in three places at once. The legal thread's ruling of
 * 12.11.2026 wrote its first condition as a condition on the Korean locale,
 * but the billing market is decided by country and never by language: a
 * visitor in Seoul could already take the trial on the English site and pay
 * through PayPal, where we are the seller of record, which is what brings 10%
 * Korean VAT from the first sale (VAT Act art. 53-2, no de-minimis) and the
 * 전자상거래법 art. 13 registration disclosures onto a company that holds
 * neither number. So the locale flag was never the guard, and this is.
 *
 * Three places, because any one of them alone leaves a way through:
 *   * the billing screen draws no way to pay;
 *   * /api/paypal/activate refuses the activation;
 *   * /api/creem/checkout refuses the checkout.
 *
 * MUTATION CONTROLS throughout: each guard also runs against a broken version
 * of what it protects and must fail there.
 *
 * Run: npx tsx lib/billing/__qa__/korea-sale.qa.ts
 */
import { readFileSync } from 'node:fs'
import {
  KOREA_COUNTRY,
  KOREA_SALE_COUNTRY_HEADER,
  KOREA_SALE_REFUSAL_REASON,
  koreaSaleBlockedForCountry,
  koreaSaleBlockedForRequest,
} from '../korea-sale'
import { COUNTRY_HEADER } from '../server-market'
import { RESTRICTED_COUNTRIES } from '../../sanctions/countries'
import { koreanCheckoutEnabled } from '../../i18n/korean-site'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
/** Comments stripped: a rule must hold in the CODE, not in a sentence. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const headersWith = (value: string | null) => ({
  get: (name: string) => (name === KOREA_SALE_COUNTRY_HEADER ? value : null),
})

console.log('\nA. the decision itself')
check('A1: a visitor in Korea may not be sold a plan while the flag is off',
  koreaSaleBlockedForCountry('KR', false) === true)
check('A2: the flag ON stops the block entirely, which is how the ruling is lifted',
  koreaSaleBlockedForCountry('KR', true) === false)
check('A3: nobody else is blocked, in either state',
  ['US', 'IL', 'DE', 'JP', 'GB', 'CA', 'AU'].every((c) =>
    koreaSaleBlockedForCountry(c, false) === false && koreaSaleBlockedForCountry(c, true) === false))
check('A4: a lower-case or padded code is still read, because formatting is not a licence to sell',
  koreaSaleBlockedForCountry('kr', false) === true && koreaSaleBlockedForCountry(' KR ', false) === true)
check('A5: an unplaceable visitor is NOT blocked, which is the residual the module states',
  koreaSaleBlockedForCountry(null, false) === false
  && koreaSaleBlockedForCountry(undefined, false) === false
  && koreaSaleBlockedForCountry('', false) === false
  && koreaSaleBlockedForCountry('XX', false) === false)
check('A6: it is one country, named once',
  KOREA_COUNTRY === 'KR')
check('A7: the header is byte-identical to the one the billing market itself reads',
  KOREA_SALE_COUNTRY_HEADER === COUNTRY_HEADER)
check('A8: from a request, the same answer',
  koreaSaleBlockedForRequest(headersWith('KR'), false) === true
  && koreaSaleBlockedForRequest(headersWith('US'), false) === false
  && koreaSaleBlockedForRequest(headersWith(null), false) === false)
check('A9: the application reads the flag, so nothing is hard-coded to "blocked"',
  koreaSaleBlockedForCountry('KR') === !koreanCheckoutEnabled())

console.log('\nB. Korea is NOT a sanctions entry, because that would be a false statement')
check('B1: the restricted-country list does not contain it',
  !Object.keys(RESTRICTED_COUNTRIES).includes('KR'))
check('B2: and the two reasons that list carries are about sanctions, not about tax',
  Object.values(RESTRICTED_COUNTRIES).every((r) => r.reason === 'enemy_state' || r.reason === 'comprehensive_sanctions'))

console.log('\nC. the three places that must all refuse')
{
  const paypal = code('app/api/paypal/activate/route.ts')
  const creem = code('app/api/creem/checkout/route.ts')
  const page = code('app/(dashboard)/billing/page.tsx')
  const view = code('app/(dashboard)/billing/BillingView.tsx')
  check('C1: the PayPal activation refuses, from the request headers',
    /koreaSaleBlockedForRequest\(request\.headers\)/.test(paypal)
    && /KOREA_SALE_REFUSAL_REASON/.test(paypal))
  check('C2: the Creem checkout refuses too, because it is the path that opens one day',
    /koreaSaleBlockedForRequest\(request\.headers\)/.test(creem)
    && /KOREA_SALE_REFUSAL_REASON/.test(creem))
  check('C3: both answer 451, the status the sanctions refusal already uses here',
    /KOREA_SALE_REFUSAL_REASON \}, \{ status: 451 \}/.test(paypal)
    && /KOREA_SALE_REFUSAL_REASON \}, \{ status: 451 \}/.test(creem))
  check('C4: the billing screen takes the decision on the server, from the headers',
    /koreaSaleBlockedForRequest\(await headers\(\)\)/.test(page)
    && /koreaSaleBlocked=\{koreaSaleBlocked\}/.test(page))
  check('C5: and the screen draws no PayPal container for such a visitor',
    /!creemCheckout && !creemGoverned && !koreaSaleBlocked && <BillingClient/.test(view))
  check('C6: nor a card button: the refusal is returned before either provider is considered',
    view.indexOf('if (koreaSaleBlocked) {') > 0
    && view.indexOf('if (koreaSaleBlocked) {') < view.indexOf('if (creemCheckout) return <CreemCheckoutButton'))
  check('C7: the visitor is told in words, not shown an empty card',
    /t\.koreaSale\.title/.test(view) && /t\.koreaSale\.description/.test(view))
  check('C-MUT1: the PayPal guard catches the refusal being dropped',
    !/koreaSaleBlockedForRequest\(request\.headers\)/.test(
      paypal.replace(/koreaSaleBlockedForRequest\(request\.headers\)/g, 'false')))
  check('C-MUT2: …and the Creem one',
    !/koreaSaleBlockedForRequest\(request\.headers\)/.test(
      creem.replace(/koreaSaleBlockedForRequest\(request\.headers\)/g, 'false')))
  check('C-MUT3: the screen guard catches the PayPal container coming back unconditionally',
    !/!creemCheckout && !creemGoverned && !koreaSaleBlocked && <BillingClient/.test(
      view.replace(/!creemCheckout && !creemGoverned && !koreaSaleBlocked && <BillingClient/g,
        '!creemCheckout && !creemGoverned && <BillingClient')))
  check('C-MUT4: …and the order guard catches the card button being offered first',
    (() => {
      const moved = view
        .replace('if (koreaSaleBlocked) {', 'if (false) {')
      return !/if \(koreaSaleBlocked\) \{/.test(moved)
    })())
}

console.log('\nD. the trial is untouched, which is the whole reason the locale may go live')
{
  const page = code('app/(dashboard)/billing/page.tsx')
  const view = code('app/(dashboard)/billing/BillingView.tsx')
  const koPricing = code('app/(public)/ko/pricing/page.tsx')
  check('D1: nothing about the entitlement or the trial is gated on the block',
    !/koreaSaleBlocked[^\n]*(trial|entitlement)/i.test(page)
    && !/(trial|entitlement)[^\n]*koreaSaleBlocked/i.test(page)
    && !/koreaSaleBlocked[^\n]*trialActive/.test(view))
  check('D2: the Korean price page still sends a visitor to the trial signup, not to a checkout',
    /authHref\('signup', 'ko'/.test(koPricing) && !/korea-sale/.test(koPricing))
  check('D3: and it opens no checkout of its own, so there is no fourth way in',
    !/creem\/checkout|paypal\/activate/.test(koPricing))
}

console.log('\nE. the refusal reason is a name, not a sentence shown to a buyer')
check('E1: it is a stable machine string',
  KOREA_SALE_REFUSAL_REASON === 'korea_checkout_unavailable')
check('E2: and the words the visitor reads say nothing about who remits Korean VAT, '
  + 'which the legal ruling keeps out of anything a buyer reads',
  (() => {
    const dicts = [
      read('lib/i18n/dashboard/he.ts'),
      read('lib/i18n/dashboard/en.ts'),
      read('lib/i18n/dashboard/ko/billing.ts'),
    ]
    const at = dicts.map((d) => d.slice(d.indexOf('koreaSale: {'), d.indexOf('koreaSale: {') + 900))
    return at.every((seg) => seg.includes('koreaSale')
      && !/VAT|מע״מ|부가가치세|부가세/.test(seg)
      && !/사업자등록|business registration|רישום עסק/.test(seg))
  })())
check('E3: all three dictionaries that the screen can show it in carry it '
  + '(the other eight fall back to English by design, lib/i18n/dashboard/merge.ts)',
  ['lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts', 'lib/i18n/dashboard/ko/billing.ts']
    .every((p) => /koreaSale: \{\s*\n\s*title:/.test(read(p))))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
