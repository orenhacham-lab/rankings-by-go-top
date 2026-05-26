/**
 * Keyword Research Seed Bank — Phase 2
 *
 * Curated question seeds for the Keyword Research → Generate AI Questions modal.
 * These seeds are SEPARATE from the Smart Questions vNext seed bank in intent-engine.ts.
 *
 * Design rules:
 *   - Organized by keywordType, with sub-categories per topic where needed
 *   - Use semantic placeholders ONLY when safe:
 *       {{serviceLabel}}   — normalized service name (e.g., "קידום אתרים")
 *       {{productLabel}}   — normalized product name (e.g., "הליכון ביתי")
 *       {{channelLabel}}   — normalized channel name (e.g., "אינסטגרם")
 *       {{brandName}}      — brand name
 *   - No raw keyword wrapping (never blindly insert the full keyword)
 *   - No "לקנות" for services
 *   - No product templates for services
 *   - No generic filler questions
 *   - Questions must be realistic AI-search queries a real user might type
 *   - Questions must be useful for AI visibility tracking
 *
 * Phase 3 will wire this into the modal. This file is isolated for now.
 */

import type { KeywordType, KeywordTopic } from './keyword-analysis'

// ============================================================================
// SEED TYPES
// ============================================================================

export interface KeywordResearchSeed {
  /** Return the question text, or null if context isn't suitable. */
  text: (ctx: KRSeedContext) => string | null
  /** The search intent this question represents. */
  intent: 'commercial' | 'pre_purchase' | 'comparison' | 'informational' | 'brand'
  /** Quality score 1-100. Higher = preferred. */
  score: number
}

export interface KRSeedContext {
  serviceLabel?: string
  productLabel?: string
  channelLabel?: string
  brandName?: string
  language: 'he' | 'en'
  country?: string
}

/**
 * Full seed bank. Top-level keys are KeywordType.
 * Within marketing_channel and service, there are topic-specific sub-banks.
 */
export interface KeywordResearchSeedBank {
  service: {
    /** Generic service questions — used when no specific topic is identified. */
    common: KeywordResearchSeed[]
    seo: KeywordResearchSeed[]
    local_seo: KeywordResearchSeed[]
    web_dev: KeywordResearchSeed[]
    cleaning: KeywordResearchSeed[]
    home_improvement: KeywordResearchSeed[]
    florist: KeywordResearchSeed[]
    legal: KeywordResearchSeed[]
    medical: KeywordResearchSeed[]
    content_marketing: KeywordResearchSeed[]
    email_marketing: KeywordResearchSeed[]
    social_management: KeywordResearchSeed[]
  }
  product: {
    common: KeywordResearchSeed[]
    fashion: KeywordResearchSeed[]
    sports_product: KeywordResearchSeed[]
    perfume_product: KeywordResearchSeed[]
    florist_product: KeywordResearchSeed[]
  }
  marketing_channel: {
    google_ads: KeywordResearchSeed[]
    facebook_ads: KeywordResearchSeed[]
    instagram_ads: KeywordResearchSeed[]
    paid_ads: KeywordResearchSeed[]
    social_media: KeywordResearchSeed[]
  }
  brand: KeywordResearchSeed[]
  informational: KeywordResearchSeed[]
}

// ============================================================================
// SEED BANK
// ============================================================================

export const keywordResearchSeeds: KeywordResearchSeedBank = {

  // ══════════════════════════════════════════════════════════════════════════
  // SERVICE
  // ══════════════════════════════════════════════════════════════════════════
  service: {

    /** Fallback service seeds — used when topic is unknown or very generic */
    common: [
      {
        text: ({ serviceLabel, language }) =>
          language === 'en'
            ? `How do I choose a ${serviceLabel ?? 'service provider'}?`
            // "מקצועי" dropped — it would need to agree with the gender of serviceLabel
            // which we can't infer. Reworded as "חברה ל..." (חברה is always fem. singular).
            : `איך לבחור חברה ל${serviceLabel ?? 'שירות זה'}?`,
        intent: 'pre_purchase',
        score: 75,
      },
      {
        text: ({ serviceLabel, language }) =>
          language === 'en'
            ? `How much does ${serviceLabel ?? 'this service'} cost?`
            : `כמה עולה ${serviceLabel ?? 'השירות הזה'}?`,
        intent: 'commercial',
        score: 80,
      },
      {
        text: ({ language }) =>
          language === 'en'
            ? 'How do I know if a service provider is reliable?'
            : 'איך יודעים אם ספק שירות מקצועי?',
        intent: 'pre_purchase',
        score: 70,
      },
    ],

    seo: [
      { text: () => 'איך לבחור חברת SEO?',                                      intent: 'pre_purchase', score: 92 },
      { text: () => 'כמה עולה קידום אתרים אורגני?',                              intent: 'commercial',   score: 90 },
      { text: () => 'כמה זמן לוקח לראות תוצאות מ-SEO?',                          intent: 'informational', score: 88 },
      { text: () => 'מה חשוב לבדוק לפני שבוחרים חברת קידום אתרים?',              intent: 'pre_purchase', score: 87 },
      { text: () => 'מה עדיף — SEO או Google Ads?',                               intent: 'comparison',   score: 85 },
      { text: () => 'איך בודקים שחברת SEO עושה עבודה טובה?',                     intent: 'pre_purchase', score: 84 },
      { text: () => 'מה הסיכון בחברת SEO שמבטיחה תוצאות מהירות?',                intent: 'informational', score: 82 },
      { text: () => 'כמה עולה קידום אתרים לעסק קטן?',                            intent: 'commercial',   score: 81 },
      { text: () => 'מה ההבדל בין קידום אתרים לקידום מקומי?',                    intent: 'comparison',   score: 78 },
      {
        text: ({ language }) =>
          language === 'en' ? 'How do I choose the right SEO agency?' : null,
        intent: 'pre_purchase',
        score: 92,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'How long does SEO take to show results?' : null,
        intent: 'informational',
        score: 88,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'What should I look for when hiring an SEO company?' : null,
        intent: 'pre_purchase',
        score: 87,
      },
    ],

    local_seo: [
      { text: () => 'איך לשפר את הדירוג בגוגל מפות?',                            intent: 'informational', score: 88 },
      { text: () => 'כמה עולה קידום מקומי בגוגל?',                               intent: 'commercial',   score: 85 },
      { text: () => 'מה חשוב לאופטימיזציה של גוגל עסקים?',                       intent: 'informational', score: 83 },
      { text: () => 'איך לבחור חברה לקידום מקומי?',                               intent: 'pre_purchase', score: 82 },
      { text: () => 'מה ההבדל בין קידום אורגני לקידום מקומי?',                   intent: 'comparison',   score: 78 },
      {
        text: ({ language }) =>
          language === 'en' ? 'How to rank higher on Google Maps?' : null,
        intent: 'informational',
        score: 88,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'How much does local SEO cost?' : null,
        intent: 'commercial',
        score: 85,
      },
    ],

    web_dev: [
      { text: () => 'כמה עולה בניית אתר לעסק?',                                  intent: 'commercial',   score: 90 },
      { text: () => 'איך לבחור חברה לבניית אתר?',                                intent: 'pre_purchase', score: 88 },
      { text: () => 'כמה זמן לוקח לבנות אתר?',                                   intent: 'informational', score: 85 },
      { text: () => 'מה ההבדל בין וורדפרס לשופיפיי?',                            intent: 'comparison',   score: 83 },
      { text: () => 'מה חשוב בבחירת חברה לפיתוח אתר?',                           intent: 'pre_purchase', score: 82 },
      {
        text: ({ language }) =>
          language === 'en' ? 'How much does it cost to build a business website?' : null,
        intent: 'commercial',
        score: 90,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'How do I choose a web development company?' : null,
        intent: 'pre_purchase',
        score: 88,
      },
    ],

    cleaning: [
      { text: () => 'כמה עולה שירות ניקיון עסקי?',                               intent: 'commercial',   score: 88 },
      { text: () => 'איך לבחור חברת ניקיון למשרד?',                               intent: 'pre_purchase', score: 87 },
      { text: () => 'מה כדאי לבדוק לפני שחותמים חוזה עם חברת ניקיון?',          intent: 'pre_purchase', score: 85 },
      { text: () => 'כמה פעמים בשבוע כדאי לנקות משרד?',                          intent: 'informational', score: 80 },
      { text: () => 'מה ההבדל בין ניקיון שוטף לניקיון עומק?',                    intent: 'comparison',   score: 78 },
    ],

    home_improvement: [
      {
        text: ({ serviceLabel, language }) =>
          language === 'en'
            ? `How much does ${serviceLabel ?? 'home renovation'} cost?`
            : `כמה עולה ${serviceLabel ?? 'שיפוץ בית'}?`,
        intent: 'commercial',
        score: 88,
      },
      {
        text: ({ serviceLabel, language }) =>
          language === 'en'
            ? `How do I choose a contractor for ${serviceLabel ?? 'renovation work'}?`
            : `איך לבחור קבלן ל-${serviceLabel ?? 'שיפוצים'}?`,
        intent: 'pre_purchase',
        score: 87,
      },
      {
        text: ({ language }) =>
          language === 'en'
            ? 'How long does a home renovation take?'
            : 'כמה זמן לוקח שיפוץ?',
        intent: 'informational',
        score: 85,
      },
      {
        text: ({ language }) =>
          language === 'en'
            ? 'What should I check before hiring a contractor?'
            : 'מה חשוב לבדוק לפני שכירת קבלן?',
        intent: 'pre_purchase',
        score: 84,
      },
      {
        text: ({ language }) =>
          language === 'en'
            ? 'How do I avoid renovation scams?'
            : 'איך להימנע מקבלן שיפוצים לא אמין?',
        intent: 'pre_purchase',
        score: 82,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'What permits do I need for home renovation?' : null,
        intent: 'informational',
        score: 78,
      },
    ],

    florist: [
      { text: () => 'כמה עולה זר ורדים לאירוע?',                                 intent: 'commercial',   score: 85 },
      { text: () => 'איך לבחור חנות פרחים לאירועים?',                             intent: 'pre_purchase', score: 83 },
      { text: () => 'מה ההבדל בין חנויות פרחים שונות?',                          intent: 'comparison',   score: 78 },
      { text: () => 'כמה מראש צריך להזמין פרחים לחתונה?',                        intent: 'pre_purchase', score: 82 },
    ],

    legal: [
      { text: () => 'כמה עולה ייעוץ משפטי?',                                     intent: 'commercial',   score: 88 },
      { text: () => 'איך לבחור עורך דין מתאים?',                                  intent: 'pre_purchase', score: 87 },
      { text: () => 'מה ההבדל בין עורך דין לנוטריון?',                            intent: 'comparison',   score: 82 },
      { text: () => 'מה חשוב לדעת לפני פגישה עם עורך דין?',                      intent: 'pre_purchase', score: 80 },
    ],

    medical: [
      { text: () => 'כמה עולה ביקור אצל רופא פרטי?',                             intent: 'commercial',   score: 85 },
      { text: () => 'איך בוחרים רופא מומחה פרטי?',                               intent: 'pre_purchase', score: 83 },
      { text: () => 'מה ההבדל בין רופא קופת חולים לרופא פרטי?',                  intent: 'comparison',   score: 80 },
    ],

    content_marketing: [
      { text: () => 'כמה עולה שיווק תוכן לעסק?',                                 intent: 'commercial',   score: 85 },
      { text: () => 'איך לבחור חברה לשיווק תוכן?',                               intent: 'pre_purchase', score: 83 },
      { text: () => 'מה ההבדל בין שיווק תוכן לבלוג רגיל?',                      intent: 'comparison',   score: 78 },
      { text: () => 'כמה זמן לוקח לראות תוצאות משיווק תוכן?',                    intent: 'informational', score: 80 },
    ],

    email_marketing: [
      { text: () => 'כמה עולה שיווק במייל לעסק?',                                intent: 'commercial',   score: 83 },
      { text: () => 'איך לבחור פלטפורמה לדיוור מייל?',                           intent: 'pre_purchase', score: 82 },
      { text: () => 'מה שיעור פתיחת מיילים סביר?',                               intent: 'informational', score: 78 },
    ],

    social_management: [
      { text: () => 'כמה עולה ניהול רשתות חברתיות לעסק?',                        intent: 'commercial',   score: 87 },
      { text: () => 'איך לבחור חברה לניהול הרשתות החברתיות?',                    intent: 'pre_purchase', score: 86 },
      { text: () => 'כמה פוסטים בשבוע מומלץ לעסק?',                             intent: 'informational', score: 80 },
      { text: () => 'מה ההבדל בין ניהול רשתות לפרסום ממומן?',                    intent: 'comparison',   score: 82 },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PRODUCT
  // ══════════════════════════════════════════════════════════════════════════
  product: {

    common: [
      {
        text: ({ productLabel, language }) =>
          language === 'en'
            ? `How do I choose the right ${productLabel ?? 'product'}?`
            // "מתאים" removed — it requires gender/number agreement we can't infer
            : `איך לבחור ${productLabel ?? 'מוצר'}?`,
        intent: 'pre_purchase',
        score: 80,
      },
      {
        text: ({ productLabel, language }) =>
          language === 'en'
            ? `How much does ${productLabel ?? 'this product'} cost?`
            // Changed from "כמה עולה" (singular) to "מה המחירים של" (works for any number)
            // Safer Hebrew: works for שמלות, נעלים, הליכון, מכונות, etc.
            : `מה המחירים של ${productLabel ?? 'המוצר'}?`,
        intent: 'commercial',
        score: 82,
      },
      {
        text: ({ productLabel, language }) =>
          language === 'en'
            ? `Where is the best place to buy ${productLabel ?? 'this product'}?`
            : `איפה כדאי לקנות ${productLabel ?? 'מוצר כזה'}?`,
        intent: 'commercial',
        score: 78,
      },
    ],

    fashion: [
      {
        // "מתאים" removed — singular masculine, clashes with plural labels (שמלות, נעליים)
        text: ({ productLabel }) => `איך לבחור ${productLabel ?? 'פריט לבוש'}?`,
        intent: 'pre_purchase',
        score: 85,
      },
      {
        // Changed from "כמה עולה" (singular verb) to "מה המחירים של" (works for any number)
        // Safer Hebrew: works for שמלות (plural), נעליים (plural), טוניקה (singular), etc.
        text: ({ productLabel }) => `מה המחירים של ${productLabel ?? 'פריט אופנה'}?`,
        intent: 'commercial',
        score: 83,
      },
      {
        text: ({ productLabel }) => `איפה כדאי לקנות ${productLabel ?? 'בגדים'} אונליין?`,
        intent: 'commercial',
        score: 82,
      },
      {
        // "איכותיים" removed — masc. plural adjective, wrong for שמלות (fem.) / נעלי נשים
        text: ({ productLabel }) => `אילו מותגים מציעים ${productLabel ?? 'בגדים'}?`,
        intent: 'comparison',
        score: 80,
      },
      {
        text: () => 'מה הסימנים לאיכות של פריט לבוש?',
        intent: 'pre_purchase',
        score: 78,
      },
    ],

    sports_product: [
      {
        // "לבית" removed — creates redundancy when productLabel already contains "ביתי"
        // e.g., "הליכון ביתי לבית" → awkward. Bare label is cleaner.
        text: ({ productLabel }) => `איך לבחור ${productLabel ?? 'ציוד ספורט'}?`,
        intent: 'pre_purchase',
        score: 87,
      },
      {
        // Changed from "כמה עולה" (singular verb) to "מה המחירים של" (works for any number)
        // Safer Hebrew: works for הליכון (sing.), אופניים (plural), משחקי טניס (plural), etc.
        text: ({ productLabel }) => `מה המחירים של ${productLabel ?? 'ציוד ספורט'}?`,
        intent: 'commercial',
        score: 85,
      },
      {
        text: ({ productLabel }) => `מה ההבדל בין דגמים שונים של ${productLabel ?? 'ציוד ספורט'}?`,
        intent: 'comparison',
        score: 83,
      },
      {
        text: () => 'מה כדאי לדעת לפני שקונים ציוד ספורט לבית?',
        intent: 'pre_purchase',
        score: 82,
      },
      {
        text: () => 'איזה ציוד ספורט שווה לקנות לבית?',
        intent: 'pre_purchase',
        score: 80,
      },
    ],

    perfume_product: [
      {
        // "מתאים" removed — masculine singular, wrong for e.g. "בשמים" (plural)
        text: ({ productLabel }) => `איך לבחור ${productLabel ?? 'בושם'}?`,
        intent: 'pre_purchase',
        score: 85,
      },
      {
        // Changed from "כמה עולה" (singular verb) to "מה המחירים של" (works for any number)
        // Safer Hebrew: works for בושם (singular), בשמים (plural), בשמי יוקרה, etc.
        text: ({ productLabel }) => `מה המחירים של ${productLabel ?? 'בושם'}?`,
        intent: 'commercial',
        score: 83,
      },
      {
        text: () => 'מה ההבדל בין Eau de Parfum ל-Eau de Toilette?',
        intent: 'informational',
        score: 80,
      },
      {
        text: () => 'איזה בשמים מחזיקים הכי הרבה?',
        intent: 'pre_purchase',
        score: 78,
      },
    ],

    florist_product: [
      {
        // Changed from "כמה עולה" (singular verb) to "מה המחירים של" (works for any number)
        // Safer Hebrew: works for זר (singular), ורדים (plural), פרחי עונה, etc.
        text: ({ productLabel }) => `מה המחירים של ${productLabel ?? 'זר פרחים'}?`,
        intent: 'commercial',
        score: 85,
      },
      {
        // Reworded to avoid "מתאים" which is masc. singular — might clash with e.g. "ורדים"
        text: ({ productLabel }) => `איזה ${productLabel ?? 'פרחים'} לשלוח ליום הולדת?`,
        intent: 'pre_purchase',
        score: 83,
      },
      {
        text: () => 'מה ההבדל בין זר לאירוע לזר לאבלים?',
        intent: 'comparison',
        score: 78,
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MARKETING CHANNEL
  // ══════════════════════════════════════════════════════════════════════════
  marketing_channel: {

    google_ads: [
      { text: () => 'כמה עולה פרסום בגוגל?',                                    intent: 'commercial',   score: 92 },
      { text: () => 'איך לבחור חברה לניהול Google Ads?',                         intent: 'pre_purchase', score: 91 },
      { text: () => 'איזה תקציב מומלץ להתחלה בגוגל אדס?',                       intent: 'commercial',   score: 90 },
      { text: () => 'מה ההבדל בין Google Ads ל-SEO?',                            intent: 'comparison',   score: 89 },
      { text: () => 'איך יודעים אם קמפיין Google Ads עובד טוב?',                 intent: 'informational', score: 88 },
      { text: () => 'כמה עולה קליק ממוצע בגוגל אדס?',                           intent: 'commercial',   score: 87 },
      { text: () => 'מה הטעויות הנפוצות בניהול Google Ads?',                     intent: 'informational', score: 85 },
      { text: () => 'כמה עולה ניהול Google Ads על ידי חברה?',                    intent: 'commercial',   score: 84 },
      {
        text: ({ language }) =>
          language === 'en' ? 'How much does Google Ads cost?' : null,
        intent: 'commercial',
        score: 92,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'How do I choose a Google Ads agency?' : null,
        intent: 'pre_purchase',
        score: 91,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'What budget do I need to start with Google Ads?' : null,
        intent: 'commercial',
        score: 90,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'How do I know if my Google Ads campaign is working?' : null,
        intent: 'informational',
        score: 88,
      },
    ],

    facebook_ads: [
      { text: () => 'כמה עולה פרסום בפייסבוק?',                                 intent: 'commercial',   score: 90 },
      { text: () => 'איך לבחור חברה לניהול קמפיינים בפייסבוק?',                  intent: 'pre_purchase', score: 89 },
      { text: () => 'איזה תקציב מומלץ לפרסום בפייסבוק?',                         intent: 'commercial',   score: 88 },
      { text: () => 'מה עדיף — פרסום בפייסבוק או באינסטגרם?',                   intent: 'comparison',   score: 87 },
      { text: () => 'איך יודעים אם קמפיין בפייסבוק עובד?',                       intent: 'informational', score: 86 },
      { text: () => 'מה ההבדל בין Facebook Ads ל-Google Ads?',                   intent: 'comparison',   score: 85 },
      { text: () => 'כמה עולה ניהול קמפיין לידים בפייסבוק?',                    intent: 'commercial',   score: 84 },
      {
        text: ({ language }) =>
          language === 'en' ? 'How much does Facebook advertising cost?' : null,
        intent: 'commercial',
        score: 90,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'How do I choose a Facebook Ads agency?' : null,
        intent: 'pre_purchase',
        score: 89,
      },
    ],

    instagram_ads: [
      { text: () => 'כמה עולה פרסום באינסטגרם?',                                intent: 'commercial',   score: 90 },
      { text: () => 'איך לבחור חברה לניהול קמפיינים באינסטגרם?',                 intent: 'pre_purchase', score: 89 },
      { text: () => 'איזה תקציב מומלץ לפרסום באינסטגרם?',                        intent: 'commercial',   score: 88 },
      { text: () => 'מה עדיף לעסק — פרסום בגוגל או באינסטגרם?',                 intent: 'comparison',   score: 87 },
      { text: () => 'איך יודעים אם קמפיין באינסטגרם עובד טוב?',                  intent: 'informational', score: 86 },
      { text: () => 'מה ההבדל בין פרסום באינסטגרם לפרסום בפייסבוק?',            intent: 'comparison',   score: 84 },
      { text: () => 'כמה עולה ניהול קמפיין לידים באינסטגרם?',                   intent: 'commercial',   score: 83 },
      { text: () => 'איזה עסקים מרוויחים הכי הרבה מפרסום באינסטגרם?',           intent: 'informational', score: 82 },
      {
        text: ({ language }) =>
          language === 'en' ? 'How much does Instagram advertising cost?' : null,
        intent: 'commercial',
        score: 90,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'How do I choose an Instagram Ads agency?' : null,
        intent: 'pre_purchase',
        score: 89,
      },
    ],

    /** Generic paid advertising — used when no specific platform is identified. */
    paid_ads: [
      { text: () => 'כמה עולה קידום ממומן לעסק?',                               intent: 'commercial',   score: 87 },
      { text: () => 'איך לבחור חברה לניהול קמפיינים ממומנים?',                   intent: 'pre_purchase', score: 86 },
      { text: () => 'מה עדיף — קידום אורגני או קידום ממומן?',                   intent: 'comparison',   score: 85 },
      { text: () => 'איזה תקציב מינימלי צריך לקידום ממומן?',                    intent: 'commercial',   score: 84 },
      { text: () => 'איך יודעים אם קמפיין ממומן עובד טוב?',                     intent: 'informational', score: 83 },
      { text: () => 'מה ההבדל בין קמפיין גוגל לקמפיין פייסבוק?',               intent: 'comparison',   score: 82 },
      { text: () => 'מה הטעויות הנפוצות בניהול קמפיינים ממומנים?',              intent: 'informational', score: 80 },
      {
        text: ({ language }) =>
          language === 'en' ? 'How much does paid advertising cost for a small business?' : null,
        intent: 'commercial',
        score: 87,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'How do I choose a paid media agency?' : null,
        intent: 'pre_purchase',
        score: 86,
      },
      {
        text: ({ language }) =>
          language === 'en' ? 'What is a realistic budget to start with paid ads?' : null,
        intent: 'commercial',
        score: 84,
      },
    ],

    social_media: [
      { text: () => 'איזה רשת חברתית מתאימה לעסק שלי?',                         intent: 'pre_purchase', score: 85 },
      { text: () => 'כמה עולה ניהול רשתות חברתיות לעסק?',                        intent: 'commercial',   score: 84 },
      { text: () => 'מה עדיף — פרסום בפייסבוק, אינסטגרם, או טיקטוק?',          intent: 'comparison',   score: 83 },
      { text: () => 'איך לבחור חברה לניהול הנוכחות ברשתות החברתיות?',            intent: 'pre_purchase', score: 82 },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BRAND
  // ══════════════════════════════════════════════════════════════════════════
  brand: [
    {
      text: ({ brandName, language }) =>
        language === 'en'
          ? `Is ${brandName ?? 'this brand'} recommended?`
          : `האם ${brandName ?? 'המותג הזה'} מומלץ?`,
      intent: 'brand',
      score: 85,
    },
    {
      text: ({ brandName, language }) =>
        language === 'en'
          ? `What do customers say about ${brandName ?? 'this brand'}?`
          : `מה אנשים חושבים על ${brandName ?? 'המותג הזה'}?`,
      intent: 'brand',
      score: 83,
    },
    {
      text: ({ brandName, language }) =>
        language === 'en'
          ? `How reliable is ${brandName ?? 'this company'}?`
          : `כמה אפשר לסמוך על ${brandName ?? 'החברה הזו'}?`,
      intent: 'brand',
      score: 80,
    },
    {
      text: ({ brandName, language }) =>
        language === 'en'
          ? `What are the pros and cons of ${brandName ?? 'this brand'}?`
          : `מה היתרונות והחסרונות של ${brandName ?? 'המותג הזה'}?`,
      intent: 'comparison',
      score: 78,
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════
  // INFORMATIONAL / PROFESSIONAL TOPIC
  // (Limited seeds — only track questions with real authority value)
  // ══════════════════════════════════════════════════════════════════════════
  informational: [
    { text: () => 'מה חשוב לדעת על שיווק דיגיטלי לעסק?',        intent: 'informational', score: 75 },
    { text: () => 'איך עובד אלגוריתם גוגל?',                      intent: 'informational', score: 73 },
    { text: () => 'מה ההבדל בין SEO טכני לתוכן?',                 intent: 'informational', score: 72 },
    {
      text: ({ language }) =>
        language === 'en' ? 'What is the difference between SEO and paid search?' : null,
      intent: 'informational',
      score: 73,
    },
  ],
}

// ============================================================================
// SEED RESOLUTION
// ============================================================================

type ServiceTopic = keyof KeywordResearchSeedBank['service']
type ProductTopic = keyof KeywordResearchSeedBank['product']
type ChannelTopic = keyof KeywordResearchSeedBank['marketing_channel']

const KEYWORD_TOPIC_TO_SERVICE_KEY: Partial<Record<KeywordTopic, ServiceTopic>> = {
  seo:                  'seo',
  local_seo:            'local_seo',
  web_dev:              'web_dev',
  office_cleaning:      'cleaning',
  building_cleaning:    'cleaning',
  residential_cleaning: 'cleaning',
  home_improvement:     'home_improvement',
  florist_product:      'florist',
  lawyers:              'legal',
  doctors:              'medical',
  content_marketing:    'content_marketing',
  email_marketing:      'email_marketing',
  social_media:         'social_management',
}

const KEYWORD_TOPIC_TO_PRODUCT_KEY: Partial<Record<KeywordTopic, ProductTopic>> = {
  fashion:          'fashion',
  sports_product:   'sports_product',
  perfume_product:  'perfume_product',
  florist_product:  'florist_product',
}

const KEYWORD_TOPIC_TO_CHANNEL_KEY: Partial<Record<KeywordTopic, ChannelTopic>> = {
  google_ads:    'google_ads',
  facebook_ads:  'facebook_ads',
  instagram_ads: 'instagram_ads',
  paid_ads:      'paid_ads',
  social_media:  'social_media',
}

/**
 * Resolve the best seeds for a given keyword analysis result.
 *
 * Priority:
 *   1. Topic-specific seeds for the keyword's identified topics
 *   2. keywordType common seeds as fallback
 *
 * Returns seeds in score-descending order.
 * At most `maxSeeds` are returned (default 8).
 */
export function resolveSeedsForKeyword(
  keywordType: KeywordType,
  topics: KeywordTopic[],
  ctx: KRSeedContext,
  maxSeeds = 8,
): Array<{ text: string; intent: KeywordResearchSeed['intent']; score: number }> {
  const candidates: KeywordResearchSeed[] = []

  if (keywordType === 'marketing_channel') {
    for (const topic of topics) {
      const key = KEYWORD_TOPIC_TO_CHANNEL_KEY[topic]
      if (key) {
        candidates.push(...keywordResearchSeeds.marketing_channel[key])
      }
    }
    // If no specific topic matched, fall back to paid_ads
    if (candidates.length === 0) {
      candidates.push(...keywordResearchSeeds.marketing_channel.paid_ads)
    }
  } else if (keywordType === 'service') {
    for (const topic of topics) {
      const key = KEYWORD_TOPIC_TO_SERVICE_KEY[topic]
      if (key) {
        candidates.push(...keywordResearchSeeds.service[key])
      }
    }
    if (candidates.length === 0) {
      candidates.push(...keywordResearchSeeds.service.common)
    }
  } else if (keywordType === 'product') {
    for (const topic of topics) {
      const key = KEYWORD_TOPIC_TO_PRODUCT_KEY[topic]
      if (key) {
        candidates.push(...keywordResearchSeeds.product[key])
      }
    }
    if (candidates.length === 0) {
      candidates.push(...keywordResearchSeeds.product.common)
    }
  } else if (keywordType === 'brand') {
    candidates.push(...keywordResearchSeeds.brand)
  } else if (keywordType === 'informational' || keywordType === 'professional_topic') {
    candidates.push(...keywordResearchSeeds.informational)
  }
  // irrelevant: no candidates

  // Render each seed with the context, filter nulls, sort by score, deduplicate
  const seen = new Set<string>()
  const resolved: Array<{ text: string; intent: KeywordResearchSeed['intent']; score: number }> = []

  const sorted = [...candidates].sort((a, b) => b.score - a.score)

  for (const seed of sorted) {
    if (resolved.length >= maxSeeds) break
    const text = seed.text(ctx)
    if (!text) continue
    const key = text.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    resolved.push({ text, intent: seed.intent, score: seed.score })
  }

  return resolved
}
