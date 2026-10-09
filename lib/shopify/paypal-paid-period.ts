/**
 * The PayPal period a migrating account has ALREADY PAID FOR (owner decision,
 * 9 Oct 2026: double billing must be impossible).
 *
 * An account on a paid PayPal subscription that connects a Shopify store gets a
 * 'pending' PayPal→Shopify migration (complete_shopify_app_store_link). Before
 * this module, the first Shopify plan confirmation cancelled PayPal and moved
 * billing to Shopify at once, so the merchant paid Shopify for days PayPal had
 * already been paid for. Now:
 *
 *   1. While the paid PayPal period runs, nothing moves. The account keeps its
 *      website plan (billing authority stays 'website', so every entitlement
 *      gate reads the PayPal row), and confirmShopifyActiveAndAdvance,
 *      start-intent and the embedded app all DEFER: no Shopify plan is offered
 *      and PayPal is not part of any completion.
 *   2. PayPal AUTO-RENEWAL is stopped right away (stopPayPalRenewalForMigration),
 *      so PayPal never charges again. PayPal's only way to stop renewal is
 *      POST /v1/billing/subscriptions/{id}/cancel; our database treats a
 *      'cancelled' row as paid through current_period_end
 *      (lib/subscription.ts getUserEntitlement and explainAccess), exactly as
 *      the dashboard's own "cancel renewal" (app/api/paypal/cancel) relies on.
 *      Access would end AT ONCE only for a 'cancelled' row with NO
 *      current_period_end, so renewal is never stopped until that date is known
 *      and in the future — it is filled from PayPal's own next_billing_time
 *      first when the row lacks it.
 *   3. After the period ends, the merchant chooses a Shopify plan in the
 *      embedded app; the existing confirmation path then completes the
 *      migration (re-cancelling an already-cancelled PayPal subscription is
 *      idempotent — lib/paypal/client.ts treats 404/422 as success).
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { cancelPayPalSubscription, fetchAuthoritativeBillingPeriod } from '@/lib/paypal/client'
import { getActiveMigrationResult, type MigrationRow } from './paypal-migration'

type Admin = ReturnType<typeof createAdminClient>

export interface PaidPeriodRow {
  id?: string
  status: string
  current_period_end: string | null
}

export type PaidPeriod =
  | { inPaidPeriod: false }
  /** paidUntil null: an ACTIVE row whose end date is not stored yet. */
  | { inPaidPeriod: true; paidUntil: string | null; renewalStopped: boolean }

/** PURE — the same rules as lib/subscription.ts, read for the paid period only. */
export function paidPeriodOf(row: PaidPeriodRow | null, now: Date): PaidPeriod {
  if (!row) return { inPaidPeriod: false }
  const endMs = row.current_period_end ? Date.parse(row.current_period_end) : NaN
  if (row.status === 'active') {
    if (!row.current_period_end) return { inPaidPeriod: true, paidUntil: null, renewalStopped: false }
    return Number.isFinite(endMs) && endMs > now.getTime()
      ? { inPaidPeriod: true, paidUntil: row.current_period_end, renewalStopped: false }
      : { inPaidPeriod: false }
  }
  if (row.status === 'cancelled') {
    return Number.isFinite(endMs) && endMs > now.getTime()
      ? { inPaidPeriod: true, paidUntil: row.current_period_end, renewalStopped: true }
      : { inPaidPeriod: false }
  }
  return { inPaidPeriod: false }
}

async function readPaidRow(
  admin: Admin, userId: string, paypalSubscriptionId: string,
): Promise<{ ok: true; row: (PaidPeriodRow & { id: string }) | null } | { ok: false; reason: string }> {
  try {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id, status, current_period_end')
      .eq('user_id', userId)
      .eq('paypal_subscription_id', paypalSubscriptionId)
      .in('status', ['active', 'cancelled'])
      .maybeSingle()
    if (error) return { ok: false, reason: (error.code || error.message || 'subscription_query_failed').slice(0, 120) }
    return { ok: true, row: (data as (PaidPeriodRow & { id: string }) | null) ?? null }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 120) : 'subscription_query_threw' }
  }
}

/**
 * Is this migration still inside the PayPal period the merchant paid for?
 * Only a 'pending' migration defers: 'shopify_confirmed' and
 * 'paypal_cancel_failed' rows were created by an earlier confirmation, when
 * Shopify was already charging, and stopping PayPal is what ends the overlap.
 * A read failure is reported as such — callers fail closed.
 */
export async function readMigrationPaidPeriod(
  admin: Admin,
  userId: string,
  migration: Pick<MigrationRow, 'status' | 'paypal_subscription_id'>,
  now: Date = new Date(),
): Promise<{ ok: true; period: PaidPeriod } | { ok: false; reason: string }> {
  if (migration.status !== 'pending' || !migration.paypal_subscription_id) return { ok: true, period: { inPaidPeriod: false } }
  const read = await readPaidRow(admin, userId, migration.paypal_subscription_id)
  if (!read.ok) return read
  return { ok: true, period: paidPeriodOf(read.row, now) }
}

export type StopRenewalOutcome =
  | 'lookup_failed'
  | 'no_migration'
  /** Not a 'pending' migration, or no paid PayPal row: nothing to stop here. */
  | 'not_applicable'
  | 'already_stopped'
  | 'stopped'
  /** The paid-through date is unknown or already past: renewal is NOT stopped, so access cannot end early. */
  | 'period_unknown'
  | 'failed'

export const RENEWAL_STOP_ERROR_PREFIX = 'renewal_stop_failed:'

/**
 * Stop the PayPal auto-renewal of a migrating account, keeping the paid period.
 * Idempotent: an already-cancelled row is left alone, and PayPal itself treats a
 * repeated cancel as done. Never throws.
 */
export async function stopPayPalRenewalForMigration(
  admin: Admin,
  userId: string,
  deps: { fetchImpl?: typeof fetch; now?: () => Date } = {},
): Promise<StopRenewalOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = (deps.now ?? (() => new Date()))()
  try {
    const found = await getActiveMigrationResult(admin, userId)
    if (!found.ok) return 'lookup_failed'
    const migration = found.migration
    if (!migration) return 'no_migration'
    if (migration.status !== 'pending' || !migration.paypal_subscription_id) return 'not_applicable'

    const read = await readPaidRow(admin, userId, migration.paypal_subscription_id)
    if (!read.ok) return 'lookup_failed'
    let row = read.row
    if (!row) return 'not_applicable'
    if (row.status === 'cancelled') return 'already_stopped'

    const recordFailure = async (reason: string) => {
      await admin
        .from('shopify_billing_migrations')
        .update({
          last_error: `${RENEWAL_STOP_ERROR_PREFIX}${reason}`.slice(0, 200),
          paypal_cancel_attempts: (migration.paypal_cancel_attempts ?? 0) + 1,
          updated_at: now.toISOString(),
        })
        .eq('id', migration.id)
        .eq('status', 'pending')
    }

    // The paid-through date must be KNOWN before renewal is stopped: a
    // 'cancelled' row without current_period_end has no access at all.
    if (!row.current_period_end) {
      const period = await fetchAuthoritativeBillingPeriod(migration.paypal_subscription_id, fetchImpl)
      if (!period.ok) { await recordFailure(`period_${period.reason}`); return 'period_unknown' }
      const { error } = await admin
        .from('subscriptions')
        .update({ current_period_end: period.periodEnd })
        .eq('id', row.id)
        .eq('user_id', userId)
        .is('current_period_end', null)
      if (error) { await recordFailure('period_write_failed'); return 'period_unknown' }
      const again = await readPaidRow(admin, userId, migration.paypal_subscription_id)
      if (!again.ok || !again.row) { await recordFailure('period_reread_failed'); return 'period_unknown' }
      row = again.row
      if (row.status === 'cancelled') return 'already_stopped'
    }
    const end = Date.parse(row.current_period_end ?? '')
    if (!Number.isFinite(end) || end <= now.getTime()) {
      // An ACTIVE row whose period has passed is a renewal webhook still on its
      // way; cancelling now could end a period PayPal has just charged for.
      await recordFailure('period_not_in_future')
      return 'period_unknown'
    }

    const cancel = await cancelPayPalSubscription(
      migration.paypal_subscription_id,
      'Store connected to Shopify: renewal stopped, paid period kept',
      fetchImpl,
    )
    if (!cancel.ok) { await recordFailure(cancel.reason); return 'failed' }

    // Local mirror of what PayPal's BILLING.SUBSCRIPTION.CANCELLED webhook will
    // also write. current_period_end is untouched, so access lasts until then.
    const { error: mirrorError } = await admin
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: now.toISOString() })
      .eq('id', row.id)
      .eq('user_id', userId)
      .eq('status', 'active')
    if (mirrorError) console.error('[shopify-migration] renewal stopped in PayPal; local mirror deferred to the webhook', { userId })
    await admin
      .from('shopify_billing_migrations')
      .update({ last_error: null, updated_at: now.toISOString() })
      .eq('id', migration.id)
      .eq('status', 'pending')
    return 'stopped'
  } catch (err) {
    console.error('[shopify-migration] stopping PayPal renewal threw', { userId, name: err instanceof Error ? err.name : 'unknown' })
    return 'failed'
  }
}
