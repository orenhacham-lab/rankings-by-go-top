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

  // 1) Integrity: HMAC over all params (except hmac) with the client secret.
  if (!verifyShopifyHmac(params, config.clientSecret)) return generic('invalid_hmac')

  // 2) Shop must be a valid *.myshopify.com host.
  const shop = normalizeShopDomain(params.shop || '')
  if (!shop) return generic('invalid_shop')

  // 3) Look up the state (server-persisted, one-time).
  const admin = createAdminClient()
  const { data: stateData } = await admin
    .from('shopify_oauth_states').select('*').eq('state', params.state || '').maybeSingle()
  const st = stateData as { state: string; user_id: string; project_id: string; shop_domain: string; expires_at: string; used_at: string | null } | null
  if (!st) return generic('invalid_state')
  if (st.shop_domain !== shop) return generic('invalid_shop')
  if (new Date(st.expires_at).getTime() < Date.now()) return toProject(st.project_id, { shopify: 'error', reason: 'expired_state' })

  // 4) Merchant cancelled the install (Shopify appends an error param).
  if (params.error) return toProject(st.project_id, { shopify: 'error', reason: 'cancelled' })

  // 5) Browser nonce cookie: must be present, untampered, and equal to the
  //    callback state (which equals the DB state). Do NOT rely on the DB alone.
  const cookieNonce = verifyNonceCookie(nonceCookieRaw, config.clientSecret)
  if (!cookieNonce || cookieNonce !== params.state) return toProject(st.project_id, { shopify: 'error', reason: 'invalid_nonce' })

  // 6) Ownership + identity: the callback user must be the state's user and own
  //    the project (rejects a callback for another user/project).
  const auth = await authContentProject(st.project_id)
  if ('error' in auth) return toProject(st.project_id, { shopify: 'error', reason: 'forbidden' })
  if (auth.user.id !== st.user_id) return toProject(st.project_id, { shopify: 'error', reason: 'forbidden' })

  // 7) Consume the state ONCE (atomic: only succeeds while used_at is null).
  const { data: consumed } = await auth.admin
    .from('shopify_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('state', st.state)
    .is('used_at', null)
    .select('state')
    .maybeSingle()
  if (!consumed) return toProject(st.project_id, { shopify: 'error', reason: 'state_replay' })

  // 8) Authorization code required.
  if (!params.code) return toProject(st.project_id, { shopify: 'error', reason: 'missing_code' })

  // 9) Platform exclusivity (re-check at save time).
  const { data: wordpress } = await auth.admin
    .from('wordpress_connections').select('id').eq('project_id', auth.project.id).maybeSingle()
  if (wordpress) return toProject(st.project_id, { shopify: 'error', reason: 'platform_already_connected' })

  if (!isCredentialsCryptoConfigured()) return toProject(st.project_id, { shopify: 'error', reason: 'not_configured' })

  // 10) Exchange the code for an OFFLINE access token (server-side).
  let token: { accessToken: string; scope: string }
  try {
    token = await exchangeCodeForToken({ shop, code: params.code, clientId: config.clientId, clientSecret: config.clientSecret })
  } catch {
    return toProject(st.project_id, { shopify: 'error', reason: 'token_exchange_failed' })
  }

  // 11) Verify granted scopes + resolve storefront host (reuses scope verification).
  const creds = { shopDomain: shop, accessToken: token.accessToken, apiVersion: SHOPIFY_API_VERSION }
  const test = await testShopifyConnection(creds)
  const grantedScopes = test.grantedScopes ?? token.scope.split(/[,\s]+/).filter(Boolean)
  const missing = missingScopes(grantedScopes)
  const storefront = test.ok && test.storefrontDomain ? test.storefrontDomain : null
  const status = missing.length > 0 ? 'failed' : 'connected'
  const lastError = missing.length > 0 ? `missing_scopes: ${missing.join(', ')}` : null

  // 12) Encrypt + persist (token never leaves the server).
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
