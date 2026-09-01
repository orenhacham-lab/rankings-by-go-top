/**
 * Completing a TRUSTED direct Shopify App Store link — atomically.
 *
 * WHY THIS EXISTS. Finishing an App Store install used to be a sequence of
 * independent writes issued from the route: claim the connection, then write
 * billing governance, then create a PayPal migration if needed, then consume
 * the one-time pending install. Each could fail on its own and the route
 * ignored the results, so a direct App Store installation could end up
 * connected as a website-billed account — an App Store billing bypass — or a
 * pending install could be consumed with no governance written at all, or the
 * route could report success for state it never saved.
 *
 * All of it now happens inside ONE database function
 * (complete_shopify_app_store_link, 20260901020000): consume the one-time
 * token, claim the connection, apply the install provenance, create or defer
 * the PayPal migration, set billing authority. Everything commits or nothing
 * does, and this module refuses to report success unless the function says so.
 *
 * NO EXTERNAL CALL HAPPENS IN THE DATABASE. Shopify was contacted by the
 * install route before the pending install was ever written; this only
 * persists the already-verified result.
 *
 * PROVENANCE. The decision to move billing authority comes from the pending
 * install's own `install_origin`, stamped server-side by the route that created
 * it after verifying an App Bridge session token or a signed pre-auth OAuth
 * callback. It is never read from a request body, query parameter or header.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { BillingAuthority } from '@/lib/billing/governance'

type Admin = ReturnType<typeof createAdminClient>

export type AppStoreLinkResult =
  | {
      ok: true
      connectionId: string
      /** Null when the pending install was NOT App Store provenance — billing untouched. */
      billingAuthority: BillingAuthority | null
      migrationCreated: boolean
    }
  | {
      ok: false
      /**
       * Stable, non-sensitive reasons:
       *   pending_invalid          the one-time row was missing, expired or
       *                            already consumed;
       *   shop_already_connected   another project holds this live shop;
       *   shop_not_reclaimable     it holds it in a state that is not the
       *                            uninstall tombstone;
       *   save_failed              the transaction did not commit. NOTHING was
       *                            written — never reported as success.
       */
      reason: 'pending_invalid' | 'shop_already_connected' | 'shop_not_reclaimable' | 'save_failed'
      detail?: string
    }

/** Blocking outcomes the ownership claim can raise, mapped to caller reasons. */
const BLOCKED: Record<string, 'shop_already_connected' | 'shop_not_reclaimable'> = {
  shop_already_connected: 'shop_already_connected',
  blocked_not_eligible: 'shop_not_reclaimable',
}

export async function completeShopifyAppStoreLink(admin: Admin, args: {
  /** The one-time pending-install token, read from the signed httpOnly cookie. */
  pendingToken: string
  /** The AUTHENTICATED user. Never a value from the request body. */
  userId: string
  /** A project already verified to belong to that user. */
  projectId: string
  connectionStatus: 'connected' | 'failed'
  lastError: string | null
}): Promise<AppStoreLinkResult> {
  const { data, error } = await admin.rpc('complete_shopify_app_store_link', {
    p_pending_token: args.pendingToken,
    p_user_id: args.userId,
    p_project_id: args.projectId,
    p_connection_status: args.connectionStatus,
    p_last_error: args.lastError,
  })

  if (error) {
    // The function raises with `shopify_link_blocked:<outcome>` when the
    // ownership claim refuses, which rolls the whole transaction back — the
    // one-time token is NOT consumed and nothing was written.
    const message = error.message || ''
    const blocked = message.match(/shopify_link_blocked:([a-z_]+)/)
    if (blocked && BLOCKED[blocked[1]]) return { ok: false, reason: BLOCKED[blocked[1]] }
    console.error('[shopify-app-store-link] atomic link failed', {
      reason: (error.code || 'rpc_failed'),
    })
    return { ok: false, reason: 'save_failed', detail: (error.code || 'rpc_failed').slice(0, 80) }
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { outcome?: string; connection_id?: string | null; billing_authority?: string | null; migration_created?: boolean }
    | null
    | undefined

  if (!row?.outcome) return { ok: false, reason: 'save_failed', detail: 'no_outcome' }
  if (row.outcome === 'pending_invalid') return { ok: false, reason: 'pending_invalid' }
  if (row.outcome !== 'linked' || !row.connection_id) {
    const blocked = BLOCKED[row.outcome]
    return blocked ? { ok: false, reason: blocked } : { ok: false, reason: 'save_failed', detail: row.outcome.slice(0, 80) }
  }

  return {
    ok: true,
    connectionId: row.connection_id,
    billingAuthority: row.billing_authority === 'shopify' || row.billing_authority === 'website'
      ? row.billing_authority
      : null,
    migrationCreated: row.migration_created === true,
  }
}
