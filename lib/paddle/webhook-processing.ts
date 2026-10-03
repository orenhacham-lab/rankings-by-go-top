/**
 * w21 — the DB side of a Paddle webhook, split from the route so QA can run
 * it against FakeAdmin with an injected Paddle API. The route calls this ONLY
 * after the Paddle-Signature header has verified (lib/paddle/signature.ts).
 *
 * IDEMPOTENT AND ORDER-SAFE BY CONSTRUCTION. The webhook body is used only to
 * learn WHICH Paddle subscription changed (and, for a first link, which of our
 * users bought it). The state written is always Paddle's CURRENT state of that
 * subscription, re-read from Paddle's API at processing time
 * (`deps.fetchSubscription`): a replayed, delayed or out-of-order delivery
 * converges on the same row, and a row that already matches is not written
 * again ('unchanged').
 *
 * What is trusted from where:
 *  - plan_code: ONLY from the subscription's price id through the server-side
 *    map (lib/paddle/config.ts planCodeForPaddlePriceId). custom_data.plan_code
 *    is never read. An unknown price id is ignored: nothing is written.
 *  - user_id: from custom_data, used ONLY to link a subscription we have never
 *    seen to an EXISTING user who is not Shopify-governed. Once linked, the row
 *    is found by paddle_subscription_id and custom_data is not read again.
 *  - status / period: from the live subscription.
 *
 * Status mapping onto the existing subscriptions row (lib/subscription.ts reads
 * trial/active/cancelled):
 *    active                               -> 'active'
 *    active + scheduled_change 'cancel'   -> 'cancelled' (access to period end)
 *    canceled                             -> 'expired'   (no access)
 *    past_due / paused                    -> 'inactive'  (no access; Paddle
 *                                            dunning recovery or a resume
 *                                            brings it back to 'active')
 *    trialing                             -> ignored (the 7-day trial is ours;
 *                                            no Paddle trial is configured)
 *
 * Every Supabase error is reported, never swallowed; the route answers non-2xx
 * for those so Paddle retries.
 */

import { isPlanCode, type PlanCode } from '@/lib/plans/catalog'
import { isBillingMarket, type BillingMarket } from '@/lib/billing/market'
import { transitionSubscriptionToActivePlan } from '@/lib/paypal/activation-processing'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export const HANDLED_PADDLE_EVENTS = new Set([
  'subscription.created',
  'subscription.activated',
  'subscription.updated',
  'subscription.canceled',
  'subscription.past_due',
  'subscription.paused',
  'subscription.resumed',
  'transaction.completed',
])

export interface PaddleWebhookEvent {
  event_id?: string
  event_type?: string
  occurred_at?: string
  data?: Record<string, unknown> | null
}

/** The fields of Paddle's subscription entity this module reads (snake_case, as the API sends it). */
export interface PaddleSubscription {
  id: string
  status: string
  customer_id?: string | null
  currency_code?: string | null
  current_billing_period?: { starts_at?: string | null; ends_at?: string | null } | null
  scheduled_change?: { action?: string | null; effective_at?: string | null } | null
  canceled_at?: string | null
  items?: Array<{ price?: { id?: string | null } | null } | null> | null
  custom_data?: Record<string, unknown> | null
}

export interface PaddleProcessDeps {
  fetchSubscription: (subscriptionId: string) => Promise<{ ok: true; subscription: PaddleSubscription } | { ok: false; reason: string }>
  planCodeForPriceId: (priceId: unknown) => PlanCode | null
  isShopifyGoverned: (userId: string) => Promise<boolean>
  /** Locks app_metadata.billing_market (lib/billing/billing-market-selection.ts). */
  lockMarket: (userId: string, market: BillingMarket) => Promise<{ kind: string }>
}

export type PaddleProcessOutcome =
  | { kind: 'ignored_malformed_event' }
  | { kind: 'ignored_unhandled_event'; eventType: string }
  | { kind: 'ignored_no_subscription' }
  | { kind: 'subscription_unavailable'; reason: string }
  | { kind: 'ignored_unknown_price'; priceId: string | null }
  | { kind: 'ignored_unsupported_status'; status: string }
  | { kind: 'ignored_unlinkable'; reason: 'no_user_id' | 'unknown_user' | 'not_active' }
  | { kind: 'refused_shopify_governed'; userId: string }
  | { kind: 'refused_other_paid_subscription'; userId: string }
  | { kind: 'lookup_failed'; message: string }
  | { kind: 'write_failed'; message: string }
  | { kind: 'multiple_current_entitlement_rows'; count: number }
  | { kind: 'linked'; rowId: string; planCode: PlanCode; status: string; market: BillingMarket | null; lock: string }
  | { kind: 'updated'; rowId: string; planCode: PlanCode; status: string }
  | { kind: 'unchanged'; rowId: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Paddle subscription status -> our row status, or null when we do not act on it. */
export function rowStatusForPaddle(sub: Pick<PaddleSubscription, 'status' | 'scheduled_change'>): 'active' | 'cancelled' | 'expired' | 'inactive' | null {
  switch (sub.status) {
    case 'active':
      return sub.scheduled_change?.action === 'cancel' ? 'cancelled' : 'active'
    case 'canceled':
      return 'expired'
    case 'past_due':
    case 'paused':
      return 'inactive'
    default:
      return null
  }
}

/** The currency Paddle charges in -> our billing market (ILS / USD), else null. */
export function marketForPaddleCurrency(currency: unknown): BillingMarket | null {
  const c = typeof currency === 'string' ? currency.trim().toUpperCase() : ''
  return isBillingMarket(c) ? c : null
}

function toIso(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const ms = Date.parse(v)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** The Paddle subscription id an event is about. */
export function subscriptionIdOfEvent(event: PaddleWebhookEvent): string | null {
  const data = event.data ?? {}
  if (event.event_type?.startsWith('subscription.')) return str(data.id)
  if (event.event_type === 'transaction.completed') return str(data.subscription_id)
  return null
}

export async function processVerifiedPaddleEvent(admin: Admin, event: PaddleWebhookEvent, deps: PaddleProcessDeps): Promise<PaddleProcessOutcome> {
  const eventType = str(event?.event_type)
  if (!eventType || !event.data || typeof event.data !== 'object') return { kind: 'ignored_malformed_event' }
  if (!HANDLED_PADDLE_EVENTS.has(eventType)) return { kind: 'ignored_unhandled_event', eventType }

  const subscriptionId = subscriptionIdOfEvent(event)
  // A one-off transaction (no subscription) is not ours to act on.
  if (!subscriptionId) return { kind: 'ignored_no_subscription' }

  // Paddle's CURRENT state — never the (possibly stale) body.
  const fetched = await deps.fetchSubscription(subscriptionId)
  if (!fetched.ok) return { kind: 'subscription_unavailable', reason: fetched.reason }
  const sub = fetched.subscription
  if (sub.id !== subscriptionId) return { kind: 'subscription_unavailable', reason: 'id_mismatch' }

  const priceIds = (sub.items ?? []).map((it) => str(it?.price?.id)).filter((x): x is string => !!x)
  const planCodes = priceIds.map((id) => deps.planCodeForPriceId(id)).filter((x): x is PlanCode => !!x && isPlanCode(x))
  // Exactly one recognised plan price (quantity 1..1 in the catalog).
  if (planCodes.length !== 1) return { kind: 'ignored_unknown_price', priceId: priceIds[0] ?? null }
  const planCode = planCodes[0]

  const status = rowStatusForPaddle(sub)
  if (!status) return { kind: 'ignored_unsupported_status', status: String(sub.status) }

  const periodStart = toIso(sub.current_billing_period?.starts_at)
  // A canceled subscription has no current period: access ended when it was canceled.
  const periodEnd = toIso(sub.current_billing_period?.ends_at) ?? (status === 'expired' ? toIso(sub.canceled_at) ?? new Date().toISOString() : null)

  const { data: existing, error: lookupError } = await admin
    .from('subscriptions')
    .select('id, user_id, status, plan_code, current_period_start, current_period_end, paddle_customer_id')
    .eq('paddle_subscription_id', subscriptionId)
    .maybeSingle()
  if (lookupError) return { kind: 'lookup_failed', message: lookupError.message }

  if (existing) {
    const next: Record<string, unknown> = { status, plan_code: planCode, current_period_end: periodEnd ?? existing.current_period_end ?? null }
    if (periodStart) next.current_period_start = periodStart
    if (str(sub.customer_id)) next.paddle_customer_id = str(sub.customer_id)
    const same = Object.entries(next).every(([k, v]) => {
      const cur = (existing as Record<string, unknown>)[k]
      if (k.startsWith('current_period_')) return toIso(cur) === toIso(v)
      return (cur ?? null) === (v ?? null)
    })
    if (!same) {
      const { error } = await admin.from('subscriptions').update(next).eq('id', existing.id)
      if (error) return { kind: 'write_failed', message: error.message }
    }
    // A payment on a linked subscription re-asserts the lock (a no-op once
    // stored), so a lock that failed at the first link is retried.
    if (eventType === 'transaction.completed' && status === 'active' && str(existing.user_id)) {
      await lockActivationMarket(deps, existing.user_id, eventType, event, sub)
    }
    return same ? { kind: 'unchanged', rowId: existing.id } : { kind: 'updated', rowId: existing.id, planCode, status }
  }

  // FIRST LINK — only a subscription that is (or is being) paid for.
  if (status !== 'active' && status !== 'cancelled') return { kind: 'ignored_unlinkable', reason: 'not_active' }
  if (!periodEnd) return { kind: 'subscription_unavailable', reason: 'no_current_period' }
  const eventCustom = (event.data as { custom_data?: unknown }).custom_data
  const userId = str(sub.custom_data?.user_id)
    ?? (eventCustom && typeof eventCustom === 'object' ? str((eventCustom as Record<string, unknown>).user_id) : null)
  if (!userId || !UUID_RE.test(userId)) return { kind: 'ignored_unlinkable', reason: 'no_user_id' }

  const { data: profile, error: profileError } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (profileError) return { kind: 'lookup_failed', message: profileError.message }
  if (!profile) return { kind: 'ignored_unlinkable', reason: 'unknown_user' }

  // Shopify bills a Shopify-governed account; Paddle is never offered there
  // (the billing screen checks this first). Refused here too, as PayPal's
  // activation route does.
  if (await deps.isShopifyGoverned(userId)) return { kind: 'refused_shopify_governed', userId }

  // The account's current row already belongs to another paid subscription
  // (PayPal, or a different Paddle one). Linking would overwrite it in place
  // and leave the other one billing against the same row, so a person decides.
  // The billing screen never offers Paddle in that state.
  const { data: currentRows, error: currentError } = await admin
    .from('subscriptions')
    .select('id, paypal_subscription_id, paddle_subscription_id')
    .eq('user_id', userId)
    .in('status', ['trial', 'active'])
  if (currentError) return { kind: 'lookup_failed', message: currentError.message }
  if (((currentRows ?? []) as { paypal_subscription_id?: string | null; paddle_subscription_id?: string | null }[]).some((r) => !!r.paypal_subscription_id || !!r.paddle_subscription_id)) {
    return { kind: 'refused_other_paid_subscription', userId }
  }

  const result = await transitionSubscriptionToActivePlan(admin, userId, {
    plan_code: planCode,
    status,
    paddle_subscription_id: subscriptionId,
    paddle_customer_id: str(sub.customer_id),
    current_period_end: periodEnd,
    current_period_start: periodStart,
  })
  if (result.kind === 'lookup_failed') return { kind: 'lookup_failed', message: result.message }
  if (result.kind === 'write_failed') return { kind: 'write_failed', message: result.message }
  if (result.kind === 'multiple_current_entitlement_rows') return { kind: 'multiple_current_entitlement_rows', count: result.count }

  const { market, lock } = await lockActivationMarket(deps, userId, eventType, event, sub)
  return { kind: 'linked', rowId: result.rowId, planCode, status, market, lock }
}

/**
 * The market LOCKS at activation, exactly as /api/paypal/activate does: after
 * the entitlement is saved (a lock failure never costs the plan), through
 * lockBillingMarket, which never overwrites a stored market. The currency is
 * the one Paddle charged: the completed transaction's, else the subscription's.
 */
async function lockActivationMarket(deps: PaddleProcessDeps, userId: string, eventType: string, event: PaddleWebhookEvent, sub: PaddleSubscription): Promise<{ market: BillingMarket | null; lock: string }> {
  const txCurrency = eventType === 'transaction.completed' ? (event.data as Record<string, unknown>).currency_code : null
  const market = marketForPaddleCurrency(txCurrency) ?? marketForPaddleCurrency(sub.currency_code)
  if (!market) return { market: null, lock: 'unknown_market' }
  return { market, lock: (await deps.lockMarket(userId, market)).kind }
}

/** 2xx only when the event was handled or deliberately ignored; a failure Paddle should retry is non-2xx. */
export function httpStatusForPaddleOutcome(o: PaddleProcessOutcome): number {
  switch (o.kind) {
    case 'lookup_failed':
    case 'write_failed':
    case 'multiple_current_entitlement_rows':
      return 500
    case 'subscription_unavailable':
      return 502
    default:
      return 200
  }
}
