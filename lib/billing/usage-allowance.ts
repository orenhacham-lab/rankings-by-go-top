/**
 * WHAT IS LEFT OF AN ALLOWANCE, read from the ledger that actually enforces it.
 *
 * WHY THIS IS NOT A COUNTER SOMEBODY TYPED. The Shopify plan promises "up to 20
 * AI checks per monthly billing period" and nothing in the product showed the
 * merchant a number — so there was no way to tell an exhausted allowance from a
 * broken button, which is exactly the position the reviewer was in.
 *
 * The obvious shortcut would be `countAIScansThisPeriodForProject`, which
 * counts `ai_scan_runs` since `currentPeriodStart()` — the LEGACY fixed
 * calendar month. For a Shopify managed-pricing trial the real period is the
 * trial window, so that count would disagree with the dispatcher and the
 * displayed number would be a second, wrong opinion about the same fact.
 *
 * So this reads `usage_reservations` with the SAME predicate `reserve_usage`
 * uses (supabase/migrations/…_add_usage_reservations_and_billing_periods.sql):
 * consumed rows count what they consumed, live reservations inside the 30-minute
 * lease count what they hold, everything else counts zero — over the period
 * `resolveCurrentUsagePeriod` resolves and the limit `getUserEntitlement`
 * grants. A number that cannot disagree with the gate is the only kind worth
 * showing.
 */

import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { UsageType } from '@/lib/billing/usage-reservations'
import { resolveCurrentUsagePeriod } from '@/lib/billing/usage-period'
import { getUserEntitlement } from '@/lib/subscription'
import { isEntitlementUnknown } from '@/lib/quota'

/** The lease window in the RPC: a reservation older than this no longer holds
 *  capacity, so it must not be counted as used here either. */
const RESERVATION_LEASE_MS = 30 * 60 * 1000

export type AllowanceState =
  /** A real limit, a real period and a real count. */
  | { state: 'known'; limit: number; used: number; remaining: number
      periodStart: string; periodEnd: string; plan: string }
  /** Entitlement could not be read. NOT zero — the caller must say "unknown". */
  | { state: 'unknown'; reason: 'entitlement_unavailable' | 'no_period' }
  /** Admin accounts are not metered. */
  | { state: 'unmetered' }

interface ReservationRow {
  status?: string | null
  reserved_amount?: number | null
  consumed_amount?: number | null
  reserved_at?: string | null
}

/**
 * `usageType` is the ledger's own key, so this works for AI checks, Google
 * checks and articles without a second implementation per surface.
 */
export async function readUsageAllowance(
  admin: ServiceRoleClient,
  args: {
    userId: string
    usageType: UsageType
    /** Which limit this usage is measured against, from the entitlement. */
    limitFor: (limits: import('@/lib/subscription').PlanLimits) => number
    nowMs?: number
  },
): Promise<AllowanceState> {
  const entitlement = await getUserEntitlement(args.userId, admin)
  // An unreadable entitlement is NOT an exhausted one. Reporting 0/0 here would
  // reproduce, in the UI, the exact lie the routes were fixed to stop telling.
  if (isEntitlementUnknown(entitlement.plan)) return { state: 'unknown', reason: 'entitlement_unavailable' }
  if (entitlement.isAdmin) return { state: 'unmetered' }

  const period = await resolveCurrentUsagePeriod(admin, args.userId)
  if (!period) return { state: 'unknown', reason: 'no_period' }

  const { data, error } = await admin
    .from('usage_reservations')
    .select('status, reserved_amount, consumed_amount, reserved_at')
    .eq('user_id', args.userId)
    .eq('usage_type', args.usageType)
    .eq('period_start', period.start.toISOString())
  if (error) return { state: 'unknown', reason: 'entitlement_unavailable' }

  const now = args.nowMs ?? Date.now()
  const used = (data ?? []).reduce((total: number, raw: ReservationRow) => {
    const status = raw.status ?? ''
    if (status === 'consumed' || status === 'partially_consumed') {
      return total + Number(raw.consumed_amount ?? 0)
    }
    if (status === 'reserved') {
      const at = raw.reserved_at ? Date.parse(raw.reserved_at) : NaN
      // A lease that has expired holds nothing — same rule as the RPC.
      if (Number.isFinite(at) && now - at < RESERVATION_LEASE_MS) {
        return total + Number(raw.reserved_amount ?? 0)
      }
    }
    return total
  }, 0)

  const limit = args.limitFor(entitlement.limits)
  return {
    state: 'known',
    limit,
    used,
    remaining: Math.max(0, limit - used),
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    plan: entitlement.plan,
  }
}
