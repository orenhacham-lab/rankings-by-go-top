/**
 * Turning a platform's signed thank-you redirect into an activation button.
 *
 * WHAT PROBLEM THIS SOLVES. A marketplace purchase is delivered as an email
 * with a claim link, and that is the only route a buyer has: the thank-you
 * page deliberately reads nothing from its query string, because every
 * parameter on it is a value a stranger can type. The cost of that is a buyer
 * who never opens the email. They sign up at the front door instead, land on
 * a free trial, and conclude the product is broken while a paid receipt sits
 * unclaimed next to their account. Digistore24's own reviewer did exactly
 * this on 14.11.2026 and reported it as a bug.
 *
 * SO THE QUERY STRING BECOMES READABLE ONLY ONCE IT IS PROVEN. Digistore24
 * sign the parameters they append with a key of their own
 * (DIGISTORE24_THANKYOU_SCHEME), and a set that verifies against it was
 * produced by the platform, not by a visitor. That is the same standard the
 * webhook is held to, with the same code doing the digest.
 *
 * AND EVEN THEN THE ORDER ID GRANTS NOTHING. It is a lookup key against a
 * receipt our own webhook already recorded from a signed delivery. If no such
 * receipt exists, or it is spent, refunded or cancelled, there is no button —
 * this module never creates, modifies or completes anything. The button it
 * enables leads to /claim with the receipt's own token, which is the same
 * capability the email carries and is spent by the same locked database
 * function (lib/marketplace/claim.ts).
 *
 * WHY THE SIGNATURE IS NOT OPTIONAL. Digistore24's order ids are short and
 * sequential — 78898312 and 78906016 are two real ones from the same day. A
 * page that looked up an unsigned id would hand whoever typed a neighbouring
 * number somebody else's claim token. There is no "degraded mode" here: a set
 * that does not verify is treated exactly like no parameters at all.
 */

import {
  marketplaceThankyouKey,
  type MarketplaceProvider,
} from './config'
import { sortedParamsDigestFor, phpFormParameterGroups } from './signature'

/** The shape Next hands a Server Component for a query string. */
export type ThankyouQuery = Record<string, string | string[] | undefined>

export type ThankyouHandoffRefusal =
  /** The provider has no verified signed handoff, or no key is configured. */
  | 'not_configured'
  /** Nothing was appended to the URL — the ordinary case for a direct visit. */
  | 'no_parameters'
  /** Parameters arrived but the digest did not verify. */
  | 'bad_signature'
  /** Verified, but no readable plain order id was carried. */
  | 'no_order_id'

export type ThankyouOrderIdResult =
  | { ok: true; externalOrderId: string }
  | { ok: false; reason: ThankyouHandoffRefusal }

/**
 * A plain, readable platform order id.
 *
 * Digistore24 can be configured to ENCRYPT each value, and then the parameter
 * arrives as ciphertext beginning `ds24` while their digest still covers the
 * encrypted form — so a signature that verifies does NOT imply a readable id.
 * The four products are set to pass data in plain language, and anything that
 * does not look like a plain id is refused rather than decrypted: their
 * cipher has not been verified against their reference here, and a guess at
 * it would be an untested second authentication path. The emailed link keeps
 * working either way.
 *
 * The character class is deliberately narrow — their ids are digits and
 * upper-case letters — and the length is bounded so that a verified-but-odd
 * value cannot become a long database lookup.
 */
const PLAIN_ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/

/**
 * The marker their own encrypted values begin with.
 *
 * It is a separate test from PLAIN_ORDER_ID and not a happy accident of it:
 * a short ciphertext can be all letters and digits and would otherwise pass
 * as an id, and then the lookup would quietly find nothing while the real
 * cause — a product switched to "encrypt order data" — stayed invisible. The
 * marker is matched case-sensitively, as their reference writes it; their
 * plain ids are digits and upper-case letters.
 */
const ENCRYPTED_VALUE_MARKER = 'ds24'

/**
 * The raw query string this parameter set would have been signed as.
 *
 * It is rebuilt rather than read off the request because a Server Component
 * is given the PARSED parameters and never the original string. That is safe
 * for a flat set — the digest sorts the names itself, and a repeated name is
 * read last-wins on both sides — and it is why the parameters a platform
 * sends here have to be flat scalars. A bracketed array name would survive
 * the round trip but could be re-ordered relative to a sibling group, which
 * would compute a digest for a different message and refuse the handoff. That
 * is the safe direction, and the guard suite pins it.
 */
function rawQueryString(query: ThankyouQuery): string {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const one of value) params.append(name, one)
      continue
    }
    params.append(name, value)
  }
  return params.toString()
}

/**
 * The platform's own order id from a thank-you redirect, or why not.
 *
 * PURE apart from reading the configured key, and it never throws. The caller
 * gets a reason so a surface can log which refusal it hit — a missing key is
 * our misconfiguration, a bad signature is somebody else's — without ever
 * telling the visitor which.
 */
export function verifiedThankyouOrderId(
  provider: MarketplaceProvider,
  query: ThankyouQuery,
): ThankyouOrderIdResult {
  const handoff = provider.thankyouHandoff
  if (!handoff) return { ok: false, reason: 'not_configured' }
  const secret = marketplaceThankyouKey(provider.slug)
  if (!secret) return { ok: false, reason: 'not_configured' }

  const raw = rawQueryString(query)
  if (!raw) return { ok: false, reason: 'no_parameters' }

  const scheme = handoff.signature
  // Read from the same last-wins view the digest is computed over, never with
  // `.get()`: a set carrying two `sha_sign` parameters was signed with the
  // last of them, and taking the first would let an attacker prepend a digest
  // of their own choosing.
  const field = phpFormParameterGroups(raw).find((group) => group.key === scheme.field)
  const received = (field?.parts[0]?.slice(scheme.field.length + 1) ?? '').trim().toUpperCase()
  if (!received) return { ok: false, reason: 'no_parameters' }

  const expected = sortedParamsDigestFor(raw, secret, scheme)
  // Length and alphabet are checked first so a malformed value is a refusal
  // rather than a throw, and the comparison itself is on equal-length hex.
  if (received.length !== expected.length || !/^[0-9A-F]+$/.test(received)) {
    return { ok: false, reason: 'bad_signature' }
  }
  if (!timingSafeEqualHex(expected, received)) return { ok: false, reason: 'bad_signature' }

  const orderField = phpFormParameterGroups(raw).find((group) => group.key === handoff.orderIdField)
  const orderId = (orderField?.parts[0]?.slice(handoff.orderIdField.length + 1) ?? '').trim()
  if (!orderId || orderId.startsWith(ENCRYPTED_VALUE_MARKER)) {
    return { ok: false, reason: 'no_order_id' }
  }
  if (!PLAIN_ORDER_ID.test(orderId)) return { ok: false, reason: 'no_order_id' }
  return { ok: true, externalOrderId: orderId }
}

/**
 * A constant-time comparison of two equal-length hex digests.
 *
 * `crypto.timingSafeEqual` would do, and this module avoids importing node
 * crypto only for it: the digest itself already came from `signature.ts`,
 * which does import it, so there is no portability argument — the reason is
 * that `timingSafeEqual` THROWS on a length mismatch, and the lengths here
 * are compared by the caller. Keeping the loop local makes it obvious that no
 * early exit leaks how much of a forged digest was right.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type ThankyouActivation =
  /** Offer the button; this token is the receipt's own claim capability. */
  | { kind: 'claimable'; claimToken: string; planCode: string }
  /** Offer nothing, for the stated reason. Never shown to the visitor. */
  | { kind: 'none'; reason: ThankyouHandoffRefusal | 'no_such_order' | 'lookup_failed' }

/**
 * The claim token of an unspent receipt for a verified order id.
 *
 * `createAdminClient()` bypasses RLS (CLAUDE.md), so the filter is explicit
 * and narrow: this provider, this id, and `status = 'paid'`, which the
 * table's own constraint ties to `claimed_by IS NULL`. A claimed, refunded or
 * cancelled receipt returns nothing and the page falls back to its ordinary
 * copy — a buyer who already activated does not need the button, and one
 * whose order was refunded must not be offered it.
 *
 * Never throws: a failed lookup is reported as such and read as "no button",
 * never as "no order".
 */
export async function thankyouActivation(
  adminFor: () => Admin,
  provider: MarketplaceProvider,
  query: ThankyouQuery,
): Promise<ThankyouActivation> {
  const verified = verifiedThankyouOrderId(provider, query)
  if (!verified.ok) return { kind: 'none', reason: verified.reason }

  // THE CLIENT IS BUILT ONLY ONCE THE SIGNATURE HAS PASSED, and the factory is
  // the reason this takes a function rather than a client. A service-role
  // client needs its env and is a connection nobody should be opening for the
  // ordinary visitor who just loaded the page with no parameters — which is
  // almost every visitor. It also keeps the page renderable without those
  // secrets, which is how the guard suite renders it.
  let admin: Admin
  try {
    admin = adminFor()
  } catch {
    return { kind: 'none', reason: 'lookup_failed' }
  }

  try {
    const res = await admin
      .from('marketplace_orders')
      .select('claim_token, plan_code')
      .eq('provider', provider.slug)
      .eq('external_order_id', verified.externalOrderId)
      .eq('status', 'paid')
      .limit(1)
    if (res.error) return { kind: 'none', reason: 'lookup_failed' }
    const row = (res.data ?? [])[0] as { claim_token?: unknown; plan_code?: unknown } | undefined
    const token = typeof row?.claim_token === 'string' ? row.claim_token : ''
    const plan = typeof row?.plan_code === 'string' ? row.plan_code : ''
    if (!token || !plan) return { kind: 'none', reason: 'no_such_order' }
    return { kind: 'claimable', claimToken: token, planCode: plan }
  } catch {
    return { kind: 'none', reason: 'lookup_failed' }
  }
}
