/**
 * Finish a PayPal→Shopify billing migration when the embedded app LOADS and
 * finds the Shopify plan already active.
 *
 * WHY. The migration (lib/shopify/paypal-migration.ts) used to advance only on
 * the intent-authorized billing return (lib/shopify/billing-return-processing.ts).
 * That return rarely carries its intent in production: Shopify renders it in the
 * Admin iframe, where our SameSite=Lax intent cookie is not sent, so the
 * cookie-less recovery runs instead — and that path deliberately never advances
 * a migration. A merchant who subscribes from Shopify's own pricing page never
 * reaches our return at all. Either way PayPal kept charging and the account
 * stayed billed by the website. There is no app_subscriptions/update webhook
 * subscribed (that would be an app-config change), so the next place we can
 * observe the plan is the app home's own live check.
 *
 * WHAT MUST BE TRUE before PayPal is ever contacted from here — every one of
 * these fails closed, in this order:
 *   1. the account is not an administrator (admin first, as in billing-guard);
 *   2. a non-terminal migration row exists for this user;
 *   3. Shopify's Partner API already reported an active, recognised plan for
 *      THIS shop (the caller's live check — the same one the return path uses);
 *   4. the migration belongs to THIS store's connection, not another one;
 *   5. no other request touched the migration in the last LEASE window, and
 *      this request wins a compare-and-swap claim on it (no concurrent cancel);
 *   6. the Admin API, asked independently with the store's own token, lists an
 *      app subscription whose status is ACTIVE.
 * Only then is confirmShopifyActiveAndAdvance called — the SAME state machine
 * the return path uses, so the PayPal cancellation and the atomic completion
 * (complete_shopify_paypal_migration) are shared, idempotent code. A
 * 'completed' migration is terminal and never re-read, so repeated app loads
 * do nothing.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { confirmShopifyActiveAndAdvance, type MigrationRow, type MigrationStatus } from './paypal-migration'
import { loadShopifyConnection } from './api-auth'
import { getActiveAppSubscriptionStatuses } from './client'

type Admin = ReturnType<typeof createAdminClient>

/** A migration touched this recently is treated as in flight elsewhere. */
export const APP_LOAD_MIGRATION_LEASE_MS = 60_000

export type AppLoadMigrationOutcome =
  | 'admin_skipped'
  | 'no_migration'
  | 'plan_not_active'
  | 'other_connection'
  | 'in_flight_elsewhere'
  | 'admin_api_not_active'
  | 'completed'
  /** Still inside the paid PayPal period: nothing moved, PayPal not contacted. */
  | 'deferred_paid_period'
  | 'incomplete'

export interface AppLoadMigrationResult {
  outcome: AppLoadMigrationOutcome
  /** The migration's status after this call, for the response. null = none. */
  migrationStatus: MigrationStatus | null
}

/** Only an answered query listing an ACTIVE app subscription confirms. */
export function isActiveConfirmation(res: Awaited<ReturnType<typeof getActiveAppSubscriptionStatuses>>): boolean {
  return res.ok && res.statuses.includes('ACTIVE')
}

/** Independent Admin API confirmation, with the store's own resolved token. */
export async function adminApiConfirmsActiveSubscription(admin: Admin, projectId: string): Promise<boolean> {
  const loaded = await loadShopifyConnection(admin, projectId)
  if ('error' in loaded) return false
  return isActiveConfirmation(await getActiveAppSubscriptionStatuses(loaded.creds))
}

export async function advancePayPalMigrationOnAppLoad(
  admin: Admin,
  args: {
    isAdmin: boolean
    userId: string
    connectionId: string
    projectId: string
    migration: MigrationRow | null
    /** True only when the caller's LIVE Partner API check returned an active, recognised plan. */
    shopifyPlanActive: boolean
  },
  deps: {
    fetchImpl?: typeof fetch
    confirmAdminApiActive?: (admin: Admin, projectId: string) => Promise<boolean>
    now?: () => number
  } = {},
): Promise<AppLoadMigrationResult> {
  const { migration } = args
  const current = migration?.status ?? null
  if (args.isAdmin) return { outcome: 'admin_skipped', migrationStatus: current }
  if (!migration || migration.status === 'completed') return { outcome: 'no_migration', migrationStatus: current }
  if (!args.shopifyPlanActive) return { outcome: 'plan_not_active', migrationStatus: current }
  if (migration.shopify_connection_id !== args.connectionId) return { outcome: 'other_connection', migrationStatus: current }

  const now = deps.now ?? Date.now
  const observedUpdatedAt = (migration as MigrationRow & { updated_at?: string | null }).updated_at ?? null
  if (observedUpdatedAt) {
    const touched = Date.parse(observedUpdatedAt)
    if (Number.isFinite(touched) && now() - touched < APP_LOAD_MIGRATION_LEASE_MS) {
      return { outcome: 'in_flight_elsewhere', migrationStatus: current }
    }
  }

  // Compare-and-swap claim: only the request that still sees the exact row it
  // read (same status, same updated_at) moves on. A concurrent app load that
  // read the same row loses here; one that reads after this write sees a fresh
  // updated_at and stops at the lease check above.
  let claim = admin
    .from('shopify_billing_migrations')
    .update({ updated_at: new Date(now()).toISOString() })
    .eq('id', migration.id)
    .eq('user_id', args.userId)
    .eq('status', migration.status)
  claim = observedUpdatedAt ? claim.eq('updated_at', observedUpdatedAt) : claim.is('updated_at', null)
  const { data: claimed, error: claimError } = await claim.select('id')
  if (claimError || !Array.isArray(claimed) || claimed.length !== 1) {
    return { outcome: 'in_flight_elsewhere', migrationStatus: current }
  }

  const confirm = deps.confirmAdminApiActive ?? adminApiConfirmsActiveSubscription
  let adminApiActive = false
  try { adminApiActive = await confirm(admin, args.projectId) } catch { adminApiActive = false }
  if (!adminApiActive) return { outcome: 'admin_api_not_active', migrationStatus: current }

  const advanced = await confirmShopifyActiveAndAdvance(admin, args.userId, deps.fetchImpl ?? fetch)
  if (!advanced) return { outcome: 'no_migration', migrationStatus: null }
  if (advanced.deferred) return { outcome: 'deferred_paid_period', migrationStatus: advanced.status }
  if (advanced.status === 'completed' && !advanced.cancelFailed && !advanced.dbWriteUnconfirmed) {
    return { outcome: 'completed', migrationStatus: 'completed' }
  }
  console.warn('[shopify-app-load] plan confirmed but the migration did not complete', {
    status: advanced.status,
    cancelFailed: advanced.cancelFailed === true,
    dbWriteUnconfirmed: advanced.dbWriteUnconfirmed === true,
  })
  return { outcome: 'incomplete', migrationStatus: advanced.status }
}
