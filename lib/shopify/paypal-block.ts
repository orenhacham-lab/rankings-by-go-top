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
 * covers Shopify billing authority, an unresolved PayPal→Shopify migration,
 * and (owner decision, 9 Oct 2026) ANY shopify_connections row for the account
 * or its projects, whatever its status — so an uninstall no longer returns the
 * account to PayPal checkout. Administrators are exempt from the connection
 * rule only. The pending-install/link window (before any user/project exists —
 * see lib/shopify/pending-link.ts) is a SEPARATE, cookie-scoped check
 * (hasPendingShopifyLinkCookie) performed directly by callers that have the
 * request, since there is no user_id to key it by yet.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getActiveMigrationResult } from './paypal-migration'
import { resolveBillingAuthority } from '@/lib/billing/governance'
import { isAdminUser } from '@/lib/auth/admin-role'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Does this account have ANY Shopify store connected — a shopify_connections
 * row of ANY status (connected, failed, an uninstall tombstone, archived) on
 * the account itself or on any of its projects? (Owner decision, 9 Oct 2026:
 * an account with a store connected to Shopify is billed through Shopify, so it
 * can never also start a PayPal subscription.) A failed read is reported as
 * such; the PayPal gate treats it as "connected" (fail closed).
 */
export async function hasAnyShopifyConnectionResult(
  admin: Admin,
  userId: string,
): Promise<{ ok: true; connected: boolean } | { ok: false; reason: string }> {
  try {
    const byUser = await admin.from('shopify_connections').select('id').eq('user_id', userId).limit(1)
    if (byUser.error) return { ok: false, reason: 'connection_query_failed' }
    if (((byUser.data as unknown[] | null) ?? []).length > 0) return { ok: true, connected: true }

    const projects = await admin.from('projects').select('id').eq('user_id', userId)
    if (projects.error) return { ok: false, reason: 'project_query_failed' }
    const ids = ((projects.data as { id: string }[] | null) ?? []).map((p) => p.id)
    if (ids.length === 0) return { ok: true, connected: false }
    const byProject = await admin.from('shopify_connections').select('id').in('project_id', ids).limit(1)
    if (byProject.error) return { ok: false, reason: 'connection_query_failed' }
    return { ok: true, connected: ((byProject.data as unknown[] | null) ?? []).length > 0 }
  } catch {
    return { ok: false, reason: 'connection_query_threw' }
  }
}

/**
 * The full per-user check every PayPal checkout/upgrade route must call.
 * True = block PayPal for this user.
 *
 * PayPal is blocked when:
 *   * Shopify is the durable billing authority (a verified direct App Store
 *     install, or a completed migration);
 *   * an explicit PayPal→Shopify migration is in flight, during which the old
 *     PayPal subscription must not be changed;
 *   * (owner decision, 9 Oct 2026) the account has ANY Shopify store
 *     connected, of any status, on the account or any of its projects. This
 *     reverses the earlier "a connection is only a publishing destination"
 *     rule: a store connected to Shopify is billed through Shopify, so a second
 *     (PayPal) subscription for the same account can never start. An account
 *     ALREADY paying PayPal keeps that subscription; it simply cannot start or
 *     change one. ADMINISTRATORS are exempt from this third rule only, exactly
 *     as before (isAdminUser, profiles.role, fails closed to "not admin").
 *
 * Fails CLOSED on an unreadable governance record, migration state or
 * connection lookup: a database error must not open a second billing channel.
 */
export async function isShopifyBillingRequiredForUser(admin: Admin, userId: string): Promise<boolean> {
  const authority = await resolveBillingAuthority(admin, userId)
  if (!authority.ok) return true
  if (authority.authority === 'shopify') return true

  const migration = await getActiveMigrationResult(admin, userId)
  if (!migration.ok) return true
  if (migration.migration) return true

  if (await isAdminUser(admin, userId)) return false
  const store = await hasAnyShopifyConnectionResult(admin, userId)
  if (!store.ok) return true
  return store.connected
}
