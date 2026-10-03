/**
 * w21 — the two Paddle Billing API calls this app makes, server-side only
 * (PADDLE_API_KEY never reaches the browser):
 *   GET  /subscriptions/{id}                       authoritative re-read for each webhook
 *   POST /customers/{customer_id}/portal-sessions  "manage subscription" link
 * Endpoints, the bearer header and the snake_case body are those of Paddle's
 * own Node SDK (@paddle/paddle-node-sdk 3.x, resources/subscriptions and
 * resources/customer-portal-sessions). Every failure answers { ok: false,
 * reason } with OUR reason code; Paddle's own error text is only logged.
 */

import { paddleApiBase, parsePaddleEnvironment, type PaddleEnvironment } from '@/lib/paddle/config'
import type { PaddleSubscription } from '@/lib/paddle/webhook-processing'

type FetchLike = typeof fetch

export interface PaddleApiContext {
  apiKey: string
  environment: PaddleEnvironment
  fetchImpl?: FetchLike
}

/** The server's Paddle API context, or null when it is not configured. */
export function paddleApiContextFromEnv(): PaddleApiContext | null {
  const apiKey = process.env.PADDLE_API_KEY?.trim()
  const environment = parsePaddleEnvironment(process.env.NEXT_PUBLIC_PADDLE_ENV)
  if (!apiKey || !environment) return null
  return { apiKey, environment }
}

const SAFE_ID = /^[a-z]{2,4}_[a-z0-9]{10,64}$/i

async function call(ctx: PaddleApiContext, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
  const f = ctx.fetchImpl ?? fetch
  let res: Response
  try {
    res = await f(`${paddleApiBase(ctx.environment)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${ctx.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
  } catch (err) {
    console.error('[paddle-api] request failed', { path, message: err instanceof Error ? err.message : 'unknown' })
    return { ok: false, reason: 'network' }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[paddle-api] non-2xx', { path, status: res.status, body: text.slice(0, 300) })
    return { ok: false, reason: `http_${res.status}` }
  }
  const json = await res.json().catch(() => null) as { data?: unknown } | null
  if (!json || typeof json !== 'object' || !json.data || typeof json.data !== 'object') return { ok: false, reason: 'bad_response' }
  return { ok: true, data: json.data }
}

export async function fetchPaddleSubscription(ctx: PaddleApiContext, subscriptionId: string): Promise<{ ok: true; subscription: PaddleSubscription } | { ok: false; reason: string }> {
  if (!SAFE_ID.test(subscriptionId)) return { ok: false, reason: 'bad_subscription_id' }
  const r = await call(ctx, 'GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`)
  if (!r.ok) return r
  const sub = r.data as PaddleSubscription
  if (typeof sub.id !== 'string' || typeof sub.status !== 'string') return { ok: false, reason: 'bad_response' }
  return { ok: true, subscription: sub }
}

/** Hosts a portal link may point at (Paddle's customer portal, live or sandbox). */
export function isPaddlePortalUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'paddle.com' || u.hostname.endsWith('.paddle.com'))
  } catch {
    return false
  }
}

export async function createPaddlePortalSession(ctx: PaddleApiContext, customerId: string, subscriptionIds: string[]): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!SAFE_ID.test(customerId) || subscriptionIds.some((id) => !SAFE_ID.test(id))) return { ok: false, reason: 'bad_id' }
  const r = await call(ctx, 'POST', `/customers/${encodeURIComponent(customerId)}/portal-sessions`, { subscription_ids: subscriptionIds })
  if (!r.ok) return r
  const url = (r.data as { urls?: { general?: { overview?: unknown } } }).urls?.general?.overview
  if (!isPaddlePortalUrl(url)) return { ok: false, reason: 'bad_portal_url' }
  return { ok: true, url }
}
