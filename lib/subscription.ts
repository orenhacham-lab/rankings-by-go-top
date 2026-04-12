import type { SubscriptionPlan } from '@/lib/supabase/types'

export type PlanType = 'trial' | SubscriptionPlan

export interface PlanLimits {
  maxProjects: number
  maxClients: number
  maxKeywordsPerProject: number
  maxScansPerPeriod: number
  price: number
  label: string
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  trial:    { maxProjects: 1,  maxClients: 1,  maxKeywordsPerProject: 30,  maxScansPerPeriod: 1,  price: 0,   label: 'ניסיון' },
  regular:  { maxProjects: 3,  maxClients: 5,  maxKeywordsPerProject: 50,  maxScansPerPeriod: 1,  price: 29,  label: 'רגיל' },
  advanced: { maxProjects: 10, maxClients: 20, maxKeywordsPerProject: 50,  maxScansPerPeriod: 2,  price: 69,  label: 'מתקדם' },
  premium:  { maxProjects: 50, maxClients: 100, maxKeywordsPerProject: 100, maxScansPerPeriod: 4,  price: 129, label: 'פרמיום' },
}

export const PLAN_FEATURES: Record<PlanType, string[]> = {
  trial:    ['פרויקט 1 בלבד', 'עד 30 מילות מפתח', 'סריקה 1 בסה"כ', '7 ימי ניסיון'],
  regular:  ['עד 3 פרויקטים', 'עד 50 מילות מפתח לפרויקט', 'סריקה 1 בחודש לכל פרוייקט'],
  advanced: ['עד 10 פרויקטים', 'עד 50 מילות מפתח לפרויקט', '2 סריקות בחודש לכל פרוייקט'],
  premium:  ['עד 50 פרויקטים', 'עד 100 מילות מפתח לפרויקט', '4 סריקות בחודש לכל פרוייקט'],
}

export interface UserEntitlement {
  plan: PlanType
  limits: PlanLimits
  isAdmin: boolean
  trialActive: boolean
  trialEndsAt: string | null
  hasActiveSubscription: boolean
  subscriptionEndsAt: string | null
  scansThisPeriod: number
  subscriptionId: string | null
}

/**
 * Get current month key in 'YYYY-MM' format
 */
export function currentPeriodKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Resolve effective plan from profile + subscription data.
 * Call this from server actions and API routes (not middleware) since it needs the admin client.
 */
export async function getUserEntitlement(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<UserEntitlement> {
  const now = new Date()

  // Fetch profile — role only
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'

  if (isAdmin) {
    return {
      plan: 'premium',
      limits: PLAN_LIMITS.premium,
      isAdmin: true,
      trialActive: false,
      trialEndsAt: null,
      hasActiveSubscription: true,
      subscriptionEndsAt: null,
      scansThisPeriod: 0,
      subscriptionId: null,
    }
  }

  // Fetch most recent trial or active subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, plan, status, trial_ends_at, current_period_end, scans_this_period, scans_period_key')
    .eq('user_id', userId)
    .in('status', ['trial', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let plan: PlanType = 'trial'
  let trialActive = false
  let trialEndsAt: string | null = null
  let hasActiveSubscription = false

  if (sub?.status === 'trial') {
    trialEndsAt = sub.trial_ends_at ?? null
    trialActive = trialEndsAt ? new Date(trialEndsAt) > now : false
    plan = 'trial'
  } else if (sub?.status === 'active') {
    hasActiveSubscription = !sub.current_period_end || new Date(sub.current_period_end) > now
    plan = hasActiveSubscription ? (sub.plan as SubscriptionPlan) : 'trial'
  }

  // Resolve scans used this period for paid plans
  let scansThisPeriod = 0
  if (hasActiveSubscription && sub) {
    const periodKey = currentPeriodKey()
    scansThisPeriod = sub.scans_period_key === periodKey ? sub.scans_this_period : 0
  }

  return {
    plan,
    limits: PLAN_LIMITS[plan],
    isAdmin: false,
    trialActive,
    trialEndsAt,
    hasActiveSubscription,
    subscriptionEndsAt: sub?.current_period_end ?? null,
    scansThisPeriod,
    subscriptionId: sub?.id ?? null,
  }
}

/**
 * Lightweight check used in middleware — only reads profile + subscription status.
 * Returns true if the user has access (admin, active trial, or active subscription).
 */
export async function hasAccess(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  // Check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.role === 'admin') return true

  // Check subscription
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, current_period_end')
    .eq('user_id', userId)
    .in('status', ['trial', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sub) return false

  if (sub.status === 'trial') {
    return sub.trial_ends_at ? new Date(sub.trial_ends_at) > new Date() : false
  }

  if (sub.status === 'active') {
    return !sub.current_period_end || new Date(sub.current_period_end) > new Date()
  }

  return false
}
