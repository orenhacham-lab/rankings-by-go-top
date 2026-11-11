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

import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'crypto'
import type {
  MarketplaceEncryptedEnvelopeScheme,
  MarketplaceFieldDigestScheme,
  MarketplaceHmacHeaderScheme,
  MarketplaceSignatureScheme,
  MarketplaceSortedParamsDigestScheme,
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
  if (scheme.kind === 'sorted_params_digest') return sortedParamsDigestFor(rawBody, secret, scheme)
  // An encrypted envelope has no digest to produce; `decryptMarketplaceEnvelope`
  // is its whole verification, and asking this function for a signature is a
  // programming error rather than a delivery we could refuse.
  if (scheme.kind === 'encrypted_envelope') {
    throw new Error('marketplaceSignatureFor: encrypted_envelope has no signature')
  }
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

/**
 * THE PARAMETERS OF A FORM BODY AS THE SENDER'S OWN PHP SAW THEM.
 *
 * This exists because a digest over "every parameter" is only reproducible if
 * we group and order them the way the sender did, and the sender is PHP. Two
 * of its behaviours are load-bearing:
 *
 *  1. A REPEATED BRACKET-FREE KEY KEEPS ITS LAST VALUE. `$_POST` is a map, so
 *     `product_id=A&product_id=B` is just `B` there, while
 *     `URLSearchParams.get()` would answer `A`. If the digest covered one and
 *     the order were granted on the other, a body could be signed for one
 *     product and redeemed for another — so the digest and the parser read
 *     this same view, and neither calls `.get()` on a signed body.
 *  2. A BRACKETED KEY IS ONE ARRAY, NOT SEVERAL PARAMETERS. `addons[0][id]`
 *     and `addons[1][id]` are one `addons` entry in `$_POST`, which the
 *     reference implementation re-serialises and emits as consecutive
 *     `key=value` parts. So they sort together, under `addons`, in body
 *     order, rather than each sorting on its own full name.
 *
 * Returns the groups in body order; the caller sorts them. Each group is a
 * top-level name and the `name=value` parts belonging to it, already decoded.
 */
interface FormParameterGroup {
  /** The name the group sorts by: everything before the first `[`. */
  key: string
  /** `name=value` strings, in the order PHP would emit them. */
  parts: readonly string[]
}

export function phpFormParameterGroups(rawBody: string): FormParameterGroup[] {
  const groups: FormParameterGroup[] = []
  const byKey = new Map<string, FormParameterGroup>()
  // Scalars are collected separately because a later occurrence REPLACES an
  // earlier one, while array parts accumulate.
  const scalarIndex = new Map<string, number>()

  for (const [name, value] of new URLSearchParams(rawBody)) {
    const bracket = name.indexOf('[')
    const key = bracket === -1 ? name : name.slice(0, bracket)
    if (bracket === -1) {
      const at = scalarIndex.get(key)
      if (at !== undefined) {
        // Last value wins, in the position the key first appeared — PHP keeps
        // one entry per key and its insertion order.
        groups[at] = { key, parts: [`${name}=${value}`] }
        continue
      }
      scalarIndex.set(key, groups.length)
      groups.push({ key, parts: [`${name}=${value}`] })
      continue
    }
    const existing = byKey.get(key)
    if (existing) {
      byKey.set(key, { key, parts: [...existing.parts, `${name}=${value}`] })
      groups[groups.findIndex((group) => group === existing)] = byKey.get(key)!
      continue
    }
    const group = { key, parts: [`${name}=${value}`] }
    byKey.set(key, group)
    groups.push(group)
  }
  return groups
}

/**
 * One scalar parameter, read the way the sender's PHP read it: LAST value
 * wins. A parser must use this and never `URLSearchParams.get()` on a signed
 * body, so that the value it acts on is the value that was signed.
 */
export function phpFormValue(rawBody: string, name: string): string | null {
  const values = new URLSearchParams(rawBody).getAll(name)
  return values.length ? values[values.length - 1] : null
}

/**
 * The digest a sorted-parameters scheme computes over a form-encoded body.
 *
 * An EMPTY VALUE IS SKIPPED, not signed as empty — the reference
 * implementation's `$is_empty` test — so a parameter present with no value
 * contributes nothing and a body that drops it entirely produces the same
 * digest. Reproducing that is not optional: signing `name=` where they signed
 * nothing rejects every delivery that carries one blank field.
 */
export function sortedParamsDigestFor(
  rawBody: string,
  secret: string,
  scheme: MarketplaceSortedParamsDigestScheme,
): string {
  const excluded = new Set(scheme.excluded)
  const groups = phpFormParameterGroups(rawBody)
    .filter((group) => !excluded.has(group.key))
    .map((group) => ({
      // The sort key, folded only when the scheme says names sort that way.
      sortKey: scheme.caseSensitiveSort ? group.key : group.key.toUpperCase(),
      parts: group.parts.filter((part) => !part.endsWith('=')),
    }))
    .filter((group) => group.parts.length > 0)
  // Byte-wise comparison, which is what PHP's SORT_STRING does and what
  // JavaScript's default string comparison does for the ASCII names these
  // platforms use.
  groups.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))

  const base = groups.flatMap((group) => group.parts).map((part) => part + secret).join('')
  return createHash(scheme.algorithm).update(base, 'utf8').digest('hex').toUpperCase()
}

/**
 * THE ONE PLATFORM THAT ENCRYPTS INSTEAD OF SIGNING.
 *
 * ClickBank's INS carries no digest at all. The whole notification is
 * AES-256-CBC ciphertext under our own Secret Key, and their page is explicit
 * that decrypting it IS the authentication: a body we cannot decrypt into JSON
 * was not produced by someone holding the key. See
 * docs/affiliate/clickbank-ins-docs.md for the quoted sentences.
 *
 * THE KEY IS HEX TEXT, NOT DIGEST BYTES. The key is the first 32 CHARACTERS of
 * the hex rendering of SHA-1(secret), used as 32 ASCII bytes. Taking the first
 * 16 raw bytes of the digest instead — the obvious reading, and what a careless
 * port does — yields a different key and refuses every real delivery.
 *
 * Returns the plaintext so the parser can be given it, or null for anything
 * that is not a well-formed, decryptable, JSON-bearing envelope. It never
 * throws: a bad key, a bad IV length and a bad padding all arrive here as
 * exceptions from `crypto`, and every one of them means the same thing.
 */
export function decryptMarketplaceEnvelope(
  rawBody: string,
  secret: string,
  scheme: MarketplaceEncryptedEnvelopeScheme,
): string | null {
  let envelope: unknown
  try {
    envelope = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (typeof envelope !== 'object' || envelope === null) return null
  const fields = envelope as Record<string, unknown>
  const ciphertext = fields[scheme.ciphertextField]
  const iv = fields[scheme.ivField]
  if (typeof ciphertext !== 'string' || typeof iv !== 'string') return null
  if (!ciphertext || !iv) return null

  const key = createHash(scheme.keyDigest).update(secret, 'utf8').digest('hex').slice(0, scheme.keyLength)
  try {
    const decipher = createDecipheriv(scheme.algorithm, Buffer.from(key, 'utf8'), Buffer.from(iv, 'base64'))
    const plaintext =
      decipher.update(Buffer.from(ciphertext, 'base64')).toString('utf8') + decipher.final('utf8')
    // A plaintext that is not JSON is a forgery, not a decryption: random bytes
    // occasionally survive the padding check, and nothing further may act on
    // them. This is the test their own sample code ends on.
    JSON.parse(plaintext)
    return plaintext
  } catch {
    return null
  }
}

/**
 * An encrypted-envelope delivery has nothing to compare, so verification IS
 * decryption. A refusal is reported as `mismatch` rather than
 * `malformed_signature` on purpose: like a digest that disagrees with ours, it
 * is the case where a real payment may have been refused because our key and
 * the platform's differ, and the route logs that one loudly.
 */
function verifyEncryptedEnvelope(
  rawBody: string,
  secret: string,
  scheme: MarketplaceEncryptedEnvelopeScheme,
): MarketplaceSignatureResult {
  return decryptMarketplaceEnvelope(rawBody, secret, scheme) === null
    ? { ok: false, reason: 'mismatch' }
    : { ok: true }
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
  if (scheme.kind === 'sorted_params_digest') return verifySortedParamsDigest(rawBody, secret, scheme)
  if (scheme.kind === 'encrypted_envelope') return verifyEncryptedEnvelope(rawBody, secret, scheme)

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

/**
 * A sorted-parameters delivery carries its digest in the body, like a
 * field-digest one, so the header argument is ignored and the body is read
 * twice — once here and once by the parser, which still never runs on an
 * unverified body.
 *
 * THE DIGEST FIELD IS READ FROM THE PHP VIEW TOO. Reading it with `.get()`
 * would take the FIRST `sha_sign` of a body carrying two, while the sender
 * signed with the last; an attacker could then prepend a digest of their own
 * choosing. Both sides read the same last-wins view.
 */
function verifySortedParamsDigest(
  rawBody: string,
  secret: string,
  scheme: MarketplaceSortedParamsDigestScheme,
): MarketplaceSignatureResult {
  const field = phpFormParameterGroups(rawBody).find((group) => group.key === scheme.field)
  const received = (field?.parts[0]?.slice(scheme.field.length + 1) ?? '').trim().toUpperCase()
  if (!received) return { ok: false, reason: 'missing_signature' }
  const expected = sortedParamsDigestFor(rawBody, secret, scheme)
  // Checked before timingSafeEqual, which throws on a length mismatch.
  if (received.length !== expected.length || !/^[0-9A-F]+$/.test(received)) {
    return { ok: false, reason: 'malformed_signature' }
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
    ? { ok: true }
    : { ok: false, reason: 'mismatch' }
}
