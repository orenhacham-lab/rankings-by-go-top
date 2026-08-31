import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { isShopifyBillingRequiredForUser } from '@/lib/shopify/paypal-block'
import { PENDING_LINK_COOKIE, verifyPendingLinkCookieValue } from '@/lib/shopify/pending-link'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import { billingMarketFromLocale } from '@/lib/paypal/checkout-plans'
import BillingView from './BillingView'
import AdminBillingView from './AdminBillingView'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const entitlement = await getUserEntitlement(user.id, supabase)

  // Hotfix — admin users bypass ALL billing-provider governance and
  // presentation. Checked FIRST, before any Shopify connection / migration /
  // PayPal / billing-market query — an admin's own Shopify store (kept
  // connected for testing/publishing) must never surface Shopify-managed
  // billing wording or a "Manage plan in Shopify" action, and
  // entitlement.plan being the internal 'premium' stand-in (used only to
  // grant full product limits — see lib/subscription.ts) must never be
  // displayed as if it were a real subscribed plan.
  if (entitlement.isAdmin) {
    return <AdminBillingView />
  }

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
    .is('archived_at', null)
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

  // Phase 3 — the billing CURRENCY is resolved from the durable, persisted
  // signup locale (user_metadata.locale), NEVER from the mutable dashboard
  // display-language toggle (useDashboardLanguage) and NEVER from browser
  // locale. A legacy account with no stored locale resolves to `null` here —
  // BillingView shows an explicit market-selection prompt instead of
  // guessing or defaulting silently (see app/api/billing-market/select).
  const market = billingMarketFromLocale((user.user_metadata as { locale?: string } | null)?.locale ?? null)

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
      market={market}
      planPricesILS={{
        trial: PLAN_LIMITS.trial.price,
        regular: PLAN_LIMITS.regular.price,
        advanced: PLAN_LIMITS.advanced.price,
        premium: PLAN_LIMITS.premium.price,
        large_agency: PLAN_LIMITS.large_agency.price,
      }}
      planPricesUSD={{
        trial: PLAN_LIMITS.trial.priceUSD,
        regular: PLAN_LIMITS.regular.priceUSD,
        advanced: PLAN_LIMITS.advanced.priceUSD,
        premium: PLAN_LIMITS.premium.priceUSD,
        large_agency: PLAN_LIMITS.large_agency.priceUSD,
      }}
    />
  )
}
