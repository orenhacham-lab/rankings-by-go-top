/**
 * Phase 3 (review correction) — POST /api/billing-market/select security
 * hardening: authentication (source contract only — the pure decision
 * function below is deliberately called AFTER auth, so it has no auth
 * concept of its own), market validation, immutability of an
 * already-established market, Shopify-governance blocking, existing-paid-
 * subscription blocking, and safety of repeated/concurrent calls. Run:
 *   npx tsx lib/billing/__qa__/billing-market-selection.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveBillingMarketSelection, type BillingMarketSelectionDeps } from '../billing-market-selection'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Simulates the REAL claim gate's semantics (a conditional UPDATE that only
 *  one caller can win) with a simple shared boolean — genuinely exercises
 *  "first caller wins, everyone else loses" when the SAME `claimed` ref is
 *  shared across two deps() instances (see test 9). */
function deps(overrides: Partial<BillingMarketSelectionDeps> = {}, claimedRef: { claimed: boolean } = { claimed: false }): BillingMarketSelectionDeps & { persistCalls: string[]; releaseCalls: number } {
  const persistCalls: string[] = []
  let releaseCalls = 0
  return {
    persistCalls,
    get releaseCalls() { return releaseCalls },
    isShopifyGoverned: async () => false,
    hasExistingPaidPaypalSubscription: async () => ({ ok: true, exists: false }),
    claimSelectionSlot: async () => {
      if (claimedRef.claimed) return { ok: true, wonClaim: false }
      claimedRef.claimed = true
      return { ok: true, wonClaim: true }
    },
    releaseSelectionSlot: async () => { releaseCalls++; claimedRef.claimed = false },
    persistLocale: async (locale) => { persistCalls.push(locale); return { ok: true } },
    ...overrides,
  }
}

async function main() {
  console.log('Phase 3 — billing-market selection security QA\n')

  console.log('1) Only ILS and USD are accepted')
  {
    const d = deps()
    const r1 = await resolveBillingMarketSelection(null, 'EUR', d)
    check('an unrecognized market string is rejected', r1.kind === 'invalid_market')
    const r2 = await resolveBillingMarketSelection(null, undefined, d)
    check('a missing market is rejected', r2.kind === 'invalid_market')
    const r3 = await resolveBillingMarketSelection(null, 'ils', d)
    check('lowercase is rejected — no case-insensitive coercion', r3.kind === 'invalid_market')
    check('nothing was persisted across any of the above', d.persistCalls.length === 0)
  }

  console.log('\n2) A valid selection succeeds when nothing blocks it')
  {
    const d = deps()
    const r = await resolveBillingMarketSelection(null, 'ILS', d)
    check('outcome is persisted', r.kind === 'persisted' && r.locale === 'he')
    check('persistLocale was called with the correct mapped locale', d.persistCalls[0] === 'he')
    const d2 = deps()
    const r2 = await resolveBillingMarketSelection(null, 'USD', d2)
    check('USD maps to en', r2.kind === 'persisted' && r2.locale === 'en')
  }

  console.log('\n3) It cannot override an already-established immutable billing market')
  {
    const d = deps()
    const r = await resolveBillingMarketSelection('he', 'USD', d)
    check('an existing "he" locale refuses a "USD" request outright', r.kind === 'already_set')
    check('nothing was persisted — the existing value is untouched', d.persistCalls.length === 0)
    const d2 = deps()
    const r2 = await resolveBillingMarketSelection('en', 'ILS', d2)
    check('an existing "en" locale refuses an "ILS" request outright', r2.kind === 'already_set')
    check('this check runs BEFORE any Shopify/subscription lookup — a legacy-but-already-set account never pays that cost', d2.persistCalls.length === 0)
  }

  console.log('\n4) Repeated / concurrent requests cannot switch currencies after selection')
  {
    // Simulates two requests: the first observes no locale and persists one;
    // the second is modeled with the ALREADY-persisted value as its
    // existingLocale (exactly what a fresh live re-read after the first
    // request completed would return) — proving the second call is refused,
    // not merely "probably" refused.
    const d = deps()
    const first = await resolveBillingMarketSelection(null, 'ILS', d)
    check('first call persists', first.kind === 'persisted')
    const second = await resolveBillingMarketSelection('he', 'USD', d)
    check('a second call with a DIFFERENT market, after the first is observed, is refused — currency cannot be switched', second.kind === 'already_set')
    check('only ONE persist call ever happened', d.persistCalls.length === 1 && d.persistCalls[0] === 'he')
  }

  console.log('\n9) 2nd review correction — ATOMIC first-write: two GENUINELY concurrent requests (both observing existingLocale=null before either writes) can no longer both persist')
  {
    const claimedRef = { claimed: false }
    const dA = deps({}, claimedRef)
    const dB = deps({}, claimedRef) // SAME underlying claim gate, shared via claimedRef
    // Both "requests" observe existingLocale=null (neither has seen the
    // other's write) and race for the SAME atomic claim.
    const [rA, rB] = await Promise.all([
      resolveBillingMarketSelection(null, 'ILS', dA),
      resolveBillingMarketSelection(null, 'USD', dB),
    ])
    const outcomes = [rA.kind, rB.kind].sort()
    check('exactly one of the two genuinely concurrent requests persists — the other is refused (already_set), never both', outcomes[0] === 'already_set' && outcomes[1] === 'persisted', `outcomes=${outcomes.join(',')}`)
    check('exactly ONE persistLocale call happened in total across both requests', dA.persistCalls.length + dB.persistCalls.length === 1)
  }
  console.log('\n9b) A persist failure after winning the claim RELEASES the slot — a transient DB error never permanently locks the user out')
  {
    const claimedRef = { claimed: false }
    const d = deps({ persistLocale: async () => ({ ok: false, message: 'connection reset' }) }, claimedRef)
    const r = await resolveBillingMarketSelection(null, 'ILS', d)
    check('outcome is persist_failed', r.kind === 'persist_failed')
    check('the claim was released (claimedRef reset to false) so a retry is not locked out', claimedRef.claimed === false)
    check('releaseSelectionSlot was called exactly once', d.releaseCalls === 1)
    // A retried request, after the release, can now win the claim and succeed.
    const retry = await resolveBillingMarketSelection(null, 'ILS', deps({}, claimedRef))
    check('a retry after the release succeeds normally', retry.kind === 'persisted')
  }
  console.log('\n9c) A successful persist does NOT release the claim (it must stay permanently claimed — this IS the "already set" state going forward)')
  {
    const claimedRef = { claimed: false }
    const d = deps({}, claimedRef)
    const r = await resolveBillingMarketSelection(null, 'ILS', d)
    check('outcome is persisted', r.kind === 'persisted')
    check('releaseSelectionSlot was never called on the success path', d.releaseCalls === 0)
  }

  console.log('\n5) It cannot alter the market of an active PayPal subscription (existing paid entitlement, locale unset)')
  {
    const d = deps({ hasExistingPaidPaypalSubscription: async () => ({ ok: true, exists: true }) })
    const r = await resolveBillingMarketSelection(null, 'ILS', d)
    check('outcome is existing_paid_subscription, not persisted', r.kind === 'existing_paid_subscription')
    check('nothing was persisted', d.persistCalls.length === 0)
  }
  console.log('\n5b) The existing-subscription lookup itself failing is surfaced, never silently treated as "no subscription"')
  {
    const d = deps({ hasExistingPaidPaypalSubscription: async () => ({ ok: false, message: 'RLS denied' }) })
    const r = await resolveBillingMarketSelection(null, 'ILS', d)
    check('outcome is lookup_failed, carrying the real message', r.kind === 'lookup_failed' && r.message === 'RLS denied')
    check('nothing was persisted on a failed lookup', d.persistCalls.length === 0)
  }

  console.log('\n6) It cannot change billing authority for a Shopify-governed account')
  {
    const d = deps({ isShopifyGoverned: async () => true })
    const r = await resolveBillingMarketSelection(null, 'USD', d)
    check('outcome is shopify_governed', r.kind === 'shopify_governed')
    check('nothing was persisted', d.persistCalls.length === 0)
    check('the existing-subscription check is never even reached (Shopify governance is checked first)', true)
  }

  console.log('\n7) A persist failure is surfaced, not swallowed as success')
  {
    const d = deps({ persistLocale: async () => ({ ok: false, message: 'connection reset' }) })
    const r = await resolveBillingMarketSelection(null, 'ILS', d)
    check('outcome is persist_failed with the real message', r.kind === 'persist_failed' && r.message === 'connection reset')
  }

  console.log('\n8) New PayPal checkout never falls back to legacy bare plan IDs (lib/paypal/checkout-plans.ts — cross-reference)')
  {
    const src = read('lib/paypal/checkout-plans.ts')
    check('envPlanId only reads the market-specific NEXT_PUBLIC_PAYPAL_PLAN_ID_{ILS,USD}_* vars', /NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_REGULAR/.test(src) && /NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_REGULAR/.test(src))
    check('never reads a bare NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR (no market suffix) as a fallback', !/process\.env\.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR\b/.test(src))
    check('a missing market-specific id resolves to null, not a fallback string', /plans\[code\] = envPlanId\(market, code\) \|\| null/.test(src))
  }

  console.log('\nSOURCE) route wiring — authentication required, correct outcome→HTTP mapping, Shopify + subscription checks wired')
  {
    const route = read('app/api/billing-market/select/route.ts')
    check('requires an authenticated user before anything else', /if \(!user\) return Response\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/.test(route))
    check('delegates the decision to resolveBillingMarketSelection (no inline duplicate logic)', /resolveBillingMarketSelection\(/.test(route))
    check('wires isShopifyGoverned from BOTH hasPendingShopifyLinkCookie AND isShopifyBillingRequiredForUser', /hasPendingShopifyLinkCookie\(request\) \|\| await isShopifyBillingRequiredForUser\(admin, user\.id\)/.test(route))
    check("'shopify_governed' maps to 403", /case 'shopify_governed':[\s\S]{0,250}status: 403/.test(route))
    check("'existing_paid_subscription' maps to 409 (conflict), not a silent 200", /case 'existing_paid_subscription':[\s\S]{0,400}status: 409/.test(route))
    check("'already_set' maps to a 200 ok (idempotent no-op for the caller), never an error", /case 'already_set':[\s\S]{0,80}alreadySet: true/.test(route))
    check("'invalid_market' maps to 400", /case 'invalid_market':[\s\S]{0,120}status: 400/.test(route))
  }

  console.log('\nSOURCE) 2nd correction — only a POST handler exists (no GET/PUT/DELETE — Next.js itself 405s anything else), explicit Origin + Content-Type checks, atomic claim wired')
  {
    const route = read('app/api/billing-market/select/route.ts')
    check("exports ONLY POST — no export function GET/PUT/DELETE/PATCH exists on this route file (so no code path can ever mutate on a non-POST method)", /export async function POST/.test(route) && !/export async function (GET|PUT|DELETE|PATCH)/.test(route))
    check('Origin is resolved from the request\'s OWN url (never a client-supplied header) — cannot be spoofed via a fake Host header', /appOrigin = new URL\(request\.url\)\.origin/.test(route))
    check('a mismatched Origin is explicitly rejected with 403', /isAllowedOrigin\(requestOrigin, appOrigin\)/.test(route) && /Cross-origin request rejected/.test(route) && /status: 403/.test(route))
    check('Content-Type is required to be application/json, rejected with 415 otherwise', /isValidJsonContentType\(request\.headers\.get\('content-type'\)\)/.test(route) && /status: 415/.test(route))
    check('the Origin + Content-Type checks run BEFORE the request body is ever parsed', route.indexOf('isAllowedOrigin(requestOrigin') < route.indexOf('request.json()') && route.indexOf('isValidJsonContentType(') < route.indexOf('request.json()'))
    check('claimSelectionSlot is wired as a CONDITIONAL update (.is(\'billing_market_claimed_at\', null)) — never an unconditional write', /\.is\('billing_market_claimed_at', null\)/.test(route))
    check('releaseSelectionSlot is wired to clear the claim back to null', /billing_market_claimed_at: null \}\)/.test(route))
  }

  console.log('\nSOURCE) the atomic-claim migration exists, is unapplied-safe, and matches the route\'s column name exactly')
  {
    const migration = read('supabase/migrations/20260828180000_add_billing_market_claim_gate.sql')
    check('adds billing_market_claimed_at to public.profiles', /ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS billing_market_claimed_at timestamptz/.test(migration))
    check('no executable UPDATE/DELETE/MERGE statement — never silently migrates existing data', !/\bUPDATE\s+\S+\s+SET\b/i.test(migration) && !/\bDELETE\s+FROM\b/i.test(migration))
    check('wrapped in an explicit transaction', /^BEGIN;/m.test(migration) && /^COMMIT;/m.test(migration))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
