import type { SubscriptionPlan } from '@/lib/supabase/types'
import { isKnownPlanCode } from '@/lib/paypal/client'
import { resolveShopifyGovernedEntitlement, isShopifyGovernedAndActive } from '@/lib/shopify/entitlement-resolver'

/**
 * Phase 2 (blocker fix) — 'shopify_billing_required' is a DISTINCT state
 * from 'trial': a Shopify-connected merchant with no verified Shopify App
 * Pricing plan (activeSubscription null, Partner API unavailable,
 * unsupported handle, shop mismatch, or an unresolved PayPal→Shopify
 * migration) gets ZERO product entitlement — never the local website
 * trial's limits. See lib/shopify/entitlement-resolver.ts.
 */
export type PlanType = 'trial' | 'shopify_billing_required' | SubscriptionPlan

export interface PlanLimits {
  maxProjects: number
  maxClients: number
  maxKeywordsPerProject: number
  /**
   * Keyword check = checking one keyword in one engine (Google Organic OR
   * Google Maps). 10 keywords scanned in both engines = 20 keyword checks.
   *
   * Trial plans use `maxKeywordChecksTotal` (lifetime cap during trial).
   * Paid plans use `maxKeywordChecksPerPeriodPerProject` (monthly per project).
   */
  maxKeywordChecksPerPeriodPerProject: number
  maxKeywordChecksTotal: number
  /**
   * AI scan = one ai_scan_runs row (one prompt × one AI engine in current
   * implementation). Trial plans use `maxAIScansTotal` (lifetime during
   * trial). Paid plans use `maxAIScansPerPeriodPerProject` (monthly per project).
   */
  maxAIScansPerPeriodPerProject: number
  maxAIScansTotal: number
  /** Legacy field — kept for backwards-compat only; no longer enforced. */
  maxScansPerPeriod: number
  price: number
  label: string
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  trial:    {
    maxProjects: 1, maxClients: 1, maxKeywordsPerProject: 30,
    maxKeywordChecksPerPeriodPerProject: 0,  maxKeywordChecksTotal: 30,
    maxAIScansPerPeriodPerProject: 0,        maxAIScansTotal: 3,
    maxScansPerPeriod: 1,  price: 0,   label: 'ניסיון',
  },
  // Phase 2 (blocker fix) — a Shopify-connected merchant with no verified
  // Shopify App Pricing plan. Genuinely ZERO — not the website trial's
  // limits. Every quota check in the app reads PLAN_LIMITS[entitlement.plan]
  // (directly or via entitlement.limits), so this single entry is what
  // enforces zero project/keyword/AI-scan/publish entitlement everywhere.
  shopify_billing_required: {
    maxProjects: 0, maxClients: 0, maxKeywordsPerProject: 0,
    maxKeywordChecksPerPeriodPerProject: 0,  maxKeywordChecksTotal: 0,
    maxAIScansPerPeriodPerProject: 0,        maxAIScansTotal: 0,
    maxScansPerPeriod: 0,  price: 0,   label: 'נדרש חיוב דרך Shopify',
  },
  regular:  {
    maxProjects: 3, maxClients: 5, maxKeywordsPerProject: 50,
    maxKeywordChecksPerPeriodPerProject: 50, maxKeywordChecksTotal: 0,
    maxAIScansPerPeriodPerProject: 10,       maxAIScansTotal: 0,
    maxScansPerPeriod: 1,  price: 79,  label: 'רגיל',
  },
  advanced: {
    maxProjects: 10, maxClients: 20, maxKeywordsPerProject: 50,
    maxKeywordChecksPerPeriodPerProject: 100, maxKeywordChecksTotal: 0,
    maxAIScansPerPeriodPerProject: 10,        maxAIScansTotal: 0,
    maxScansPerPeriod: 2,  price: 199, label: 'מתקדם',
  },
  premium:  {
    maxProjects: 25, maxClients: 100, maxKeywordsPerProject: 100,
    maxKeywordChecksPerPeriodPerProject: 200, maxKeywordChecksTotal: 0,
    maxAIScansPerPeriodPerProject: 20,        maxAIScansTotal: 0,
    maxScansPerPeriod: 2,  price: 349, label: 'פרמיום',
  },
  large_agency: {
    maxProjects: 100, maxClients: 1000, maxKeywordsPerProject: 200,
    maxKeywordChecksPerPeriodPerProject: 400, maxKeywordChecksTotal: 0,
    maxAIScansPerPeriodPerProject: 100,       maxAIScansTotal: 0,
    maxScansPerPeriod: 5,  price: 799, label: 'סוכנות גדולה',
  },
}

export const PLAN_FEATURES: Record<PlanType, string[]> = {
  trial:    ['פרויקט 1 בלבד', 'עד 30 מילות מפתח', 'עד 30 בדיקות מילות מפתח בתקופת הניסיון', 'עד 3 סריקות AI בתקופת הניסיון', '7 ימי ניסיון'],
  shopify_billing_required: ['יש לבחור תוכנית ב-Shopify App Pricing כדי להשתמש במערכת'],
  regular:  ['עד 3 פרויקטים', 'עד 50 מילות מפתח לפרויקט', 'עד 50 בדיקות מילות מפתח בחודש לכל פרויקט', 'עד 10 סריקות AI בחודש לכל פרויקט'],
  advanced: ['עד 10 פרויקטים', 'עד 50 מילות מפתח לפרויקט', 'עד 100 בדיקות מילות מפתח בחודש לכל פרויקט', 'עד 10 סריקות AI בחודש לכל פרויקט'],
  premium:  ['עד 25 פרויקטים', 'עד 100 מילות מפתח לפרויקט', 'עד 200 בדיקות מילות מפתח בחודש לכל פרויקט', 'עד 20 סריקות AI בחודש לכל פרויקט'],
  large_agency: ['עד 100 אתרים / פרויקטים', 'עד 200 מילות מפתח לאתר', 'עד 400 בדיקות מילות מפתח לחודש לאתר', 'עד 100 סריקות AI לאתר'],
}

export interface UserEntitlement {
  plan: PlanType
  limits: PlanLimits
  isAdmin: boolean
  trialActive: boolean
  trialEndsAt: string | null
  hasActiveSubscription: boolean
  subscriptionEndsAt: string | null
  subscriptionId: string | null
}

/**
 * Resolve effective plan from profile + subscription data.
 * Call this from server actions and API routes (not middleware) since it needs the admin client.
 */
export async function getUserEntitlement(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // Injectable clock (repo convention — see
  // lib/content/recommendations/smart-run-harness.ts's `now: () => number`)
  // so trial/period-expiry tests are deterministic regardless of wall-clock
  // time. Every real caller uses the default; production behavior is
  // unchanged.
  nowFn: () => Date = () => new Date(),
): Promise<UserEntitlement> {
  const now = nowFn()

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
      subscriptionId: null,
    }
  }

  // Phase 2 (blocker fix) — Shopify governance is AUTHORITATIVE and checked
  // BEFORE the subscriptions table. A Shopify-connected user's local trial,
  // manually-granted row, or PayPal history is never read for entitlement —
  // see lib/shopify/entitlement-resolver.ts's header for why (this is
  // exactly what closes the shopify@gotop.co.il reviewer-bypass gap).
  const shopifyGoverned = await resolveShopifyGovernedEntitlement(supabase, userId)
  if (shopifyGoverned) {
    // Blocker fix — a Shopify-connected merchant with no VERIFIED Shopify
    // App Pricing plan gets ZERO product entitlement, never the local
    // website trial's limits (PLAN_LIMITS.shopify_billing_required is all
    // zero). A verified Shopify trial is not this case — Shopify's own
    // activeSubscription for an in-trial plan is non-null with a recognized
    // handle, so shopifyGoverned.planCode is already the mapped real plan.
    const plan: PlanType = shopifyGoverned.planCode ?? 'shopify_billing_required'
    return {
      plan,
      limits: PLAN_LIMITS[plan],
      isAdmin: false,
      trialActive: false,
      trialEndsAt: null,
      hasActiveSubscription: shopifyGoverned.hasActiveSubscription,
      subscriptionEndsAt: shopifyGoverned.currentPeriodEnd,
      subscriptionId: null,
    }
  }

  // Fetch most recent trial, active, or cancelled subscription. `plan_code`
  // is the real column (the `plan` column referenced pre-fix did not exist,
  // so this select always errored and every non-admin user silently fell
  // back to trial-tier limits regardless of actual status).
  // 'cancelled' status means the renewal was cancelled in PayPal but access
  // remains valid until current_period_end.
  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select('id, plan_code, status, trial_ends_at, current_period_end')
    .eq('user_id', userId)
    .in('status', ['trial', 'active', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // Fail closed: a read error means we genuinely don't know this user's
    // status, so we do NOT grant paid entitlement — fall through to the
    // trial defaults below, same as "no subscription row found", but LOGGED
    // rather than silently discarded.
    console.error('[subscription] getUserEntitlement query failed', { userId, message: error.message })
  }

  let plan: PlanType = 'trial'
  let trialActive = false
  let trialEndsAt: string | null = null
  let hasActiveSubscription = false

  if (sub?.status === 'trial') {
    trialEndsAt = sub.trial_ends_at ?? null
    trialActive = trialEndsAt ? new Date(trialEndsAt) > now : false
    plan = 'trial'
  } else if (sub?.status === 'active') {
    const periodOk = !sub.current_period_end || new Date(sub.current_period_end) > now
    const resolvedPlan = periodOk && isKnownPlanCode(sub.plan_code) ? sub.plan_code : null
    hasActiveSubscription = resolvedPlan !== null
    plan = resolvedPlan ?? 'trial'
  } else if (sub?.status === 'cancelled') {
    // Renewal cancelled: keep access until paid period ends.
    const periodOk = !!sub.current_period_end && new Date(sub.current_period_end) > now
    const resolvedPlan = periodOk && isKnownPlanCode(sub.plan_code) ? sub.plan_code : null
    hasActiveSubscription = resolvedPlan !== null
    plan = resolvedPlan ?? 'trial'
  }

  return {
    plan,
    limits: PLAN_LIMITS[plan],
    isAdmin: false,
    trialActive,
    trialEndsAt,
    hasActiveSubscription,
    subscriptionEndsAt: sub?.current_period_end ?? null,
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
  supabase: any,
  // Injectable clock — same convention as getUserEntitlement above. Every
  // real caller uses the default; production behavior is unchanged.
  nowFn: () => Date = () => new Date(),
): Promise<boolean> {
  // Check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.role === 'admin') return true

  // Phase 2 (blocker fix) — Shopify governance is authoritative and checked
  // before the subscriptions table (cache-only — see
  // lib/shopify/entitlement-resolver.ts's isShopifyGovernedAndActive for why
  // this never makes a live network call on the middleware hot path).
  const shopify = await isShopifyGovernedAndActive(supabase, userId)
  if (shopify.governed) return shopify.active

  // Check subscription. 'cancelled' status grants access until current_period_end.
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, current_period_end')
    .eq('user_id', userId)
    .in('status', ['trial', 'active', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sub) return false
  const now = nowFn()

  if (sub.status === 'trial') {
    return sub.trial_ends_at ? new Date(sub.trial_ends_at) > now : false
  }

  if (sub.status === 'active') {
    return !sub.current_period_end || new Date(sub.current_period_end) > now
  }

  if (sub.status === 'cancelled') {
    return !!sub.current_period_end && new Date(sub.current_period_end) > now
  }

  return false
}
