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
}

/**
 * A platform's parser: raw body in, normalised event out, null when the body
 * is not an event this code should act on.
 *
 * EMPTY ON PURPOSE. A parser can only be written from the platform's own
 * documentation — which field carries the order id, how it reports the period
 * end, which notification types mean "paid". The cloud sessions this project
 * is developed in cannot reach those platforms' sites, so no parser is
 * guessed at here; a provider with no parser refuses every delivery, exactly
 * as one with no signature scheme does.
 */
export type MarketplaceParser = (rawBody: string, contentType: string | null) => MarketplaceOrderEvent | null

export const MARKETPLACE_PARSERS: Readonly<Record<string, MarketplaceParser>> = {}

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
