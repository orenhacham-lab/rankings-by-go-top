import { createAdminClient } from '@/lib/supabase/admin'
import { extractPayPalWebhookHeaders, verifyPayPalWebhookSignature, fetchAuthoritativeNextBillingTime } from '@/lib/paypal/client'
import { processVerifiedPayPalWebhookEvent, httpStatusForOutcome, type PayPalWebhookEvent } from '@/lib/paypal/webhook-processing'

/**
 * PayPal sends webhook events to this endpoint.
 *
 * Phase 1 hardening (goals F/G): every request is now verified against
 * PayPal's official verify-webhook-signature API before any subscription
 * data is touched — previously this endpoint trusted any POST body claiming
 * to be a PayPal event, with no signature check at all. The DB-side
 * processing (lib/paypal/webhook-processing.ts) checks every Supabase call's
 * `error` explicitly (previously discarded, including on the RENEWED/
 * PAYMENT.SALE.COMPLETED update, which wrote to nonexistent columns and
 * failed silently every time).
 *
 * Response contract (goal G): 2xx ONLY for a verified event that was
 * successfully processed, or a verified event we deliberately ignore
 * (unknown subscription id, unrecognized event type, malformed-but-signed
 * body). Everything else — missing/invalid signature, a verification-call
 * failure, or a DB write failure on a verified event — returns a non-2xx so
 * PayPal's own retry mechanism has a chance to recover it. This REVERSES the
 * prior "always return 200 to prevent PayPal retries" behavior, which is
 * exactly backwards for a retryable failure.
 */
export async function POST(request: Request) {
  try {
    return await handle(request)
  } catch (err) {
    // An unexpected throw is still a PROCESSING failure, not proof the event
    // was bogus — retryable, so non-2xx (reverses the old always-200 catch).
    const message = err instanceof Error ? err.message : 'unknown_error'
    console.error('[paypal-webhook] unexpected exception', { message })
    return Response.json({ error: 'unexpected_error' }, { status: 500 })
  }
}

async function handle(request: Request): Promise<Response> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) {
    console.error('[paypal-webhook] PAYPAL_WEBHOOK_ID is not configured — cannot verify any event')
    return Response.json({ error: 'webhook_not_configured' }, { status: 500 })
  }

  const headers = extractPayPalWebhookHeaders(request.headers)
  if (!headers) {
    console.warn('[paypal-webhook] missing required PayPal transmission headers')
    return Response.json({ error: 'missing_signature_headers' }, { status: 400 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await request.text())
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const verification = await verifyPayPalWebhookSignature({ headers, webhookEvent: parsed, webhookId })
  if (verification === 'error') {
    // Our own call to PayPal's verification API failed (network/config) — not
    // a statement about the event's authenticity. Retryable.
    console.error('[paypal-webhook] verification call failed (transport/config)')
    return Response.json({ error: 'verification_unavailable' }, { status: 502 })
  }
  if (verification === 'unverified') {
    // PayPal explicitly rejected the signature. Never mutate on this branch.
    console.warn('[paypal-webhook] signature verification failed — rejecting')
    return Response.json({ error: 'invalid_signature' }, { status: 401 })
  }

  // From here on, the event is CONFIRMED genuine per PayPal's own API.
  const admin = createAdminClient()
  const outcome = await processVerifiedPayPalWebhookEvent(admin, parsed as PayPalWebhookEvent, {
    fetchAuthoritativeNextBillingTime: (subscriptionId) => fetchAuthoritativeNextBillingTime(subscriptionId),
  })

  if (outcome.kind === 'lookup_failed' || outcome.kind === 'update_failed' || outcome.kind === 'unmappable_subscription_reference' || outcome.kind === 'renewal_date_unavailable') {
    console.error('[paypal-webhook] processing failed', outcome)
  } else if (outcome.kind === 'ignored_unknown_subscription') {
    console.warn('[paypal-webhook] unknown subscription', outcome)
  }

  const isError = outcome.kind === 'update_failed' || outcome.kind === 'lookup_failed'
    || outcome.kind === 'unmappable_subscription_reference' || outcome.kind === 'renewal_date_unavailable'
  return Response.json(
    isError ? { error: outcome.kind } : { status: 'received' },
    { status: httpStatusForOutcome(outcome) },
  )
}
