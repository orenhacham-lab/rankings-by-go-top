/**
 * Phase 2 — server-side defense-in-depth companion to the client-side PayPal
 * UI hiding (app/(dashboard)/billing/BillingView.tsx). This is the
 * PayPal-checkout side of the billing-provider state machine (blocker fix):
 * PayPal checkout/upgrade/downgrade/renewal creation must be blocked not
 * only once a Shopify store is fully `connected`, but from the moment
 * Shopify installation/linking intent exists through an unresolved
 * PayPal→Shopify migration — never only at the final "connected" state.
 *
 * `isShopifyBillingRequiredForUser` — the authoritative per-user check —
 * covers:
 *   - an actively CONNECTED Shopify store (connection_status='connected');
 *   - an unresolved PayPal→Shopify migration, REGARDLESS of the connection's
 *     current connection_status (covers a connection stuck at
 *     'failed'/'untested' — e.g. a partial-scope grant — that still has an
 *     unresolved migration; the migration itself is the more authoritative
 *     signal there).
 * The pending-install/link window (before any user/project exists — see
 * lib/shopify/pending-link.ts) is a SEPARATE, cookie-scoped check
 * (hasPendingShopifyLinkCookie) performed directly by callers that have the
 * request, since there is no user_id to key it by yet.
 *
 * A merchant who fully uninstalls (connection reverts off 'connected') AND
 * has no unresolved migration reverts to the normal PayPal population — this
 * is intentional, not a gap: Blocker 3 requires confirming reversion via
 * authoritative uninstall state (the connection row), never a browser action.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getActiveMigrationResult } from './paypal-migration'

type Admin = ReturnType<typeof createAdminClient>

/** Narrow check: is there a CONNECTED Shopify store for this user right now. */
export async function hasActiveShopifyConnection(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('shopify_connections')
    .select('id')
    .eq('user_id', userId)
        .eq('connection_status', 'connected')
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()
  return !!data
}

/**
 * The full per-user check every PayPal checkout/upgrade route must call.
 * True = block PayPal for this user.
 */
export async function isShopifyBillingRequiredForUser(admin: Admin, userId: string): Promise<boolean> {
  if (await hasActiveShopifyConnection(admin, userId)) return true
  // FAIL CLOSED: an unreadable migration state blocks PayPal rather than
  // letting a database error open a second billing channel for an account that
  // may already be mid-migration to Shopify.
  const migration = await getActiveMigrationResult(admin, userId)
  if (!migration.ok) return true
  return !!migration.migration
}
