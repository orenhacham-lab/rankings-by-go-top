/**
 * w17 — billing currency by COUNTRY, not by language, no switcher.
 *
 * Owner's decision (2026-10-02): Israel pays in shekels, everyone else in
 * dollars, automatically by location, no switch; the currency locks at the
 * first payment. Every guard below has a mutation control (a deliberately
 * broken implementation or source) that must FAIL it.
 *
 * Run: npx tsx lib/billing/__qa__/w17-billing-market.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  BILLING_MARKETS, BILLING_MARKET_CODES, COUNTRY_MARKET, DEFAULT_MARKET, marketForCountry, planPriceIn, formatPlanPrice,
  normalizeCountry, isBillingMarket, type BillingMarket,
} from '../market'
import { countryFromHeaders, decideBillingMarket, resolveBillingMarket, COUNTRY_HEADER, type BillingMarketInputs, type BillingMarketDecision } from '../server-market'
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/plans/catalog'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const read = (rel: string) => strip(readFileSync(join(ROOT, rel), 'utf8'))
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (name === 'node_modules' || name === '__qa__' || name.startsWith('.')) continue
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel)
  }
  return out
}

async function main() {
  console.log('w17 — billing market by country QA\n')

  // ── G1: the country rule ────────────────────────────────────────────────
  console.log('G1) country -> market: IL -> ILS; US/FR/unknown/missing -> USD')
  const countryRuleOk = (fn: (c: string | null | undefined) => BillingMarket) => {
    const bad: string[] = []
    const want: [string | null | undefined, BillingMarket][] = [
      ['IL', 'ILS'], ['il', 'ILS'], [' IL ', 'ILS'],
      ['US', 'USD'], ['FR', 'USD'], ['DE', 'USD'], ['GB', 'USD'], ['XX', 'USD'], ['T1', 'USD'],
      [null, 'USD'], [undefined, 'USD'], ['', 'USD'], ['ISR', 'USD'], ['<script>', 'USD'],
    ]
    for (const [c, m] of want) if (fn(c) !== m) bad.push(`${String(c)} -> ${fn(c)} (want ${m})`)
    return bad
  }
  const g1 = countryRuleOk(marketForCountry)
  check('G1: the real rule', g1.length === 0, g1.join('; '))
  check('G1-MUT: a missing country priced in shekels fails G1', countryRuleOk((c) => (c ? marketForCountry(c) : 'ILS')).length > 0)
  check('G1-MUT: a rule that ignores the country (always USD) fails G1', countryRuleOk(() => 'USD').length > 0)
  check('G1-MUT: a table that also maps US to ILS fails G1', countryRuleOk((c) => {
    const t: Record<string, BillingMarket | undefined> = { ...COUNTRY_MARKET, US: 'ILS' }
    const n = normalizeCountry(c); return (n && t[n]) || DEFAULT_MARKET
  }).length > 0)

  console.log('\nG2) the country comes from Vercel\'s x-vercel-ip-country header, nothing else')
  const headerOk = (fn: (h: Headers) => string | null) =>
    COUNTRY_HEADER === 'x-vercel-ip-country'
    && fn(new Headers({ 'x-vercel-ip-country': 'IL' })) === 'IL'
    && fn(new Headers({ 'x-vercel-ip-country': 'fr' })) === 'FR'
    && fn(new Headers({ 'accept-language': 'he-IL' })) === null
    && fn(new Headers({ 'x-country': 'IL', 'cf-ipcountry': 'IL' })) === null
    && fn(new Headers()) === null
  check('G2: real header reader', headerOk(countryFromHeaders))
  check('G2-MUT: a reader that trusts Accept-Language fails G2', !headerOk((h) => countryFromHeaders(h) ?? (h.get('accept-language')?.includes('IL') ? 'IL' : null)))
  check('G2-MUT: a reader of another header fails G2', !headerOk((h) => normalizeCountry(h.get('cf-ipcountry'))))

  // ── G3: reading order ───────────────────────────────────────────────────
  console.log('\nG3) reading order: stored market -> legacy locale (accounts that already paid) -> country')
  const orderOk = (fn: (i: BillingMarketInputs) => BillingMarketDecision) => {
    const bad: string[] = []
    const t = (name: string, i: BillingMarketInputs, market: BillingMarket, source: string) => {
      const r = fn(i); if (r.market !== market || r.source !== source) bad.push(`${name}: ${r.market}/${r.source}`)
    }
    t('stored ILS beats a US visitor', { storedMarket: 'ILS', legacyLocale: 'en', hasPaypalHistory: true, country: 'US' }, 'ILS', 'stored')
    t('stored USD beats an IL visitor', { storedMarket: 'USD', legacyLocale: 'he', hasPaypalHistory: true, country: 'IL' }, 'USD', 'stored')
    t('legacy he (paid) keeps ILS abroad', { storedMarket: null, legacyLocale: 'he', hasPaypalHistory: true, country: 'US' }, 'ILS', 'legacy')
    t('legacy en (paid) keeps USD in Israel', { storedMarket: null, legacyLocale: 'en', hasPaypalHistory: true, country: 'IL' }, 'USD', 'legacy')
    t('a he signup that never paid follows the country (US)', { storedMarket: null, legacyLocale: 'he', hasPaypalHistory: false, country: 'US' }, 'USD', 'country')
    t('an en signup that never paid follows the country (IL)', { storedMarket: null, legacyLocale: 'en', hasPaypalHistory: false, country: 'IL' }, 'ILS', 'country')
    t('a future language never maps to a market (fr, paid)', { storedMarket: null, legacyLocale: 'fr', hasPaypalHistory: true, country: 'IL' }, 'ILS', 'country')
    t('an invalid stored value is ignored', { storedMarket: 'EUR', legacyLocale: null, hasPaypalHistory: false, country: 'FR' }, 'USD', 'country')
    t('a lowercase stored value is ignored', { storedMarket: 'ils', legacyLocale: null, hasPaypalHistory: false, country: 'US' }, 'USD', 'country')
    t('no account, no header', { storedMarket: null, legacyLocale: null, hasPaypalHistory: false, country: null }, 'USD', 'country')
    if (fn({ storedMarket: 'ILS', legacyLocale: null, hasPaypalHistory: false, country: 'US' }).locked !== true) bad.push('stored not locked')
    if (fn({ storedMarket: null, legacyLocale: null, hasPaypalHistory: false, country: 'IL' }).locked !== false) bad.push('country locked')
    return bad
  }
  const g3 = orderOk(decideBillingMarket)
  check('G3: the real decision', g3.length === 0, g3.join('; '))
  check('G3-MUT: country before the stored market fails G3', orderOk((i) => ({ market: marketForCountry(i.country), source: 'country', locked: false })).length > 0)
  check('G3-MUT: a legacy locale without PayPal history fails G3', orderOk((i) => decideBillingMarket({ ...i, hasPaypalHistory: true })).length > 0)
  check('G3-MUT: dropping the legacy step (current customers repriced) fails G3', orderOk((i) => decideBillingMarket({ ...i, legacyLocale: null })).length > 0)

  console.log('\nG3b) the resolver wires the reading order (fake Supabase, explicit country)')
  {
    const fake = (row: unknown, error: unknown = null) => {
      const calls = { n: 0 }
      const q: Record<string, unknown> = {}
      for (const k of ['select', 'eq', 'not', 'limit', 'in', 'order']) q[k] = () => q
      q.maybeSingle = async () => { calls.n++; return { data: row, error } }
      return { client: { from: () => q } as never, calls }
    }
    const u = (app: Record<string, unknown>, meta: Record<string, unknown>) => ({ id: 'u1', app_metadata: app, user_metadata: meta }) as never
    const a = fake({ id: 's' })
    const r1 = await resolveBillingMarket(a.client, u({ billing_market: 'ILS' }, { locale: 'en' }), 'US')
    check('G3b: a stored market wins and needs no query', r1.market === 'ILS' && r1.source === 'stored' && a.calls.n === 0)
    const b = fake({ id: 's' })
    const r2 = await resolveBillingMarket(b.client, u({}, { locale: 'he' }), 'US')
    check('G3b: a he account that already paid keeps ILS abroad', r2.market === 'ILS' && r2.source === 'legacy' && b.calls.n === 1)
    const c = fake(null)
    const r3 = await resolveBillingMarket(c.client, u({}, { locale: 'he' }), 'US')
    check('G3b: a he account that never paid is priced by country (USD)', r3.market === 'USD' && r3.source === 'country')
    const d = fake(null, { message: 'down' })
    const r4 = await resolveBillingMarket(d.client, u({}, { locale: 'he' }), 'US')
    check('G3b: a failed history lookup keeps the legacy market (never reprices a customer on an error)', r4.market === 'ILS' && r4.source === 'legacy')
    const e = fake(null)
    const r5 = await resolveBillingMarket(e.client, null, 'IL')
    check('G3b: a visitor without an account in Israel gets ILS, with no query', r5.market === 'ILS' && e.calls.n === 0)
    const f = fake(null)
    const r6 = await resolveBillingMarket(f.client, u({}, { locale: 'he', billing_market: 'ILS' }), 'US')
    check('G3b: a market in user_metadata (user-writable) is NOT a stored market', r6.market === 'USD' && r6.source === 'country')
    check('G3b-MUT: the same user with the market in app_metadata is (control)', (await resolveBillingMarket(fake(null).client, u({ billing_market: 'ILS' }, {}), 'US')).market === 'ILS')
  }

  // ── G4: client-sent market ignored ──────────────────────────────────────
  console.log('\nG4) no route or screen takes a market from the client')
  const apiFiles = walk('app/api')
  const readsClientMarket = (src: string) => /body\.market|\{\s*[^}]*\bmarket\b[^}]*\}\s*=\s*(?:await\s+request\.json\(\)|body)|searchParams\.get\('market'\)|searchParams\.get\('currency'\)/.test(src)
  const offenders = apiFiles.filter((f) => readsClientMarket(read(f)))
  check('G4: no API route reads a market/currency from the body or query', offenders.length === 0, offenders.join(', '))
  check('G4-MUT: the old select route body read fails G4', readsClientMarket("const body = await request.json()\nresolve(existing, body.market, deps)"))
  const activate = read('app/api/paypal/activate/route.ts')
  const lockFromVerified = (s: string) => /marketForPayPalPlanId\(verified\.planId\)/.test(s) && /lockBillingMarket\(storedMarketOf\(user\), paidMarket,/.test(s) && !/body\.(market|currency)/.test(s)
  check('G4: the activation lock uses the VERIFIED PayPal plan id, never the body', lockFromVerified(activate))
  check('G4-MUT: a lock from the request body fails G4', !lockFromVerified(activate.replace('marketForPayPalPlanId(verified.planId)', 'body.market')))
  const billingClient = read('app/(dashboard)/billing/client.tsx')
  const view = read('app/(dashboard)/billing/BillingView.tsx')
  const sendsNoMarket = (s: string) => !/JSON\.stringify\(\{[^}]*\b(market|currency)\b/.test(s) && !s.includes('/api/billing-market/select')
  check('G4: the billing screen never sends a market', sendsNoMarket(billingClient) && sendsNoMarket(view))
  check('G4-MUT: an activation body with the market fails G4', !sendsNoMarket(billingClient.replace('JSON.stringify({ subscriptionId: data.subscriptionID, plan })', 'JSON.stringify({ subscriptionId: data.subscriptionID, plan, market })')))

  // ── G5: billing never writes the language ───────────────────────────────
  console.log('\nG5) billing never writes user_metadata.locale (the language)')
  const billingFiles = [...walk('lib/billing'), ...walk('lib/paypal'), ...walk('app/api/paypal'), ...walk('app/api/billing-market'), ...walk('app/(dashboard)/billing'), 'app/(public)/pricing/page.tsx', 'app/(public)/en/pricing/page.tsx']
  const writesLocale = (s: string) => /user_metadata\s*:/.test(s) || /updateUser\(\s*\{\s*data/.test(s) || /locale\s*:\s*(?:'he'|'en'|locale)\b/.test(s)
  const writers = billingFiles.filter((f) => writesLocale(read(f)))
  check('G5: no billing file writes user_metadata', writers.length === 0, writers.join(', '))
  check('G5-MUT: the old persistLocale write fails G5', writesLocale("await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, locale } })"))
  const lockWrite = /updateUserById\(user\.id, \{ app_metadata: \{ \[STORED_MARKET_KEY\]: market \} \}\)/
  check('G5: the lock writes app_metadata (server-only), not user_metadata', lockWrite.test(activate))
  check('G5-MUT: a lock into user_metadata fails G5', !lockWrite.test(activate.replace('{ app_metadata: { [STORED_MARKET_KEY]: market } }', '{ user_metadata: { [STORED_MARKET_KEY]: market } }')))

  // ── G6: no switcher ─────────────────────────────────────────────────────
  console.log('\nG6) the ILS/USD switcher is gone from BillingView')
  const noSwitcher = (s: string) => !/data-currency-option|setPickedMarket|pickedMarket|selectMarket|data-continue-to-payment|billing-market\/select|\(\['ILS', 'USD'\] as const\)\.map/.test(s)
    && /BILLING_MARKETS\[market\]\.symbol/.test(s)
  check('G6: no switcher, the symbol comes from the server market', noSwitcher(view))
  check('G6-MUT: the old switch fails G6', !noSwitcher(view + "\n{(['ILS', 'USD'] as const).map((m) => <button data-currency-option={m} onClick={() => setPickedMarket(m)} />)}"))

  // ── G7: public pricing uses the server market ───────────────────────────
  console.log('\nG7) /pricing and /en/pricing are priced in the visitor\'s market, per request')
  for (const page of ['app/(public)/pricing/page.tsx', 'app/(public)/en/pricing/page.tsx']) {
    const src = read(page)
    const layout = read(page.replace('page.tsx', 'layout.tsx'))
    const pricingOk = (s: string, l: string) =>
      /const \{ market \} = await resolveBillingMarket\(supabase, user\)/.test(s)
      && /formatPlanPrice\(planPriceIn\(plan, market\), market, '(he-IL|en-US)'\)/.test(s)
      && !/plan\.price(ILS|USD)|formatILS|formatUSD|[₪$]\$\{/.test(s)
      && /await supabase\.auth\.getUser\(\)/.test(s) // reads cookies: rendered per request
      && !/export const (dynamic|revalidate)\b|force-static|generateStaticParams/.test(s + l)
    check(`G7: ${page}`, pricingOk(src, layout))
    check(`G7-MUT: ${page} with the language's fixed currency fails G7`, !pricingOk(src.replace(/formatPlanPrice\(planPriceIn\(plan, market\), market, '(he-IL|en-US)'\)/, 'formatILS(plan.priceILS)'), layout))
    check(`G7-MUT: ${page} made static fails G7`, !pricingOk(src, layout + "\nexport const dynamic = 'force-static'"))
  }

  // ── G8: no language -> currency anywhere ────────────────────────────────
  console.log('\nG8) no "locale === \'he\' ? \'ILS\'" (language -> currency) anywhere in the app')
  const langCurrency = /(?:locale|language|lang)\s*===\s*'(?:he|en)'\s*\?\s*'(?:ILS|USD)'|'(?:he|en)'\s*\?\s*'(?:ILS|USD)'\s*:|===\s*'en'\s*\?\s*'\$'|===\s*'USD'\s*\?\s*'\$'/
  const all = [...walk('app'), ...walk('lib'), ...walk('components')]
  const langHits = all.filter((f) => langCurrency.test(read(f)))
  check('G8: none', langHits.length === 0, langHits.join(', '))
  check("G8-MUT: the old BillingView default fails G8", langCurrency.test("const shown = market ?? (language === 'en' ? 'USD' : 'ILS')"))
  check("G8-MUT: the old billingMarketFromLocale fails G8", langCurrency.test("if (x) return locale === 'he' ? 'ILS' : 'USD'"))

  // ── G9: extensible by data; prices unchanged ────────────────────────────
  console.log('\nG9) markets are data; prices are the catalog\'s, unchanged')
  const PRICES: Record<string, [number, number]> = { regular: [249, 79], advanced: [549, 179], premium: [999, 329], large_agency: [1999, 649] }
  const pricesOk = (fn: typeof planPriceIn) => PLAN_CODES.every((c) => fn(PLAN_CATALOG[c], 'ILS') === PRICES[c][0] && fn(PLAN_CATALOG[c], 'USD') === PRICES[c][1])
  check('G9: every plan, every market: the catalog price (249/549/999/1999 ILS, 79/179/329/649 USD)', pricesOk(planPriceIn))
  check('G9-MUT: a market reading the other field fails G9', !pricesOk((e, m) => planPriceIn(e, m === 'ILS' ? 'USD' : 'ILS')))
  check('G9: formatting is symbol + grouped amount', formatPlanPrice(1999, 'ILS', 'he-IL') === '₪1,999' && formatPlanPrice(79, 'USD', 'en-US') === '$79')
  const tableOk = (markets: string[], country: Record<string, string | undefined>, plansSrc: string, names: Record<string, unknown>[]) =>
    markets.length >= 2 && markets.includes(DEFAULT_MARKET)
    && Object.values(country).every((m) => !!m && markets.includes(m))
    && markets.every((m) => new RegExp(`\\n\\s*${m}: \\{\\n\\s*regular: process\\.env\\.NEXT_PUBLIC_PAYPAL_PLAN_ID_${m}_REGULAR`).test(plansSrc))
    && names.every((n) => markets.every((m) => typeof n[m] === 'string' && (n[m] as string).length > 0))
  const plansSrc = read('lib/paypal/checkout-plans.ts')
  const names = (['he', 'en'] as const).map((l) => getDashboardDictionary(l).billing.marketPrompt.currencyName as Record<string, unknown>)
  check('G9: every market has a country table entry type, PayPal plan-id row and currency name', tableOk(BILLING_MARKET_CODES, COUNTRY_MARKET, plansSrc, names) && BILLING_MARKET_CODES.every(isBillingMarket) && Object.keys(BILLING_MARKETS).length === BILLING_MARKET_CODES.length)
  check('G9-MUT: a third market without its PayPal row fails G9', !tableOk([...BILLING_MARKET_CODES, 'EUR'], COUNTRY_MARKET, plansSrc, names))
  check('G9-MUT: a country mapped to an unknown market fails G9', !tableOk(BILLING_MARKET_CODES, { ...COUNTRY_MARKET, DE: 'EUR' }, plansSrc, names))
  check('G9: no EUR added now (prices are the owner\'s decision)', !BILLING_MARKET_CODES.includes('EUR' as never))
  const checkoutPlansCallSites = /resolveCheckoutPlans\(market\)/.test(read('app/(dashboard)/billing/client.tsx'))
  check('G9: the checkout picks its plan ids by the market it is given (no per-currency branch)', checkoutPlansCallSites && !/market === 'ILS'|market === 'USD'/.test(read('app/(dashboard)/billing/client.tsx') + view))

  // ── G10: Shopify and admin untouched ────────────────────────────────────
  console.log('\nG10) Shopify-governed and admin accounts are untouched')
  const page = read('app/(dashboard)/billing/page.tsx')
  const order = (s: string) => s.indexOf('if (entitlement.isAdmin) {') !== -1 && s.indexOf('if (entitlement.isAdmin) {') < s.indexOf('resolveBillingMarket(')
  check('G10: the admin gate returns before the market is resolved', order(page))
  check('G10-MUT: resolving the market before the admin gate fails G10', !order(page.replace('if (entitlement.isAdmin) {', 'const early = await resolveBillingMarket(supabase, user)\n  if (entitlement.isAdmin) {').replace(/const \{ market, locked: marketLocked \} = await resolveBillingMarket\(supabase, user\)/, '')))
  const shopifyFiles = walk('lib/shopify')
  const touched = shopifyFiles.filter((f) => /billing\/market|server-market|billing_market\b/.test(read(f)))
  check('G10: no Shopify module reads the billing market', touched.length === 0, touched.join(', '))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
export {}
