import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { buildShopifyPricingUrl } from '@/lib/shopify/billing-urls'
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

  const shopifyConnected = !!shopifyConn
  const shopifyPricing = shopifyConn ? buildShopifyPricingUrl(shopifyConn.shop_domain) : null
  const shopifyPricingUrl = shopifyPricing?.ok ? shopifyPricing.url : null

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
      shopifyPricingUrl={shopifyPricingUrl}
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
