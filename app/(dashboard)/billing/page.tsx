import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { isShopifyBillingRequiredForUser } from '@/lib/shopify/paypal-block'
import { PENDING_LINK_COOKIE, verifyPendingLinkCookieValue } from '@/lib/shopify/pending-link'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import BillingView from './BillingView'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const entitlement = await getUserEntitlement(user.id, supabase)

  const { data: activeSub } = await supabase
    .from('subscriptions')
    .select('status, paypal_subscription_id')
    .eq('user_id', user.id)
    .in('status', ['active', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const renewalCancelled = activeSub?.status === 'cancelled'

  // Phase 2 — a merchant with an actively CONNECTED Shopify store must use
  // Shopify App Pricing exclusively; PayPal checkout/upgrade/downgrade UI is
  // hidden entirely (server routes also enforce this independently — see
  // app/api/paypal/activate/route.ts). A connection that was later
  // uninstalled (connection_status !== 'connected') does NOT gate this —
  // that merchant reverts to the PayPal population.
  const { data: shopifyConn } = await supabase
    .from('shopify_connections')
    .select('shop_domain')
    .eq('user_id', user.id)
    .eq('connection_status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Phase 2 (blocker fix) — "must hide the PayPal UI" covers the FULL
  // billing-provider state machine, not only a fully 'connected' store: a
  // connection stuck at 'failed' with an unresolved migration, AND a
  // pending Shopify install/link (this exact browser mid-linking, before
  // any shopify_connections row even exists — see
  // lib/shopify/pending-link.ts) both hide it too. Never decided by
  // referrer/UTM/client state.
  const admin = createAdminClient()
  const shopifyConfig = getShopifyOAuthConfig()
  const cookieStore = await cookies()
  const pendingLinkCookie = cookieStore.get(PENDING_LINK_COOKIE)?.value
  const hasPendingLink = shopifyConfig ? verifyPendingLinkCookieValue(pendingLinkCookie, shopifyConfig.clientSecret) !== null : false
  const shopifyConnected = !!shopifyConn || await isShopifyBillingRequiredForUser(admin, user.id) || hasPendingLink

  let shopifyMigrationStatus: 'pending' | 'shopify_confirmed' | 'paypal_cancel_failed' | null = null
  if (shopifyConnected) {
    const { data: migration } = await supabase
      .from('shopify_billing_migrations')
      .select('status')
      .eq('user_id', user.id)
      .in('status', ['pending', 'shopify_confirmed', 'paypal_cancel_failed'])
      .maybeSingle()
    if (migration) shopifyMigrationStatus = (migration as { status: 'pending' | 'shopify_confirmed' | 'paypal_cancel_failed' }).status
  }

  return (
    <BillingView
      plan={entitlement.plan}
      hasActiveSubscription={entitlement.hasActiveSubscription}
      trialActive={entitlement.trialActive}
      trialEndsAt={entitlement.trialEndsAt}
      subscriptionEndsAt={entitlement.subscriptionEndsAt}
      hasPaypalSubscriptionId={!!activeSub?.paypal_subscription_id}
      renewalCancelled={renewalCancelled}
      shopifyConnected={shopifyConnected}
      shopifyMigrationStatus={shopifyMigrationStatus}
      planPrices={{
        trial: PLAN_LIMITS.trial.price,
        regular: PLAN_LIMITS.regular.price,
        advanced: PLAN_LIMITS.advanced.price,
        premium: PLAN_LIMITS.premium.price,
        large_agency: PLAN_LIMITS.large_agency.price,
      }}
    />
  )
}
