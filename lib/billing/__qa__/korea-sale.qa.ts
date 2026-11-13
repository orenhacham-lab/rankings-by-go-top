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
  koreaCreemSaleBlockedForCountry,
  koreaCreemSaleBlockedForRequest,
  koreaOwnSaleBlockedForCountry,
  koreaOwnSaleBlockedForRequest,
  koreaOwnSaleEnabled,
  koreaSaleBlockedForCountry,
  koreaTrialOnlyNoticeForCountry,
} from '../korea-sale'
import { COUNTRY_HEADER } from '../server-market'
import { RESTRICTED_COUNTRIES } from '../../sanctions/countries'
import { ownSaleAllowedForCountry, ownSaleCountries } from '../../marketplace/own-sale-territory'
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

console.log('\nA. the decision itself, which is TWO decisions and not one')
check('A1: with neither route open, a visitor in Korea may not be sold a plan',
  koreaSaleBlockedForCountry('KR', false, false) === true)
check('A2: the OWN-NAME route (PayPal) is governed by the registration flag alone — '
  + 'accepting Creem\'s merchant-of-record clause does nothing for a sale we make ourselves',
  koreaOwnSaleBlockedForCountry('KR', false) === true
  && koreaOwnSaleBlockedForCountry('KR', true) === false)
check('A3: the CREEM route is governed by the Korean checkout flag, which is what it was written for',
  koreaCreemSaleBlockedForCountry('KR', false) === true
  && koreaCreemSaleBlockedForCountry('KR', true) === false)
check('A4: the two do not leak into each other: opening Creem does NOT open our own-name sale',
  koreaOwnSaleBlockedForCountry('KR', false) === true
  && koreaSaleBlockedForCountry('KR', false, true) === false)
check('A4b: …and opening our own-name sale does not pretend the Creem route is live',
  koreaCreemSaleBlockedForCountry('KR', false) === true)
check('A5: nobody else is blocked on either route, in any state',
  ['US', 'IL', 'DE', 'JP', 'GB', 'CA', 'AU'].every((c) =>
    koreaOwnSaleBlockedForCountry(c, false) === false
    && koreaCreemSaleBlockedForCountry(c, false) === false
    && koreaSaleBlockedForCountry(c, false, false) === false))
check('A6: a lower-case or padded code is still read, because formatting is not a licence to sell',
  koreaOwnSaleBlockedForCountry('kr', false) === true && koreaOwnSaleBlockedForCountry(' KR ', false) === true)
check('A7: an unplaceable visitor is NOT blocked, which is the residual the module states',
  koreaOwnSaleBlockedForCountry(null, false) === false
  && koreaOwnSaleBlockedForCountry(undefined, false) === false
  && koreaOwnSaleBlockedForCountry('', false) === false
  && koreaOwnSaleBlockedForCountry('XX', false) === false)
check('A8: it is one country, named once',
  KOREA_COUNTRY === 'KR')
check('A9: the header is byte-identical to the one the billing market itself reads',
  KOREA_SALE_COUNTRY_HEADER === COUNTRY_HEADER)
check('A10: from a request, the same two answers',
  koreaOwnSaleBlockedForRequest(headersWith('KR'), false) === true
  && koreaOwnSaleBlockedForRequest(headersWith('US'), false) === false
  && koreaCreemSaleBlockedForRequest(headersWith('KR'), false) === true
  && koreaCreemSaleBlockedForRequest(headersWith(null), false) === false)
check('A11: the own-name flag is its OWN environment variable, off unless it says exactly true',
  koreaOwnSaleEnabled(undefined) === false
  && koreaOwnSaleEnabled('') === false
  && koreaOwnSaleEnabled('TRUE') === false
  && koreaOwnSaleEnabled('1') === false
  && koreaOwnSaleEnabled('true') === true)
check('A12: the application reads the flags, so nothing is hard-coded to "blocked"',
  koreaOwnSaleBlockedForCountry('KR') === !koreaOwnSaleEnabled()
  && koreaCreemSaleBlockedForCountry('KR') === !koreanCheckoutEnabled())
check('A13: the pre-trial notice shows exactly where NEITHER route may sell',
  koreaTrialOnlyNoticeForCountry('KR', false, false) === true
  && koreaTrialOnlyNoticeForCountry('KR', true, false) === false
  && koreaTrialOnlyNoticeForCountry('KR', false, true) === false
  && koreaTrialOnlyNoticeForCountry('US', false, false) === false)

console.log('\nB. Korea is NOT a sanctions entry, because that would be a false statement')
check('B1: the restricted-country list does not contain it',
  !Object.keys(RESTRICTED_COUNTRIES).includes('KR'))
check('B2: and the two reasons that list carries are about sanctions, not about tax',
  Object.values(RESTRICTED_COUNTRIES).every((r) => r.reason === 'enemy_state' || r.reason === 'comprehensive_sanctions'))

console.log('\nC. the three places that must all refuse, each on ITS OWN seller')
{
  const paypal = code('app/api/paypal/activate/route.ts')
  const creem = code('app/api/creem/checkout/route.ts')
  const page = code('app/(dashboard)/billing/page.tsx')
  const view = code('app/(dashboard)/billing/BillingView.tsx')
  check('C1: the PayPal activation refuses on the OWN-NAME decision, from the request headers',
    /koreaOwnSaleBlockedForRequest\(request\.headers\)/.test(paypal)
    && /KOREA_SALE_REFUSAL_REASON/.test(paypal))
  check('C1b: and it does NOT read the Creem flag, which would open our own sale on the wrong condition',
    !/koreaCreemSaleBlockedForRequest|koreanCheckoutEnabled/.test(paypal))
  check('C2: the Creem checkout refuses on the CREEM decision',
    /koreaCreemSaleBlockedForRequest\(request\.headers\)/.test(creem)
    && /KOREA_SALE_REFUSAL_REASON/.test(creem))
  check('C3: both answer 451, the status the sanctions refusal already uses here',
    /KOREA_SALE_REFUSAL_REASON \}, \{ status: 451 \}/.test(paypal)
    && /KOREA_SALE_REFUSAL_REASON \}, \{ status: 451 \}/.test(creem))
  check('C4: the billing screen takes both decisions on the server, from the headers',
    /koreaOwnSaleBlockedForRequest\(requestHeaders\)/.test(page)
    && /koreaCreemSaleBlockedForRequest\(requestHeaders\)/.test(page)
    && /koreaOwnSaleBlocked=\{koreaOwnSaleBlocked\}/.test(page))
  check('C5: the Creem card button is not even offered to such a visitor while that route is shut',
    /&& !koreaCreemSaleBlocked/.test(page))
  check('C6: and the screen draws no PayPal container for a visitor we may not sell to ourselves',
    /!creemCheckout && !creemGoverned && !koreaOwnSaleBlocked && <BillingClient/.test(view))
  check('C7: the refusal comes before the PayPal container and after the Creem button, '
    + 'because on the Creem route the seller is Creem',
    view.indexOf('if (creemCheckout) return <CreemCheckoutButton') > 0
    && view.indexOf('if (creemCheckout) return <CreemCheckoutButton') < view.indexOf('if (koreaOwnSaleBlocked) {'))
  check('C8: the visitor is told in words, not shown an empty card',
    /t\.koreaSale\.title/.test(view) && /t\.koreaSale\.description/.test(view))
  check('C-MUT1: the PayPal guard catches the refusal being dropped',
    !/koreaOwnSaleBlockedForRequest\(request\.headers\)/.test(
      paypal.replace(/koreaOwnSaleBlockedForRequest\(request\.headers\)/g, 'false')))
  check('C-MUT2: …and the Creem one',
    !/koreaCreemSaleBlockedForRequest\(request\.headers\)/.test(
      creem.replace(/koreaCreemSaleBlockedForRequest\(request\.headers\)/g, 'false')))
  check('C-MUT3: the screen guard catches the PayPal container coming back unconditionally',
    !/!creemCheckout && !creemGoverned && !koreaOwnSaleBlocked && <BillingClient/.test(
      view.replace(/!creemCheckout && !creemGoverned && !koreaOwnSaleBlocked && <BillingClient/g,
        '!creemCheckout && !creemGoverned && <BillingClient')))
  check('C-MUT4: the single-switch mistake is caught: the PayPal route reading the Creem flag',
    /koreaCreemSaleBlockedForRequest|koreanCheckoutEnabled/.test(
      paypal.replace('koreaOwnSaleBlockedForRequest', 'koreaCreemSaleBlockedForRequest')))
  check('C-MUT5: …and the Creem gate on the page being dropped',
    !/&& !koreaCreemSaleBlocked/.test(page.replace(/&& !koreaCreemSaleBlocked/g, '')))
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
    /authHref\('signup', 'ko'/.test(koPricing) && !/CreemCheckoutButton|paypal-button/.test(koPricing))
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

console.log('\nF. the fact is told BEFORE the trial, not only at the refusal')
{
  const section = code('components/public/pricing/PricingSections.tsx')
  const pages = [
    'app/(public)/pricing/page.tsx', 'app/(public)/en/pricing/page.tsx', 'app/(public)/ko/pricing/page.tsx',
    'app/(public)/es/pricing/page.tsx', 'app/(public)/pt-BR/pricing/page.tsx', 'app/(public)/fr/pricing/page.tsx',
    'app/(public)/it/pricing/page.tsx', 'app/(public)/ja/pricing/page.tsx', 'app/(public)/de/pricing/page.tsx',
    'app/(public)/nl/pricing/page.tsx', 'app/(public)/pl/pricing/page.tsx',
  ]
  check('F1: the shared section renders it, and only when the server said so',
    /koreaTrialOnly \? \(/.test(section) && /copy\.plans\.koreaTrialOnly/.test(section))
  check('F1-MUT: an unconditional notice is caught',
    !/koreaTrialOnly \? \(/.test(section.replace(/koreaTrialOnly \? \(/g, 'true ? (')))
  check('F2: EVERY language\'s pricing page takes the decision on the server and passes it, '
    + 'because the duty follows the consumer and not the page',
    pages.every((p) => {
      const src = code(p)
      return /koreaTrialOnlyNoticeForCountry\(countryFromHeaders\(await headers\(\)\)\)/.test(src)
        && /koreaTrialOnly=\{koreaTrialOnly\}/.test(src)
    }))
  check('F2-MUT: a page that stops passing it is caught',
    !/koreaTrialOnly=\{koreaTrialOnly\}/.test(
      code('app/(public)/ko/pricing/page.tsx').replace(/koreaTrialOnly=\{koreaTrialOnly\}/g, '')))
  /**
   * The sentence out of a pricing dictionary. They are template literals now,
   * not quoted strings: the trial's length is interpolated from the catalog
   * (F7), so a regex that only matched quotes would silently find nothing and
   * every check below would pass on an empty string.
   */
  const pricingNotice = (loc: string): string | null => {
    const d = read(`lib/i18n/public/pricing-${loc}.ts`)
    const m = d.match(/koreaTrialOnly: ([`'])((?:[^`'\\]|\\.)*)\1/)
    return m ? m[2] : null
  }
  const ALL_PRICING_LOCALES = ['he', 'en', 'es', 'pt-BR', 'fr', 'it', 'ja', 'de', 'nl', 'pl', 'ko']

  check('F3: every pricing dictionary carries the sentence, and none is empty',
    ALL_PRICING_LOCALES.every((loc) => (pricingNotice(loc) ?? '').length > 30))
  check('F4: and none of them says anything about VAT or a registration number, '
    + 'which the legal ruling keeps out of anything a buyer reads',
    ['he', 'en', 'ko', 'ja', 'de'].every((loc) => {
      const notice = pricingNotice(loc)
      return !!notice && !/VAT|מע״מ|부가가치세|부가세|사업자등록/.test(notice)
    }))
  check('F5: the Korean sentence says the trial is open and that nothing is charged, '
    + 'rather than that the service is unavailable in their country',
    (() => {
      const notice = pricingNotice('ko') ?? ''
      return notice.includes('무료 체험') && notice.includes('청구되지 않습니다')
    })())
  check('F7: the trial\'s length is interpolated from the catalog in all eleven, never written out',
    ALL_PRICING_LOCALES.every((loc) => {
      const notice = pricingNotice(loc) ?? ''
      return notice.includes('${DAYS}') && !/\d/.test(notice)
    }))
  check('F7-MUT: a sentence that spells the length out is caught — it is the figure that goes stale '
    + 'in silence, and this sentence is read under a disclosure duty',
    ALL_PRICING_LOCALES.map((loc) => (pricingNotice(loc) ?? '').replace('${DAYS}', '7'))
      .every((line) => /\d/.test(line)))
  // Legal, 13 Nov 2026, after a model read the Korean back: the payment-step
  // HEADING must say what IS available, not only what is absent. A bare "we do
  // not provide this" at the exact spot where a plan would be bought reads as a
  // door closing, which is the failure mode the signup wording was written
  // against, and it is weaker against 전자상거래법 제21조 제1항 제1호: the duty is
  // not to withhold a MATERIAL FACT, and "the trial is yours, the paid plan is
  // not sold here" is the whole fact, while the refusal alone is half of it.
  const KOREA_SALE_DICTS = ['lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts', 'lib/i18n/dashboard/ko/billing.ts']
  const koreaSaleTitle = (path: string): string => {
    const d = read(path)
    const seg = d.slice(d.indexOf('koreaSale: {'), d.indexOf('koreaSale: {') + 700)
    return (seg.match(/title: '((?:[^'\\]|\\.)*)'/) ?? ['', ''])[1]
  }
  const saysWhatIsAvailable = (title: string) => /\u05d6\u05de\u05d9\u05df|available|\uc774\uc6a9\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4/.test(title)
  check('F9: the payment-step heading names what IS available, in all three dictionaries that can show it',
    KOREA_SALE_DICTS.every((p2) => saysWhatIsAvailable(koreaSaleTitle(p2))),
    KOREA_SALE_DICTS.filter((p2) => !saysWhatIsAvailable(koreaSaleTitle(p2))).join(', '))
  check('F9b: and the refusal itself is still told, in the body beneath it',
    KOREA_SALE_DICTS.every((p2) => {
      const d = read(p2)
      const seg = d.slice(d.indexOf('koreaSale: {'), d.indexOf('koreaSale: {') + 700)
      const body = (seg.match(/description: '((?:[^'\\]|\\.)*)'/) ?? ['', ''])[1]
      return /\u05dc\u05d0 \u05e0\u05de\u05db\u05e8|is not sold|\uc81c\uacf5\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4/.test(body)
    }))
  // MUTATION CONTROL
  check('F9-MUT: a heading that states only the absence is caught',
    !saysWhatIsAvailable('\ud604\uc7ac \ud55c\uad6d\uc5d0\uc11c\ub294 \uc720\ub8cc \uad6d\ub3c5 \uacb0\uc81c\ub97c \uc81c\uacf5\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4')
    && !saysWhatIsAvailable('A paid subscription is not sold in Korea at the moment'))
  // Legal, same ruling: the pricing sentence may hedge the PRESENT ("currently",
  // "at the moment") but must not point at a future launch. Korean 아직 ("not
  // yet") asks the reader to expect one, and nobody has recorded an intent to
  // open Korean paid billing or committed a date — the same reason the
  // payment-step text may not promise to notify them (F6).
  check('F10: no pricing sentence promises a future Korean launch',
    ALL_PRICING_LOCALES.every((loc) => !/\uc544\uc9c1|not yet|noch nicht|pas encore|todav\u00eda no|ainda n\u00e3o|non ancora|\u05dc\u05d0 \u05e2\u05d3\u05d9\u05d9\u05df|nog niet|jeszcze nie|\u307e\u3060/.test(pricingNotice(loc) ?? '')),
    ALL_PRICING_LOCALES.filter((loc) => /\uc544\uc9c1|not yet|noch nicht|pas encore|todav\u00eda no|ainda n\u00e3o|non ancora|nog niet|jeszcze nie|\u307e\u3060/.test(pricingNotice(loc) ?? '')).join(', '))
  // MUTATION CONTROL
  check('F10-MUT: the sentence we shipped until today, with 아직, is caught',
    /\uc544\uc9c1/.test('\ud604\uc7ac \ud55c\uad6d\uc5d0\uc11c\ub294 \ubb34\ub8cc \uccb4\ud5d8\ub9cc \uc81c\uacf5\ud558\uba70, \uc720\ub8cc \uad6d\ub3c5 \uacb0\uc81c\ub294 \uc544\uc9c1 \uc81c\uacf5\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.'))
  check('F6: and the payment-step sentence promises no notification we are not recording',
    ['lib/i18n/dashboard/he.ts', 'lib/i18n/dashboard/en.ts', 'lib/i18n/dashboard/ko/billing.ts']
      .every((p) => {
        const d = read(p)
        const seg = d.slice(d.indexOf('koreaSale: {'), d.indexOf('koreaSale: {') + 700)
        return !/알려 드리겠습니다|we will tell you|ונעדכן/.test(seg)
      }))
}

console.log('\nG. the marketplace pages, where JVZoo is NOT the seller')
{
  const go = code('app/go/[platform]/page.tsx')
  const config = read('lib/marketplace/config.ts')
  check('G1: the page refuses an own-name sale outside the cleared countries, and only where WE are the seller',
    /!provider\.sellerOfRecord\s*\n\s*&& !ownSaleAllowedForRequest\(requestHeaders, KOREA_SALE_COUNTRY_HEADER\)/.test(go))
  check('G2: such a visitor is told what is refused, in words, and is offered no competing checkout',
    /ownSaleRefused \? \(/.test(go) && /data-own-sale-refused/.test(go)
    && !/<a href="\//.test(go))
  check('G3: the button is still there for everyone else',
    /\) : buyUrl \? \(/.test(go) && /href=\{buyUrl\}/.test(go))
  check('G4: and the reseller platforms are untouched, because the tax is theirs',
    (config.match(/sellerOfRecord: true/g) ?? []).length === 2
    && (config.match(/sellerOfRecord: false/g) ?? []).length === 1)
  check('G5: a visitor in Korea is outside the cleared list, so this page sells them nothing either',
    ownSaleAllowedForCountry('KR', ownSaleCountries(undefined)) === false)
  check('G6: the list is configuration, and unset it is the four cleared countries',
    ownSaleCountries('').join(',') === 'US,CA,JP,AU'
    && ownSaleAllowedForCountry('US', ownSaleCountries('')) === true
    && ownSaleCountries('us, ca ,JP').join(',') === 'US,CA,JP')
  check('G6b: each default country is cleared, and the three thresholds carry their figure and authority',
    (() => {
      const src = readFileSync('lib/marketplace/own-sale-territory.ts', 'utf8')
      return ['CAD 30,000', 'canada.ca', 'JPY 10,000,000', 'NTA', 'AUD 75,000', 'ato.gov.au']
        .every((token) => src.includes(token))
        && ['CA', 'JP', 'AU'].every((c) => ownSaleAllowedForCountry(c, ownSaleCountries('')))
    })())
  check('G6c: the US entry carries the review trigger, so it is not read as a finding about America',
    (() => {
      const src = readFileSync('lib/marketplace/own-sale-territory.ts', 'utf8')
      return /ABOUT OUR VOLUME, NOT ABOUT AMERICA/.test(src)
        && /approaching any\s*\n?\s*\*?\s*single state's threshold/.test(src)
    })())
  check('G6d: Switzerland is NOT cleared — its CHF 100,000 test is on WORLDWIDE turnover',
    ownSaleAllowedForCountry('CH', ownSaleCountries('')) === false
    && /WORLDWIDE turnover/.test(readFileSync('lib/marketplace/own-sale-territory.ts', 'utf8')))
  check('G6e: no EU member state is cleared — a non-EU supplier owes there from the first euro',
    ['DE', 'FR', 'IT', 'ES', 'NL', 'PL', 'IE', 'SE', 'AT', 'BE', 'PT', 'FI', 'DK', 'GR']
      .every((c) => ownSaleAllowedForCountry(c, ownSaleCountries('')) === false))
  check('G7: an unplaceable visitor fails CLOSED here, the opposite of the billing guard',
    ownSaleAllowedForCountry(null, ['US']) === false
    && ownSaleAllowedForCountry('XX', ['US']) === false
    && koreaOwnSaleBlockedForCountry(null, false) === false)
  check('G8: the sentence does not say the service is unavailable in their country',
    (() => {
      const at = go.indexOf('data-own-sale-refused')
      const seg = go.slice(at, at + 400)
      return /not sold through this page/.test(seg) && !/unavailable|VAT|tax/i.test(seg)
    })())
  check('G-MUT1: dropping the seller condition is caught — it would refuse a reseller sale that is lawful',
    !/!provider\.sellerOfRecord\s*\n\s*&& !ownSaleAllowedForRequest/.test(
      go.replace(/!provider\.sellerOfRecord\s*\n\s*&& !ownSaleAllowedForRequest/g, '!ownSaleAllowedForRequest')))
  check('G-MUT2: dropping the refusal and showing the button anyway is caught',
    !/ownSaleRefused \? \(/.test(go.replace(/ownSaleRefused \? \(/g, 'false ? (')))
  check('G-MUT3: a list that falls back to "everywhere" instead of the default is caught',
    ownSaleCountries('').length === 4 && ownSaleCountries('').length < 10)
  check('G-MUT4: a country added to the default without its figure and authority is caught',
    (() => {
      const src = readFileSync('lib/marketplace/own-sale-territory.ts', 'utf8')
      const widened = src.replace("'AU']", "'AU', 'CH']")
      const codes = widened.match(/export const DEFAULT_OWN_SALE_COUNTRIES = Object\.freeze\(\[([^\]]*)\]/)?.[1] ?? ''
      // Every code in the frozen list must appear as a quoted entry in the
      // comment block above it, which is where the basis is written down.
      const commented = (code: string) => new RegExp(`\\* - '${code}'`).test(widened)
      const listed = [...codes.matchAll(/'([A-Z]{2})'/g)].map((m) => m[1])
      return listed.includes('CH') && !commented('CH') && listed.filter((c) => !commented(c)).length === 1
    })())
}

console.log('\nH. the sign-up disclosure, which is where the inducement actually happens')
{
  const layout = code('app/(auth)/layout.tsx')
  const provider = code('components/auth/AuthLocaleProvider.tsx')
  const signup = code('app/(auth)/signup/page.tsx')

  check('H1: the (auth) layout takes the decision by COUNTRY on the server, not from the locale',
    /koreaTrialOnlyNoticeForCountry\(countryFromHeaders\(requestHeaders\)\)/.test(layout)
    && /koreaTrialOnly=\{koreaTrialOnly\}/.test(layout))
  check('H2: the provider carries it beside the locale and defaults to false, so a missing provider renders nothing',
    /KoreaTrialOnlyContext = createContext<boolean>\(false\)/.test(provider)
    && /koreaTrialOnly = false/.test(provider)
    && /export function useKoreaTrialOnlyNotice/.test(provider))
  check('H3: the sign-up form reads it from the provider and renders it only when set',
    /useKoreaTrialOnlyNotice\(\)/.test(signup)
    && /\{koreaTrialOnly && \(/.test(signup)
    && /data-korea-trial-only/.test(signup))
  check('H4: it sits ABOVE the form, with the trial badge and the heading, not after the button',
    (() => {
      const notice = signup.indexOf('data-korea-trial-only')
      const form = signup.indexOf('<form onSubmit={handleSubmit}')
      return notice > 0 && form > notice
    })())

  const koreaLines = [...signup.matchAll(/koreaTrialOnly: `([^`]*)`/g)].map((m) => m[1])
  check('H5: every one of the eleven languages carries the sentence, and none is empty',
    koreaLines.length === 11 && koreaLines.every((line) => line.trim().length > 40), String(koreaLines.length))
  check('H6: the trial length is interpolated from the catalog in every language — no loose digit to go stale',
    koreaLines.every((line) => line.includes('${TRIAL_DAYS}') && !/\d/.test(line))
    && /const TRIAL_DAYS = TRIAL_CATALOG\.days/.test(signup))
  check('H7: each sentence does three jobs — the trial, nothing charged, and no paid subscription after it',
    koreaLines.every((line) => line.split(/[.。]/).filter((part) => part.trim().length > 8).length >= 3))

  const korean = koreaLines[10] ?? ''
  check('H8: the Korean sentence makes the trial AVAILABLE and the paid plan the thing that does not follow',
    korean.includes('무료 체험') && korean.includes('요금이 청구되지 않') && korean.includes('자동 전환되지 않습니다')
    && !/가입할 수 없|이용할 수 없/.test(korean), korean.slice(0, 40))
  check('H9: and it never promises to tell them when Korea opens, which nobody is recording',
    !koreaLines.some((line) => /알려|notify|informar|benachrichtig|powiadom|お知らせ/i.test(line)))

  check('H10: the notice is on the sign-up form only, because signing in is not an inducement',
    !/data-korea-trial-only/.test(code('app/(auth)/login/page.tsx')))

  check('H-MUT1: an unconditional notice is caught — it would tell every country in the world',
    !/\{koreaTrialOnly && \(/.test(signup.replace(/\{koreaTrialOnly && \(/g, '{true && (')))
  check('H-MUT2: a layout that stops passing the flag is caught',
    !/koreaTrialOnly=\{koreaTrialOnly\}/.test(layout.replace(/koreaTrialOnly=\{koreaTrialOnly\}/g, '')))
  check('H-MUT3: a hard-coded trial length in the sentence is caught',
    (() => {
      // H6 passes only because no sentence contains a digit. Put the digit
      // back in every language and H6's own test must fail on all eleven.
      const stale = koreaLines.map((line) => line.replaceAll('${TRIAL_DAYS}', '7'))
      return stale.length === 11 && stale.every((line) => /\d/.test(line))
    })())
  check('H-MUT4: a locale that loses the sentence is caught',
    [...signup.replace(/koreaTrialOnly: `[^`]*`,\n/, '').matchAll(/koreaTrialOnly: `/g)].length === 10)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
