'use client'

import { useState } from 'react'
import Header from '@/components/layout/Header'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { PlanType } from '@/lib/subscription'
import { BILLING_MARKETS, type BillingMarket } from '@/lib/billing/market'
import { Check, ShoppingBag, Star, TriangleAlert } from 'lucide-react'
import { PLAN_AUDIENCE_DESCRIPTION, PLAN_AUDIENCE_LABEL } from '@/lib/plans/features'
import { Card } from '@/components/ui/Card'
import Button, { buttonClasses } from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import BillingClient from './client'

/** The 5 plans this view actually has cards/labels for. */
type PlanKey = 'trial' | 'regular' | 'advanced' | 'premium' | 'large_agency'

interface BillingViewProps {
  /** The full PlanType (blocker fix): includes 'shopify_billing_required',
   *  which this view never renders a card/label for — it's only ever
   *  used behind `hasActiveSubscription` (always false for that state) or
   *  the `shopifyConnected` panel, which takes over entirely instead of
   *  the plan-cards grid below. */
  plan: PlanType
  hasActiveSubscription: boolean
  trialActive: boolean
  trialEndsAt: string | null
  subscriptionEndsAt: string | null
  hasPaypalSubscriptionId: boolean
  renewalCancelled: boolean
  /** Phase 2 (blocker fix) — true when this user is anywhere in the
   *  Shopify billing-provider state machine: a connected store, an
   *  unresolved PayPal→Shopify migration, or a pending Shopify install/link
   *  in this browser (before any store is even connected yet). When true,
   *  PayPal checkout/upgrade/cancel UI is hidden entirely — this merchant
   *  must use Shopify App Pricing exclusively. */
  shopifyConnected: boolean
  /** Governance/migration state could not be read: offer NEITHER provider's
   *  mutations, and say so, rather than guessing a billing provider. */
  billingStateUnavailable?: boolean
  shopifyMigrationStatus: 'pending' | 'shopify_confirmed' | 'paypal_cancel_failed' | null
  /** w17 — decided on the server (lib/billing/server-market.ts): the stored
   *  market, else the pre-w17 market of an account that already paid, else
   *  the visitor's country. Never chosen here: there is no switcher. */
  market: BillingMarket
  /** True once the currency is fixed for this account (first payment made). */
  marketLocked: boolean
  /** The plans' prices in `market`, from the plan catalog. */
  planPrices: Record<PlanKey, number>
}

export default function BillingView({
  plan,
  hasActiveSubscription,
  trialActive,
  trialEndsAt,
  subscriptionEndsAt,
  hasPaypalSubscriptionId,
  renewalCancelled,
  shopifyConnected,
  billingStateUnavailable = false,
  shopifyMigrationStatus,
  market,
  marketLocked,
  planPrices,
}: BillingViewProps) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.billing
  const dateLocale = language === 'en' ? 'en-US' : 'he-IL'

  // w17 — the currency is the server's; this view only shows it.
  const currencySymbol = BILLING_MARKETS[market].symbol
  // DISPLAY ONLY (w7 P2-13): the same grouping the public pricing page shows (₪1,999, not ₪1999).
  const numberLocale = language === 'en' ? 'en-US' : 'he-IL'

  const [cancelling, setCancelling] = useState(false)
  // Shown in the page in our words; the route's own error text never reaches the merchant.
  const [cancelResult, setCancelResult] = useState<'ok' | 'failed' | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  const handleCancel = async () => {
    // The in-app confirmation (ui/ConfirmDialog) in place of the browser's box:
    // the same question, asked before the same request.
    const ok = await confirm({
      title: t.manage.confirmCancelTitle,
      body: t.manage.confirmCancel,
      confirmLabel: t.manage.confirmCancelAction,
      cancelLabel: t.manage.keepRenewal,
      tone: 'danger',
    })
    if (!ok) return
    setCancelling(true)
    setCancelResult(null)
    try {
      const response = await fetch('/api/paypal/cancel', { method: 'POST' })
      await response.json()
      if (!response.ok) {
        console.error('[billing] cancel renewal failed', response.status)
        setCancelResult('failed')
        setCancelling(false)
        return
      }
      setCancelResult('ok')
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      console.error('[billing] cancel renewal failed', error)
      setCancelResult('failed')
      setCancelling(false)
    }
  }

  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />

      {trialActive && (
        <div className="mb-6" data-billing-notice="trial">
          <Notice tone="info">
            <p>
              {t.trialActive}
              {trialEndsAt && (
                <span className="font-semibold">
                  {' '}{t.validUntilPrefix} {new Date(trialEndsAt).toLocaleDateString(dateLocale)}
                </span>
              )}
            </p>
            <p className="mt-1 text-caption text-body">{t.trialNoChargeNotice}</p>
          </Notice>
        </div>
      )}

      {hasActiveSubscription && (
        <div className="mb-6" data-billing-notice="active">
          <Notice tone="ok">
          <p>
            {t.onPlanPrefix} <span className="font-semibold">{plan in t.planLabels ? t.planLabels[plan as PlanKey] : plan}</span>.
            {subscriptionEndsAt && (
              <span>
                {' '}{t.renewalPrefix}{new Date(subscriptionEndsAt).toLocaleDateString(dateLocale)}
              </span>
            )}
          </p>
          </Notice>
        </div>
      )}

      {billingStateUnavailable ? (
        <Card className="mb-8 p-5 sm:p-6">
          <div className="flex items-start gap-3" data-billing-unavailable>
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-warn-soft text-warn">
              <TriangleAlert className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-section font-semibold text-ink">{t.unavailable.title}</h2>
              <p className="mt-1.5 max-w-prose text-copy text-muted">{t.unavailable.description}</p>
            </div>
          </div>
        </Card>
      ) : shopifyConnected ? (
        <Card className="mb-8 p-5 sm:p-6">
          <div className="flex items-start gap-3" data-billing-shopify>
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
              <ShoppingBag className="size-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h2 className="text-section font-semibold text-ink">{t.shopify.title}</h2>
                <p className="mt-1.5 max-w-prose text-copy text-muted">{t.shopify.description}</p>
              </div>
              {shopifyMigrationStatus === 'pending' && (
                <Notice tone="wait">{t.shopify.migrationPending}</Notice>
              )}
              {shopifyMigrationStatus === 'paypal_cancel_failed' && (
                <Notice tone="warn">{t.shopify.migrationNeedsAttention}</Notice>
              )}
              {/* Phase 2 (blocker fix) — never a pre-built Shopify URL: this
                  always goes through /api/shopify/billing/start-intent, which
                  authenticates the request, mints a single-use billing intent,
                  and only THEN redirects to Shopify's hosted pricing page.
                  A plain top-level GET link, drawn as the screen's one primary button. */}
              <a
                href="/api/shopify/billing/start-intent"
                className={buttonClasses({ variant: 'primary' })}
              >
                {t.shopify.manageButton}
              </a>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {hasActiveSubscription && (
            <Card className="mb-8">
              <h2 className="mb-3 text-section font-semibold text-ink">{t.manage.title}</h2>
              {renewalCancelled ? (
                <p className="text-copy text-body">
                  {t.manage.renewalAlreadyCancelled}
                  {subscriptionEndsAt && (
                    <span className="font-semibold">
                      {' '}{new Date(subscriptionEndsAt).toLocaleDateString(dateLocale)}
                    </span>
                  )}
                </p>
              ) : hasPaypalSubscriptionId ? (
                <>
                  <p className="mb-4 text-copy text-muted">{t.manage.description}</p>
                  <Button variant="danger" onClick={handleCancel} disabled={cancelling}>
                    {cancelling ? t.manage.cancelling : t.manage.cancelButton}
                  </Button>
                </>
              ) : (
                <p className="text-copy text-body">{t.manage.contactToCancel}</p>
              )}
              {cancelResult && (
                <Notice tone={cancelResult === 'ok' ? 'ok' : 'bad'} className="mt-4">
                  {cancelResult === 'ok' ? t.manage.cancelSuccess : t.manage.cancelError}
                </Notice>
              )}
            </Card>
          )}

          {/* w17 — one quiet line: which currency applies, and why. No switcher. */}
          <p className="mb-4 text-caption text-muted" data-billing-market={market} data-billing-market-locked={marketLocked ? 'true' : 'false'}>
            {marketLocked ? t.marketPrompt.locked(t.marketPrompt.currencyName[market]) : t.marketPrompt.byLocation(t.marketPrompt.currencyName[market])}
          </p>

          {/* The trial is a line above the paid plans rather than a fifth card in
              their grid, so the four plans you can buy sit side by side and the
              grid has no orphan row. Its words, price and "current plan" mark are
              the ones its card had. */}
          <TrialPlanRow
            name={t.trialName}
            currencySymbol={currencySymbol}
            features={t.features.trial}
            isCurrent={plan === 'trial'}
            currentLabel={t.currentPlan}
          />

          <div className="grid grid-cols-1 gap-5 pt-3 md:grid-cols-2 xl:grid-cols-4">
            <PlanCard
              name={t.planLabels.regular}
              price={planPrices.regular}
              currencySymbol={currencySymbol}
              period={t.perMonth}
              features={t.features.regular}
              isPopular={false}
              isCurrent={plan === 'regular' && hasActiveSubscription}
              plan="regular"
              audience={PLAN_AUDIENCE_LABEL.regular[language]}
              description={PLAN_AUDIENCE_DESCRIPTION.regular[language]}
              numberLocale={numberLocale}
              recommendedLabel={t.recommended}
              currentLabel={t.currentPlan}
            />
            <PlanCard
              name={t.planLabels.advanced}
              price={planPrices.advanced}
              currencySymbol={currencySymbol}
              period={t.perMonth}
              features={t.features.advanced}
              isPopular={true}
              isCurrent={plan === 'advanced' && hasActiveSubscription}
              plan="advanced"
              audience={PLAN_AUDIENCE_LABEL.advanced[language]}
              description={PLAN_AUDIENCE_DESCRIPTION.advanced[language]}
              numberLocale={numberLocale}
              recommendedLabel={t.recommended}
              currentLabel={t.currentPlan}
            />
            <PlanCard
              name={t.planLabels.premium}
              price={planPrices.premium}
              currencySymbol={currencySymbol}
              period={t.perMonth}
              features={t.features.premium}
              isPopular={false}
              isCurrent={plan === 'premium' && hasActiveSubscription}
              plan="premium"
              audience={PLAN_AUDIENCE_LABEL.premium[language]}
              description={PLAN_AUDIENCE_DESCRIPTION.premium[language]}
              numberLocale={numberLocale}
              recommendedLabel={t.recommended}
              currentLabel={t.currentPlan}
            />
            {planPrices.large_agency !== undefined && (
              <PlanCard
                name={t.planLabels.large_agency}
                price={planPrices.large_agency}
                currencySymbol={currencySymbol}
                period={t.perMonth}
                features={t.features.large_agency}
                isPopular={false}
                isCurrent={plan === 'large_agency' && hasActiveSubscription}
                plan="large_agency"
                audience={PLAN_AUDIENCE_LABEL.large_agency[language]}
                description={PLAN_AUDIENCE_DESCRIPTION.large_agency[language]}
                numberLocale={numberLocale}
                recommendedLabel={t.recommended}
                currentLabel={t.currentPlan}
              />
            )}
          </div>

          <BillingClient market={market} />

          <p className="mt-6 max-w-4xl text-caption text-muted">
            {t.keywordCheckNote}
          </p>
        </>
      )}
      {confirmDialog}
    </div>
  )
}

function Feature({ children, inverse = false }: { children: React.ReactNode; inverse?: boolean }) {
  return (
    <li className={cn('flex items-start gap-2 text-copy', inverse ? 'text-contrast-ink/90' : 'text-body')}>
      <Check strokeWidth={2.5} aria-hidden="true" className={cn('mt-1 size-4 shrink-0', inverse ? 'text-rail-tagline' : 'text-action')} />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function TrialPlanRow({ name, currencySymbol, features, isCurrent, currentLabel }: {
  name: string
  currencySymbol: string
  features: readonly string[]
  isCurrent: boolean
  currentLabel: string
}) {
  return (
    <div
      data-plan-card="trial"
      className={cn(
        'mb-4 grid gap-4 rounded-card border bg-surface p-5 shadow-card sm:p-6 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center',
        // The current plan is marked by its badge and a stronger border; the ring is the recommended plan's alone.
        isCurrent ? 'border-line-strong' : 'border-line',
      )}
    >
      <div className="min-w-0">
        {isCurrent && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-pill bg-sunk px-2.5 py-0.5 text-caption font-semibold text-ink"><Check aria-hidden="true" className="size-3.5" />{currentLabel}</span>
        )}
        <h3 className="text-section font-semibold text-ink">{name}</h3>
        <p className="mt-1 text-metric font-bold tracking-tight text-ink tabular-nums">{currencySymbol}0</p>
      </div>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => <Feature key={i}>{feature}</Feature>)}
      </ul>
    </div>
  )
}

interface PlanCardProps {
  name: string
  price: number
  currencySymbol: string
  period: string
  features: readonly string[]
  isPopular: boolean
  isCurrent: boolean
  plan: string
  /** Who the plan is for, and the sentence under its name: the public pricing page's own words. */
  audience: string
  description: string
  /** The locale the price is grouped in (he-IL / en-US). */
  numberLocale: string
  /** Shown in place of the PayPal container when there is no stored billing market. */
  action?: React.ReactNode
  recommendedLabel: string
  currentLabel: string
}

/**
 * One plan, drawn like the public pricing page's card (w7 P2-13): the audience
 * pill, the name and its sentence, the price grouped for the locale, the limits
 * under a hairline, and the recommended plan as the one navy card with the star
 * badge on its edge (in the action colour: no amber on this screen). DISPLAY ONLY: the price, the limits and the actions are the
 * ones this screen was given.
 */
function PlanCard({
  name,
  price,
  currencySymbol,
  period,
  features,
  isPopular,
  isCurrent,
  plan,
  audience,
  description,
  numberLocale,
  action,
  recommendedLabel,
  currentLabel,
}: PlanCardProps) {
  const navy = isPopular
  return (
    <div
      data-plan-card={plan}
      className={cn(
        'lift relative flex h-full min-w-0 flex-col rounded-card border p-5 shadow-card sm:p-6',
        navy
          ? 'border-contrast bg-contrast text-contrast-ink bg-[radial-gradient(60%_80%_at_85%_0%,rgb(0_134_245/0.35),transparent_60%),radial-gradient(50%_70%_at_10%_100%,rgb(127_195_255/0.18),transparent_65%)]'
          : isCurrent ? 'border-line-strong bg-surface' : 'border-line bg-surface',
      )}
    >
      {isPopular && (
        <span className="absolute inset-x-0 -top-3 mx-auto flex h-6 w-fit items-center gap-1 rounded-pill bg-action px-2.5 py-0.5 text-caption font-semibold text-action-ink shadow-control">
          <Star className="size-3" fill="currentColor" aria-hidden="true" />
          {recommendedLabel}
        </span>
      )}

      {/* The audience, and the current-plan mark beside it. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex h-6 items-center rounded-pill px-2.5 text-caption font-semibold', navy ? 'bg-contrast-ink/10 text-rail-tagline' : 'bg-action-soft text-action')}>
          {audience}
        </span>
        {isCurrent && (
          <span className={cn('inline-flex h-6 items-center gap-1 rounded-pill px-2.5 text-caption font-semibold', navy ? 'bg-contrast-ink/10 text-contrast-ink' : 'bg-sunk text-ink')}>
            <Check aria-hidden="true" className="size-3.5" />
            {currentLabel}
          </span>
        )}
      </div>

      <h3 className={cn('mt-3 text-title font-bold tracking-tight', navy ? 'text-contrast-ink' : 'text-ink')}>{name}</h3>
      <p className={cn('mt-1 text-copy md:min-h-12', navy ? 'text-contrast-ink/75' : 'text-body')}>{description}</p>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
        <span className={cn('text-metric font-bold tracking-tight tabular-nums', navy ? 'text-contrast-ink' : 'text-ink')} data-plan-price>
          {currencySymbol}{price.toLocaleString(numberLocale)}
        </span>
        {period && <span className={cn('text-copy', navy ? 'text-contrast-ink/60' : 'text-muted')}>{period}</span>}
      </div>

      <ul className={cn('mt-5 mb-6 flex-1 space-y-2.5 border-t pt-5', navy ? 'border-contrast-ink/10' : 'border-line')}>
        {features.map((feature, i) => <Feature key={i} inverse={navy}>{feature}</Feature>)}
      </ul>

      {isCurrent ? (
        <button
          disabled
          className={cn('h-10 w-full cursor-not-allowed rounded-control px-4 text-copy font-semibold', navy ? 'bg-contrast-ink/10 text-contrast-ink/70' : 'bg-sunk text-muted')}
        >
          {currentLabel}
        </button>
      ) : action ? (
        action
      ) : (
        <div className="paypal-button-wrapper">
          <div
            id={`paypal-button-${plan}`}
            className="min-h-12"
          />
        </div>
      )}
    </div>
  )
}
