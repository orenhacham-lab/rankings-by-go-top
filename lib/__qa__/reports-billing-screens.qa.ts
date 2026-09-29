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
 *      PayPal container, and a Shopify-billed account sees the Shopify panel and
 *      nothing of PayPal. That panel is on the primitives (R4: a Card, the two
 *      migration states as Notices, the start-intent route still a plain GET
 *      link, drawn as the one primary button). No raw slate/blue classes
 *      anywhere, and no amber (commit) colour on the plan cards. Confirmations
 *      and messages are in the page (ConfirmDialog, Notice), never a browser
 *      alert/confirm, and never the route's or PayPal's own error text.
 *      With no stored currency the plans show at once in the language's
 *      currency (he ILS, en USD) with a visible switch and no PayPal button; the
 *      one request that persists the currency is byte-for-byte the old one.
 *   D) Copy: the billing, trial-bar and reports dictionaries address the reader
 *      in the plural, as the rest of the Hebrew app does, and carry no em-dash.
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
  // Final review G3: a rail that bends round the card's corner reads cheap. The report
  // head is a plain surface Card; its kind is the overline in the action colour.
  const plainHead = (s: string) => /<Card className="mb-6">\s*<div[^>]*data-report-card=""/.test(s) && !/border-s-(?:\[\d+px\]|\d)/.test(s)
    && /<p className="text-overline font-semibold text-action">\{kind\}<\/p>/.test(s)
  check('B2: the report head is a plain surface Card (no curved rail), its kind an action-coloured overline', plainHead(src))
  check('B2-MUT: the old 4px stripe back on the card fails B2', !plainHead(src.replace('<Card className="mb-6">', '<Card className="mb-6 border-s-4 border-s-action">')))
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
    const rawPrices = market === 'USD' ? USD : ILS
    // w7 P2-13: grouped like the public pricing page (₪1,999, not ₪1999), in the screen's locale.
    const prices = Object.fromEntries(Object.entries(rawPrices).map(([k, v]) => [k, Number(v).toLocaleString(locale === 'en' ? 'en-US' : 'he-IL')])) as Record<keyof typeof rawPrices, string>
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
    const promptOk = (h: string) => {
      const missing: string[] = []
      for (const p of PAID) {
        if (!h.includes(`data-plan-card="${p}"`)) missing.push(`${p} card`)
        if (!h.includes(`${sym}${prices[p]}`)) missing.push(`${p} ${market} price`)
        if (!h.includes(`data-continue-to-payment="${p}"`)) missing.push(`${p} continue button`)
      }
      if (!h.includes(`data-billing-market-choice="${market}"`)) missing.push(`default display currency ${market}`)
      if (!new RegExp(`aria-pressed="true"[^>]*data-currency-option="${market}"`).test(h)) missing.push('switch default')
      if (!h.includes('data-currency-option="ILS"') || !h.includes('data-currency-option="USD"')) missing.push('switch options')
      if (!h.includes(esc(t.marketPrompt.ilsOption)) || !h.includes(esc(t.marketPrompt.usdOption))) missing.push('switch labels')
      if (/paypal-button-/.test(h)) missing.push('a PayPal button before the currency is stored')
      return missing
    }
    const promptMissing = promptOk(prompt)
    check(`C3 (${locale}) no stored currency: every plan shows at once in ${market}, with the currency switch and no PayPal button`, promptMissing.length === 0, promptMissing.join(', '))
    check(`C3-MUT (${locale}) a view that also shows PayPal buttons fails C3`, promptOk(prompt + '<div id="paypal-button-regular"></div>').length > 0)
    check(`C3-MUT (${locale}) the old prompt without plans fails C3`, promptOk(prompt.replace(/data-plan-card="[^"]*"/g, '')).length > 0)
    check(`C3-MUT (${locale}) the other language's currency by default fails C3`, promptOk(prompt.split(`${sym}${prices.regular}`).join('x')).length > 0)

    const shop = render(locale, { market, shopifyConnected: true, trialActive: false })
    const shopOk = (h: string) => h.includes('href="/api/shopify/billing/start-intent"') && h.includes(esc(t.shopify.title)) && !/paypal-button-|data-plan-card/.test(h) && !h.includes(esc(t.marketPrompt.title))
    check(`C4 (${locale}) a Shopify-billed account sees the Shopify panel and nothing of PayPal`, shopOk(shop))
    check(`C4-MUT (${locale}) a plan card in the Shopify view fails C4`, !shopOk(shop + '<div data-plan-card="regular"></div>'))
  }

  // The Shopify panel on the primitives (R4). WHAT it links to and how is
  // unchanged (first-party-billing-intent 2e/2f pin the plain GET link); only
  // the drawing moved from raw slate/blue/rounded-lg/dark: to Card, Notice and
  // the button classes.
  const src = read('app/(dashboard)/billing/BillingView.tsx')
  const shopBranch = (s: string) => (/\) : shopifyConnected \? \(([\s\S]*?)\n {6}\) : \(/.exec(s) || [])[1] ?? ''
  const shopOk = (s: string) => {
    const b = shopBranch(s), code = strip(b)
    return /^\s*<Card\b/.test(b)
      && /<Notice tone="wait">\{t\.shopify\.migrationPending\}<\/Notice>/.test(code)
      && /<Notice tone="warn">\{t\.shopify\.migrationNeedsAttention\}<\/Notice>/.test(code)
      && /<a\s+href="\/api\/shopify\/billing\/start-intent"\s+className=\{buttonClasses\(\{ variant: 'primary' \}\)\}\s*>/.test(code)
      && !RAW_COLOUR.test(code) && !/\bdark:|\brounded-lg\b|\btext-(?:xl|sm)\b|\bbg-white\b|\btext-white\b/.test(code)
      && !/onClick|fetch\(|<form\b/.test(code)
  }
  check('C5: the Shopify panel is a Card with Notices and the start-intent GET link drawn as the primary button', shopOk(src))
  check('C5-MUT: the old blue button fails C5', !shopOk(src.replace("className={buttonClasses({ variant: 'primary' })}", 'className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"')))
  check('C5-MUT: the pending state as a hand-made blue box fails C5', !shopOk(src.replace('<Notice tone="wait">{t.shopify.migrationPending}</Notice>', '<p className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">{t.shopify.migrationPending}</p>')))
  check('C5-MUT: the link turned into a script-driven button fails C5', !shopOk(src.replace('href="/api/shopify/billing/start-intent"', 'href="/api/shopify/billing/start-intent" onClick={() => fetch(\'/x\')}')))
  for (const locale of ['he', 'en'] as const) {
    const t = getDashboardDictionary(locale).billing
    const states = (h: string) => h.includes('data-notice="wait"') && h.includes(esc(t.shopify.migrationPending))
    const pending = render(locale, { market: locale === 'en' ? 'USD' : 'ILS', shopifyConnected: true, trialActive: false, shopifyMigrationStatus: 'pending' })
    const failed = render(locale, { market: locale === 'en' ? 'USD' : 'ILS', shopifyConnected: true, trialActive: false, shopifyMigrationStatus: 'paypal_cancel_failed' })
    check(`C5b (${locale}) the two migration states render as Notices (wait, warn) inside the Shopify card`,
      states(pending) && failed.includes('data-notice="warn"') && failed.includes(esc(t.shopify.migrationNeedsAttention)) && !/bg-blue-|bg-amber-/.test(pending + failed))
    check(`C5b-MUT (${locale}) a pending view without its notice fails C5b`, !states(pending.replace('data-notice="wait"', '')))
  }
  const rest = strip(src)
  check('C6: no raw palette colours anywhere on the billing view (the Shopify panel included)', !RAW_COLOUR.test(rest), (RAW_COLOUR.exec(rest) || [])[0])
  check('C6-MUT: the old plan card colours fail C6', RAW_COLOUR.test(rest + 'border-blue-500 bg-blue-50'))
  // The display currency is display only. The currency is persisted by exactly
  // the request the old prompt sent (same route, method, header and body), only
  // from a plan's "continue" button with the currency on screen, and PayPal's
  // checkout still receives the STORED market, never the display one.
  const code = strip(src)
  const OLD_REQUEST = `const res = await fetch('/api/billing-market/select', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ market: chosen }),
      })`
  const persistOk = (s: string) =>
    s.includes(OLD_REQUEST)
    && s.split('/api/billing-market/select').length === 2
    && (s.match(/fetch\(/g) || []).length === 2 // this request and /api/paypal/cancel, nothing else
    && /onClick=\{\(\) => selectMarket\(shownMarket\)\}/.test(s)
    && (s.match(/selectMarket\(/g) || []).length === 1 // called from the continue button only
    && /onClick=\{\(\) => setPickedMarket\(m\)\}/.test(s)
    && s.includes('{market !== null && <BillingClient market={market} />}')
    && /market === null \? \(\s*<Button/.test(s)
  check('C7: the currency is saved only by the unchanged request, from a plan\'s continue button; PayPal gets the stored market', persistOk(code))
  check('C7-MUT: a changed request body fails C7', !persistOk(code.replace('JSON.stringify({ market: chosen })', 'JSON.stringify({ market: chosen, source: "plans" })')))
  check('C7-MUT: a continue button that saves a fixed currency fails C7', !persistOk(code.replace('selectMarket(shownMarket)', "selectMarket('ILS')")))
  check('C7-MUT: a switch that saves on click fails C7', !persistOk(code.replace('onClick={() => setPickedMarket(m)}', 'onClick={() => { setPickedMarket(m); selectMarket(m) }}')))
  check('C7-MUT: PayPal given the display currency fails C7', !persistOk(code.replace('<BillingClient market={market} />', '<BillingClient market={shownMarket} />')))
  const noAmber = (s: string) => !/\b(?:bg|border|ring|text)-commit\b/.test(s)
  check('C8: no amber (commit) colour on the billing screen; "recommended" uses the action colour', noAmber(code) && /bg-action px-2\.5 py-0\.5 text-caption font-semibold text-action-ink/.test(code))
  check('C8-MUT: the old amber "recommended" badge fails C8', !noAmber(code + ' bg-commit text-commit-ink'))
  const client = strip(read('app/(dashboard)/billing/client.tsx'))
  check('C9: the PayPal notices are token cards, not cream/amber', !RAW_COLOUR.test(client), (RAW_COLOUR.exec(client) || [])[0])
  check('C9-MUT: the old amber notice fails C9', RAW_COLOUR.test(client + 'bg-amber-50 border-amber-200'))
  // Messages and confirmations in the page, in our words (R4). Only how they
  // are shown changed: the same question comes before the same request.
  const inPage = (view: string, pp: string) =>
    !/(?<![\w.])(?:window\.)?(?:alert|confirm|prompt)\(/.test(view.replace(/await confirm\(\{/g, '')) && !/\balert\(/.test(pp)
    && /const \{ confirm, dialog: confirmDialog \} = useConfirm\(\)/.test(view) && /tone: 'danger',/.test(view) && /\{confirmDialog\}/.test(view)
    && /const ok = await confirm\(\{[\s\S]*?\}\)\s*\n\s*if \(!ok\) return\s*\n\s*setCancelling\(true\)[\s\S]*?fetch\('\/api\/paypal\/cancel', \{ method: 'POST' \}\)/.test(view)
  check('C10: cancelling asks through ConfirmDialog (danger) before the unchanged request; no alert/confirm on the billing screens', inPage(code, client))
  check('C10-MUT: window.confirm back in BillingView fails C10', !inPage(code.replace('const ok = await confirm({', 'const ok = window.confirm(t.manage.confirmCancel) && await confirm({'), client))
  check('C10-MUT: an alert() back in the PayPal client fails C10', !inPage(code, client + "\nalert('x')"))
  const noRaw = (view: string, pp: string) =>
    !/result\.error|errorMsg\}|\$\{errorMsg|\$\{errorDetails|\$\{planId|envVarName\}|\{cancelMessage\}/.test(view + pp.replace(/console\.(?:error|warn|log)\([^\n]*\n/g, '\n'))
    && /t\.manage\.cancelError/.test(view) && /setMessage\(\{ tone: 'bad', text: t\.activateSubscriptionError \}\)/.test(pp)
  check('C11: billing never shows the route\'s or PayPal\'s own error text (console only)', noRaw(code, client))
  check('C11-MUT: the old "cancelError + result.error" line fails C11', !noRaw(code + 'setCancelMessage(`${t.manage.cancelError} ${result.error || \'\'}`)', client))
  check('C11-MUT: PayPal\'s message in the notice fails C11', !noRaw(code, client.replace("setMessage({ tone: 'bad', text: t.createSubscriptionError })", "setMessage({ tone: 'bad', text: `${t.createSubscriptionError} ${errorMsg}` })")))
}

// ── D) Copy: one form of address, no em-dash ────────────────────────────────
console.log('\nD) Copy: plural address and no em-dash in billing, trial bar and reports')
{
  const he = getDashboardDictionary('he')
  const en = getDashboardDictionary('en')
  const strings = (v: unknown, out: string[] = []): string[] => {
    if (typeof v === 'string') out.push(v)
    else if (typeof v === 'function') { for (const a of [2, 5, 'X']) { try { strings((v as (x: unknown, y?: unknown) => unknown)(a, a), out) } catch { /* not for this arg */ } } }
    else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
    return out
  }
  const monthly = require('../../components/reports/monthly/copy') as { monthlyCopy: (l: Locale) => unknown }
  const surfaces = (d: typeof he, m: unknown) => ({ billing: d.billing, trialBar: d.trialBar, reports: d.reports, scans: d.scans, gscWidgets: d.gscWidgets, engines: [d.common.searchTypeGoogleDesktop, d.common.searchTypeGoogleMobile], monthly: m })
  // Singular (אתה/את) forms of address and imperatives that the rest of the app writes in the plural.
  const SINGULAR = /(^|[\s(])(?:אתה|שלך|לך|בחר|בדוק|רענן|רענן\/י|שדרג|בטל|חבר|סנכרן|נסה|טען|אנא)(?=[\s.,:!?)]|$)/
  const offenders = (d: typeof he, m: unknown) => {
    const out: string[] = []
    for (const [k, v] of Object.entries(surfaces(d, m))) for (const x of strings(v)) if (SINGULAR.test(x) || x.includes('—')) out.push(`${k}: ${x}`)
    return out
  }
  const heBad = offenders(he, monthly.monthlyCopy('he'))
  check('D1: Hebrew billing, trial bar and reports copy use the plural and no em-dash', heBad.length === 0, heBad.join(' | '))
  check('D1-MUT: an old singular line fails D1', offenders({ ...he, billing: { ...he.billing, subtitle: 'בחר את התוכנית המתאימה לך' } } as unknown as typeof he, monthly.monthlyCopy('he')).length > 0)
  check('D1-MUT: an em-dash fails D1', offenders({ ...he, reports: { ...he.reports, title: 'דוחות — כל הנתונים' } } as unknown as typeof he, monthly.monthlyCopy('he')).length > 0)
  const enDash = strings(surfaces(en, monthly.monthlyCopy('en'))).filter((x) => x.includes('—'))
  check('D2: English billing, trial bar and reports copy carry no em-dash either', enDash.length === 0, enDash.join(' | '))
  const excel = read('lib/utils.ts')
  check('D3: the Excel export\'s engine labels carry no em-dash', !/גוגל אורגני —/.test(excel))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
export {}
