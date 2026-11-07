/**
 * The external marketplaces this application knows about, and the OFF SWITCH
 * each one has.
 *
 * A marketplace here is a platform that is the SELLER OF RECORD: the buyer
 * pays the platform, on the platform's own page, and the platform tells us
 * about it afterwards. JVZoo, ClickBank and Digistore24 all work that way.
 * That is a different relationship from PayPal and Creem, where the checkout
 * starts inside a session of ours, and it is why the order has to be claimed
 * by the buyer rather than granted on the webhook (supabase/migrations/
 * 20261016160000_marketplace_orders.sql explains the choice).
 *
 * THE REGISTRY IS THE CLOSED WORLD. The database column accepts any short
 * slug on purpose, so that adding a platform is configuration rather than a
 * migration against Production; the list below is therefore the thing that
 * actually decides which slugs exist. A request naming a slug that is not
 * here is refused before anything is read or written.
 *
 * EVERY PLATFORM IS OFF UNTIL THREE THINGS ARE TRUE, and each is deliberately
 * separate, because the common failure is a half-configured provider that
 * takes a real payment and silently drops it:
 *   1. `MARKETPLACE_<SLUG>_ENABLED` is exactly 'true';
 *   2. `MARKETPLACE_<SLUG>_WEBHOOK_SECRET` is set — the webhook's ONLY
 *      authentication, since proxy.ts does not cover /api/*;
 *   3. the platform's signature scheme is KNOWN (see below).
 *
 * WHY `signature: null` STILL EXISTS. Each of these platforms signs its
 * callbacks differently, and this repo's rule is that nothing goes in as a
 * guess: a scheme must be read from the platform's own documentation before
 * it is written down here. The cloud sessions this project is developed in
 * cannot reach every vendor's documentation. JVZoo's was read inside the
 * seller account on the owner's own machine (docs/affiliate/jvzoo-webhook-docs.md).
 * Digistore24 publish theirs at a public URL that IS reachable from a cloud
 * session, so it was fetched directly and verified against their own worked
 * example (docs/affiliate/digistore24-ipn-docs.md); the earlier note here
 * that the proxy refuses digistore24.com was wrong. ClickBank's is still
 * UNKNOWN rather than invented. A
 * provider whose scheme is null can be registered, priced and given a sales
 * page, and its webhook refuses every delivery — which is the safe direction,
 * and a loud one: `providerReadiness` names exactly what is missing.
 *
 * PURE apart from reading process.env on each call, so a changed value takes
 * effect on the next request rather than needing a restart.
 */

import type { PlanCode } from '@/lib/plans/catalog'
import { PLAN_CODES } from '@/lib/plans/catalog'

/**
 * How a platform signs its callbacks, once that has been read from its own
 * documentation.
 *
 * Four shapes, because the platforms genuinely differ. The HMAC-over-the-raw-
 * body-in-a-header shape is what Creem and most modern APIs do. JVZoo does
 * something older: a plain digest of five named FORM FIELDS with the secret
 * appended, delivered in the body itself. Digistore24 digests every parameter
 * of the body in sorted order. And ClickBank signs nothing at all: it
 * ENCRYPTS the whole notification, so decrypting it is what proves who sent
 * it. A single interface could not describe them without a pile of nullable
 * fields, so this is a union and the verifier branches on `kind`.
 */
export interface MarketplaceHmacHeaderScheme {
  kind: 'hmac_header'
  /** Lower-case, as Headers.get expects. */
  header: string
  algorithm: 'sha256' | 'sha512'
  /** Whether the digest arrives as lower-case hex or as base64. */
  encoding: 'hex' | 'base64'
}

/**
 * A digest over named fields of a form-encoded body, with the shared secret
 * appended rather than used as an HMAC key, and the result truncated.
 *
 * This is weaker than an HMAC and we do not get to choose: it is what the
 * platform computes, and verifying it the platform's way is the only thing
 * that distinguishes a real delivery from a forged one. The truncation is the
 * reason `MARKETPLACE_<SLUG>_ENABLED` and the claim step still matter — a
 * recorded order grants nothing by itself.
 */
export interface MarketplaceFieldDigestScheme {
  kind: 'field_digest'
  /** The form field carrying the digest. */
  field: string
  /** The fields that are concatenated, in this exact order. */
  fields: readonly string[]
  separator: string
  /** Whether a separator also follows the LAST field, before the secret. */
  trailingSeparator: boolean
  algorithm: 'sha1'
  /** How many leading hex characters are compared, upper-cased. */
  length: number
}

/**
 * A digest over EVERY parameter the body carries, not a named few.
 *
 * Digistore24's scheme. The parameters are sorted by name, each one is
 * rendered as `name=value` with the passphrase appended, the lot is hashed,
 * and the result arrives upper-cased in a field of the body itself. Because
 * the signed set is "whatever was sent", a scheme of this kind covers fields
 * this code has never heard of, which is the opposite trade-off from
 * `field_digest`: nothing can be appended to a signed body unnoticed, but the
 * verifier has to reproduce the sender's own parameter handling exactly.
 *
 * See docs/affiliate/digistore24-ipn-docs.md, which records the algorithm,
 * the PHP semantics it depends on, and the published digest it was checked
 * against.
 */
export interface MarketplaceSortedParamsDigestScheme {
  kind: 'sorted_params_digest'
  /** The form field carrying the digest. */
  field: string
  /** Fields excluded from the digest, the digest field itself included. */
  excluded: readonly string[]
  algorithm: 'sha512'
  /** Whether names sort by raw bytes or case-insensitively. */
  caseSensitiveSort: boolean
}

/**
 * A SCHEME WHERE THERE IS NO SIGNATURE AT ALL, AND DECRYPTION IS THE PROOF.
 *
 * ClickBank's Instant Notification Service does not sign its deliveries: it
 * encrypts the whole notification with the vendor's own secret key and posts
 * an envelope carrying the ciphertext and the initialization vector, both
 * base64. Their own page says what that buys — it "allows the receiver of the
 * notification to know that the message originated from ClickBank and was not
 * altered during delivery" — and their PHP sample draws the conclusion this
 * type is built on: "If the decoding of the JSON string wasn't successful,
 * then you can assume the notification wasn't encrypted with your secret
 * key."
 *
 * So authentication here is: decrypt with our key, and require the plaintext
 * to be JSON. Nothing else in the body can be trusted before that succeeds,
 * and a body that decrypts to bytes which are not JSON is a forgery, not a
 * malformed friend.
 *
 * THE KEY IS NOT THE SECRET. It is the first 32 characters of the HEX
 * rendering of SHA-1 over the secret, used as 32 ASCII bytes — an AES-256
 * key. All four of ClickBank's samples (Java, PHP, Python, Ruby) agree on it.
 * Taking the first 16 bytes of the raw digest instead decrypts nothing, which
 * is the trap this comment exists to name.
 *
 * See docs/affiliate/clickbank-ins-docs.md for the quoted algorithm, the
 * samples it was read from, and the fields of the decrypted body.
 */
export interface MarketplaceEncryptedEnvelopeScheme {
  kind: 'encrypted_envelope'
  /** The JSON field carrying the base64 ciphertext. */
  ciphertextField: string
  /** The JSON field carrying the base64 initialization vector. */
  ivField: string
  /** Node's cipher name. */
  algorithm: 'aes-256-cbc'
  /** The digest whose HEX rendering is truncated to form the key. */
  keyDigest: 'sha1'
  /** How many hex characters of that digest become the key. */
  keyLength: 32
}

export type MarketplaceSignatureScheme =
  | MarketplaceHmacHeaderScheme
  | MarketplaceFieldDigestScheme
  | MarketplaceSortedParamsDigestScheme
  | MarketplaceEncryptedEnvelopeScheme

/**
 * Digistore24 IPN, from their own published guide and reference
 * implementation (docs/affiliate/digistore24-ipn-docs.md), both fetched from
 * public URLs on 2026-11-02.
 *
 * `excluded` holds both spellings the reference implementation unsets, not
 * just the one it documents: it removes `sha_sign` AND `SHASIGN`, so a body
 * carrying the upper-case spelling must have it excluded too or our digest
 * would cover a field theirs did not.
 *
 * The sort is case-sensitive because the 2026 reference implementation sorts
 * that way by default, even though the 2018 guide's prose says otherwise.
 * Every documented parameter name is lower-case, so the two cannot disagree
 * on real traffic; where they could, the newer code wins.
 *
 * The secret is the SHA512 passphrase from Settings → IPN, which the vendor
 * chooses, held as MARKETPLACE_DIGISTORE24_WEBHOOK_SECRET. It is NOT the
 * thank-you page key, whatever the public example script suggests.
 */
export const DIGISTORE24_IPN_SCHEME: MarketplaceSortedParamsDigestScheme = {
  kind: 'sorted_params_digest',
  field: 'sha_sign',
  excluded: ['sha_sign', 'SHASIGN'],
  algorithm: 'sha512',
  caseSensitiveSort: true,
}

/**
 * JVZoo's JVZIPN v2 `cverify`, from the spec in the seller account
 * (docs/affiliate/jvzoo-webhook-docs.md, captured 2026-10-29):
 *
 *   SHA-1( paykey|customer_email|product_name|transaction_type|date|<SECRET> )
 *   → first 8 hex characters, upper-cased.
 *
 * The secret is the account-level key from My Account → Seller Settings, held
 * here as MARKETPLACE_JVZOO_WEBHOOK_SECRET. `date` is compared exactly as
 * received and must never be reformatted.
 */
export const JVZOO_IPN_V2_SCHEME: MarketplaceFieldDigestScheme = {
  kind: 'field_digest',
  field: 'cverify',
  fields: ['paykey', 'customer_email', 'product_name', 'transaction_type', 'date'],
  separator: '|',
  trailingSeparator: true,
  algorithm: 'sha1',
  length: 8,
}

/**
 * ClickBank INS version 8.0, from ClickBank's own support page
 * (docs/affiliate/clickbank-ins-docs.md, fetched 2026-11-07).
 *
 * The secret is the Secret Key the vendor chooses in the account's Advanced
 * Tools, up to 16 characters, held here as
 * MARKETPLACE_CLICKBANK_WEBHOOK_SECRET.
 */
export const CLICKBANK_INS_SCHEME: MarketplaceEncryptedEnvelopeScheme = {
  kind: 'encrypted_envelope',
  ciphertextField: 'notification',
  ivField: 'iv',
  algorithm: 'aes-256-cbc',
  keyDigest: 'sha1',
  keyLength: 32,
}

export interface MarketplaceProvider {
  /** The value stored in marketplace_orders.provider. */
  slug: string
  /** For an operator screen and the sales page's own copy. */
  label: string
  /** null until the platform's documented scheme has been verified. */
  signature: MarketplaceSignatureScheme | null
  /**
   * Whether the platform is the SELLER OF RECORD for the buyer's purchase —
   * the party that contracts with the buyer, issues the invoice and owes the
   * tax on the sale.
   *
   * This is not a presentational flag. It decides which of two legally
   * different sentences the sales page prints about who the buyer is buying
   * from, and printing the wrong one is a misrepresentation on our own
   * domain. It is therefore set from the platform's own vendor agreement and
   * nothing else; see the note above MARKETPLACE_PROVIDERS for the clause
   * each value was read from.
   */
  sellerOfRecord: boolean
  /**
   * Wording the platform requires on the sales page, once the legal thread
   * has passed it.
   *
   * null is not a placeholder here, it is a refusal to publish. Text a
   * platform dictates becomes OUR published statement on our own domain, and
   * at least one of these platforms mandates an income disclaimer and a line
   * about Facebook. Nothing goes in this field until legal has read the exact
   * words, and a provider with none renders no disclaimer rather than an
   * approximation of one.
   */
  requiredDisclaimer: string | null
  /**
   * What this platform accepts as "I handled it".
   *
   * 'json' is the default shape: a 2xx with a JSON body, which every platform
   * here reads as success except one.
   *
   * 'ok_text' exists because Digistore24 does not read the status code. Their
   * guide is explicit: "An IPN call is considered a success, if the DigiStore
   * server receives the text 'OK' (upper case, without the quotes) from your
   * server." A 200 carrying JSON is logged as a FAILED delivery in their IPN
   * log even though the order was recorded, and their "Test connection"
   * button reports the integration broken. So the acknowledgement body is a
   * property of the platform, not of our preferred response format.
   *
   * It changes only the body of a response we already decided to send. A
   * refused signature still answers 401 and still carries no 'OK', because a
   * delivery we did not accept must never read as handled.
   */
  acknowledgement: 'json' | 'ok_text'
}

/**
 * The three platforms Oren named. Each is present so that its configuration,
 * its sales page and its database rows are testable today; none can accept a
 * delivery while its `signature` is null, and JVZoo — the one that now has a
 * scheme — still needs its env switch and its secret before anything reaches
 * it.
 */
/*
 * JVZoo IS NOT A RESELLER, AND THAT IS A LEGAL DIFFERENCE, NOT A DETAIL. This
 * was recorded here as a reading of its terms before anyone could reach the
 * account; it has since been READ FROM THE SIGNED AGREEMENT ITSELF
 * (https://www.jvzoo.com/vendoragreement, effective 03-28-2020), and the
 * agreement settles it three times over:
 *
 *   s.11 Taxes and Related Charges - "You are solely responsible for ensuring
 *        the collection and payment of any and all applicable state, local, or
 *        other taxes or related charges arising from any customer purchasing
 *        Your products or services. You agree to indemnify Us from any
 *        liability connected with the same."
 *   s.7  JVZoo takes "a commission fee of 5% of the gross selling price" - the
 *        fee of a network, not the margin of a reseller.
 *   s.9  the buyer "remits full payment for the product or service ordered
 *        from You" - the order is placed with us.
 *
 * So the contract runs buyer-to-us, the invoice is ours, and the EU VAT and
 * the 14-day withdrawal right come back to us. That is exactly what a
 * merchant of record (Creem, Digistore24) exists to absorb.
 *
 * NOTE THE CONTRADICTION, because it is a trap: the disclaimer JVZoo's own
 * compliance review REQUIRES on the sales page says "JVZoo serves as the
 * retailer for the products featured on this site". That sentence cannot be
 * reconciled with s.11 of the agreement we signed. We publish their mandated
 * wording because they mandate it, and we state who the seller actually is in
 * our own voice, in full size, directly above it - we do not let their
 * boilerplate be the page's answer to "who am I buying from".
 *
 * ClickBank and Digistore24 are resellers and carry neither problem.
 */
export const MARKETPLACE_PROVIDERS: readonly MarketplaceProvider[] = [
  {
    slug: 'digistore24',
    label: 'Digistore24',
    /*
     * Their IPN scheme, verified against the digest Digistore24 publish in
     * their own guide rather than taken on trust from this code agreeing with
     * itself. See DIGISTORE24_IPN_SCHEME above.
     */
    signature: DIGISTORE24_IPN_SCHEME,
    sellerOfRecord: true,
    requiredDisclaimer: null,
    /* Their guide: only the literal text OK counts as a handled delivery. */
    acknowledgement: 'ok_text',
  },
  {
    slug: 'clickbank',
    label: 'ClickBank',
    /*
     * Not a signature: their INS encrypts the whole body and decryption with
     * our own secret key is what proves the delivery came from ClickBank. See
     * CLICKBANK_INS_SCHEME above and docs/affiliate/clickbank-ins-docs.md.
     */
    signature: CLICKBANK_INS_SCHEME,
    sellerOfRecord: true,
    requiredDisclaimer: null,
    /*
     * Their page asks for nothing but a 2xx within three seconds, and they
     * DO retry: once every four hours, five attempts, then the notification
     * is gone for good. The literal-text acknowledgement is Digistore24's
     * requirement alone.
     */
    acknowledgement: 'json',
  },
  {
    slug: 'jvzoo',
    label: 'JVZoo',
    /*
     * JVZIPN v2, read inside the seller account and written down in
     * docs/affiliate/jvzoo-webhook-docs.md. It is NOT the shape the original
     * `MarketplaceSignatureScheme` described: not an HMAC over the raw body in
     * a header, but the first 8 characters, upper-cased, of SHA-1 over five
     * NAMED FORM FIELDS joined by pipes with the account secret appended,
     * arriving in the `cverify` field of the form body itself. That is why the
     * type is a union and the verifier branches on `kind`; see
     * JVZOO_IPN_V2_SCHEME above.
     */
    signature: JVZOO_IPN_V2_SCHEME,
    sellerOfRecord: false,
    /*
     * The exact words JVZoo compliance requires, copied character for
     * character from the review notes on products 457483 / 457573 / 457575 /
     * 457579 (review date 10/14/2026, issue 1 "Required JVZoo Disclaimer
     * Missing"). Approved for publication by the owner.
     *
     * It is their text and not ours, so it is not edited, trimmed or
     * paraphrased - a page that prints an approximation of a mandated
     * disclaimer fails the review and has published a statement nobody
     * authored. The income sentence reads oddly on a page that makes no
     * income claim, which is the point of it: it denies a promise rather than
     * implying one.
     */
    requiredDisclaimer:
      'Disclaimer: Please note that this product does not provide any guarantee of income ' +
      'or success. The results achieved by the product owner or any other individuals ' +
      'mentioned are not indicative of future success or earnings. This website is not ' +
      'affiliated with FaceBook or any of its associated entities. Once you navigate away ' +
      'from FaceBook, the responsibility for the content and its usage lies solely with the ' +
      'user. All content on this website, including but not limited to text, images, and ' +
      'multimedia, is protected by copyright law and the Digital Millennium Copyright Act. ' +
      'Unauthorized copying, duplication, modification, or theft, whether intentional or ' +
      'unintentional, is strictly prohibited. Violators will be prosecuted to the fullest ' +
      'extent of the law. We want to clarify that JVZoo serves as the retailer for the ' +
      'products featured on this site. JVZoo\u00ae is a registered trademark of BBC Systems ' +
      'Inc., a Florida corporation located at 1809 E. Broadway Street, Suite 125, Oviedo, FL ' +
      '32765, USA, and is used with permission. The role of JVZoo as a retailer does not ' +
      'constitute an endorsement, approval, or review of these products or any claims, ' +
      'statements, or opinions used in their promotion.',
    acknowledgement: 'json',
  },
] as const

/** The registered provider, or null for anything else. Never throws. */
export function marketplaceProvider(slug: string | null | undefined): MarketplaceProvider | null {
  const wanted = slug?.trim().toLowerCase()
  if (!wanted) return null
  return MARKETPLACE_PROVIDERS.find((p) => p.slug === wanted) ?? null
}

/** The env-var prefix for one provider, e.g. MARKETPLACE_DIGISTORE24_. */
function envPrefix(slug: string): string {
  return `MARKETPLACE_${slug.toUpperCase()}_`
}

/** The off switch. Anything but the exact string 'true' means off. */
export function isMarketplaceProviderEnabled(slug: string): boolean {
  if (!marketplaceProvider(slug)) return false
  return process.env[`${envPrefix(slug)}ENABLED`] === 'true'
}

/** The webhook signing secret, or null. Never logged, never returned. */
export function marketplaceWebhookSecret(slug: string): string | null {
  if (!marketplaceProvider(slug)) return null
  return process.env[`${envPrefix(slug)}WEBHOOK_SECRET`]?.trim() || null
}

/**
 * Which plan one of the platform's product ids buys — the direction a
 * callback needs. Configured per provider and per plan, as
 * `MARKETPLACE_<SLUG>_PRODUCT_<PLAN>`; an unconfigured plan has no id, and an
 * unrecognised id buys NOTHING. Never the nearest plan: granting the wrong
 * plan is worse than granting none, because nobody reports an upgrade.
 */
export function marketplaceProductIds(slug: string): Record<PlanCode, string | null> {
  const products = {} as Record<PlanCode, string | null>
  const prefix = envPrefix(slug)
  for (const code of PLAN_CODES) {
    products[code] = process.env[`${prefix}PRODUCT_${code.toUpperCase()}`]?.trim() || null
  }
  return products
}

/** The plan a product id belongs to, or null. */
export function planForMarketplaceProductId(
  slug: string,
  productId: string | null | undefined,
): PlanCode | null {
  const id = productId?.trim()
  if (!id) return null
  const products = marketplaceProductIds(slug)
  for (const code of PLAN_CODES) {
    if (products[code] && products[code] === id) return code
  }
  return null
}

export type MarketplaceMissingPiece =
  | 'unregistered_provider'
  | 'disabled'
  | 'webhook_secret'
  | 'signature_scheme'
  | 'product_ids'

export interface MarketplaceReadiness {
  /** True only when NOTHING is missing. */
  ready: boolean
  /** What is missing, by name — never a secret's value. */
  missing: MarketplaceMissingPiece[]
}

/**
 * Whether a provider may process a delivery, and if not, what is missing. A
 * route that gets `ready: false` refuses the delivery; it never processes it
 * partially.
 */
export function providerReadiness(slug: string): MarketplaceReadiness {
  const provider = marketplaceProvider(slug)
  if (!provider) return { ready: false, missing: ['unregistered_provider'] }
  const missing: MarketplaceMissingPiece[] = []
  if (!isMarketplaceProviderEnabled(slug)) missing.push('disabled')
  if (!marketplaceWebhookSecret(slug)) missing.push('webhook_secret')
  if (!provider.signature) missing.push('signature_scheme')
  const products = marketplaceProductIds(slug)
  if (!PLAN_CODES.some((code) => products[code])) missing.push('product_ids')
  return { ready: missing.length === 0, missing }
}

/**
 * Where a buyer is sent to claim what they just paid for.
 *
 * Built from OUR OWN canonical origin and a fixed path, never from a request
 * header or a query parameter — this URL is handed to a platform to redirect
 * a payer to, and a redirect target taken from a request is a redirect
 * somebody else chooses (CLAUDE.md: never allow an external `next` URL).
 */
const CANONICAL_ORIGIN = 'https://www.gotopseo.com'

export const MARKETPLACE_CLAIM_PATH = '/claim'

export function marketplaceClaimUrl(claimToken: string): string {
  return `${CANONICAL_ORIGIN}${MARKETPLACE_CLAIM_PATH}?order=${encodeURIComponent(claimToken)}`
}

/** Only an absolute https URL is ever rendered. Anything else is treated as
 *  unset: a configured value that is not a URL must not become an href or a
 *  script src just because somebody typed it into an env var. */
function httpsUrlOrNull(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value || !/^https:\/\/[^\s"'<>]+$/.test(value)) return null
  return value
}

/**
 * The platform's own buy button for one plan, as configured in
 * `MARKETPLACE_<SLUG>_BUY_URL_<PLAN>`.
 *
 * These platforms require that their button is the ONLY way to pay on the
 * page they review, so the sales page renders this link or nothing. A plan
 * with no configured URL is shown as unavailable; it is never quietly
 * replaced by our own checkout, which is exactly what a compliance review
 * refuses — and what would take the sale away from the affiliate who sent
 * the visitor.
 *
 * GATED ON `providerReadiness`, AND THAT IS THE POINT OF THIS FUNCTION.
 * Configuring the buy URLs is one environment variable away from configuring
 * the webhook, and the two used to be independent: setting
 * `MARKETPLACE_<SLUG>_BUY_URL_*` alone put a live, payable button on a public
 * page while the callback that records the purchase was still refusing every
 * delivery for want of a secret, a signature scheme or the product ids. A
 * buyer then pays the platform in full and NOTHING reaches us — not an
 * account, not a plan, not even a receipt to reconcile by hand, because the
 * refusal happens before anything is written. Taking money with no record of
 * it is worse than being unavailable, so the button is shown only when the
 * channel can actually record what it sells.
 */
export function marketplaceBuyUrl(slug: string, plan: PlanCode): string | null {
  if (!marketplaceProvider(slug)) return null
  if (!providerReadiness(slug).ready) return null
  return httpsUrlOrNull(process.env[`${envPrefix(slug)}BUY_URL_${plan.toUpperCase()}`])
}

/**
 * The platform's own terms and return policy, as configured in
 * `MARKETPLACE_<SLUG>_POLICY_URL`.
 *
 * The sales page links THIS and not our own refund policy. Ours says Go Top
 * SEO does not refund, which is true of a purchase made from us; a purchase
 * made from a reseller is governed by the reseller's return policy, and
 * pointing that buyer at ours would point them at the wrong document. An
 * unconfigured provider renders no link rather than a guessed one.
 *
 * The tracking pixel is configured separately, below.
 */
export function marketplacePolicyUrl(slug: string): string | null {
  if (!marketplaceProvider(slug)) return null
  return httpsUrlOrNull(process.env[`${envPrefix(slug)}POLICY_URL`])
}

/**
 * The platform's own 1x1 tracking beacon, as configured in
 * `MARKETPLACE_<SLUG>_PIXEL_URL`.
 *
 * THIS SETTING DID NOT EXIST, AND THE REASON IT DIDN'T IS STILL TRUE. A
 * conversion pixel is a marketing tag by this project's own classification
 * (lib/consent/categories.ts), so it cannot fire before consent; and the sale
 * completes on the platform's checkout, so the affiliate's credit rides the
 * click id in the buy link and the platform's server-side postback. By that
 * reasoning the page needs no pixel.
 *
 * The platform disagrees, and it is the one running the review. JVZoo's
 * compliance refuses the listing without it (issue 3 on products 457483 /
 * 457573 / 457575 / 457579: "Missing JVZoo buy button or tracking pixel").
 * So the beacon is configurable, and rendered ONLY through
 * components/consent/MarketplacePixel.tsx, which shows it when the marketing
 * category has been granted and removes it on withdrawal. A platform with no
 * configured URL renders nothing, which is still the default.
 *
 * It is a URL and not a snippet on purpose: the platform's HTML would be a
 * string from configuration rendered into the document, and this page does not
 * have a way to do that safely. Only an absolute https URL is accepted.
 *
 * ONE BEACON PER PLAN, BECAUSE THE BEACON IDENTIFIES THE PRODUCT. JVZoo's
 * pixel URL carries the product id (`i.jvzoo.com/0/<product>/99`), and the
 * note that demands it says why it matters: a missing or wrong pixel
 * "corrupts the product's stats and is unfair to affiliates". A single
 * provider-wide URL meant every visitor to this page, whichever plan they
 * came for, was counted against ONE product - the first one configured - so
 * three of the four listings would have shown an affiliate no traffic at all
 * while the fourth showed traffic it never received. So the plan's own
 * `MARKETPLACE_<SLUG>_PIXEL_URL_<PLAN>` is read first; the bare
 * `MARKETPLACE_<SLUG>_PIXEL_URL` remains as the provider-wide fallback for a
 * platform whose beacon is not per product, and a plan with neither
 * configured renders nothing.
 */
export function marketplacePixelUrl(slug: string, plan?: PlanCode): string | null {
  if (!marketplaceProvider(slug)) return null
  const prefix = envPrefix(slug)
  const perPlan = plan ? httpsUrlOrNull(process.env[`${prefix}PIXEL_URL_${plan.toUpperCase()}`]) : null
  return perPlan ?? httpsUrlOrNull(process.env[`${prefix}PIXEL_URL`])
}

/**
 * The platform's own TRUST BADGE for the sales page, as configured in
 * `MARKETPLACE_<SLUG>_BADGE_URL`.
 *
 * A CONDITION OF LISTING, LIKE THE PIXEL, AND FOR THE SAME KIND OF REASON.
 * Digistore24's pre-submission checklist ("Checklist Digistore24 Inc. (US)",
 * read in the seller account on 2026-11-02) makes the vendor confirm that
 * "Your sales page trust badge and footer badge are both added to your sales
 * page" before a product may even be submitted for review. The badge is
 * generated per vendor in Conversion tools -> Trust-Badges and delivered as a
 * script URL carrying the badge id and a token.
 *
 * IT IS A SCRIPT, NOT A BEACON, AND THAT IS THE DIFFERENCE THAT MATTERS.
 * `marketplacePixelUrl` points at a 1x1 image; this points at executable
 * JavaScript that loads a second script from the platform and renders a
 * sticky banner into our page. So the URL is held in configuration rather
 * than the snippet being pasted into a component: a URL can be checked
 * (https only, no quotes or angle brackets), and a snippet is third-party
 * HTML rendered into our document from an environment variable, which this
 * file has refused since `requiredDisclaimer` was written.
 *
 * AND IT STORES, so it is gated exactly as the beacon is. The response to
 * `https://www.digistore24.com/trusted-badge/<id>/<token>/salespage` carries
 * `set-cookie: ds_gb_id=<identifier>; Max-Age=604800` - a week-long
 * identifier written to the visitor's device. ePrivacy Art. 5(3) therefore
 * applies on its own terms, the same analysis lib/consent/eprivacy-territory
 * .ts sets out for JVZoo's pixel, and the same territorial split follows: the
 * badge is behind the marketing category where consent is required, and in
 * the document on page load where it is not.
 */
export function marketplaceBadgeUrl(slug: string): string | null {
  if (!marketplaceProvider(slug)) return null
  return httpsUrlOrNull(process.env[`${envPrefix(slug)}BADGE_URL`])
}

/**
 * The platform's own affiliate-signup page for one plan, as configured in
 * `MARKETPLACE_<SLUG>_AFFILIATE_URL_<PLAN>`.
 *
 * WHY THIS EXISTS AT ALL. The JVZoo launch of 2026-11-04 sold nothing, and
 * the reason was not our side: JVZoo hides a new product from its affiliate
 * search until it has ten or more sales, and a search for the product name
 * that day returned "No products matching your search were found". So the
 * first affiliates cannot find us and have to be recruited by hand, and a
 * recruitment page needs the one link that actually starts the relationship
 * — the platform's own "request approval" page for the product.
 *
 * IT IS NOT DERIVED FROM THE PRODUCT ID, although it could be today. The
 * path `jvzoo.com/affiliate/affiliateinfonew/index/<id>` is a shape of their
 * current site, not a documented contract, and building it here would make
 * this file assert a URL the platform never gave us. Configuration says what
 * the platform actually serves, and an unconfigured plan links nothing.
 *
 * Unlike the buy URL this does NOT wait on `providerReadiness`: an affiliate
 * reading the page is being recruited, not charged, and nothing is recorded
 * when they sign up. The readiness gate protects a buyer from paying with no
 * order row; it has nothing to say about a signup on the platform's own site.
 */
export function marketplaceAffiliateUrl(slug: string, plan: PlanCode): string | null {
  if (!marketplaceProvider(slug)) return null
  return httpsUrlOrNull(process.env[`${envPrefix(slug)}AFFILIATE_URL_${plan.toUpperCase()}`])
}

/**
 * What the platform pays an affiliate, as configured in
 * `MARKETPLACE_<SLUG>_COMMISSION_FIRST` and `..._COMMISSION_REBILL`.
 *
 * A NUMBER WE PUBLISH TO AFFILIATES IS A PROMISE, AND THE ACCOUNT OWNS IT.
 * The rate an affiliate is actually paid is set in the platform's seller
 * account, not here, so a rate hard-coded in this repository would keep
 * paying whatever the account says while our page advertised something else.
 * Printing "35%" to someone who is then paid 25% is a misstatement about
 * their earnings made on our own domain. Configuration keeps the two in step
 * by a human act — the same act that changes it in the account — and a
 * provider with neither value set gets NO commission block on the page
 * rather than a guess.
 *
 * `rebill` is optional on its own: a one-off product has no renewal to pay a
 * rate on, and a provider that sets only `first` is a complete answer.
 * Anything that is not a whole 1-100 is treated as unset, because a rate of
 * 0, 140 or "thirty" is a configuration error and silence is the safe
 * reading of one.
 */
export interface MarketplaceCommission {
  first: number
  rebill: number | null
}

export function marketplaceCommission(slug: string): MarketplaceCommission | null {
  if (!marketplaceProvider(slug)) return null
  const prefix = envPrefix(slug)
  const first = percentOrNull(process.env[`${prefix}COMMISSION_FIRST`])
  if (first === null) return null
  return { first, rebill: percentOrNull(process.env[`${prefix}COMMISSION_REBILL`]) }
}

function percentOrNull(raw: string | undefined): number | null {
  const value = raw?.trim()
  if (!value || !/^\d{1,3}$/.test(value)) return null
  const n = Number(value)
  return n >= 1 && n <= 100 ? n : null
}
