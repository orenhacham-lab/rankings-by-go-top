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
 * and (owner decision, 9 Oct 2026) any shopify_connections row for the account
 * or its projects whose app is still INSTALLED, whatever its status — an
 * uninstalled store (isUninstalledShopifyConnection) bills nothing through
 * Shopify, so it no longer blocks PayPal. Administrators are exempt from the
 * connection rule only. The pending-install/link window (before any user/project exists —
 * see lib/shopify/pending-link.ts) is a SEPARATE, cookie-scoped check
 * (hasPendingShopifyLinkCookie) performed directly by callers that have the
 * request, since there is no user_id to key it by yet.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getActiveMigrationResult } from './paypal-migration'
import { resolveBillingAuthority } from '@/lib/billing/governance'
import { isAdminUser } from '@/lib/auth/admin-role'

type Admin = ReturnType<typeof createAdminClient>

/** The connection columns the uninstall decision reads. */
export interface ConnectionUninstallFacts {
  connection_status: string | null
  last_error: string | null
  granted_scopes: string[] | null
  shopify_subscription_status: string | null
  archived_at: string | null
  archived_reason: string | null
}

/**
 * PURE. Has the app been UNINSTALLED from this store? Uninstalling ends every
 * Shopify app charge for it, so such a store can no longer cause double
 * billing. True for exactly two states, both written only by the uninstall
 * path:
 *   * the uninstall TOMBSTONE that lib/shopify/shop-cleanup.ts
 *     applyAppUninstalled writes — connection_status 'failed', last_error
 *     'app_uninstalled', no granted scopes, no active Shopify subscription.
 *     This is the SAME predicate the database uses to decide a store is
 *     reclaimable (claim_shopify_connection, 20260901010000), and nothing on
 *     a failure path overwrites the marker (lib/shopify/connection-health.ts
 *     nextConnectionLastError);
 *   * a row ARCHIVED as 'superseded_after_uninstall' — only a tombstone can be
 *     archived.
 * Anything else — connected, failed for another reason, a marker overwritten
 * by older code — counts as INSTALLED, so doubt keeps PayPal blocked.
 */
export function isUninstalledShopifyConnection(row: ConnectionUninstallFacts): boolean {
  if (row.archived_at) return row.archived_reason === 'superseded_after_uninstall'
  return row.connection_status === 'failed'
    && row.last_error === 'app_uninstalled'
    && (row.granted_scopes ?? []).length === 0
    && row.shopify_subscription_status !== 'active'
}

const UNINSTALL_FACTS = 'id, connection_status, last_error, granted_scopes, shopify_subscription_status, archived_at, archived_reason'

/**
 * Does this account have a Shopify store with the app still INSTALLED — a
 * shopify_connections row on the account itself or on any of its projects
 * that is not uninstalled (isUninstalledShopifyConnection)? (Owner decision,
 * 9 Oct 2026: a store connected to Shopify is billed through Shopify, so the
 * account can never also start a PayPal subscription; once the app is
 * uninstalled Shopify bills nothing, so PayPal is available again.) A failed
 * read is reported as such; the PayPal gate treats it as "connected" (fail
 * closed).
 */
export async function hasLiveShopifyConnectionResult(
  admin: Admin,
  userId: string,
): Promise<{ ok: true; connected: boolean } | { ok: false; reason: string }> {
  try {
    const live = (rows: unknown) => ((rows as ConnectionUninstallFacts[] | null) ?? []).some((r) => !isUninstalledShopifyConnection(r))
    const byUser = await admin.from('shopify_connections').select(UNINSTALL_FACTS).eq('user_id', userId)
    if (byUser.error) return { ok: false, reason: 'connection_query_failed' }
    if (live(byUser.data)) return { ok: true, connected: true }

    const projects = await admin.from('projects').select('id').eq('user_id', userId)
    if (projects.error) return { ok: false, reason: 'project_query_failed' }
    const ids = ((projects.data as { id: string }[] | null) ?? []).map((p) => p.id)
    if (ids.length === 0) return { ok: true, connected: false }
    const byProject = await admin.from('shopify_connections').select(UNINSTALL_FACTS).in('project_id', ids)
    if (byProject.error) return { ok: false, reason: 'connection_query_failed' }
    return { ok: true, connected: live(byProject.data) }
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
 *   * (owner decision, 9 Oct 2026) the account has a Shopify store with the
 *     app still INSTALLED (hasLiveShopifyConnectionResult), of any connection
 *     status, on the account or any of its projects. An uninstalled store no
 *     longer counts: Shopify stops billing at uninstall. (Shopify AUTHORITY,
 *     above, is not lifted by an uninstall: entitlement for such an account
 *     still reads Shopify, so a PayPal payment would buy nothing.) This
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
  const store = await hasLiveShopifyConnectionResult(admin, userId)
  if (!store.ok) return true
  return store.connected
}
