/**
 * Phase 2 (blocker fix) — GET /api/shopify/billing/start-intent
 *
 * The ONLY place a billing intent (lib/shopify/billing-intent.ts) is ever
 * created, and the ONLY place a link to Shopify's hosted pricing page is
 * ever built and handed to a browser. Every "Manage plan" / "Choose a plan"
 * action in the app (BillingView.tsx on the external dashboard,
 * ConnectorHomeClient.tsx in the embedded app) now goes through this route
 * instead of navigating straight to a pre-built Shopify URL.
 *
 * Requires a real, authenticated identity — EITHER a verified Shopify App
 * Bridge session token (`Authorization: Bearer <token>`, for the embedded
 * caller) OR a Supabase session cookie (for the external dashboard caller).
 * Resolves the caller's OWN Shopify connection server-side (never accepts a
 * connection id / shop domain from the request) and refuses to mint an
 * intent for a connection with no verified shop_gid.
 *
 * Response shape depends on how it was called, and the two cases now differ in
 * WHERE the intent cookie comes from:
 *
 *   EMBEDDED (Authorization header). This fetch() runs inside the Shopify
 *   Admin iframe, a THIRD-PARTY context for this origin, so a SameSite=Lax
 *   cookie set on its response is dropped by modern Chrome. That is the
 *   production defect: the merchant selected and approved a plan, Shopify
 *   returned them to the app, and no request ever reached
 *   /api/shopify/billing/return because the intent cookie had never been
 *   stored. This branch therefore sets NO cookie and returns a fixed
 *   `resumePath` plus a signed, opaque `handoff`; the client posts that
 *   TOP-LEVEL to /api/shopify/billing/resume, which is first-party and can
 *   establish the cookie for real. No caller-controlled redirect URL is
 *   returned — the Shopify pricing URL is built server-side at the resume
 *   step, from the intent's own canonical shop domain.
 *
 *   EXTERNAL DASHBOARD (no Authorization header). A plain top-level `<a href>`
 *   navigation from BillingView.tsx. This is ALREADY first-party, so it keeps
 *   setting the cookie on its own 302 to Shopify — unchanged, and deliberately
 *   so: adding a hop there would be pure risk for no benefit.
 *
 * Everything before that split — session-token / Supabase authentication, the
 * admin gate, the server-side connection resolution, the billing-authority
 * gate, the shop_gid requirement and the intent row itself — is identical for
 * both callers and unchanged by this fix.
 */

import { isAdminUser } from '@/lib/auth/admin-role'
import { resolveBillingAuthority } from '@/lib/billing/governance'
import { getActiveMigrationResult } from '@/lib/shopify/paypal-migration'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { verifyShopifySessionToken } from '@/lib/shopify/session-token'
import { buildShopifyPricingUrl } from '@/lib/shopify/billing-urls'
import { createBillingIntent, signBillingIntentHandoff, BILLING_INTENT_COOKIE, BILLING_INTENT_COOKIE_PATH, BILLING_INTENT_TTL_MS, BILLING_INTENT_RESUME_PATH } from '@/lib/shopify/billing-intent'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'

interface ResolvedConnection {
  id: string
  user_id: string
  project_id: string
  shop_domain: string
  shop_gid: string | null
}

/**
 * Hotfix (defense in depth) — an admin must never reach a Shopify
 * billing-management destination, even if their account happens to have a
 * connected (possibly test/unverified) Shopify store.
 *
 * The role lookup itself now lives in lib/auth/admin-role.ts, so this route,
 * lib/subscription.ts and lib/content/entitlement-guard.ts all resolve
 * "is this an administrator" through ONE implementation. Re-exported here
 * because app/api/shopify/app-home/route.ts imports it from this module.
 */
export { isAdminUser }

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  const authHeader = request.headers.get('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const isApiCall = bearerToken.length > 0

  let connection: ResolvedConnection | null = null

  // For the external dashboard caller, user identity is already known here
  // — checked BEFORE touching shopify_connections at all. For the embedded
  // App Bridge caller, identity is only resolvable AFTER the connection
  // lookup (the session token only proves a shop domain, not a user id) —
  // checked immediately after resolving the connection, still strictly
  // BEFORE the shop_gid check or any pricing-URL construction below.
  if (isApiCall) {
    const verified = verifyShopifySessionToken(bearerToken)
    if (!verified.ok) return Response.json({ error: 'invalid_session_token', reason: verified.reason }, { status: 401 })
    const { data } = await admin
      .from('shopify_connections')
      .select('id, user_id, project_id, shop_domain, shop_gid')
            .eq('shop_domain', verified.shopDomain)
      .is('archived_at', null)
      .eq('connection_status', 'connected')
      .maybeSingle()
    connection = data as ResolvedConnection | null
    if (connection && await isAdminUser(admin, connection.user_id)) {
      return Response.json({ error: 'admin_not_applicable' }, { status: 403 })
    }
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    if (await isAdminUser(admin, user.id)) {
      return NextResponse.redirect(new URL('/billing?shopify=error&reason=admin_not_applicable', request.url))
    }
    const { data } = await admin
      .from('shopify_connections')
      .select('id, user_id, project_id, shop_domain, shop_gid')
      .eq('user_id', user.id)
      .eq('connection_status', 'connected')
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    connection = data as ResolvedConnection | null
  }

  if (!connection) {
    return isApiCall
      ? Response.json({ error: 'no_shopify_connection' }, { status: 404 })
      : NextResponse.redirect(new URL('/billing?shopify=error&reason=no_shopify_connection', request.url))
  }

  // BILLING AUTHORITY GATE. Having a connected store is NOT permission to buy a
  // Shopify plan: a website customer who connected Shopify purely to publish is
  // billed on the website, and minting a Shopify billing intent for them would
  // start a second, wrong subscription. Shopify pricing is offered only when
  // Shopify is the durable authority, or while an explicit PayPal→Shopify
  // migration is in flight (that is what the migration is FOR).
  //
  // Fails CLOSED: an unreadable governance or migration state mints nothing.
  const authority = await resolveBillingAuthority(admin, connection.user_id)
  const migration = await getActiveMigrationResult(admin, connection.user_id)
  if (!authority.ok || !migration.ok) {
    return isApiCall
      ? Response.json({ error: 'entitlement_unavailable' }, { status: 503 })
      : NextResponse.redirect(new URL('/billing?shopify=error&reason=entitlement_unavailable', request.url))
  }
  if (authority.authority !== 'shopify' && !migration.migration) {
    return isApiCall
      ? Response.json({ error: 'shopify_billing_not_applicable' }, { status: 403 })
      : NextResponse.redirect(new URL('/billing?shopify=error&reason=shopify_billing_not_applicable', request.url))
  }
  if (!connection.shop_gid) {
    return isApiCall
      ? Response.json({ error: 'shop_identity_unverified' }, { status: 409 })
      : NextResponse.redirect(new URL('/billing?shopify=error&reason=shop_identity_unverified', request.url))
  }

  const pricing = buildShopifyPricingUrl(connection.shop_domain)
  if (!pricing.ok) {
    console.error('[Shopify billing intent] could not build pricing URL:', pricing.reason)
    return isApiCall
      ? Response.json({ error: pricing.reason }, { status: 500 })
      : NextResponse.redirect(new URL(`/billing?shopify=error&reason=${encodeURIComponent(pricing.reason)}`, request.url))
  }

  const nonce = await createBillingIntent(admin, {
    userId: connection.user_id,
    projectId: connection.project_id,
    connectionId: connection.id,
    shopDomain: connection.shop_domain,
    shopGid: connection.shop_gid,
  })

  // EMBEDDED CALLER — hand back a signed, opaque handoff instead of a cookie.
  //
  // The handoff is the same nonce the cookie would have carried, HMAC-signed
  // so the resume endpoint can reject anything we did not issue before it
  // touches the database. It is delivered in the body of an ALREADY
  // AUTHENTICATED response (a verified App Bridge session token for this exact
  // shop got us here) to the merchant's own browser — the same party that
  // would have received the cookie. It never enters a URL, a query string, a
  // fragment, browser storage or a log, because the resume leg is a POST.
  //
  // `resumePath` is a fixed server constant, and NO pricing URL is returned:
  // the client is given nothing it could navigate to of its own choosing.
  if (isApiCall) {
    const config = getShopifyOAuthConfig()
    if (!config) return Response.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })
    return NextResponse.json({
      resumePath: BILLING_INTENT_RESUME_PATH,
      handoff: signBillingIntentHandoff(nonce, config.clientSecret),
    })
  }

  // EXTERNAL DASHBOARD CALLER — unchanged. A top-level GET from a first-party
  // page: the cookie it sets here is first-party and is accepted, so this path
  // still sets the cookie and redirects straight to Shopify.
  const res = NextResponse.redirect(pricing.url)
  res.cookies.set(BILLING_INTENT_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: BILLING_INTENT_COOKIE_PATH,
    maxAge: BILLING_INTENT_TTL_MS / 1000,
  })
  return res
}
