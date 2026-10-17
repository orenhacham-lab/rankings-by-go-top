/**
 * PLAN DETAILS A NON-TECHNICAL CUSTOMER UNDERSTANDS.
 *
 * The owner asked whether an end customer can understand what each plan card
 * says. The review found five things a small-business owner cannot read:
 *   1. "Google checks" / "AI checks" were never explained;
 *   2. "billing period" is the engineers' word for "a month";
 *   3. "project" means a website to the customer;
 *   4. the main value, articles written and published to the customer's own
 *      site, was buried or second on the card;
 *   5. the "in every plan" list claimed things nobody had re-checked.
 *
 * This suite keeps each of them fixed, against the real builders, the real
 * dictionaries and the real page sources. Every group ends with a MUTATION
 * CONTROL: the same assertion run on a deliberately broken copy must fail.
 * Numbers are not this suite's business (final-plan-matrix.qa.ts and
 * pricing-copy-and-layout.qa.ts pin them); only wording and order are.
 *
 * Run: npx tsx lib/plans/__qa__/plan-copy-plain.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MAX_ARTICLES_PER_WEEK_PER_SITE } from '../../content/automation/schedule'
import { PLAN_CATALOG, PLAN_CODES, TRIAL_CATALOG, type PlanCode } from '../catalog'
import { planLimitLines, planArticleLine, trialLimitLines, CHECKS_EXPLAINER } from '../features'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import { pricingHe } from '../../i18n/public/pricing-he'
import { pricingEn } from '../../i18n/public/pricing-en'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const PAGES: { rel: string; lang: 'he' | 'en'; copy: typeof pricingHe }[] = [
  { rel: 'app/(public)/pricing/page.tsx', lang: 'he', copy: pricingHe },
  { rel: 'app/(public)/en/pricing/page.tsx', lang: 'en', copy: pricingEn },
]
const LOCALES = ['he', 'en'] as const

// A server render needs the CSS module stubbed (Next compiles it; node cannot).
const Mod: any = require('module')
Mod._extensions['.css'] = (m: any) => { m.exports = new Proxy({}, { get: (_t: unknown, k: string) => (k === '__esModule' ? false : String(k)) }) }

/** The words an owner of a small business does not use for what they buy. */
const JARGON = /מחזור חיוב|billing (period|cycle)|פרויקט|\bprojects?\b/i
/** The two quota nouns that used to stand unexplained. */
const BARE_CHECK = /בדיקות גוגל|בדיקת גוגל|בדיקות AI|בדיקת AI|Google checks?\b|AI checks?\b/
const DASHES = /[—–]/

/** Every string in a dictionary subtree, so one regex covers all of a page's words. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
  return out
}

/** The whole contract on a map plan → lines. Used on the real lines and on broken copies. */
function plain(lines: Record<PlanCode, string[]>, lang: 'he' | 'en'): { ok: boolean; why: string } {
  for (const code of PLAN_CODES) {
    const l = lines[code]
    const bad = l.find((x) => JARGON.test(x) || BARE_CHECK.test(x) || DASHES.test(x))
    if (bad) return { ok: false, why: `${code}: ${bad}` }
    const month = lang === 'he' ? /בחודש/ : /a month/
    if (!month.test(l[0]) || !(lang === 'he' ? /אוטומטית/ : /automatically/).test(l[0])) return { ok: false, why: `${code}: first line is not the value line: ${l[0]}` }
    if (!(lang === 'he' ? /מאמרים/ : /articles/).test(l[0])) return { ok: false, why: `${code}: first line has no articles: ${l[0]}` }
    if (!l.slice(3).every((x) => month.test(x))) return { ok: false, why: `${code}: a check line does not say "a month": ${l.slice(3).join(' | ')}` }
    if (!(lang === 'he' ? /אתר/ : /website/).test(l[1])) return { ok: false, why: `${code}: second line is not the website line: ${l[1]}` }
  }
  return { ok: true, why: '' }
}
const realLines = (lang: 'he' | 'en') => Object.fromEntries(PLAN_CODES.map((c) => [c, planLimitLines(c, lang)])) as Record<PlanCode, string[]>

function main() {
  console.log('Plan details a non-technical customer understands\n')

  // ── A) the limit lines: plain words, the value first ──────────────────────
  console.log('A) the five lines on every plan card')
  {
    for (const lang of LOCALES) {
      const r = plain(realLines(lang), lang)
      check(`A1-${lang}: no jargon, no bare "checks", a month in words, the article line first, then the website`, r.ok, r.why)
    }
    for (const code of PLAN_CODES) for (const lang of LOCALES) {
      check(`A2-${lang}-${code}: the FIRST line is the article line and names the automatic writing and publishing`,
        planLimitLines(code, lang)[0] === planArticleLine(code, lang)
        && planArticleLine(code, lang).startsWith(`${PLAN_CATALOG[code].maxArticlesPerPeriodAccountWide} `))
    }
    // Where the multi-website plans share the allowance, the line says with what, in words a customer uses.
    check('A3: Premium and Agency say the articles are shared across the websites; Basic and Advanced do not',
      PLAN_CODES.every((c) => {
        const he = planArticleLine(c, 'he'), en = planArticleLine(c, 'en')
        return PLAN_CATALOG[c].maxProjects > 1
          ? he.includes('משותפים לכל האתרים') && en.includes('shared across all your websites')
          : !he.includes('משותפים') && !en.includes('shared')
      }))
    // The trial card is written the same way.
    for (const lang of LOCALES) {
      const t = trialLimitLines(lang)
      check(`A4-${lang}: the trial lines are plain too (no jargon, no bare "checks", numbers from the trial catalog)`,
        t.every((x) => !JARGON.test(x) && !BARE_CHECK.test(x) && !DASHES.test(x))
        && t.join(' ').includes(String(TRIAL_CATALOG.maxGoogleChecksLifetime)) && t.join(' ').includes(String(TRIAL_CATALOG.maxAIChecksLifetime))
        && t.join(' ').includes(String(TRIAL_CATALOG.maxKeywordsPerProject)) && t.join(' ').includes(String(TRIAL_CATALOG.days)), t.join(' | '))
      const dict = (getDashboardDictionary(lang) as any).billing.features.trial as string[]
      check(`A5-${lang}: the dashboard trial card shows exactly those lines`, JSON.stringify(dict) === JSON.stringify(t))
    }
    // MUTATION CONTROLS: each old defect, put back, must fail the contract.
    for (const lang of LOCALES) {
      const oldPeriod = lang === 'he' ? 'בכל מחזור חיוב' : 'per billing period'
      const oldChecks = lang === 'he' ? 'עד 50 בדיקות גוגל בחודש' : 'Up to 50 Google checks a month'
      const oldProject = lang === 'he' ? 'עד 10 פרויקטים' : 'Up to 10 projects'
      const base = realLines(lang)
      const mut = (f: (l: string[]) => string[]) => Object.fromEntries(PLAN_CODES.map((c) => [c, f(base[c].slice())])) as Record<PlanCode, string[]>
      check(`A6-${lang}-MUT: "billing period" back on a check line fails`, !plain(mut((l) => { l[3] = `${l[3]} ${oldPeriod}`; return l }), lang).ok)
      check(`A7-${lang}-MUT: the bare "Google checks" wording back fails`, !plain(mut((l) => { l[3] = oldChecks; return l }), lang).ok)
      check(`A8-${lang}-MUT: "project" back on the website line fails`, !plain(mut((l) => { l[1] = oldProject; return l }), lang).ok)
      check(`A9-${lang}-MUT: the article line moved down to second place fails`, !plain(mut((l) => [l[1], l[0], ...l.slice(2)]), lang).ok)
      check(`A10-${lang}-MUT: the old wording without "a month" on an AI line fails`,
        !plain(mut((l) => { l[4] = l[4].replace(lang === 'he' ? ' בחודש' : ' a month', ''); return l }), lang).ok)
    }
  }

  // ── B) the same words wherever a plan is described ────────────────────────
  console.log('\nB) pricing pages, usage section and the dashboard cards use the same words')
  {
    const sections = (lang: 'he' | 'en') => {
      const c = lang === 'he' ? pricingHe : pricingEn
      return { plans: strings(c.plans), included: strings(c.included), usage: strings(c.usage), faq: strings(c.faq) }
    }
    for (const lang of LOCALES) {
      const s = sections(lang)
      const all = [...s.plans, ...s.included, ...s.usage, ...s.faq]
      check(`B1-${lang}: the pricing copy says no "billing period", "billing cycle" or "project"`, !all.some((x) => JARGON.test(x)), all.filter((x) => JARGON.test(x)).join(' / '))
      check(`B2-${lang}: and no bare "Google checks" / "AI checks"`, !all.some((x) => BARE_CHECK.test(x)), all.filter((x) => BARE_CHECK.test(x)).join(' / '))
      check(`B3-${lang}: no em-dash or en-dash in the pricing copy`, !all.some((x) => DASHES.test(x)))
      check(`B4-${lang}: the line under the grid is the shared definition of both checks`,
        (lang === 'he' ? pricingHe : pricingEn).plans.checksNote === CHECKS_EXPLAINER[lang])
      const dict = getDashboardDictionary(lang) as any
      const card = [...strings(dict.billing.features), dict.billing.keywordCheckNote] as string[]
      check(`B5-${lang}: the dashboard plan cards and their note say no jargon and no bare "checks"`,
        !card.some((x) => JARGON.test(x) || BARE_CHECK.test(x) || DASHES.test(x)), card.filter((x) => JARGON.test(x) || BARE_CHECK.test(x)).join(' / '))
      check(`B6-${lang}: the dashboard note carries the same definition of both checks`, dict.billing.keywordCheckNote.includes(CHECKS_EXPLAINER[lang]))
      check(`B7-${lang}: the dashboard cards are the derived lines, value first`,
        PLAN_CODES.every((c) => JSON.stringify(dict.billing.features[c]) === JSON.stringify(planLimitLines(c, lang))))
    }
    const usageNamed = (he: { title: string }[], en: { title: string }[]) =>
      he.some((i) => i.title === 'בדיקת מיקום בגוגל') && he.some((i) => i.title === 'בדיקת נראות ב-AI')
      && en.some((i) => i.title === 'Google ranking check') && en.some((i) => i.title === 'AI visibility check')
    check('B8: the usage section names the two checks the way the plan lines do (he/en)', usageNamed(pricingHe.usage.items, pricingEn.usage.items))
    // The definition is VISIBLE text on both pages (no tooltip: it must work on a phone and with a keyboard).
    const ssr = (lang: 'he' | 'en') => {
      const { PricingChecksNote } = require(join(ROOT, 'components/public/pricing/PricingSections.tsx'))
      // The component now also renders the market's tax note (guarded in
      // components/public/__qa__/pricing-page.qa.ts section F), so it needs a
      // market; which one it is does not matter to the definition checked here.
      return renderToStaticMarkup(createElement(PricingChecksNote, { copy: lang === 'he' ? pricingHe : pricingEn, market: 'ILS' }))
    }
    for (const lang of LOCALES) {
      const html = ssr(lang)
      check(`B9-${lang}: the definition renders as plain visible text`, html.includes('data-checks-note') && html.includes(CHECKS_EXPLAINER[lang]) && !/title=|tooltip|aria-hidden/.test(html), html.slice(0, 160))
    }
    const NOTE_JSX = '<PricingChecksNote copy={copy} market={market} />'
    const noteUnderGrid = (raw: string) => { const src = strip(raw); return /<PricingChecksNote copy=\{copy\} market=\{market\} \/>/.test(src) && src.indexOf('<PricingChecksNote') < src.indexOf('<PricingUnsure') }
    const breakPage = (src: string) => src.replace(NOTE_JSX, '')
    for (const { rel } of PAGES) {
      const src = strip(read(rel))
      check(`B10: ${rel} puts the definition right under the plan grid`, noteUnderGrid(read(rel)))
      check(`B11: ${rel} still builds the card lines from the shared builder, first`,
        /const features = \[\s*\.\.\.planLimitLines\(code, '(he|en)'\),/.test(src))
    }
    // MUTATION CONTROLS
    check('B12-MUT: a page that drops the definition fails B10', !noteUnderGrid(breakPage(read(PAGES[0].rel))))
    check('B12b-MUT: a page that moves the definition below the "not sure yet" block fails B10',
      !noteUnderGrid(read(PAGES[0].rel).replace(NOTE_JSX, '').replace('<PricingUnsure', `<PricingUnsure copy={copy} checkHref="/x" />\n${NOTE_JSX}\n<PricingUnsure`)))
    check('B13-MUT: the old usage titles back fail B8',
      !usageNamed([{ title: 'בדיקת גוגל' }, { title: 'בדיקת AI' }], [{ title: 'Google check' }, { title: 'AI check' }]))
    check('B14-MUT: "billing period" back in a pricing sentence fails B1', [...strings(pricingEn.usage), 'resets every billing period'].some((x) => JARGON.test(x)))
    check('B15-MUT: a bare "Google checks" back in the FAQ fails B2', [...strings(pricingEn.faq), 'up to 30 Google checks'].some((x) => BARE_CHECK.test(x)))
    check('B16-MUT: an em-dash in a pricing sentence fails B3', [...strings(pricingHe.plans), 'כל מה \u2014 כאן'].some((x) => DASHES.test(x)))
  }

  // ── C) the period really is monthly ────────────────────────────────────────
  console.log('\nC) "a month" is true: billing is monthly, there is no other period')
  {
    const catalog = strip(read('lib/plans/catalog.ts')), checkout = strip(read('lib/paypal/checkout-plans.ts'))
    const hasAnnual = (t: string) => /annual|yearly|per year|YEAR/i.test(t)
    check('C1: no annual or yearly plan exists in the catalog or the checkout plan table', !hasAnnual(catalog + checkout))
    check('C2: every price on the pages is shown "per month" (he/en)', pricingHe.plans.perMonth === 'לחודש' && pricingEn.plans.perMonth === '/month')
    // The quota period is the subscription's own period (PayPal monthly plans) or, for a legacy row, the UTC calendar month.
    const period = strip(read('lib/billing/usage-period.ts'))
    check('C3: the quota period resolver is the subscription period or the calendar month, nothing longer',
      /utcCalendarMonthPeriod/.test(period) && /current_period_end/.test(period) && !/YEAR_MS|annual|yearly/i.test(period))
    check('C4-MUT: an annual plan added to the catalog fails C1', hasAnnual(`${catalog}\n  annual: { priceILS: 1 }`))
    check('C5-MUT: a yearly period in the resolver fails C3', /YEAR_MS|annual|yearly/i.test(`${period} const YEAR_MS = 365 * DAY_MS`))
  }

  // ── D) the "in every plan" list is true, and only true ─────────────────────
  console.log('\nD) every "in every plan" line is shipped on every plan')
  {
    for (const lang of LOCALES) {
      const c = lang === 'he' ? pricingHe : pricingEn
      const items = c.plans.everyPlan
      const joined = items.join(' | ')
      check(`D1-${lang}: the list has the claims we verified, and each reads as a plain sentence`, items.length === 6 && items.every((x) => x.length >= 10 && !DASHES.test(x) && !JARGON.test(x)), joined)
      check(`D2-${lang}: automatic scheduled publishing to WordPress, Shopify and Wix is the first line`, /WordPress|וורדפרס/.test(items[0]) && /Shopify|שופיפיי/.test(items[0]) && /Wix|וויקס/.test(items[0]), items[0])
    }
    // Source evidence per claim.
    const publish = strip(read('lib/site-platforms/publish.ts')), httpSrc = strip(read('lib/site-platforms/http.ts'))
    const wixEveryPlan = (pub: string, http: string) =>
      existsSync(join(ROOT, 'lib/site-platforms/wix.ts')) && /publishSitePoolItem/.test(pub) && /wix:/.test(pub) && !/PLAN_CATALOG|getUserEntitlement|maxProjects/.test(http)
    check('D3: Wix publishing exists, runs from the automation runner, and is not gated by plan', wixEveryPlan(publish, httpSrc))
    check('D4: WordPress and Shopify publishing orchestrators exist', existsSync(join(ROOT, 'lib/content/wordpress-publish.ts')) && existsSync(join(ROOT, 'lib/shopify/publish-article.ts')))
    const engines = strip(read('lib/ai-visibility/score.ts')).match(/SCORED_ENGINES = \[([^\]]*)\]/)?.[1].split(',').filter((x) => x.trim()).length
    check('D5: "6 AI engines" is the number of engines the product scores', engines === 6 && /\b6\b/.test(pricingHe.plans.everyPlan[2]) && /\b6\b/.test(pricingEn.plans.everyPlan[2]), String(engines))
    check('D6: PDF and Excel exports exist', existsSync(join(ROOT, 'app/api/reports/export-pdf/route.ts')) && existsSync(join(ROOT, 'lib/export/excel.ts')))
    check('D7: the site health scan exists and no plan gate sits in front of it',
      existsSync(join(ROOT, 'app/api/site-health/scan/route.ts')) && !/PLAN_CATALOG|getUserEntitlement|maxProjects/.test(strip(read('app/api/site-health/scan/route.ts'))))
    // Things that are NOT on every plan must not be claimed there: the link network is opt-in, domain-proven and never on Shopify.
    const claimed = [...pricingHe.plans.everyPlan, ...pricingEn.plans.everyPlan].join(' ')
    const claimsLinks = (t: string) => /רשת קישורים|link network|backlink|קישורים חיצוניים/i.test(t)
    check('D8: the link network (opt-in, proven domain, never Shopify) is not claimed as part of every plan', !claimsLinks(claimed))
    check('D9: the support claim stays "personal support" with no response-time or channel promise on the card',
      /תמיכה אישית$/.test(pricingHe.plans.everyPlan[5]) && /^Personal support$/.test(pricingEn.plans.everyPlan[5]))
    // MUTATION CONTROLS
    check('D10-MUT: a claim of the link network on every plan fails D8', claimsLinks(`${claimed} A link network that gives you backlinks`))
    check('D11-MUT: a plan gate in front of the site-platform routes fails D3', !wixEveryPlan(publish, `${httpSrc} const e = await getUserEntitlement(uid)`))
    check('D12-MUT: a publish module without the Wix adapter fails D3', !wixEveryPlan(publish.replace('wix:', 'wixx:'), httpSrc))
    check('D13-MUT: 7 engines on the card would not equal the 6 the product scores', !/\b6\b/.test(pricingEn.plans.everyPlan[2].replace('6', '7')))
  }

  // ── E) nothing priced or entitled moved ────────────────────────────────────
  console.log('\nE) text only: no number, price, plan code or entitlement changed')
  {
    const n = (c: PlanCode) => PLAN_CATALOG[c]
    check('E1: the catalog numbers are the shipped ones',
      n('regular').priceILS === 249 && n('advanced').priceILS === 549 && n('premium').priceILS === 999 && n('large_agency').priceILS === 1999
      && n('regular').maxArticlesPerPeriodAccountWide === 4 && n('advanced').maxArticlesPerPeriodAccountWide === 12
      && n('premium').maxArticlesPerPeriodAccountWide === 50 && n('large_agency').maxArticlesPerPeriodAccountWide === 200
      && n('advanced').maxProjects === 1 && n('premium').maxProjects === 10)
    const f = strip(read('lib/plans/features.ts'))
    // Pure text, with ONE exception: the per-site weekly ceiling, imported as a
    // number so the multi-site line cannot promise a rate the scheduler refuses
    // to publish. Nothing else from the scheduling module may come in.
    check('E2: the wording module imports nothing but the catalog, the locale type and the per-site ceiling',
      [...f.matchAll(/^import .*$/gm)].every((m) => /from '\.\/catalog'|from '@\/lib\/i18n\/locales'/.test(m[0])
        || m[0] === "import { MAX_ARTICLES_PER_WEEK_PER_SITE as PER_SITE } from '@/lib/content/automation/schedule'"),
      [...f.matchAll(/^import .*$/gm)].map((m) => m[0]).join(' | '))
    check('E2a: the multi-site line states that ceiling from the constant, never a typed number',
      MAX_ARTICLES_PER_WEEK_PER_SITE === 5
      && planLimitLines('premium', 'en').some((l) => l.includes(`up to ${MAX_ARTICLES_PER_WEEK_PER_SITE} a week per website`))
      && planLimitLines('large_agency', 'he').some((l) => l.includes(`עד ${MAX_ARTICLES_PER_WEEK_PER_SITE} בשבוע לכל אתר`))
      && !/up to 5 a week per website|עד 5 בשבוע לכל אתר/.test(f),
      planLimitLines('premium', 'en').join(' | '))
  }

  console.log('\nF) the guard itself: the real lines pass, each broken copy fails (so none of the controls above is vacuous)')
  {
    check('F1: the real Hebrew and English lines pass the contract', plain(realLines('he'), 'he').ok && plain(realLines('en'), 'en').ok)
    check('F2: a card with NO article line at all fails it', !plain(Object.fromEntries(PLAN_CODES.map((c) => [c, planLimitLines(c, 'en').slice(1)])) as Record<PlanCode, string[]>, 'en').ok)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
export {}
