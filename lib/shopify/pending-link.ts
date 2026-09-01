/**
 * Phase 2 (blocker fix) — the pending Shopify install/link record and its
 * browser-side cookie. Bridges an App-Store-initiated OAuth completion
 * (before any Rankings user/project exists) to the moment the merchant
 * authenticates on Rankings and picks/creates a project to link the store
 * to. Never preserved in an unsigned query parameter — the token lives in a
 * signed, httpOnly cookie (same signing pattern as the existing OAuth nonce
 * cookie in lib/shopify/oauth.ts), and the DB row it references is the
 * actual source of truth (single-use: consumed_at, short-lived: expires_at).
 */

import crypto from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { getShopifyOAuthConfig } from './oauth'

type Admin = ReturnType<typeof createAdminClient>

export const PENDING_LINK_COOKIE = 'shopify_pending_link'
export const PENDING_LINK_TTL_MS = 30 * 60_000

/**
 * The ONE first-party endpoint that may turn a signed pending-link handoff
 * into the browser cookie. Fixed here, server-side, and echoed to the embedded
 * client as `resumePath` so the client never composes a destination of its own
 * (and can assert the value it got is exactly this one). Never caller-supplied.
 */
export const PENDING_LINK_RESUME_PATH = '/api/shopify/link/resume'

export function generatePendingLinkToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/** Sign the token for the browser cookie: `${token}.${hmac}`. PURE. */
export function signPendingLinkCookieValue(token: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(token).digest('hex')
  return `${token}.${mac}`
}

/** Verify a signed cookie value; returns the token or null (missing/tampered). PURE, constant-time. */
export function verifyPendingLinkCookieValue(value: string | undefined | null, secret: string): string | null {
  if (!value || typeof value !== 'string') return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const token = value.slice(0, dot)
  const provided = value.slice(dot + 1)
  const expected = crypto.createHmac('sha256', secret).update(token).digest('hex')
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return null
  return crypto.timingSafeEqual(a, b) ? token : null
}

/** Reads + HMAC-verifies the pending-link cookie straight from a Request header. Never hits the DB. */
export function readPendingLinkTokenFromRequest(request: Request): string | null {
  const config = getShopifyOAuthConfig()
  if (!config) return null
  const cookieHeader = request.headers.get('cookie') || ''
  const entry = cookieHeader.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${PENDING_LINK_COOKIE}=`))
  if (!entry) return null
  let raw: string
  try { raw = decodeURIComponent(entry.slice(PENDING_LINK_COOKIE.length + 1)) } catch { return null }
  return verifyPendingLinkCookieValue(raw, config.clientSecret)
}

/**
 * True when THIS request's browser carries a still-signature-valid pending
 * Shopify link — used as a fast, DB-free defense-in-depth gate to block
 * PayPal checkout during the pre-project-link window (Blocker 3). The
 * cookie's maxAge is set equal to PENDING_LINK_TTL_MS, so an expired pending
 * install and its cookie always expire together — no separate DB check is
 * needed for this gate. The completion route re-validates against the DB
 * regardless before ever using the record.
 */
export function hasPendingShopifyLinkCookie(request: Request): boolean {
  return readPendingLinkTokenFromRequest(request) !== null
}

/**
 * How the install that produced this pending row was initiated. Stamped
 * SERVER-SIDE by the route that created it, from which verified flow it was —
 * never from a request body, query parameter or header:
 *
 *   'shopify_app_store'  a verified App Bridge session token (embedded
 *                        install) or a signed App-Store-initiated pre-auth
 *                        OAuth callback. This is the provenance that may make
 *                        the linked account Shopify-billing-governed.
 *   'website_connector'  an authenticated website user connecting a store from
 *                        the dashboard. Billing authority stays with the
 *                        website.
 *
 * Nullable only so a row written before this column existed still reads; every
 * writer in the codebase supplies it, and an absent value is treated as the
 * SAFE value ('website_connector') by the consumer.
 */
export type PendingInstallOrigin = 'shopify_app_store' | 'website_connector'

export interface PendingInstallRow {
  token: string
  shop_domain: string
  shop_gid: string | null
  access_token_encrypted: string
  install_origin: PendingInstallOrigin | null
  /**
   * Expiring offline grants (Shopify no longer accepts non-expiring Admin API
   * tokens) come as a PAIR. All of it must survive this handoff table: if only
   * the access token crossed the bridge, the connection created at
   * /shopify/link would have nothing to rotate with and would die at the first
   * expiry with no way back. `refresh_token_expires_at` is nullable because
   * Shopify may omit the refresh-token lifetime.
   */
  refresh_token_encrypted: string | null
  access_token_expires_at: string | null
  refresh_token_expires_at: string | null
  /**
   * WHICH Shopify app issued this credential — recorded at acquisition and
   * carried to the live connection, because only that app's client id and
   * secret can refresh it.
   */
  oauth_app_edition: 'public' | 'legacy' | null
  api_version: string
  granted_scopes: string[]
  storefront_domain: string | null
  expires_at: string
  consumed_at: string | null
}

/**
 * Create the pending install for a shop, REPLACING any earlier one.
 *
 * Reinstall entry (production bug): a merchant who uninstalls and reinstalls
 * generates a brand-new offline token, and the previous pending row — whether
 * consumed, expired, or simply superseded — is worthless. Leaving it behind
 * meant the table could still hold only a stale row from a previous install
 * (consumed_at set, expires_at long past) with no fresh one beside it, which
 * made it impossible to tell "the new install never ran" from "it ran and
 * reused something". Prior rows for this shop are deleted first, so the row
 * present for a shop is always the newest install attempt and can never be
 * reused. Deletion is scoped to shopify_pending_installs: it is a short-lived
 * handoff table with no children, and nothing references it.
 *
 * FAILS CLOSED. Both Supabase results used to be discarded, so a delete or
 * insert that the database rejected still returned a token: the caller
 * answered 200 with a handoff for a pending row that does not exist, and the
 * merchant reached /shopify/link only to be told the linking session had
 * expired. Each result is now checked explicitly and a failure throws
 * PendingInstallPersistenceError, so no token is ever handed out for state
 * that was not persisted.
 */
export class PendingInstallPersistenceError extends Error {
  /** WHICH step failed — our own operation name, never a database message. */
  readonly op: 'delete' | 'insert'
  constructor(op: 'delete' | 'insert') {
    super('pending_install_persistence_failed')
    this.name = 'PendingInstallPersistenceError'
    this.op = op
  }
}

export async function createPendingInstall(
  admin: Admin,
  fields: Omit<PendingInstallRow, 'token' | 'expires_at' | 'consumed_at'>,
): Promise<string> {
  // The DB error object itself is deliberately NOT captured, logged or
  // attached to the thrown error: it can echo row contents. Only the fact of
  // failure and which step it was travel outward.
  const { error: deleteError } = await admin.from('shopify_pending_installs').delete().eq('shop_domain', fields.shop_domain)
  if (deleteError) throw new PendingInstallPersistenceError('delete')
  const token = generatePendingLinkToken()
  const { error: insertError } = await admin.from('shopify_pending_installs').insert({
    token,
    ...fields,
    expires_at: new Date(Date.now() + PENDING_LINK_TTL_MS).toISOString(),
  })
  if (insertError) throw new PendingInstallPersistenceError('insert')
  return token
}

/** Loads a pending install by token IFF it is unexpired and unconsumed. The row IS the identity — never trust a caller-asserted shop/user alongside it. */
export async function loadValidPendingInstall(admin: Admin, token: string): Promise<PendingInstallRow | null> {
  if (!token) return null
  const { data } = await admin
    .from('shopify_pending_installs')
    .select('*')
    .eq('token', token)
    .is('consumed_at', null)
    .maybeSingle()
  if (!data) return null
  const row = data as PendingInstallRow
  if (new Date(row.expires_at).getTime() < Date.now()) return null
  return row
}

/** Marks a pending install consumed. Atomic (only succeeds while consumed_at is null) — a second consume attempt is a no-op. */
export async function consumePendingInstall(admin: Admin, token: string): Promise<boolean> {
  const { data } = await admin
    .from('shopify_pending_installs')
    .update({ consumed_at: new Date().toISOString() })
    .eq('token', token)
    .is('consumed_at', null)
    .select('token')
    .maybeSingle()
  return !!data
}
