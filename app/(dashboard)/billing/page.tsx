import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUserEntitlement } from '@/lib/subscription'
import { resolveBillingAuthority } from '@/lib/billing/governance'
import { getActiveMigrationResult } from '@/lib/shopify/paypal-migration'
import { readMigrationPaidPeriod } from '@/lib/shopify/paypal-paid-period'
import { hasAnyShopifyConnectionResult } from '@/lib/shopify/paypal-block'
import { PENDING_LINK_COOKIE, verifyPendingLinkCookieValue } from '@/lib/shopify/pending-link'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import { resolveBillingMarket } from '@/lib/billing/server-market'
import { planPriceIn } from '@/lib/billing/market'
import { PLAN_CATALOG } from '@/lib/plans/catalog'
import BillingView from './BillingView'
import AdminBillingView from './AdminBillingView'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // SERVICE-ROLE, not the request-scoped client: getUserEntitlement reads
  // billing_governance, which is REVOKEd from `authenticated` and errors
  // (42501) rather than returning an empty set — collapsing the whole
  // entitlement to zero limits. See lib/supabase/admin.ts.
  const entitlement = await getUserEntitlement(user.id, createAdminClient())

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
  // OWNER DECISION, 9 Oct 2026: any Shopify store connected to this account
  // (any status, any of its projects) means it is billed through Shopify, so
  // no PayPal checkout is offered — the same rule /api/paypal/activate enforces
  // (isShopifyBillingRequiredForUser). Admins never reach this point.
  const storeResult = await hasAnyShopifyConnectionResult(admin, user.id)
  // A migrating account still inside the PayPal period it already paid for
  // keeps that plan; no Shopify plan is offered before the period ends.
  const paidPeriod = migrationResult.ok && migrationResult.migration && authority.ok && authority.authority !== 'shopify'
    ? await readMigrationPaidPeriod(admin, user.id, migrationResult.migration)
    : null
  const governanceUnavailable = !authority.ok || !migrationResult.ok || !storeResult.ok || (paidPeriod !== null && !paidPeriod.ok)
  const shopifyConnected = governanceUnavailable
    ? false
    : (authority.ok && authority.authority === 'shopify') || !!migrationResult.migration || hasPendingLink
  const shopifyStoreConnected = !governanceUnavailable && storeResult.ok && storeResult.connected
  const websitePaidPeriod = paidPeriod && paidPeriod.ok && paidPeriod.period.inPaidPeriod ? paidPeriod.period : null

  const shopifyMigrationStatus =
    (migrationResult.ok && migrationResult.migration?.status as 'pending' | 'shopify_confirmed' | 'paypal_cancel_failed' | undefined) || null

  // w17 — the billing CURRENCY comes from the ONE server-side resolver
  // (lib/billing/server-market.ts): the market stored at the first PayPal
  // checkout, else (accounts that already paid before w17) the pre-w17
  // locale market, else the visitor's country (IL -> ILS, else USD). Never
  // the dashboard language toggle, never a client choice, no switcher.
  const { market, locked: marketLocked } = await resolveBillingMarket(supabase, user)

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
      shopifyStoreConnected={shopifyStoreConnected}
      websitePaidPeriod={websitePaidPeriod ? { paidUntil: websitePaidPeriod.paidUntil, renewalStopped: websitePaidPeriod.renewalStopped } : null}
      market={market}
      marketLocked={marketLocked}
      planPrices={{
        trial: 0,
        regular: planPriceIn(PLAN_CATALOG.regular, market),
        advanced: planPriceIn(PLAN_CATALOG.advanced, market),
        premium: planPriceIn(PLAN_CATALOG.premium, market),
        large_agency: planPriceIn(PLAN_CATALOG.large_agency, market),
      }}
    />
  )
}
