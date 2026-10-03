/**
 * w21 — Paddle Billing configuration. EVERY value is optional and the whole
 * feature FAILS CLOSED: unless NEXT_PUBLIC_PADDLE_ENABLED is exactly "true"
 * AND every required value is present (and the four price ids are distinct),
 * the billing screen is the PayPal screen it was before Paddle existed.
 *
 * Paddle is the merchant of record (it charges, collects/remits VAT and sales
 * tax per country and invoices the customer). One Paddle price id per plan;
 * Paddle itself picks USD or the ILS override by the buyer's country, so
 * there is no per-market price table here and NO price amounts anywhere in
 * this module: the amounts live in Paddle and in lib/plans/catalog.ts only.
 *
 * NEXT_PUBLIC_* names are read with LITERAL `process.env.X` expressions so
 * Next can inline them; the decision itself is the pure `resolvePaddleConfig`.
 */

import { PLAN_CODES, isPlanCode, type PlanCode } from '@/lib/plans/catalog'

export type PaddleEnvironment = 'sandbox' | 'production'

export interface PaddleEnvSnapshot {
  enabled: string | undefined
  environment: string | undefined
  clientToken: string | undefined
  apiKey: string | undefined
  webhookSecret: string | undefined
  prices: Record<PlanCode, string | undefined>
}

/** What the browser needs to open a checkout. Never carries a secret. */
export interface PaddleCheckoutConfig {
  environment: PaddleEnvironment
  clientToken: string
  prices: Record<PlanCode, string>
}

export type PaddleConfigDecision =
  | { enabled: true; checkout: PaddleCheckoutConfig }
  | { enabled: false; reason: 'flag_off' | 'bad_environment' | 'missing_client_token' | 'missing_api_key' | 'missing_webhook_secret' | 'missing_price' | 'duplicate_price' }

/** The live environment, read by name (no secret is logged or returned by callers). */
export function paddleEnvSnapshot(): PaddleEnvSnapshot {
  return {
    enabled: process.env.NEXT_PUBLIC_PADDLE_ENABLED,
    environment: process.env.NEXT_PUBLIC_PADDLE_ENV,
    clientToken: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    apiKey: process.env.PADDLE_API_KEY,
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET,
    prices: {
      regular: process.env.NEXT_PUBLIC_PADDLE_PRICE_REGULAR,
      advanced: process.env.NEXT_PUBLIC_PADDLE_PRICE_ADVANCED,
      premium: process.env.NEXT_PUBLIC_PADDLE_PRICE_PREMIUM,
      large_agency: process.env.NEXT_PUBLIC_PADDLE_PRICE_LARGE_AGENCY,
    },
  }
}

const clean = (v: string | undefined): string => (typeof v === 'string' ? v.trim() : '')

export function parsePaddleEnvironment(v: string | undefined): PaddleEnvironment | null {
  const s = clean(v)
  return s === 'sandbox' || s === 'production' ? s : null
}

/** The four price ids, or null if any is missing or two plans share one. */
function priceTable(prices: PaddleEnvSnapshot['prices']): Record<PlanCode, string> | 'missing_price' | 'duplicate_price' {
  const out = {} as Record<PlanCode, string>
  for (const code of PLAN_CODES) {
    const id = clean(prices[code])
    if (!id) return 'missing_price'
    out[code] = id
  }
  if (new Set(Object.values(out)).size !== PLAN_CODES.length) return 'duplicate_price'
  return out
}

/**
 * PURE. On only when the flag is exactly "true" and the checkout can really
 * complete end to end: the client token (overlay), the API key (customer
 * portal + authoritative re-read of each webhook), the webhook secret (so a
 * payment is recorded) and all four distinct price ids.
 */
export function resolvePaddleConfig(env: PaddleEnvSnapshot): PaddleConfigDecision {
  if (clean(env.enabled) !== 'true') return { enabled: false, reason: 'flag_off' }
  const environment = parsePaddleEnvironment(env.environment)
  if (!environment) return { enabled: false, reason: 'bad_environment' }
  const clientToken = clean(env.clientToken)
  if (!clientToken) return { enabled: false, reason: 'missing_client_token' }
  if (!clean(env.apiKey)) return { enabled: false, reason: 'missing_api_key' }
  if (!clean(env.webhookSecret)) return { enabled: false, reason: 'missing_webhook_secret' }
  const prices = priceTable(env.prices)
  if (typeof prices === 'string') return { enabled: false, reason: prices }
  return { enabled: true, checkout: { environment, clientToken, prices } }
}

/**
 * SERVER-SIDE price id -> plan code. The ONLY source of a Paddle row's
 * plan_code (never the checkout's custom_data). An unknown, empty or
 * ambiguous id answers null. Independent of the UI flag: a subscriber who
 * bought while it was on keeps being served after it is turned off.
 */
export function planCodeForPaddlePriceId(priceId: unknown, prices: PaddleEnvSnapshot['prices'] = paddleEnvSnapshot().prices): PlanCode | null {
  if (typeof priceId !== 'string' || !priceId.trim()) return null
  const hits = PLAN_CODES.filter((code) => clean(prices[code]) !== '' && clean(prices[code]) === priceId.trim())
  return hits.length === 1 && isPlanCode(hits[0]) ? hits[0] : null
}

/** Paddle's API host for an environment (from Paddle's own SDK constants). */
export function paddleApiBase(environment: PaddleEnvironment): string {
  return environment === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'
}

/** The official Paddle.js v2 script (the URL Paddle's own @paddle/paddle-js loader injects). */
export const PADDLE_JS_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js'
