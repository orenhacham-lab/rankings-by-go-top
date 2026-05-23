/**
 * GEO Recommendations — Phase 1C actionable improvement layer.
 *
 * Generates 2–4 business-facing, actionable recommendations based on
 * gaps detected in GEO Insights. Each recommendation is grounded in a
 * specific missing signal and explains why it matters for AI visibility.
 *
 * Style: business-focused, not technical, not SEO-spammy. No AI calls,
 * no hallucinations — every recommendation is triggered by a concrete
 * absent signal in the current result.
 */

import type { GeoInsights } from './geo-signals'

export interface GeoRecommendation {
  /** Already-localized full text including the "why this matters" rationale. */
  text: string
  /** Triggering signal key — useful for analytics, not currently displayed. */
  key: string
}

const EMPTY_INSIGHTS: GeoInsights = {
  queryIntents: [],
  citationTypes: [],
  contentSignals: {
    hasList: false,
    hasComparisonLanguage: false,
    hasPricingLanguage: false,
    hasReviewLanguage: false,
    hasLocalLanguage: false,
    hasRecommendationLanguage: false,
  },
}

/**
 * Generate 2–4 actionable, rule-based recommendations.
 *
 * Each rule fires only when a specific gap is detected. We deliberately
 * avoid generic advice ("improve SEO", "write better content") — every
 * suggestion ties back to a concrete signal that's missing in this result.
 *
 * Priority order (most actionable first):
 *   1. Not appearing at all
 *   2. Intent-driven gaps (pricing for buying queries, etc.)
 *   3. Generic content structure gaps (reviews, comparison, lists)
 *
 * Caps at 4 to avoid overwhelm.
 */
export function generateGeoRecommendations(args: {
  geoInsights: GeoInsights | null
  displayMentioned: boolean
  displayCited: boolean
  isHebrew: boolean
}): GeoRecommendation[] {
  const { geoInsights, displayMentioned, displayCited, isHebrew: he } = args
  const data = geoInsights ?? EMPTY_INSIGHTS
  const recs: GeoRecommendation[] = []

  const intents = data.queryIntents
  const sources = data.citationTypes
  const cs = data.contentSignals

  // ─────────────────────────────────────────────────────────────────────
  // PRIORITY 1: Business is invisible (not mentioned and not cited)
  // ─────────────────────────────────────────────────────────────────────
  if (!displayMentioned && !displayCited) {
    recs.push({
      key: 'missing_dedicated_content',
      text: he
        ? 'צרו עמוד תוכן ייעודי שעונה ישירות על השאלה הזו. תוכן ממוקד מגדיל משמעותית את הסיכוי שמנועי AI יזהו את העסק כתשובה רלוונטית.'
        : 'Create a dedicated content page that directly answers this question. Focused content significantly increases the chance that AI engines will identify the business as a relevant answer.',
    })
  }

  // ─────────────────────────────────────────────────────────────────────
  // PRIORITY 2: Intent-driven content gaps
  // ─────────────────────────────────────────────────────────────────────

  // Buying intent without pricing language → recommend pricing
  if (intents.includes('transactional') && !cs.hasPricingLanguage) {
    recs.push({
      key: 'add_pricing',
      text: he
        ? 'הציגו מחירים בצורה ברורה ונגישה בעמודי המוצר או השירות. שאלות עם כוונת רכישה גורמות למנועי AI לחפש תשובות עם מידע מעשי על עלויות.'
        : 'Display prices clearly and accessibly on product or service pages. Buying-intent queries push AI engines to look for answers with practical cost information.',
    })
  }

  // Review intent without review signals → recommend reviews
  if (
    (intents.includes('review') || intents.includes('transactional')) &&
    !cs.hasReviewLanguage &&
    !sources.includes('review')
  ) {
    recs.push({
      key: 'add_reviews',
      text: he
        ? 'הוסיפו לאתר ביקורות, דירוגים והוכחות חברתיות של לקוחות אמיתיים. מנועי AI מעדיפים תוכן עם הוכחות אמון כדי לתת תשובות אמינות יותר.'
        : 'Add customer reviews, ratings, and social proof from real customers. AI engines favor content with trust signals when delivering trustworthy answers.',
    })
  }

  // Comparison intent without comparison content → recommend comparison pages
  if (
    intents.includes('comparison') &&
    !cs.hasComparisonLanguage &&
    !sources.includes('comparison')
  ) {
    recs.push({
      key: 'add_comparison',
      text: he
        ? 'צרו עמודי השוואה שמשווים בין המוצרים או השירותים שלכם לחלופות בשוק. מנועי AI מעדיפים תוכן השוואתי שמציג הבדלים בצורה ברורה.'
        : 'Create comparison pages that contrast your products or services with market alternatives. AI engines favor comparison content that presents differences clearly.',
    })
  }

  // Local intent without local language → recommend location content
  if (intents.includes('local') && !cs.hasLocalLanguage) {
    recs.push({
      key: 'add_local',
      text: he
        ? 'ודאו שכתובת ואזורי השירות שלכם מוצגים בבירור באתר. שאלות מקומיות דורשות אזכורים גיאוגרפיים ברורים כדי שמנועי AI ישייכו את העסק לאזור הנכון.'
        : 'Ensure your address and service areas are clearly displayed on the site. Local queries need explicit geographic mentions so AI engines associate the business with the right area.',
    })
  }

  // ─────────────────────────────────────────────────────────────────────
  // PRIORITY 3: General structure gaps (only fill remaining slots)
  // ─────────────────────────────────────────────────────────────────────

  // No structured content (no list / no FAQ-like structure)
  if (recs.length < 4 && !cs.hasList) {
    recs.push({
      key: 'add_structure',
      text: he
        ? 'הוסיפו תוכן בפורמט רשימות, נקודות עיקריות ושאלות נפוצות (FAQ). מבנה מובנה מקל על מנועי AI לחלץ את המידע ולהציג אותו בתשובה.'
        : 'Add content in list format, key bullet points, and FAQ sections. A structured layout makes it easier for AI engines to extract information and present it in the answer.',
    })
  }

  // Brand site not appearing as a source
  if (
    recs.length < 4 &&
    !displayCited &&
    !sources.includes('brand_site') &&
    !sources.includes('homepage')
  ) {
    recs.push({
      key: 'strengthen_brand_site',
      text: he
        ? 'חזקו את הסמכותיות של האתר הרשמי (תוכן עומק, קישורים נכנסים, ציטוטים חיצוניים). אתר מותג חזק הוא סימן מרכזי לאמון של מנועי AI.'
        : 'Strengthen the authority of your official website (in-depth content, inbound links, external citations). A strong brand site is a key trust signal for AI engines.',
    })
  }

  // No recommendation language anywhere (and we have content) → suggest definitive statements
  if (
    recs.length < 4 &&
    !cs.hasRecommendationLanguage &&
    (cs.hasPricingLanguage || cs.hasReviewLanguage || cs.hasComparisonLanguage)
  ) {
    recs.push({
      key: 'add_definitive_recommendations',
      text: he
        ? 'נסחו באתר המלצות ברורות וחד-משמעיות (לדוגמה "האפשרות המומלצת ל-X היא..."). מנועי AI מחפשים תשובות מובהקות, ותוכן עם המלצה מפורשת קל יותר לשילוב.'
        : 'Phrase clear, definitive recommendations on the site (e.g. "The recommended option for X is..."). AI engines look for definitive answers, and explicit-recommendation content is easier to incorporate.',
    })
  }

  // Cap at 4 to avoid overload
  return recs.slice(0, 4)
}
