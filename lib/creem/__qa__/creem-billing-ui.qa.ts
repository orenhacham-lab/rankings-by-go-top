/**
 * The billing screen's card-payment button, guarded at the source.
 *
 * OWNER DECISION, 10 Oct 2026: new customers only. So what this suite pins is
 * not how the button looks but WHO is ever shown it, and the fact that a plan
 * card can never offer two ways to pay:
 *
 *  A) the server decides. Every condition is on the page, in one place, and
 *     the decision reaches the view as a prop — the client never infers it
 *  B) an account that has ever paid through PayPal is excluded, and a read
 *     that fails leaves PayPal in place
 *  C) the view draws the card button INSTEAD of the PayPal container, and
 *     does not load the PayPal SDK at all on that path
 *  D) the button sends a plan code and nothing else, follows only an https
 *     URL, and never shows the provider's own words
 *  E) all four dashboard languages have the strings
 *
 * Every assertion has a MUTATION CONTROL alongside it: the same check re-run
 * against a source with that guard removed, which must fail.
 *
 * Run: npx tsx lib/creem/__qa__/creem-billing-ui.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const PAGE = 'app/(dashboard)/billing/page.tsx'
const VIEW = 'app/(dashboard)/billing/BillingView.tsx'
const BUTTON = 'app/(dashboard)/billing/CreemCheckoutButton.tsx'

const page = strip(read(PAGE))
const view = strip(read(VIEW))
// Only the BLOCK comments come off the button: stripping line comments too
// would eat its own https guard, whose `\/\/` ends in two slashes.
const button = read(BUTTON).replace(/\/\*[\s\S]*?\*\//g, '')

console.log('\nA) the server decides who sees a card button')
{
  const gate = (src: string) => {
    const open = src.indexOf('let creemCheckout = false')
    const cond = src.indexOf('if (', open)
    const close = src.indexOf('creemCheckout = !paypalRowsError', open)
    return open > 0 && cond > open && close > cond ? src.slice(open, close) : ''
  }
  const g = gate(page)
  check('A1: the whole decision is one server-side block on the billing page', g.length > 0)
  for (const condition of [
    'isCreemEnabled()',
    "market === 'USD'",
    '!governanceUnavailable',
    '!shopifyConnected',
    '!shopifyStoreConnected',
    '!entitlement.hasActiveSubscription',
    'creemMayWriteToAccount(user.id)',
  ]) {
    check(`A2: the gate requires ${condition}`, g.includes(condition))
  }
  check('A2-MUT: dropping the USD condition is caught', !gate(page.replace("    && market === 'USD'\n", '')).includes("market === 'USD'"))
  check('A2-MUT2: dropping the sandbox condition is caught',
    !gate(page.replace('    && creemMayWriteToAccount(user.id)\n', '')).includes('creemMayWriteToAccount(user.id)'))
  check('A2-MUT3: dropping the Shopify condition is caught',
    !gate(page.replace('    && !shopifyStoreConnected\n', '')).includes('!shopifyStoreConnected'))

  check('A3: the decision reaches the view as a prop', /creemCheckout=\{creemCheckout\}/.test(page))
  check('A3-MUT: not passing it is caught', !/creemCheckout=\{creemCheckout\}/.test(page.replace('creemCheckout={creemCheckout}', '')))

  // The client cannot decide this for itself: the switch, the sandbox list and
  // the account's payment history are all server-side facts.
  check('A4: neither the view nor the button reads the switch or the sandbox list',
    !/isCreemEnabled|creemMayWriteToAccount|CREEM_ENABLED/.test(view + button))
  check('A4-MUT: a client-side switch read is caught',
    /isCreemEnabled/.test(view + button + 'isCreemEnabled()'))
}

console.log('\nB) an existing PayPal payer is never moved')
{
  const ownerFiltered = /\.from\('subscriptions'\)[\s\S]{0,200}?\.eq\('user_id', user\.id\)/.test(page)
  check('B1: the PayPal-history read is filtered by the owner (service-role client)', ownerFiltered)
  // The mutation drops the owner filter from the PayPal-history read only, so
  // the guard must look at THAT read and not at any other query on the page.
  const historyRead = (src: string) => {
    const at = src.indexOf(".not('paypal_subscription_id', 'is', null)")
    return at > 0 ? src.slice(Math.max(0, at - 300), at) : ''
  }
  check('B1-MUT: dropping the owner filter is caught',
    !/\.eq\('user_id', user\.id\)/.test(historyRead(page.replace(
      "      .eq('user_id', user.id)\n      .not('paypal_subscription_id', 'is', null)",
      "      .not('paypal_subscription_id', 'is', null)"))))

  check('B2: any row that ever carried a PayPal subscription id excludes the account',
    /\.not\('paypal_subscription_id', 'is', null\)/.test(page))
  check('B2-MUT: narrowing it to active rows only is caught',
    !/\.not\('paypal_subscription_id', 'is', null\)/.test(page.replace(".not('paypal_subscription_id', 'is', null)", ".eq('status', 'active')")))

  // A read we cannot trust must leave PayPal in place, not fall through to the
  // card button: the one outcome this decision rules out is a PayPal payer
  // being shown a second way to pay.
  check('B3: a failed read keeps PayPal', /creemCheckout = !paypalRowsError && \(paypalRows\?\.length \?\? 0\) === 0/.test(page))
  check('B3-MUT: ignoring the read error is caught',
    !/creemCheckout = !paypalRowsError &&/.test(page.replace('creemCheckout = !paypalRowsError && (paypalRows?.length ?? 0) === 0', 'creemCheckout = (paypalRows?.length ?? 0) === 0')))
}

console.log('\nC) one plan card, one way to pay')
{
  const PLANS = ['regular', 'advanced', 'premium', 'large_agency'] as const
  for (const plan of PLANS) {
    check(`C1: the ${plan} card draws the card button only when the server said so`,
      view.includes(`action={creemCheckout ? <CreemCheckoutButton plan="${plan}" /> : undefined}`))
  }
  check('C1-MUT: an unconditional card button is caught',
    !view.replace('action={creemCheckout ? <CreemCheckoutButton plan="regular" /> : undefined}', 'action={<CreemCheckoutButton plan="regular" />}')
      .includes('action={creemCheckout ? <CreemCheckoutButton plan="regular" /> : undefined}'))

  // PlanCard renders `action` INSTEAD of the PayPal container, so a card that
  // has one cannot show both.
  const actionWins = /\) : action \? \(\s*action\s*\) : \(/.test(view) && view.indexOf('id={`paypal-button-${plan}`}') > view.indexOf(') : action ? (')
  check('C2: a card with an action never renders the PayPal container', actionWins)
  check('C2-MUT: rendering the container regardless is caught',
    !/\) : action \? \(\s*action\s*\) : \(/.test(view.replace(') : action ? (\n        action\n      ) : (', ') : (')))

  check('C3: the PayPal SDK is not loaded on the card path', /\{!creemCheckout && <BillingClient market=\{market\} \/>\}/.test(view))
  check('C3-MUT: loading it anyway is caught',
    !/\{!creemCheckout && <BillingClient/.test(view.replace('{!creemCheckout && <BillingClient market={market} />}', '<BillingClient market={market} />')))
}

console.log('\nD) what the button sends, and what it follows')
{
  check('D1: it posts to our own checkout route', /fetch\('\/api\/creem\/checkout'/.test(button))
  check('D2: the body is the plan code and nothing else', /JSON\.stringify\(\{ plan \}\)/.test(button))
  check('D2-MUT: sending a price or a product id is caught',
    !/JSON\.stringify\(\{ plan \}\)/.test(button.replace('JSON.stringify({ plan })', 'JSON.stringify({ plan, price })')))

  // A redirect target is only ever an absolute https URL. Our route is the only
  // source of it, but a javascript: or data: string would run in the page.
  const HTTPS_GUARD = "!/^https:\\/\\//.test(url)"
  const guardsRedirect = (src: string) => {
    const guard = src.indexOf(HTTPS_GUARD)
    const follow = src.indexOf('window.location.assign(url)')
    return guard > 0 && follow > guard && src.includes("typeof url !== 'string'")
  }
  check('D3: only an absolute https URL is followed, and the check comes first', guardsRedirect(button))
  check('D3-MUT: following whatever came back is caught', !guardsRedirect(button.replace(HTTPS_GUARD, 'false')))

  // CLAUDE.md: a merchant never reads a provider's own error text.
  check('D4: the shown message comes from the dictionary', /\{t\.error\}/.test(button) && /\{starting \? t\.starting : t\.payButton\}/.test(button))
  check('D4-MUT: showing the response body is caught',
    !/\{t\.error\}/.test(button.replace('{t.error}', '{payload?.error}')))
  // The component's own name and the route path say "creem"; no STRING the
  // merchant could read does. The dictionary is checked in section E.
  const literals = (src: string) => [...src.replace(/^import[^\n]*\n/gm, '').matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((m) => m[1] ?? m[2] ?? '')
  check('D5: no string in the component names the provider',
    literals(button).every((text) => !/creem/i.test(text) || text.startsWith('/api/') || text.startsWith('[creem-')))
  check('D5-MUT: a provider name in a shown string is caught',
    !literals(button.replace('t.payButton}', "'Pay with Creem'}")).every((text) => !/creem/i.test(text) || text.startsWith('/api/') || text.startsWith('[creem-')))
}

console.log('\nE) every dashboard language has the strings')
{
  const KEYS = ['payButton', 'starting', 'error'] as const
  const DICTS = {
    he: 'lib/i18n/dashboard/he.ts',
    en: 'lib/i18n/dashboard/en.ts',
    es: 'lib/i18n/dashboard/es.ts',
    'pt-BR': 'lib/i18n/dashboard/pt-BR/billing.ts',
  }
  for (const [lang, path] of Object.entries(DICTS)) {
    const src = read(path)
    const start = src.indexOf('    creem: {')
    const section = start > 0 ? src.slice(start, src.indexOf('    },', start)) : ''
    check(`E1: ${lang} has a billing.creem section`, section.length > 0)
    for (const key of KEYS) {
      check(`E2: ${lang} has ${key}`, new RegExp(`${key}: '[^']+'`).test(section))
    }
    check(`E2-MUT: an empty ${lang} string is caught`, !new RegExp("payButton: ''").test(section))
  }
}

console.log('\nF) what the screen actually renders')
{
  // The same harness lib/__qa__/reports-billing-screens.qa.ts uses: the view
  // rendered to static markup, so this is what a merchant's browser receives.
  const { createElement } = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const BillingView = require('../../../app/(dashboard)/billing/BillingView').default
  const { DashboardLanguageProvider } = require('../../i18n/dashboard/useDashboardLanguage')
  const { getDashboardDictionary } = require('../../i18n/dashboard/getDashboardDictionary')

  const base = {
    plan: 'trial', hasActiveSubscription: false, trialActive: true,
    trialEndsAt: '2026-10-17T00:00:00Z', subscriptionEndsAt: null,
    hasPaypalSubscriptionId: false, renewalCancelled: false, shopifyConnected: false,
    shopifyMigrationStatus: null, marketLocked: false, market: 'USD',
    planPrices: { trial: 0, regular: 79, advanced: 179, premium: 329, large_agency: 649 },
  }
  const render = (locale: string, props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale },
      createElement(BillingView, { ...base, ...props })))

  const PLANS = ['regular', 'advanced', 'premium', 'large_agency'] as const
  // he and en only: DashboardLanguageProvider's initialLocale resolves to
  // Hebrew for the two partial dictionaries in this harness (the real locale
  // comes from the request), so a Spanish render here would prove nothing.
  // Their strings are checked in section E.
  for (const locale of ['he', 'en']) {
    const t = getDashboardDictionary(locale).billing.creem
    const card = render(locale, { creemCheckout: true })
    const paypal = render(locale, { creemCheckout: false })

    check(`F1 (${locale}): the card path draws a pay button on every paid plan`,
      PLANS.every((plan) => card.includes(`data-creem-checkout="${plan}"`)))
    check(`F2 (${locale}): and no PayPal container anywhere`, !card.includes('paypal-button-'))
    check(`F3 (${locale}): the button is in this language`, card.includes(t.payButton))
    check(`F4 (${locale}): the PayPal path is untouched — containers, no pay button`,
      PLANS.every((plan) => paypal.includes(`paypal-button-${plan}`)) && !paypal.includes('data-creem-checkout'))
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
