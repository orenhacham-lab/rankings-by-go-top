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
 *
 * Phase 3 (2nd review correction) — exactly which PayPal fields back each
 * lifecycle state, and why each is safe against replay/delay/reordering:
 *
 *  - INITIAL ACTIVATION (lib/paypal/activation-processing.ts, called from
 *    app/api/paypal/activate/route.ts, NOT this file): `start_time` (period
 *    start) and `billing_info.next_billing_time` (period end), both read from
 *    the SAME server-side `GET /v1/billing/subscriptions/{id}` call that
 *    verifies the subscription id/status/plan
 *    (lib/paypal/client.ts::verifyPayPalActivation). This is the ONE place
 *    `start_time` is ever used as a period boundary — a fresh subscription
 *    has no prior stored period to chain from, so PayPal's own reported
 *    start is the only available anchor. A plan change (upgrade/downgrade)
 *    creates a brand-new PayPal subscription with its own id, and goes
 *    through this exact same activation path — so a plan change always gets
 *    a fresh, independently-verified period; it never inherits or extends
 *    the prior plan's period. This is the plan-change period-reset policy,
 *    enforced by construction (there is no code path that carries a period
 *    across a plan change), not by a special case.
 *
 *  - RENEWAL (this file, RENEWAL_EVENTS below) — corrected policy:
 *    `billing_info.next_billing_time` is the ONLY field used as the new
 *    `current_period_end`. The new `current_period_start` is ALWAYS the
 *    row's PREVIOUSLY STORED `current_period_end` — NEVER
 *    `billing_info.last_payment.time`. A payment timestamp answers "when did
 *    money move," not "when does the customer's contractual billing period
 *    begin" — those two can legitimately differ (a delayed capture, a
 *    retried charge, a payment processed hours after the actual billing
 *    boundary), and using it as the period anchor would let a late payment
 *    silently shift the customer's quota window. `last_payment.time` is
 *    therefore NOT persisted as the period anchor by this pass at all (no
 *    dedicated "last payment" column exists yet — adding one is out of
 *    scope here; see the final report for this as a documented, low-priority
 *    follow-up rather than something silently dropped).
 *
 *    Both `next_billing_time` and (for reference only) `last_payment.time`
 *    are read via `deps.fetchAuthoritativeBillingPeriod`, which LIVE-QUERIES
 *    PayPal's subscription-detail endpoint at the moment the webhook is
 *    processed — never trusting any date embedded in the webhook payload
 *    itself. This is what makes delayed delivery safe: a webhook delivered
 *    hours late still re-reads PayPal's CURRENT `next_billing_time`, which
 *    hasn't moved just because delivery was slow.
 *
 *    On top of that, three EXPLICIT, tested guards (never inferred from
 *    "PayPal's live state can't regress" alone):
 *      1. `next_billing_time === storedPeriodEnd` → 'renewal_duplicate', a
 *         no-op. (Replaying the identical event, or two webhooks for the
 *         same renewal, e.g. BILLING.SUBSCRIPTION.RENEWED and
 *         PAYMENT.SALE.COMPLETED for the same cycle.)
 *      2. `next_billing_time < storedPeriodEnd` → 'renewal_stale', a no-op.
 *         (An out-of-order-delivered older event.)
 *      3. A CONDITIONAL update (`.eq('current_period_end', storedPeriodEnd)`
 *         at write time, re-checked against whatever is in the DB at that
 *         exact moment) guards the actual write — if a concurrent renewal
 *         handler already advanced the row between this handler's read and
 *         its write, zero rows match and 'renewal_conflict' is returned
 *         (transient — safe to reprocess, at which point the now-current
 *         stored value makes this event resolve as duplicate/stale/processed
 *         correctly). This is what prevents two interleaved renewal webhooks
 *         from silently skipping an intermediate period boundary (handler A
 *         advances X→Y, handler B — still holding the stale X read —  must
 *         NOT then advance X→Z, which would lose Y entirely from the chain).
 *
 *  - MISSING-PERIOD RECOVERY (a legacy row with no stored
 *    `current_period_start`/`current_period_end` at all, or a row whose
 *    `current_period_end` was never set): its FIRST renewal under this code
 *    sets `current_period_end` from PayPal's authoritative
 *    `next_billing_time`, but deliberately leaves `current_period_start`
 *    unset (null) — there is no previously-stored period_end to chain from,
 *    and inventing one (e.g. from `last_payment.time`, or a nominal "end
 *    minus 1 month") would NOT be authoritative, so it is not done here.
 *    lib/billing/usage-period.ts::resolveCurrentUsagePeriod is the ONE place
 *    that fills this gap, with an EXPLICITLY documented, tested, non-
 *    authoritative fallback (`current_period_end - 1 calendar month`) used
 *    only until a real chain exists — every SUBSEQUENT renewal after this
 *    first one has a real stored `current_period_end` to anchor from, so the
 *    row self-heals into the fully authoritative chain from its second
 *    tracked renewal onward. This fallback is a recovery convenience, never
 *    described or treated as authoritative anywhere it's used.
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
  /** The authoritative next_billing_time EQUALS what's already stored — a
   *  genuine duplicate delivery of the same renewal. Safe no-op. */
  | { kind: 'renewal_duplicate'; eventType: string; periodEnd: string }
  /** The authoritative next_billing_time is OLDER than what's already
   *  stored — an out-of-order-delivered event. Safe no-op, row untouched. */
  | { kind: 'renewal_stale'; eventType: string; storedPeriodEnd: string; reportedPeriodEnd: string }
  /** A concurrent renewal handler already advanced current_period_end
   *  between this handler's read and its conditional write — zero rows
   *  matched the write's guard. Transient; safe to reprocess (the event
   *  will then correctly resolve as processed/duplicate/stale against the
   *  now-current stored value). Never overwrites the concurrent winner. */
  | { kind: 'renewal_conflict'; eventType: string }

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
   *  lib/paypal/client.ts's fetchAuthoritativeBillingPeriod. */
  fetchAuthoritativeBillingPeriod: (subscriptionId: string) => Promise<
    { ok: true; periodEnd: string; periodStart: string | null } | { ok: false; reason: string }
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
    // 2nd review correction — current_period_end is ALWAYS the absolute
    // value PayPal itself reports as the next billing time (never `stored +
    // 1 month`, never invented). current_period_start is ALWAYS the row's
    // OWN previously-stored current_period_end — NEVER
    // authoritative.periodStart (last_payment.time). See the file header for
    // the full rationale (a payment timestamp is not a billing-boundary
    // field).
    const authoritative = await deps.fetchAuthoritativeBillingPeriod(paypalSubscriptionId)
    if (!authoritative.ok) {
      return { kind: 'renewal_date_unavailable', eventType: event_type, reason: authoritative.reason }
    }
    const previousPeriodEnd = (subscription as { current_period_end?: string | null }).current_period_end ?? null

    // ISO 8601 UTC timestamps ("...Z") compare correctly as plain strings —
    // no Date parsing needed. A previousPeriodEnd of null means this row has
    // never recorded an authoritative period yet (missing-period recovery —
    // see file header); duplicate/stale detection only applies once a real
    // stored value exists to compare against.
    if (previousPeriodEnd !== null) {
      if (authoritative.periodEnd === previousPeriodEnd) {
        return { kind: 'renewal_duplicate', eventType: event_type, periodEnd: previousPeriodEnd }
      }
      if (authoritative.periodEnd < previousPeriodEnd) {
        return {
          kind: 'renewal_stale',
          eventType: event_type,
          storedPeriodEnd: previousPeriodEnd,
          reportedPeriodEnd: authoritative.periodEnd,
        }
      }
    }

    // Concurrency guard — CONDITIONAL update. The WHERE clause re-checks
    // current_period_end against the exact value we just read; if a
    // concurrent renewal handler already advanced this row in between, the
    // condition matches zero rows and this handler must NOT overwrite that
    // newer state (which would otherwise silently skip the concurrent
    // winner's period boundary). `.select('id')` lets us tell "zero rows
    // matched" apart from "matched and updated."
    let updateQuery = admin
      .from('subscriptions')
      .update({ current_period_end: authoritative.periodEnd, current_period_start: previousPeriodEnd })
      .eq('id', subscription.id)
    updateQuery = previousPeriodEnd === null
      ? updateQuery.is('current_period_end', null)
      : updateQuery.eq('current_period_end', previousPeriodEnd)
    const { data: updatedRows, error: updateError } = await updateQuery.select('id')
    if (updateError) return { kind: 'update_failed', eventType: event_type, message: updateError.message }
    if (!updatedRows || updatedRows.length === 0) {
      return { kind: 'renewal_conflict', eventType: event_type }
    }
    return { kind: 'processed', eventType: event_type }
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
 *  can, and a human is alerted (via logs) where it can't.
 *  `renewal_duplicate` / `renewal_stale` are 200 (not errors): each is the
 *  EXPECTED outcome for a duplicate/out-of-order renewal webhook,
 *  deliberately a safe no-op rather than a failure PayPal should retry.
 *  `renewal_conflict` is 409 — NOT the same as those two: it means a
 *  concurrent handler raced this one and won; this exact delivery must be
 *  RETRIED (unlike duplicate/stale, which are permanently correct no-ops),
 *  so it must not read as success. */
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
    case 'renewal_conflict':
      return 409
    default:
      return 200
  }
}
