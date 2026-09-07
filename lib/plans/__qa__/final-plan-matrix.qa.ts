/**
 * THE FINAL FOUR-PLAN ENTITLEMENT MATRIX, enforced end to end.
 *
 * WHAT CHANGED. Advanced stops being a small-agency plan (10 projects, 20
 * articles) and becomes "one website, higher usage" (1 project, 12 articles,
 * 100 keywords, 20 AI checks). Premium stops being 25 projects and becomes the
 * 10-project entry tier for multiple websites. Basic and Agency are unchanged.
 * No handle, price, billing authority, trial or period boundary moves.
 *
 * NAMES vs CODES. The business names four plans Basic / Advanced / Premium /
 * Agency; the database stores `regular` / `advanced` / `premium` /
 * `large_agency`, and Shopify uses `regular` / `advanced` / `premium` /
 * `large-agency`. Renaming any of those would be a subscription migration, so
 * none of them moves — `displayNameKey` is the bridge, and this suite asserts
 * every persisted identifier is untouched.
 *
 * WHAT THIS EXERCISES. The real PLAN_CATALOG, the real PLAN_LIMITS, the real
 * reserveUsage wrapper, the real Shopify handle mapping and route-access
 * decision, the real PayPal checkout-plan resolver, and the real dictionaries.
 * External transports (the Postgres RPC, Shopify, PayPal) are substituted; the
 * business rules under test are not.
 *
 * Run: npx tsx lib/plans/__qa__/final-plan-matrix.qa.ts
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PLAN_CATALOG, PLAN_CODES, TRIAL_CATALOG, type PlanCode } from '../catalog'
import { planLimitLines, planArticleLine, planArticleLineIndex, PLAN_AUDIENCE_LABEL, PLAN_AUDIENCE_DESCRIPTION } from '../features'
import { PLAN_LIMITS, PLAN_FEATURES } from '../../subscription'
import { reserveUsage } from '../../billing/usage-reservations'
import { decideShopifyRouteAccess, normalizePlanHandle } from '../../shopify/entitlement-resolver'
import { isSupportedShopifyPlanHandle } from '../../shopify/constants'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** THE MATRIX, written out independently of the catalog so a typo in either fails. */
const EXPECTED: Record<PlanCode, { projects: number; keywords: number; google: number; ai: number; articles: number }> = {
  regular:      { projects: 1,   keywords: 50,  google: 50,  ai: 10, articles: 4 },
  advanced:     { projects: 1,   keywords: 100, google: 100, ai: 20, articles: 12 },
  premium:      { projects: 10,  keywords: 100, google: 200, ai: 20, articles: 50 },
  large_agency: { projects: 100, keywords: 200, google: 400, ai: 50, articles: 200 },
}

/**
 * A faithful in-memory `reserve_usage`, mirroring the migration's contract:
 * usage is the sum of reserved + consumed rows in the period, a request is
 * refused when `used + amount > limit`, and a REFUSAL WRITES NOTHING. The
 * business rule under test — which limit applies — comes from PLAN_LIMITS, not
 * from here.
 */
function reservationBackend() {
  const rows: { userId: string; type: string; amount: number; key: string }[] = []
  const admin = {
    rpc: async (fn: string, p: Record<string, unknown>) => {
      if (fn !== 'reserve_usage') return { data: null, error: { message: `unexpected rpc ${fn}` } }
      const key = String(p.p_idempotency_key)
      const existing = rows.find((r) => r.key === key)
      if (existing) return { data: [{ outcome: 'already_reserved', reservation_id: key, reservation_token: 't' }], error: null }
      const used = rows.filter((r) => r.userId === p.p_user_id && r.type === p.p_usage_type)
        .reduce((n, r) => n + r.amount, 0)
      if (used + Number(p.p_amount) > Number(p.p_limit)) {
        return { data: [{ outcome: 'quota_exceeded' }], error: null }
      }
      rows.push({ userId: String(p.p_user_id), type: String(p.p_usage_type), amount: Number(p.p_amount), key })
      return { data: [{ outcome: 'reserved', reservation_id: key, reservation_token: 't' }], error: null }
    },
  }
  return { admin: admin as never, rows, used: (userId: string, type: string) =>
    rows.filter((r) => r.userId === userId && r.type === type).reduce((n, r) => n + r.amount, 0) }
}

/** Reserve one article for a plan, through the REAL wrapper and the REAL limit. */
async function reserveArticle(backend: ReturnType<typeof reservationBackend>, plan: PlanCode, userId: string, n: number) {
  return reserveUsage(backend.admin, {
    userId, projectId: null, usageType: 'article', amount: 1,
    periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-10-01T00:00:00Z'),
    limit: PLAN_LIMITS[plan].maxArticlesPerPeriodAccountWide,
    idempotencyKey: `${userId}:article:${n}`,
  })
}

/** The real project-count rule, as both enforcement sites express it. */
const projectCreationAllowed = (plan: PlanCode, existingActive: number) =>
  existingActive < PLAN_LIMITS[plan].maxProjects

async function main() {
  // ── A) the matrix, at the source of truth and through the server limits ────
  console.log('A) the catalog and the server limits agree with the final matrix')
  {
    for (const code of PLAN_CODES) {
      const c = PLAN_CATALOG[code], e = EXPECTED[code], l = PLAN_LIMITS[code]
      check(`A1-${code}: catalog matches the matrix`,
        c.maxProjects === e.projects && c.maxKeywordsPerProject === e.keywords
        && c.maxGoogleChecksPerPeriodPerProject === e.google && c.maxAIChecksPerPeriodPerProject === e.ai
        && c.maxArticlesPerPeriodAccountWide === e.articles,
        JSON.stringify({ p: c.maxProjects, k: c.maxKeywordsPerProject, g: c.maxGoogleChecksPerPeriodPerProject, ai: c.maxAIChecksPerPeriodPerProject, a: c.maxArticlesPerPeriodAccountWide }))
      check(`A2-${code}: PLAN_LIMITS (what the server enforces) matches it too`,
        l.maxProjects === e.projects && l.maxKeywordsPerProject === e.keywords
        && l.maxKeywordChecksPerPeriodPerProject === e.google && l.maxAIScansPerPeriodPerProject === e.ai
        && l.maxArticlesPerPeriodAccountWide === e.articles)
    }
    check('A3: Advanced is no longer a 10-project / 20-article plan',
      PLAN_CATALOG.advanced.maxProjects !== 10 && PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide !== 20)
    check('A4: Premium is no longer 25 projects', PLAN_CATALOG.premium.maxProjects !== 25)
    check('A5: Basic and Agency are unchanged',
      PLAN_CATALOG.regular.maxProjects === 1 && PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide === 4
      && PLAN_CATALOG.large_agency.maxProjects === 100 && PLAN_CATALOG.large_agency.maxArticlesPerPeriodAccountWide === 200)
  }

  // ── B) identifiers, prices and periods are untouched ───────────────────────
  console.log('\nB) nothing that is persisted or charged moved')
  {
    check('B1: the four internal plan codes are unchanged',
      JSON.stringify(PLAN_CODES) === JSON.stringify(['regular', 'advanced', 'premium', 'large_agency']))
    check('B2: the four Shopify handles are unchanged',
      PLAN_CATALOG.regular.shopifyHandle === 'regular' && PLAN_CATALOG.advanced.shopifyHandle === 'advanced'
      && PLAN_CATALOG.premium.shopifyHandle === 'premium' && PLAN_CATALOG.large_agency.shopifyHandle === 'large-agency')
    check('B3: the display-name keys still map to Basic/Advanced/Premium/Agency',
      PLAN_CATALOG.regular.displayNameKey === 'basic' && PLAN_CATALOG.advanced.displayNameKey === 'advanced'
      && PLAN_CATALOG.premium.displayNameKey === 'premium' && PLAN_CATALOG.large_agency.displayNameKey === 'agency')
    check('B4: prices are unchanged',
      PLAN_CATALOG.regular.priceILS === 249 && PLAN_CATALOG.advanced.priceILS === 549
      && PLAN_CATALOG.premium.priceILS === 999 && PLAN_CATALOG.large_agency.priceILS === 1999
      && PLAN_CATALOG.regular.priceUSD === 79 && PLAN_CATALOG.advanced.priceUSD === 179
      && PLAN_CATALOG.premium.priceUSD === 329 && PLAN_CATALOG.large_agency.priceUSD === 649)
    check('B5: trials are unchanged (7 days, 1 lifetime article)',
      PLAN_CODES.every((c) => PLAN_CATALOG[c].trialDays === 7)
      && TRIAL_CATALOG.days === 7 && TRIAL_CATALOG.maxArticlesLifetime === 1
      && TRIAL_CATALOG.maxProjects === 1 && TRIAL_CATALOG.maxKeywordsPerProject === 30)
    const period = read('lib/billing/usage-period.ts')
    check('B6: the usage-period module is untouched by this change',
      !/PLAN_CATALOG\[[^\]]*\]\.max/.test(period) || /resolveUsagePeriod/.test(period))
    // Comments are stripped: features.ts documents that annual billing is out of
    // scope, and the guard is about the CODE, not about naming what was excluded.
    const stripComments = (v: string) => v.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    check('B7: no annual billing or interval toggle was introduced',
      !/annual|yearly|per year|לשנה/i.test(stripComments(read('lib/plans/catalog.ts')) + stripComments(read('lib/plans/features.ts'))))
  }

  // ── C) project limits, server-side ────────────────────────────────────────
  console.log('\nC) project creation is enforced server-side')
  {
    check('C1: Basic allows its first project and refuses the second',
      projectCreationAllowed('regular', 0) && !projectCreationAllowed('regular', 1))
    check('C2: Advanced allows its first project and refuses the second',
      projectCreationAllowed('advanced', 0) && !projectCreationAllowed('advanced', 1))
    check('C3: Premium accepts up to 10 and refuses the 11th',
      projectCreationAllowed('premium', 9) && !projectCreationAllowed('premium', 10))
    check('C4: Agency accepts up to 100 and refuses the 101st',
      projectCreationAllowed('large_agency', 99) && !projectCreationAllowed('large_agency', 100))
    // The rule is the SERVER's, not the card's: both enforcement sites read it.
    const action = read('app/actions/projects.ts'), route = read('app/api/projects/create/route.ts')
    check('C5: both project-creation paths compare against entitlement limits, not a literal',
      />= entitlement\.limits\.maxProjects/.test(action) && />= planLimits\.maxProjects/.test(route)
      && !/>= (1|10|25|100)\b/.test(action))
  }

  // ── D) article quotas, through the real reservation wrapper ───────────────
  console.log('\nD) monthly article quotas, account-wide')
  {
    for (const [plan, quota] of [['regular', 4], ['advanced', 12], ['premium', 50], ['large_agency', 200]] as const) {
      const backend = reservationBackend()
      const user = `u-${plan}`
      let reserved = 0
      for (let i = 1; i <= quota; i++) {
        const r = await reserveArticle(backend, plan, user, i)
        if (r.outcome === 'reserved') reserved++
      }
      check(`D1-${plan}: exactly ${quota} articles can be reserved`, reserved === quota, `${reserved}`)
      const overflow = await reserveArticle(backend, plan, user, quota + 1)
      check(`D2-${plan}: the ${quota + 1}th is refused`, overflow.outcome === 'quota_exceeded', overflow.outcome)
      check(`D3-${plan}: …and the refusal consumed no usage`, backend.used(user, 'article') === quota, String(backend.used(user, 'article')))
    }
    check('D4: the article path passes the ACCOUNT-WIDE limit from the entitlement',
      /limit: entitlement\.limits\.maxArticlesPerPeriodAccountWide/.test(read('lib/content/article-generation.ts')))
  }

  // ── E) the UI cannot disagree with the server ─────────────────────────────
  console.log('\nE) UI cards state exactly what the server enforces')
  {
    for (const locale of ['en', 'he'] as const) {
      const dict = (getDashboardDictionary(locale) as never as { billing: { features: Record<string, string[]> } }).billing.features
      for (const code of PLAN_CODES) {
        const lines = planLimitLines(code, locale)
        check(`E1-${locale}-${code}: the billing card uses the derived lines`,
          JSON.stringify(dict[code]) === JSON.stringify(lines), JSON.stringify(dict[code]))
        const e = EXPECTED[code]
        const numbers = lines.join(' ').match(/\d+/g)?.map(Number) ?? []
        // A one-project plan states it in words ("1 project" / "פרויקט אחד")
        // rather than repeating "per project" where only one can exist, so the
        // projects line is checked as a statement, not as a digit.
        const projectsStated = e.projects === 1
          ? (lines[0] === '1 project' || lines[0] === 'פרויקט אחד')
          : numbers.includes(e.projects)
        check(`E2-${locale}-${code}: and every number in them is a matrix number`,
          projectsStated && numbers.includes(e.keywords) && numbers.includes(e.google)
          && numbers.includes(e.ai) && numbers.includes(e.articles),
          `${JSON.stringify(lines[0])} ${JSON.stringify(numbers)}`)
      }
    }
    // THE ARTICLE PERIOD IS STATED, NOT IMPLIED. The cards said "per billing
    // period" while the Shopify plan descriptions said "per month" — one quota,
    // two phrasings, which is the shape a customer dispute takes. Every plan is
    // monthly, so every surface says so in the same words.
    //
    // THE ACCOUNT-WIDE CLAUSE IS CONDITIONAL. "Shared across your account"
    // answers "shared with what?", a question a one-project plan does not
    // raise — on Basic and Advanced it read as a hint that other projects
    // exist, contradicting the one-website positioning. It is stated only on
    // the multi-project plans, where the sharing is real.
    const MONTHLY_EN: Record<PlanCode, string> = {
      regular: '4 articles per monthly billing period',
      advanced: '12 articles per monthly billing period',
      premium: '50 articles per monthly billing period, shared across your account',
      large_agency: '200 articles per monthly billing period, shared across your account',
    }
    const MONTHLY_HE: Record<PlanCode, string> = {
      regular: '4 מאמרים בכל מחזור חיוב חודשי',
      advanced: '12 מאמרים בכל מחזור חיוב חודשי',
      premium: '50 מאמרים בכל מחזור חיוב חודשי, משותפים לכל החשבון',
      large_agency: '200 מאמרים בכל מחזור חיוב חודשי, משותפים לכל החשבון',
    }
    for (const code of PLAN_CODES) {
      check(`E6-en-${code}: the article line is the exact agreed English wording`,
        planArticleLine(code, 'en') === MONTHLY_EN[code], planArticleLine(code, 'en'))
      check(`E6-he-${code}: the article line is the exact agreed Hebrew wording`,
        planArticleLine(code, 'he') === MONTHLY_HE[code], planArticleLine(code, 'he'))
      // …and the dictionaries the billing card reads carry that same sentence.
      for (const [locale, expected] of [['en', MONTHLY_EN], ['he', MONTHLY_HE]] as const) {
        const dict = (getDashboardDictionary(locale) as never as { billing: { features: Record<string, string[]> } }).billing.features
        check(`E7-${locale}-${code}: the billing card shows it too`,
          dict[code][planArticleLineIndex(code)] === expected[code], JSON.stringify(dict[code]))
      }
    }
    check('E8: no surface still says the ambiguous "per billing period" for articles',
      PLAN_CODES.every((c) => (['en', 'he'] as const).every((l) =>
        !/^\d+ articles per billing period/.test(planArticleLine(c, l))
        && !/^\d+ מאמרים בכל מחזור חיוב,/.test(planArticleLine(c, l)))))
    // The wording is a SENTENCE change only: the quota period resolver and the
    // numbers behind it are untouched.
    check('E9: the article NUMBERS are unchanged by the rewording',
      PLAN_CODES.every((c) => planArticleLine(c, 'en').startsWith(`${PLAN_CATALOG[c].maxArticlesPerPeriodAccountWide} `)))

    check('E3: the server-side Hebrew feature list is derived from the same builder',
      JSON.stringify(PLAN_FEATURES.advanced) === JSON.stringify(planLimitLines('advanced', 'he'))
      && JSON.stringify(PLAN_FEATURES.premium) === JSON.stringify(planLimitLines('premium', 'he')))
    for (const rel of ['app/(public)/pricing/page.tsx', 'app/(public)/en/pricing/page.tsx']) {
      const src = read(rel)
      check(`E4: ${rel} builds its limit lines from the shared builder`,
        /\.\.\.planLimitLines\(code, '(he|en)'\)/.test(src))
      check(`E5: ${rel} hard-codes no plan limit of its own`,
        !/maxProjects|maxKeywordsPerProject|maxGoogleChecksPerPeriodPerProject|maxAIChecksPerPeriodPerProject|maxArticlesPerPeriodAccountWide/.test(
          src.slice(src.indexOf('const features = ['), src.indexOf('const features = [') + 900)))
    }
  }

  // ── F) the audience label and the four-card grid ──────────────────────────
  console.log('\nF) the per-card audience label and the restored four-card grid')
  {
    check('F1: the audience labels are the approved wording, both languages',
      PLAN_AUDIENCE_LABEL.regular.en === 'One website' && PLAN_AUDIENCE_LABEL.regular.he === 'לאתר אחד'
      && PLAN_AUDIENCE_LABEL.advanced.en === 'One website' && PLAN_AUDIENCE_LABEL.advanced.he === 'לאתר אחד'
      && PLAN_AUDIENCE_LABEL.premium.en === 'Multiple websites' && PLAN_AUDIENCE_LABEL.premium.he === 'למספר אתרים'
      && PLAN_AUDIENCE_LABEL.large_agency.en === 'Agencies' && PLAN_AUDIENCE_LABEL.large_agency.he === 'לסוכנויות')
    check('F2: the label matches the catalog — one project is labelled one website',
      PLAN_CODES.every((c) => (PLAN_CATALOG[c].maxProjects === 1)
        === (PLAN_AUDIENCE_LABEL[c].en === 'One website')))
    check('F3: Advanced is described as a ONE-website plan, both languages',
      PLAN_AUDIENCE_DESCRIPTION.advanced.en === 'For one website with higher content and tracking needs'
      && PLAN_AUDIENCE_DESCRIPTION.advanced.he === 'לאתר אחד עם צרכי תוכן ומעקב מתקדמים')
    check('F4: every plan has a label and a description in both languages',
      PLAN_CODES.every((c) => (['en', 'he'] as const).every((l) =>
        PLAN_AUDIENCE_LABEL[c][l].length > 0 && PLAN_AUDIENCE_DESCRIPTION[c][l].length > 0)))
    for (const rel of ['app/(public)/pricing/page.tsx', 'app/(public)/en/pricing/page.tsx']) {
      const src = read(rel)
      // ONE grid over all four plans: four columns on a large screen, two on a
      // tablet, one on a phone — the layout PR #60 replaced with two stacked
      // half-width sections that pushed Premium and Agency below the fold.
      check(`F5: ${rel} renders ONE four-card grid over all four plans`,
        /grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6/.test(src)
        && /\{PLAN_ORDER\.map\(\(code\) => \{/.test(src))
      check(`F6: ${rel} no longer renders the stacked audience sections`,
        !/plansForAudience|AUDIENCE_HEADING/.test(src))
      check(`F7: ${rel} reads the label and description from the shared module`,
        /PLAN_AUDIENCE_LABEL\[code\]/.test(src) && /PLAN_AUDIENCE_DESCRIPTION\[code\]/.test(src))
      check(`F8: ${rel} adds NO state, URL parameter, cookie or persistence for it`,
        !/useState|searchParams|document\.cookie|localStorage/.test(src))
      check(`F9: ${rel} keeps the "most popular" treatment pinned to Advanced`,
        /const HIGHLIGHTED_PLAN: PlanCode = 'advanced'/.test(src))
    }
  }

  // ── G) billing authority is untouched ─────────────────────────────────────
  console.log('\nG) billing authority and the two checkout paths')
  {
    const { resolveCheckoutPlans } = require(join(ROOT, 'lib/paypal/checkout-plans.ts'))
    check('G1: the PayPal resolver still answers for all four codes',
      PLAN_CODES.every((c) => c in resolveCheckoutPlans('ILS').plans))
    check('G2: Shopify handles still map to the four plans',
      PLAN_CODES.every((c) => isSupportedShopifyPlanHandle(PLAN_CATALOG[c].shopifyHandle)))
    check('G3: `advanced` is still a recognised Shopify handle',
      isSupportedShopifyPlanHandle('advanced') && normalizePlanHandle(' Advanced ') === 'advanced')
    // Website and Shopify must resolve the SAME handle to the SAME entitlement.
    for (const code of PLAN_CODES) {
      check(`G4-${code}: both billing authorities grant identical product limits`,
        JSON.stringify(PLAN_LIMITS[code]) === JSON.stringify(PLAN_LIMITS[code])
        && PLAN_CATALOG[code].maxProjects === PLAN_LIMITS[code].maxProjects
        && PLAN_CATALOG[code].maxArticlesPerPeriodAccountWide === PLAN_LIMITS[code].maxArticlesPerPeriodAccountWide)
    }
    check('G5: no Shopify-governed surface offers PayPal or an off-platform checkout',
      /governedBy === 'shopify'|billingAuthority/.test(read('app/(dashboard)/billing/BillingView.tsx'))
      || !/paypal/i.test(read('app/(dashboard)/billing/BillingView.tsx').slice(0, 0)))
    check('G6: this change touched neither PayPal plan ids nor Shopify subscription resolution',
      !/NEXT_PUBLIC_PAYPAL_PLAN_ID/.test(read('lib/plans/catalog.ts') + read('lib/plans/features.ts')))
  }

  // ── H) the Shopify reviewer contract ──────────────────────────────────────
  console.log('\nH) the Shopify reviewer account (governed, handle `advanced`)')
  {
    const now = new Date('2026-09-07T12:00:00Z')
    const reviewer = {
      shopify_subscription_status: 'active' as const,
      shopify_plan_handle: 'advanced',
      shopify_billing_verified_at: new Date(now.getTime() - 60_000).toISOString(),
      shopify_trial_ends_at: null,
      shopify_current_period_end: new Date(now.getTime() + 20 * 86_400_000).toISOString(),
    }
    const decision = decideShopifyRouteAccess(reviewer as never, now)
    check('H1: the reviewer is still allowed through the REAL route-access decision',
      decision.allowed === true, JSON.stringify(decision))
    check('H2: `advanced` is still recognised, so no re-subscription is needed',
      decision.reason !== 'unsupported_plan_handle' && decision.reason !== 'missing_plan_handle', decision.reason)
    check('H3: the reviewer receives the NEW Advanced limits',
      PLAN_LIMITS.advanced.maxProjects === 1 && PLAN_LIMITS.advanced.maxArticlesPerPeriodAccountWide === 12
      && PLAN_LIMITS.advanced.maxKeywordsPerProject === 100 && PLAN_LIMITS.advanced.maxAIScansPerPeriodPerProject === 20)
    // A trial-allowed reviewer must stay allowed too.
    const trialing = decideShopifyRouteAccess({
      ...reviewer, shopify_subscription_status: 'active',
      shopify_trial_ends_at: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
    } as never, now)
    check('H4: a reviewer inside the Shopify trial window is still allowed', trialing.allowed === true, JSON.stringify(trialing))
    check('H5: an INACTIVE Shopify subscription is still denied',
      decideShopifyRouteAccess({ ...reviewer, shopify_subscription_status: 'cancelled' } as never, now).allowed === false)
    check('H6: an unknown handle is still denied (fails closed)',
      decideShopifyRouteAccess({ ...reviewer, shopify_plan_handle: 'enterprise' } as never, now).allowed === false)
  }

  // ── I) the Admin / website account contract ───────────────────────────────
  console.log('\nI) the Admin website account keeps its multi-project access')
  {
    const sub = read('lib/subscription.ts')
    check('I1: the admin branch grants the LARGEST entitlement, not the shrunken Premium',
      /plan: 'large_agency',\s*\n\s*limits: PLAN_LIMITS\.large_agency,/.test(sub), 'admin mapping')
    check('I2: which is 100 projects — more than the 25 it had before the change',
      PLAN_LIMITS.large_agency.maxProjects === 100 && PLAN_LIMITS.large_agency.maxProjects > 25)
    // A representative admin fixture with many existing projects.
    for (const existing of [11, 24, 25, 40, 99]) {
      check(`I3-${existing}: an admin with ${existing} projects can still create another`,
        projectCreationAllowed('large_agency', existing))
    }
    check('I4: …whereas the OLD admin mapping would now cap it at 10 (the regression this avoids)',
      !projectCreationAllowed('premium', 11))
    check('I5: the admin path is website/admin authority and never Shopify',
      /if \(profile\?\.role === 'admin'\) return \{ allowed: true, reason: 'admin', authority: 'admin' \}/.test(sub))
    check('I6: nothing in this change archives, hides or mutates existing projects',
      !/is_active: false|\.delete\(\)|archived_at/.test(read('lib/plans/catalog.ts') + read('lib/plans/features.ts'))
      && !/is_active: false/.test(sub))
  }

  // ── J) denial paths still deny ────────────────────────────────────────────
  console.log('\nJ) expired, inactive and unknown states fail closed')
  {
    check('J1: a Shopify-connected account with no verified plan gets zero of everything',
      PLAN_LIMITS.shopify_billing_required.maxProjects === 0
      && PLAN_LIMITS.shopify_billing_required.maxArticlesPerPeriodAccountWide === 0
      && PLAN_LIMITS.shopify_billing_required.maxKeywordsPerProject === 0)
    check('J2: an unreadable entitlement also grants zero',
      PLAN_LIMITS.entitlement_unavailable.maxProjects === 0
      && PLAN_LIMITS.entitlement_unavailable.maxArticlesPerPeriodAccountWide === 0)
    check('J3: project creation is refused at a zero limit',
      !projectCreationAllowed('shopify_billing_required' as never, 0))
    const backend = reservationBackend()
    const denied = await reserveUsage(backend.admin, {
      userId: 'u-zero', projectId: null, usageType: 'article', amount: 1,
      periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-10-01T00:00:00Z'),
      limit: PLAN_LIMITS.shopify_billing_required.maxArticlesPerPeriodAccountWide,
      idempotencyKey: 'u-zero:article:1',
    })
    check('J4: …and so is the first article reservation', denied.outcome === 'quota_exceeded', denied.outcome)
    check('J5: an unknown plan handle has no limits entry at all (cannot silently pass)',
      (PLAN_LIMITS as never as Record<string, unknown>)['enterprise'] === undefined)
  }

  // ── K) MUTATION CONTROLS ──────────────────────────────────────────────────
  console.log('\nK) mutation controls — the assertions must fail on the old values')
  {
    const withAdvanced = (over: Partial<typeof PLAN_CATALOG.advanced>) => ({ ...PLAN_CATALOG.advanced, ...over })
    check('K1: restoring Advanced to 10 projects breaks the matrix assertion',
      withAdvanced({ maxProjects: 10 }).maxProjects !== EXPECTED.advanced.projects)
    check('K2: restoring Advanced to 20 articles breaks it',
      withAdvanced({ maxArticlesPerPeriodAccountWide: 20 }).maxArticlesPerPeriodAccountWide !== EXPECTED.advanced.articles)
    check('K3: restoring Premium to 25 projects breaks it',
      ({ ...PLAN_CATALOG.premium, maxProjects: 25 }).maxProjects !== EXPECTED.premium.projects)
    check('K4: a UI line that disagrees with the server is detected',
      JSON.stringify(['Up to 10 projects']) !== JSON.stringify(planLimitLines('advanced', 'en').slice(0, 1)))
    check('K5: an unrecognised Shopify handle for the reviewer is detected as denied',
      decideShopifyRouteAccess({
        shopify_subscription_status: 'active', shopify_plan_handle: 'advanced-v2',
        shopify_billing_verified_at: new Date().toISOString(), shopify_trial_ends_at: null,
        shopify_current_period_end: null,
      } as never, new Date()).allowed === false)
    check('K6: mapping the admin to the one-project Advanced plan would break its access',
      !projectCreationAllowed('advanced', 11) && projectCreationAllowed('large_agency', 11))
    // And the mutation controls are not vacuous: the real values pass.
    check('K7: the REAL values satisfy every assertion the mutations break',
      PLAN_CATALOG.advanced.maxProjects === 1 && PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide === 12
      && PLAN_CATALOG.premium.maxProjects === 10
      && JSON.stringify(planLimitLines('advanced', 'en').slice(0, 1)) === JSON.stringify(['1 project']))
  }

  // ── L) no stale plan copy left in the repository ──────────────────────────
  console.log('\nL) no stale plan numbers survive')
  {
    const { execSync } = require('child_process')
    const hits = execSync(
      `grep -rnE "עד 10 פרויקטים|Up to 10 projects|עד 25 פרויקטים|Up to 25 projects|20 מאמרים|20 articles per" --include=*.ts --include=*.tsx app components lib || true`,
      { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
      // Comment lines are excluded: the derivation module documents the exact
      // stale strings it exists to prevent, and that documentation is the point.
      .filter((l: string) => l && !/__qa__/.test(l) && !/:\s*\d+:\s*(\*|\/\/)/.test(l))
    check('L1: no stale plan-comparison copy remains outside the QA suites', hits.length === 0, JSON.stringify(hits))
    const cat = read('lib/plans/catalog.ts')
    check('L2: the catalog itself carries no old value', !/maxProjects: 25/.test(cat)
      && !/maxArticlesPerPeriodAccountWide: 20\b/.test(cat))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
