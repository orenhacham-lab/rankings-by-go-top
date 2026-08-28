/**
 * Phase 1 (PayPal/Shopify billing hardening) — shared, server-only PayPal
 * helpers: OAuth token exchange, subscription-detail verification, PayPal
 * plan-ID → internal plan_code resolution, and webhook-signature verification
 * via PayPal's official `verify-webhook-signature` API.
 *
 * PURE where possible (header extraction, plan-ID resolution) so they're
 * unit-testable without network; the two functions that must call PayPal
 * (`getPayPalToken`, `verifyPayPalWebhookSignature`) accept an injectable
 * `fetchImpl` for the same reason.
 */

import type { SubscriptionPlan } from '@/lib/supabase/types'

const KNOWN_PLAN_CODES: readonly SubscriptionPlan[] = ['regular', 'advanced', 'premium', 'large_agency']

/** True narrowing guard: is this a plan_code value we actually grant entitlement for. */
export function isKnownPlanCode(value: unknown): value is SubscriptionPlan {
  return typeof value === 'string' && (KNOWN_PLAN_CODES as readonly string[]).includes(value)
}

export function paypalApiUrl(): string {
  return (process.env.PAYPAL_API_URL || 'https://api.paypal.com').replace(/\/+$/, '')
}

/**
 * Phase 3 — PayPal Plan ID → internal plan_code, built from THREE families
 * of env vars, all recognized so ANY subscription (old or new) still
 * verifies/renews correctly:
 *   - LEGACY (`NEXT_PUBLIC_PAYPAL_PLAN_ID_*`) — the original 4 vars, kept
 *     unchanged. Recognized here so an already-started subscription on one
 *     of these plan IDs keeps working, but see lib/paypal/checkout-plans.ts:
 *     these are NEVER selected for a NEW checkout button once the new
 *     currency-specific vars are configured — that separation lives at the
 *     CHECKOUT SELECTION layer, not here (this function's job is only "what
 *     plan_code does this plan_id map to," for verifying/renewing whatever
 *     subscription PayPal reports, old or new).
 *   - `NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_*` — new Hebrew-market checkout plans.
 *   - `NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_*` — new English-market checkout plans.
 * These are Plan IDs, not secrets — safe to read server-side too.
 */
export function resolvePlanCodeFromPayPalPlanId(planId: string | null | undefined): SubscriptionPlan | null {
  if (!planId) return null
  const map: Record<string, SubscriptionPlan | undefined> = {
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_REGULAR ?? '']: 'regular',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ADVANCED ?? '']: 'advanced',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_PREMIUM ?? '']: 'premium',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_LARGE_AGENCY ?? '']: 'large_agency',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_REGULAR ?? '']: 'regular',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_ADVANCED ?? '']: 'advanced',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_PREMIUM ?? '']: 'premium',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ILS_LARGE_AGENCY ?? '']: 'large_agency',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_REGULAR ?? '']: 'regular',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_ADVANCED ?? '']: 'advanced',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_PREMIUM ?? '']: 'premium',
    [process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_USD_LARGE_AGENCY ?? '']: 'large_agency',
  }
  delete map['']
  return map[planId] ?? null
}

export interface PayPalTokenResponse { access_token: string }

export async function getPayPalToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
    throw new Error('paypal_not_configured')
  }
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64')
  const response = await fetchImpl(`${paypalApiUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!response.ok) throw new Error(`paypal_token_failed: ${response.status}`)
  const data = (await response.json()) as PayPalTokenResponse
  if (!data.access_token) throw new Error('paypal_token_missing')
  return data.access_token
}

export interface PayPalSubscriptionDetails {
  id: string
  status: string
  plan_id?: string
  /** Authoritative subscription start — used as current_period_start on
   *  first activation (Phase 3: never now()). */
  start_time?: string
  /** Authoritative billing-cycle info — `next_billing_time` is the source of
   *  truth for `current_period_end` (Phase 1 corrective pass: previously
   *  computed locally as `current_period_end + 1 month`, which extended
   *  again on every replay of the same webhook event). `last_payment.time`
   *  is the authoritative signal for the START of the CURRENT cycle on
   *  renewal (Phase 3). */
  billing_info?: { next_billing_time?: string; last_payment?: { time?: string } }
}

export async function fetchPayPalSubscription(
  subscriptionId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PayPalSubscriptionDetails> {
  const response = await fetchImpl(`${paypalApiUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`paypal_subscription_fetch_failed: ${response.status}`)
  return (await response.json()) as PayPalSubscriptionDetails
}

export type AuthoritativeNextBillingResult =
  | { ok: true; nextBillingTime: string }
  | { ok: false; reason: 'paypal_not_configured' | 'fetch_failed' | 'no_authoritative_date' }

/**
 * The renewal-idempotency fix: PayPal's OWN `next_billing_time` is the
 * source of truth for a subscription's next `current_period_end` — never
 * computed locally. If PayPal has no authoritative date (e.g. a subscription
 * with no future billing cycle), this fails rather than inventing one.
 */
export async function fetchAuthoritativeNextBillingTime(
  subscriptionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthoritativeNextBillingResult> {
  let token: string
  try {
    token = await getPayPalToken(fetchImpl)
  } catch {
    return { ok: false, reason: 'paypal_not_configured' }
  }
  let details: PayPalSubscriptionDetails
  try {
    details = await fetchPayPalSubscription(subscriptionId, token, fetchImpl)
  } catch {
    return { ok: false, reason: 'fetch_failed' }
  }
  const nextBillingTime = details.billing_info?.next_billing_time
  if (!nextBillingTime) return { ok: false, reason: 'no_authoritative_date' }
  return { ok: true, nextBillingTime }
}

export type AuthoritativeBillingPeriodResult =
  | { ok: true; periodEnd: string; periodStart: string | null }
  | { ok: false; reason: 'paypal_not_configured' | 'fetch_failed' | 'no_authoritative_date' }

/**
 * Phase 3 — renewal period boundaries, NEVER a nominal +1-month calculation.
 * `periodEnd` = PayPal's own `next_billing_time` (same authoritative source
 * as fetchAuthoritativeNextBillingTime above). `periodStart` = PayPal's own
 * `billing_info.last_payment.time` when present (the payment that just
 * started the CURRENT cycle) — `null` when PayPal doesn't report it, in
 * which case the caller (the renewal webhook) falls back to the row's
 * PREVIOUS current_period_end, which is itself authoritative (it was set
 * from a prior next_billing_time) and keeps periods contiguous.
 */
export async function fetchAuthoritativeBillingPeriod(
  subscriptionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthoritativeBillingPeriodResult> {
  let token: string
  try {
    token = await getPayPalToken(fetchImpl)
  } catch {
    return { ok: false, reason: 'paypal_not_configured' }
  }
  let details: PayPalSubscriptionDetails
  try {
    details = await fetchPayPalSubscription(subscriptionId, token, fetchImpl)
  } catch {
    return { ok: false, reason: 'fetch_failed' }
  }
  const periodEnd = details.billing_info?.next_billing_time
  if (!periodEnd) return { ok: false, reason: 'no_authoritative_date' }
  return { ok: true, periodEnd, periodStart: details.billing_info?.last_payment?.time ?? null }
}

/** Subscription statuses this app treats as a legitimate, activatable charge. */
const ACCEPTABLE_ACTIVATION_STATUSES = new Set(['APPROVAL_PENDING', 'ACTIVE'])

type VerifiedActivationResult =
  | {
      ok: true
      planCode: SubscriptionPlan
      /** Phase 3 — authoritative period boundaries from the SAME verified
       *  fetch (no extra API call). `periodEnd` is always present when
       *  `ok: true` (an activation with no future billing cycle at all is
       *  treated as unresolvable — see below); `periodStart` may be null
       *  when PayPal doesn't report `start_time` for this subscription, in
       *  which case the caller falls back per the documented compatibility
       *  rule (current_period_end - 1 month). */
      periodEnd: string
      periodStart: string | null
    }
  | { ok: false; reason: 'paypal_not_configured' | 'paypal_verification_failed' | 'subscription_id_mismatch' | 'subscription_status_unacceptable' | 'unrecognized_paypal_plan' | 'plan_mismatch' | 'no_authoritative_period' }

/**
 * The full activation-verification gate (Phase 1 goal E). Fails closed on
 * every branch — never returns `ok: true` without (a) PayPal confirming the
 * exact submitted subscription id, (b) an acceptable status, and (c) the
 * PayPal-verified plan_id resolving to the SAME plan_code the client submitted.
 * The returned planCode is always the server-resolved one — the caller must
 * never fall back to the raw client-submitted plan string.
 *
 * Phase 3 — also returns AUTHORITATIVE period boundaries (never now()/now()+1
 * month) read from this SAME verified PayPal response.
 */
export async function verifyPayPalActivation(
  args: { submittedSubscriptionId: string; submittedPlanCode: string; fetchImpl?: typeof fetch },
): Promise<VerifiedActivationResult> {
  const fetchImpl = args.fetchImpl ?? fetch
  let token: string
  try {
    token = await getPayPalToken(fetchImpl)
  } catch {
    return { ok: false, reason: 'paypal_not_configured' }
  }
  let details: PayPalSubscriptionDetails
  try {
    details = await fetchPayPalSubscription(args.submittedSubscriptionId, token, fetchImpl)
  } catch {
    return { ok: false, reason: 'paypal_verification_failed' }
  }
  if (details.id !== args.submittedSubscriptionId) return { ok: false, reason: 'subscription_id_mismatch' }
  if (!ACCEPTABLE_ACTIVATION_STATUSES.has(details.status)) return { ok: false, reason: 'subscription_status_unacceptable' }
  const resolvedPlanCode = resolvePlanCodeFromPayPalPlanId(details.plan_id)
  if (!resolvedPlanCode) return { ok: false, reason: 'unrecognized_paypal_plan' }
  if (resolvedPlanCode !== args.submittedPlanCode) return { ok: false, reason: 'plan_mismatch' }
  const periodEnd = details.billing_info?.next_billing_time
  if (!periodEnd) return { ok: false, reason: 'no_authoritative_period' }
  return { ok: true, planCode: resolvedPlanCode, periodEnd, periodStart: details.start_time ?? null }
}

export type CancelSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: 'paypal_not_configured' | 'cancel_request_failed' }

/**
 * Phase 2 — cancel a PayPal subscription's renewal via PayPal's official
 * POST /v1/billing/subscriptions/{id}/cancel. Used by the Shopify migration
 * state machine (lib/shopify/paypal-migration.ts) ONLY after the Partner API
 * has already confirmed an active Shopify plan for the same account — never
 * called speculatively. A 404/422 (already cancelled/not found) is treated
 * as success — the goal (no further PayPal billing) is already satisfied.
 */
export async function cancelPayPalSubscription(
  subscriptionId: string,
  reason: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CancelSubscriptionResult> {
  let token: string
  try {
    token = await getPayPalToken(fetchImpl)
  } catch {
    return { ok: false, reason: 'paypal_not_configured' }
  }
  try {
    const response = await fetchImpl(`${paypalApiUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (response.ok || response.status === 204 || response.status === 404 || response.status === 422) {
      return { ok: true }
    }
    return { ok: false, reason: 'cancel_request_failed' }
  } catch {
    return { ok: false, reason: 'cancel_request_failed' }
  }
}

// ── Webhook signature verification (Phase 1 goal F) ─────────────────────────

export interface PayPalWebhookHeaders {
  authAlgo: string
  certUrl: string
  transmissionId: string
  transmissionSig: string
  transmissionTime: string
}

/** PURE — extracts the 5 required PayPal transmission headers. Null if any are missing/empty. */
export function extractPayPalWebhookHeaders(headers: { get(name: string): string | null }): PayPalWebhookHeaders | null {
  const authAlgo = headers.get('paypal-auth-algo')
  const certUrl = headers.get('paypal-cert-url')
  const transmissionId = headers.get('paypal-transmission-id')
  const transmissionSig = headers.get('paypal-transmission-sig')
  const transmissionTime = headers.get('paypal-transmission-time')
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) return null
  return { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime }
}

export type WebhookVerificationOutcome = 'verified' | 'unverified' | 'error'

/**
 * Calls PayPal's official POST /v1/notifications/verify-webhook-signature.
 * Never throws for an expected outcome — a PayPal-side rejection is
 * 'unverified', a transport/config failure is 'error' (distinct so the
 * caller can choose a retryable non-2xx vs. a hard reject).
 */
export async function verifyPayPalWebhookSignature(args: {
  headers: PayPalWebhookHeaders
  webhookEvent: unknown
  webhookId: string
  fetchImpl?: typeof fetch
}): Promise<WebhookVerificationOutcome> {
  const fetchImpl = args.fetchImpl ?? fetch
  let token: string
  try {
    token = await getPayPalToken(fetchImpl)
  } catch {
    return 'error'
  }
  try {
    const response = await fetchImpl(`${paypalApiUrl()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: args.headers.authAlgo,
        cert_url: args.headers.certUrl,
        transmission_id: args.headers.transmissionId,
        transmission_sig: args.headers.transmissionSig,
        transmission_time: args.headers.transmissionTime,
        webhook_id: args.webhookId,
        webhook_event: args.webhookEvent,
      }),
    })
    if (!response.ok) return 'error'
    const data = (await response.json()) as { verification_status?: string }
    return data.verification_status === 'SUCCESS' ? 'verified' : 'unverified'
  } catch {
    return 'error'
  }
}
