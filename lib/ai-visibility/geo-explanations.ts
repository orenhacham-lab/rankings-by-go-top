/**
 * GEO Explanations — Phase 1B (rule-based narrative generation).
 *
 * Converts raw GEO Insights signals into 2–4 clear human-readable bullets
 * explaining why a result appeared (or didn't) in AI engine responses.
 *
 * All bullets are rule-based; no AI generation, no hallucination, no
 * invented explanations. Each bullet must be grounded in a specific signal.
 *
 * Returns bullets directly as localized strings (HE/EN).
 */

import type { GeoInsights, QueryIntent, CitationType } from './geo-signals'

export interface GeoExplanation {
  bullets: string[]
  hasSignals: boolean
}

/**
 * Generate a human-readable explanation for why this result occurred.
 *
 * Generates 2–4 bullets covering (in order):
 *   1. Query intent (if recognized)
 *   2. Citation sources (if non-homepage/non-brand)
 *   3. Visibility outcome (mention/citation status) — always included
 *   4. Bonus: relevant content signals
 *
 * Returns empty bullets if truly insufficient signals (e.g., no intent,
 * no sources, no mention/citation, no content patterns).
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
    displayBrandLabels,
    displayDomainLabel,
    isHebrew: he,
  } = args

  // Safe defaults if no geoInsights from server
  const data = geoInsights ?? {
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

  const bullets: string[] = []

  // ─────────────────────────────────────────────────────────────────────
  // 1. Intent explanation (1 bullet, most prominent intent)
  // ─────────────────────────────────────────────────────────────────────
  if (data.queryIntents.includes('transactional')) {
    bullets.push(
      he
        ? 'זו שאלה עם כוונת קנייה. במקרים כאלה מנועי AI נוטים להעדיף תשובות עם מחירים וביקורות.'
        : 'This is a buying intent query. AI engines typically prioritize answers with pricing and reviews.'
    )
  } else if (data.queryIntents.includes('review')) {
    bullets.push(
      he
        ? 'זו שאלה המחפשת המלצות או ביקורות. מנועי AI נוטים להדגיש חוות דעות בתשובה.'
        : 'This query seeks recommendations or reviews. AI engines emphasize opinions in answers.'
    )
  } else if (data.queryIntents.includes('comparison')) {
    bullets.push(
      he
        ? 'זו שאלת השוואה. המנוע כנראה התמקד בהבדלים בין אפשרויות.'
        : 'This is a comparison query. The engine likely focused on differences between options.'
    )
  } else if (data.queryIntents.includes('local')) {
    bullets.push(
      he
        ? 'זו שאלה עם כוונה מקומית. מנועי AI מחפשים עסקים או שירותים קרוב למיקום.'
        : 'This query has local intent. AI engines seek businesses or services near the location.'
    )
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Citation source explanation
  // ─────────────────────────────────────────────────────────────────────
  if (data.citationTypes.length > 0) {
    const isBrandOrHome =
      data.citationTypes.includes('brand_site') || data.citationTypes.includes('homepage')

    // If brand/homepage are present, mention that (strong signal)
    if (isBrandOrHome) {
      bullets.push(
        he
          ? 'המנוע הסתמך על אתר המותג או דף הבית, מקורות חזקים וישירים.'
          : 'The engine relied on the brand site or homepage, strong direct sources.'
      )
    } else if (data.citationTypes.includes('marketplace')) {
      // Marketplace emphasis for buying queries
      bullets.push(
        he
          ? 'המנוע הסתמך על שווקים מקוונים (אמזון, eBay וכו\'), פופולריים בשאלות קנייה.'
          : 'The engine relied on online marketplaces (Amazon, eBay, etc.), popular for buying queries.'
      )
    } else if (data.citationTypes.includes('forum')) {
      // Forum emphasis for review/discussion queries
      bullets.push(
        he
          ? 'המנוע הסתמך על פורומים וקהילות, מקורות לביקורות וחוות דעות.'
          : 'The engine relied on forums and communities, sources for reviews and opinions.'
      )
    } else if (data.citationTypes.includes('review')) {
      // Review sites
      bullets.push(
        he
          ? 'המנוע הסתמך על אתרי ביקורות, המציגים דירוגים והמלצות.'
          : 'The engine relied on review sites, which display ratings and recommendations.'
    )
    } else if (data.citationTypes.includes('directory')) {
      // Directory emphasis
      bullets.push(
        he
          ? 'המנוע הסתמך על ספרי עסקים (דיוקטוריז), מקורות לחיפוש עסקים.'
          : 'The engine relied on business directories, sources for finding businesses.'
      )
    } else if (data.citationTypes.includes('blog') || data.citationTypes.includes('comparison')) {
      // Blog/comparison articles
      bullets.push(
        he
          ? 'המנוע הסתמך על מאמרים וערכים השוואתיים, מקורות מידע.'
          : 'The engine relied on articles and comparison guides, information sources.'
      )
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. Visibility outcome (primary answer to "why?") — always include
  // ─────────────────────────────────────────────────────────────────────
  if (displayMentioned && displayCited) {
    bullets.push(
      he
        ? 'העסק הופיע בתשובה וגם צוטט כמקור — סימן חזק מאוד לנראות במנוע.'
        : 'The business appeared in the answer and was cited as a source — very strong visibility signal.'
    )
  } else if (displayMentioned) {
    bullets.push(
      he
        ? 'העסק הופיע בתשובה כי שם העסק זוהה ישירות בטקסט.'
        : 'The business appeared because its name was directly identified in the text.'
    )
  } else if (displayCited) {
    bullets.push(
      he
        ? 'האתר צוטט כמקור בתשובה, סימן חזק לנראות במנוע AI.'
        : 'The website was cited as a source in the answer, a strong AI visibility signal.'
    )
  } else {
    bullets.push(
      he
        ? 'העסק לא הופיע בתוצאה הזו. כדאי לבדוק אם קיימים באתר תכנים שעונים ישירות על השאלה.'
        : 'The business did not appear in this result. Check if your site has content directly answering the query.'
    )
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Content signal (if room and relevant)
  // ─────────────────────────────────────────────────────────────────────
  if (bullets.length < 4) {
    // Pricing is relevant for transactional / buying queries
    if (
      data.contentSignals.hasPricingLanguage &&
      (data.queryIntents.includes('transactional') || data.queryIntents.length === 0)
    ) {
      bullets.push(
        he
          ? 'בתשובה הופיעו מחירים, מה שמתאים לשאלות קנייה.'
          : 'The answer included pricing information, suitable for buying queries.'
      )
    }
    // Reviews/ratings for review queries
    else if (
      data.contentSignals.hasReviewLanguage &&
      (data.queryIntents.includes('review') || data.queryIntents.length === 0)
    ) {
      bullets.push(
        he
          ? 'בתשובה הופיעו דירוגים וביקורות, שיכולים להשפיע על בחירת ההמלצות.'
          : 'The answer included ratings and reviews, which influence recommendation choices.'
      )
    }
    // Comparison language
    else if (
      data.contentSignals.hasComparisonLanguage &&
      data.queryIntents.includes('comparison')
    ) {
      bullets.push(
        he
          ? 'בתשובה הופיעה השוואה בין עסקים או מוצרים, מתאים לכוונת השאלה.'
          : 'The answer included a comparison between businesses or products, matching the query intent.'
      )
    }
  }

  // Trim to max 4 bullets
  const finalBullets = bullets.slice(0, 4)

  // Check if we have meaningful signals. If truly minimal, return empty.
  const hasSignals =
    finalBullets.length > 0 &&
    !(
      finalBullets.length === 1 &&
      !displayMentioned &&
      !displayCited &&
      data.queryIntents.length === 0 &&
      data.citationTypes.length === 0
    )

  return {
    bullets: finalBullets,
    hasSignals,
  }
}
