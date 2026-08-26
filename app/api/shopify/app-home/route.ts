/**
 * Phase 2 — GET /api/shopify/app-home
 *
 * Backs the embedded connector home (app/shopify/app). Identity comes ONLY
 * from a verified Shopify App Bridge session token (`Authorization: Bearer
 * <token>` — see lib/shopify/session-token.ts) — a Supabase browser session
 * inside the iframe is never accepted as proof of Shopify identity on its
 * own, per the explicit Phase 2 requirement. The verified shop domain is
 * then used to look up the (already-linked, via the OAuth flow) Rankings
 * connection; nothing about which project/user this is comes from the
 * request itself.
 *
 * Re-verifies Shopify billing LIVE on every load (same Partner API call the
 * publish guard uses) so the status shown here is never stale — this is a
 * status DISPLAY, not itself a billing-sensitive mutation, but merchants use
 * it to decide whether to attempt a publish, so it must be accurate.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { verifyShopifySessionToken } from '@/lib/shopify/session-token'
import { getActiveShopifySubscription } from '@/lib/shopify/partner-client'
import { recordShopifyBillingCache } from '@/lib/shopify/billing-cache'
import { getActiveMigration } from '@/lib/shopify/paypal-migration'
import { hasWriteContent } from '@/lib/shopify/constants'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return Response.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  const verified = verifyShopifySessionToken(token)
  if (!verified.ok) {
    return Response.json({ error: 'invalid_session_token', reason: verified.reason }, { status: 401 })
  }
  const shopDomain = verified.shopDomain

  const admin = createAdminClient()
  const { data } = await admin
    .from('shopify_connections')
    .select('id, user_id, project_id, shop_gid, connection_status, granted_scopes, last_error')
    .eq('shop_domain', shopDomain)
    .maybeSingle()

  if (!data) {
    return Response.json({
      connected: false,
      shopDomain,
      appUrl: config.appUrl,
    })
  }
  const connection = data as {
    id: string; user_id: string; project_id: string; shop_gid: string | null
    connection_status: 'untested' | 'connected' | 'failed'; granted_scopes: string[] | null; last_error: string | null
  }

  const { data: project } = await admin
    .from('projects')
    .select('business_name, target_domain')
    .eq('id', connection.project_id)
    .maybeSingle()

  const { data: lastArticle } = await admin
    .from('generated_articles')
    .select('shopify_status, shopify_last_error, shopify_last_synced_at')
    .eq('project_id', connection.project_id)
    .not('shopify_last_synced_at', 'is', null)
    .order('shopify_last_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let billing: {
    status: 'active' | 'none' | 'unknown'
    planHandle: string | null
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    verificationError: string | null
  }
  if (!connection.shop_gid) {
    billing = { status: 'unknown', planHandle: null, trialEndsAt: null, currentPeriodEnd: null, verificationError: 'shop_identity_unverified' }
  } else {
    // shopDomain is from the VERIFIED session token (never a query param) —
    // passed as the expected canonical domain for the cross-check inside
    // getActiveShopifySubscription.
    const result = await getActiveShopifySubscription(connection.shop_gid, fetch, shopDomain)
    if (!result.ok) {
      billing = { status: 'unknown', planHandle: null, trialEndsAt: null, currentPeriodEnd: null, verificationError: result.reason }
      await recordShopifyBillingCache(admin, connection.id, {
        shopify_plan_handle: null, shopify_subscription_status: 'unknown',
        shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_cancel_at_end_of_cycle: false,
        shopify_billing_last_error: `verification_failed: ${result.reason}`,
      })
    } else if (!result.active) {
      billing = { status: 'none', planHandle: null, trialEndsAt: null, currentPeriodEnd: null, verificationError: null }
      await recordShopifyBillingCache(admin, connection.id, {
        shopify_plan_handle: null, shopify_subscription_status: 'none',
        shopify_trial_ends_at: null, shopify_current_period_end: null, shopify_cancel_at_end_of_cycle: false,
        shopify_billing_last_error: null,
      })
    } else {
      billing = { status: 'active', planHandle: result.planHandle, trialEndsAt: result.trialEndsAt, currentPeriodEnd: result.currentPeriodEnd, verificationError: null }
      await recordShopifyBillingCache(admin, connection.id, {
        shopify_plan_handle: result.planHandle, shopify_subscription_status: 'active',
        shopify_trial_ends_at: result.trialEndsAt, shopify_current_period_end: result.currentPeriodEnd,
        shopify_cancel_at_end_of_cycle: result.cancelAtEndOfCycle,
        shopify_billing_last_error: null,
      })
    }
  }

  const migration = await getActiveMigration(admin, connection.user_id)

  return Response.json({
    connected: true,
    shopDomain,
    appUrl: config.appUrl,
    connectionStatus: connection.connection_status,
    configOk: hasWriteContent(connection.granted_scopes) && connection.connection_status === 'connected',
    connectionLastError: connection.last_error,
    project: project ? { businessName: project.business_name, targetDomain: project.target_domain } : null,
    dashboardUrl: `${config.appUrl}/projects/${encodeURIComponent(connection.project_id)}`,
    billing,
    // Phase 2 (blocker fix) — no pre-built Shopify URL is ever handed to the
    // client. The "Manage plan" button in ConnectorHomeClient fetches
    // /api/shopify/billing/start-intent (with this same session token) to
    // mint a billing intent and get a fresh redirect URL just-in-time.
    migrationStatus: migration?.status ?? null,
    lastPublish: lastArticle
      ? { status: lastArticle.shopify_status, lastError: lastArticle.shopify_last_error, lastSyncedAt: lastArticle.shopify_last_synced_at }
      : null,
  })
}
