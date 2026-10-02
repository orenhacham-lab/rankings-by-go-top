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
 * THE LINES SAY "A MONTH", NOT "BILLING PERIOD". Every plan is billed monthly
 * (the cards and the checkout say "per month", annual billing does not exist),
 * and "billing period" is the engineers' word for it. A small-business owner
 * reads "a month". The same goes for "project" (a website, to the customer) and
 * for the two check quotas, whose lines now name what is checked. The underlying
 * period RESOLVER (lib/billing/usage-period.ts) is untouched; this is only what
 * the sentence calls it. lib/plans/__qa__/plan-copy-plain.qa.ts keeps the
 * jargon out and the article line first.
 *
 * PURE — no React, no database, no server-only import — so the public pricing
 * pages, the dashboard billing view and the server-side entitlement module can
 * all read it without pulling anything into a page bundle.
 */

import { PLAN_CATALOG, TRIAL_CATALOG, type PlanCode } from './catalog'
import type { Locale } from '@/lib/i18n/locales'

/**
 * A plan capped at ONE website describes its allowances per account, because
 * "per website" would be noise where only one can exist. Above one, the
 * per-website scope is load-bearing and is stated. (The catalog and the code
 * call a website a "project"; a customer calls it a website, so every line
 * below says website.)
 */
function isSingleProject(code: PlanCode): boolean {
  return PLAN_CATALOG[code].maxProjects === 1
}

/**
 * THE FIVE LIMIT LINES, each addressable by name so the ORDER can be a
 * decision rather than an accident of how the array was typed.
 *
 * WRITTEN FOR A SMALL-BUSINESS OWNER, NOT FOR AN ENGINEER. Three words used to
 * stand between the customer and the number: "billing period" (the plan is
 * monthly, so the line says "a month"), "project" (a website) and "Google
 * checks" / "AI checks" (nothing said what one is). The check lines now name
 * what is checked, and the one-sentence definition sits under the plan grid
 * (CHECKS_EXPLAINER below), so a visitor never has to guess what a "check" is.
 */
interface LimitLines { articles: string; projects: string; keywords: string; google: string; ai: string }

function limitLinesFor(code: PlanCode, locale: Locale): LimitLines {
  const c = PLAN_CATALOG[code]
  const single = isSingleProject(code)
  if (locale === 'en') {
    return {
      // THE MAIN VALUE, and the first line of every plan: articles written and
      // published to the customer's site without them lifting a finger.
      articles: single
        ? `${c.maxArticlesPerPeriodAccountWide} articles a month, written and published to your website automatically`
        : `${c.maxArticlesPerPeriodAccountWide} articles a month, written and published automatically, shared across all your websites`,
      projects: single ? '1 website' : `Up to ${c.maxProjects} websites`,
      keywords: single ? `Track up to ${c.maxKeywordsPerProject} keywords` : `Track up to ${c.maxKeywordsPerProject} keywords per website`,
      google: single
        ? `Up to ${c.maxGoogleChecksPerPeriodPerProject} Google ranking checks a month`
        : `Up to ${c.maxGoogleChecksPerPeriodPerProject} Google ranking checks a month per website`,
      ai: single
        ? `Up to ${c.maxAIChecksPerPeriodPerProject} AI visibility checks a month`
        : `Up to ${c.maxAIChecksPerPeriodPerProject} AI visibility checks a month per website`,
    }
  }
  return {
    articles: single
      ? `${c.maxArticlesPerPeriodAccountWide} מאמרים בחודש, נכתבים ומתפרסמים באתר שלכם אוטומטית`
      : `${c.maxArticlesPerPeriodAccountWide} מאמרים בחודש, נכתבים ומתפרסמים אוטומטית, משותפים לכל האתרים שלכם`,
    projects: single ? 'אתר אחד' : `עד ${c.maxProjects} אתרים`,
    keywords: single ? `מעקב אחרי עד ${c.maxKeywordsPerProject} מילות מפתח` : `מעקב אחרי עד ${c.maxKeywordsPerProject} מילות מפתח לכל אתר`,
    google: single
      ? `עד ${c.maxGoogleChecksPerPeriodPerProject} בדיקות מיקום בגוגל בחודש`
      : `עד ${c.maxGoogleChecksPerPeriodPerProject} בדיקות מיקום בגוגל בחודש לכל אתר`,
    ai: single
      ? `עד ${c.maxAIChecksPerPeriodPerProject} בדיקות נראות ב-AI בחודש`
      : `עד ${c.maxAIChecksPerPeriodPerProject} בדיקות נראות ב-AI בחודש לכל אתר`,
  }
}

/**
 * THE ORDER IS PART OF THE POSITIONING, not a formatting detail.
 *
 * The article line is FIRST on every plan. It is the product: a customer who
 * reads one line of a plan card should read that the site gets articles written
 * and published for it. Then how many websites, then what is tracked.
 *
 * Ordering lives HERE, once. A page that re-sorted the array itself would be
 * the same drift this module exists to prevent.
 */
export function planLimitLines(code: PlanCode, locale: Locale): string[] {
  const l = limitLinesFor(code, locale)
  return [l.articles, l.projects, l.keywords, l.google, l.ai]
}

/** The article sentence on its own, for callers that want the sentence rather
 *  than an index into the array. */
export function planArticleLine(code: PlanCode, locale: Locale): string {
  return limitLinesFor(code, locale).articles
}

/** Where the article sentence sits in `planLimitLines`: first on every plan. */
export function planArticleLineIndex(code: PlanCode): number {
  void code
  return 0
}

/**
 * WHAT A "CHECK" IS, in one sentence each, for the line under the plan grid
 * (both pricing pages) and the note under the dashboard's plan cards. The plan
 * lines name what is checked ("Google ranking checks", "AI visibility checks");
 * this says what one of them is, in the words a customer uses. Same definitions
 * as the "how usage is counted" section: a Google check is one keyword in one
 * place (Google or Google Maps), an AI check is one question to one AI engine.
 */
export const CHECKS_EXPLAINER: Record<Locale, string> = {
  en: 'A Google ranking check looks up where one keyword appears in Google or Google Maps. An AI visibility check asks one AI engine one question, for example ChatGPT, and sees whether your business is mentioned in the answer.',
  he: 'בדיקת מיקום בגוגל בודקת איפה מילת מפתח אחת מופיעה בגוגל או בגוגל מפות. בדיקת נראות ב-AI שואלת מנוע AI אחד שאלה אחת, למשל ChatGPT, ובודקת אם העסק שלכם מוזכר בתשובה.',
}

/**
 * The free trial's lines, in the same words and the same order as the paid
 * plans, from TRIAL_CATALOG. The trial allowances are for the whole trial, not
 * per month, and the lines say so.
 */
export function trialLimitLines(locale: Locale): string[] {
  const t = TRIAL_CATALOG
  if (locale === 'en') {
    return [
      'One article to try, from writing to publishing',
      '1 website',
      `Up to ${t.maxKeywordsPerProject} keywords`,
      `Up to ${t.maxGoogleChecksLifetime} Google ranking checks during the trial`,
      `Up to ${t.maxAIChecksLifetime} AI visibility checks during the trial`,
      `${t.days}-day trial`,
    ]
  }
  return [
    'מאמר אחד לניסיון, מהכתיבה ועד הפרסום',
    'אתר אחד',
    `עד ${t.maxKeywordsPerProject} מילות מפתח`,
    `עד ${t.maxGoogleChecksLifetime} בדיקות מיקום בגוגל בתקופת הניסיון`,
    `עד ${t.maxAIChecksLifetime} בדיקות נראות ב-AI בתקופת הניסיון`,
    `${t.days} ימי ניסיון`,
  ]
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
    en: 'One website, a simple place to start',
    he: 'אתר אחד, התחלה פשוטה',
  },
  advanced: {
    en: 'For one website that needs more articles and more tracking',
    he: 'לאתר אחד שצריך יותר מאמרים ויותר מעקב',
  },
  premium: {
    en: 'For businesses and agencies running several websites',
    he: 'לעסקים ולסוכנויות שמנהלים כמה אתרים',
  },
  large_agency: {
    en: 'For agencies with many clients',
    he: 'לסוכנויות עם הרבה לקוחות',
  },
}
