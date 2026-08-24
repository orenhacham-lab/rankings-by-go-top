/**
 * Phase 2 — GET /api/shopify/billing/return
 *
 * The redirect target after a merchant selects (or abandons) a plan on
 * Shopify's hosted App Pricing page (built by lib/shopify/billing-urls.ts).
 * This route is reached by a plain top-level browser navigation FROM
 * Shopify — there is no round-trip nonce to verify (Shopify's hosted pricing
 * page does not forward one back), so identity here rests on `shop` alone,
 * which is not secret. That is safe ONLY because this route never grants
 * entitlement from anything in the request: it re-derives the connection
 * from the DB by shop_domain, then asks the Shopify Partner API — the same
 * live, authoritative check the publish guard uses — whether that shop
 * actually has an active plan right now. `plan_handle`/other Shopify-supplied
 * query params are NEVER read for an entitlement decision; they exist only
 * for optional UX copy, which this route does not attempt.
 *
 * No Rankings session is required or assumed — a merchant may land here
 * without ever having logged into Rankings in this browser (per Phase 2:
 * "must handle... merchant needing login/registration"). This route only
 * re-verifies + advances the migration state machine; the project page it
 * redirects to enforces its own auth/ownership independently.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { normalizeShopDomain } from '@/lib/shopify/domain'
import { getShopifyOAuthConfig, projectReturnUrl } from '@/lib/shopify/oauth'
import { getActiveShopifySubscription } from '@/lib/shopify/partner-client'
import { recordShopifyBillingCache } from '@/lib/shopify/billing-cache'
import { confirmShopifyActiveAndAdvance } from '@/lib/shopify/paypal-migration'

export async function GET(request: Request) {
  if (!isContentModuleEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return Response.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })
  const appUrl = config.appUrl

  const url = new URL(request.url)
  const generic = (reason: string) => Response.redirect(`${appUrl}/projects?shopify=error&reason=${encodeURIComponent(reason)}`, 302)

  const shop = normalizeShopDomain(url.searchParams.get('shop') || '')
  if (!shop) return generic('invalid_shop')

  const admin = createAdminClient()
  const { data } = await admin
    .from('shopify_connections')
    .select('id, project_id, user_id, shop_gid')
    .eq('shop_domain', shop)
    .maybeSingle()
  const connection = data as { id: string; project_id: string; user_id: string; shop_gid: string | null } | null
  if (!connection) return generic('connection_not_found')

  const toProject = (q: Record<string, string>) => Response.redirect(projectReturnUrl(appUrl, connection.project_id, q), 302)

  if (!connection.shop_gid) {
    return toProject({ shopify: 'error', reason: 'shop_identity_unverified' })
  }

  const result = await getActiveShopifySubscription(connection.shop_gid)

  if (!result.ok) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null,
      shopify_subscription_status: 'unknown',
      shopify_trial_ends_at: null,
      shopify_current_period_end: null,
      shopify_billing_last_error: `verification_failed: ${result.reason}`,
    })
    return toProject({ shopify: 'error', reason: 'billing_verification_unavailable' })
  }

  if (!result.active) {
    await recordShopifyBillingCache(admin, connection.id, {
      shopify_plan_handle: null,
      shopify_subscription_status: 'none',
      shopify_trial_ends_at: null,
      shopify_current_period_end: null,
      shopify_billing_last_error: result.reason === 'unrecognized_plan_handle' ? `unrecognized_plan_handle: ${(result.rawHandles ?? []).join(',')}` : null,
    })
    // Abandoned or no recognized plan — never assume active because the
    // merchant merely returned from the pricing page.
    return toProject({ shopify: 'warning', reason: result.reason === 'unrecognized_plan_handle' ? 'unrecognized_plan' : 'no_active_plan' })
  }

  await recordShopifyBillingCache(admin, connection.id, {
    shopify_plan_handle: result.planHandle,
    shopify_subscription_status: 'active',
    shopify_trial_ends_at: result.trialEndsAt,
    shopify_current_period_end: result.currentPeriodEnd,
    shopify_billing_last_error: null,
  })

  // Advance the PayPal→Shopify migration, if this account is migrating. A
  // no-op for a non-migrating account. Never blocks the redirect below on
  // migration outcome — the merchant should see confirmation immediately;
  // the migration's own state (visible via shopifyMigrationStatus on the
  // billing page) surfaces any cancellation retry that's still needed.
  await confirmShopifyActiveAndAdvance(admin, connection.user_id)

  return toProject({ shopify: 'success', reason: 'billing_confirmed' })
}
