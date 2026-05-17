'use client'

import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import BillingClient from './client'

type PlanKey = 'trial' | 'regular' | 'advanced' | 'premium'

interface BillingViewProps {
  plan: PlanKey
  hasActiveSubscription: boolean
  trialActive: boolean
  trialEndsAt: string | null
  subscriptionEndsAt: string | null
  planPrices: Record<PlanKey, number>
}

export default function BillingView({
  plan,
  hasActiveSubscription,
  trialActive,
  trialEndsAt,
  subscriptionEndsAt,
  planPrices,
}: BillingViewProps) {
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')
  const t = dict.billing
  const dateLocale = language === 'en' ? 'en-US' : 'he-IL'

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      </div>

      <BillingClient />
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
