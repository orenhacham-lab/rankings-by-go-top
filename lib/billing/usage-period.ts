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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

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
    if (row.shopify_current_period_start && row.shopify_current_period_end) {
      return { start: new Date(row.shopify_current_period_start), end: new Date(row.shopify_current_period_end), source: 'shopify' }
    }
    // Shopify-governed but no verified period yet (never checked, or
    // verification failed) — no PayPal/trial fallback is ever consulted for
    // a Shopify-governed user (same rule as the general entitlement
    // resolver). Fail closed: no resolvable period.
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
    if (!row.trial_ends_at) return null
    const end = new Date(row.trial_ends_at)
    // Prefer the actual stored trial/subscription creation timestamp as the
    // trial start when available (reliable — set once, at row-insert time,
    // never mutated). `trial_ends_at - 7 days` is only a documented
    // fallback for the case created_at is somehow unavailable.
    const start = row.created_at ? new Date(row.created_at) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    return { start, end, source: 'trial' }
  }

  if (!row.current_period_end) return null
  const end = new Date(row.current_period_end)
  // Documented compatibility fallback for a pre-existing subscriber whose
  // current_period_start hasn't been backfilled yet (added in this same
  // migration) — resolves to a synthetic ~1-calendar-month-earlier period
  // until their next authoritative PayPal renewal event fills in the real
  // value. True calendar-month subtraction (not a flat 30 days).
  let start: Date
  if (row.current_period_start) {
    start = new Date(row.current_period_start)
  } else {
    start = new Date(end)
    start.setUTCMonth(start.getUTCMonth() - 1)
  }
  return { start, end, source: 'paypal' }
}
