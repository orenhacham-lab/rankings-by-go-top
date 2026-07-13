/**
 * Phase 4F.1 — GET /api/shopify/oauth/start?projectId=&shop=
 *
 * Begins the Shopify merchant OAuth (offline token). Validates the shop domain,
 * ownership, platform exclusivity, and OAuth config; mints a one-time,
 * short-lived state bound to (user, project, shop); then 302-redirects to the
 * Shopify authorization screen. The merchant approves read-only scopes there.
 */

import { NextResponse } from 'next/server'
import { isContentModuleEnabled, authContentProject } from '@/lib/content/api-auth'
import { normalizeShopDomain } from '@/lib/shopify/domain'
import {
  getShopifyOAuthConfig, oauthRedirectUri, buildAuthorizeUrl, generateOAuthState, projectReturnUrl,
  signNonceCookie, OAUTH_NONCE_COOKIE, OAUTH_COOKIE_PATH,
} from '@/lib/shopify/oauth'
import { SHOPIFY_REQUIRED_SCOPES, SHOPIFY_PUBLISH_SCOPES } from '@/lib/shopify/constants'

const STATE_TTL_MS = 10 * 60_000
const STATE_TTL_SECONDS = STATE_TTL_MS / 1000

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const shopRaw = url.searchParams.get('shop') || ''
  // Phase 4F.2 — intent=publish requests the publishing scope set (adds
  // write_content); default is the read-only set. No other scopes are requested.
  const scopes = url.searchParams.get('intent') === 'publish' ? SHOPIFY_PUBLISH_SCOPES : SHOPIFY_REQUIRED_SCOPES

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const config = getShopifyOAuthConfig()
  // Once auth passes we can safely build a project return URL for user-facing errors.
  const fail = (reason: string) =>
    NextResponse.redirect(projectReturnUrl(config?.appUrl || '', auth.project.id, { shopify: 'error', reason }))

  if (!config) return Response.json({ error: 'shopify_oauth_not_configured', reason: 'not_configured' }, { status: 500 })

  const shop = normalizeShopDomain(shopRaw)
  if (!shop) {
    console.warn('[Shopify OAuth] invalid shop', { route: 'shopify_oauth_start', receivedShop: shopRaw || null, normalizedShop: null, reason: 'invalid_domain' })
    return fail('invalid_domain')
  }
  console.log('[Shopify OAuth] start', { route: 'shopify_oauth_start', receivedShop: shopRaw, normalizedShop: shop, projectId: auth.project.id })

  // Platform exclusivity: refuse if the project already uses WordPress.
  const { data: wordpress } = await auth.admin
    .from('wordpress_connections').select('id').eq('project_id', auth.project.id).maybeSingle()
  if (wordpress) return fail('platform_already_connected')

  // Mint a one-time, short-lived, (user, project, shop)-bound state.
  const state = generateOAuthState()
  const { error: stateErr } = await auth.admin.from('shopify_oauth_states').insert({
    state,
    user_id: auth.user.id,
    project_id: auth.project.id,
    shop_domain: shop,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  })
  if (stateErr) {
    console.error('[Shopify OAuth] state insert failed:', stateErr.message)
    return fail('state_error')
  }

  const authorizeUrl = buildAuthorizeUrl({
    shop,
    clientId: config.clientId,
    redirectUri: oauthRedirectUri(config.appUrl),
    state,
    scopes,
  })

  // Signed browser nonce cookie carrying the SAME state — the callback requires
  // both the DB state AND this cookie to match (Shopify OAuth nonce requirement).
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
