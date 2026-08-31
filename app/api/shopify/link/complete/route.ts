/**
 * Phase 2 (blocker fix) — POST /api/shopify/link/complete
 *
 * Finalizes an App-Store-initiated (pre-auth) Shopify install: the merchant
 * has now authenticated on Rankings and chosen (or created) a project. Reads
 * the pending install ONLY via the signed, httpOnly cookie set at OAuth
 * completion (never trusts a client-submitted shop/token) — the browser
 * request body supplies ONLY `projectId`, which is independently verified to
 * belong to the authenticated user before anything is written.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import { PENDING_LINK_COOKIE, verifyPendingLinkCookieValue, loadValidPendingInstall, consumePendingInstall } from '@/lib/shopify/pending-link'
import { claimShopForProject } from '@/lib/shopify/connection-ownership'
import { missingScopes } from '@/lib/shopify/constants'
import { buildShopifyAdminAppUrl } from '@/lib/shopify/billing-urls'

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const config = getShopifyOAuthConfig()
  if (!config) return NextResponse.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })

  const cookieStore = await cookies()
  const raw = cookieStore.get(PENDING_LINK_COOKIE)?.value
  const token = verifyPendingLinkCookieValue(raw, config.clientSecret)
  const clearCookie = (res: NextResponse) => {
    res.cookies.set(PENDING_LINK_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 })
    return res
  }
  if (!token) return clearCookie(NextResponse.json({ error: 'pending_link_missing_or_invalid' }, { status: 400 }))

  const admin = createAdminClient()
  const pending = await loadValidPendingInstall(admin, token)
  if (!pending) return clearCookie(NextResponse.json({ error: 'pending_link_expired' }, { status: 400 }))

  const body = await request.json().catch(() => null) as { projectId?: unknown } | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : null
  if (!projectId) return NextResponse.json({ error: 'project_id_required' }, { status: 400 })

  // Ownership: the project MUST belong to THIS authenticated user. Never
  // trust anything about the project beyond its id from the request body.
  const { data: project } = await admin.from('projects').select('id, user_id').eq('id', projectId).maybeSingle()
  if (!project || (project as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Platform exclusivity — same rule as the logged-in-initiated OAuth callback.
  const { data: wordpress } = await admin.from('wordpress_connections').select('id').eq('project_id', projectId).maybeSingle()
  if (wordpress) return NextResponse.json({ error: 'platform_already_connected' }, { status: 409 })

  const missing = missingScopes(pending.granted_scopes)
  const status: 'connected' | 'failed' = missing.length > 0 ? 'failed' : 'connected'
  const lastError = missing.length > 0 ? `missing_scopes: ${missing.join(', ')}` : null

  const claim = await claimShopForProject(admin, {
    userId: user.id,
    projectId,
    shopDomain: pending.shop_domain,
    shopGid: pending.shop_gid,
    accessTokenEncrypted: pending.access_token_encrypted,
    apiVersion: pending.api_version,
    grantedScopes: pending.granted_scopes,
    storefrontDomain: pending.storefront_domain,
    connectionStatus: status,
    lastError,
    // The pending-install row this completes was created only after the App
    // Bridge session token's signature/issuer/audience/expiry/destination were
    // verified AND the offline token exchange succeeded for the same shop
    // (app/api/shopify/embedded-install/route.ts). The row itself is not the
    // proof — that verified exchange is.
    proof: 'session_token_exchange_verified',
  })
  if (!claim.ok) {
    const status = claim.reason === 'save_failed' ? 500 : 409
    return NextResponse.json({ error: claim.reason }, { status })
  }

  await consumePendingInstall(admin, token)

  // Send the merchant back INTO the embedded app in Shopify Admin (where the
  // connector home's live billing check will prompt them to choose a plan)
  // rather than leaving them on the external dashboard — closes the loop
  // into the normal pricing-selection flow. Falls back to the external
  // content hub only if the app handle isn't configured.
  const adminAppUrl = buildShopifyAdminAppUrl(pending.shop_domain)
  const redirectUrl = adminAppUrl.ok ? adminAppUrl.url : `/content?projectId=${encodeURIComponent(projectId)}`

  return clearCookie(NextResponse.json({ success: true, projectId, missingScopes: missing, redirectUrl }))
}
