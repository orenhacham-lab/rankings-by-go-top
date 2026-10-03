import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUserEntitlement } from '@/lib/subscription'
import { resolveBillingAuthority } from '@/lib/billing/governance'
import { getActiveMigrationResult } from '@/lib/shopify/paypal-migration'
import { PENDING_LINK_COOKIE, verifyPendingLinkCookieValue } from '@/lib/shopify/pending-link'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import { resolveBillingMarket } from '@/lib/billing/server-market'
import { planPriceIn } from '@/lib/billing/market'
import { PLAN_CATALOG } from '@/lib/plans/catalog'
import { paddleEnvSnapshot, resolvePaddleConfig } from '@/lib/paddle/config'
import BillingView from './BillingView'
import AdminBillingView from './AdminBillingView'

interface CurrentSubscriptionRow {
  status: string
  paypal_subscription_id: string | null
  /** Selected only while Paddle is on (the column comes with its migration). */
  paddle_subscription_id?: string | null
}

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

  // w21 — Paddle (merchant of record) is a second checkout behind a switch
  // that is OFF unless every value is set (lib/paddle/config.ts). Off: this
  // page reads and renders exactly what it did before Paddle existed — the
  // paddle_* columns are not even selected, so the screen keeps working where
  // the Paddle migration has not been applied.
  const paddleConfig = resolvePaddleConfig(paddleEnvSnapshot())
  const { data: activeSub } = await supabase
    .from('subscriptions')
    .select<string, CurrentSubscriptionRow>(paddleConfig.enabled ? 'status, paypal_subscription_id, paddle_subscription_id' : 'status, paypal_subscription_id')
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

  // w17 — the billing CURRENCY comes from the ONE server-side resolver
  // (lib/billing/server-market.ts): the market stored at the first PayPal
  // checkout, else (accounts that already paid before w17) the pre-w17
  // locale market, else the visitor's country (IL -> ILS, else USD). Never
  // the dashboard language toggle, never a client choice, no switcher.
  const { market, locked: marketLocked } = await resolveBillingMarket(supabase, user)

  // w21 — Paddle is offered only to a website-billed account (never while
  // Shopify governs it or governance is unreadable: checked above, first) that
  // has no PayPal subscription on its current row (a second provider would
  // bill it twice). Admins never reach this line.
  const currentSub = activeSub
  const paddle = paddleConfig.enabled && !governanceUnavailable && !shopifyConnected && !currentSub?.paypal_subscription_id
    ? { ...paddleConfig.checkout, userId: user.id, email: user.email ?? null }
    : null

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
      marketLocked={marketLocked}
      planPrices={{
        trial: 0,
        regular: planPriceIn(PLAN_CATALOG.regular, market),
        advanced: planPriceIn(PLAN_CATALOG.advanced, market),
        premium: planPriceIn(PLAN_CATALOG.premium, market),
        large_agency: planPriceIn(PLAN_CATALOG.large_agency, market),
      }}
      paddle={paddle}
      hasPaddleSubscription={!!paddle && !!currentSub?.paddle_subscription_id}
    />
  )
}
