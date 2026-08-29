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
 * Response shape depends on how it was called: with an Authorization header
 * (the embedded fetch() case, which cannot itself trigger a top-level
 * navigation) it returns JSON `{ redirectUrl }` for the client to navigate
 * to; without one (a plain top-level `<a href>` navigation from the external
 * dashboard) it issues the 302 redirect directly. Either way the intent
 * cookie is set on this SAME response, before the browser ever reaches
 * Shopify.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { verifyShopifySessionToken } from '@/lib/shopify/session-token'
import { buildShopifyPricingUrl } from '@/lib/shopify/billing-urls'
import { createBillingIntent, BILLING_INTENT_COOKIE, BILLING_INTENT_COOKIE_PATH, BILLING_INTENT_TTL_MS } from '@/lib/shopify/billing-intent'

interface ResolvedConnection {
  id: string
  user_id: string
  project_id: string
  shop_domain: string
  shop_gid: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * Hotfix (defense in depth) — an admin must never reach a Shopify
 * billing-management destination, even if their account happens to have a
 * connected (possibly test/unverified) Shopify store. Exported as a plain,
 * FakeAdmin-testable gate function (same convention as isAllowedOrigin /
 * isValidJsonContentType in app/api/billing-market/select/route.ts) — GET
 * below calls it, but the actual role-resolution logic is unit-tested
 * directly, independent of Request/NextResponse.
 */
export async function isAdminUser(admin: Admin, userId: string): Promise<boolean> {
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
  return (profile as { role?: string } | null)?.role === 'admin'
}

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

  const setIntentCookie = (res: NextResponse) => {
    res.cookies.set(BILLING_INTENT_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: BILLING_INTENT_COOKIE_PATH,
      maxAge: BILLING_INTENT_TTL_MS / 1000,
    })
    return res
  }

  if (isApiCall) {
    return setIntentCookie(NextResponse.json({ redirectUrl: pricing.url }))
  }
  return setIntentCookie(NextResponse.redirect(pricing.url))
}
