/**
 * Shared verification for the PUBLIC "Go Top SEO" Shopify app's compliance webhooks
 * (customers/data_request, customers/redact, shop/redact, app/uninstalled).
 *
 * These webhooks are signed by the PUBLIC app, so their HMAC is verified with
 * SHOPIFY_PUBLIC_CLIENT_SECRET — NOT SHOPIFY_CLIENT_SECRET (the legacy custom app the
 * OAuth connection flow uses). The raw-body HMAC math itself is the already-reviewed
 * verifyShopifyWebhookHmac in ./webhook-hmac (unchanged). This module only resolves the
 * public secret and reads/verifies/parses the request, so the two compliance routes
 * share one identical, tested contract. Fails CLOSED: a missing secret → 401.
 */

import { verifyShopifyWebhookHmac, SHOPIFY_WEBHOOK_HMAC_HEADER } from './webhook-hmac'

/** The PUBLIC app client secret used to sign these compliance webhooks. Reads
 *  SHOPIFY_PUBLIC_CLIENT_SECRET ONLY. Returns null when unset/blank so verification
 *  fails closed (401) rather than accepting an unverifiable request. */
export function getShopifyPublicWebhookSecret(): string | null {
  const secret = process.env.SHOPIFY_PUBLIC_CLIENT_SECRET
  return typeof secret === 'string' && secret.trim().length > 0 ? secret : null
}

/** Minimal JSON Response helper (same shape the base webhook route uses). */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export type VerifiedPublicWebhook =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: 400 | 401; error: string }

/**
 * Read the EXACT raw bytes, verify the raw-body HMAC with the PUBLIC app secret BEFORE
 * parsing anything, then require a non-null plain JSON object. Returns:
 *   - 401 unauthorized  — missing/invalid HMAC or missing public secret (before parse/DB);
 *   - 400 invalid_json  — body is not valid JSON;
 *   - 400 invalid_payload — body is null / array / string / number / boolean;
 *   - ok + payload      — a verified, non-null plain object.
 * No DB access; never logs the secret, header, body, or digest.
 */
export async function readVerifiedPublicWebhook(request: Request): Promise<VerifiedPublicWebhook> {
  const raw = Buffer.from(await request.arrayBuffer())
  const secret = getShopifyPublicWebhookSecret()
  const hmacHeader = request.headers.get(SHOPIFY_WEBHOOK_HMAC_HEADER)
  if (!verifyShopifyWebhookHmac(raw, hmacHeader, secret)) return { ok: false, status: 401, error: 'unauthorized' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: 'invalid_payload' }
  }
  return { ok: true, payload: parsed as Record<string, unknown> }
}
