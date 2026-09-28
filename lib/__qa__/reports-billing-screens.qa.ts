/**
 * Reports and Billing on the design system (UX review P1-8, P1-9, P2-1).
 *
 *   A) formatDate(lang): one date format per language. Hebrew 27.09.2026, English
 *      "Sep 27, 2026"; never the American 9/27/2026 the Reports banner printed.
 *      With a time, the date comes first and each number is an LTR isolate.
 *   B) Reports (source): the report head is a surface card with a brand stripe (no
 *      saturated banner, no raw colour classes), its date comes from formatDate, the
 *      report type loads on change with no "Load report" button, the monthly
 *      reports stay at the top, and the type names are one language each.
 *   C) Billing (render, both languages): the plans, prices and features the
 *      dictionary and PLAN_LIMITS give are all there, each paid plan keeps its
 *      PayPal container, the currency prompt keeps both choices, and a
 *      Shopify-billed account sees the Shopify panel and nothing of PayPal, with
 *      that branch's markup unchanged. No raw slate/blue classes outside it.
 * Every guard has a MUTATION CONTROL: the same check on a broken copy fails.
 *
 * Run: npx tsx lib/__qa__/reports-billing-screens.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { formatDate } from '../i18n/format-date'
import { getDashboardDictionary } from '../i18n/dashboard/getDashboardDictionary'
import { DashboardLanguageProvider } from '../i18n/dashboard/useDashboardLanguage'
import { PLAN_LIMITS } from '../subscription'
import type { Locale } from '../i18n/locales'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
/** Tailwind's own palette colours, which the design tokens replace. */
const RAW_COLOUR = /\b(?:bg|text|border|ring|from|to|via)-(?:slate|gray|blue|indigo|sky|cyan|green|emerald|red|amber|yellow)-\d{2,3}\b/

// ── A) formatDate ───────────────────────────────────────────────────────────
console.log('\nA) formatDate(lang): one format per language')
{
  const d = new Date(2026, 8, 27, 17, 9) // local 27 Sep 2026, 17:09
  const he = formatDate('he'), en = formatDate('en')
  const notAmerican = (s: string) => !/\b9\/27\/2026\b/.test(s)
  check('A1: Hebrew date is 27.09.2026', he.date(d) === '27.09.2026', he.date(d))
  check('A2: English date spells the month (Sep 27, 2026)', en.date(d) === 'Sep 27, 2026', en.date(d))
  check('A3: neither is the American 9/27/2026', notAmerican(he.date(d)) && notAmerican(en.date(d)))
  check('A3-MUT: the old toLocaleDateString(\'en-US\') fails A3', !notAmerican(d.toLocaleDateString('en-US')))
  const heDt = he.dateTime(d)
  const dateFirst = (s: string) => s.indexOf('27.09.2026') >= 0 && s.indexOf('27.09.2026') < s.indexOf('17:09')
  const isolated = (s: string) => /⁦27\.09\.2026⁩ · ⁦17:09⁩/.test(s)
  check('A4: Hebrew date-time puts the date first, each number in an LTR isolate', dateFirst(heDt) && isolated(heDt), JSON.stringify(heDt))
  check('A4-MUT: a bare "27.09.2026 17:09" (which RTL lays out time-first) fails A4', !isolated('27.09.2026 17:09'))
  check('A5: English date-time is "Sep 27, 2026 · 5:09 PM"', en.dateTime(d) === 'Sep 27, 2026 · 5:09 PM', en.dateTime(d))
  check('A6: a missing or invalid date is a dash, never "Invalid Date"', he.date(null) === '—' && en.dateTime('nope') === '—' && he.dateTime(undefined) === '—')
}

// ── B) Reports source ───────────────────────────────────────────────────────
console.log('\nB) Reports: surface card with a brand stripe, one date format, loads on change')
{
  const src = strip(read('app/(dashboard)/reports/page.tsx'))
  const noBanner = (s: string) => !/bg-(?:blue|indigo)-600/.test(s) && !RAW_COLOUR.test(s)
  check('B1: no saturated banner and no raw palette colours', noBanner(src), (RAW_COLOUR.exec(src) || [])[0])
  check('B1-MUT: the old banner fails B1', !noBanner(src + '<div className="bg-blue-600 text-white rounded-xl p-6 mb-6">'))
  const stripe = (s: string) => /<Card className="[^"]*border-s-4 border-s-action/.test(s)
  check('B2: the report head is a Card with a 4px brand stripe on the reading side', stripe(src))
  check('B2-MUT: a card without the stripe fails B2', !stripe(src.replace(/border-s-4 border-s-action/g, '')))
  const oneDate = (s: string) => /formatDate\(language\)\.date\(/.test(s) && !/toLocaleDateString\(|toLocaleString\(|formatDateTime\(/.test(s)
  check('B3: dates come from formatDate(language), none from toLocale*/formatDateTime', oneDate(src))
  check('B3-MUT: the old "new Date().toLocaleDateString(\'en-US\')" fails B3', !oneDate(src + "{new Date().toLocaleDateString('en-US')}"))
  const loadsOnChange = (s: string) => /onChange=\{\(e\) => handleReportTypeChange\(/.test(s) && !/t\.loadReport/.test(s)
  check('B4: the report type loads on change, with no "Load report" button', loadsOnChange(src))
  check('B4-MUT: bringing the button back fails B4', !loadsOnChange(src + '<Button>{t.loadReport}</Button>'))
  const order = (s: string) => { const m = s.indexOf('<MonthlyReports'), r = s.indexOf('data-on-demand-report'); return m >= 0 && r > m }
  check('B5: the monthly reports stay at the top, the on-demand report below them', order(src))
  check('B5-MUT: the on-demand report above the monthly ones fails B5', !order('<section data-on-demand-report="x" />' + src.replace('data-on-demand-report', '')))
  const HEBREW = /[א-ת]/
  const oneLanguage = (heLabel: string, enLabel: string) => !/[A-Za-z]{2,}/.test(heLabel.replace(/\bGoogle\b|\bAI\b/g, '')) && !HEBREW.test(enLabel)
  const he = getDashboardDictionary('he').reports, en = getDashboardDictionary('en').reports
  check('B6: each report type name is one language (brand names aside)',
    oneLanguage(he.googleReportType, en.googleReportType) && oneLanguage(he.aiReportType, en.aiReportType), he.googleReportType)
  check('B6-MUT: the old "דירוגי Google Organic / Maps" fails B6', !oneLanguage('דירוגי Google Organic / Maps', en.googleReportType))
  // Report generation and export are untouched: the same routes, the same exporters.
  const exportsKept = (s: string) => s.includes("fetch('/api/reports/export-pdf'") && s.includes('exportToExcel({') && s.includes('exportAIVisibilityToExcel({')
  check('B7: PDF and Excel export still go through the same route and exporters', exportsKept(src))
  check('B7-MUT: an export that skips the PDF route fails B7', !exportsKept(src.replace("fetch('/api/reports/export-pdf'", "fetch('/api/x'")))
}

// ── C) Billing render ───────────────────────────────────────────────────────
console.log('\nC) Billing: same plans, prices and PayPal containers; Shopify panel unchanged')
{
  const BillingView = require('../../app/(dashboard)/billing/BillingView').default
  const ILS = { trial: 0, regular: PLAN_LIMITS.regular.price, advanced: PLAN_LIMITS.advanced.price, premium: PLAN_LIMITS.premium.price, large_agency: PLAN_LIMITS.large_agency.price }
  const USD = { trial: 0, regular: PLAN_LIMITS.regular.priceUSD, advanced: PLAN_LIMITS.advanced.priceUSD, premium: PLAN_LIMITS.premium.priceUSD, large_agency: PLAN_LIMITS.large_agency.priceUSD }
  const base = { plan: 'trial', hasActiveSubscription: false, trialActive: true, trialEndsAt: '2026-10-04T00:00:00Z', subscriptionEndsAt: null,
    hasPaypalSubscriptionId: false, renewalCancelled: false, shopifyConnected: false, shopifyMigrationStatus: null, planPricesILS: ILS, planPricesUSD: USD }
  const render = (locale: Locale, props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale } as never, createElement(BillingView, { ...base, ...props })))
  const PAID = ['regular', 'advanced', 'premium', 'large_agency'] as const

  for (const locale of ['he', 'en'] as Locale[]) {
    const t = getDashboardDictionary(locale).billing
    const market = locale === 'he' ? 'ILS' : 'USD'
    const sym = market === 'USD' ? '$' : '₪'
    const prices = market === 'USD' ? USD : ILS
    const html = render(locale, { market })
    const plansComplete = (h: string) => {
      const missing: string[] = []
      for (const p of PAID) {
        if (!h.includes(`${sym}${prices[p]}`)) missing.push(`${p} price`)
        if (!h.includes(`id="paypal-button-${p}"`)) missing.push(`${p} PayPal container`)
        if (!h.includes(esc(t.planLabels[p]))) missing.push(`${p} name`)
        for (const f of t.features[p]) if (!h.includes(esc(f))) missing.push(`${p}: ${f}`)
      }
      if (!h.includes(`${sym}0`) || !h.includes(esc(t.trialName))) missing.push('trial')
      for (const f of t.features.trial) if (!h.includes(esc(f))) missing.push(`trial: ${f}`)
      if (!h.includes(esc(t.recommended)) || !h.includes(esc(t.keywordCheckNote))) missing.push('recommended/note')
      return missing
    }
    const missing = plansComplete(html)
    check(`C1 (${locale}) every plan with its ${market} price, features and PayPal container`, missing.length === 0, missing.join(', '))
    check(`C1-MUT (${locale}) a plan whose price changed fails C1`, plansComplete(html.split(`${sym}${prices.advanced}`).join(`${sym}1`)).length > 0)
    check(`C2 (${locale}) the header is the screen header (text-title), not the old text-3xl`, /<h1 class="[^"]*text-title/.test(html) && !/text-3xl/.test(html))

    const prompt = render(locale, { market: null })
    const promptOk = (h: string) => h.includes(esc(t.marketPrompt.title)) && h.includes(esc(t.marketPrompt.ilsOption)) && h.includes(esc(t.marketPrompt.usdOption)) && !/paypal-button-/.test(h)
    check(`C3 (${locale}) no stored currency: the prompt with both choices, no plan or PayPal button`, promptOk(prompt))
    check(`C3-MUT (${locale}) a prompt that also shows PayPal buttons fails C3`, !promptOk(prompt + '<div id="paypal-button-regular"></div>'))

    const shop = render(locale, { market, shopifyConnected: true, trialActive: false })
    const shopOk = (h: string) => h.includes('href="/api/shopify/billing/start-intent"') && h.includes(esc(t.shopify.title)) && !/paypal-button-|data-plan-card/.test(h) && !h.includes(esc(t.marketPrompt.title))
    check(`C4 (${locale}) a Shopify-billed account sees the Shopify panel and nothing of PayPal`, shopOk(shop))
    check(`C4-MUT (${locale}) a plan card in the Shopify view fails C4`, !shopOk(shop + '<div data-plan-card="regular"></div>'))
  }

  // The Shopify branch is Shopify-specific: its markup stays exactly as it was
  // (visual consistency only where a component is shared).
  const src = read('app/(dashboard)/billing/BillingView.tsx')
  const shopBranch = (s: string) => (/\) : shopifyConnected \? \(([\s\S]*?)\n {6}\) : \(/.exec(s) || [])[1] ?? ''
  const SHOPIFY_BRANCH_CLASSES = [
    'mb-8 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg',
    'text-xl font-bold text-slate-900 dark:text-slate-100 mb-2',
    'inline-block px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors',
  ]
  const shopKept = (s: string) => SHOPIFY_BRANCH_CLASSES.every((c) => shopBranch(s).includes(`className="${c}"`))
  check('C5: the Shopify panel markup is unchanged', shopKept(src))
  check('C5-MUT: restyling the Shopify button fails C5', !shopKept(src.replace('bg-blue-600 text-white font-semibold hover:bg-blue-700', 'bg-action text-action-ink')))
  const rest = strip(src.replace(shopBranch(src), ''))
  check('C6: outside the Shopify panel, no raw palette colours', !RAW_COLOUR.test(rest), (RAW_COLOUR.exec(rest) || [])[0])
  check('C6-MUT: the old plan card colours fail C6', RAW_COLOUR.test(rest + 'border-blue-500 bg-blue-50'))
  // The currency is still an explicit choice through the same route (P1-9's default
  // by language is a billing-logic change left to the owner).
  const choice = (s: string) => s.includes("fetch('/api/billing-market/select'") && /market === null \?/.test(s)
  check('C7: no stored currency still means the explicit choice, through the same route', choice(strip(src)))
  check('C7-MUT: defaulting the market in the view fails C7', !choice(strip(src).replace(/market === null \?/, "(market ?? 'ILS') === null ?")))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
export {}
