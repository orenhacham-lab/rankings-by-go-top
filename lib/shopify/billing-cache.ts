/**
 * Phase 2 — the single writer of the shopify_connections billing CACHE/AUDIT
 * columns (shopify_plan_handle, shopify_subscription_status, etc.). Shared by
 * lib/shopify/billing-guard.ts (writes back after the live publish-gate
 * check) and app/api/shopify/billing/return/route.ts (writes back after the
 * live re-check on return from Shopify's hosted pricing page) so both call
 * sites agree on exactly what gets stored and how. This is display/audit
 * data ONLY — never read back as a source of truth for a billing-sensitive
 * decision (see billing-guard.ts's own header comment).
 */

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export interface BillingCacheFields {
  shopify_plan_handle: string | null
  shopify_subscription_status: 'active' | 'none' | 'unknown'
  shopify_trial_ends_at: string | null
  shopify_current_period_end: string | null
  shopify_billing_last_error: string | null
}

/** Best-effort write-back. A failure here must never change an already-decided outcome. */
export async function recordShopifyBillingCache(admin: Admin, connectionId: string, fields: BillingCacheFields): Promise<void> {
  try {
    await admin
      .from('shopify_connections')
      .update({ ...fields, shopify_billing_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', connectionId)
  } catch {
    // Cache write failure must never change the already-decided outcome.
  }
}
