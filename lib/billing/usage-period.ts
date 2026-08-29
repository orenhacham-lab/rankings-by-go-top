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
 * hot-path design as isShopifyGovernedAndActive) → PayPal/trial subscriptions
 * row → null (no resolvable period; callers MUST fail closed, never grant an
 * allowance with no period to bound it).
 *
 * Admins are NOT resolved here — every existing quota call site already
 * short-circuits on entitlement.isAdmin before consulting a period at all.
 */

import { parseInstantMs } from '@/lib/paypal/timestamp'

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

export interface UsagePeriod {
  start: Date
  end: Date
  source: 'shopify' | 'paypal' | 'trial'
}

interface ShopifyPeriodRow {
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
}

export async function resolveCurrentUsagePeriod(admin: Admin, userId: string): Promise<UsagePeriod | null> {
  const { data: shopifyConn } = await admin
    .from('shopify_connections')
    .select('shopify_current_period_start, shopify_current_period_end')
    .eq('user_id', userId)
    .eq('connection_status', 'connected')
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
    // Shopify-governed but no verified (or a corrupt) period yet (never
    // checked, verification failed, or malformed data) — no PayPal/trial
    // fallback is ever consulted for a Shopify-governed user (same rule as
    // the general entitlement resolver). Fail closed: no resolvable period.
    return null
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, plan_code, trial_ends_at, current_period_start, current_period_end, created_at')
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

  // Corrective pass — current_period_end is the AUTHORITATIVE boundary;
  // missing OR unparseable both fail closed identically.
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
