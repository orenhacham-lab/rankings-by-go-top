/**
 * The server-side Creem API client: create a checkout, and read back a
 * subscription so an entitlement is only ever granted on Creem's own word.
 *
 * WHY NOT THE SDK. `creem` and `@creem_io/nextjs` would do this in fewer
 * lines, but the two calls below are the entire surface we need, and a
 * dependency that sits between us and a payment provider is a dependency we
 * would have to audit on every release. The shapes here are from Creem's
 * REST documentation (POST /v1/checkouts, GET /v1/subscriptions), which is
 * what the SDK calls too.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE, the same one
 * lib/paypal/client.ts::verifyPayPalActivation enforces for PayPal: a plan
 * is granted from what CREEM says about a subscription, never from what a
 * browser posted. `fetchCreemSubscription` is that server-side read, and the
 * caller matches its product against our own configured ids
 * (lib/creem/checkout-products.ts) rather than trusting any plan name in a
 * request body.
 *
 * EVERY FAILURE IS A VALUE, NOT A THROW. A payment route that throws on a
 * network blip returns a 500, and a 500 on a checkout is a lost customer and
 * a webhook Creem will retry forever. Each call returns a tagged result the
 * caller must handle, and never includes Creem's raw error text in anything
 * a merchant could see — a provider's error message is not ours to show
 * (CLAUDE.md), so the text is logged and a reason code is returned.
 */

import { creemApiBase, creemApiKey, creemReadiness } from './config'

/** Our own timeout. Creem's API is normally fast; a checkout that hangs is
 *  worse than one that fails, because the customer sits on a dead button. */
const TIMEOUT_MS = 15_000

export type CreemFailure =
  | 'not_configured'
  | 'timeout'
  | 'network'
  | 'unauthorized'
  | 'not_found'
  | 'rejected'
  | 'malformed_response'

export type CreemResult<T> = { ok: true; value: T } | { ok: false; reason: CreemFailure }

export interface CreemCheckoutSession {
  id: string
  /** Where the browser is sent to pay. */
  checkoutUrl: string
}

export interface CreemSubscriptionSnapshot {
  id: string
  status: string
  /** The product id, which is how we resolve the plan we grant. */
  productId: string | null
  customerId: string | null
  /** Creem's own period end, used as the entitlement's period end, never a
   *  locally computed +1 month (the replay bug PayPal's path already fixed). */
  currentPeriodEnd: string | null
  currentPeriodStart: string | null
  /** What we attached at checkout, echoed back. Only ever read for OUR
   *  reference id, and never trusted as an authorisation on its own. */
  metadata: Record<string, unknown> | null
}

/** An object field, whether Creem sends `product` as an id or as an object. */
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

async function creemFetch(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<CreemResult<unknown>> {
  const readiness = creemReadiness()
  const key = creemApiKey()
  if (!readiness.enabled || !key) {
    console.warn('[creem] call refused: not configured', { missing: readiness.missing, enabled: readiness.enabled })
    return { ok: false, reason: 'not_configured' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${creemApiBase()}${path}`, {
      method: init.method,
      headers: {
        'x-api-key': key,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    console.error('[creem] request failed', { path, aborted })
    return { ok: false, reason: aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    // Creem's wording is logged for us and never returned to a merchant.
    const text = await response.text().catch(() => '')
    console.error('[creem] request rejected', { path, status: response.status, body: text.slice(0, 500) })
    if (response.status === 401 || response.status === 403) return { ok: false, reason: 'unauthorized' }
    if (response.status === 404) return { ok: false, reason: 'not_found' }
    return { ok: false, reason: 'rejected' }
  }

  try {
    return { ok: true, value: await response.json() }
  } catch {
    console.error('[creem] response was not JSON', { path })
    return { ok: false, reason: 'malformed_response' }
  }
}

/**
 * Open a checkout for one product.
 *
 * `requestId` is OUR reference for this attempt (the account id). Creem
 * echoes it back on the checkout and in webhooks, which is how a completed
 * payment is tied to an account — but it is a LOOKUP KEY, not a credential:
 * the entitlement is still granted only after the subscription is read back
 * from Creem.
 */
export async function createCreemCheckout(params: {
  productId: string
  successUrl: string
  requestId: string
  customerEmail?: string | null
  metadata?: Record<string, string>
}): Promise<CreemResult<CreemCheckoutSession>> {
  const result = await creemFetch('/v1/checkouts', {
    method: 'POST',
    body: {
      product_id: params.productId,
      success_url: params.successUrl,
      request_id: params.requestId,
      ...(params.customerEmail ? { customer: { email: params.customerEmail } } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    },
  })
  if (!result.ok) return result

  const body = result.value as Record<string, unknown>
  // Creem's REST body is snake_case; its SDK surfaces camelCase. Accept both
  // rather than depending on which one a given version sends.
  const checkoutUrl = stringOf(body.checkout_url) ?? stringOf(body.checkoutUrl)
  const id = stringOf(body.id)
  if (!checkoutUrl || !id) {
    console.error('[creem] checkout response had no url or id')
    return { ok: false, reason: 'malformed_response' }
  }
  return { ok: true, value: { id, checkoutUrl } }
}

/**
 * Read a subscription back from Creem. This is the authoritative source for
 * the plan granted and for the period stored — nothing from a webhook body
 * or a browser is used for either.
 */
export async function fetchCreemSubscription(
  subscriptionId: string,
): Promise<CreemResult<CreemSubscriptionSnapshot>> {
  const id = subscriptionId?.trim()
  if (!id) return { ok: false, reason: 'not_found' }

  // The id is a QUERY parameter on this endpoint, not a path segment.
  const result = await creemFetch(`/v1/subscriptions?subscription_id=${encodeURIComponent(id)}`, { method: 'GET' })
  if (!result.ok) return result

  const body = result.value as Record<string, unknown>
  const status = stringOf(body.status)
  const returnedId = stringOf(body.id)
  if (!status || !returnedId) {
    console.error('[creem] subscription response had no id or status')
    return { ok: false, reason: 'malformed_response' }
  }
  // A response about a DIFFERENT subscription is never accepted: it would
  // mean granting one account's plan from another account's payment.
  if (returnedId !== id) {
    console.error('[creem] subscription response was for another id')
    return { ok: false, reason: 'malformed_response' }
  }

  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? (body.metadata as Record<string, unknown>)
    : null

  return {
    ok: true,
    value: {
      id: returnedId,
      status,
      productId: idOf(body.product),
      customerId: idOf(body.customer),
      currentPeriodStart: stringOf(body.current_period_start_date) ?? stringOf(body.current_period_start),
      currentPeriodEnd: stringOf(body.current_period_end_date) ?? stringOf(body.current_period_end),
      metadata,
    },
  }
}
