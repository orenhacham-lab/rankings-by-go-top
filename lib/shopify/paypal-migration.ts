/**
 * Phase 2 — PayPal → Shopify billing migration state machine.
 *
 * A user who already has a real, paid PayPal subscription (status='active'
 * AND a non-null paypal_subscription_id — a trial row never qualifies, since
 * it was never actually billed) and then connects a Shopify store must
 * migrate before Shopify publishing is usable (enforced separately by
 * lib/shopify/billing-guard.ts, which fails closed while a migration row is
 * in any non-'completed' state). This module owns the state machine itself:
 *
 *   pending            → migration started; Shopify not yet confirmed active.
 *                         PayPal is left completely untouched.
 *   shopify_confirmed  → the Partner API has confirmed an active plan, but
 *                         PayPal has NOT been cancelled yet. This state makes
 *                         the gap between "Shopify confirmed" and "PayPal
 *                         cancelled" durable — a crash/retry mid-way is
 *                         always recoverable from the DB, never silently lost.
 *   completed          → Shopify confirmed AND PayPal successfully cancelled.
 *                         Terminal.
 *   paypal_cancel_failed → Shopify confirmed, but the PayPal cancel call
 *                         itself failed. Surfaced (not hidden) for retry —
 *                         the billing-guard keeps Shopify publishing locked
 *                         until this resolves to 'completed', so the account
 *                         can never end up billed by both providers with
 *                         Shopify publishing already unlocked.
 *
 * Every state transition here is idempotent and safe to call repeatedly —
 * see confirmShopifyActiveAndAdvance, the function the billing-return route
 * calls on every return from Shopify's hosted pricing page.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { cancelPayPalSubscription } from '@/lib/paypal/client'

type Admin = ReturnType<typeof createAdminClient>

export type MigrationStatus = 'pending' | 'shopify_confirmed' | 'completed' | 'paypal_cancel_failed'
const ACTIVE_STATUSES: readonly MigrationStatus[] = ['pending', 'shopify_confirmed', 'paypal_cancel_failed']

export interface MigrationRow {
  id: string
  user_id: string
  project_id: string
  shopify_connection_id: string | null
  paypal_subscription_id: string | null
  status: MigrationStatus
  paypal_cancel_attempts: number
}

const nowIso = () => new Date().toISOString()

/** The user's current non-terminal migration row, if any. Null when there is none. */
export async function getActiveMigration(admin: Admin, userId: string): Promise<MigrationRow | null> {
  const { data } = await admin
    .from('shopify_billing_migrations')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES as string[])
    .maybeSingle()
  return (data as MigrationRow | null) ?? null
}

/**
 * Called once, right after a Shopify connection is saved (OAuth callback).
 * If this user has a real, currently-billed PayPal subscription, start (or
 * reuse) a migration row so Shopify publishing stays locked until they
 * migrate. A trial-only user, or a user with no PayPal subscription at all,
 * is a no-op — there is nothing to migrate. Idempotent: reuses an existing
 * active row rather than creating a duplicate (the unique partial index
 * would reject a duplicate insert anyway).
 */
export async function initiateMigrationIfPayPalSubscriber(
  admin: Admin,
  args: { userId: string; projectId: string; shopifyConnectionId: string },
): Promise<void> {
  const { data: sub } = await admin
    .from('subscriptions')
    .select('paypal_subscription_id, status')
    .eq('user_id', args.userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const paypalSubscriptionId = (sub as { paypal_subscription_id: string | null } | null)?.paypal_subscription_id
  if (!paypalSubscriptionId) return // no real PayPal subscription to migrate away from

  const existing = await getActiveMigration(admin, args.userId)
  if (existing) {
    // Re-connecting (possibly a different project/connection) while a
    // migration is already in flight — keep the SAME migration row (never a
    // duplicate), just point it at the current connection/project.
    await admin
      .from('shopify_billing_migrations')
      .update({ project_id: args.projectId, shopify_connection_id: args.shopifyConnectionId, updated_at: nowIso() })
      .eq('id', existing.id)
    return
  }

  await admin.from('shopify_billing_migrations').insert({
    user_id: args.userId,
    project_id: args.projectId,
    shopify_connection_id: args.shopifyConnectionId,
    paypal_subscription_id: paypalSubscriptionId,
    status: 'pending',
  })
}

export interface AdvanceMigrationResult {
  status: MigrationStatus
  cancelFailed: boolean
  // Blocker fix — true when PayPal cancellation succeeded but the DB write
  // recording 'completed' could not be confirmed after retries. The DB row
  // is left non-terminal ('pending'/'shopify_confirmed') in that case —
  // NEVER reported as 'completed' without confirming the write — so the
  // publish guard (which reads the row directly, not this return value)
  // keeps Shopify publishing locked, and a later retry (new intent + return,
  // or any other call to this function) safely re-attempts the same write;
  // re-cancelling an already-cancelled PayPal subscription is itself
  // idempotent (lib/paypal/client.ts treats 404/422 as success).
  dbWriteUnconfirmed?: boolean
}

/**
 * Called on every return from Shopify's hosted pricing page, AFTER the
 * Partner API has independently confirmed an active plan (the caller passes
 * that fact in — this function never re-verifies Shopify billing itself, it
 * only advances the migration once Shopify is already confirmed active).
 *
 * Idempotent and safe to call repeatedly: a 'completed' migration is left
 * alone; 'pending' advances to 'shopify_confirmed' then immediately attempts
 * the PayPal cancellation; 'shopify_confirmed' or 'paypal_cancel_failed'
 * simply retries the cancellation. NEVER cancels PayPal before this function
 * is called with Shopify already confirmed active by the caller.
 */
export async function confirmShopifyActiveAndAdvance(
  admin: Admin,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdvanceMigrationResult | null> {
  const migration = await getActiveMigration(admin, userId)
  if (!migration) return null // not a migrating account — nothing to do

  if (migration.status === 'pending') {
    await admin
      .from('shopify_billing_migrations')
      .update({ status: 'shopify_confirmed', updated_at: nowIso() })
      .eq('id', migration.id)
      .eq('status', 'pending') // only the expected prior state — never clobber a concurrent transition
  }

  if (!migration.paypal_subscription_id) {
    // Nothing to cancel (shouldn't happen — the row is only created with one
    // — but never silently mark 'completed' on an assumption).
    await admin
      .from('shopify_billing_migrations')
      .update({ status: 'paypal_cancel_failed', last_error: 'missing_paypal_subscription_id', updated_at: nowIso() })
      .eq('id', migration.id)
    return { status: 'paypal_cancel_failed', cancelFailed: true }
  }

  const cancel = await cancelPayPalSubscription(migration.paypal_subscription_id, 'Migrated to Shopify App Pricing', fetchImpl)
  if (cancel.ok) {
    // Blocker fix — PayPal cancellation is a completed, irreversible
    // real-world side effect at this point. The DB write recording
    // 'completed' must be CONFIRMED (not merely "no exception thrown") — a
    // silently-discarded write error here would leave the row non-terminal
    // while callers believed the migration was done. Retry a bounded number
    // of times (same pattern as lib/shopify/publish-article.ts's critical
    // shopify_article_id write); if it still can't be confirmed, report
    // the LAST CONFIRMED status (never 'completed') plus
    // dbWriteUnconfirmed:true, and log loudly for manual attention. The
    // publish guard reads this row directly — never this function's return
    // value — so publishing correctly stays locked either way, and a later
    // retry (new intent, or any other call) safely re-attempts the same
    // write (re-cancelling an already-cancelled PayPal subscription is
    // itself idempotent — see lib/paypal/client.ts).
    let confirmed = false
    for (let i = 0; i < 3 && !confirmed; i++) {
      const { data: updated, error } = await admin
        .from('shopify_billing_migrations')
        .update({ status: 'completed', last_error: null, updated_at: nowIso() })
        .eq('id', migration.id)
        .select('id')
        .maybeSingle()
      if (!error && updated) confirmed = true
    }
    if (!confirmed) {
      console.error('[shopify-migration] PayPal cancelled but the "completed" DB write could not be confirmed after retries', { migrationId: migration.id, userId })
      return { status: migration.status, cancelFailed: false, dbWriteUnconfirmed: true }
    }
    // Best-effort local mirror — PayPal's own BILLING.SUBSCRIPTION.CANCELLED
    // webhook will also arrive and apply the same update idempotently. Not
    // retried: a miss here just means the mirror catches up via that webhook.
    await admin
      .from('subscriptions')
      .update({ status: 'cancelled', updated_at: nowIso() })
      .eq('paypal_subscription_id', migration.paypal_subscription_id)
      .eq('status', 'active')
    return { status: 'completed', cancelFailed: false }
  }

  await admin
    .from('shopify_billing_migrations')
    .update({
      status: 'paypal_cancel_failed',
      paypal_cancel_attempts: migration.paypal_cancel_attempts + 1,
      last_error: cancel.reason,
      updated_at: nowIso(),
    })
    .eq('id', migration.id)
  return { status: 'paypal_cancel_failed', cancelFailed: true }
}
