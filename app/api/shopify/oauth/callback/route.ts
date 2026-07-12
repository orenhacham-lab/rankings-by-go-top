/**
 * Phase 4F.1 — GET /api/shopify/oauth/callback
 *
 * Shopify OAuth callback. Validates integrity (HMAC), shop, and the one-time
 * (user, project, shop)-bound state; exchanges the code for an OFFLINE token
 * server-side; verifies granted scopes; encrypts + persists the token; then
 * redirects back to the project page. The token is never returned to the
 * browser. Every failure maps to a clear ?shopify=error&reason=… redirect.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled, authContentProject } from '@/lib/content/api-auth'
import { normalizeShopDomain } from '@/lib/shopify/domain'
import { SHOPIFY_API_VERSION, missingScopes } from '@/lib/shopify/constants'
import { testShopifyConnection } from '@/lib/shopify/client'
import {
  getShopifyOAuthConfig, verifyShopifyHmac, exchangeCodeForToken, projectReturnUrl,
  verifyNonceCookie, OAUTH_NONCE_COOKIE, OAUTH_COOKIE_PATH,
} from '@/lib/shopify/oauth'
import { encryptCredential, isCredentialsCryptoConfigured } from '@/lib/security/credentials-crypto'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return Response.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })
  const appUrl = config.appUrl

  const url = new URL(request.url)
  const params: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { params[k] = v })

  // The signed nonce cookie set at start. Every terminal response clears it so a
  // stale nonce can't be reused.
  const cookieStore = await cookies()
  const nonceCookieRaw = cookieStore.get(OAUTH_NONCE_COOKIE)?.value
  const clearNonce = (res: NextResponse): NextResponse => {
    res.cookies.set(OAUTH_NONCE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: OAUTH_COOKIE_PATH, maxAge: 0 })
    return res
  }
  const generic = (reason: string) => clearNonce(NextResponse.redirect(`${appUrl}/projects?shopify=error&reason=${encodeURIComponent(reason)}`))
  const toProject = (projectId: string, q: Record<string, string>) => clearNonce(NextResponse.redirect(projectReturnUrl(appUrl, projectId, q)))

  // Read the state EARLY (read-only) so an error can be shown on the project
  // page (which has the re-entry field) instead of silently bouncing to the
  // projects list. NO action is taken on the state here — HMAC is still verified
  // before the one-time consume and token exchange below.
  const admin = createAdminClient()
  const { data: stateData } = await admin
    .from('shopify_oauth_states').select('*').eq('state', params.state || '').maybeSingle()
  const st = stateData as { state: string; user_id: string; project_id: string; shop_domain: string; expires_at: string; used_at: string | null } | null
  // Error redirect: to the project page when the project is known, else the list.
  const fail = (reason: string) => (st?.project_id ? toProject(st.project_id, { shopify: 'error', reason }) : generic(reason))

  // 1) Integrity: HMAC over all params (except hmac) with the client secret.
  if (!verifyShopifyHmac(params, config.clientSecret)) {
    console.warn('[Shopify OAuth] callback rejected', { route: 'shopify_oauth_callback', reason: 'invalid_hmac' })
    return fail('invalid_hmac')
  }

  // 2) Shop must normalize to a valid *.myshopify.com host.
  const shop = normalizeShopDomain(params.shop || '')
  if (!shop) {
    console.warn('[Shopify OAuth] invalid shop', { route: 'shopify_oauth_callback', receivedShop: params.shop ?? null, normalizedShop: null, reason: 'invalid_shop' })
    return fail('invalid_shop')
  }

  // 3) State must exist (server-persisted, one-time).
  if (!st) {
    console.warn('[Shopify OAuth] state not found', { route: 'shopify_oauth_callback', receivedShop: params.shop ?? null, normalizedShop: shop, reason: 'invalid_state' })
    return generic('invalid_state')
  }
  // 4) The callback shop must match the shop the flow started with.
  if (st.shop_domain !== shop) {
    console.warn('[Shopify OAuth] shop mismatch', { route: 'shopify_oauth_callback', receivedShop: params.shop ?? null, normalizedShop: shop, stateShop: st.shop_domain, reason: 'invalid_shop' })
    return fail('invalid_shop')
  }
  if (new Date(st.expires_at).getTime() < Date.now()) return toProject(st.project_id, { shopify: 'error', reason: 'expired_state' })

  // 5) Merchant cancelled the install (Shopify appends an error param).
  if (params.error) return toProject(st.project_id, { shopify: 'error', reason: 'cancelled' })

  // 6) Browser nonce cookie: must be present, untampered, and equal to the
  //    callback state (which equals the DB state). Do NOT rely on the DB alone.
  const cookieNonce = verifyNonceCookie(nonceCookieRaw, config.clientSecret)
  if (!cookieNonce || cookieNonce !== params.state) return toProject(st.project_id, { shopify: 'error', reason: 'invalid_nonce' })

  // 7) Ownership + identity: the callback user must be the state's user and own
  //    the project (rejects a callback for another user/project).
  const auth = await authContentProject(st.project_id)
  if ('error' in auth) return toProject(st.project_id, { shopify: 'error', reason: 'forbidden' })
  if (auth.user.id !== st.user_id) return toProject(st.project_id, { shopify: 'error', reason: 'forbidden' })

  // 8) Consume the state ONCE (atomic: only succeeds while used_at is null).
  const { data: consumed } = await auth.admin
    .from('shopify_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('state', st.state)
    .is('used_at', null)
    .select('state')
    .maybeSingle()
  if (!consumed) return toProject(st.project_id, { shopify: 'error', reason: 'state_replay' })

  // 9) Authorization code required.
  if (!params.code) return toProject(st.project_id, { shopify: 'error', reason: 'missing_code' })

  // 10) Platform exclusivity (re-check at save time).
  const { data: wordpress } = await auth.admin
    .from('wordpress_connections').select('id').eq('project_id', auth.project.id).maybeSingle()
  if (wordpress) return toProject(st.project_id, { shopify: 'error', reason: 'platform_already_connected' })

  if (!isCredentialsCryptoConfigured()) return toProject(st.project_id, { shopify: 'error', reason: 'not_configured' })

  // 11) Exchange the code for an OFFLINE access token (server-side).
  let token: { accessToken: string; scope: string }
  try {
    token = await exchangeCodeForToken({ shop, code: params.code, clientId: config.clientId, clientSecret: config.clientSecret })
  } catch {
    return toProject(st.project_id, { shopify: 'error', reason: 'token_exchange_failed' })
  }

  // 12) Verify granted scopes + resolve storefront host (reuses scope verification).
  const creds = { shopDomain: shop, accessToken: token.accessToken, apiVersion: SHOPIFY_API_VERSION }
  const test = await testShopifyConnection(creds)
  const grantedScopes = test.grantedScopes ?? token.scope.split(/[,\s]+/).filter(Boolean)
  const missing = missingScopes(grantedScopes)
  const storefront = test.ok && test.storefrontDomain ? test.storefrontDomain : null
  const status = missing.length > 0 ? 'failed' : 'connected'
  const lastError = missing.length > 0 ? `missing_scopes: ${missing.join(', ')}` : null

  // 13) Encrypt + persist (token never leaves the server).
  let tokenEncrypted: string
  try { tokenEncrypted = encryptCredential(token.accessToken) } catch {
    return toProject(st.project_id, { shopify: 'error', reason: 'encryption_failed' })
  }

  const nowIso = new Date().toISOString()
  const { error: saveErr } = await auth.admin.from('shopify_connections').upsert({
    user_id: auth.project.user_id,
    project_id: auth.project.id,
    shop_domain: shop,
    storefront_domain: storefront,
    access_token_encrypted: tokenEncrypted,
    api_version: SHOPIFY_API_VERSION,
    auth_method: 'oauth',
    granted_scopes: grantedScopes,
    connection_status: status,
    last_tested_at: nowIso,
    last_error: lastError,
    updated_at: nowIso,
  }, { onConflict: 'project_id' })
  if (saveErr) {
    console.error('[Shopify OAuth] save failed:', saveErr.message)
    return toProject(st.project_id, { shopify: 'error', reason: 'save_failed' })
  }

  return toProject(st.project_id, missing.length > 0
    ? { shopify: 'warning', reason: 'missing_scopes' }
    : { shopify: 'connected' })
}
