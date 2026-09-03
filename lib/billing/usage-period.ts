/**
 * Phase 3 — the SHARED billing-period resolver used by every usage-quota
 * check (Google checks, AI checks, articles). Replaces the old fixed
 * UTC-calendar-month period (`currentPeriodStart()` in lib/quota.ts) with the
 * user's ACTUAL subscription billing period, so a customer subscribing near
 * the end of a calendar month never gets a second full allowance a few days
 * later when the calendar month rolls over.
 *
 * Resolution order (first match wins), mirroring lib/subscription.ts's own
 * precedence: Shopify-governed (cache-only, no live Partner API call — same
 * hot-path design as isShopifyGovernedAndActive) → PayPal subscription row
 * (paypal_subscription_id present) → legacy/manual active subscription
 * (status='active', paypal_subscription_id NULL — see the "Legacy/manual"
 * section below) → trial → null (no resolvable period; callers MUST fail
 * closed, never grant an allowance with no period to bound it).
 *
 * Admins are NOT resolved here — every existing quota call site already
 * short-circuits on entitlement.isAdmin before consulting a period at all.
 *
 * Final Phase 3 compatibility fix — legacy/manual active subscriptions.
 * Production evidence: an active, large_agency-plan subscription exists with
 * paypal_subscription_id NULL, no connected Shopify connection, a NULL
 * current_period_end, and an expired trial_ends_at. This is a genuine,
 * legitimate paid subscriber whose row simply predates (or was never routed
 * through) the PayPal activation/renewal flow that populates
 * current_period_end — NOT a PayPal subscription with missing data, and NOT
 * a trial. Before this fix, such a row fell into the PayPal branch (the only
 * remaining branch after trial), which correctly requires an authoritative
 * current_period_end and therefore correctly-but-wrongly failed closed for
 * this account. The fix distinguishes this case EXPLICITLY, by
 * paypal_subscription_id being NULL while status='active' — never by
 * "current_period_end happens to be missing" (a genuine PayPal subscription
 * with a missing/malformed current_period_end must still fail closed; see
 * the tests). A legacy/manual row's own current_period_start/
 * current_period_end are NEVER read or trusted (there is no PayPal
 * authoritative source backing them) — instead this resolves the exact
 * fixed UTC-calendar-month period this app used before Phase 3 introduced
 * per-subscription periods, so these accounts keep the SAME quota-period
 * behavior they always had.
 */

import { parseInstantMs } from '@/lib/paypal/timestamp'
import { PLAN_CATALOG, type PlanCode } from '@/lib/plans/catalog'
import { isSupportedShopifyPlanHandle, type ShopifyPlanHandle } from '@/lib/shopify/constants'

/** Shopify App Pricing handle → internal plan code. Same mapping as
 *  lib/shopify/entitlement-resolver.ts; the only spelling difference is the
 *  hyphen in `large-agency`. */
const SHOPIFY_HANDLE_TO_PLAN_CODE: Record<ShopifyPlanHandle, PlanCode> = {
  regular: 'regular',
  advanced: 'advanced',
  premium: 'premium',
  'large-agency': 'large_agency',
}

const DAY_MS = 24 * 60 * 60 * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** Parses a stored billing-period timestamp, failing to `null` (never an
 *  Invalid Date silently embedded in a UsagePeriod) if the DB value is
 *  missing or unparseable — see lib/paypal/timestamp.ts for why raw
 *  timestamp strings must never be trusted without validation. */
function parseStoredInstant(raw: string | null | undefined): Date | null {
  const ms = parseInstantMs(raw)
  return ms === null ? null : new Date(ms)
}

/** The first instant of `reference`'s UTC calendar month, and the first
 *  instant of the FOLLOWING UTC calendar month — used ONLY for the
 *  legacy/manual fallback below. `Date.UTC` itself correctly rolls
 *  month=12 into January of the next year (December → January) and handles
 *  leap years natively (day is always 1, never 28/29/30/31, so no special
 *  leap-year handling is needed here at all). */
function utcCalendarMonthPeriod(reference: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return { start, end }
}

export interface UsagePeriod {
  start: Date
  end: Date
  source: 'shopify' | 'shopify_trial' | 'paypal' | 'trial' | 'legacy_manual'
}

interface ShopifyPeriodRow {
  shopify_subscription_status: string | null
  shopify_plan_handle: string | null
  shopify_trial_ends_at: string | null
  shopify_current_period_start: string | null
  shopify_current_period_end: string | null
}

interface SubscriptionPeriodRow {
  status: string
  plan_code: string | null
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  created_at: string
  paypal_subscription_id: string | null
}

/** `nowFn` — same injectable-clock convention as lib/subscription.ts, so the
 *  UTC-calendar-month fallback's start/end are genuinely deterministic in
 *  tests (never depending on the wall clock at test-run time). */
export async function resolveCurrentUsagePeriod(
  admin: Admin,
  userId: string,
  nowFn: () => Date = () => new Date(),
): Promise<UsagePeriod | null> {
  const { data: shopifyConn } = await admin
    .from('shopify_connections')
    .select('shopify_subscription_status, shopify_plan_handle, shopify_trial_ends_at, shopify_current_period_start, shopify_current_period_end')
    .eq('user_id', userId)
        .eq('connection_status', 'connected')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (shopifyConn) {
    const row = shopifyConn as ShopifyPeriodRow
    const shopifyStart = parseStoredInstant(row.shopify_current_period_start)
    const shopifyEnd = parseStoredInstant(row.shopify_current_period_end)
    // Corrective pass — a stored value that fails to parse is treated
    // exactly like a missing one (fail closed below), never silently
    // embedded as an Invalid Date that downstream quota comparisons would
    // then evaluate as always-false.
    if (shopifyStart && shopifyEnd) {
      return { start: shopifyStart, end: shopifyEnd, source: 'shopify' }
    }

    // SHOPIFY MANAGED-PRICING TRIAL (production incident).
    //
    // During the free trial Shopify reports a real, ACTIVE subscription with
    // `currentBillingCycle: null` — no money has moved yet, so there is no
    // billing cycle to report — while `trialEndsAt` is populated. Requiring a
    // cycle therefore resolved NO period for a paying-in-trial merchant, and
    // article generation converted that into `quota_exceeded`: the account was
    // told its 20-article allowance was used up before a single article had
    // been generated.
    //
    // The trial IS the current usage period. Its authoritative end is the
    // stored `shopify_trial_ends_at`; the start is that minus the plan's own
    // catalog trialDays (the documented fallback pattern already used for the
    // website trial above), never an unrelated hard-coded duration.
    const status = (row.shopify_subscription_status ?? '').trim()
    const handle = (row.shopify_plan_handle ?? '').trim()
    const trialEnd = parseStoredInstant(row.shopify_trial_ends_at)
    if (
      status === 'active'
      && isSupportedShopifyPlanHandle(handle)
      && trialEnd
      // A trial that has already ended is NOT a current period. With no
      // billing cycle beside it there is nothing to resolve, so it falls
      // through and fails closed — never a silent extra allowance.
      && trialEnd.getTime() > nowFn().getTime()
    ) {
      const trialDays = PLAN_CATALOG[SHOPIFY_HANDLE_TO_PLAN_CODE[handle]].trialDays
      return { start: new Date(trialEnd.getTime() - trialDays * DAY_MS), end: trialEnd, source: 'shopify_trial' }
    }

    // Shopify-governed but no verified (or a corrupt) period yet (never
    // checked, verification failed, malformed data, or an expired trial with
    // no billing cycle) — no PayPal/trial fallback is ever consulted for a
    // Shopify-governed user (same rule as the general entitlement resolver).
    // Fail closed: no resolvable period.
    return null
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, plan_code, trial_ends_at, current_period_start, current_period_end, created_at, paypal_subscription_id')
    .eq('user_id', userId)
    .in('status', ['trial', 'active', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sub) return null
  const row = sub as SubscriptionPeriodRow

  if (row.status === 'trial' || !row.plan_code) {
    // Corrective pass — trial_ends_at is the AUTHORITATIVE boundary here;
    // missing OR unparseable both fail closed identically (never an Invalid
    // Date silently returned as a "resolvable" period).
    const end = parseStoredInstant(row.trial_ends_at)
    if (!end) return null
    // Prefer the actual stored trial/subscription creation timestamp as the
    // trial start when available and parseable (reliable — set once, at
    // row-insert time, never mutated). `trial_ends_at - 7 days` is the
    // documented fallback for the case created_at is unavailable OR
    // somehow malformed — a non-authoritative convenience field either way.
    const start = parseStoredInstant(row.created_at) ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    return { start, end, source: 'trial' }
  }

  // Final Phase 3 compatibility fix — legacy/manual active subscription.
  // Explicitly gated on BOTH status === 'active' AND paypal_subscription_id
  // being NULL — never inferred from current_period_end happening to be
  // missing (that would also, wrongly, catch a genuine PayPal subscription
  // whose authoritative date is simply absent/corrupt, which must still
  // fail closed below). A CANCELLED row with no paypal_subscription_id
  // falls through to the PayPal branch below instead (and correctly
  // resolves to null there — there is no authoritative period, PayPal or
  // otherwise, to grace a cancelled legacy/manual row against).
  if (row.status === 'active' && row.paypal_subscription_id === null) {
    const { start, end } = utcCalendarMonthPeriod(nowFn())
    return { start, end, source: 'legacy_manual' }
  }

  // PayPal branch — reached when paypal_subscription_id IS present (a
  // genuine PayPal subscription), or when status is 'cancelled' with
  // paypal_subscription_id null (a legacy/manual row that is no longer
  // active — no authoritative period, PayPal or otherwise, to grace it
  // against). current_period_end is the AUTHORITATIVE boundary here;
  // missing OR unparseable both fail closed identically — a genuine PayPal
  // subscription with a missing/corrupt date is NEVER routed to the
  // legacy/manual fallback above.
  const end = parseStoredInstant(row.current_period_end)
  if (!end) return null
  // Documented compatibility fallback for a pre-existing subscriber whose
  // current_period_start hasn't been backfilled yet (added in this same
  // migration) — resolves to a synthetic ~1-calendar-month-earlier period
  // until their next authoritative PayPal renewal event fills in the real
  // value. True calendar-month subtraction (not a flat 30 days). A stored
  // current_period_start that fails to parse falls back the SAME way as one
  // that's simply absent — this field is a documented, non-authoritative
  // compatibility value already, so a corrupt one degrades exactly like a
  // missing one rather than failing the whole period closed.
  let start: Date
  const storedStart = parseStoredInstant(row.current_period_start)
  if (storedStart) {
    start = storedStart
  } else {
    start = new Date(end)
    start.setUTCMonth(start.getUTCMonth() - 1)
  }
  return { start, end, source: 'paypal' }
}
