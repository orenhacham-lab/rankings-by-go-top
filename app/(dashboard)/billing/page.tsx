import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import BillingView from './BillingView'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const entitlement = await getUserEntitlement(user.id, supabase)

  return (
    <BillingView
      plan={entitlement.plan}
      hasActiveSubscription={entitlement.hasActiveSubscription}
      trialActive={entitlement.trialActive}
      trialEndsAt={entitlement.trialEndsAt}
      subscriptionEndsAt={entitlement.subscriptionEndsAt}
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
