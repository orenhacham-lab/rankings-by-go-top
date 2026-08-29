/**
 * Phase 3 — every approved plan entitlement (§6 of the approved design),
 * proving PLAN_LIMITS derives from PLAN_CATALOG exactly, and the trial gains
 * one lifetime article while its Google/AI numbers stay unchanged. Run:
 *   npx tsx lib/plans/__qa__/catalog-entitlements.qa.ts
 */
import { PLAN_CATALOG, TRIAL_CATALOG, PLAN_CODES } from '../catalog'
import { PLAN_LIMITS } from '../../subscription'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  console.log('Phase 3 — approved plan entitlements\n')

  console.log('1) Basic (regular)')
  {
    const c = PLAN_CATALOG.regular
    check('1 project', c.maxProjects === 1)
    check('50 keywords/project', c.maxKeywordsPerProject === 50)
    check('50 Google checks/period/project', c.maxGoogleChecksPerPeriodPerProject === 50)
    check('10 AI checks/period/project', c.maxAIChecksPerPeriodPerProject === 10)
    check('4 articles/period, account-wide', c.maxArticlesPerPeriodAccountWide === 4)
    check('₪249/month', c.priceILS === 249)
    check('$79/month', c.priceUSD === 79)
    check('Shopify handle "regular"', c.shopifyHandle === 'regular')
    check('display name key "basic"', c.displayNameKey === 'basic')
  }

  console.log('\n2) Advanced')
  {
    const c = PLAN_CATALOG.advanced
    check('10 projects', c.maxProjects === 10)
    check('50 keywords/project', c.maxKeywordsPerProject === 50)
    check('100 Google checks/period/project', c.maxGoogleChecksPerPeriodPerProject === 100)
    check('10 AI checks/period/project', c.maxAIChecksPerPeriodPerProject === 10)
    check('20 articles/period, account-wide', c.maxArticlesPerPeriodAccountWide === 20)
    check('₪549/month', c.priceILS === 549)
    check('$179/month', c.priceUSD === 179)
    check('Shopify handle "advanced"', c.shopifyHandle === 'advanced')
  }

  console.log('\n3) Premium')
  {
    const c = PLAN_CATALOG.premium
    check('25 projects', c.maxProjects === 25)
    check('100 keywords/project', c.maxKeywordsPerProject === 100)
    check('200 Google checks/period/project', c.maxGoogleChecksPerPeriodPerProject === 200)
    check('20 AI checks/period/project', c.maxAIChecksPerPeriodPerProject === 20)
    check('50 articles/period, account-wide', c.maxArticlesPerPeriodAccountWide === 50)
    check('₪999/month', c.priceILS === 999)
    check('$329/month', c.priceUSD === 329)
    check('Shopify handle "premium"', c.shopifyHandle === 'premium')
  }

  console.log('\n4) Agency (large_agency)')
  {
    const c = PLAN_CATALOG.large_agency
    check('100 projects', c.maxProjects === 100)
    check('200 keywords/project', c.maxKeywordsPerProject === 200)
    check('400 Google checks/period/project', c.maxGoogleChecksPerPeriodPerProject === 400)
    check('50 AI checks/period/project', c.maxAIChecksPerPeriodPerProject === 50)
    check('200 articles/period, account-wide', c.maxArticlesPerPeriodAccountWide === 200)
    check('₪1,999/month', c.priceILS === 1999)
    check('$649/month', c.priceUSD === 649)
    // Approved Shopify handle mapping: large_agency -> large-agency (hyphen)
    check('Shopify handle "large-agency" (hyphen)', c.shopifyHandle === 'large-agency')
  }

  console.log('\n5) Internal plan codes are UNCHANGED (no migration needed)')
  {
    check('exactly 4 codes: regular, advanced, premium, large_agency',
      PLAN_CODES.length === 4 && ['regular', 'advanced', 'premium', 'large_agency'].every((c) => (PLAN_CODES as readonly string[]).includes(c)))
  }

  console.log('\n6) 7-day trial for every plan')
  {
    for (const code of PLAN_CODES) check(`${code}.trialDays === 7`, PLAN_CATALOG[code].trialDays === 7)
  }

  console.log('\n7) Trial entitlement — Google/AI unchanged, +1 lifetime article')
  {
    check('1 project', TRIAL_CATALOG.maxProjects === 1)
    check('30 keywords', TRIAL_CATALOG.maxKeywordsPerProject === 30)
    check('30 lifetime Google checks (PRESERVED, unchanged)', TRIAL_CATALOG.maxGoogleChecksLifetime === 30)
    check('3 lifetime AI checks (PRESERVED, unchanged)', TRIAL_CATALOG.maxAIChecksLifetime === 3)
    check('1 lifetime article (NEW)', TRIAL_CATALOG.maxArticlesLifetime === 1)
    check('7 days', TRIAL_CATALOG.days === 7)
  }

  console.log('\n8) PLAN_LIMITS (lib/subscription.ts) is DERIVED from PLAN_CATALOG — no hand-duplicated numbers')
  {
    for (const code of PLAN_CODES) {
      const cat = PLAN_CATALOG[code]
      const lim = PLAN_LIMITS[code]
      check(`${code}: maxProjects matches catalog`, lim.maxProjects === cat.maxProjects)
      check(`${code}: maxKeywordsPerProject matches catalog`, lim.maxKeywordsPerProject === cat.maxKeywordsPerProject)
      check(`${code}: maxKeywordChecksPerPeriodPerProject matches catalog Google-check limit`, lim.maxKeywordChecksPerPeriodPerProject === cat.maxGoogleChecksPerPeriodPerProject)
      check(`${code}: maxAIScansPerPeriodPerProject matches catalog AI-check limit`, lim.maxAIScansPerPeriodPerProject === cat.maxAIChecksPerPeriodPerProject)
      check(`${code}: maxArticlesPerPeriodAccountWide matches catalog`, lim.maxArticlesPerPeriodAccountWide === cat.maxArticlesPerPeriodAccountWide)
      check(`${code}: price (ILS) matches catalog`, lim.price === cat.priceILS)
      check(`${code}: priceUSD matches catalog`, lim.priceUSD === cat.priceUSD)
    }
    check('trial.maxArticlesPerPeriodAccountWide === 1', PLAN_LIMITS.trial.maxArticlesPerPeriodAccountWide === 1)
    check('trial.maxKeywordChecksTotal === 30 (unchanged)', PLAN_LIMITS.trial.maxKeywordChecksTotal === 30)
    check('trial.maxAIScansTotal === 3 (unchanged)', PLAN_LIMITS.trial.maxAIScansTotal === 3)
    check('shopify_billing_required is all-zero including articles', PLAN_LIMITS.shopify_billing_required.maxArticlesPerPeriodAccountWide === 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
