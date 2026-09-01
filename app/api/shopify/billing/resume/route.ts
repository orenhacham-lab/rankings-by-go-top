/**
 * POST /api/shopify/billing/resume — the FIRST-PARTY leg of the embedded
 * billing handoff.
 *
 * PRODUCTION BUG THIS EXISTS FOR. A merchant opened the embedded app, pressed
 * "Choose a plan", reached Shopify's hosted pricing page, selected and
 * APPROVED the plan, and was returned to the app — which still displayed "No
 * active plan", because no request ever reached /api/shopify/billing/return.
 * The intent cookie had never been stored: /api/shopify/billing/start-intent
 * is called by fetch() from inside the Shopify Admin iframe, a THIRD-PARTY
 * context for gotopseo.com, and modern Chrome drops a SameSite=Lax cookie set
 * on such a response. Exactly the same failure as the pending-link cookie
 * regression, in the billing flow.
 *
 * The fix is a context change, NOT a weaker cookie. SameSite=None would make
 * the billing intent — the sole authorization for the Partner API
 * verification, the billing-cache write, the migration advance and the
 * transitive PayPal cancellation — attachable from any cross-site request.
 * Instead the embedded client submits a top-level form POST here
 * (target="_top"), so this handler runs in a first-party gotopseo.com document
 * and its Set-Cookie is accepted.
 *
 * WHAT THIS ROUTE IS NOT. It is not a completion authority and grants no
 * entitlement: it consumes nothing, verifies no subscription, writes no cache,
 * touches no governance and advances no migration. All of that stays in
 * /api/shopify/billing/return, which remains the only place the one-time
 * intent is consumed and the only place the Partner API decides whether a plan
 * is really active. This route just moves an already-minted intent from a
 * response body into a first-party cookie and sends the browser to Shopify.
 *
 * The destination is built SERVER-SIDE from the intent row's own canonical
 * shop domain via the single shared builder, so nothing about where this
 * redirects comes from the request and there is no open redirect.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import { buildShopifyPricingUrl } from '@/lib/shopify/billing-urls'
import {
  BILLING_INTENT_COOKIE, BILLING_INTENT_COOKIE_PATH, BILLING_INTENT_TTL_MS,
  verifyBillingIntentHandoff, loadBillingIntentByNonce,
} from '@/lib/shopify/billing-intent'

export const runtime = 'nodejs'

/**
 * Input caps. The handoff is `${64 hex chars}.${64 hex chars}` = 129 bytes, so
 * both limits are generous while still refusing anything that is not plausibly
 * one — an oversized body is rejected before it is parsed or verified.
 */
const MAX_HANDOFF_CHARS = 512
const MAX_BODY_BYTES = 4096

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return NextResponse.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })

  // Every rejection below lands on the SAME first-party error destination with
  // NO cookie set, so this route can never be used to tell a live intent from a
  // dead one, and a merchant who arrives with a stale handoff gets the ordinary
  // billing error page instead of a broken redirect into Shopify. The reason
  // codes are the same stable, non-sensitive ones start-intent already uses.
  const declined = (reason: 'billing_intent_invalid' | 'billing_intent_expired' | 'connection_not_found' | 'invalid_shop_domain' | 'missing_app_handle') =>
    NextResponse.redirect(`${config.appUrl}/billing?shopify=error&reason=${encodeURIComponent(reason)}`, 303)

  // Exactly one field, from a urlencoded body, and nothing else is read.
  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/x-www-form-urlencoded') return declined('billing_intent_invalid')

  let body: string
  try {
    body = await request.text()
  } catch {
    return declined('billing_intent_invalid')
  }
  if (body.length > MAX_BODY_BYTES) return declined('billing_intent_invalid')

  let handoff: string
  try {
    handoff = new URLSearchParams(body).get('handoff') || ''
  } catch {
    return declined('billing_intent_invalid')
  }
  if (!handoff || handoff.length > MAX_HANDOFF_CHARS) return declined('billing_intent_invalid')

  // 1) Signature — constant-time, domain-separated from the pending-link
  //    handoff so the two credentials cannot be substituted for each other.
  const nonce = verifyBillingIntentHandoff(handoff, config.clientSecret)
  if (!nonce) return declined('billing_intent_invalid')

  // 2) The intent ROW is the authority. A signature proves only that we minted
  //    the value; it says nothing about whether the intent is still live. The
  //    row must exist, be unexpired and be unconsumed — a consumed intent has
  //    already completed a billing round-trip at /api/shopify/billing/return
  //    and must never be re-armed into a second cookie.
  const admin = createAdminClient()
  const loaded = await loadBillingIntentByNonce(admin, nonce)
  if (!loaded.found) return declined('billing_intent_invalid')
  if (loaded.expired) return declined('billing_intent_expired')
  if (loaded.alreadyConsumed) return declined('billing_intent_invalid')
  const intent = loaded.row

  // 3) The intent must still belong to a LIVE connection, re-resolved
  //    server-side from the intent's own connection_id — never from anything
  //    in this request. A connection that was archived, disconnected or
  //    re-pointed at a different shop since the intent was minted invalidates
  //    it: the shop identity the eventual Partner API check will run against
  //    must be the one the intent was bound to.
  const { data: connectionRow } = await admin
    .from('shopify_connections')
    .select('id, user_id, shop_domain, shop_gid')
    .eq('id', intent.connection_id)
    .is('archived_at', null)
    .eq('connection_status', 'connected')
    .maybeSingle()
  const connection = connectionRow as { id: string; user_id: string; shop_domain: string; shop_gid: string | null } | null
  if (!connection) return declined('connection_not_found')
  if (connection.user_id !== intent.user_id) return declined('connection_not_found')
  if (connection.shop_domain !== intent.shop_domain) return declined('connection_not_found')
  if (!connection.shop_gid || connection.shop_gid !== intent.shop_gid) return declined('connection_not_found')

  // 4) The destination is built from the INTENT'S OWN canonical shop domain,
  //    through the single shared builder that derives the store handle from a
  //    `*.myshopify.com` domain and the app handle from SHOPIFY_APP_HANDLE.
  //    Nothing from the request participates.
  const pricing = buildShopifyPricingUrl(intent.shop_domain)
  if (!pricing.ok) return declined(pricing.reason)

  // 5) First-party Set-Cookie. Identical attributes, scoped path and TTL to
  //    the ones the external dashboard flow already uses — issued on a
  //    top-level navigation to our own origin, which is what makes it stick.
  const res = NextResponse.redirect(pricing.url, 303)
  res.cookies.set(BILLING_INTENT_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: BILLING_INTENT_COOKIE_PATH,
    maxAge: BILLING_INTENT_TTL_MS / 1000,
  })
  return res
}
