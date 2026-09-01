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
import { PENDING_LINK_COOKIE, verifyPendingLinkCookieValue, loadValidPendingInstall } from '@/lib/shopify/pending-link'
import { completeShopifyAppStoreLink } from '@/lib/shopify/app-store-link'
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

  // ── ONE ATOMIC TRANSITION ────────────────────────────────────────────────
  //
  // Claiming the connection, applying the install provenance, creating or
  // deferring the PayPal migration, setting billing authority and consuming the
  // one-time pending install all happen inside a single database transaction
  // (complete_shopify_app_store_link). Previously these were separate writes
  // whose results this route ignored, so a direct App Store installation could
  // end up connected as a website-billed account, or the one-time token could
  // be consumed with no governance written.
  //
  // The billing decision inside comes from the pending row's own
  // `install_origin`, stamped server-side by the route that created it — by
  // app/api/shopify/embedded-install after verifying an App Bridge session
  // token, or by the pre-auth OAuth branch after verifying the callback HMAC,
  // the signed nonce and the one-time state. This request's body carries only
  // `projectId` and can never claim App Store provenance.
  //
  // ANTI-BYPASS (App Store review): the provenance travels with the install,
  // not with the session, so an App Store installer signing into a website
  // account does not escape Shopify Billing. And an account with an ACTIVE
  // PayPal subscription is not switched by installing — it goes through the
  // explicit migration workflow, and authority moves only when that migration
  // is confirmed complete.
  const linked = await completeShopifyAppStoreLink(admin, {
    pendingToken: token,
    userId: user.id,
    projectId,
    connectionStatus: status,
    lastError,
  })
  if (!linked.ok) {
    // NOTHING was written on any failure path — the transaction rolled back, so
    // the one-time token is still unconsumed and can be retried.
    const httpStatus = linked.reason === 'save_failed' ? 500 : linked.reason === 'pending_invalid' ? 400 : 409
    return clearCookie(NextResponse.json({ error: linked.reason }, { status: httpStatus }))
  }

  // Send the merchant back INTO the embedded app in Shopify Admin (where the
  // connector home's live billing check will prompt them to choose a plan)
  // rather than leaving them on the external dashboard — closes the loop
  // into the normal pricing-selection flow. Falls back to the external
  // content hub only if the app handle isn't configured.
  const adminAppUrl = buildShopifyAdminAppUrl(pending.shop_domain)
  const redirectUrl = adminAppUrl.ok ? adminAppUrl.url : `/content?projectId=${encodeURIComponent(projectId)}`

  return clearCookie(NextResponse.json({ success: true, projectId, missingScopes: missing, redirectUrl }))
}
