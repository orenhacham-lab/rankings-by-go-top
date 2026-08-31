/**
 * POST /api/shopify/embedded-install — Shopify-managed installation entry.
 *
 * Replaces the iframe-hostile leg of first-time onboarding. Previously
 * app/shopify/app/page.tsx server-redirected an unconnected shop to
 * /api/shopify/install, which redirects to https://{shop}/admin/oauth/authorize
 * — a page Shopify refuses to let anyone frame. Under `embedded = true` that
 * redirect happens INSIDE the Admin iframe and renders a blocked frame, so a
 * brand-new merchant could never install.
 *
 * With Shopify-managed installation (`use_legacy_install_flow` absent/false in
 * shopify.app.toml) there is no authorization redirect at all: Shopify grants
 * the scopes itself, and the app exchanges the App Bridge session token for an
 * access token. That is what this route does, entirely server-side — nothing
 * navigates to Shopify, so nothing can be framed.
 *
 * Identity comes ONLY from a verified App Bridge session token (Authorization:
 * Bearer …, see lib/shopify/session-token.ts). The shop domain used for the
 * exchange and for every write below is the VERIFIED one from that token —
 * never a query parameter, never a body field. Fails closed on every error.
 *
 * On success this produces exactly the same state the OAuth pre-auth callback
 * produced (an encrypted offline token in a single-use, short-lived
 * shopify_pending_installs row + the signed httpOnly pending-link cookie), so
 * the UNCHANGED downstream flow — /shopify/link → project selection →
 * /api/shopify/link/complete → shopify_connections — resumes identically.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { SHOPIFY_API_VERSION } from '@/lib/shopify/constants'
import { testShopifyConnection, getShopIdentity } from '@/lib/shopify/client'
import { getShopifyOAuthConfig, exchangeSessionTokenForOfflineToken } from '@/lib/shopify/oauth'
import { verifyShopifySessionToken } from '@/lib/shopify/session-token'
import { encryptCredential, isCredentialsCryptoConfigured } from '@/lib/security/credentials-crypto'
import { createPendingInstall, signPendingLinkCookieValue, PENDING_LINK_COOKIE, PENDING_LINK_TTL_MS } from '@/lib/shopify/pending-link'

/** A stable, non-sensitive failure code — never the shop, token, or secret. */
function fail(status: number, reason: string) {
  console.warn('[Shopify embedded install] rejected', { route: 'embedded_install', reason })
  return NextResponse.json({ error: reason }, { status })
}

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return fail(500, 'shopify_oauth_not_configured')

  // 1) Identity — a verified App Bridge session token and nothing else.
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const verified = verifyShopifySessionToken(token)
  if (!verified.ok) return fail(401, 'invalid_session_token')
  const shopDomain = verified.shopDomain

  const admin = createAdminClient()

  // 2) Already connected → never re-authorize. This is what makes a reopen by
  //    an existing merchant a no-op rather than a fresh install.
  const { data: existing } = await admin
    .from('shopify_connections')
    .select('id')
    .eq('shop_domain', shopDomain)
    .is('archived_at', null)
    .eq('connection_status', 'connected')
    .limit(1)
    .maybeSingle()
  if (existing) return NextResponse.json({ alreadyConnected: true, next: null })

  if (!isCredentialsCryptoConfigured()) return fail(500, 'not_configured')

  // 3) Token exchange — the managed-installation replacement for the
  //    authorization-code redirect. Uses the VERIFIED shop domain.
  let exchanged: { accessToken: string; scope: string }
  try {
    exchanged = await exchangeSessionTokenForOfflineToken({
      shop: shopDomain,
      sessionToken: token,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    })
  } catch {
    return fail(502, 'token_exchange_failed')
  }

  // 4) VERIFY the freshly-exchanged token against Shopify before it is allowed
  //    to become a connection. Previously the results of both calls below were
  //    computed and then ignored, so a token that failed verification still
  //    produced a pending install — that is how a connection with a NULL
  //    shop_gid was created, which then failed test-connection with
  //    invalid_token and was correctly blocked at billing with
  //    shop_identity_unverified. Fail closed here instead, so a bad token
  //    never reaches the linking flow at all.
  const creds = { shopDomain, accessToken: exchanged.accessToken, apiVersion: SHOPIFY_API_VERSION }
  const test = await testShopifyConnection(creds)
  if (!test.ok) return fail(502, 'token_verification_failed')

  const shopIdentity = await getShopIdentity(creds)
  const shopGid = shopIdentity && shopIdentity.myshopifyDomain === shopDomain ? shopIdentity.shopGid : null
  // shop_gid is the identity Shopify billing is verified against; a connection
  // without it can never be billing-verified, so refuse to create one.
  if (!shopGid) return fail(502, 'shop_identity_unverified')

  const grantedScopes = test.grantedScopes ?? exchanged.scope.split(/[,\s]+/).filter(Boolean)
  const storefront = test.storefrontDomain ?? null

  let tokenEncrypted: string
  try {
    tokenEncrypted = encryptCredential(exchanged.accessToken)
  } catch {
    return fail(500, 'encryption_failed')
  }

  const pendingToken = await createPendingInstall(admin, {
    shop_domain: shopDomain,
    shop_gid: shopGid,
    access_token_encrypted: tokenEncrypted,
    api_version: SHOPIFY_API_VERSION,
    granted_scopes: grantedScopes,
    storefront_domain: storefront,
  })

  // 5) Hand back the internal, server-chosen continuation path. Never a
  //    caller-supplied URL, so this can't become an open redirect.
  const res = NextResponse.json({ alreadyConnected: false, next: '/shopify/link' })
  res.cookies.set(PENDING_LINK_COOKIE, signPendingLinkCookieValue(pendingToken, config.clientSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_LINK_TTL_MS / 1000,
  })
  return res
}
