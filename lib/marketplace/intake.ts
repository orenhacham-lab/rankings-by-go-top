/**
 * What a VERIFIED marketplace callback does to our data.
 *
 * Split out of the route for the reason lib/creem/webhook-processing.ts is:
 * it can then be driven against a fake admin client with no live Supabase and
 * no live platform, and every outcome — including a failed write — is
 * reported rather than swallowed.
 *
 * THIS MODULE NEVER CHECKS AUTHENTICITY. The route settles that first with
 * lib/marketplace/signature.ts, over the raw body. Everything here assumes
 * the event is genuinely the platform's and only decides what it means.
 *
 * THE FOUR RULES IT EXISTS TO ENFORCE
 *
 *  1. NOTHING IS GRANTED HERE. A paid order becomes a row awaiting its buyer,
 *     never an entitlement: the buyer has no account at this point, and the
 *     entitlement is written by the claim (`claim_marketplace_order`) when
 *     they sign up. A webhook that created accounts would be an externally
 *     triggered account-creation path.
 *
 *  2. THE PLAN IS NEVER TAKEN FROM THE EVENT'S WORDS. The platform names a
 *     product id; the plan comes from OUR OWN configured mapping
 *     (lib/marketplace/config.ts). An unrecognised product grants nothing and
 *     is reported for an operator, never mapped to the nearest plan.
 *
 *  3. THE PERIOD END IS NEVER COMPUTED LOCALLY. It is stored exactly as the
 *     platform reported it, and an order without one cannot be claimed
 *     (the database function refuses it). `+1 month from now` is the bug the
 *     PayPal path already had and fixed.
 *
 *  4. A REDELIVERY IS SAFE. These platforms retry on their own schedules, so
 *     every event is processed as if it were the second copy. Idempotency is
 *     the UNIQUE (provider, external_order_id) constraint rather than a
 *     pre-read: two deliveries racing each other both reach the insert and
 *     exactly one wins, which a read-then-write cannot promise.
 *
 * A REFUND IS NOT PROCESSED AUTOMATICALLY. It is recorded on the order and
 * reported as operator attention, the same way the Creem path treats one: a
 * marketplace decides refunds unilaterally and on its own timetable, and
 * withdrawing a paying customer's entitlement from a webhook — possibly for a
 * partial refund, or one that is later reversed — is not a decision this code
 * should take on its own.
 */

import { randomBytes } from 'crypto'
import { planForMarketplaceProductId, marketplaceClaimUrl } from './config'
import type { PlanCode } from '@/lib/plans/catalog'

// `any` deliberately — the convention this repo uses for anything called with
// BOTH the real Supabase admin client and FakeAdmin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * One platform event, already normalised by that platform's parser. Every
 * field is what the PLATFORM said; nothing here is inferred.
 */
export interface MarketplaceOrderEvent {
  kind: 'paid' | 'refunded' | 'cancelled'
  externalOrderId: string
  externalProductId: string | null
  buyerEmail: string
  /** Minor units, as the platform reported. Never recomputed from our prices. */
  amountMinor: number | null
  /** ISO-4217, upper case. */
  currency: string | null
  /** The ABSOLUTE period end the platform reported, ISO-8601, or null. */
  currentPeriodEnd: string | null
  /**
   * TAX THE PLATFORM SAYS IT ADDED AT CHECKOUT, minor units, or null when the
   * payload carries no tax field at all.
   *
   * It is read, and nothing is done with it, for one reason: it is the only
   * signal in a delivery that tells us which tax flow a sale actually ran
   * through. JVZoo support confirmed in writing on 2026-10-30 that on the
   * own-payment-processor flow — which is ours, PayPal through our own
   * account — JVZoo neither calculates nor remits the tax, and the sales page
   * tells the buyer exactly that ("the prices above ... do not include VAT or
   * any other tax due in your country"). A delivery that arrives carrying tax
   * would mean the flow is not the one described to us, and that published
   * sentence is wrong. So the route reports a non-zero value loudly instead of
   * letting the first such sale pass unnoticed.
   *
   * It is deliberately NOT stored: the column does not exist, the figure is
   * not ours to account for on this flow, and inventing a migration for a
   * number that should always be zero would be the wrong order of work.
   */
  taxMinor: number | null
}

/**
 * A platform's parser: raw body in, normalised event out, null when the body
 * is not an event this code should act on.
 *
 * A parser can only be written from the platform's own documentation — which
 * field carries the order id, how it reports the period end, which
 * notification types mean "paid" — and never from a guess. JVZoo's is below,
 * written from the IPN v2 spec read inside the seller account. ClickBank and
 * Digistore24 have none yet, and a provider with no parser refuses every
 * delivery, exactly as one with no signature scheme does.
 */
export type MarketplaceParser = (rawBody: string, contentType: string | null) => MarketplaceOrderEvent | null

/** Dollars in a form field, as minor units; null when the field is absent or unusable. */
function dollarsToMinor(raw: string | null): number | null {
  const value = raw?.trim()
  if (!value) return null
  const dollars = Number.parseFloat(value)
  return Number.isFinite(dollars) ? Math.round(dollars * 100) : null
}

/**
 * The tax JVZIPN v2 reports on one delivery.
 *
 * `tax_total` is the documented total and is believed when present. The three
 * component fields are summed only as a fallback, because a payload that
 * carries components without a total would otherwise read as no tax at all —
 * the exact case this value exists to catch. Null means the payload named no
 * tax field whatsoever, which is not the same as a reported zero.
 */
function jvzooTaxMinor(form: URLSearchParams): number | null {
  const total = dollarsToMinor(form.get('tax_total'))
  if (total !== null) return total
  const parts = ['vat_tax', 'national_sales_tax', 'international_sales_tax']
    .map((field) => dollarsToMinor(form.get(field)))
    .filter((minor): minor is number => minor !== null)
  return parts.length ? parts.reduce((sum, minor) => sum + minor, 0) : null
}

/**
 * JVZoo's timestamps, turned into the ISO-8601 instant this module stores.
 *
 * JVZIPN v2 sends `2024-04-06 14:30:00` and documents no timezone. Reading it
 * as UTC is an assumption and is written down as one: the cost of being wrong
 * is a period end a few hours out, while refusing the field outright would
 * make every recurring order unclaimable, since the claim function requires a
 * period end. Anything that is not one of the two documented shapes returns
 * null rather than a guess.
 */
function jvzooInstant(raw: string | null): string | null {
  const value = raw?.trim()
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return `${value.replace(' ', 'T')}Z`
  return null
}

/**
 * JVZoo JVZIPN v2 — docs/affiliate/jvzoo-webhook-docs.md, copied from the
 * seller account on 2026-10-29.
 *
 * The body is form-encoded, not JSON. Three transaction types matter:
 * `SALE` is a first purchase, `BILL` a rebill of a subscription, and `RFND`
 * covers refunds AND chargebacks unless the per-product "send DISPUTE and
 * ALERT instead" toggle is on, which it is not.
 *
 * A rebill gets its own order id (`transaction_id` gains `-B001`, `-B002`, …),
 * which is what makes the UNIQUE (provider, external_order_id) idempotency
 * correct for a subscription: the second month is a new order rather than a
 * redelivery of the first.
 *
 * `total` is in DOLLARS in v2, where v1 used pennies, so it is multiplied
 * here and never read as minor units. No currency field exists in the
 * documented payload, so the currency stays null rather than being assumed
 * to be USD.
 */
export const parseJvzooIpnV2: MarketplaceParser = (rawBody) => {
  const form = new URLSearchParams(rawBody)
  const type = (form.get('transaction_type') ?? '').trim().toUpperCase()
  const kind = type === 'SALE' || type === 'BILL' ? 'paid' : type === 'RFND' ? 'refunded' : null
  if (!kind) return null

  return {
    kind,
    externalOrderId: (form.get('transaction_id') ?? '').trim(),
    externalProductId: (form.get('product_id') ?? '').trim() || null,
    buyerEmail: (form.get('customer_email') ?? '').trim(),
    amountMinor: dollarsToMinor(form.get('total')),
    currency: null,
    taxMinor: jvzooTaxMinor(form),
    // A subscription's period runs to its next payment; `end_date` is only
    // set when the subscription has a fixed end, and is empty open-ended.
    currentPeriodEnd: jvzooInstant(form.get('next_payment_date')) ?? jvzooInstant(form.get('end_date')),
  }
}

export const MARKETPLACE_PARSERS: Readonly<Record<string, MarketplaceParser>> = {
  jvzoo: parseJvzooIpnV2,
}

export function marketplaceParser(slug: string): MarketplaceParser | null {
  return MARKETPLACE_PARSERS[slug] ?? null
}

export type MarketplaceIntakeOutcome =
  /** The event is structurally unusable — no order id, no usable email. */
  | { kind: 'invalid_event'; why: string }
  /** The product is not one we sell. Nothing written; a person must look. */
  | { kind: 'unknown_product'; externalProductId: string | null }
  /** Recorded, and here is the link the buyer claims it with. */
  | { kind: 'recorded'; orderId: string; plan: PlanCode; claimUrl: string }
  /** A redelivery of an order already on file. Nothing changed. */
  | { kind: 'already_recorded'; externalOrderId: string }
  /** A refund or cancellation, recorded. A person decides what it means for
   *  an entitlement already granted. */
  | { kind: 'operator_attention'; why: string; externalOrderId: string }
  /** The order a refund refers to was never recorded. Reported, not invented. */
  | { kind: 'order_unknown'; externalOrderId: string }
  | { kind: 'write_failed'; message: string }

/** Postgres unique-violation: the row is already there, which is the answer. */
const UNIQUE_VIOLATION = '23505'

const TABLE = 'marketplace_orders'

/** Lower-cased and shape-checked, matching the database's own CHECK. */
function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase()
  if (!email || email.length > 320) return null
  // Deliberately permissive: this is not an address validator, it only
  // refuses something that cannot be an address at all.
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email) ? email : null
}

/** 43 url-safe characters — unguessable, and inside the column's 32..128. */
function newClaimToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Record one verified event.
 *
 * `provider` must already be a registered, enabled slug: the route settles
 * that before calling, and this function does not re-decide it.
 */
export async function recordMarketplaceOrder(
  admin: Admin,
  provider: string,
  event: MarketplaceOrderEvent,
): Promise<MarketplaceIntakeOutcome> {
  const externalOrderId = event.externalOrderId?.trim()
  if (!externalOrderId) return { kind: 'invalid_event', why: 'missing_external_order_id' }

  if (event.kind === 'refunded' || event.kind === 'cancelled') {
    let error: { message?: string } | null = null
    let data: unknown
    try {
      const res = await admin
        .from(TABLE)
        .update({ status: event.kind })
        .eq('provider', provider)
        .eq('external_order_id', externalOrderId)
        .select('id')
      data = res.data
      error = res.error ?? null
    } catch (err) {
      return { kind: 'write_failed', message: err instanceof Error ? err.message.slice(0, 120) : 'update_threw' }
    }
    if (error) return { kind: 'write_failed', message: (error.message || 'update_failed').slice(0, 120) }
    const rows = (data ?? []) as unknown[]
    if (!rows.length) return { kind: 'order_unknown', externalOrderId }
    return {
      kind: 'operator_attention',
      why: event.kind === 'refunded' ? 'refunded_on_platform' : 'cancelled_on_platform',
      externalOrderId,
    }
  }

  const email = normalizeEmail(event.buyerEmail)
  if (!email) return { kind: 'invalid_event', why: 'missing_buyer_email' }

  const plan = planForMarketplaceProductId(provider, event.externalProductId)
  if (!plan) return { kind: 'unknown_product', externalProductId: event.externalProductId ?? null }

  const claimToken = newClaimToken()
  let inserted: { id?: unknown }[] | null = null
  let error: { message?: string; code?: string } | null = null
  try {
    const res = await admin
      .from(TABLE)
      .insert({
        provider,
        external_order_id: externalOrderId,
        external_product_id: event.externalProductId ?? null,
        plan_code: plan,
        buyer_email: email,
        claim_token: claimToken,
        amount_minor: Number.isInteger(event.amountMinor) ? event.amountMinor : null,
        currency: /^[A-Z]{3}$/.test(event.currency ?? '') ? event.currency : null,
        current_period_end: event.currentPeriodEnd ?? null,
      })
      .select('id')
    inserted = (res.data ?? null) as { id?: unknown }[] | null
    error = res.error ?? null
  } catch (err) {
    return { kind: 'write_failed', message: err instanceof Error ? err.message.slice(0, 120) : 'insert_threw' }
  }

  // The retry's answer. Not an error: the first delivery already recorded it,
  // with its own claim token, and that token is the one the buyer has.
  if (error?.code === UNIQUE_VIOLATION) return { kind: 'already_recorded', externalOrderId }
  if (error) return { kind: 'write_failed', message: (error.message || 'insert_failed').slice(0, 120) }

  const orderId = typeof inserted?.[0]?.id === 'string' ? (inserted[0].id as string) : ''
  if (!orderId) return { kind: 'write_failed', message: 'insert_returned_no_id' }

  return { kind: 'recorded', orderId, plan, claimUrl: marketplaceClaimUrl(claimToken) }
}

/**
 * What the platform should be answered with.
 *
 * 2xx is reserved for an event that was processed or that we deliberately did
 * nothing about, because every one of these platforms retries a non-2xx. A
 * failed write answers 500 so the retry has a chance to recover it; an
 * unknown product answers 200, because retrying will not teach us what that
 * product is — a person has to map it.
 */
export function httpStatusForMarketplaceOutcome(outcome: MarketplaceIntakeOutcome): number {
  switch (outcome.kind) {
    case 'write_failed':
      return 500
    case 'invalid_event':
      return 400
    default:
      return 200
  }
}
