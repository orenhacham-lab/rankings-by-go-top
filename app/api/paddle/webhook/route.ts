import { createAdminClient } from '@/lib/supabase/admin'
import { PADDLE_SIGNATURE_HEADER, verifyPaddleSignature } from '@/lib/paddle/signature'
import { processVerifiedPaddleEvent, httpStatusForPaddleOutcome, type PaddleWebhookEvent } from '@/lib/paddle/webhook-processing'
import { fetchPaddleSubscription, paddleApiContextFromEnv } from '@/lib/paddle/api'
import { planCodeForPaddlePriceId } from '@/lib/paddle/config'
import { isShopifyBillingRequiredForUser } from '@/lib/shopify/paypal-block'
import { lockBillingMarket } from '@/lib/billing/billing-market-selection'
import { storedMarketOf, STORED_MARKET_KEY } from '@/lib/billing/server-market'

/**
 * w21 — Paddle Billing webhooks. proxy.ts does not cover /api, so this route
 * authenticates every request itself: the Paddle-Signature header (HMAC-SHA256
 * over `ts:rawBody` with PADDLE_WEBHOOK_SECRET, constant-time compare, a
 * timestamp more than 5 minutes off is refused). Nothing is parsed or written
 * before the signature verifies.
 *
 * Deliberately NOT gated on NEXT_PUBLIC_PADDLE_ENABLED: that flag decides
 * whether NEW buyers see the Paddle checkout. A subscriber who bought while it
 * was on must keep receiving renewals and cancellations after it is turned off.
 * Without the secret or the API key it FAILS CLOSED (500, nothing written).
 *
 * Response contract (as PayPal's): 2xx for a handled or deliberately ignored
 * event, non-2xx for anything Paddle should retry. Bodies carry our codes only.
 */
export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (err) {
    console.error('[paddle-webhook] unexpected exception', { message: err instanceof Error ? err.message : 'unknown' })
    return Response.json({ error: 'unexpected_error' }, { status: 500 })
  }
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  const apiCtx = paddleApiContextFromEnv()
  if (!secret?.trim() || !apiCtx) {
    console.error('[paddle-webhook] PADDLE_WEBHOOK_SECRET / PADDLE_API_KEY / NEXT_PUBLIC_PADDLE_ENV not configured — refusing every event')
    return Response.json({ error: 'webhook_not_configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const verified = verifyPaddleSignature(rawBody, request.headers.get(PADDLE_SIGNATURE_HEADER), secret)
  if (!verified.ok) {
    console.warn('[paddle-webhook] signature rejected', { reason: verified.reason })
    return Response.json({ error: 'invalid_signature' }, { status: 401 })
  }

  let event: PaddleWebhookEvent
  try {
    event = JSON.parse(rawBody) as PaddleWebhookEvent
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const admin = createAdminClient()
  const outcome = await processVerifiedPaddleEvent(admin, event, {
    fetchSubscription: (id) => fetchPaddleSubscription(apiCtx, id),
    planCodeForPriceId: (priceId) => planCodeForPaddlePriceId(priceId),
    isShopifyGoverned: (userId) => isShopifyBillingRequiredForUser(admin, userId),
    lockMarket: async (userId, market) => {
      const { data: live, error } = await admin.auth.admin.getUserById(userId)
      if (error || !live?.user) return { kind: 'claim_failed' }
      return lockBillingMarket(storedMarketOf(live.user), market, {
        isShopifyGoverned: () => isShopifyBillingRequiredForUser(admin, userId),
        claimSelectionSlot: async () => {
          const { data, error: claimError } = await admin
            .from('profiles')
            .update({ billing_market_claimed_at: new Date().toISOString() })
            .eq('id', userId)
            .is('billing_market_claimed_at', null)
            .select('id')
          if (claimError) return { ok: false, message: claimError.message }
          return { ok: true, wonClaim: !!data && data.length > 0 }
        },
        releaseSelectionSlot: async () => {
          await admin.from('profiles').update({ billing_market_claimed_at: null }).eq('id', userId)
        },
        persistMarket: async (m) => {
          const { error: persistError } = await admin.auth.admin.updateUserById(userId, { app_metadata: { [STORED_MARKET_KEY]: m } })
          if (persistError) return { ok: false, message: persistError.message }
          return { ok: true }
        },
      })
    },
  })

  const status = httpStatusForPaddleOutcome(outcome)
  const log = { eventId: typeof event.event_id === 'string' ? event.event_id : null, eventType: event.event_type ?? null, outcome }
  if (status >= 500) console.error('[paddle-webhook] processing failed', log)
  else if (outcome.kind === 'refused_shopify_governed' || outcome.kind === 'refused_other_paid_subscription' || outcome.kind === 'ignored_unknown_price' || outcome.kind === 'ignored_unlinkable') console.error('[paddle-webhook] paid subscription NOT applied — needs a person', log)
  else if (outcome.kind === 'linked' && outcome.lock !== 'persisted' && outcome.lock !== 'already_set') console.error('[paddle-webhook] billing market not locked', log)
  else console.log('[paddle-webhook]', log)

  return Response.json(status === 200 ? { status: 'received' } : { error: outcome.kind }, { status })
}
