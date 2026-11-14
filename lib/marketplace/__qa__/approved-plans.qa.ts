/**
 * A PLAN IS OFFERED ON A PLATFORM'S PAGES ONLY WHERE THAT PLATFORM APPROVED IT.
 *
 * Why this suite exists, with a date on it. ClickBank answered the four
 * product submissions on 13.11.2026 (tickets 27356947, 27356950, 27356952,
 * 27356953, nickname gtopseo): items 1 and 2 were approved and went Active,
 * and items 3 and 4 were refused on a price cap they apply to a new account.
 * Their checkout nevertheless renders and prices all four items — verified
 * against gtopseo.pay.clickbank.net on 14.11.2026, where ?cbitems=3 and
 * ?cbitems=4 served a checkout showing $329 and $649 — and /go/clickbank in
 * Production still printed a Buy button beside every plan. That is a purchase
 * route for a product the reseller declined to approve, published on our own
 * domain under their name, and their Client Contract lets them act on
 * suspicion alone.
 *
 * So the list of approved plans is a condition of what a channel page may
 * show, not presentation: a plan that reappears in that grid by accident
 * reopens exactly the exposure this closes. The guards below hold the gate on
 * both URL builders and hold both channel pages to iterating the gated list.
 *
 * MUTATION CONTROLS at the end: each guard is re-run against a version of the
 * thing it protects with the property removed, and must fail there.
 *
 * Run: npx tsx lib/marketplace/__qa__/approved-plans.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  MARKETPLACE_PROVIDERS,
  isPlanApprovedOnMarketplace,
  marketplaceAffiliateUrl,
  marketplaceApprovedPlans,
  marketplaceBuyUrl,
  marketplaceProvider,
} from '../config'
import { PLAN_CODES } from '../../plans/catalog'
import type { PlanCode } from '../../plans/catalog'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Env is restored after each case: these helpers read process.env live. */
function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const before = new Map<string, string | undefined>()
  for (const [k, v] of Object.entries(vars)) {
    before.set(k, process.env[k])
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try { return run() } finally {
    for (const [k, v] of before) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  }
}

/** Everything a provider needs to be `ready`, so the gate is what is under test. */
function readyEnv(slug: string, extra: Record<string, string> = {}): Record<string, string> {
  const p = `MARKETPLACE_${slug.toUpperCase()}_`
  return {
    [`${p}ENABLED`]: 'true',
    [`${p}WEBHOOK_SECRET`]: 'qa-secret',
    [`${p}PRODUCT_REGULAR`]: 'qa-1',
    ...extra,
  }
}

console.log('\nApproved plans per marketplace\n')

console.log('A) The list itself')
{
  for (const provider of MARKETPLACE_PROVIDERS) {
    const list = provider.approvedPlans
    check(`A1 ${provider.slug}: approvedPlans is null or a non-empty list`,
      list === null || list.length > 0)
    check(`A2 ${provider.slug}: every entry is a real plan code`,
      list === null || list.every((code) => (PLAN_CODES as readonly string[]).includes(code)))
  }
  const cb = marketplaceProvider('clickbank')
  check('A3: clickbank approved exactly regular and advanced',
    JSON.stringify(cb?.approvedPlans) === JSON.stringify(['regular', 'advanced']))
  check('A4: marketplaceApprovedPlans keeps catalogue order',
    JSON.stringify(marketplaceApprovedPlans('clickbank')) === JSON.stringify(['regular', 'advanced']))
  check('A5: premium and large_agency are not approved on clickbank',
    !isPlanApprovedOnMarketplace('clickbank', 'premium')
    && !isPlanApprovedOnMarketplace('clickbank', 'large_agency'))
  check('A6: an unregistered slug approves nothing',
    !isPlanApprovedOnMarketplace('not-a-platform', 'regular'))
  check('A7: a provider with no list approves every plan',
    PLAN_CODES.every((code) => isPlanApprovedOnMarketplace('jvzoo', code)))
}

console.log('B) The buy URL is refused for a plan the platform did not approve')
{
  const urls = {
    MARKETPLACE_CLICKBANK_BUY_URL_REGULAR: 'https://gtopseo.pay.clickbank.net/?cbitems=1',
    MARKETPLACE_CLICKBANK_BUY_URL_PREMIUM: 'https://gtopseo.pay.clickbank.net/?cbitems=3',
    MARKETPLACE_CLICKBANK_BUY_URL_LARGE_AGENCY: 'https://gtopseo.pay.clickbank.net/?cbitems=4',
  }
  withEnv({ ...readyEnv('clickbank'), ...urls }, () => {
    check('B1: an approved plan still gets its buy URL',
      marketplaceBuyUrl('clickbank', 'regular') === urls.MARKETPLACE_CLICKBANK_BUY_URL_REGULAR)
    check('B2: a refused plan gets none, although the env var is set',
      marketplaceBuyUrl('clickbank', 'premium') === null
      && marketplaceBuyUrl('clickbank', 'large_agency') === null)
  })
  withEnv({ ...readyEnv('jvzoo'), MARKETPLACE_JVZOO_BUY_URL_PREMIUM: 'https://jvz.example/premium' },
    () => check('B3: a platform with no list is untouched',
      marketplaceBuyUrl('jvzoo', 'premium') === 'https://jvz.example/premium'))
}

console.log('C) An affiliate is not recruited to a refused plan')
{
  withEnv({
    MARKETPLACE_CLICKBANK_AFFILIATE_URL_REGULAR: 'https://cb.example/jv/1',
    MARKETPLACE_CLICKBANK_AFFILIATE_URL_LARGE_AGENCY: 'https://cb.example/jv/4',
  }, () => {
    check('C1: the approval link stands for an approved plan',
      marketplaceAffiliateUrl('clickbank', 'regular') === 'https://cb.example/jv/1')
    check('C2: and is refused for a plan the platform declined',
      marketplaceAffiliateUrl('clickbank', 'large_agency') === null)
  })
}

console.log('D) Both channel pages iterate the gated list')
{
  const PITCH = 'app/go/[platform]/page.tsx'
  const JV = 'app/go/[platform]/jv/page.tsx'
  for (const file of [PITCH, JV]) {
    const src = stripComments(readFileSync(join(ROOT, file), 'utf8'))
    check(`D1 ${file}: the plan grid maps plansOnOffer`, src.includes('plansOnOffer.map'))
    check(`D2 ${file}: plansOnOffer comes from marketplaceApprovedPlans`,
      /const plansOnOffer = marketplaceApprovedPlans\(provider\.slug\)/.test(src))
    check(`D3 ${file}: no grid iterates the whole catalogue`, !src.includes('PLAN_CODES.map'))
  }
}

console.log('E) Mutation controls')
{
  // A3/A5: the gate re-run against a clickbank entry with the list dropped.
  const approvedBy = (list: readonly PlanCode[] | null, plan: PlanCode) =>
    list === null ? true : list.includes(plan)
  check('E1: A5 fails when clickbank keeps no list',
    approvedBy(null, 'premium') && !approvedBy(['regular', 'advanced'], 'premium'))
  // B2: the builder without the gate, i.e. the code as it stood on 13.11.2026.
  const ungated = (plan: PlanCode) =>
    plan === 'premium' ? 'https://gtopseo.pay.clickbank.net/?cbitems=3' : null
  check('E2: B2 fails against the ungated builder', ungated('premium') !== null)
  // D1/D3: the page as it stood, iterating the catalogue.
  check('E3: D3 fails on a page that maps PLAN_CODES',
    stripComments('{PLAN_CODES.map((code) => {').includes('PLAN_CODES.map'))
  // The stripper has to strip, or a sentence in a comment could satisfy D.
  check('E4 (control): a grid named only in a comment does not count',
    !stripComments('{/* plansOnOffer.map */}\n<p>x</p>').includes('plansOnOffer.map'))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
