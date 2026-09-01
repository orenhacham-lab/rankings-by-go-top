/**
 * Billing governance — the durable answer to "who bills this account".
 *
 * Replaces the inference the application used before: "this account has a
 * connected Shopify store, therefore Shopify bills it". A
 * `shopify_connections` row is an INTEGRATION record. A website customer who
 * connects Shopify purely as a publishing destination gets one too, and under
 * the old rule that act alone moved them onto Shopify billing and — with no
 * Shopify App Pricing subscription — dropped them to the zero-entitlement
 * `shopify_billing_required` state. This product is website-first.
 *
 * The record lives in `public.billing_governance`, one row per account, with
 * RLS enabled and no policies: only server-side service-role code can read or
 * write it. Every function here is service-role only and is never reachable
 * from a browser.
 *
 * TRUSTED TRANSITIONS — the complete set. Nothing else may change authority:
 *   * a verified DIRECT Shopify App Store install, once linked to an account
 *     and only when that account is not mid-PayPal-migration
 *     (`markShopifyAppStoreInstall`);
 *   * a COMPLETED PayPal→Shopify migration, the repository's own explicit
 *     success condition (`markMigrationCompleted`).
 *
 * Deliberately NOT transitions: creating, disconnecting, revoking, refreshing
 * or failing a Shopify connection; an uninstall webhook; a token refresh
 * failure; anything a request body or query parameter says.
 */

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/** How the ACCOUNT came into existence. Provenance — set once, never rewritten. */
export type SignupOrigin = 'website' | 'shopify_app_store'
/** Who bills the account right now. */
export type BillingAuthority = 'website' | 'shopify'

export interface BillingGovernance {
  userId: string
  signupOrigin: SignupOrigin
  billingAuthority: BillingAuthority
  authorityReason: string | null
}

/** Stable, non-sensitive codes recorded on an authority change. */
export const AUTHORITY_REASONS = {
  shopifyAppStoreInstall: 'shopify_app_store_install',
  paypalMigrationCompleted: 'paypal_migration_completed',
  websiteDefault: 'website_default',
} as const

const TABLE = 'billing_governance'

/**
 * The account's governance record.
 *
 * A missing row means WEBSITE authority. That is the safe default and the
 * correct one for this product: every account predating this table registered
 * on the website, and an account can only become Shopify-governed by passing
 * through a trusted transition that writes the row.
 */
export async function getBillingGovernance(admin: Admin, userId: string): Promise<BillingGovernance> {
  const fallback: BillingGovernance = {
    userId, signupOrigin: 'website', billingAuthority: 'website', authorityReason: null,
  }
  if (!userId) return fallback
  const { data, error } = await admin
    .from(TABLE)
    .select('user_id, signup_origin, billing_authority, authority_reason')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return fallback
  const row = data as { signup_origin?: string; billing_authority?: string; authority_reason?: string | null }
  return {
    userId,
    signupOrigin: row.signup_origin === 'shopify_app_store' ? 'shopify_app_store' : 'website',
    // Anything unrecognised reads as website — the safe direction.
    billingAuthority: row.billing_authority === 'shopify' ? 'shopify' : 'website',
    authorityReason: row.authority_reason ?? null,
  }
}

/** True when Shopify App Pricing is the billing authority for this account. */
export async function isShopifyBillingAuthority(admin: Admin, userId: string): Promise<boolean> {
  return (await getBillingGovernance(admin, userId)).billingAuthority === 'shopify'
}

/**
 * Record a verified DIRECT Shopify App Store install against an account.
 *
 * Called ONLY from app/api/shopify/link/complete after a pending install whose
 * provenance was stamped server-side (`install_origin = 'shopify_app_store'`)
 * by a route that had already verified an App Bridge session token or a signed
 * pre-auth OAuth callback. The provenance never comes from the request body.
 *
 * `deferForPayPalMigration` is passed by the caller when the account still has
 * an active PayPal subscription. In that case the authority is deliberately
 * LEFT on website: the account must go through the repository's explicit
 * PayPal→Shopify migration workflow (lib/shopify/paypal-migration.ts) rather
 * than being switched by the act of installing. The signup_origin provenance is
 * still recorded, so the install is not forgotten.
 */
export async function markShopifyAppStoreInstall(
  admin: Admin,
  userId: string,
  opts?: { deferForPayPalMigration?: boolean },
): Promise<BillingGovernance> {
  const defer = opts?.deferForPayPalMigration === true
  const current = await getBillingGovernance(admin, userId)
  const nextAuthority: BillingAuthority = defer ? current.billingAuthority : 'shopify'
  const now = new Date().toISOString()

  // Built conditionally rather than passing `undefined`: an omitted key leaves
  // the stored column untouched, which is what a deferred switch must do.
  const payload: Record<string, unknown> = {
    user_id: userId,
    // Provenance: a verified direct App Store install is recorded even when the
    // authority switch is deferred for an existing PayPal subscriber.
    signup_origin: 'shopify_app_store',
    billing_authority: nextAuthority,
    authority_reason: defer ? current.authorityReason : AUTHORITY_REASONS.shopifyAppStoreInstall,
    updated_at: now,
  }
  if (!defer && nextAuthority !== current.billingAuthority) payload.authority_changed_at = now
  await admin.from(TABLE).upsert(payload, { onConflict: 'user_id' })

  return { userId, signupOrigin: 'shopify_app_store', billingAuthority: nextAuthority, authorityReason: defer ? current.authorityReason : AUTHORITY_REASONS.shopifyAppStoreInstall }
}

/**
 * Move authority to Shopify because the explicit PayPal→Shopify migration
 * COMPLETED. Called only from lib/shopify/paypal-migration.ts, on the single
 * confirmed 'completed' transition — never on 'pending', 'shopify_confirmed'
 * or 'paypal_cancel_failed'.
 */
export async function markMigrationCompleted(admin: Admin, userId: string): Promise<void> {
  const now = new Date().toISOString()
  const current = await getBillingGovernance(admin, userId)
  await admin.from(TABLE).upsert({
    user_id: userId,
    // A migrating account registered on the website; that provenance is a fact
    // about how the account began and is preserved.
    signup_origin: current.signupOrigin,
    billing_authority: 'shopify',
    authority_reason: AUTHORITY_REASONS.paypalMigrationCompleted,
    authority_changed_at: now,
    updated_at: now,
  }, { onConflict: 'user_id' })
}

/**
 * Record that an account was created through the website. Idempotent and
 * non-destructive: it never downgrades an account that is already
 * Shopify-governed, so calling it on an existing account is a no-op.
 */
export async function ensureWebsiteGovernance(admin: Admin, userId: string): Promise<void> {
  const current = await getBillingGovernance(admin, userId)
  if (current.billingAuthority === 'shopify' || current.signupOrigin === 'shopify_app_store') return
  const now = new Date().toISOString()
  await admin.from(TABLE).upsert({
    user_id: userId,
    signup_origin: 'website',
    billing_authority: 'website',
    authority_reason: AUTHORITY_REASONS.websiteDefault,
    updated_at: now,
  }, { onConflict: 'user_id' })
}
