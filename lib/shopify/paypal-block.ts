/**
 * Phase 2 — server-side defense-in-depth companion to the client-side PayPal
 * UI hiding (app/(dashboard)/billing/BillingView.tsx). A merchant with an
 * actively CONNECTED Shopify store must use Shopify App Pricing exclusively:
 * no PayPal checkout/upgrade/downgrade/renewal creation. This check is what
 * every PayPal checkout/upgrade API route calls before writing any
 * entitlement, independent of whatever the client sent or whether the UI was
 * actually hidden in this request's browser.
 *
 * A connection that was later uninstalled (connection_status !== 'connected')
 * does NOT block PayPal — that merchant has reverted to the non-Shopify
 * population and may use PayPal normally.
 */

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export async function hasActiveShopifyConnection(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('shopify_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('connection_status', 'connected')
    .limit(1)
    .maybeSingle()
  return !!data
}
