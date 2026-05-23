/**
 * GEO Explanations — Phase 1C business-facing narrative.
 *
 * Converts raw GEO Insights signals into 3–5 clear business-facing bullets
 * explaining why a result appeared (or didn't) in AI engine responses.
 *
 * Style: written for business owners — explains WHY each signal matters,
 * not just what it is. Avoids technical jargon (transactional, homepage,
 * intent signals). All bullets are rule-based; no AI generation.
 */

import type { GeoInsights } from './geo-signals'

export interface GeoExplanation {
  bullets: string[]
  hasSignals: boolean
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
 * Generate a human-readable, business-facing explanation for this result.
 *
 * Bullets follow a narrative arc:
 *   1. What kind of question this is (intent)
 *   2. Which kinds of sources the engine trusted (citation type)
 *   3. What was in the answer (key content signal)
 *   4. How the business performed (visibility outcome) — always included
 *
 * Each bullet explains WHY this matters for AI visibility, not just what
 * was detected. Rule-based only; if signals are sparse, returns fewer
 * bullets rather than padding with vague language.
 */
export function generateGeoExplanation(args: {
  geoInsights: GeoInsights | null
  displayMentioned: boolean
  displayCited: boolean
  displayBrandLabels: string[]
  displayDomainLabel: string | null
  isHebrew: boolean
}): GeoExplanation {
  const {
    geoInsights,
    displayMentioned,
    displayCited,
    isHebrew: he,
  } = args

  const data = geoInsights ?? EMPTY_INSIGHTS
  const bullets: string[] = []

  // ─────────────────────────────────────────────────────────────────────
  // 1. Intent (1 bullet) — explains WHY the engine behaves a certain way
  // ─────────────────────────────────────────────────────────────────────
  if (data.queryIntents.includes('transactional')) {
    bullets.push(
      he
        ? 'השאלה הזו קשורה לקבלת החלטת רכישה, ולכן מנועי AI נותנים עדיפות לתשובות ברורות ומעשיות עם מחירים, יתרונות והמלצות.'
        : 'This query is about making a purchasing decision, so AI engines favor clear, practical answers with pricing, benefits, and recommendations.'
    )
  } else if (data.queryIntents.includes('review')) {
    bullets.push(
      he
        ? 'השאלה מחפשת המלצות וחוות דעות, ולכן מנועי AI מעדיפים תשובות הכוללות ביקורות, דירוגים והוכחות חברתיות.'
        : 'This query seeks recommendations and opinions, so AI engines favor answers backed by reviews, ratings, and social proof.'
    )
  } else if (data.queryIntents.includes('comparison')) {
    bullets.push(
      he
        ? 'השאלה דורשת השוואה בין אפשרויות, ולכן מנועי AI מעדיפים תוכן שמציג הבדלים בצורה ברורה ומאורגנת.'
        : 'This query asks for a comparison between options, so AI engines favor content that presents differences in a clear, organized way.'
    )
  } else if (data.queryIntents.includes('local')) {
    bullets.push(
      he
        ? 'השאלה ממוקדת באזור גיאוגרפי מסוים, ולכן מנועי AI יעדיפו עסקים עם נוכחות מקומית ברורה ומידע מיקום זמין.'
        : 'This query is focused on a specific geographic area, so AI engines favor businesses with a clear local presence and visible location information.'
    )
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Citation source (1 bullet) — explains source authority signal
  // ─────────────────────────────────────────────────────────────────────
  if (data.citationTypes.length > 0) {
    const isBrandOrHome =
      data.citationTypes.includes('brand_site') || data.citationTypes.includes('homepage')

    if (isBrandOrHome) {
      bullets.push(
        he
          ? 'המנוע הסתמך על האתר הרשמי של העסק — סימן חיובי לחוזק המותג במנועי AI.'
          : 'The engine relied on the official business website — a positive signal of brand strength in AI engines.'
      )
    } else if (data.citationTypes.includes('marketplace')) {
      bullets.push(
        he
          ? 'המנוע הסתמך על שווקים מקוונים גדולים, שמשקפים אמון צרכני ופופולריות של מוצרים.'
          : 'The engine relied on large online marketplaces, which reflect consumer trust and product popularity.'
      )
    } else if (data.citationTypes.includes('review')) {
      bullets.push(
        he
          ? 'המנוע הסתמך על אתרי ביקורות — מקור מהימן להמלצות אובייקטיביות מהציבור.'
          : 'The engine relied on review sites — a trusted source for objective public recommendations.'
      )
    } else if (data.citationTypes.includes('forum')) {
      bullets.push(
        he
          ? 'המנוע הסתמך על דיונים בקהילות, שבהם משתמשים אמיתיים חולקים ניסיון אישי.'
          : 'The engine relied on community discussions, where real users share personal experience.'
      )
    } else if (data.citationTypes.includes('directory')) {
      bullets.push(
        he
          ? 'המנוע הסתמך על ספרי עסקים, שמסייעים לזיהוי וסיווג עסקים מקומיים בצורה אמינה.'
          : 'The engine relied on business directories, which help identify and categorize local businesses reliably.'
      )
    } else if (
      data.citationTypes.includes('blog') ||
      data.citationTypes.includes('comparison')
    ) {
      bullets.push(
        he
          ? 'המנוע הסתמך על מאמרים ומדריכים — מקור עומק שמשמש להעמקה בנושאים מקצועיים.'
          : 'The engine relied on articles and guides — depth sources used for in-depth coverage of professional topics.'
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. Content pattern (1 bullet) — explains WHY this content style helps
  // ─────────────────────────────────────────────────────────────────────
  // Pick the single most relevant content signal for the intent
  const cs = data.contentSignals
  if (cs.hasPricingLanguage && data.queryIntents.includes('transactional')) {
    bullets.push(
      he
        ? 'מנועי AI נוטים להעדיף תשובות עם מחירים ברורים בשאלות קנייה — וזה הופיע גם כאן.'
        : 'AI engines tend to favor answers with clear pricing for buying queries — and that appeared here too.'
    )
  } else if (cs.hasReviewLanguage) {
    bullets.push(
      he
        ? 'תוכן עם ביקורות ודירוגים עוזר למנועי AI לבחור תשובות אמינות יותר.'
        : 'Content with reviews and ratings helps AI engines choose more trustworthy answers.'
    )
  } else if (cs.hasComparisonLanguage && data.queryIntents.includes('comparison')) {
    bullets.push(
      he
        ? 'תוכן השוואתי מסייע למנועי AI להסביר הבדלים ולתת תשובות מעמיקות יותר.'
        : 'Comparison content helps AI engines explain differences and provide deeper answers.'
    )
  } else if (cs.hasRecommendationLanguage) {
    bullets.push(
      he
        ? 'תוכן עם המלצות ברורות מקל על מנועי AI להעביר תשובה מובהקת למשתמש.'
        : 'Content with clear recommendations makes it easier for AI engines to deliver a definitive answer to the user.'
    )
  } else if (cs.hasPricingLanguage) {
    bullets.push(
      he
        ? 'הופעת מחירים בתשובה מספקת מידע מעשי שמשתמשים מצפים לקבל ממנועי AI.'
        : 'Pricing in the answer provides the practical info users expect from AI engines.'
    )
  } else if (cs.hasList) {
    bullets.push(
      he
        ? 'מבנה רשימה בתשובה מקל על מנועי AI לסכם ולהציג מידע בצורה ברורה.'
        : 'A list structure in the answer makes it easier for AI engines to summarize and present information clearly.'
    )
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Visibility outcome — primary "why?" answer, always included
  // ─────────────────────────────────────────────────────────────────────
  if (displayMentioned && displayCited) {
    bullets.push(
      he
        ? 'העסק מופיע בתשובה וגם משמש כמקור — סימן חזק במיוחד לאמון של המנוע בעסק.'
        : 'The business appears in the answer and is also used as a source — a particularly strong signal of engine trust in the business.'
    )
  } else if (displayMentioned) {
    bullets.push(
      he
        ? 'העסק מופיע בתשובה כי המנוע מצא בו רלוונטיות ישירה לשאלה.'
        : 'The business appears in the answer because the engine found it directly relevant to the question.'
    )
  } else if (displayCited) {
    bullets.push(
      he
        ? 'האתר משמש כמקור בתשובה — מעיד על אמון של המנוע באתר כמקור מוסמך.'
        : 'The website is used as a source in the answer — indicating engine trust in the site as an authoritative source.'
    )
  } else {
    bullets.push(
      he
        ? 'העסק לא הופיע בתוצאה הזו, וזה מצביע על כך שהמנוע לא מצא תוכן מספיק רלוונטי או חזק שמתאים לשאלה.'
        : 'The business did not appear in this result, indicating the engine did not find sufficiently relevant or strong content matching the query.'
    )
  }

  // Cap at 5 bullets (intent + source + content + visibility = max 4 here)
  const finalBullets = bullets.slice(0, 5)

  // Insufficient signals: only the fallback "did not appear" bullet, no
  // intent, no citation, no content — show no explanation at all so the
  // UI can render the fallback message instead.
  const hasSignals =
    finalBullets.length > 1 || displayMentioned || displayCited

  return {
    bullets: finalBullets,
    hasSignals,
  }
}
