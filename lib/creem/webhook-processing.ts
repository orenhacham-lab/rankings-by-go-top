/**
 * What a VERIFIED Creem webhook event does to our data.
 *
 * Split out of the route for the same reason lib/paypal/webhook-processing.ts
 * is: it can then be driven against a fake admin client with no live
 * Supabase and no live Creem, and every outcome — including a failed write —
 * is reported rather than swallowed.
 *
 * THIS FUNCTION NEVER CHECKS AUTHENTICITY. The route settles that first with
 * lib/creem/signature.ts, over the raw body. Everything here assumes the
 * event is genuinely Creem's and only decides what it should mean.
 *
 * THE THREE RULES IT EXISTS TO ENFORCE
 *
 *  1. THE PLAN IS NEVER TAKEN FROM THE EVENT BODY. A `checkout.completed`
 *     event names a product, but the entitlement is granted from a
 *     server-side read of the subscription (deps.fetchSubscription →
 *     lib/creem/client.ts), and the plan is resolved from OUR OWN configured
 *     product ids (lib/creem/checkout-products.ts). An unrecognised product
 *     is refused, never mapped to the nearest plan — granting the wrong plan
 *     is worse than granting none, because nobody notices an upgrade.
 *
 *  2. THE PERIOD END IS NEVER COMPUTED LOCALLY. It is always the absolute
 *     date Creem reports. `+1 month from whatever was stored` is the bug the
 *     PayPal path already had and fixed: replaying one delivery extended the
 *     customer's period every time.
 *
 *  3. A RETRY MUST BE SAFE. Creem redelivers on its own schedule (initial,
 *     +30s, +5m, +30m, +6h, then nothing after 24h), so every event here is
 *     processed as if it were the second copy. Activation is idempotent on
 *     the subscription id; a renewal that would not move the period forward
 *     is a reported no-op, and the write that does move it is conditional on
 *     the exact value this handler read, so two interleaved deliveries can
 *     never skip a period boundary between them.
 *
 * SANDBOX MODE CANNOT REACH A REAL ACCOUNT. This project's Vercel preview
 * shares the production database, so a sandbox webhook landing on a preview
 * deployment writes into real data. In test mode, therefore, nothing here
 * writes to any account but the ones configured in CREEM_TEST_ACCOUNT_IDS,
 * and an empty list refuses everything (lib/creem/config.ts). The guard is a
 * restriction only — it is inert in live mode and can never grant anything.
 *
 * WHAT A `request_id` IS AND IS NOT. We set it when we create the checkout
 * (the account id) and Creem echoes it back. It is a LOOKUP KEY — it says
 * which account this payment was started for, and nothing else. It is not a
 * credential and not an authorisation: the plan, the status and the period
 * all come from the server-side read, and the account must already exist.
 */

import { effectForCreemEvent, type EntitlementStatus } from './events'
import { planForCreemProductId } from './checkout-products'
import { creemMayWriteToAccount } from './config'
import { normalizeInstant, parseInstantMs } from '@/lib/paypal/timestamp'
import { transitionSubscriptionToActivePlan } from '@/lib/billing/entitlement-write'
import type { CreemFailure, CreemResult, CreemSubscriptionSnapshot } from './client'
import type { PlanCode } from '@/lib/plans/catalog'

// `any` deliberately, the convention this repo already uses for anything
// called with BOTH the real Supabase admin client and FakeAdmin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** The envelope Creem posts. `eventType` is its own spelling; snake_case is
 *  accepted too rather than depending on which one a given version sends. */
export interface CreemWebhookEvent {
  id?: string
  eventType?: string
  event_type?: string
  object?: Record<string, unknown>
}

/** Creem statuses that mean "this subscription is live and should be
 *  granted". A checkout whose subscription is in any other state grants
 *  nothing — `incomplete` and `unpaid` especially, which is a checkout that
 *  was opened but never paid. */
const GRANTABLE_STATUSES = new Set(['active', 'trialing', 'paid'])

export type CreemWebhookOutcome =
  /** No event type, or no object — nothing identifiable to act on. */
  | { kind: 'ignored_malformed_event' }
  /** Not an event type Creem documents. Never acted on (lib/creem/events.ts). */
  | { kind: 'ignored_unknown_event_type'; eventType: string }
  /** A documented event that genuinely changes no entitlement. */
  | { kind: 'ignored_no_effect'; eventType: string; why: string }
  /** Nothing to write, but a human must see it (a refund, a dispute). */
  | { kind: 'operator_attention'; eventType: string; why: string }
  /** A subscription event carrying no subscription id — structurally
   *  anomalous for Creem's own schema, so it is reported, not shrugged off. */
  | { kind: 'unmappable_subscription_reference'; eventType: string }
  | { kind: 'lookup_failed'; message: string }
  /** A genuine event about a subscription that is not ours (another
   *  environment's, or one whose row was deleted). Never creates a row. */
  | { kind: 'ignored_unknown_subscription'; creemSubscriptionId: string }
  | { kind: 'processed'; eventType: string }
  | { kind: 'update_failed'; eventType: string; message: string }
  /** Sandbox mode, and the account this event would write to is not one of
   *  the configured test accounts. Nothing is read further and nothing is
   *  written. See lib/creem/config.ts::creemMayWriteToAccount — the preview
   *  shares the production database, so a test event must not be able to
   *  reach a real customer's entitlement. */
  | { kind: 'refused_outside_test_accounts'; accountId: string | null }
  /** Creem could not be read back, so nothing was granted. Retryable. */
  | { kind: 'activation_unverifiable'; reason: CreemFailure }
  /** Creem answered, and its answer does not support granting a plan. */
  | { kind: 'activation_refused'; reason: ActivationRefusal }
  | { kind: 'activation_write_failed'; message: string }
  /** The subscription id is already on a row — a redelivered checkout. */
  | { kind: 'activation_already_applied'; creemSubscriptionId: string }
  | { kind: 'activated'; creemSubscriptionId: string; plan: PlanCode }
  /** The period could not be advanced, and was therefore left alone. */
  | { kind: 'renewal_date_unavailable'; eventType: string; reason: string }
  | { kind: 'renewal_duplicate'; eventType: string; periodEnd: string }
  | { kind: 'renewal_stale'; eventType: string; storedPeriodEnd: string; reportedPeriodEnd: string }
  /** A concurrent delivery advanced the row between this handler's read and
   *  its write. Transient: reprocessing resolves correctly against the
   *  now-current value. The concurrent winner is never overwritten. */
  | { kind: 'renewal_conflict'; eventType: string }

export type ActivationRefusal =
  /** No request_id and no metadata.user_id — we cannot tell whose this is,
   *  and a payment is never attached to a guessed account. */
  | 'no_account_reference'
  | 'unknown_account'
  | 'no_subscription_on_checkout'
  /** Creem's own status does not say the subscription is live. */
  | 'subscription_not_live'
  /** The product is not one of our configured plan products. Never mapped
   *  to the nearest plan. */
  | 'unknown_product'
  /** Creem reported no usable period end. We do not invent one. */
  | 'no_period_end'

export interface CreemProcessDeps {
  /** Injected so QA never reaches live Creem. Real callers pass
   *  lib/creem/client.ts::fetchCreemSubscription. */
  fetchSubscription: (subscriptionId: string) => Promise<CreemResult<CreemSubscriptionSnapshot>>
}

/** An id whether Creem sends the field as a string or as a nested object. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id.trim() || null : null
  }
  return null
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Our account reference, from where we put it: the checkout's request_id,
 *  or metadata.user_id for a checkout created outside our own flow. */
function accountReferenceOf(object: Record<string, unknown>): string | null {
  const direct = stringOf(object.request_id) ?? stringOf(object.requestId)
  if (direct) return direct
  const metadata = object.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return stringOf((metadata as Record<string, unknown>).user_id)
  }
  return null
}

/**
 * Applies one already-verified Creem event. Every Supabase call's `error` is
 * checked explicitly; a failed write is reported, never treated as success.
 */
export async function processVerifiedCreemEvent(
  admin: Admin,
  event: CreemWebhookEvent,
  deps: CreemProcessDeps,
): Promise<CreemWebhookOutcome> {
  const eventType = stringOf(event.eventType) ?? stringOf(event.event_type)
  const object = event.object && typeof event.object === 'object' && !Array.isArray(event.object)
    ? (event.object as Record<string, unknown>)
    : null
  if (!eventType || !object) return { kind: 'ignored_malformed_event' }

  const effect = effectForCreemEvent(eventType)
  switch (effect.kind) {
    case 'unknown':
      return { kind: 'ignored_unknown_event_type', eventType }
    case 'none':
      return { kind: 'ignored_no_effect', eventType, why: effect.why }
    case 'notify':
      return { kind: 'operator_attention', eventType, why: effect.why }
    case 'activate':
      return activateFromCheckout(admin, object, deps)
    case 'status':
      return applyStatus(admin, eventType, object, effect.status, deps)
  }
}

/**
 * A completed checkout. The order of checks is the point: nothing is written
 * until the account is known, Creem itself says the subscription is live,
 * and the product resolves to one of OUR plans.
 */
async function activateFromCheckout(
  admin: Admin,
  checkout: Record<string, unknown>,
  deps: CreemProcessDeps,
): Promise<CreemWebhookOutcome> {
  const subscriptionId = idOf(checkout.subscription)
  if (!subscriptionId) {
    // A completed checkout for something that is not a subscription. Nothing
    // in this product is sold that way, so it is refused rather than guessed
    // at.
    return { kind: 'activation_refused', reason: 'no_subscription_on_checkout' }
  }

  const accountReference = accountReferenceOf(checkout)
  if (!accountReference) return { kind: 'activation_refused', reason: 'no_account_reference' }

  // In sandbox mode, only the configured test accounts may be written to.
  // Checked before any read, so a stray test event costs nothing at all.
  if (!creemMayWriteToAccount(accountReference)) {
    return { kind: 'refused_outside_test_accounts', accountId: accountReference }
  }

  // Already applied? Creem redelivers a checkout.completed on its retry
  // schedule, and the FIRST thing a redelivery must not do is grant a second
  // time. Checked before the account read so a retry costs one query.
  const { data: existing, error: existingError } = await admin
    .from('subscriptions')
    .select('id')
    .eq('creem_subscription_id', subscriptionId)
    .maybeSingle()
  if (existingError) return { kind: 'lookup_failed', message: existingError.message }
  if (existing) return { kind: 'activation_already_applied', creemSubscriptionId: subscriptionId }

  // The account must already exist. A payment is never attached to an
  // account we would have to create from a webhook body.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', accountReference)
    .maybeSingle()
  if (profileError) return { kind: 'lookup_failed', message: profileError.message }
  if (!profile) return { kind: 'activation_refused', reason: 'unknown_account' }

  // Creem's own word on the subscription — the plan, the status and the
  // period all come from here, never from the event body.
  const fetched = await deps.fetchSubscription(subscriptionId)
  if (!fetched.ok) return { kind: 'activation_unverifiable', reason: fetched.reason }

  const snapshot = fetched.value
  if (!GRANTABLE_STATUSES.has(snapshot.status)) {
    return { kind: 'activation_refused', reason: 'subscription_not_live' }
  }

  const plan = planForCreemProductId(snapshot.productId)
  if (!plan) return { kind: 'activation_refused', reason: 'unknown_product' }

  const periodEnd = normalizeInstant(snapshot.currentPeriodEnd)
  if (!periodEnd) return { kind: 'activation_refused', reason: 'no_period_end' }

  const result = await transitionSubscriptionToActivePlan(admin, accountReference, {
    plan_code: plan,
    status: 'active',
    creem_subscription_id: subscriptionId,
    current_period_end: periodEnd,
    current_period_start: normalizeInstant(snapshot.currentPeriodStart),
  })

  if (result.kind === 'lookup_failed') return { kind: 'lookup_failed', message: result.message }
  if (result.kind === 'write_failed') return { kind: 'activation_write_failed', message: result.message }
  if (result.kind === 'multiple_current_entitlement_rows') {
    // An invariant broken before this request. Never resolved by picking a
    // row; surfaced so a human does it.
    return { kind: 'activation_write_failed', message: `multiple current entitlement rows: ${result.count}` }
  }
  return { kind: 'activated', creemSubscriptionId: subscriptionId, plan }
}

/**
 * A subscription lifecycle event. The row is found by the Creem subscription
 * id; an id we do not hold is a genuine event about somebody else's
 * subscription (another environment's, most likely) and writes nothing.
 *
 * `subscription.paid` is the renewal, so it also advances the billing period
 * — under the same three guards the PayPal path uses, for the same reason:
 * duplicate and out-of-order deliveries are normal, and a period boundary
 * must never be skipped or re-extended by one.
 */
async function applyStatus(
  admin: Admin,
  eventType: string,
  object: Record<string, unknown>,
  status: EntitlementStatus,
  deps: CreemProcessDeps,
): Promise<CreemWebhookOutcome> {
  const subscriptionId = idOf(object.id) ?? idOf(object.subscription)
  if (!subscriptionId) return { kind: 'unmappable_subscription_reference', eventType }

  const { data: row, error: lookupError } = await admin
    .from('subscriptions')
    .select('*')
    .eq('creem_subscription_id', subscriptionId)
    .maybeSingle()
  if (lookupError) return { kind: 'lookup_failed', message: lookupError.message }
  if (!row) return { kind: 'ignored_unknown_subscription', creemSubscriptionId: subscriptionId }

  // Sandbox mode may only change the configured test accounts' rows. The row
  // has to be read first to know whose it is, but nothing is written.
  const owner = (row as { user_id?: string | null }).user_id ?? null
  if (!creemMayWriteToAccount(owner)) {
    return { kind: 'refused_outside_test_accounts', accountId: owner }
  }

  if (eventType !== 'subscription.paid') {
    const { error } = await admin.from('subscriptions').update({ status }).eq('id', row.id)
    if (error) return { kind: 'update_failed', eventType, message: error.message }
    return { kind: 'processed', eventType }
  }

  // The renewal. Read the period back from Creem rather than trusting a date
  // in a body that may have been sitting in a retry queue for six hours.
  const fetched = await deps.fetchSubscription(subscriptionId)
  if (!fetched.ok) return { kind: 'renewal_date_unavailable', eventType, reason: fetched.reason }

  const reportedMs = parseInstantMs(fetched.value.currentPeriodEnd)
  if (reportedMs === null) {
    return { kind: 'renewal_date_unavailable', eventType, reason: 'unparseable_reported_period_end' }
  }
  const reportedPeriodEnd = new Date(reportedMs).toISOString()

  // Timestamps are compared as INSTANTS, never as strings: the same moment
  // comes back from Creem as "...Z" and from PostgREST as "...+00:00", and a
  // lexicographic compare would read one renewal as two.
  const storedRaw = (row as { current_period_end?: string | null }).current_period_end ?? null
  let storedMs: number | null = null
  if (storedRaw !== null) {
    storedMs = parseInstantMs(storedRaw)
    if (storedMs === null) {
      // The ROW's own value is corrupt. Never guess whether this event is a
      // duplicate, a stale one or a real renewal against it; leave it alone.
      return { kind: 'renewal_date_unavailable', eventType, reason: 'unparseable_stored_period_end' }
    }
    if (reportedMs === storedMs) {
      return { kind: 'renewal_duplicate', eventType, periodEnd: new Date(storedMs).toISOString() }
    }
    if (reportedMs < storedMs) {
      return {
        kind: 'renewal_stale',
        eventType,
        storedPeriodEnd: new Date(storedMs).toISOString(),
        reportedPeriodEnd,
      }
    }
  }

  // Conditional on the EXACT value read above: if a concurrent delivery
  // already advanced the row, zero rows match and this handler stands down
  // rather than overwriting a boundary it never saw.
  let update = admin
    .from('subscriptions')
    .update({
      status,
      current_period_end: reportedPeriodEnd,
      current_period_start: storedMs === null ? null : new Date(storedMs).toISOString(),
    })
    .eq('id', row.id)
  update = storedRaw === null
    ? update.is('current_period_end', null)
    : update.eq('current_period_end', storedRaw)
  const { data: updated, error: updateError } = await update.select('id')
  if (updateError) return { kind: 'update_failed', eventType, message: updateError.message }
  if (!updated || updated.length === 0) return { kind: 'renewal_conflict', eventType }
  return { kind: 'processed', eventType }
}

/**
 * The HTTP answer for an outcome. 2xx ONLY for work that succeeded or for a
 * genuine event we deliberately did nothing about; everything else is
 * non-2xx so Creem's retry schedule has a chance to recover it.
 *
 * The distinctions that matter:
 *  - `activation_refused` is 422 and NOT retried into success by Creem: the
 *    answer will be the same on every delivery (an unknown product, an
 *    account that does not exist). It is non-2xx anyway, because it must
 *    never read as "handled" in Creem's dashboard while a customer has paid
 *    and has no plan.
 *  - `renewal_duplicate` / `renewal_stale` are 200: both are the CORRECT
 *    outcome for a redelivered or out-of-order event, not a failure.
 *  - `renewal_conflict` is 409: this exact delivery should be retried.
 */
export function httpStatusForCreemOutcome(outcome: CreemWebhookOutcome): number {
  switch (outcome.kind) {
    case 'lookup_failed':
    case 'update_failed':
    case 'activation_write_failed':
      return 500
    case 'activation_unverifiable':
      return 502
    case 'activation_refused':
    case 'refused_outside_test_accounts':
    case 'unmappable_subscription_reference':
    case 'renewal_date_unavailable':
      return 422
    case 'renewal_conflict':
      return 409
    default:
      return 200
  }
}
