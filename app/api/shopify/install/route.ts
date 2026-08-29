/**
 * Phase 2 (blocker fix) — GET /api/shopify/install?shop=
 *
 * Entry point for an App-Store-initiated (or otherwise session-less) install:
 * no Rankings session, no project, exists yet. Mirrors
 * app/api/shopify/oauth/start/route.ts exactly EXCEPT it does not require
 * authContentProject — there is no project to authorize against yet. Mints a
 * one-time, short-lived, shop-bound PRE-AUTH state (shopify_preauth_states,
 * NOT shopify_oauth_states — that table requires a user_id/project_id this
 * flow doesn't have) and redirects to Shopify's authorization screen.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { normalizeShopDomain } from '@/lib/shopify/domain'
import {
  getShopifyOAuthConfig, oauthRedirectUri, buildAuthorizeUrl, generateOAuthState,
  signNonceCookie, OAUTH_NONCE_COOKIE, OAUTH_COOKIE_PATH,
} from '@/lib/shopify/oauth'
import { SHOPIFY_REQUIRED_SCOPES } from '@/lib/shopify/constants'

const STATE_TTL_MS = 10 * 60_000
const STATE_TTL_SECONDS = STATE_TTL_MS / 1000

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return Response.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })

  const url = new URL(request.url)
  const shop = normalizeShopDomain(url.searchParams.get('shop') || '')
  if (!shop) return Response.json({ error: 'invalid_shop' }, { status: 400 })

  const admin = createAdminClient()

  // Mint a one-time, short-lived, shop-bound PRE-AUTH state. Only
  // read-only/write_content scopes are requested — same set the logged-in
  // flow requests for a publish-capable connection, since we don't yet know
  // whether the eventual project will publish.
  const state = generateOAuthState()
  const { error: stateErr } = await admin.from('shopify_preauth_states').insert({
    state,
    shop_domain: shop,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  })
  if (stateErr) {
    console.error('[Shopify pre-auth] state insert failed:', stateErr.message)
    return Response.json({ error: 'state_error' }, { status: 500 })
  }

  const authorizeUrl = buildAuthorizeUrl({
    shop,
    clientId: config.clientId,
    redirectUri: oauthRedirectUri(config.appUrl),
    state,
    scopes: SHOPIFY_REQUIRED_SCOPES,
  })

  const res = NextResponse.redirect(authorizeUrl)
  res.cookies.set(OAUTH_NONCE_COOKIE, signNonceCookie(state, config.clientSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: OAUTH_COOKIE_PATH,
    maxAge: STATE_TTL_SECONDS,
  })
  return res
}
