import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isKnownPlanCode } from '@/lib/paypal/client'
import { isShopifyBillingRequiredForUser } from '@/lib/shopify/paypal-block'
import { hasPendingShopifyLinkCookie } from '@/lib/shopify/pending-link'
import { resolveBillingMarket, storedMarketOf } from '@/lib/billing/server-market'
import { logRestrictedAttempt, restrictionForRequest } from '@/lib/sanctions/guard'
import { createCreemCheckout } from '@/lib/creem/client'
import { creemProductIdFor } from '@/lib/creem/checkout-products'
import { creemMayWriteToAccount, creemReadiness, creemSuccessUrl, isCreemEnabled } from '@/lib/creem/config'

/**
 * Opens a Creem checkout for one plan and hands the browser the URL to pay
 * at. It grants nothing: the entitlement is written only when Creem reports
 * the completed checkout to /api/creem/webhook, from a server-side read of
 * the subscription.
 *
 * THIS ROUTE AUTHENTICATES ITSELF, like every route in this app —
 * proxy.ts's matcher excludes /api/*. A caller with no session gets 401
 * before anything else happens.
 *
 * THE GATES, IN THIS ORDER, AND WHY
 *
 *  1. CREEM_ENABLED. Off means this endpoint does nothing at all. PayPal is
 *     the live provider and a half-configured Creem must never take a
 *     checkout away from one that works.
 *  2. The sanctions list, before the session is even read: taking money from
 *     a restricted country is the dealing the Trading with the Enemy
 *     Ordinance makes criminal. The payer is never told which country.
 *  3. Shopify. The same rule PayPal's activation route enforces: any Shopify
 *     store connected to this account means billing goes through Shopify,
 *     and a pending install in this browser counts too.
 *  4. The market. Creem is the USD path only. Israel is always PayPal
 *     (lib/creem/checkout-products.ts), so an ILS account is refused here
 *     rather than quietly charged in the wrong currency.
 *
 * NOTHING THE CALLER SENDS BECOMES A URL. The return URL is built from our
 * own canonical origin (lib/creem/config.ts), never from the request.
 *
 * NOTHING THE CALLER SENDS BECOMES A PRICE. The product id comes from our
 * own configuration for the requested plan code; a plan with no configured
 * product is refused, never substituted with another plan's product.
 */
export async function POST(request: Request) {
  try {
    if (!isCreemEnabled()) {
      return Response.json({ error: 'Not available', reason: 'creem_not_enabled' }, { status: 503 })
    }

    const restricted = restrictionForRequest(request.headers)
    if (restricted) {
      logRestrictedAttempt('creem-checkout', restricted)
      return Response.json({ error: 'Not available', reason: 'restricted_country' }, { status: 451 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const plan = (body as { plan?: unknown } | null)?.plan
    if (!isKnownPlanCode(plan)) {
      return Response.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (await isShopifyBillingRequiredForUser(admin, user.id)) {
      console.warn('[creem-checkout] blocked: account is billed through Shopify', { userId: user.id })
      return Response.json({ error: 'Shopify billing required', reason: 'shopify_store_connected' }, { status: 403 })
    }
    if (hasPendingShopifyLinkCookie(request)) {
      console.warn('[creem-checkout] blocked: pending Shopify install/link in this browser', { userId: user.id })
      return Response.json({ error: 'Shopify billing required', reason: 'shopify_link_pending' }, { status: 403 })
    }

    // Israel is always PayPal. The stored market decides when there is one
    // (it locks at the first checkout), otherwise the server-resolved market.
    const stored = storedMarketOf(user)
    const market = stored ?? (await resolveBillingMarket(supabase, user).catch(() => null))?.market ?? null
    if (market === 'ILS') {
      console.warn('[creem-checkout] refused: this account bills in ILS, which is the PayPal path', { userId: user.id })
      return Response.json({ error: 'Not available', reason: 'market_not_supported' }, { status: 409 })
    }

    // In sandbox mode this route serves ONLY the configured test accounts
    // (lib/creem/config.ts), so a real visitor can never be handed a sandbox
    // checkout and be left thinking they have paid. Inert in live mode. This
    // is what makes it safe to point Creem's test environment at a real
    // domain for an end-to-end run, instead of weakening the deployment
    // protection that covers everything else.
    if (!creemMayWriteToAccount(user.id)) {
      console.warn('[creem-checkout] refused: sandbox mode serves only the configured test accounts', { userId: user.id })
      return Response.json({ error: 'Not available', reason: 'sandbox_mode' }, { status: 503 })
    }

    const productId = creemProductIdFor(plan)
    if (!productId) {
      // A plan whose product id is not configured. Another plan's product is
      // never substituted: it would charge the wrong price.
      const readiness = creemReadiness()
      console.error('[creem-checkout] no Creem product configured for this plan', { plan, mode: readiness.mode })
      return Response.json({ error: 'Not available', reason: 'plan_not_configured' }, { status: 503 })
    }

    const checkout = await createCreemCheckout({
      productId,
      successUrl: creemSuccessUrl(),
      // OUR reference for this attempt, echoed back by Creem on the webhook.
      // A lookup key, never an authorisation — the webhook still reads the
      // subscription back from Creem before anything is granted.
      requestId: user.id,
      customerEmail: user.email ?? null,
      metadata: { user_id: user.id, plan },
    })

    if (!checkout.ok) {
      // Creem's own wording is logged by the client and never shown to a
      // merchant (CLAUDE.md).
      console.error('[creem-checkout] Creem refused the checkout', { userId: user.id, reason: checkout.reason })
      return Response.json({ error: 'Could not start the checkout', reason: 'provider_unavailable' }, { status: 502 })
    }

    return Response.json({ checkoutUrl: checkout.value.checkoutUrl })
  } catch (error) {
    console.error('[creem-checkout] unexpected exception', {
      name: error instanceof Error ? error.name : 'unknown',
    })
    return Response.json({ error: 'Could not start the checkout' }, { status: 500 })
  }
}
