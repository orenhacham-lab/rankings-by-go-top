/**
 * THE CORRECTIVE CONTRACT for the pricing regression PR #60 shipped.
 *
 * Three defects, three contracts, each asserted against the real modules and
 * the real page sources — not against a copy of the strings:
 *
 *   1. ADVANCED IS A ONE-WEBSITE PLAN. It dropped from 10 projects to 1, but
 *      both pricing pages kept their own hand-written sentence selling it to
 *      "growing businesses with multiple sites" / "עסקים בצמיחה עם כמה אתרים".
 *      A repository-wide scan below fails if any Advanced copy anywhere says
 *      that again.
 *
 *   2. THE ACCOUNT-WIDE CLAUSE IS CONDITIONAL. "Shared across your account"
 *      answers "shared with what?" — a question a one-project plan does not
 *      raise. Basic and Advanced state the monthly quota plainly; Premium and
 *      Agency, where the sharing is real, keep the clarification. The article
 *      line is also READ SECOND on those plans, immediately after the project
 *      line: 4 vs 12 articles is what separates Basic from Advanced, and it was
 *      buried under three check-quota lines.
 *
 *   3. THE FOUR CARDS ARE ONE ROW AGAIN. Two stacked half-width audience
 *      sections doubled the height of the pricing block and pushed Premium and
 *      Agency below the fold. The audience distinction survives as a small
 *      per-card label; the grid is four columns on desktop, two on tablet, one
 *      on mobile. Geometry is proven in Chromium by pricing-page-browser.qa.ts;
 *      this suite proves the source contract.
 *
 * NOTHING PRICED OR ENTITLED MAY MOVE. The last section pins every number,
 * price, handle, trial and PayPal identifier byte-for-byte.
 *
 * Run: npx tsx lib/plans/__qa__/pricing-copy-and-layout.qa.ts
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { PLAN_CATALOG, PLAN_CODES, TRIAL_CATALOG, type PlanCode } from '../catalog'
import { planLimitLines, planArticleLine, planArticleLineIndex, PLAN_AUDIENCE_LABEL, PLAN_AUDIENCE_DESCRIPTION } from '../features'
import { PLAN_LIMITS, PLAN_FEATURES } from '../../subscription'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const PAGES = ['app/(public)/pricing/page.tsx', 'app/(public)/en/pricing/page.tsx']

/**
 * Every source file that can carry customer-visible copy. Tests and QA suites
 * are excluded: they QUOTE the banned wording on purpose, to prove it is gone.
 */
function copySources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry === '__tests__' || entry === '__qa__') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (/\.(ts|tsx)$/.test(entry)) out.push(relative(ROOT, full))
    }
  }
  for (const top of ['app', 'components', 'lib']) walk(join(ROOT, top))
  return out
}

/**
 * Comments are stripped before scanning. The banned phrases are QUOTED in the
 * comments that explain why they are banned — counting those would make the
 * guard fail on its own documentation.
 */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Wording that asserts, or strongly implies, more than one website. */
const MULTI_SITE_PHRASES: { label: string; re: RegExp }[] = [
  { label: 'כמה אתרים', re: /כמה אתרים/ },
  { label: 'מספר אתרים', re: /מספר אתרים/ },
  { label: 'אתרים מרובים', re: /אתרים מרובים/ },
  { label: 'עסקים בצמיחה', re: /בצמיחה/ },
  { label: 'multiple sites', re: /multiple sites/i },
  { label: 'multiple websites', re: /multiple websites/i },
  { label: 'multiple projects', re: /multiple projects/i },
  { label: 'growing businesses', re: /growing business/i },
  { label: 'several websites', re: /several (web)?sites/i },
]

function main() {
  console.log('The pricing copy and layout correction\n')

  // ── A) Advanced is never described as a multi-site plan ───────────────────
  console.log('A) Advanced is a ONE-website plan, everywhere')
  {
    check('A1: the approved Hebrew description is exactly the agreed sentence',
      PLAN_AUDIENCE_DESCRIPTION.advanced.he === 'לאתר אחד עם צרכי תוכן ומעקב מתקדמים',
      PLAN_AUDIENCE_DESCRIPTION.advanced.he)
    check('A2: the approved English description is exactly the agreed sentence',
      PLAN_AUDIENCE_DESCRIPTION.advanced.en === 'For one website with higher content and tracking needs',
      PLAN_AUDIENCE_DESCRIPTION.advanced.en)
    check('A3: the catalog agrees — Advanced grants exactly one project',
      PLAN_CATALOG.advanced.maxProjects === 1 && PLAN_LIMITS.advanced.maxProjects === 1)

    // Everything the product can SAY about Advanced, from every derived source.
    const advancedCopy = (['en', 'he'] as const).flatMap((l) => [
      PLAN_AUDIENCE_LABEL.advanced[l], PLAN_AUDIENCE_DESCRIPTION.advanced[l],
      ...planLimitLines('advanced', l),
      ...(getDashboardDictionary(l) as never as { billing: { features: Record<string, string[]> } }).billing.features.advanced,
    ]).concat(PLAN_FEATURES.advanced).join(' | ')
    for (const { label, re } of MULTI_SITE_PHRASES) {
      check(`A4-${label}: no Advanced-facing string contains it`, !re.test(advancedCopy),
        advancedCopy.split(' | ').filter((s) => re.test(s)).join(' / '))
    }

    // REPOSITORY-WIDE. Any source LINE that names Advanced and also carries a
    // multi-site phrase is the defect, wherever it lives.
    const offenders: string[] = []
    for (const rel of copySources()) {
      const lines = withoutComments(read(rel)).split('\n')
      lines.forEach((line, i) => {
        if (!/advanced/i.test(line) && !/מתקדם/.test(line)) return
        for (const { label, re } of MULTI_SITE_PHRASES) {
          if (re.test(line)) offenders.push(`${rel}:${i + 1} [${label}] ${line.trim().slice(0, 120)}`)
        }
      })
    }
    check('A5: repository-wide — no line naming Advanced also claims multiple sites',
      offenders.length === 0, offenders.slice(0, 5).join(' ;; '))

    // The two exact sentences PR #60 left behind are gone from the tree.
    const RETIRED = ['לעסקים בצמיחה עם כמה אתרים', 'For growing businesses with multiple sites']
    const survivors = copySources().filter((rel) => {
      const src = withoutComments(read(rel))
      return RETIRED.some((s) => src.includes(s))
    })
    check('A6: the two retired sentences appear nowhere in the tree',
      survivors.length === 0, JSON.stringify(survivors))

    // "Multiple websites" is still allowed — but only for the plans that have them.
    check('A7: only Premium is labelled for multiple websites',
      PLAN_CODES.filter((c) => /Multiple websites/.test(PLAN_AUDIENCE_LABEL[c].en)).join(',') === 'premium')
  }

  // ── B) the conditional account-wide clause ────────────────────────────────
  console.log('\nB) the article quota states the account-wide scope only where it is real')
  {
    const EXPECT_EN: Record<PlanCode, string> = {
      regular: '4 articles per monthly billing period',
      advanced: '12 articles per monthly billing period',
      premium: '50 articles per monthly billing period, shared across your account',
      large_agency: '200 articles per monthly billing period, shared across your account',
    }
    const EXPECT_HE: Record<PlanCode, string> = {
      regular: '4 מאמרים בכל מחזור חיוב חודשי',
      advanced: '12 מאמרים בכל מחזור חיוב חודשי',
      premium: '50 מאמרים בכל מחזור חיוב חודשי, משותפים לכל החשבון',
      large_agency: '200 מאמרים בכל מחזור חיוב חודשי, משותפים לכל החשבון',
    }
    for (const code of PLAN_CODES) {
      check(`B1-en-${code}: the exact agreed English article line`,
        planArticleLine(code, 'en') === EXPECT_EN[code], planArticleLine(code, 'en'))
      check(`B1-he-${code}: the exact agreed Hebrew article line`,
        planArticleLine(code, 'he') === EXPECT_HE[code], planArticleLine(code, 'he'))
      // The dashboard billing card reads the same builder, so it cannot diverge.
      for (const [locale, expected] of [['en', EXPECT_EN], ['he', EXPECT_HE]] as const) {
        const dict = (getDashboardDictionary(locale) as never as { billing: { features: Record<string, string[]> } }).billing.features
        check(`B2-${locale}-${code}: the dashboard billing card shows it too`,
          dict[code][planArticleLineIndex(code)] === expected[code], JSON.stringify(dict[code]))
      }
    }
    check('B3: the server-side Hebrew feature list is the same builder output',
      PLAN_CODES.every((c) => JSON.stringify(PLAN_FEATURES[c]) === JSON.stringify(planLimitLines(c, 'he'))))
    // THE CONDITION, stated as a rule rather than as four literals.
    check('B4: the account-wide clause appears exactly on the multi-project plans',
      PLAN_CODES.every((c) => {
        const shared = planArticleLine(c, 'en').includes('shared across your account')
          && planArticleLine(c, 'he').includes('משותפים לכל החשבון')
        const plain = !planArticleLine(c, 'en').includes('shared across')
          && !planArticleLine(c, 'he').includes('משותפים')
        return PLAN_CATALOG[c].maxProjects > 1 ? shared : plain
      }))
    check('B5: every plan still states the MONTHLY period explicitly',
      PLAN_CODES.every((c) => planArticleLine(c, 'en').includes('per monthly billing period')
        && planArticleLine(c, 'he').includes('בכל מחזור חיוב חודשי')))
    check('B6: the article NUMBERS are untouched by the rewording',
      PLAN_CODES.every((c) => planArticleLine(c, 'en').startsWith(`${PLAN_CATALOG[c].maxArticlesPerPeriodAccountWide} `)
        && planArticleLine(c, 'he').startsWith(`${PLAN_CATALOG[c].maxArticlesPerPeriodAccountWide} `)))
  }

  // ── B7-B12) THE ORDER OF THE LIMIT LINES ──────────────────────────────────
  console.log('\nB-order) the article allowance is read second on a one-website plan')
  {
    // The full ordered list, written out independently of the builder so a
    // reordering in either place fails.
    const ORDER_EN: Record<PlanCode, string[]> = {
      regular: ['1 project', '4 articles per monthly billing period', 'Up to 50 keywords',
        'Up to 50 Google checks per billing period', 'Up to 10 AI checks per billing period'],
      advanced: ['1 project', '12 articles per monthly billing period', 'Up to 100 keywords',
        'Up to 100 Google checks per billing period', 'Up to 20 AI checks per billing period'],
      premium: ['Up to 10 projects', 'Up to 100 keywords per project',
        'Up to 200 Google checks per billing period per project',
        'Up to 20 AI checks per billing period per project',
        '50 articles per monthly billing period, shared across your account'],
      large_agency: ['Up to 100 projects', 'Up to 200 keywords per project',
        'Up to 400 Google checks per billing period per project',
        'Up to 50 AI checks per billing period per project',
        '200 articles per monthly billing period, shared across your account'],
    }
    const ORDER_HE: Record<PlanCode, string[]> = {
      regular: ['פרויקט אחד', '4 מאמרים בכל מחזור חיוב חודשי', 'עד 50 מילות מפתח',
        'עד 50 בדיקות גוגל בכל מחזור חיוב', 'עד 10 בדיקות AI בכל מחזור חיוב'],
      advanced: ['פרויקט אחד', '12 מאמרים בכל מחזור חיוב חודשי', 'עד 100 מילות מפתח',
        'עד 100 בדיקות גוגל בכל מחזור חיוב', 'עד 20 בדיקות AI בכל מחזור חיוב'],
      premium: ['עד 10 פרויקטים', 'עד 100 מילות מפתח לפרויקט',
        'עד 200 בדיקות גוגל בכל מחזור חיוב לפרויקט', 'עד 20 בדיקות AI בכל מחזור חיוב לפרויקט',
        '50 מאמרים בכל מחזור חיוב חודשי, משותפים לכל החשבון'],
      large_agency: ['עד 100 פרויקטים', 'עד 200 מילות מפתח לפרויקט',
        'עד 400 בדיקות גוגל בכל מחזור חיוב לפרויקט', 'עד 50 בדיקות AI בכל מחזור חיוב לפרויקט',
        '200 מאמרים בכל מחזור חיוב חודשי, משותפים לכל החשבון'],
    }
    for (const code of PLAN_CODES) {
      check(`B7-en-${code}: the five lines are the exact agreed English list, in order`,
        JSON.stringify(planLimitLines(code, 'en')) === JSON.stringify(ORDER_EN[code]),
        JSON.stringify(planLimitLines(code, 'en')))
      check(`B7-he-${code}: the five lines are the exact agreed Hebrew list, in order`,
        JSON.stringify(planLimitLines(code, 'he')) === JSON.stringify(ORDER_HE[code]),
        JSON.stringify(planLimitLines(code, 'he')))
    }

    // THE RULE, stated as a rule: on a one-project plan the article line comes
    // IMMEDIATELY after the project line; on a multi-project plan it comes last.
    for (const code of PLAN_CODES) {
      const single = PLAN_CATALOG[code].maxProjects === 1
      for (const locale of ['en', 'he'] as const) {
        const lines = planLimitLines(code, locale)
        const at = lines.indexOf(planArticleLine(code, locale))
        check(`B8-${locale}-${code}: the article line sits at index ${single ? 1 : 4}`,
          at === planArticleLineIndex(code) && at === (single ? 1 : 4), `index ${at}`)
        if (single) {
          check(`B9-${locale}-${code}: it is immediately after the project line`,
            at === 1 && /^(1 project|פרויקט אחד)$/.test(lines[0]), `${lines[0]} → ${lines[1]}`)
          check(`B10-${locale}-${code}: the keyword, Google and AI lines follow it, in that order`,
            /keywords|מילות מפתח/.test(lines[2]) && /Google checks|בדיקות גוגל/.test(lines[3])
            && /AI checks|בדיקות AI/.test(lines[4]), JSON.stringify(lines.slice(2)))
        } else {
          check(`B9-${locale}-${code}: the multi-project order is unchanged — articles last`,
            at === 4 && /projects|פרויקטים/.test(lines[0]) && /keywords|מילות מפתח/.test(lines[1]),
            JSON.stringify(lines))
        }
      }
    }

    // THE ORDER PROPAGATES. Every derived surface is the same array, so none of
    // them can order it differently.
    for (const code of PLAN_CODES) {
      for (const locale of ['en', 'he'] as const) {
        const dict = (getDashboardDictionary(locale) as never as { billing: { features: Record<string, string[]> } }).billing.features
        check(`B11-${locale}-${code}: the dashboard billing card uses the same ordered list`,
          JSON.stringify(dict[code]) === JSON.stringify(planLimitLines(code, locale)), JSON.stringify(dict[code]))
      }
      check(`B12-${code}: the server-side Hebrew list uses the same ordered list`,
        JSON.stringify(PLAN_FEATURES[code]) === JSON.stringify(planLimitLines(code, 'he')),
        JSON.stringify(PLAN_FEATURES[code]))
    }

    // NO PAGE RE-SORTS IT. A page that reordered the array itself would be the
    // drift this module exists to prevent.
    for (const rel of PAGES) {
      const src = read(rel)
      const spread = src.slice(src.indexOf('const features = ['), src.indexOf('const features = [') + 400)
      check(`B13: ${rel} spreads the builder's array without reordering it`,
        /\.\.\.planLimitLines\(code, '(he|en)'\),/.test(spread)
        && !/\.sort\(|\.reverse\(|planLimitLines\([^)]*\)\[/.test(spread), spread.slice(0, 120))
    }
  }

  // ── C) the restored four-card grid ────────────────────────────────────────
  console.log('\nC) the compact four-card grid is back on both pricing pages')
  {
    for (const rel of PAGES) {
      const src = read(rel)
      check(`C1: ${rel} declares one grid — 4 columns desktop, 2 tablet, 1 mobile`,
        /grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6/.test(src))
      check(`C2: ${rel} maps all four plans in that one grid`,
        /\{PLAN_ORDER\.map\(\(code\) => \{/.test(src) && (src.match(/PLAN_ORDER\.map/g) ?? []).length === 1)
      check(`C3: ${rel} no longer renders stacked audience sections`,
        !/plansForAudience|AUDIENCE_HEADING|single_site|multi_site/.test(src))
      check(`C4: ${rel} shows the per-card audience label from the shared module`,
        /PLAN_AUDIENCE_LABEL\[code\]/.test(src))
      check(`C5: ${rel} takes its plan description from the shared module`,
        /PLAN_AUDIENCE_DESCRIPTION\[code\]/.test(src) && !/description: '/.test(src))
      check(`C6: ${rel} builds its limit lines from the shared builder`,
        /\.\.\.planLimitLines\(code, '(he|en)'\)/.test(src))
      check(`C7: ${rel} keeps "most popular" pinned to Advanced`,
        /const HIGHLIGHTED_PLAN: PlanCode = 'advanced'/.test(src))
      check(`C8: ${rel} introduces NO toggle, cookie, storage, URL parameter or client state`,
        !/useState|useEffect|'use client'|searchParams|document\.cookie|localStorage|sessionStorage/.test(src))
      check(`C9: ${rel} hard-codes no plan limit of its own`,
        !/maxProjects|maxKeywordsPerProject|maxGoogleChecksPerPeriodPerProject|maxAIChecksPerPeriodPerProject|maxArticlesPerPeriodAccountWide/
          .test(src.slice(src.indexOf('const features = ['), src.indexOf('const features = [') + 900)))
    }
    check('C10: the labels are the approved wording, both languages',
      PLAN_AUDIENCE_LABEL.regular.en === 'One website' && PLAN_AUDIENCE_LABEL.regular.he === 'לאתר אחד'
      && PLAN_AUDIENCE_LABEL.advanced.en === 'One website' && PLAN_AUDIENCE_LABEL.advanced.he === 'לאתר אחד'
      && PLAN_AUDIENCE_LABEL.premium.en === 'Multiple websites' && PLAN_AUDIENCE_LABEL.premium.he === 'למספר אתרים'
      && PLAN_AUDIENCE_LABEL.large_agency.en === 'Agencies' && PLAN_AUDIENCE_LABEL.large_agency.he === 'לסוכנויות')
    check('C11: the label follows the catalog — one project means one website',
      PLAN_CODES.every((c) => (PLAN_CATALOG[c].maxProjects === 1) === (PLAN_AUDIENCE_LABEL[c].en === 'One website')))
  }

  // ── D) nothing priced, entitled or billed may move ────────────────────────
  console.log('\nD) limits, prices, handles, trials and billing authorities are unchanged')
  {
    // Written out independently of the catalog so a typo in either side fails.
    const FROZEN: Record<PlanCode, { projects: number; keywords: number; google: number; ai: number;
      articles: number; ils: number; usd: number; handle: string; trial: number }> = {
      regular:      { projects: 1,   keywords: 50,  google: 50,  ai: 10, articles: 4,   ils: 249,  usd: 79,  handle: 'regular', trial: 7 },
      advanced:     { projects: 1,   keywords: 100, google: 100, ai: 20, articles: 12,  ils: 549,  usd: 179, handle: 'advanced', trial: 7 },
      premium:      { projects: 10,  keywords: 100, google: 200, ai: 20, articles: 50,  ils: 999,  usd: 329, handle: 'premium', trial: 7 },
      large_agency: { projects: 100, keywords: 200, google: 400, ai: 50, articles: 200, ils: 1999, usd: 649, handle: 'large-agency', trial: 7 },
    }
    for (const code of PLAN_CODES) {
      const c = PLAN_CATALOG[code], f = FROZEN[code]
      check(`D1-${code}: catalog numbers, price, handle and trial are byte-for-byte unchanged`,
        c.maxProjects === f.projects && c.maxKeywordsPerProject === f.keywords
        && c.maxGoogleChecksPerPeriodPerProject === f.google && c.maxAIChecksPerPeriodPerProject === f.ai
        && c.maxArticlesPerPeriodAccountWide === f.articles
        && c.priceILS === f.ils && c.priceUSD === f.usd
        && c.shopifyHandle === f.handle && c.trialDays === f.trial,
        JSON.stringify(c))
      check(`D2-${code}: the server enforces those same numbers`,
        PLAN_LIMITS[code].maxProjects === f.projects
        && PLAN_LIMITS[code].maxKeywordsPerProject === f.keywords
        && PLAN_LIMITS[code].maxArticlesPerPeriodAccountWide === f.articles,
        JSON.stringify(PLAN_LIMITS[code]))
    }
    check('D3: the trial catalog is unchanged',
      TRIAL_CATALOG.days === 7 && TRIAL_CATALOG.maxProjects === 1 && TRIAL_CATALOG.maxKeywordsPerProject === 30
      && TRIAL_CATALOG.maxGoogleChecksLifetime === 30 && TRIAL_CATALOG.maxAIChecksLifetime === 3
      && TRIAL_CATALOG.maxArticlesLifetime === 1)
    const { resolveCheckoutPlans } = require(join(ROOT, 'lib/paypal/checkout-plans.ts'))
    check('D4: the PayPal resolver still answers for all four codes',
      PLAN_CODES.every((c) => c in resolveCheckoutPlans('ILS').plans)
      && PLAN_CODES.every((c) => c in resolveCheckoutPlans('USD').plans))
    check('D5: this change touched no PayPal plan id and no Shopify handle mapping',
      !/NEXT_PUBLIC_PAYPAL_PLAN_ID/.test(read('lib/plans/features.ts'))
      && !/shopifyHandle/.test(read('lib/plans/features.ts')))
    check('D6: the pricing pages still show the unchanged prices from the catalog',
      PAGES.every((rel) => /formatILS\(plan\.priceILS\)|formatUSD\(plan\.priceUSD\)/.test(read(rel))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
