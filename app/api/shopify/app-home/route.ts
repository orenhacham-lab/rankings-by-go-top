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
import { getActiveShopifySubscription, describeInactiveSubscription } from '@/lib/shopify/partner-client'
import { recordShopifyBillingCache } from '@/lib/shopify/billing-cache'
import { hasWriteContent } from '@/lib/shopify/constants'
import { classifyReinstallNeed } from '@/lib/shopify/connection-health'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import { isAdminUser } from '@/app/api/shopify/billing/start-intent/route'
import { resolveBillingAuthority } from '@/lib/billing/governance'
import { getActiveMigrationResult } from '@/lib/shopify/paypal-migration'

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
    .is('archived_at', null)
    .maybeSingle()

  if (!data) {
    return Response.json({
      connected: false,
      shopDomain,
      appUrl: config.appUrl,
    })
  }

  // Reinstall entry (production bug + its follow-up dead-end).
  //
  // After `app/uninstalled` the row survives as a TOMBSTONE — connection_status
  // 'failed', last_error 'app_uninstalled', scopes cleared, token replaced by
  // the revocation sentinel. It is live (archived_at IS NULL) but its Admin API
  // token is dead, so it is NOT a usable connection. This route once reported
  // `connected: true` for it purely because a row existed, so the embedded
  // client rendered "Needs attention" and never reached the branch that calls
  // /api/shopify/embedded-install.
  //
  // The first fix matched one exact string, `last_error === 'app_uninstalled'`.
  // POST /api/shopify/test-connection then overwrote that free-text column with
  // the client's English sentence ("Authentication failed. Check the Admin API
  // access token."), the predicate stopped matching, and the store was stuck on
  // "Needs attention" with no way back. Detection now goes through the shared,
  // language-independent classifier in lib/shopify/connection-health.ts, which
  // recognises stable machine codes (and normalises legacy prose already in the
  // table) — and stays NARROW: only an uninstall tombstone or a conclusively
  // rejected credential (Shopify 401/403) demands a fresh managed install. A
  // missing scope, a permission refusal or a transport failure still reports as
  // connected-with-a-problem, which the merchant can retry or re-test.
  const reinstall = classifyReinstallNeed(data as { connection_status?: string; last_error?: string | null })
  if (reinstall.needsInstall) {
    return Response.json({
      connected: false,
      needsInstall: true,
      needsInstallReason: reinstall.reason,
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

  // Hotfix — admin billing bypass. Checked BEFORE the live Shopify Partner
  // API billing call below, so an admin's connector home NEVER makes that
  // network call or writes a billing cache row at all (there is nothing to
  // govern) — the client renders no Billing card / plan-selection control
  // for isAdmin: true (see ConnectorHomeClient.tsx). Reuses the SAME
  // exported gate function as /api/shopify/billing/start-intent, rather
  // than a 5th independent inline copy of the role check.
  const isAdmin = await isAdminUser(admin, connection.user_id)

  // BILLING PROVIDER. A connected store does not mean Shopify bills this
  // account: almost every customer registers on the website and may connect
  // Shopify purely as a publishing destination. For those merchants the
  // embedded app must say billing lives on the website, must NOT offer a
  // Shopify plan button, and must NOT call the Partner billing API at all.
  const authority = await resolveBillingAuthority(admin, connection.user_id)
  const migrationResult = await getActiveMigrationResult(admin, connection.user_id)
  const billingStateUnavailable = !authority.ok || !migrationResult.ok
  const shopifyBills = !billingStateUnavailable
    && ((authority.ok && authority.authority === 'shopify') || !!migrationResult.migration)

  let billing: {
    status: 'active' | 'none' | 'unknown'
    planHandle: string | null
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    verificationError: string | null
  } | null = null
  if (isAdmin) {
    // No live billing check, no cache write — admins are never Shopify
    // billing-governed.
  } else if (!shopifyBills) {
    // Website-billed (or an unreadable state): no live Partner API call, no
    // billing cache write, and the client renders no plan control.
  } else if (!connection.shop_gid) {
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
        // PRESERVE THE REASON. This wrote `null` on every inactive result, so
        // "Shopify has no contract for this shop" and "Shopify has a contract
        // whose handle we did not recognise" were recorded identically — and
        // this is the path that actually ran during the Sep 2 incident, which
        // is why the database held no evidence at all. The note is a short,
        // sanitized code plus (at most) Shopify's own public plan handles.
        shopify_billing_last_error: describeInactiveSubscription(result.reason, result.rawHandles),
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

  return Response.json({
    connected: true,
    shopDomain,
    appUrl: config.appUrl,
    connectionStatus: connection.connection_status,
    configOk: hasWriteContent(connection.granted_scopes) && connection.connection_status === 'connected',
    connectionLastError: connection.last_error,
    project: project ? { businessName: project.business_name, targetDomain: project.target_domain } : null,
    dashboardUrl: `${config.appUrl}/projects/${encodeURIComponent(connection.project_id)}`,
    // Hotfix — admin billing bypass: isAdmin: true means the client must
    // render NO Billing card / plan-selection control at all (billing is
    // always null in that case too, above).
    isAdmin,
    billing,
    // Phase 2 (blocker fix) — no pre-built Shopify URL is ever handed to the
    // client. The "Manage plan" button in ConnectorHomeClient fetches
    // /api/shopify/billing/start-intent (with this same session token) to
    // mint a billing intent and get a fresh redirect URL just-in-time.
    migrationStatus: migrationResult.ok ? (migrationResult.migration?.status ?? null) : null,
    // Which provider bills this store, so the embedded client never offers a
    // Shopify plan to a website-billed merchant.
    billingProvider: billingStateUnavailable ? 'unavailable' : (shopifyBills ? 'shopify' : 'website'),
    lastPublish: lastArticle
      ? { status: lastArticle.shopify_status, lastError: lastArticle.shopify_last_error, lastSyncedAt: lastArticle.shopify_last_synced_at }
      : null,
  })
}
