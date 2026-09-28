'use client'

import { useState } from 'react'
import Header from '@/components/layout/Header'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { PlanType } from '@/lib/subscription'
import type { BillingMarket } from '@/lib/paypal/checkout-plans'
import { Check, CheckCircle2, Coins, Info } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
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
  /** Phase 3 — resolved server-side from the durable user_metadata.locale,
   *  NEVER from the dashboard display-language toggle. `null` means a
   *  legacy account with no stored locale — an explicit market prompt is
   *  shown instead of any plan card or PayPal button. */
  market: BillingMarket | null
  planPricesILS: Record<PlanKey, number>
  planPricesUSD: Record<PlanKey, number>
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
  planPricesILS,
  planPricesUSD,
}: BillingViewProps) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.billing
  const dateLocale = language === 'en' ? 'en-US' : 'he-IL'
  const planPrices = market === 'USD' ? planPricesUSD : planPricesILS
  const currencySymbol = market === 'USD' ? '$' : '₪'

  const [cancelling, setCancelling] = useState(false)
  const [cancelMessage, setCancelMessage] = useState('')
  const [savingMarket, setSavingMarket] = useState<BillingMarket | null>(null)

  const selectMarket = async (chosen: BillingMarket) => {
    setSavingMarket(chosen)
    try {
      const res = await fetch('/api/billing-market/select', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ market: chosen }),
      })
      if (res.ok) window.location.reload()
      else setSavingMarket(null)
    } catch {
      setSavingMarket(null)
    }
  }

  const handleCancel = async () => {
    if (!confirm(t.manage.confirmCancel)) return
    setCancelling(true)
    setCancelMessage('')
    try {
      const response = await fetch('/api/paypal/cancel', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) {
        setCancelMessage(`${t.manage.cancelError} ${result.error || ''}`)
        setCancelling(false)
        return
      }
      setCancelMessage(t.manage.cancelSuccess)
      setTimeout(() => window.location.reload(), 1500)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCancelMessage(`${t.manage.cancelError} ${errorMsg}`)
      setCancelling(false)
    }
  }

  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />

      {trialActive && (
        <div className="mb-6 flex items-start gap-3 rounded-card border border-info/20 bg-info-soft px-5 py-4" data-billing-notice="trial">
          <Info size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
          <div className="min-w-0">
            <p className="text-copy text-ink">
              {t.trialActive}
              {trialEndsAt && (
                <span className="font-semibold">
                  {' '}{t.validUntilPrefix} {new Date(trialEndsAt).toLocaleDateString(dateLocale)}
                </span>
              )}
            </p>
            <p className="mt-1 text-caption text-muted">{t.trialNoChargeNotice}</p>
          </div>
        </div>
      )}

      {hasActiveSubscription && (
        <div className="mb-6 flex items-start gap-3 rounded-card border border-ok/20 bg-ok-soft px-5 py-4" data-billing-notice="active">
          <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
          <p className="min-w-0 text-copy text-ink">
            {t.onPlanPrefix} <span className="font-semibold">{plan in t.planLabels ? t.planLabels[plan as PlanKey] : plan}</span>.
            {subscriptionEndsAt && (
              <span>
                {' '}{t.renewalPrefix}{new Date(subscriptionEndsAt).toLocaleDateString(dateLocale)}
              </span>
            )}
          </p>
        </div>
      )}

      {billingStateUnavailable ? (
        <Card className="mb-8 border-s-4 border-s-warn">
          <h2 className="mb-1.5 text-section font-semibold text-ink">{t.unavailable.title}</h2>
          <p className="text-copy text-muted">{t.unavailable.description}</p>
        </Card>
      ) : shopifyConnected ? (
        <div className="mb-8 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t.shopify.title}</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm">{t.shopify.description}</p>
          {shopifyMigrationStatus === 'pending' && (
            <p className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">{t.shopify.migrationPending}</p>
          )}
          {shopifyMigrationStatus === 'paypal_cancel_failed' && (
            <p className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{t.shopify.migrationNeedsAttention}</p>
          )}
          {/* Phase 2 (blocker fix) — never a pre-built Shopify URL: this
              always goes through /api/shopify/billing/start-intent, which
              authenticates the request, mints a single-use billing intent,
              and only THEN redirects to Shopify's hosted pricing page. */}
          <a
            href="/api/shopify/billing/start-intent"
            className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            {t.shopify.manageButton}
          </a>
        </div>
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
              {cancelMessage && (
                <p className="mt-3 text-copy text-body">{cancelMessage}</p>
              )}
            </Card>
          )}

          {market === null ? (
            // Phase 3 — a legacy account with no stored billing market.
            // Never silently defaulted (browser locale, dashboard toggle) —
            // an explicit, one-time, persisted choice is required before any
            // plan/price/checkout is shown.
            <Card className="mb-8" >
              <div className="mx-auto flex max-w-xl flex-col items-center py-2 text-center" data-billing-market-prompt="">
                <span aria-hidden="true" className="mb-4 grid size-11 place-items-center rounded-2xl bg-action-soft text-action ring-1 ring-action/10">
                  <Coins size={20} strokeWidth={2} />
                </span>
                <h2 className="text-section font-semibold text-ink">{t.marketPrompt.title}</h2>
                <p className="mt-1.5 text-copy text-muted">{t.marketPrompt.description}</p>
                <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => selectMarket('ILS')}
                    disabled={savingMarket !== null}
                  >
                    {savingMarket === 'ILS' ? t.marketPrompt.saving : t.marketPrompt.ilsOption}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => selectMarket('USD')}
                    disabled={savingMarket !== null}
                  >
                    {savingMarket === 'USD' ? t.marketPrompt.saving : t.marketPrompt.usdOption}
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <>
              <p className="mb-4 flex flex-wrap items-center gap-2 text-copy font-semibold text-ink" data-billing-market={market}>
                {t.marketPrompt.currentMarketPrefix}
                <span className="rounded-pill border border-line bg-surface px-2.5 py-0.5 text-caption font-semibold text-ink">
                  {market === 'USD' ? t.marketPrompt.usdLabel : t.marketPrompt.ilsLabel}
                </span>
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <PlanCard
                  name={t.planLabels.regular}
                  price={planPrices.regular}
                  currencySymbol={currencySymbol}
                  period={t.perMonth}
                  features={t.features.regular}
                  isPopular={false}
                  isCurrent={plan === 'regular' && hasActiveSubscription}
                  plan="regular"
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
        </>
      )}
    </div>
  )
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-copy text-body">
      <Check size={16} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
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
        'mb-4 grid gap-4 rounded-card border bg-surface p-5 shadow-card md:grid-cols-[12rem_minmax(0,1fr)] md:items-center',
        isCurrent ? 'border-action ring-1 ring-action' : 'border-line',
      )}
    >
      <div className="min-w-0">
        {isCurrent && (
          <span className="mb-2 inline-flex rounded-pill bg-action-soft px-2.5 py-0.5 text-caption font-semibold text-action">{currentLabel}</span>
        )}
        <h3 className="text-section font-semibold text-ink">{name}</h3>
        <p className="mt-1 text-[1.75rem] font-bold leading-none tracking-tight text-ink tabular-nums">{currencySymbol}0</p>
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
  recommendedLabel: string
  currentLabel: string
}

function PlanCard({
  name,
  price,
  currencySymbol,
  period,
  features,
  isPopular,
  isCurrent,
  plan,
  recommendedLabel,
  currentLabel,
}: PlanCardProps) {
  return (
    <div
      data-plan-card={plan}
      className={cn(
        'flex h-full min-w-0 flex-col rounded-card border bg-surface p-5 shadow-card',
        isCurrent ? 'border-action ring-1 ring-action' : isPopular ? 'border-commit ring-1 ring-commit' : 'border-line',
      )}
    >
      {/* One line for the plan's mark. Side by side it is kept even when empty, so the prices of
          the four cards sit on one line. */}
      <div className="flex flex-wrap items-center gap-2 empty:hidden md:min-h-6 md:empty:flex">
        {isPopular && (
          <span className="inline-flex rounded-pill bg-commit px-2.5 py-0.5 text-caption font-semibold text-commit-ink">
            {recommendedLabel}
          </span>
        )}
        {isCurrent && (
          <span className="inline-flex rounded-pill bg-action-soft px-2.5 py-0.5 text-caption font-semibold text-action">
            {currentLabel}
          </span>
        )}
      </div>

      <h3 className="mt-3 text-section font-semibold text-ink">{name}</h3>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[2.25rem] font-bold leading-tight tracking-tight text-ink tabular-nums">{currencySymbol}{price}</span>
        {period && <span className="text-copy text-muted">{period}</span>}
      </div>

      <ul className="mt-5 mb-6 flex-1 space-y-2.5">
        {features.map((feature, i) => <Feature key={i}>{feature}</Feature>)}
      </ul>

      {isCurrent ? (
        <button
          disabled
          className="h-11 w-full cursor-not-allowed rounded-control bg-sunk px-4 text-copy font-semibold text-muted"
        >
          {currentLabel}
        </button>
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
