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
 * cannot reach jvzoo.com, clickbank.com or digistore24.com (the egress proxy
 * refuses them). JVZoo's was read inside the seller account on the owner's own
 * machine and is recorded below (docs/affiliate/jvzoo-webhook-docs.md);
 * ClickBank's and Digistore24's are still UNKNOWN rather than invented. A
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
 * Two shapes, because the platforms genuinely differ. The HMAC-over-the-raw-
 * body-in-a-header shape is what Creem and most modern APIs do. JVZoo does
 * something older: a plain digest of five named FORM FIELDS with the secret
 * appended, delivered in the body itself. A single interface could not
 * describe both without a pile of nullable fields, so this is a union and the
 * verifier branches on `kind`.
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

export type MarketplaceSignatureScheme = MarketplaceHmacHeaderScheme | MarketplaceFieldDigestScheme

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

export interface MarketplaceProvider {
  /** The value stored in marketplace_orders.provider. */
  slug: string
  /** For an operator screen and the sales page's own copy. */
  label: string
  /** null until the platform's documented scheme has been verified. */
  signature: MarketplaceSignatureScheme | null
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
}

/**
 * The three platforms Oren named. Each is present so that its configuration,
 * its sales page and its database rows are testable today; none can accept a
 * delivery while its `signature` is null, and JVZoo — the one that now has a
 * scheme — still needs its env switch and its secret before anything reaches
 * it.
 */
/*
 * JVZoo IS NOT A RESELLER, AND THAT IS A LEGAL DIFFERENCE, NOT A DETAIL. Its
 * terms leave us the seller with the money arriving through our own PayPal,
 * which brings back the EU VAT registration and the 14-day withdrawal right
 * that selling through a reseller avoids. It stays registered so the row can
 * be configured if the owner decides to accept that, and it stays off until he
 * does. ClickBank and Digistore24 are resellers and carry neither problem.
 */
export const MARKETPLACE_PROVIDERS: readonly MarketplaceProvider[] = [
  { slug: 'digistore24', label: 'Digistore24', signature: null, requiredDisclaimer: null },
  { slug: 'clickbank', label: 'ClickBank', signature: null, requiredDisclaimer: null },
  { slug: 'jvzoo', label: 'JVZoo', signature: JVZOO_IPN_V2_SCHEME, requiredDisclaimer: null },
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
 */
export function marketplaceBuyUrl(slug: string, plan: PlanCode): string | null {
  if (!marketplaceProvider(slug)) return null
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
 * There is deliberately no tracking-pixel setting here. A conversion pixel is
 * a marketing tag by this project's own classification, so it cannot fire
 * before consent, and it is not needed: the sale completes on the platform's
 * checkout, so the affiliate's credit rides the click id in the buy link and
 * the platform's server-side postback.
 */
export function marketplacePolicyUrl(slug: string): string | null {
  if (!marketplaceProvider(slug)) return null
  return httpsUrlOrNull(process.env[`${envPrefix(slug)}POLICY_URL`])
}
