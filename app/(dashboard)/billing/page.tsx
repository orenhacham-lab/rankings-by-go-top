import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserEntitlement, PLAN_LIMITS, PLAN_FEATURES } from '@/lib/subscription'
import BillingClient from './client'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const entitlement = await getUserEntitlement(user.id, supabase)

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">תוכניות מנויים</h1>
      <p className="text-slate-600 mb-8">בחר את התוכנית המתאימה לך</p>

      {entitlement.trialActive && (
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-900">
            אתה בניסיון חינמי.
            {entitlement.trialEndsAt && (
              <span className="font-semibold">
                {' '}תוקף עד {new Date(entitlement.trialEndsAt).toLocaleDateString('he-IL')}
              </span>
            )}
          </p>
        </div>
      )}

      {entitlement.hasActiveSubscription && (
        <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-900">
            אתה כרגע בתוכנית <span className="font-semibold">{entitlement.limits.label}</span>.
            {entitlement.subscriptionEndsAt && (
              <span>
                {' '}חידוש ב-{new Date(entitlement.subscriptionEndsAt).toLocaleDateString('he-IL')}
              </span>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PlanCard
          name="ניסיון חינמי"
          price={0}
          period=""
          features={PLAN_FEATURES.trial}
          isPopular={false}
          isCurrent={entitlement.plan === 'trial'}
          plan="trial"
        />
        <PlanCard
          name={PLAN_LIMITS.regular.label}
          price={PLAN_LIMITS.regular.price}
          period="לחודש"
          features={PLAN_FEATURES.regular}
          isPopular={false}
          isCurrent={entitlement.plan === 'regular' && entitlement.hasActiveSubscription}
          plan="regular"
        />
        <PlanCard
          name={PLAN_LIMITS.advanced.label}
          price={PLAN_LIMITS.advanced.price}
          period="לחודש"
          features={PLAN_FEATURES.advanced}
          isPopular={true}
          isCurrent={entitlement.plan === 'advanced' && entitlement.hasActiveSubscription}
          plan="advanced"
        />
        <PlanCard
          name={PLAN_LIMITS.premium.label}
          price={PLAN_LIMITS.premium.price}
          period="לחודש"
          features={PLAN_FEATURES.premium}
          isPopular={false}
          isCurrent={entitlement.plan === 'premium' && entitlement.hasActiveSubscription}
          plan="premium"
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
  features: string[]
  isPopular: boolean
  isCurrent: boolean
  plan: string
}

function PlanCard({
  name,
  price,
  period,
  features,
  isPopular,
  isCurrent,
  plan,
}: PlanCardProps) {
  return (
    <div
      className={`rounded-lg border-2 p-6 ${
        isCurrent
          ? 'border-blue-500 bg-blue-50'
          : isPopular
            ? 'border-amber-400 bg-amber-50'
            : 'border-slate-200 bg-white'
      }`}
    >
      {isPopular && (
        <div className="mb-4 inline-block px-3 py-1 bg-amber-400 text-amber-900 text-sm font-semibold rounded-full">
          המומלץ
        </div>
      )}
      {isCurrent && (
        <div className="mb-4 inline-block px-3 py-1 bg-blue-500 text-white text-sm font-semibold rounded-full">
          התוכנית הנוכחית
        </div>
      )}

      <h3 className="text-xl font-bold text-slate-900 mb-2">{name}</h3>

      <div className="mb-6">
        <span className="text-4xl font-bold text-slate-900">₪{price}</span>
        {period && <span className="text-slate-600 ml-2">{period}</span>}
      </div>

      <ul className="space-y-3 mb-6">
        {features.map((feature, i) => (
          <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
            <span className="text-green-600 font-bold mt-0.5">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <button
          disabled
          className="w-full py-2 px-4 rounded-lg bg-slate-200 text-slate-600 font-semibold cursor-not-allowed"
        >
          התוכנית הנוכחית
        </button>
      ) : (
        <div
          id={`paypal-button-${plan}`}
          className="min-h-12"
        />
      )}
    </div>
  )
}
