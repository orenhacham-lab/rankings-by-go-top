/**
 * The five LIMIT lines a plan card shows, in both languages, derived from
 * PLAN_CATALOG — never written by hand.
 *
 * WHY THIS EXISTS. The same five numbers were being retyped in four places: the
 * Hebrew list in lib/subscription.ts, the Hebrew and English lists in the
 * dashboard dictionaries, and the two public pricing pages. Three of the four
 * had already drifted from the catalog by the time this was written — the
 * dictionaries still promised "Up to 10 projects" and "20 articles" for
 * Advanced. A card that promises more than the server grants is not a display
 * bug; it is a commitment the product does not keep.
 *
 * Numbers come from the catalog. Only the sentence FRAMES live here, and they
 * are the frames already in use, so nothing else about the copy changes.
 *
 * PURE — no React, no database, no server-only import — so the public pricing
 * pages, the dashboard billing view and the server-side entitlement module can
 * all read it without pulling anything into a page bundle.
 */

import { PLAN_CATALOG, type PlanCode } from './catalog'
import type { Locale } from '@/lib/i18n/locales'

/**
 * A plan capped at ONE project describes its allowances per account, because
 * "per project" would be noise where only one project can exist. Above one, the
 * per-project scope is load-bearing and is stated.
 */
function isSingleProject(code: PlanCode): boolean {
  return PLAN_CATALOG[code].maxProjects === 1
}

export function planLimitLines(code: PlanCode, locale: Locale): string[] {
  const c = PLAN_CATALOG[code]
  const single = isSingleProject(code)
  if (locale === 'en') {
    return [
      single ? '1 project' : `Up to ${c.maxProjects} projects`,
      single ? `Up to ${c.maxKeywordsPerProject} keywords` : `Up to ${c.maxKeywordsPerProject} keywords per project`,
      single
        ? `Up to ${c.maxGoogleChecksPerPeriodPerProject} Google checks per billing period`
        : `Up to ${c.maxGoogleChecksPerPeriodPerProject} Google checks per billing period per project`,
      single
        ? `Up to ${c.maxAIChecksPerPeriodPerProject} AI checks per billing period`
        : `Up to ${c.maxAIChecksPerPeriodPerProject} AI checks per billing period per project`,
      `${c.maxArticlesPerPeriodAccountWide} articles per billing period, shared across your account`,
    ]
  }
  return [
    single ? 'פרויקט אחד' : `עד ${c.maxProjects} פרויקטים`,
    single ? `עד ${c.maxKeywordsPerProject} מילות מפתח` : `עד ${c.maxKeywordsPerProject} מילות מפתח לפרויקט`,
    single
      ? `עד ${c.maxGoogleChecksPerPeriodPerProject} בדיקות גוגל בכל מחזור חיוב`
      : `עד ${c.maxGoogleChecksPerPeriodPerProject} בדיקות גוגל בכל מחזור חיוב לפרויקט`,
    single
      ? `עד ${c.maxAIChecksPerPeriodPerProject} בדיקות AI בכל מחזור חיוב`
      : `עד ${c.maxAIChecksPerPeriodPerProject} בדיקות AI בכל מחזור חיוב לפרויקט`,
    `${c.maxArticlesPerPeriodAccountWide} מאמרים בכל מחזור חיוב, משותפים לכל החשבון`,
  ]
}

/**
 * THE AUDIENCE GROUPING for the website-controlled pricing surfaces.
 *
 * Two static sections, not a toggle: adding interactive state, a URL parameter
 * or a cookie for what is a fixed editorial split would be new persistence for
 * no benefit, and the split never changes per visitor.
 *
 * Shopify's hosted pricing page shows all four plans in one list and cannot
 * render sections — which is exactly why each plan's Shopify DESCRIPTION has to
 * carry its own audience sentence. See the PR body's configuration table.
 */
export type PlanAudience = 'single_site' | 'multi_site'

export const PLAN_AUDIENCE: Record<PlanCode, PlanAudience> = {
  regular: 'single_site',
  advanced: 'single_site',
  premium: 'multi_site',
  large_agency: 'multi_site',
}

export const AUDIENCE_HEADING: Record<PlanAudience, Record<Locale, string>> = {
  single_site: { en: 'For one website', he: 'לאתר אחד' },
  multi_site: { en: 'For multiple websites and agencies', he: 'למספר אתרים וסוכנויות' },
}

/** The plan codes in each section, in catalog order. */
export function plansForAudience(audience: PlanAudience, order: readonly PlanCode[]): PlanCode[] {
  return order.filter((code) => PLAN_AUDIENCE[code] === audience)
}
