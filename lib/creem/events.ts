/**
 * What a genuine Creem webhook event MEANS for an account's entitlement.
 *
 * This is the decision table only — a pure function from an event type to
 * the effect it should have. It deliberately knows nothing about Supabase,
 * HTTP, or signatures: authenticity is settled before this is consulted
 * (lib/creem/signature.ts), and the write is somebody else's job. That split
 * is the same one lib/paypal/webhook-processing.ts already uses, and it is
 * what makes the policy testable without a database.
 *
 * THE EVENT LIST IS CLOSED ON PURPOSE. Every event type Creem documents
 * (https://docs.creem.io/code/webhooks) appears in EVENT_EFFECTS below, and
 * anything else resolves to `unknown`. A new Creem event therefore shows up
 * as an explicit "we have not decided what this means" in the logs, instead
 * of being silently treated as harmless. A payment provider adding an event
 * we quietly ignore is exactly how an account keeps access it should have
 * lost.
 *
 * THE TWO DECISIONS WORTH ARGUING WITH, both erring toward keeping a paying
 * customer working rather than cutting them off on a transient signal:
 *
 *  - `subscription.scheduled_cancel` KEEPS ACCESS. The customer has asked to
 *    cancel at the end of the period; they have paid for that period. Our
 *    policy is "cancel anytime, access to the end of the paid period"
 *    (/refund-policy), so revoking here would contradict the published terms.
 *    The actual revocation arrives later as `subscription.expired`.
 *  - `subscription.past_due` KEEPS ACCESS, `subscription.unpaid` does not.
 *    past_due means a charge failed and Creem is still retrying; unpaid means
 *    the retries are finished. Cutting a customer off on the first failed
 *    charge (an expired card, a bank's fraud hold) would lose accounts we
 *    would otherwise keep.
 *
 * A refund or a dispute does NOT by itself change the entitlement here: both
 * can be partial, and Creem emits the subscription event separately when the
 * subscription itself ends. They are flagged for the operator instead, so a
 * dispute is never silently absorbed.
 *
 * PURE: no request, env or database access.
 */

/** The entitlement states our subscriptions table stores, as the PayPal
 *  webhook path already writes them (lib/paypal/webhook-processing.ts). */
export type EntitlementStatus = 'active' | 'cancelled' | 'expired' | 'inactive'

export type CreemEventEffect =
  /** A new paid subscription: verify it against Creem and grant the plan. */
  | { kind: 'activate' }
  /** An existing subscription's entitlement moves to this state. */
  | { kind: 'status'; status: EntitlementStatus }
  /** Genuinely nothing to do to the entitlement; `why` says why. */
  | { kind: 'none'; why: string }
  /** Nothing to do to the entitlement, but a human should see it. */
  | { kind: 'notify'; why: string }
  /** Not a documented Creem event: never acted on, always logged. */
  | { kind: 'unknown' }

/**
 * Every event type Creem documents, with its effect. Written as DATA so the
 * QA suite can assert the table covers the documented list exactly — neither
 * missing an event nor inventing one.
 */
export const EVENT_EFFECTS = {
  'checkout.completed': { kind: 'activate' },

  'subscription.active': { kind: 'status', status: 'active' },
  'subscription.paid': { kind: 'status', status: 'active' },
  'subscription.trialing': { kind: 'status', status: 'active' },
  // See the header: paid through the period, revoked later by .expired.
  'subscription.scheduled_cancel': { kind: 'status', status: 'active' },
  // See the header: Creem is still retrying the charge.
  'subscription.past_due': { kind: 'status', status: 'active' },

  'subscription.canceled': { kind: 'status', status: 'cancelled' },
  'subscription.expired': { kind: 'status', status: 'expired' },
  // Retries are finished and no money arrived; access stops.
  'subscription.unpaid': { kind: 'status', status: 'inactive' },
  'subscription.paused': { kind: 'status', status: 'inactive' },

  // A plan or quantity change. The new plan is read from Creem itself on the
  // activation path, never from the event body, so this one changes no state.
  'subscription.update': { kind: 'none', why: 'plan change is re-verified against Creem, not taken from the event' },

  'refund.created': { kind: 'notify', why: 'a refund may be partial; the subscription event decides the entitlement' },
  'dispute.created': { kind: 'notify', why: 'a dispute needs a human; it is never absorbed silently' },

  // Credits are a Creem feature we do not sell. They are listed so the table
  // stays provably complete against Creem's documentation.
  'credits.granted': { kind: 'none', why: 'we do not sell credits' },
  'credits.consumed': { kind: 'none', why: 'we do not sell credits' },
  'credits.auto_recharged': { kind: 'none', why: 'we do not sell credits' },
  'customer_credits.exhausted': { kind: 'none', why: 'we do not sell credits' },
} as const satisfies Record<string, CreemEventEffect>

export type CreemEventType = keyof typeof EVENT_EFFECTS

export const CREEM_EVENT_TYPES = Object.keys(EVENT_EFFECTS) as CreemEventType[]

export function isCreemEventType(value: unknown): value is CreemEventType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EVENT_EFFECTS, value)
}

/** What a genuine event of this type should do. Unknown types fail closed. */
export function effectForCreemEvent(eventType: unknown): CreemEventEffect {
  return isCreemEventType(eventType) ? EVENT_EFFECTS[eventType] : { kind: 'unknown' }
}
