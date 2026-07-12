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
} from '@/lib/shopify/oauth'

const STATE_TTL_MS = 10 * 60_000

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const shopRaw = url.searchParams.get('shop') || ''

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const config = getShopifyOAuthConfig()
  // Once auth passes we can safely build a project return URL for user-facing errors.
  const fail = (reason: string) =>
    NextResponse.redirect(projectReturnUrl(config?.appUrl || '', auth.project.id, { shopify: 'error', reason }))

  if (!config) return Response.json({ error: 'shopify_oauth_not_configured', reason: 'not_configured' }, { status: 500 })

  const shop = normalizeShopDomain(shopRaw)
  if (!shop) return fail('invalid_domain')

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
  })
  return NextResponse.redirect(authorizeUrl)
}
