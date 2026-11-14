/**
 * THE DATABASE AND THIS CODE MUST AGREE ON WHO CAN BILL AN ACCOUNT.
 *
 * `loadBillingGovernance` refuses to interpret a `billing_governance` row whose
 * `signup_origin` or `billing_authority` it does not recognise, and every
 * caller then fails closed: the route guard denies, `getUserEntitlement`
 * returns `entitlement_unavailable` with zero limits, and the merchant is
 * redirected to the plans page. That is the right behaviour for a row this code
 * genuinely cannot read.
 *
 * It is the WRONG behaviour when the database is right and the allowlist is
 * stale, and that is what happened on 2026-11-14. The marketplace migration
 * (supabase/migrations/20261016160000_marketplace_orders.sql) widened both CHECK
 * constraints to accept 'marketplace', and `claim_marketplace_order` writes
 * exactly that on every claim — while the two arrays in lib/billing/governance.ts
 * still listed only the older values. The first buyer to claim an order, the
 * Digistore24 reviewer on the Agency plan, had an `active` subscription with a
 * period running to 14.12 and was still sent to the Subscription Plans page and
 * could not create a project.
 *
 * So section A compares the arrays against the constraints as the migrations
 * leave them, which is the check that would have caught it. Section B proves the
 * outcome on the real resolution path for the row the production database holds
 * for that account. Section C is the mutation control: it shows the fail-closed
 * path is still armed for a value that genuinely is unknown, so section A
 * passing is not the validator having been weakened.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { BILLING_AUTHORITIES, SIGNUP_ORIGINS, loadBillingGovernance, resolveBillingAuthority } from '../governance'
import { explainAccess, getUserEntitlement } from '@/lib/subscription'
import { isShopifyGovernedAndActive } from '@/lib/shopify/entitlement-resolver'

const ROOT = join(__dirname, '../../..')
const MIGRATIONS = join(ROOT, 'supabase/migrations')

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

/**
 * The constraint as the migrations LEAVE it: every migration in order, last
 * definition wins, which is what the live database enforces. Returns null when
 * no migration defines the column at all, so a missing constraint can never be
 * mistaken for an empty one.
 */
function constraintValues(column: string): string[] | null {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  let last: string[] | null = null
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
    const re = new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)\\s*\\)`, 'gi')
    for (const m of sql.matchAll(re)) {
      const values = [...m[1]!.matchAll(/'([^']*)'/g)].map((v) => v[1]!)
      if (values.length) last = values
    }
  }
  return last
}

const sorted = (xs: readonly string[]) => [...xs].sort().join(',')

// The row production actually holds for the reviewer's claimed order, and the
// subscription the claim wrote. Not an invented shape: both were read out of
// the production database on 2026-11-14.
const CLAIMED_USER = 'claimed-marketplace-buyer'
const NOW = () => new Date('2026-11-14T14:10:00Z')
function claimedAccount(authority = 'marketplace', origin = 'marketplace') {
  return new FakeAdmin({
    profiles: [{ id: CLAIMED_USER, role: 'user' }],
    billing_governance: [{
      user_id: CLAIMED_USER, signup_origin: origin, billing_authority: authority,
      authority_reason: 'marketplace_order_claimed',
    }],
    subscriptions: [{
      id: 's1', user_id: CLAIMED_USER, plan_code: 'large_agency', status: 'active',
      trial_ends_at: null, current_period_end: '2026-12-14T00:00:00Z', created_at: '2026-11-14T07:23:05Z',
    }],
    shopify_connections: [],
    shopify_billing_migrations: [],
  })
}

async function main() {
  console.log('\nA) The allowlists in code are the database\'s CHECK constraints')
  {
    const dbAuthorities = constraintValues('billing_authority')
    const dbOrigins = constraintValues('signup_origin')
    check('A1: the migrations define a billing_authority constraint at all', dbAuthorities !== null)
    check('A2: the migrations define a signup_origin constraint at all', dbOrigins !== null)
    check('A3: BILLING_AUTHORITIES matches the constraint exactly',
      !!dbAuthorities && sorted(dbAuthorities) === sorted(BILLING_AUTHORITIES),
      `db=${JSON.stringify(dbAuthorities)} code=${JSON.stringify(BILLING_AUTHORITIES)}`)
    check('A4: SIGNUP_ORIGINS matches the constraint exactly',
      !!dbOrigins && sorted(dbOrigins) === sorted(SIGNUP_ORIGINS),
      `db=${JSON.stringify(dbOrigins)} code=${JSON.stringify(SIGNUP_ORIGINS)}`)
    check('A5: and the value the claim function writes is among them',
      BILLING_AUTHORITIES.includes('marketplace') && SIGNUP_ORIGINS.includes('marketplace'))
  }

  console.log('\nB) A claimed marketplace buyer gets the plan they paid for')
  {
    const admin = claimedAccount()
    const g = await loadBillingGovernance(admin as never, CLAIMED_USER)
    check('B1: the row READS — it is not reported invalid', g.status === 'loaded', JSON.stringify(g))

    const decision = await resolveBillingAuthority(admin as never, CLAIMED_USER)
    check('B2: authority resolves to marketplace', decision.ok === true && decision.authority === 'marketplace')

    const shopify = await isShopifyGovernedAndActive(admin as never, CLAIMED_USER, NOW)
    check('B3: marketplace is NOT Shopify-governed, so the subscriptions table decides',
      shopify.governed === false && shopify.reason === 'authority_not_shopify', JSON.stringify(shopify))

    const access = await explainAccess(CLAIMED_USER, admin as never, NOW)
    check('B4: the route guard ALLOWS the account', access.allowed === true && access.reason === 'website_active',
      JSON.stringify({ allowed: access.allowed, reason: access.reason }))

    const ent = await getUserEntitlement(CLAIMED_USER, admin as never, NOW)
    check('B5: the entitlement is the purchased plan, with its real project limit',
      ent.plan === 'large_agency' && ent.hasActiveSubscription === true && ent.limits.maxProjects > 1,
      `${ent.plan} maxProjects=${ent.limits.maxProjects}`)
    check('B6: and the buyer is not shown as being on a trial', ent.trialActive === false && ent.trialEndsAt === null)
  }

  console.log('\nC) CONTROLS — the fail-closed path is still armed, and still bites')
  {
    // C1/C2 are the production defect, reproduced by naming an authority the
    // database may hold but this code does not know. Before the fix these were
    // the outcome for 'marketplace' itself.
    const unknownAuthority = claimedAccount('paddle', 'website')
    const g = await loadBillingGovernance(unknownAuthority as never, CLAIMED_USER)
    check('C1: an authority this code does not know is INVALID, never read as website',
      g.status === 'invalid' && g.reason === 'unrecognised_billing_authority', JSON.stringify(g))
    const denied = await explainAccess(CLAIMED_USER, unknownAuthority as never, NOW)
    check('C2: and the route guard DENIES it, even with an active paid subscription',
      denied.allowed === false, JSON.stringify({ allowed: denied.allowed, reason: denied.reason }))

    const unknownOrigin = claimedAccount('website', 'imported_from_spreadsheet')
    const g2 = await loadBillingGovernance(unknownOrigin as never, CLAIMED_USER)
    check('C3: the same holds for an unknown signup_origin',
      g2.status === 'invalid' && g2.reason === 'unrecognised_signup_origin', JSON.stringify(g2))

    // C4 breaks section A's comparison on purpose: a list that has lost a value
    // the database accepts must not compare equal.
    const dropped = BILLING_AUTHORITIES.filter((a) => a !== 'marketplace')
    const dbAuthorities = constraintValues('billing_authority')
    check('C4: section A\'s comparison FAILS when the code list loses a value the database allows',
      !!dbAuthorities && sorted(dbAuthorities) !== sorted(dropped))

    // C5: the constraint reader must take the LAST definition, not the first,
    // or a later widening would be invisible to A3 and A4.
    const first = readFileSync(join(MIGRATIONS, '20260901000000_billing_governance.sql'), 'utf8')
    check('C5: the reader takes the widened constraint, not the original one',
      /CHECK \(billing_authority IN \('website', 'shopify'\)\)/.test(first)
      && !!dbAuthorities && dbAuthorities.includes('marketplace'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
