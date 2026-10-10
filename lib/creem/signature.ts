/**
 * Creem webhook signature verification.
 *
 * Creem signs every webhook delivery with HMAC-SHA256 over the RAW request
 * body, keyed by the endpoint's signing secret, and sends the result as a
 * lowercase hex digest in the `creem-signature` header
 * (https://docs.creem.io/code/webhooks).
 *
 * Why this module exists at all, rather than calling the SDK's
 * `verifyWebhookSignature`: proxy.ts does not cover /api/*, so every API
 * route authenticates itself, and a webhook route's ONLY authentication is
 * this check. It therefore has to be a pure function we can test directly,
 * on the exact bytes the route received, with no network and no SDK version
 * in the way.
 *
 * THREE things this gets right that a naive implementation does not:
 *
 *  1. It takes the RAW body as a string, never a re-serialised object.
 *     `JSON.stringify(await request.json())` re-orders nothing in V8 today
 *     but drops insignificant whitespace, so the digest would not match the
 *     bytes Creem actually signed. The caller must pass `await request.text()`.
 *  2. The comparison is timing-safe. A plain `===` on a hex digest leaks,
 *     byte by byte, how much of a forged signature is correct, which is
 *     enough to forge one over many attempts.
 *  3. It fails CLOSED on every ambiguity — missing header, missing secret,
 *     wrong length, non-hex characters — and never throws. A webhook route
 *     that throws on a malformed header hands an attacker a way to tell
 *     "malformed" from "wrong", and a 500 makes Creem retry a request that
 *     will never be accepted.
 *
 * PURE: no request, env or database access. The secret is passed in.
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** The header Creem sends the digest in, lowercase as Headers.get expects. */
export const CREEM_SIGNATURE_HEADER = 'creem-signature'

/** A SHA-256 hex digest: exactly 64 lowercase hex characters. */
const HEX_DIGEST = /^[0-9a-f]{64}$/

export type CreemSignatureFailure =
  | 'missing_signature'
  | 'missing_secret'
  | 'malformed_signature'
  | 'mismatch'

export type CreemSignatureResult =
  | { ok: true }
  | { ok: false; reason: CreemSignatureFailure }

/** The digest Creem should have sent for this body, as lowercase hex. */
export function creemSignatureFor(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/**
 * Verify one delivery. `rawBody` MUST be the untouched request body text and
 * `signatureHeader` the `creem-signature` header value as received.
 *
 * Returns a reason rather than a bare false so the route can log WHY a
 * delivery was refused (a missing secret is our misconfiguration; a mismatch
 * is someone else's problem) without ever telling the caller.
 */
export function verifyCreemSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
): CreemSignatureResult {
  if (!secret) return { ok: false, reason: 'missing_secret' }

  const received = (signatureHeader ?? '').trim().toLowerCase()
  if (!received) return { ok: false, reason: 'missing_signature' }
  // Length and alphabet are checked BEFORE the compare: timingSafeEqual
  // throws on a length mismatch, and a throw here would be the 500 this
  // module exists to avoid.
  if (!HEX_DIGEST.test(received)) return { ok: false, reason: 'malformed_signature' }

  const expected = creemSignatureFor(rawBody, secret)
  const equal = timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
  return equal ? { ok: true } : { ok: false, reason: 'mismatch' }
}
