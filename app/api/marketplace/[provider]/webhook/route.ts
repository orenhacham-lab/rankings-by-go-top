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
 * lib/marketplace/intake.ts). No provider currently has a scheme or a parser,
 * because neither may be guessed — they are read from the platform's own
 * documentation — so today this route refuses every delivery, by design.
 * That is the safe direction: a half-configured marketplace must never
 * record an order it cannot describe.
 *
 * THE SIGNATURE IS OVER THE RAW BODY. `request.text()` is read once and that
 * exact string is what gets verified, never a re-serialised object.
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
 */
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
    scheme ? request.headers.get(scheme.header) : null,
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
  return Response.json({ ok: outcome.kind !== 'write_failed', outcome: outcome.kind }, {
    status: httpStatusForMarketplaceOutcome(outcome),
  })
}
