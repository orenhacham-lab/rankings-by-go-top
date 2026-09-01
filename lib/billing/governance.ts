/**
 * Billing governance — the durable answer to "who bills this account".
 *
 * Replaces the inference the application used before: "this account has a
 * connected Shopify store, therefore Shopify bills it". A `shopify_connections`
 * row is an INTEGRATION record. A website customer who connects Shopify purely
 * as a publishing destination gets one too, and under the old rule that act
 * alone moved them onto Shopify billing and — with no Shopify App Pricing
 * subscription — dropped them to a zero-entitlement state. This product is
 * website-first.
 *
 * The record lives in `public.billing_governance`, one row per account, with RLS
 * enabled and no policies: only server-side service-role code can read or write
 * it. Nothing here is reachable from a browser.
 *
 * READS FAIL CLOSED. A missing row and a failed query are NOT the same fact and
 * are never collapsed into one answer. A confirmed-missing row means the
 * documented website default; a query error or a malformed record means the
 * caller must not decide entitlement at all. A database outage must never let a
 * Shopify-governed account fall through to a website trial, and must never tell
 * anyone to buy a plan.
 *
 * PROVENANCE IS IMMUTABLE. `signup_origin` records how the ACCOUNT began and is
 * never rewritten — an existing website account that later installs from the
 * App Store is still website-origin. The install is recorded by
 * `billing_authority` + `authority_reason`, which is a different fact. When the
 * server cannot prove how an account began, it stores 'unknown' rather than
 * guessing.
 *
 * TRUSTED TRANSITIONS — the complete set, and both are ATOMIC database
 * functions, not sequences of writes from a route:
 *   * complete_shopify_app_store_link  — a verified direct App Store install
 *     being linked to an account (lib/shopify/app-store-link.ts);
 *   * complete_shopify_paypal_migration — a CONFIRMED completed PayPal→Shopify
 *     migration (lib/shopify/paypal-migration.ts).
 *
 * Deliberately NOT transitions: creating, disconnecting, revoking, refreshing or
 * failing a Shopify connection; an uninstall webhook; a token refresh failure;
 * anything a request body, query parameter or header says.
 */

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/** How the ACCOUNT came into existence. Provenance — set once, never rewritten. */
export type SignupOrigin = 'website' | 'shopify_app_store' | 'unknown'
/** Who bills the account right now. */
export type BillingAuthority = 'website' | 'shopify'

export interface BillingGovernance {
  userId: string
  signupOrigin: SignupOrigin
  billingAuthority: BillingAuthority
  authorityReason: string | null
}

/**
 * The four genuinely different outcomes of reading a governance record. Keeping
 * them distinct is the whole point: three of them used to be collapsed into
 * "website", which is exactly how a database failure could have handed a
 * Shopify-governed merchant a free website trial.
 */
export type GovernanceLookup =
  /** The row was read and is well-formed. */
  | { status: 'loaded'; governance: BillingGovernance }
  /** The query SUCCEEDED and there is genuinely no row — website default applies. */
  | { status: 'missing' }
  /** The query failed. Nothing is known; the caller must fail closed. */
  | { status: 'unavailable'; reason: string }
  /** A row exists but carries a value this code does not recognise. Fail closed. */
  | { status: 'invalid'; reason: string }

const TABLE = 'billing_governance'

/** Stable, non-sensitive codes recorded on an authority change. */
export const AUTHORITY_REASONS = {
  shopifyAppStoreInstall: 'shopify_app_store_install',
  shopifyAppStoreInstallDeferred: 'shopify_app_store_install_deferred_paypal_migration',
  paypalMigrationCompleted: 'paypal_migration_completed',
} as const

const SIGNUP_ORIGINS: readonly string[] = ['website', 'shopify_app_store', 'unknown']
const BILLING_AUTHORITIES: readonly string[] = ['website', 'shopify']

/**
 * Read the account's governance record, reporting WHICH of the four outcomes
 * occurred. Never throws.
 */
export async function loadBillingGovernance(admin: Admin, userId: string): Promise<GovernanceLookup> {
  if (!userId) return { status: 'invalid', reason: 'missing_user_id' }
  let data: unknown
  let error: { message?: string; code?: string } | null = null
  try {
    const res = await admin
      .from(TABLE)
      .select('user_id, signup_origin, billing_authority, authority_reason')
      .eq('user_id', userId)
      .maybeSingle()
    data = res.data
    error = res.error ?? null
  } catch (err) {
    // A thrown client error (network, misconfiguration, missing table) is an
    // outage, not an absent row.
    return { status: 'unavailable', reason: err instanceof Error ? err.message.slice(0, 120) : 'governance_query_threw' }
  }
  if (error) return { status: 'unavailable', reason: (error.code || error.message || 'governance_query_failed').slice(0, 120) }
  if (!data) return { status: 'missing' }

  const row = data as { signup_origin?: unknown; billing_authority?: unknown; authority_reason?: unknown }
  const origin = typeof row.signup_origin === 'string' ? row.signup_origin : ''
  const authority = typeof row.billing_authority === 'string' ? row.billing_authority : ''
  // An unrecognised value is NOT quietly read as website: this code and the
  // database disagree about the schema, and guessing either way could be wrong.
  if (!SIGNUP_ORIGINS.includes(origin)) return { status: 'invalid', reason: 'unrecognised_signup_origin' }
  if (!BILLING_AUTHORITIES.includes(authority)) return { status: 'invalid', reason: 'unrecognised_billing_authority' }

  return {
    status: 'loaded',
    governance: {
      userId,
      signupOrigin: origin as SignupOrigin,
      billingAuthority: authority as BillingAuthority,
      authorityReason: typeof row.authority_reason === 'string' ? row.authority_reason : null,
    },
  }
}

/** The authority decision, or an explicit refusal to decide. */
export type AuthorityDecision =
  | { ok: true; authority: BillingAuthority; governance: BillingGovernance | null }
  | { ok: false; reason: 'governance_unavailable' | 'governance_invalid'; detail: string }

/**
 * Resolve who bills this account.
 *
 * A confirmed-missing row resolves to the documented WEBSITE default: every
 * account predating this table registered on the website, and an account only
 * becomes Shopify-governed by passing through a trusted transition that writes
 * the row. A failed or malformed read resolves to nothing at all — the caller
 * must surface an infrastructure error, not a billing verdict.
 */
export async function resolveBillingAuthority(admin: Admin, userId: string): Promise<AuthorityDecision> {
  const lookup = await loadBillingGovernance(admin, userId)
  switch (lookup.status) {
    case 'loaded':
      return { ok: true, authority: lookup.governance.billingAuthority, governance: lookup.governance }
    case 'missing':
      return { ok: true, authority: 'website', governance: null }
    case 'unavailable':
      return { ok: false, reason: 'governance_unavailable', detail: lookup.reason }
    case 'invalid':
      return { ok: false, reason: 'governance_invalid', detail: lookup.reason }
  }
}
