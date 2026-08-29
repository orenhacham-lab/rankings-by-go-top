/**
 * Phase 2 (blocker fix) — the short-lived, single-use billing intent that
 * authorizes a pricing-redirect / return round-trip.
 *
 * The `shop` query parameter Shopify appends to the return URL is NEVER
 * sufficient authorization by itself — an unauthenticated request naming any
 * shop_domain in the database must not be able to trigger Partner API
 * verification, a billing-cache write, a migration advance, or a PayPal
 * cancellation for that shop. This module is what actually authorizes those
 * side effects: a random 256-bit nonce is minted by an AUTHENTICATED request
 * (Supabase session or a verified App Bridge session token — see
 * app/api/shopify/billing/start-intent/route.ts, the only place this is
 * created), bound server-side to the exact connection/shop/user/project, and
 * carried browser-side ONLY in a scoped, HttpOnly, Secure cookie. Only a
 * SHA-256 hash of the nonce is ever stored in the DB — the raw nonce itself
 * is the credential (whoever holds it can look up its own intent; nobody
 * else can, since a forged/guessed value cannot match a stored hash).
 *
 * Single-use: consumeBillingIntent() is atomic (only succeeds while
 * consumed_at is null). A caller that finds an ALREADY-consumed intent must
 * treat it as an idempotent no-op (same redirect, zero further side
 * effects) — never as license to repeat a cache write / migration advance /
 * PayPal cancellation.
 */

import crypto from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export const BILLING_INTENT_COOKIE = 'shopify_billing_intent'
export const BILLING_INTENT_COOKIE_PATH = '/api/shopify/billing'
export const BILLING_INTENT_TTL_MS = 15 * 60_000

export function generateBillingIntentNonce(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function hashBillingIntentNonce(nonce: string): string {
  return crypto.createHash('sha256').update(nonce).digest('hex')
}

export interface BillingIntentRow {
  nonce_hash: string
  user_id: string
  project_id: string
  connection_id: string
  shop_domain: string
  shop_gid: string
  intended_action: string
  expires_at: string
  consumed_at: string | null
}

export async function createBillingIntent(
  admin: Admin,
  fields: { userId: string; projectId: string; connectionId: string; shopDomain: string; shopGid: string; intendedAction?: string },
): Promise<string> {
  const nonce = generateBillingIntentNonce()
  await admin.from('shopify_billing_intents').insert({
    nonce_hash: hashBillingIntentNonce(nonce),
    user_id: fields.userId,
    project_id: fields.projectId,
    connection_id: fields.connectionId,
    shop_domain: fields.shopDomain,
    shop_gid: fields.shopGid,
    intended_action: fields.intendedAction ?? 'select_plan',
    expires_at: new Date(Date.now() + BILLING_INTENT_TTL_MS).toISOString(),
    // Explicit, never relying on a DB column default — loadBillingIntentByNonce
    // checks `consumed_at !== null`, so an absent/undefined value must never
    // be mistaken for "already consumed."
    consumed_at: null,
  })
  return nonce
}

export type LoadedBillingIntent =
  | { found: false }
  | { found: true; expired: true; row: BillingIntentRow }
  | { found: true; expired: false; alreadyConsumed: boolean; row: BillingIntentRow }

/** Looks up an intent by its RAW nonce (never trust a hash from the request — always hash it here). */
export async function loadBillingIntentByNonce(admin: Admin, nonce: string): Promise<LoadedBillingIntent> {
  if (!nonce) return { found: false }
  const { data } = await admin
    .from('shopify_billing_intents')
    .select('*')
    .eq('nonce_hash', hashBillingIntentNonce(nonce))
    .maybeSingle()
  if (!data) return { found: false }
  const row = data as BillingIntentRow
  const expired = new Date(row.expires_at).getTime() < Date.now()
  if (expired) return { found: true, expired: true, row }
  return { found: true, expired: false, alreadyConsumed: row.consumed_at !== null, row }
}

/** Atomic single-use consume. Returns true only if THIS call consumed it (false if already consumed by an earlier call). */
export async function consumeBillingIntent(admin: Admin, nonceHash: string): Promise<boolean> {
  const { data } = await admin
    .from('shopify_billing_intents')
    .update({ consumed_at: new Date().toISOString() })
    .eq('nonce_hash', nonceHash)
    .is('consumed_at', null)
    .select('nonce_hash')
    .maybeSingle()
  return !!data
}
