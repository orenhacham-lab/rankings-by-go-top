import { createAdminClient } from '@/lib/supabase/admin'
import { creemWebhookSecret, isCreemEnabled } from '@/lib/creem/config'
import { CREEM_SIGNATURE_HEADER, verifyCreemSignature } from '@/lib/creem/signature'
import { fetchCreemSubscription } from '@/lib/creem/client'
import {
  httpStatusForCreemOutcome,
  processVerifiedCreemEvent,
  type CreemWebhookEvent,
} from '@/lib/creem/webhook-processing'

/**
 * Creem posts its webhook events here.
 *
 * THIS ROUTE AUTHENTICATES ITSELF. proxy.ts's matcher excludes /api/*, so
 * there is nothing in front of this endpoint: the signature check below is
 * the only thing between the open internet and a customer's entitlement.
 * Everything it rejects is rejected BEFORE the body is parsed as an event.
 *
 * THE SIGNATURE IS OVER THE RAW BODY. `request.text()` is read once and the
 * exact string is what gets verified — never a re-serialised object, whose
 * key order and number formatting would not reproduce Creem's digest.
 *
 * OFF MEANS OFF. While CREEM_ENABLED is not 'true', a delivery is refused
 * with a retryable status and nothing is read or written. A half-configured
 * Creem must never grant a plan, and PayPal remains the live provider for
 * every customer outside Israel.
 *
 * WHAT THE STATUS CODE MEANS TO CREEM. Creem retries a non-2xx on its own
 * schedule (initial, +30s, +5m, +30m, +6h, then nothing after 24h), so 2xx
 * is reserved for an event that was processed or that we deliberately did
 * nothing about. A failed write, an unreachable Creem and a raced renewal
 * all answer non-2xx so the retry has a chance to recover them; a refused
 * signature does too, though no retry will fix that — it must simply never
 * read as handled. lib/creem/webhook-processing.ts maps each outcome.
 */
export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (error) {
    // An unexpected throw says nothing about the event's authenticity, so it
    // is a retryable failure rather than a silent 200.
    console.error('[creem-webhook] unexpected exception', {
      name: error instanceof Error ? error.name : 'unknown',
    })
    return Response.json({ error: 'unexpected_error' }, { status: 500 })
  }
}

async function handle(request: Request): Promise<Response> {
  if (!isCreemEnabled()) {
    console.warn('[creem-webhook] delivery refused: CREEM_ENABLED is off')
    return Response.json({ error: 'not_enabled' }, { status: 503 })
  }

  const secret = creemWebhookSecret()
  if (!secret) {
    // Our own misconfiguration. Never processed unverified.
    console.error('[creem-webhook] CREEM_WEBHOOK_SECRET is not set — no delivery can be verified')
    return Response.json({ error: 'webhook_not_configured' }, { status: 500 })
  }

  const rawBody = await request.text()
  const verification = verifyCreemSignature(rawBody, request.headers.get(CREEM_SIGNATURE_HEADER), secret)
  if (!verification.ok) {
    // The reason is logged for us and never returned: a caller probing this
    // endpoint learns only that it was refused.
    console.warn('[creem-webhook] signature refused', { reason: verification.reason })
    return Response.json({ error: 'invalid_signature' }, { status: 401 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    // Signed by Creem but not JSON. Retrying will not change that.
    console.warn('[creem-webhook] verified delivery was not JSON')
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  // From here the delivery is confirmed to be Creem's.
  const admin = createAdminClient()
  const outcome = await processVerifiedCreemEvent(admin, parsed as CreemWebhookEvent, {
    fetchSubscription: (subscriptionId) => fetchCreemSubscription(subscriptionId),
  })

  const status = httpStatusForCreemOutcome(outcome)
  if (status >= 500) console.error('[creem-webhook] processing failed', outcome)
  else if (status >= 400) console.warn('[creem-webhook] nothing granted', outcome)
  else if (outcome.kind === 'operator_attention') console.warn('[creem-webhook] needs a human', outcome)
  else if (outcome.kind === 'activated') console.log('[creem-webhook] plan granted', outcome)

  return Response.json(status >= 400 ? { error: outcome.kind } : { status: 'received' }, { status })
}
