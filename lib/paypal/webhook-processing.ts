/**
 * Phase 1 — the DB-side half of PayPal webhook handling, split out from the
 * route so it's testable against a fake admin client (no live Supabase, no
 * live PayPal). The route calls this ONLY after signature verification has
 * already succeeded (lib/paypal/client.ts) — this function never re-checks
 * authenticity, it only decides what a genuine event should do to our data,
 * and reports every outcome (including a failed write) rather than
 * swallowing it.
 *
 * Corrective pass (defects found in the original Phase 1 pass):
 *  1. PAYMENT.SALE.COMPLETED does NOT carry a subscription id in
 *     `resource.id` — that field is the sale/transaction id. The
 *     subscription reference for that event type is `resource.billing_agreement_id`.
 *     Using `resource.id` uniformly (the original implementation) meant a
 *     RENEWED payment could silently look up the wrong row, or no row at all.
 *  2. `current_period_end` was computed locally (+1 month from whatever was
 *     already stored), so replaying the same webhook delivery extended the
 *     period again each time. It is now always set from PayPal's OWN
 *     authoritative `next_billing_time` — an absolute value, so replays
 *     converge on the same result by construction.
 */

// `any` deliberately, matching lib/subscription.ts / lib/quota.ts's own
// established convention — this is called with BOTH the real Supabase admin
// client (route.ts) and a lightweight fake (QA), and Supabase's generated
// client type is too specific to structurally accept a hand-rolled fake.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export interface PayPalWebhookEvent {
  event_type?: string
  resource?: { id?: string; billing_agreement_id?: string }
}

export type WebhookProcessingOutcome =
  | { kind: 'ignored_malformed_event' }
  /** BILLING.SUBSCRIPTION.* with no resource.id — structurally anomalous, logged as an error. */
  | { kind: 'unmappable_subscription_reference'; eventType: string }
  /** PAYMENT.SALE.COMPLETED with no billing_agreement_id — an ordinary non-subscription sale, NOT an error. */
  | { kind: 'ignored_non_subscription_payment' }
  | { kind: 'lookup_failed'; message: string }
  | { kind: 'ignored_unknown_subscription'; paypalSubscriptionId: string | undefined }
  | { kind: 'ignored_unrecognized_event_type'; eventType: string }
  | { kind: 'processed'; eventType: string }
  | { kind: 'update_failed'; eventType: string; message: string }
  /** Renewal-specific fail-safe outcomes — current_period_end is NEVER invented locally. */
  | { kind: 'renewal_date_unavailable'; eventType: string; reason: string }

const SUBSCRIPTION_STATUS_EVENTS = new Set([
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
])
const RENEWAL_EVENTS = new Set(['BILLING.SUBSCRIPTION.RENEWED', 'PAYMENT.SALE.COMPLETED'])

/**
 * Resolves the PayPal subscription id for an event, per its ACTUAL field —
 * never `resource.id` uniformly. Returns `undefined` when the event type
 * carries no subscription reference at all (e.g. a non-subscription sale),
 * distinct from a present-but-empty field (malformed).
 */
function resolveSubscriptionId(eventType: string, resource: PayPalWebhookEvent['resource']): string | undefined {
  if (SUBSCRIPTION_STATUS_EVENTS.has(eventType) || eventType === 'BILLING.SUBSCRIPTION.RENEWED') {
    return resource?.id
  }
  if (eventType === 'PAYMENT.SALE.COMPLETED') {
    return resource?.billing_agreement_id
  }
  return undefined
}

export interface ProcessDeps {
  /** Injectable so QA never hits live PayPal. Real callers pass
   *  lib/paypal/client.ts's fetchAuthoritativeNextBillingTime. */
  fetchAuthoritativeNextBillingTime: (subscriptionId: string) => Promise<
    { ok: true; nextBillingTime: string } | { ok: false; reason: string }
  >
}

/**
 * Applies one already-verified PayPal webhook event to `subscriptions`.
 * Every Supabase call's `error` is checked explicitly — a failed update is
 * reported as `update_failed`, never silently treated as success.
 */
export async function processVerifiedPayPalWebhookEvent(
  admin: Admin,
  event: PayPalWebhookEvent,
  deps: ProcessDeps,
): Promise<WebhookProcessingOutcome> {
  const { event_type, resource } = event
  if (!event_type || !resource) return { kind: 'ignored_malformed_event' }

  // PAYMENT.SALE.COMPLETED with no billing_agreement_id is an ORDINARY,
  // frequent, non-error case (a one-off sale unrelated to any subscription)
  // — never logged as an error, never touches the DB.
  if (event_type === 'PAYMENT.SALE.COMPLETED' && !resource.billing_agreement_id) {
    return { kind: 'ignored_non_subscription_payment' }
  }

  const paypalSubscriptionId = resolveSubscriptionId(event_type, resource)

  // A BILLING.SUBSCRIPTION.* (or RENEWED) event is EXPECTED to always carry
  // resource.id per PayPal's schema — if it's missing, that's genuinely
  // anomalous, not a normal "nothing to do" case. Never mutate; never
  // silently succeed.
  if (!paypalSubscriptionId) {
    return { kind: 'unmappable_subscription_reference', eventType: event_type }
  }

  const { data: subscription, error: lookupError } = await admin
    .from('subscriptions')
    .select('*')
    .eq('paypal_subscription_id', paypalSubscriptionId)
    .maybeSingle()

  if (lookupError) return { kind: 'lookup_failed', message: lookupError.message }
  if (!subscription) return { kind: 'ignored_unknown_subscription', paypalSubscriptionId }

  const applyUpdate = async (payload: Record<string, unknown>): Promise<WebhookProcessingOutcome> => {
    const { error } = await admin.from('subscriptions').update(payload).eq('id', subscription.id)
    if (error) return { kind: 'update_failed', eventType: event_type, message: error.message }
    return { kind: 'processed', eventType: event_type }
  }

  if (RENEWAL_EVENTS.has(event_type)) {
    // Idempotency fix: current_period_end is ALWAYS the absolute value
    // PayPal itself reports as the next billing time — never `stored + 1
    // month`. Replaying the same delivery re-fetches the SAME authoritative
    // date from PayPal (PayPal's own state hasn't changed between replays),
    // so this converges rather than extending further each time.
    const authoritative = await deps.fetchAuthoritativeNextBillingTime(paypalSubscriptionId)
    if (!authoritative.ok) {
      return { kind: 'renewal_date_unavailable', eventType: event_type, reason: authoritative.reason }
    }
    return applyUpdate({ current_period_end: authoritative.nextBillingTime })
  }

  switch (event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
      return applyUpdate({ status: 'active' })
    case 'BILLING.SUBSCRIPTION.CANCELLED':
      return applyUpdate({ status: 'cancelled' })
    case 'BILLING.SUBSCRIPTION.EXPIRED':
      return applyUpdate({ status: 'expired' })
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
      return applyUpdate({ status: 'inactive' })
    default:
      // Verified but not an event type we act on — intentionally ignored.
      return { kind: 'ignored_unrecognized_event_type', eventType: event_type }
  }
}

/** Maps a processing outcome to the route's HTTP response — 2xx only for a
 *  successfully processed or intentionally-ignored VERIFIED event. Every
 *  fail-safe / error outcome is non-2xx so PayPal's retry can help where it
 *  can, and a human is alerted (via logs) where it can't. */
export function httpStatusForOutcome(outcome: WebhookProcessingOutcome): number {
  switch (outcome.kind) {
    case 'lookup_failed':
    case 'update_failed':
      return 500
    case 'unmappable_subscription_reference':
    case 'renewal_date_unavailable':
      // Never silently 200 an event that should have been processed. Not
      // strictly "retry will definitely fix it," but a non-2xx is what
      // keeps PayPal retrying AND keeps this from reading as success.
      return 422
    default:
      return 200
  }
}
