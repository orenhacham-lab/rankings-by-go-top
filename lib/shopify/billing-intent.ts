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

/**
 * The ONE first-party endpoint that may turn a signed billing handoff into the
 * scoped intent cookie. Fixed here, server-side, and echoed to the embedded
 * client as `resumePath` so that client never composes a destination of its
 * own (and can check the value it got is exactly this one). Never
 * caller-supplied.
 */
export const BILLING_INTENT_RESUME_PATH = '/api/shopify/billing/resume'

/**
 * WHERE the billing flow started, recorded on the intent row itself.
 *
 * Production incident (Sep 2): a merchant who bought a plan from INSIDE the
 * embedded app was returned by Shopify to /api/shopify/billing/return, which
 * redirected — as it does for every caller — to the external Rankings
 * dashboard. Inside the Shopify Admin iframe that dashboard has no Supabase
 * session (its auth cookie is SameSite=Lax and is not sent in a third-party
 * context), so the merchant was shown the website's Hebrew login page framed
 * in Shopify Admin, and logging in there could never complete.
 *
 * The origin is stamped SERVER-SIDE at mint time, from which authenticated
 * caller it was (App Bridge session token vs Supabase session) — never from a
 * request body, query parameter or header, so a browser cannot choose its own
 * return destination. It reuses the existing `intended_action` column: no
 * schema change, and an older row with the plain value is treated as the
 * website flow, which is what it was.
 */
export const BILLING_INTENT_ACTION_WEBSITE = 'select_plan'
export const BILLING_INTENT_ACTION_EMBEDDED = 'select_plan_embedded'

/** True when this intent was minted by the EMBEDDED (App Bridge) caller. PURE. */
export function isEmbeddedBillingIntent(intendedAction: string | null | undefined): boolean {
  return intendedAction === BILLING_INTENT_ACTION_EMBEDDED
}

/**
 * Domain separator mixed into the handoff HMAC. The pending-link handoff
 * (lib/shopify/pending-link.ts) signs with the SAME app secret in the same
 * `${value}.${mac}` shape, so without this a valid pending-link handoff would
 * verify as a valid billing handoff and vice versa. Neither would survive the
 * database lookup that follows — they address different tables — but two
 * distinct credentials must not share a signature space in the first place.
 */
const BILLING_HANDOFF_DOMAIN = 'shopify_billing_intent_handoff:'

/**
 * Sign the raw nonce for the ONE hop from the embedded fetch response to the
 * first-party resume POST: `${nonce}.${hmac}`. PURE.
 *
 * The nonce inside is the same credential the cookie itself carries — the
 * signature exists so the resume endpoint can reject anything it did not
 * issue BEFORE it touches the database, not to hide the nonce from the
 * merchant's own browser (which is the only party that ever receives it, over
 * an already-authenticated response).
 */
export function signBillingIntentHandoff(nonce: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(`${BILLING_HANDOFF_DOMAIN}${nonce}`).digest('hex')
  return `${nonce}.${mac}`
}

/** Verify a signed handoff; returns the raw nonce or null (missing/tampered). PURE, constant-time. */
export function verifyBillingIntentHandoff(value: string | undefined | null, secret: string): string | null {
  if (!value || typeof value !== 'string') return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const nonce = value.slice(0, dot)
  const provided = value.slice(dot + 1)
  const expected = crypto.createHmac('sha256', secret).update(`${BILLING_HANDOFF_DOMAIN}${nonce}`).digest('hex')
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return null
  return crypto.timingSafeEqual(a, b) ? nonce : null
}

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
