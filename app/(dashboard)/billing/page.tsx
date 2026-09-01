import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { resolveBillingAuthority } from '@/lib/billing/governance'
import { getActiveMigrationResult } from '@/lib/shopify/paypal-migration'
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

  // BILLING PROVIDER — decided by the durable billing AUTHORITY, never by the
  // existence of a Shopify connection.
  //
  // This page used to compute `!!shopifyConn || …`, which handed the whole
  // billing screen to Shopify the moment a website customer connected a store
  // for publishing — taking away the PayPal controls of the only provider that
  // actually bills them. A connection is an integration record.
  //
  // Shopify billing is shown when, and only when:
  //   * Shopify is the durable authority (a verified direct App Store install,
  //     or a completed migration); or
  //   * an explicit PayPal→Shopify migration is in flight; or
  //   * this very browser is mid-install through the App Store flow (a signed
  //     pending-link cookie, set only by the embedded install and the pre-auth
  //     OAuth callback — never by the dashboard connector).
  //
  // When governance cannot be read, neither provider's mutations are offered:
  // the page says so rather than guessing a provider.
  const admin = createAdminClient()
  const shopifyConfig = getShopifyOAuthConfig()
  const cookieStore = await cookies()
  const pendingLinkCookie = cookieStore.get(PENDING_LINK_COOKIE)?.value
  const hasPendingLink = shopifyConfig ? verifyPendingLinkCookieValue(pendingLinkCookie, shopifyConfig.clientSecret) !== null : false

  const authority = await resolveBillingAuthority(admin, user.id)
  const migrationResult = await getActiveMigrationResult(admin, user.id)
  const governanceUnavailable = !authority.ok || !migrationResult.ok
  const shopifyConnected = governanceUnavailable
    ? false
    : (authority.ok && authority.authority === 'shopify') || !!migrationResult.migration || hasPendingLink

  const shopifyMigrationStatus =
    (migrationResult.ok && migrationResult.migration?.status as 'pending' | 'shopify_confirmed' | 'paypal_cancel_failed' | undefined) || null

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
      billingStateUnavailable={governanceUnavailable}
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
