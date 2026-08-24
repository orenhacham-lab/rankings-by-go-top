'use client'

import { useState } from 'react'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import BillingClient from './client'

type PlanKey = 'trial' | 'regular' | 'advanced' | 'premium' | 'large_agency'

interface BillingViewProps {
  plan: PlanKey
  hasActiveSubscription: boolean
  trialActive: boolean
  trialEndsAt: string | null
  subscriptionEndsAt: string | null
  hasPaypalSubscriptionId: boolean
  renewalCancelled: boolean
  /** Phase 2 — true when this user has an actively CONNECTED Shopify store.
   *  When true, PayPal checkout/upgrade/cancel UI is hidden entirely — this
   *  merchant must use Shopify App Pricing exclusively. */
  shopifyConnected: boolean
  shopifyPricingUrl: string | null
  shopifyMigrationStatus: 'pending' | 'shopify_confirmed' | 'paypal_cancel_failed' | null
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
  shopifyPricingUrl,
  shopifyMigrationStatus,
  planPrices,
}: BillingViewProps) {
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')
  const t = dict.billing
  const dateLocale = language === 'en' ? 'en-US' : 'he-IL'

  const [cancelling, setCancelling] = useState(false)
  const [cancelMessage, setCancelMessage] = useState('')

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
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 dark:text-slate-100">{t.title}</h1>
      <p className="text-slate-600 dark:text-slate-300 mb-8">{t.subtitle}</p>

      {trialActive && (
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-900">
            {t.trialActive}
            {trialEndsAt && (
              <span className="font-semibold">
                {' '}{t.validUntilPrefix} {new Date(trialEndsAt).toLocaleDateString(dateLocale)}
              </span>
            )}
          </p>
          <p className="text-blue-800 text-sm mt-2">{t.trialNoChargeNotice}</p>
        </div>
      )}

      {hasActiveSubscription && (
        <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-900">
            {t.onPlanPrefix} <span className="font-semibold">{t.planLabels[plan]}</span>.
            {subscriptionEndsAt && (
              <span>
                {' '}{t.renewalPrefix}{new Date(subscriptionEndsAt).toLocaleDateString(dateLocale)}
              </span>
            )}
          </p>
        </div>
      )}

      {shopifyConnected ? (
        <div className="mb-8 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t.shopify.title}</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm">{t.shopify.description}</p>
          {shopifyMigrationStatus === 'pending' && (
            <p className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">{t.shopify.migrationPending}</p>
          )}
          {shopifyMigrationStatus === 'paypal_cancel_failed' && (
            <p className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{t.shopify.migrationNeedsAttention}</p>
          )}
          {shopifyPricingUrl && (
            <a
              href={shopifyPricingUrl}
              className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
            >
              {t.shopify.manageButton}
            </a>
          )}
        </div>
      ) : (
        <>
          {hasActiveSubscription && (
            <div className="mb-8 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">{t.manage.title}</h2>
              {renewalCancelled ? (
                <p className="text-slate-700 dark:text-slate-300 text-sm">
                  {t.manage.renewalAlreadyCancelled}
                  {subscriptionEndsAt && (
                    <span className="font-semibold">
                      {' '}{new Date(subscriptionEndsAt).toLocaleDateString(dateLocale)}
                    </span>
                  )}
                </p>
              ) : hasPaypalSubscriptionId ? (
                <>
                  <p className="text-slate-600 dark:text-slate-300 mb-4 text-sm">{t.manage.description}</p>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancelling ? t.manage.cancelling : t.manage.cancelButton}
                  </button>
                </>
              ) : (
                <p className="text-slate-700 dark:text-slate-300 text-sm">{t.manage.contactToCancel}</p>
              )}
              {cancelMessage && (
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{cancelMessage}</p>
              )}
            </div>
          )}

          <p className="mb-6 text-xs text-slate-500 dark:text-slate-400">
            {t.keywordCheckNote}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <PlanCard
              name={t.trialName}
              price={0}
              period=""
              features={t.features.trial}
              isPopular={false}
              isCurrent={plan === 'trial'}
              plan="trial"
              recommendedLabel={t.recommended}
              currentLabel={t.currentPlan}
            />
            <PlanCard
              name={t.planLabels.regular}
              price={planPrices.regular}
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

          <BillingClient />
        </>
      )}
    </div>
  )
}

interface PlanCardProps {
  name: string
  price: number
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
      className={`rounded-lg border-2 p-6 ${
        isCurrent
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : isPopular
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      {isPopular && (
        <div className="mb-4 inline-block px-3 py-1 bg-amber-400 text-amber-900 text-sm font-semibold rounded-full">
          {recommendedLabel}
        </div>
      )}
      {isCurrent && (
        <div className="mb-4 inline-block px-3 py-1 bg-blue-500 text-white text-sm font-semibold rounded-full">
          {currentLabel}
        </div>
      )}

      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">{name}</h3>

      <div className="mb-6">
        <span className="text-4xl font-bold text-slate-900 dark:text-slate-100">₪{price}</span>
        {period && <span className="text-slate-600 dark:text-slate-300 ml-2">{period}</span>}
      </div>

      <ul className="space-y-3 mb-6">
        {features.map((feature, i) => (
          <li key={i} className="text-sm text-slate-700 dark:text-slate-200 flex items-start gap-2">
            <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <button
          disabled
          className="w-full py-2 px-4 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-not-allowed"
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
