/**
 * The five LIMIT lines a plan card shows — in the approved ORDER — its audience
 * LABEL and its audience DESCRIPTION, in both languages, derived from
 * PLAN_CATALOG and never written by hand on a page.
 *
 * WHY THIS EXISTS. The same five numbers were being retyped in four places: the
 * Hebrew list in lib/subscription.ts, the Hebrew and English lists in the
 * dashboard dictionaries, and the two public pricing pages. Three of the four
 * had already drifted from the catalog by the time this was written — the
 * dictionaries still promised "Up to 10 projects" and "20 articles" for
 * Advanced. A card that promises more than the server grants is not a display
 * bug; it is a commitment the product does not keep.
 *
 * THE AUDIENCE COPY LIVES HERE FOR THE SAME REASON. Each pricing page used to
 * carry its own hand-written PLAN_UI description. When Advanced dropped from 10
 * projects to 1, both of those sentences kept selling it as a multi-site plan —
 * "לעסקים בצמיחה עם כמה אתרים" / "For growing businesses with multiple sites" —
 * because nothing tied them to the catalog. Copy that contradicts the
 * entitlement is the same class of defect as a wrong number, so it is derived
 * from one place and guarded by a test.
 *
 * Numbers come from the catalog. Only the sentence FRAMES live here.
 *
 * THE ARTICLE LINE SAYS "MONTHLY" EXPLICITLY. The cards used to read "per
 * billing period" while the Shopify plan descriptions read "per month" — two
 * phrasings for one quota, which is the shape a customer dispute takes. Every
 * plan is monthly and annual billing is out of scope, so the period is stated
 * rather than implied, in the same words on every surface. The underlying
 * period RESOLVER is untouched; this is what the sentence calls it.
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

/**
 * THE FIVE LIMIT LINES, each addressable by name so the ORDER can be a
 * decision rather than an accident of how the array was typed.
 */
interface LimitLines { projects: string; keywords: string; google: string; ai: string; articles: string }

function limitLinesFor(code: PlanCode, locale: Locale): LimitLines {
  const c = PLAN_CATALOG[code]
  const single = isSingleProject(code)
  if (locale === 'en') {
    return {
      projects: single ? '1 project' : `Up to ${c.maxProjects} projects`,
      keywords: single ? `Up to ${c.maxKeywordsPerProject} keywords` : `Up to ${c.maxKeywordsPerProject} keywords per project`,
      google: single
        ? `Up to ${c.maxGoogleChecksPerPeriodPerProject} Google checks per billing period`
        : `Up to ${c.maxGoogleChecksPerPeriodPerProject} Google checks per billing period per project`,
      ai: single
        ? `Up to ${c.maxAIChecksPerPeriodPerProject} AI checks per billing period`
        : `Up to ${c.maxAIChecksPerPeriodPerProject} AI checks per billing period per project`,
      // "Shared across your account" answers "shared with WHAT?" — a question a
      // one-project plan does not raise. On Basic and Advanced the clause reads
      // as a hint that other projects exist, which is the opposite of the
      // positioning, so it is stated only where sharing is real.
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} articles per monthly billing period`
        : `${c.maxArticlesPerPeriodAccountWide} articles per monthly billing period, shared across your account`,
    }
  }
  return {
    projects: single ? 'פרויקט אחד' : `עד ${c.maxProjects} פרויקטים`,
    keywords: single ? `עד ${c.maxKeywordsPerProject} מילות מפתח` : `עד ${c.maxKeywordsPerProject} מילות מפתח לפרויקט`,
    google: single
      ? `עד ${c.maxGoogleChecksPerPeriodPerProject} בדיקות גוגל בכל מחזור חיוב`
      : `עד ${c.maxGoogleChecksPerPeriodPerProject} בדיקות גוגל בכל מחזור חיוב לפרויקט`,
    ai: single
      ? `עד ${c.maxAIChecksPerPeriodPerProject} בדיקות AI בכל מחזור חיוב`
      : `עד ${c.maxAIChecksPerPeriodPerProject} בדיקות AI בכל מחזור חיוב לפרויקט`,
    articles: single
      ? `${c.maxArticlesPerPeriodAccountWide} מאמרים בכל מחזור חיוב חודשי`
      : `${c.maxArticlesPerPeriodAccountWide} מאמרים בכל מחזור חיוב חודשי, משותפים לכל החשבון`,
  }
}

/**
 * THE ORDER IS PART OF THE POSITIONING, not a formatting detail.
 *
 * On a ONE-WEBSITE plan the article allowance is the reason to move up a tier —
 * Basic and Advanced differ by 4 vs 12 articles far more than by anything else —
 * so it is read SECOND, immediately after the project line, before the tracking
 * limits. Burying it under three check-quota lines made the two plans look
 * nearly identical at a glance.
 *
 * On a MULTI-PROJECT plan the per-project limits are what scale with the tier,
 * and the account-wide article pool is the qualifier at the end of the list, so
 * that order is unchanged.
 *
 * Ordering lives HERE, once. A page that re-sorted the array itself would be
 * the same drift this module exists to prevent.
 */
export function planLimitLines(code: PlanCode, locale: Locale): string[] {
  const l = limitLinesFor(code, locale)
  return isSingleProject(code)
    ? [l.projects, l.articles, l.keywords, l.google, l.ai]
    : [l.projects, l.keywords, l.google, l.ai, l.articles]
}

/** The article sentence on its own — its POSITION differs per plan, so callers
 *  that want the sentence must ask for it rather than index into the array. */
export function planArticleLine(code: PlanCode, locale: Locale): string {
  return limitLinesFor(code, locale).articles
}

/** Where the article sentence sits in `planLimitLines` for this plan: second on
 *  a one-project plan, last on a multi-project one. */
export function planArticleLineIndex(code: PlanCode): number {
  return isSingleProject(code) ? 1 : 4
}

/**
 * THE AUDIENCE LABEL — a short, understated line above each plan name saying
 * who the plan is for.
 *
 * This replaced two stacked, full-width audience SECTIONS. The sections carried
 * the same information but doubled the height of the pricing block, which
 * pushed Premium and Agency below the fold on a laptop: a visitor saw two plans
 * and had to discover the other two by scrolling. A per-card label keeps the
 * distinction and gives the four cards back their single row.
 *
 * Static text, no toggle: the split is editorial and identical for every
 * visitor, so interactive state, a URL parameter or a cookie would be
 * persistence bought for nothing.
 */
export const PLAN_AUDIENCE_LABEL: Record<PlanCode, Record<Locale, string>> = {
  regular: { en: 'One website', he: 'לאתר אחד' },
  advanced: { en: 'One website', he: 'לאתר אחד' },
  premium: { en: 'Multiple websites', he: 'למספר אתרים' },
  large_agency: { en: 'Agencies', he: 'לסוכנויות' },
}

/**
 * THE AUDIENCE DESCRIPTION — the sentence under the plan name.
 *
 * Advanced is a ONE-WEBSITE plan. Every phrasing implying several sites is
 * gone, and `pricing-copy-and-layout.qa.ts` fails if one returns anywhere in the tree.
 */
export const PLAN_AUDIENCE_DESCRIPTION: Record<PlanCode, Record<Locale, string>> = {
  regular: {
    en: 'One project, a perfect starting point',
    he: 'פרויקט אחד, בסיס מושלם להתחלה',
  },
  advanced: {
    en: 'For one website with higher content and tracking needs',
    he: 'לאתר אחד עם צרכי תוכן ומעקב מתקדמים',
  },
  premium: {
    en: 'For businesses and agencies with advanced needs',
    he: 'לעסקים ולסוכנויות עם צרכים מתקדמים',
  },
  large_agency: {
    en: 'For agencies with many clients',
    he: 'לסוכנויות עם הרבה לקוחות',
  },
}
