/**
 * Marketplace callback signature verification.
 *
 * The same shape as lib/creem/signature.ts and for the same reason: proxy.ts
 * does not cover /api/*, so a callback route's ONLY authentication is this
 * check, and it therefore has to be a pure function testable on the exact
 * bytes the route received, with no network and no SDK in the way.
 *
 * It is parameterised by scheme (lib/marketplace/config.ts) because each
 * platform picked its own algorithm and encoding, and generalised in exactly
 * one way beyond Creem's: a digest may arrive as hex or as base64.
 *
 * WHAT IT GETS RIGHT, and a naive implementation does not:
 *  1. It takes the RAW body as a string. `JSON.stringify(await req.json())`
 *     drops insignificant whitespace, so the digest would not match the bytes
 *     the platform signed. The caller must pass `await request.text()`.
 *  2. The comparison is timing-safe. A plain `===` on a digest leaks, byte by
 *     byte, how much of a forged signature is right.
 *  3. It fails CLOSED on every ambiguity — no scheme, no secret, no header,
 *     wrong length, wrong alphabet — and never throws. A route that throws
 *     on a malformed header tells an attacker "malformed" from "wrong", and a
 *     500 makes the platform retry a request that will never be accepted.
 *
 * PURE: no request, env or database access. The scheme and secret are passed.
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto'
import type {
  MarketplaceFieldDigestScheme,
  MarketplaceHmacHeaderScheme,
  MarketplaceSignatureScheme,
} from './config'

export type MarketplaceSignatureFailure =
  | 'unknown_scheme'
  | 'missing_secret'
  | 'missing_signature'
  | 'malformed_signature'
  | 'mismatch'

export type MarketplaceSignatureResult =
  | { ok: true }
  | { ok: false; reason: MarketplaceSignatureFailure }

/** The digest this scheme would produce for this body, in its own encoding. */
export function marketplaceSignatureFor(
  rawBody: string,
  secret: string,
  scheme: MarketplaceSignatureScheme,
): string {
  if (scheme.kind === 'field_digest') return fieldDigestFor(rawBody, secret, scheme)
  const mac = createHmac(scheme.algorithm, secret).update(rawBody, 'utf8')
  return scheme.encoding === 'base64' ? mac.digest('base64') : mac.digest('hex')
}

/**
 * The digest a field-digest scheme computes over a form-encoded body.
 *
 * A field the platform did not send counts as the empty string, exactly as
 * the platform's own reference implementations do — dropping it instead would
 * shift every later field across the separator and compute a digest for a
 * different message.
 */
export function fieldDigestFor(
  rawBody: string,
  secret: string,
  scheme: MarketplaceFieldDigestScheme,
): string {
  const form = new URLSearchParams(rawBody)
  const joined = scheme.fields.map((name) => form.get(name) ?? '').join(scheme.separator)
  const base = joined + (scheme.trailingSeparator ? scheme.separator : '') + secret
  return createHash(scheme.algorithm).update(base, 'utf8').digest('hex').slice(0, scheme.length).toUpperCase()
}

/** Digest lengths in characters, so a wrong-length value is rejected before
 *  timingSafeEqual — which throws on a length mismatch — is reached. */
const HEX_LENGTH: Record<MarketplaceHmacHeaderScheme['algorithm'], number> = { sha256: 64, sha512: 128 }

function wellFormed(received: string, scheme: MarketplaceHmacHeaderScheme): boolean {
  if (scheme.encoding === 'hex') {
    return received.length === HEX_LENGTH[scheme.algorithm] && /^[0-9a-f]+$/.test(received)
  }
  // Base64 of 32 or 64 bytes, padding included or stripped.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(received)) return false
  const bytes = Buffer.from(received, 'base64').length
  return bytes === (scheme.algorithm === 'sha256' ? 32 : 64)
}

/**
 * Verify one delivery. `rawBody` MUST be the untouched request body text and
 * `signatureHeader` the header value as received.
 *
 * Returns a reason rather than a bare false, so the route can log WHY it
 * refused — a missing secret is our misconfiguration, a mismatch is somebody
 * else's problem — without ever telling the caller which it was.
 */
export function verifyMarketplaceSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
  scheme: MarketplaceSignatureScheme | null | undefined,
): MarketplaceSignatureResult {
  if (!scheme) return { ok: false, reason: 'unknown_scheme' }
  if (!secret) return { ok: false, reason: 'missing_secret' }
  if (scheme.kind === 'field_digest') return verifyFieldDigest(rawBody, secret, scheme)

  const raw = (signatureHeader ?? '').trim()
  if (!raw) return { ok: false, reason: 'missing_signature' }
  // Hex is compared lower-case; base64 is case-significant and must not be
  // folded.
  const received = scheme.encoding === 'hex' ? raw.toLowerCase() : raw
  if (!wellFormed(received, scheme)) return { ok: false, reason: 'malformed_signature' }

  const expected = marketplaceSignatureFor(rawBody, secret, scheme)
  const a = Buffer.from(expected, scheme.encoding === 'hex' ? 'hex' : 'base64')
  const b = Buffer.from(received, scheme.encoding === 'hex' ? 'hex' : 'base64')
  if (a.length !== b.length) return { ok: false, reason: 'malformed_signature' }
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'mismatch' }
}

/**
 * A field-digest delivery carries its digest inside the body, so the header
 * argument is ignored for it and the body is read twice: once by this check
 * and once by the parser. That is deliberate — the parser still never runs
 * on an unverified body.
 */
function verifyFieldDigest(
  rawBody: string,
  secret: string,
  scheme: MarketplaceFieldDigestScheme,
): MarketplaceSignatureResult {
  const received = (new URLSearchParams(rawBody).get(scheme.field) ?? '').trim().toUpperCase()
  if (!received) return { ok: false, reason: 'missing_signature' }
  // Checked before timingSafeEqual, which throws on a length mismatch.
  if (received.length !== scheme.length || !/^[0-9A-F]+$/.test(received)) {
    return { ok: false, reason: 'malformed_signature' }
  }
  const expected = fieldDigestFor(rawBody, secret, scheme)
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
    ? { ok: true }
    : { ok: false, reason: 'mismatch' }
}
