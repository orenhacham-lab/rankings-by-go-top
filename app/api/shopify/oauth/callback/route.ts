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
import { testShopifyConnection, getShopIdentity } from '@/lib/shopify/client'
import {
  getShopifyOAuthConfig, verifyShopifyHmac, exchangeCodeForToken, projectReturnUrl, contentHubReturnUrl,
  verifyNonceCookie, OAUTH_NONCE_COOKIE, OAUTH_COOKIE_PATH, expiryFromNow,
} from '@/lib/shopify/oauth'
import type { ExpiringOfflineToken } from '@/lib/shopify/oauth'
import { encryptCredential, isCredentialsCryptoConfigured } from '@/lib/security/credentials-crypto'
import { createPendingInstall, signPendingLinkCookieValue, PENDING_LINK_COOKIE, PENDING_LINK_TTL_MS } from '@/lib/shopify/pending-link'
import { claimShopForProject } from '@/lib/shopify/connection-ownership'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Phase 2 (blocker fix) — completes an App-Store-initiated (pre-auth) OAuth
 * flow: no Rankings user/project exists yet. Exchanges the code, captures
 * shop identity, stores the result in a short-lived pending_installs row
 * (never shopify_connections — there is no project to attach it to), sets
 * the signed pending-link cookie, and sends the merchant to /shopify/link to
 * authenticate and pick/create a project. Mirrors the logged-in-initiated
 * branch below step-for-step; kept as a fully separate function so the
 * already-verified logged-in path (unchanged, below) carries zero risk from
 * this addition.
 */
async function completePreAuthInstall(
  admin: Admin,
  pst: { state: string; shop_domain: string; expires_at: string; used_at: string | null },
  params: Record<string, string>,
  // `edition` is required: the token this flow obtains can later be refreshed
  // only with the credentials of the app that issued it, so which app that was
  // must be recorded alongside the credential.
  config: { clientId: string; clientSecret: string; appUrl: string; edition: 'public' | 'legacy' },
  nonceCookieRaw: string | undefined,
): Promise<NextResponse> {
  const appUrl = config.appUrl
  const clearNonce = (res: NextResponse): NextResponse => {
    res.cookies.set(OAUTH_NONCE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: OAUTH_COOKIE_PATH, maxAge: 0 })
    return res
  }
  const fail = (reason: string) => clearNonce(NextResponse.redirect(`${appUrl}/shopify/link?shopify=error&reason=${encodeURIComponent(reason)}`))

  const shop = normalizeShopDomain(params.shop || '')
  if (!shop || shop !== pst.shop_domain) return fail('invalid_shop')
  if (new Date(pst.expires_at).getTime() < Date.now()) return fail('expired_state')
  if (params.error) return fail('cancelled')

  const cookieNonce = verifyNonceCookie(nonceCookieRaw, config.clientSecret)
  if (!cookieNonce || cookieNonce !== params.state) return fail('invalid_nonce')

  const { data: consumed } = await admin
    .from('shopify_preauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('state', pst.state)
    .is('used_at', null)
    .select('state')
    .maybeSingle()
  if (!consumed) return fail('state_replay')

  if (!params.code) return fail('missing_code')
  if (!isCredentialsCryptoConfigured()) return fail('not_configured')

  // Expiring offline grant. exchangeCodeForToken FAILS CLOSED unless Shopify
  // returns the full access_token + refresh_token + expires_in shape, so a
  // non-expiring token — the kind the Admin API now refuses — can never reach
  // a pending install, let alone a connection.
  let token: ExpiringOfflineToken
  try {
    token = await exchangeCodeForToken({ shop, code: params.code, clientId: config.clientId, clientSecret: config.clientSecret })
  } catch (err) {
    const kind = err instanceof Error ? err.message : ''
    return fail(kind.startsWith('token_exchange_not_expiring') ? 'reauthorization_required' : 'token_exchange_failed')
  }

  const creds = { shopDomain: shop, accessToken: token.accessToken, apiVersion: SHOPIFY_API_VERSION }
  const test = await testShopifyConnection(creds)
  const grantedScopes = test.grantedScopes ?? token.scope.split(/[,\s]+/).filter(Boolean)
  const storefront = test.ok && test.storefrontDomain ? test.storefrontDomain : null

  const shopIdentity = await getShopIdentity(creds)
  const shopGid = shopIdentity && shopIdentity.myshopifyDomain === shop ? shopIdentity.shopGid : null

  let tokenEncrypted: string
  let refreshTokenEncrypted: string
  try {
    tokenEncrypted = encryptCredential(token.accessToken)
    refreshTokenEncrypted = encryptCredential(token.refreshToken)
  } catch {
    return fail('encryption_failed')
  }
  if (!tokenEncrypted || !refreshTokenEncrypted) return fail('encryption_failed')
  const grantIssuedAt = Date.now()

  const pendingToken = await createPendingInstall(admin, {
    shop_domain: shop,
    shop_gid: shopGid,
    access_token_encrypted: tokenEncrypted,
    // TRUSTED PROVENANCE. This is completePreAuthInstall: an
    // App-Store-initiated OAuth completion with NO authenticated Rankings user
    // yet — the merchant arrived from Shopify, not from the dashboard. The
    // callback HMAC, the signed nonce and the one-time state were all verified
    // before this point. Stamped server-side; never from request input.
    install_origin: 'shopify_app_store',
    // Whichever app this flow actually resolved is recorded with the token it
    // issued, so a later refresh signs with the right pair.
    oauth_app_edition: config.edition,
    refresh_token_encrypted: refreshTokenEncrypted,
    access_token_expires_at: expiryFromNow(token.expiresIn, grantIssuedAt),
    refresh_token_expires_at: token.refreshTokenExpiresIn === null
      ? null
      : expiryFromNow(token.refreshTokenExpiresIn, grantIssuedAt),
    api_version: SHOPIFY_API_VERSION,
    granted_scopes: grantedScopes,
    storefront_domain: storefront,
  })

  const res = clearNonce(NextResponse.redirect(`${appUrl}/shopify/link`))
  res.cookies.set(PENDING_LINK_COOKIE, signPendingLinkCookieValue(pendingToken, config.clientSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_LINK_TTL_MS / 1000,
  })
  return res
}

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
  // Phase 2 (blocker fix) — an App-Store-initiated (pre-auth) flow has no
  // matching row in shopify_oauth_states (no project/user existed yet when
  // it started); check the separate pre-auth table too, read-only, same as
  // `st` above. Branched on at step 3 below — every check ABOVE and the
  // entire logged-in-initiated branch below are otherwise unchanged.
  const { data: preAuthData } = await admin
    .from('shopify_preauth_states').select('*').eq('state', params.state || '').maybeSingle()
  const pst = preAuthData as { state: string; shop_domain: string; expires_at: string; used_at: string | null } | null
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
    console.warn('[Shopify OAuth] invalid shop', { route: 'shopify_oauth_callback', shopParamPresent: Boolean(params.shop), reason: 'invalid_shop' })
    return fail('invalid_shop')
  }

  // 3) State must exist (server-persisted, one-time) — in EITHER table.
  if (!st && pst) {
    return await completePreAuthInstall(admin, pst, params, config, nonceCookieRaw)
  }
  if (!st) {
    console.warn('[Shopify OAuth] state not found', { route: 'shopify_oauth_callback', reason: 'invalid_state' })
    return generic('invalid_state')
  }
  // 4) The callback shop must match the shop the flow started with.
  if (st.shop_domain !== shop) {
    console.warn('[Shopify OAuth] shop mismatch', { route: 'shopify_oauth_callback', mismatch: 'callback_shop_vs_state_shop', reason: 'invalid_shop' })
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

  // 11) Exchange the code for an EXPIRING OFFLINE grant (server-side). Fails
  //     closed unless Shopify returns the expiring shape.
  let token: ExpiringOfflineToken
  try {
    token = await exchangeCodeForToken({ shop, code: params.code, clientId: config.clientId, clientSecret: config.clientSecret })
  } catch (err) {
    const kind = err instanceof Error ? err.message : ''
    return toProject(st.project_id, {
      shopify: 'error',
      reason: kind.startsWith('token_exchange_not_expiring') ? 'reauthorization_required' : 'token_exchange_failed',
    })
  }

  // 12) Verify granted scopes + resolve storefront host (reuses scope verification).
  const creds = { shopDomain: shop, accessToken: token.accessToken, apiVersion: SHOPIFY_API_VERSION }
  const test = await testShopifyConnection(creds)
  const grantedScopes = test.grantedScopes ?? token.scope.split(/[,\s]+/).filter(Boolean)
  const missing = missingScopes(grantedScopes)
  const storefront = test.ok && test.storefrontDomain ? test.storefrontDomain : null
  const status = missing.length > 0 ? 'failed' : 'connected'
  const lastError = missing.length > 0 ? `missing_scopes: ${missing.join(', ')}` : null

  // 12b) Phase 2 — resolve the canonical Shopify Shop GID server-side via Admin
  // GraphQL (never accepted from the browser). Required for Partner API billing
  // verification; a connection with no shop_gid fails closed on Shopify
  // publishing (see lib/shopify/billing-guard.ts) until it re-verifies.
  const shopIdentity = await getShopIdentity(creds)
  if (shopIdentity && shopIdentity.myshopifyDomain !== shop) {
    // Defense-in-depth only — should never happen (the token is scoped to
    // `shop`). Don't trust either value if they disagree; leave shop_gid null.
    console.warn('[Shopify OAuth] shop identity mismatch', { route: 'shopify_oauth_callback', mismatch: 'token_shop_vs_callback_shop', reason: 'shop_identity_mismatch' })
  }
  const shopGid = shopIdentity && shopIdentity.myshopifyDomain === shop ? shopIdentity.shopGid : null

  // 12c) Ownership transition — ONE canonical, atomic implementation shared
  // with the embedded managed-install path (lib/shopify/connection-ownership.ts
  // → the claim_shopify_shop_ownership RPC). This replaces the inline
  // shop_domain/shop_gid pre-checks plus a separate upsert that used to live
  // here: those ran as three unsynchronised statements, matched on shop_domain
  // with NO connection_status filter (so an app_uninstalled tombstone blocked
  // the shop forever), and had a near-duplicate twin in connection-ownership.ts
  // that could drift.
  //
  // Everything above constitutes the fresh cryptographic proof this call
  // requires: callback HMAC verified, signed nonce matched to the one-time
  // state, state atomically consumed, code exchanged for a token, and the
  // Shopify-returned shop identity cross-checked against the requested shop.
  let tokenEncrypted: string
  let refreshTokenEncrypted: string
  try {
    tokenEncrypted = encryptCredential(token.accessToken)
    refreshTokenEncrypted = encryptCredential(token.refreshToken)
  } catch {
    return toProject(st.project_id, { shopify: 'error', reason: 'encryption_failed' })
  }
  if (!tokenEncrypted || !refreshTokenEncrypted) return toProject(st.project_id, { shopify: 'error', reason: 'encryption_failed' })

  const claimIssuedAt = Date.now()
  const claim = await claimShopForProject(auth.admin, {
    userId: auth.project.user_id,
    projectId: auth.project.id,
    shopDomain: shop,
    shopGid,
    accessTokenEncrypted: tokenEncrypted,
    // The whole expiring grant moves in ONE claim call — see the RPC.
    refreshTokenEncrypted,
    oauthAppEdition: config.edition,
    accessTokenExpiresAt: expiryFromNow(token.expiresIn, claimIssuedAt),
    refreshTokenExpiresAt: token.refreshTokenExpiresIn === null
      ? null
      : expiryFromNow(token.refreshTokenExpiresIn, claimIssuedAt),
    apiVersion: SHOPIFY_API_VERSION,
    grantedScopes,
    storefrontDomain: storefront,
    connectionStatus: status,
    lastError,
    proof: 'oauth_callback_verified',
  })
  if (!claim.ok) {
    console.warn('[Shopify OAuth] ownership claim rejected', { route: 'shopify_oauth_callback', reason: claim.reason })
    return toProject(st.project_id, { shopify: 'error', reason: claim.reason })
  }

  // K1 — a WARNING (missing scopes) stays on the integration (project) screen so
  // the owner can fix it; a CLEAN success drops straight into the Content Hub for
  // this validated project. st.project_id is the server-validated, ownership-checked
  // id from the one-time state (never client input) → no open redirect.
  if (missing.length > 0) return toProject(st.project_id, { shopify: 'warning', reason: 'missing_scopes' })
  return clearNonce(NextResponse.redirect(contentHubReturnUrl(appUrl, st.project_id)))
}
