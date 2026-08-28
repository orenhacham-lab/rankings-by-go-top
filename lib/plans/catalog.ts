/**
 * Phase 3 — the single, pure source of truth for plan data: names, prices,
 * limits, and the PayPal/Shopify identifier mappings for each internal plan
 * code. Deliberately has ZERO imports from `@/lib/supabase/*` or any other
 * server-only/database module, so it is safe to import from BOTH server
 * entitlement enforcement (lib/subscription.ts) AND public marketing pages
 * (app/(public)/pricing, app/(public)/en/pricing) without ever pulling a
 * database client into a page bundle.
 *
 * Internal plan codes are UNCHANGED from the pre-existing schema (regular /
 * advanced / premium / large_agency) — no migration was needed for them, only
 * for their display names, prices, and limits.
 */

export type PlanCode = 'regular' | 'advanced' | 'premium' | 'large_agency'

export const PLAN_CODES: readonly PlanCode[] = ['regular', 'advanced', 'premium', 'large_agency']

/** Approved Shopify App Pricing handle for each internal plan code — hyphen
 *  in `large-agency` is the only spelling difference, same as Phase 2. */
export type ShopifyPlanHandle = 'regular' | 'advanced' | 'premium' | 'large-agency'

/** Approved display-name key. Resolved to localized copy by each caller's
 *  own i18n dictionary (dashboard billing labels, public pricing cards) —
 *  this file carries no display strings itself, only the stable key. */
export type PlanDisplayNameKey = 'basic' | 'advanced' | 'premium' | 'agency'

export interface PlanCatalogEntry {
  code: PlanCode
  shopifyHandle: ShopifyPlanHandle
  displayNameKey: PlanDisplayNameKey
  maxProjects: number
  maxKeywordsPerProject: number
  /** Google Organic + Google Maps checks combined, per project, per billing period. */
  maxGoogleChecksPerPeriodPerProject: number
  /** One AI engine check = one query in one AI engine, per project, per billing period. */
  maxAIChecksPerPeriodPerProject: number
  /** Account-wide, shared across all of the account's projects, per billing period. */
  maxArticlesPerPeriodAccountWide: number
  priceILS: number
  priceUSD: number
  trialDays: 7
}

/** Exhaustive, explicit — Record over the literal union makes a missing plan a compile error. */
export const PLAN_CATALOG: Record<PlanCode, PlanCatalogEntry> = {
  regular: {
    code: 'regular', shopifyHandle: 'regular', displayNameKey: 'basic',
    maxProjects: 1, maxKeywordsPerProject: 50,
    maxGoogleChecksPerPeriodPerProject: 50, maxAIChecksPerPeriodPerProject: 10,
    maxArticlesPerPeriodAccountWide: 4,
    priceILS: 249, priceUSD: 79, trialDays: 7,
  },
  advanced: {
    code: 'advanced', shopifyHandle: 'advanced', displayNameKey: 'advanced',
    maxProjects: 10, maxKeywordsPerProject: 50,
    maxGoogleChecksPerPeriodPerProject: 100, maxAIChecksPerPeriodPerProject: 10,
    maxArticlesPerPeriodAccountWide: 20,
    priceILS: 549, priceUSD: 179, trialDays: 7,
  },
  premium: {
    code: 'premium', shopifyHandle: 'premium', displayNameKey: 'premium',
    maxProjects: 25, maxKeywordsPerProject: 100,
    maxGoogleChecksPerPeriodPerProject: 200, maxAIChecksPerPeriodPerProject: 20,
    maxArticlesPerPeriodAccountWide: 50,
    priceILS: 999, priceUSD: 329, trialDays: 7,
  },
  large_agency: {
    code: 'large_agency', shopifyHandle: 'large-agency', displayNameKey: 'agency',
    maxProjects: 100, maxKeywordsPerProject: 200,
    maxGoogleChecksPerPeriodPerProject: 400, maxAIChecksPerPeriodPerProject: 50,
    maxArticlesPerPeriodAccountWide: 200,
    priceILS: 1999, priceUSD: 649, trialDays: 7,
  },
}

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value)
}

/** Trial: one lifetime article, existing (unchanged) Google/AI lifetime caps. */
export const TRIAL_CATALOG = {
  maxProjects: 1,
  maxKeywordsPerProject: 30,
  maxGoogleChecksLifetime: 30,
  maxAIChecksLifetime: 3,
  maxArticlesLifetime: 1,
  days: 7,
} as const
