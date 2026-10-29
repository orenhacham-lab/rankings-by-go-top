/**
 * An external marketplace posts its purchase callbacks here —
 * POST /api/marketplace/<provider>/webhook.
 *
 * THIS ROUTE AUTHENTICATES ITSELF. proxy.ts's matcher excludes /api/*, so
 * there is nothing in front of this endpoint: the signature check below is
 * the only thing between the open internet and a recorded paid order.
 * Everything it rejects is rejected BEFORE the body is parsed as an event.
 *
 * OFF MEANS OFF, AND UNCONFIGURED MEANS OFF. A provider must be registered,
 * switched on, hold a webhook secret, have a KNOWN signature scheme and have
 * a parser before a single delivery is looked at (lib/marketplace/config.ts,
 * lib/marketplace/intake.ts). Only JVZoo has a scheme and a parser, both read
 * from the IPN v2 spec inside the seller account; ClickBank and Digistore24
 * have neither, because neither may be guessed, so this route refuses every
 * one of their deliveries by design. That is the safe direction: a
 * half-configured marketplace must never record an order it cannot describe.
 *
 * THE SIGNATURE IS OVER THE RAW BODY. `request.text()` is read once and that
 * exact string is what gets verified, never a re-serialised object. Where a
 * platform puts its digest in the body instead of a header (JVZoo's
 * `cverify`), the verifier reads it out of that same raw string — the parser
 * still never runs before the check passes.
 *
 * WHAT THE STATUS CODE MEANS TO THE PLATFORM. All of these platforms retry a
 * non-2xx on their own schedule, so 2xx is reserved for a delivery that was
 * processed or that we deliberately did nothing about. A refused signature
 * answers 401 — no retry will fix it, and it must never read as handled. A
 * provider that is off answers 503, because a retry after it is switched on
 * SHOULD succeed. A failed write answers 500 so the retry can recover it.
 *
 * NOTHING IS GRANTED HERE. A paid order becomes a row awaiting its buyer; the
 * entitlement is written when the buyer claims it with an account of their
 * own. See the migration's header for why that is the design.
 *
 * AND THE BUYER HAS TO BE GIVEN THAT ROW. The claim token is useless to the
 * person who paid for it unless something hands them the link, and until now
 * nothing did: the order was recorded, `claimUrl` was returned here and
 * discarded, and the buyer landed on the product's return URL with no plan.
 * So a recorded order now sends the claim email (lib/marketplace/claim-email.ts)
 * in `after()`, AFTER this route has already answered the platform — the
 * delivery was processed either way, and a provider that refuses the email
 * must not turn a correct row into a retried webhook. A send that fails
 * alerts the operator with the order id, which is enough to resend by hand.
 */
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  marketplaceProvider,
  marketplaceWebhookSecret,
  providerReadiness,
} from '@/lib/marketplace/config'
import { verifyMarketplaceSignature } from '@/lib/marketplace/signature'
import {
  httpStatusForMarketplaceOutcome,
  marketplaceParser,
  recordMarketplaceOrder,
} from '@/lib/marketplace/intake'
import { alertClaimEmailFailed, sendClaimEmail } from '@/lib/marketplace/claim-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await params
    return await handle(request, provider)
  } catch (error) {
    // An unexpected throw says nothing about the delivery's authenticity, so
    // it is a retryable failure rather than a silent 200.
    console.error('[marketplace-webhook] unexpected exception', {
      name: error instanceof Error ? error.name : 'unknown',
    })
    return Response.json({ error: 'unexpected_error' }, { status: 500 })
  }
}

async function handle(request: Request, slug: string): Promise<Response> {
  const provider = marketplaceProvider(slug)
  // An unregistered slug is not told apart from a disabled one by the caller:
  // both are simply not serving.
  if (!provider) return Response.json({ error: 'not_enabled' }, { status: 503 })

  const readiness = providerReadiness(provider.slug)
  const parser = marketplaceParser(provider.slug)
  if (!readiness.ready || !parser) {
    // The missing pieces are logged by NAME — never a value — so an operator
    // can see what to set without the secret passing through a log line.
    console.warn('[marketplace-webhook] delivery refused: provider not ready', {
      provider: provider.slug,
      missing: readiness.missing,
      parser: parser ? 'present' : 'missing',
    })
    return Response.json({ error: 'not_enabled' }, { status: 503 })
  }

  const rawBody = await request.text()
  const scheme = provider.signature
  const verified = verifyMarketplaceSignature(
    rawBody,
    // A field-digest scheme carries its digest in the body, not a header.
    scheme && scheme.kind === 'hmac_header' ? request.headers.get(scheme.header) : null,
    marketplaceWebhookSecret(provider.slug),
    scheme,
  )
  if (!verified.ok) {
    console.warn('[marketplace-webhook] delivery refused', {
      provider: provider.slug,
      reason: verified.reason,
    })
    // Our own misconfiguration is not the caller's fault and a retry may
    // succeed; a bad or absent signature is final.
    const status = verified.reason === 'missing_secret' || verified.reason === 'unknown_scheme' ? 503 : 401
    return Response.json({ error: 'unauthorized' }, { status })
  }

  const event = parser(rawBody, request.headers.get('content-type'))
  // A body the parser does not recognise is not an error: these platforms
  // send notification types we have no business acting on.
  if (!event) return Response.json({ ok: true, ignored: true }, { status: 200 })

  const outcome = await recordMarketplaceOrder(createAdminClient(), provider.slug, event)
  if (outcome.kind !== 'recorded' && outcome.kind !== 'already_recorded') {
    // Logged with the outcome and the platform's own order id, and nothing
    // about the buyer.
    console.error('[marketplace-webhook] order not recorded', {
      provider: provider.slug,
      outcome: outcome.kind,
    })
  }

  // A redelivery is deliberately NOT a second email: `already_recorded` means
  // the first delivery minted the token the buyer was mailed, and this one
  // has no URL to send.
  if (outcome.kind === 'recorded') {
    const orderId = outcome.orderId
    const claimUrl = outcome.claimUrl
    const plan = outcome.plan
    const buyerEmail = event.buyerEmail ?? ''
    after(async () => {
      const result = await sendClaimEmail(buyerEmail, {
        claimUrl,
        plan,
        providerLabel: provider.label,
      })
      if (result.sent) return
      // The reason, the provider and the order id. Never the address and
      // never the token.
      console.error('[marketplace-webhook] claim email not sent', {
        provider: provider.slug,
        orderId,
        reason: result.reason,
      })
      await alertClaimEmailFailed({ orderId, providerLabel: provider.label, reason: result.reason })
    })
  }

  return Response.json({ ok: outcome.kind !== 'write_failed', outcome: outcome.kind }, {
    status: httpStatusForMarketplaceOutcome(outcome),
  })
}
