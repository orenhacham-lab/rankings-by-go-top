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
import { resolveBillingAuthority } from '@/lib/billing/governance'

type Admin = ReturnType<typeof createAdminClient>

/**
 * The full per-user check every PayPal checkout/upgrade route must call.
 * True = block PayPal for this user.
 *
 * A CONNECTED SHOPIFY STORE IS NOT ONE OF THE REASONS. It used to be — the
 * function opened with `hasActiveShopifyConnection()` — and that is the
 * cross-layer bug this fixes: almost every customer registers on the website,
 * and a website customer may connect Shopify purely as a publishing
 * destination. Blocking their PayPal controls because a publishing integration
 * exists took away the only billing provider they actually have.
 *
 * PayPal is blocked for exactly two reasons, both about who BILLS the account:
 *   * Shopify is the durable billing authority (a verified direct App Store
 *     install, or a completed migration);
 *   * an explicit PayPal→Shopify migration is in flight, during which the old
 *     PayPal subscription must not be changed.
 *
 * Fails CLOSED on an unreadable governance record or migration state: a
 * database error must not open a second billing channel for an account that
 * may already be Shopify-governed.
 */
export async function isShopifyBillingRequiredForUser(admin: Admin, userId: string): Promise<boolean> {
  const authority = await resolveBillingAuthority(admin, userId)
  if (!authority.ok) return true
  if (authority.authority === 'shopify') return true

  const migration = await getActiveMigrationResult(admin, userId)
  if (!migration.ok) return true
  return !!migration.migration
}
