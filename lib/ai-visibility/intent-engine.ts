/**
 * Smart Questions vNext — Intent Recommendation Engine
 *
 * Architectural principle:
 *   Keywords are SIGNALS for topic inference, NEVER source material for templates.
 *
 * Flow:
 *   1. Infer topic clusters from keywords (SEO, GoogleAds, ecommerce, etc.)
 *   2. Select curated question seeds matching category + topics
 *   3. Apply a final strict quality gate
 *   4. Return 4–8 realistic questions (no padding, no quota)
 *
 * Never:
 *   - Wraps a keyword into a template
 *   - Combines multiple keywords
 *   - Fills quotas with weak questions
 *   - Uses generic placeholders ("שירות כזה", "חברת סוכנות")
 */

import type { PromptIntent, BusinessCategory, PromptSuggestion } from './prompt-templates'

// ============================================================================
// TOPIC CLUSTERS — derived from keywords as signals, never copied into output
// ============================================================================

export type TopicCluster =
  | 'seo'
  | 'google_ads'
  | 'facebook_ads'
  | 'instagram_ads'
  | 'social_media'
  | 'web_dev'
  | 'ecommerce'
  | 'shopify'
  | 'local_seo'
  | 'doctors'
  | 'lawyers'
  | 'small_business'
  | 'content_marketing'
  | 'email_marketing'
  | 'price_sensitive'

interface TopicSignal {
  cluster: TopicCluster
  patterns: RegExp
}

const TOPIC_SIGNALS: TopicSignal[] = [
  { cluster: 'seo', patterns: /(קידום\s*אתר|קידום\s*אורגני|seo|אורגני)/i },
  { cluster: 'google_ads', patterns: /(google\s*ads|גוגל\s*אדס|פרסום\s*ממומן\s*בגוגל|adwords|ניהול\s*קמפיינים)/i },
  { cluster: 'facebook_ads', patterns: /(פייסבוק|facebook\s*ads|קמפיין\s*בפייסבוק|לידים\s*בפייסבוק)/i },
  { cluster: 'instagram_ads', patterns: /(אינסטגרם|instagram|insta)/i },
  { cluster: 'social_media', patterns: /(סושיאל|רשתות\s*חברתיות|social\s*media)/i },
  { cluster: 'web_dev', patterns: /(בניית\s*אתר|בניית\s*אתרים|פיתוח\s*אתר|web\s*dev|website\s*build)/i },
  { cluster: 'ecommerce', patterns: /(חנות\s*אונליין|ecommerce|e-commerce|מסחר\s*אלקטרוני|חנות\s*וירטואלית)/i },
  { cluster: 'shopify', patterns: /(שופיפיי|shopify)/i },
  { cluster: 'local_seo', patterns: /(קידום\s*מקומי|local\s*seo|local\s*business|גוגל\s*מפות|google\s*maps|קידום\s*(ב)?גוגל\s*מפות|לוקאל)/i },
  { cluster: 'doctors', patterns: /(רופא|רופאים|דנטל|רפואי|doctors?|dental)/i },
  { cluster: 'lawyers', patterns: /(עורכי?\s*דין|משפט|lawyers?|legal)/i },
  { cluster: 'small_business', patterns: /(עסק\s*קטן|small\s*business|smb)/i },
  { cluster: 'content_marketing', patterns: /(שיווק\s*תוכן|content\s*marketing|בלוג)/i },
  { cluster: 'email_marketing', patterns: /(שיווק\s*במייל|email\s*marketing|דיוור)/i },
  { cluster: 'price_sensitive', patterns: /(כמה\s*עולה|מחיר|עלות|תקציב|זול|הצעת\s*מחיר)/i },
]

function inferTopicClusters(keywords: string[]): Set<TopicCluster> {
  const topics = new Set<TopicCluster>()
  for (const kw of keywords) {
    if (!kw) continue
    for (const sig of TOPIC_SIGNALS) {
      if (sig.patterns.test(kw)) {
        topics.add(sig.cluster)
      }
    }
  }
  return topics
}

// ============================================================================
// QUESTION SEEDS — curated, realistic questions per category and topic
// Each seed has conditions for when it should appear
// ============================================================================

interface QuestionSeed {
  text: (ctx: SeedContext) => string | null
  intent: PromptIntent
  // Topics that activate this seed. Empty = always available for category.
  requiresAnyTopic?: TopicCluster[]
  requiresAllTopics?: TopicCluster[]
  requiresLocation?: boolean
  requiresBusinessName?: boolean
  // Categories this seed applies to. Empty = all.
  categories?: BusinessCategory[]
  // If true, this seed only appears when no topic-specific seeds matched
  fallbackOnly?: boolean
  score: number
}

interface SeedContext {
  businessName: string | null
  city: string | null
  country: string
  language: 'he' | 'en'
  topics: Set<TopicCluster>
}

// ----------------------------------------------------------------------------
// SEO Agency seeds
// ----------------------------------------------------------------------------
const AGENCY_SEEDS_HE: QuestionSeed[] = [
  // ── Tier 1: high-intent selection and pricing (92–90) ────────────────────
  {
    text: () => 'איך לבחור חברת SEO?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 92,
  },
  {
    text: () => 'כמה עולה ניהול Google Ads?',
    intent: 'commercial',
    requiresAnyTopic: ['google_ads'],
    categories: ['agency'],
    score: 92,
  },
  {
    // "לעסק" is more conversational than "בישראל" — business owners search this way
    text: () => 'כמה עולה קידום אתרים לעסק?',
    intent: 'commercial',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 90,
  },
  // ── Tier 2: comparison and vertical selection (89) ────────────────────────
  {
    text: () => 'מה עדיף — SEO או Google Ads?',
    intent: 'comparison',
    requiresAllTopics: ['seo', 'google_ads'],
    categories: ['agency'],
    score: 89,
  },
  {
    // Natural Hebrew for ecommerce/Shopify signal — avoids hybrid "ecommerce" phrasing
    text: () => 'איך לבחור חברה לקידום חנות אונליין?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['ecommerce', 'shopify'],
    categories: ['agency'],
    score: 89,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['agency'],
    score: 89,
  },
  // ── Tier 3: specialized selection, evaluation, recommendation (88–87) ────
  {
    // Activated by explicit Google Maps / local SEO keyword signal
    text: () => 'איך לבחור חברה לקידום בגוגל מפות?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['local_seo'],
    categories: ['agency'],
    score: 88,
  },
  {
    // Shopify-specific recommendation — fires when shopify topic is detected
    text: () => 'מי מומלץ לקידום אתר שופיפיי?',
    intent: 'recommendation',
    requiresAnyTopic: ['shopify'],
    categories: ['agency'],
    score: 88,
  },
  {
    // Real business-owner question — freelancer vs. full agency
    text: () => 'האם עדיף פרילנסר SEO או חברת קידום?',
    intent: 'comparison',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 87,
  },
  {
    // Campaign selection — "קמפיינים" phrasing targets campaign-focused projects
    text: () => 'איך לבחור חברה לניהול קמפיינים בגוגל?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['google_ads'],
    categories: ['agency'],
    score: 87,
  },
  {
    // Google Maps optimization — how to improve (not just who to hire)
    text: () => 'איך משפרים דירוג בגוגל מפות?',
    intent: 'informational',
    requiresAnyTopic: ['local_seo'],
    categories: ['agency'],
    score: 87,
  },
  {
    // Facebook campaign selection — mirrors Google Ads selection
    text: () => 'איך לבחור חברה לניהול קמפיינים בפייסבוק?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['facebook_ads'],
    categories: ['agency'],
    score: 87,
  },
  {
    // SEO quality evaluation — business owner checking existing agency's performance
    text: () => 'איך יודעים אם חברת SEO עושה עבודה טובה?',
    intent: 'informational',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 86,
  },
  {
    // Ecommerce optimization — "אתר מכירות" is natural Hebrew for sales site
    text: () => 'איך מקדמים אתר מכירות בגוגל?',
    intent: 'informational',
    requiresAnyTopic: ['ecommerce', 'shopify'],
    categories: ['agency'],
    score: 86,
  },
  // ── Tier 4: acceptable alternatives — shown when pool is thin (85–82) ────
  {
    // Google Maps diagnostic — frustration-driven search, maps to informational intent
    text: () => 'למה העסק לא מופיע בגוגל מפות?',
    intent: 'informational',
    requiresAnyTopic: ['local_seo'],
    categories: ['agency'],
    score: 85,
  },
  {
    // Google Ads minimum budget — pricing question for new advertisers
    text: () => 'מה תקציב מינימלי לקמפיין Google Ads?',
    intent: 'commercial',
    requiresAnyTopic: ['google_ads'],
    categories: ['agency'],
    score: 85,
  },
  {
    // Ecommerce pricing — "כמה עולה" for online store promotion
    text: () => 'כמה עולה קידום חנות אונליין?',
    intent: 'commercial',
    requiresAnyTopic: ['ecommerce', 'shopify'],
    categories: ['agency'],
    score: 85,
  },
  {
    // Cross-channel comparison — requires both ads signals to fire
    text: () => 'מה עדיף לעסק — פרסום בגוגל או בפייסבוק?',
    intent: 'comparison',
    requiresAllTopics: ['google_ads', 'facebook_ads'],
    categories: ['agency'],
    score: 85,
  },
  {
    text: () => 'אילו חברות SEO מומלצות בישראל?',
    intent: 'recommendation',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 84,
  },
  {
    text: (ctx) => ctx.city ? `אילו חברות SEO מומלצות ב${ctx.city}?` : null,
    intent: 'local',
    requiresAnyTopic: ['seo'],
    requiresLocation: true,
    categories: ['agency'],
    score: 84,
  },
  {
    text: () => 'איך לבחור חברה לניהול Google Ads?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['google_ads'],
    categories: ['agency'],
    score: 84,
  },
  {
    // Local SEO broad — "עסק מקומי" (local business) is natural phrasing
    text: () => 'איך מקדמים עסק מקומי בגוגל?',
    intent: 'informational',
    requiresAnyTopic: ['local_seo'],
    categories: ['agency'],
    score: 84,
  },
  {
    text: () => 'כמה עולה קמפיין לידים בפייסבוק?',
    intent: 'commercial',
    requiresAnyTopic: ['facebook_ads'],
    categories: ['agency'],
    score: 83,
  },
  {
    text: () => 'איך לבחור חברה לקידום אתרים לעסק קטן?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['seo', 'small_business'],
    categories: ['agency'],
    score: 84,
  },
  {
    text: () => 'כמה זמן לוקח לראות תוצאות מ-SEO?',
    intent: 'informational',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 82,
  },
]

// ----------------------------------------------------------------------------
// Sports store seeds
// ----------------------------------------------------------------------------
const SPORTS_STORE_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה הליכון ביתי?',
    intent: 'commercial',
    categories: ['sports_store'],
    score: 90,
  },
  {
    text: () => 'חוות דעת על הליכון ביתי',
    intent: 'pre_purchase',
    categories: ['sports_store'],
    score: 88,
  },
  {
    text: () => 'איזה משקולות יד מומלצות לבית?',
    intent: 'recommendation',
    categories: ['sports_store'],
    score: 87,
  },
  {
    text: () => 'מה ההבדל בין הליכון מכני לחשמלי?',
    intent: 'comparison',
    categories: ['sports_store'],
    score: 85,
  },
  {
    text: () => 'איך לבחור ציוד כושר לבית?',
    intent: 'pre_purchase',
    categories: ['sports_store'],
    score: 86,
  },
  {
    text: (ctx) => ctx.city ? `איפה אפשר לקנות ציוד כושר ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['sports_store'],
    score: 84,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['sports_store'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// Florist seeds
// ----------------------------------------------------------------------------
const FLORIST_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה זר ורדים?',
    intent: 'commercial',
    categories: ['florist'],
    score: 90,
  },
  {
    text: (ctx) => ctx.city ? `משלוח פרחים בחצי שעה ב${ctx.city}?` : 'משלוח פרחים מהיר באזור שלי?',
    intent: 'local',
    categories: ['florist'],
    score: 88,
  },
  {
    text: () => 'אילו פרחים מתאימים למתנה ליולדת?',
    intent: 'recommendation',
    categories: ['florist'],
    score: 86,
  },
  {
    text: () => 'מה הזר המתאים ביותר לאירוע?',
    intent: 'recommendation',
    categories: ['florist'],
    score: 84,
  },
  {
    text: () => 'איך לבחור חנות פרחים אמינה?',
    intent: 'pre_purchase',
    categories: ['florist'],
    score: 83,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['florist'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// Generic ecommerce seeds (for product-focused businesses)
// ----------------------------------------------------------------------------
const ECOMMERCE_SEEDS_HE: QuestionSeed[] = [
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['ecommerce', 'product_brand', 'perfume', 'appliance_store', 'gifts'],
    score: 82,
  },
  {
    text: () => 'איך יודעים אם אתר קניות אמין?',
    intent: 'pre_purchase',
    categories: ['ecommerce'],
    score: 88,
  },
  {
    text: () => 'איפה כדאי לקנות אונליין?',
    intent: 'recommendation',
    categories: ['ecommerce'],
    score: 87,
  },
  {
    text: () => 'איך לבחור חנות אונליין אמינה?',
    intent: 'pre_purchase',
    categories: ['ecommerce'],
    score: 86,
  },
  {
    text: () => 'כמה זמן לוקח משלוח מהחנות?',
    intent: 'informational',
    categories: ['ecommerce'],
    score: 84,
  },
  {
    text: () => 'האם כדאי להזמין מהחנות הזו?',
    intent: 'pre_purchase',
    categories: ['ecommerce'],
    score: 83,
  },
]

// ----------------------------------------------------------------------------
// Legal seeds
// ----------------------------------------------------------------------------
const LEGAL_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'איך לבחור עורך דין?',
    intent: 'pre_purchase',
    categories: ['legal'],
    score: 88,
  },
  {
    text: () => 'כמה עולה ייעוץ משפטי ראשוני?',
    intent: 'commercial',
    categories: ['legal'],
    score: 86,
  },
  {
    text: (ctx) => ctx.city ? `אילו עורכי דין מומלצים ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['legal'],
    score: 84,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['legal'],
    score: 80,
  },
]

// ----------------------------------------------------------------------------
// Healthcare seeds
// ----------------------------------------------------------------------------
const HEALTHCARE_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'איך לבחור רופא טוב?',
    intent: 'pre_purchase',
    categories: ['healthcare'],
    score: 88,
  },
  {
    text: (ctx) => ctx.city ? `אילו רופאים מומלצים ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['healthcare'],
    score: 86,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['healthcare'],
    score: 80,
  },
]

// Add fallback seeds to agency that don't require topics
const AGENCY_FALLBACK_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'איך לבחור חברת דיגיטל מומלצת?',
    intent: 'pre_purchase',
    categories: ['agency'],
    fallbackOnly: true,
    score: 85,
  },
  {
    text: () => 'כמה עולה שירות דיגיטל לעסק קטן?',
    intent: 'commercial',
    categories: ['agency'],
    fallbackOnly: true,
    score: 83,
  },
  {
    text: () => 'מה השירותים שחברת דיגיטל אמורה להציע?',
    intent: 'informational',
    categories: ['agency'],
    fallbackOnly: true,
    score: 81,
  },
]

// ----------------------------------------------------------------------------
// Cleaning services seeds
// ----------------------------------------------------------------------------
const CLEANING_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה שירות ניקיון לדירה?',
    intent: 'commercial',
    categories: ['cleaning'],
    score: 90,
  },
  {
    text: () => 'איך לבחור חברת ניקיון אמינה?',
    intent: 'pre_purchase',
    categories: ['cleaning'],
    score: 88,
  },
  {
    text: () => 'כמה זמן לוקח ניקיון דירה בגודל בינוני?',
    intent: 'informational',
    categories: ['cleaning'],
    score: 85,
  },
  {
    text: () => 'מה כלול בשירות ניקיון עמוק?',
    intent: 'informational',
    categories: ['cleaning'],
    score: 84,
  },
  {
    text: (ctx) => ctx.city ? `איפה למצוא חברת ניקיון טובה ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['cleaning'],
    score: 86,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['cleaning'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// Perfume shop seeds
// ----------------------------------------------------------------------------
const PERFUME_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה בושם איכותי?',
    intent: 'commercial',
    categories: ['perfume'],
    score: 90,
  },
  {
    text: () => 'איך לבחור בושם שמתאים לי?',
    intent: 'pre_purchase',
    categories: ['perfume'],
    score: 88,
  },
  {
    text: () => 'מה ההבדל בין EDP ל-EDT?',
    intent: 'informational',
    categories: ['perfume'],
    score: 86,
  },
  {
    text: () => 'אילו בושמים מומלצים לנשים?',
    intent: 'recommendation',
    categories: ['perfume'],
    score: 85,
  },
  {
    text: () => 'איך לדעת אם בושם אמיתי או מזויף?',
    intent: 'informational',
    categories: ['perfume'],
    score: 84,
  },
  {
    text: (ctx) => ctx.city ? `איפה אפשר לקנות בושם מקורי ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['perfume'],
    score: 86,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['perfume'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// Gift shop seeds
// ----------------------------------------------------------------------------
const GIFT_SHOP_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה מתנה טובה לחברה?',
    intent: 'commercial',
    categories: ['gifts'],
    score: 90,
  },
  {
    text: () => 'איזו מתנה מתאימה לגברים?',
    intent: 'recommendation',
    categories: ['gifts'],
    score: 87,
  },
  {
    text: () => 'מה מתנות טובות ליום הולדת?',
    intent: 'recommendation',
    categories: ['gifts'],
    score: 86,
  },
  {
    text: () => 'איך לבחור מתנה למי שיש לו הכל?',
    intent: 'pre_purchase',
    categories: ['gifts'],
    score: 85,
  },
  {
    text: () => 'איפה למצוא מתנה מקורית וטובה?',
    intent: 'informational',
    categories: ['gifts'],
    score: 83,
  },
  {
    text: (ctx) => ctx.city ? `איפה אפשר לקנות מתנות ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['gifts'],
    score: 84,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['gifts'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// Appliance store seeds
// ----------------------------------------------------------------------------
const APPLIANCE_STORE_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה מכונת כביסה טובה?',
    intent: 'commercial',
    categories: ['appliance_store'],
    score: 90,
  },
  {
    text: () => 'איזו מכונת כביסה כדאי לקנות?',
    intent: 'recommendation',
    categories: ['appliance_store'],
    score: 88,
  },
  {
    text: () => 'מה ההבדל בין טופלודר לחזיתית?',
    intent: 'comparison',
    categories: ['appliance_store'],
    score: 86,
  },
  {
    text: () => 'איך לבחור דודי שמש איכותי?',
    intent: 'pre_purchase',
    categories: ['appliance_store'],
    score: 85,
  },
  {
    text: () => 'מה קירור האוויר הטוב ביותר?',
    intent: 'recommendation',
    categories: ['appliance_store'],
    score: 84,
  },
  {
    text: (ctx) => ctx.city ? `איפה אפשר לקנות מכשירי חשמל ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['appliance_store'],
    score: 84,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['appliance_store'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// Restaurant seeds
// ----------------------------------------------------------------------------
const RESTAURANT_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה ארוחת ערב באיכות?',
    intent: 'commercial',
    categories: ['restaurant'],
    score: 90,
  },
  {
    text: () => 'מה מסעדות מומלצות לאירוע?',
    intent: 'recommendation',
    categories: ['restaurant'],
    score: 88,
  },
  {
    text: () => 'איך לבחור מסעדה לתאריך רומנטי?',
    intent: 'pre_purchase',
    categories: ['restaurant'],
    score: 86,
  },
  {
    text: () => 'כמה זמן מחכים על שולחן במסעדה?',
    intent: 'informational',
    categories: ['restaurant'],
    score: 83,
  },
  {
    text: () => 'איפה המסעדה הכשרה הטובה ביותר?',
    intent: 'local',
    categories: ['restaurant'],
    score: 85,
  },
  {
    text: (ctx) => ctx.city ? `מסעדות כשרות טובות ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['restaurant'],
    score: 86,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['restaurant'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// Beauty salon seeds
// ----------------------------------------------------------------------------
const BEAUTY_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה טיפול פנים במקום טוב?',
    intent: 'commercial',
    categories: ['beauty'],
    score: 90,
  },
  {
    text: () => 'איך לבחור מכון יופי אמין?',
    intent: 'pre_purchase',
    categories: ['beauty'],
    score: 88,
  },
  {
    text: () => 'מה קרם הלילה הטוב ביותר לעור בעייתי?',
    intent: 'recommendation',
    categories: ['beauty'],
    score: 86,
  },
  {
    text: () => 'מה ההבדל בין קריומורזיה וחוטים?',
    intent: 'informational',
    categories: ['beauty'],
    score: 85,
  },
  {
    text: () => 'איזו טיפול הוא הטוב ביותר לעור?',
    intent: 'comparison',
    categories: ['beauty'],
    score: 84,
  },
  {
    text: (ctx) => ctx.city ? `איפה אפשר לעשות בוטוקס ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['beauty'],
    score: 86,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['beauty'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// Local service professional seeds (consultants, advisors, etc.)
// ----------------------------------------------------------------------------
const LOCAL_SERVICE_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה יעוץ עסקי?',
    intent: 'commercial',
    categories: ['local_service'],
    score: 88,
  },
  {
    text: () => 'איך לבחור יועץ טוב?',
    intent: 'pre_purchase',
    categories: ['local_service'],
    score: 88,
  },
  {
    text: () => 'מה השירותים של יועץ עסקי?',
    intent: 'informational',
    categories: ['local_service'],
    score: 84,
  },
  {
    text: (ctx) => ctx.city ? `איפה למצוא יועץ טוב ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['local_service'],
    score: 85,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['local_service'],
    score: 80,
  },
]

// ----------------------------------------------------------------------------
// Home improvement service seeds
// ----------------------------------------------------------------------------
const HOME_IMPROVEMENT_SERVICE_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה שיפוץ דירה?',
    intent: 'commercial',
    categories: ['home_improvement_service'],
    score: 90,
  },
  {
    text: () => 'איך לבחור קבלן בנייה אמין?',
    intent: 'pre_purchase',
    categories: ['home_improvement_service'],
    score: 88,
  },
  {
    text: () => 'מה הצעות קבלנים מומלצות?',
    intent: 'recommendation',
    categories: ['home_improvement_service'],
    score: 86,
  },
  {
    text: () => 'איך לתכנן שיפוץ דירה כראוי?',
    intent: 'informational',
    categories: ['home_improvement_service'],
    score: 84,
  },
  {
    text: () => 'כמה זמן לוקח שיפוץ דירה?',
    intent: 'informational',
    categories: ['home_improvement_service'],
    score: 82,
  },
  {
    text: (ctx) => ctx.city ? `איפה למצוא קבלנים טובים ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['home_improvement_service'],
    score: 85,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['home_improvement_service'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// SaaS/Software seeds
// ----------------------------------------------------------------------------
const SAAS_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'כמה עולה SaaS טובה?',
    intent: 'commercial',
    categories: ['saas'],
    score: 88,
  },
  {
    text: () => 'איזו SaaS בוחרים חברות ישראליות?',
    intent: 'recommendation',
    categories: ['saas'],
    score: 86,
  },
  {
    text: () => 'מה עדיף — SaaS או תוכנה מותקנת?',
    intent: 'comparison',
    categories: ['saas'],
    score: 85,
  },
  {
    text: () => 'איך לבחור כלי SaaS לעסק?',
    intent: 'pre_purchase',
    categories: ['saas'],
    score: 85,
  },
  {
    text: () => 'מה היתרונות של SaaS?',
    intent: 'informational',
    categories: ['saas'],
    score: 82,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['saas'],
    score: 80,
  },
]

// ----------------------------------------------------------------------------
// Second-hand fashion seeds
// ----------------------------------------------------------------------------
const SECOND_HAND_FASHION_SEEDS_HE: QuestionSeed[] = [
  {
    text: () => 'איפה כדאי לקנות בגדי יד שנייה?',
    intent: 'recommendation',
    categories: ['second_hand_fashion'],
    score: 88,
  },
  {
    text: () => 'איך יודעים אם בגד יד שנייה במצב טוב?',
    intent: 'pre_purchase',
    categories: ['second_hand_fashion'],
    score: 87,
  },
  {
    text: () => 'מה המחירים בחנויות יד שנייה?',
    intent: 'commercial',
    categories: ['second_hand_fashion'],
    score: 86,
  },
  {
    text: () => 'האם משתלם לקנות בגדי יד שנייה?',
    intent: 'informational',
    categories: ['second_hand_fashion'],
    score: 85,
  },
  {
    text: (ctx) => ctx.city ? `איפה כדאי לקנות בגדי יד שנייה ב${ctx.city}?` : null,
    intent: 'local',
    requiresLocation: true,
    categories: ['second_hand_fashion'],
    score: 84,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['second_hand_fashion'],
    score: 78,
  },
]

// ----------------------------------------------------------------------------
// English agency seeds (simple, curated)
// ----------------------------------------------------------------------------
const AGENCY_SEEDS_EN: QuestionSeed[] = [
  {
    text: () => 'How to choose an SEO agency?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 90,
  },
  {
    text: () => 'How much does SEO cost?',
    intent: 'commercial',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 88,
  },
  {
    text: () => 'How long does SEO take to show results?',
    intent: 'informational',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 86,
  },
  {
    text: () => 'How much does Google Ads management cost?',
    intent: 'commercial',
    requiresAnyTopic: ['google_ads'],
    categories: ['agency'],
    score: 88,
  },
  {
    text: () => 'How to choose a Google Ads agency?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['google_ads'],
    categories: ['agency'],
    score: 86,
  },
  {
    text: () => 'What is a digital marketing agency?',
    intent: 'informational',
    categories: ['agency'],
    score: 84,
  },
]

// ----------------------------------------------------------------------------
// All Hebrew seeds combined
// ----------------------------------------------------------------------------
const ALL_SEEDS_HE: QuestionSeed[] = [
  ...AGENCY_SEEDS_HE,
  ...AGENCY_FALLBACK_SEEDS_HE,
  ...SPORTS_STORE_SEEDS_HE,
  ...FLORIST_SEEDS_HE,
  ...ECOMMERCE_SEEDS_HE,
  ...LEGAL_SEEDS_HE,
  ...HEALTHCARE_SEEDS_HE,
  ...CLEANING_SEEDS_HE,
  ...PERFUME_SEEDS_HE,
  ...GIFT_SHOP_SEEDS_HE,
  ...APPLIANCE_STORE_SEEDS_HE,
  ...RESTAURANT_SEEDS_HE,
  ...BEAUTY_SEEDS_HE,
  ...LOCAL_SERVICE_SEEDS_HE,
  ...HOME_IMPROVEMENT_SERVICE_SEEDS_HE,
  ...SAAS_SEEDS_HE,
  ...SECOND_HAND_FASHION_SEEDS_HE,
]

// ============================================================================
// QUALITY GATE — strict final check before emitting any question
// ============================================================================

const HE_BANNED_PATTERNS: RegExp[] = [
  /חברת\s*סוכנות/,                       // generic placeholder
  /שירות\s*כזה/,                         // generic placeholder
  /איזה\s*ספק\s*מומלץ\s*לכמה/,           // intent mix nonsense
  /כמה\s*עולה.*כמה/,                     // keyword duplication
  /חוות\s*דעת\s*על\s*(פרסום|קמפיין|הצעה)/, // review of abstract concept
  /מה\s*דעות\s*על/,                      // unnatural Hebrew
  /מה\s*היכולות\s*של/,                   // unnatural Hebrew
  /מה\s*חלופות\s*טובות/,                 // unnatural Hebrew
  /מי\s*מומלץ\s*עבור/,                   // unnatural Hebrew
  /או\s*חלופות\s*אחרות/,                 // unnatural Hebrew
]

function passesQualityGate(question: string, language: 'he' | 'en'): { ok: boolean; reason?: string } {
  if (!question || question.length < 8) {
    return { ok: false, reason: 'too_short' }
  }
  if (question.length > 120) {
    return { ok: false, reason: 'too_long' }
  }
  if (/\s\s+/.test(question)) {
    return { ok: false, reason: 'double_space' }
  }
  if (language === 'he') {
    for (const pattern of HE_BANNED_PATTERNS) {
      if (pattern.test(question)) {
        return { ok: false, reason: `banned_pattern:${pattern.source}` }
      }
    }
  }
  return { ok: true }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface IntentEngineContext {
  businessName: string | null
  businessCategory: BusinessCategory
  language: 'he' | 'en'
  country?: string | null
  city?: string | null
  keywords?: string[]
}

export interface IntentEngineQuestion {
  prompt: string
  intent: PromptIntent
  score: number
}

/**
 * Generate Smart Questions using the intent recommendation engine.
 *
 * Returns 4–8 realistic search questions. No padding, no quota.
 * Questions are seeded from category/topic, never wrapped from keywords.
 */
export function generateIntentQuestions(ctx: IntentEngineContext): IntentEngineQuestion[] {
  const language = ctx.language === 'en' ? 'en' : 'he'

  const topics = inferTopicClusters(ctx.keywords || [])

  const seedCtx: SeedContext = {
    businessName: ctx.businessName,
    city: ctx.city || null,
    country: ctx.country || 'IL',
    language,
    topics,
  }

  const results: IntentEngineQuestion[] = []
  const topicSeedMatches: IntentEngineQuestion[] = []  // seeds with topic requirements
  const otherMatches: IntentEngineQuestion[] = []      // seeds without topic requirements
  const fallbackMatches: IntentEngineQuestion[] = []   // fallback-only seeds
  const seenNormalized = new Set<string>()

  // Select seed pool based on language
  const seedPool = language === 'en' ? AGENCY_SEEDS_EN : ALL_SEEDS_HE

  for (const seed of seedPool) {
    // Category filter
    if (seed.categories && !seed.categories.includes(ctx.businessCategory)) continue

    // Requirements
    if (seed.requiresBusinessName && !seedCtx.businessName) continue
    if (seed.requiresLocation && !seedCtx.city) continue

    // Topic requirements
    const hasTopicRequirements = (seed.requiresAnyTopic && seed.requiresAnyTopic.length > 0) ||
                                  (seed.requiresAllTopics && seed.requiresAllTopics.length > 0)

    if (seed.requiresAnyTopic && seed.requiresAnyTopic.length > 0) {
      const hasAny = seed.requiresAnyTopic.some((t) => topics.has(t))
      if (!hasAny) continue
    }
    if (seed.requiresAllTopics && seed.requiresAllTopics.length > 0) {
      const hasAll = seed.requiresAllTopics.every((t) => topics.has(t))
      if (!hasAll) continue
    }

    const text = seed.text(seedCtx)
    if (!text) continue

    const gate = passesQualityGate(text, language)
    if (!gate.ok) continue

    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!]+$/, '')
    if (seenNormalized.has(normalized)) continue
    seenNormalized.add(normalized)

    const question = { prompt: text, intent: seed.intent, score: seed.score }

    if (seed.fallbackOnly === true) {
      fallbackMatches.push(question)
    } else if (hasTopicRequirements) {
      topicSeedMatches.push(question)
    } else {
      otherMatches.push(question)
    }
  }

  // Fallback seeds only appear when no meaningful topics were inferred from keywords.
  // If any seed with explicit topic requirements matched, the project has meaningful signals.
  // If no topics were inferred, show fallback seeds even if other seeds (like brand review) matched.
  const hasInferredTopics = topics.size > 0

  if (topicSeedMatches.length > 0) {
    // Topics detected: use topic-specific seeds plus other non-fallback seeds
    results.push(...topicSeedMatches, ...otherMatches)
  } else if (!hasInferredTopics && fallbackMatches.length > 0) {
    // No topics detected: include fallback seeds
    results.push(...otherMatches, ...fallbackMatches)
  } else {
    // No topics, but fallback seeds unavailable: use other matches (e.g. brand review)
    results.push(...otherMatches)
  }

  // Sort by score descending, return up to 20 so callers have a larger
  // candidate pool (e.g. for "generate more" refresh cycles).
  // Display truncation is enforced by the caller via the limit parameter.
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 20)
}

/**
 * Debug helper: returns the inferred topics for a set of keywords.
 * Exposed so callers / tests can log what topics drove generation.
 */
export function debugInferTopics(keywords: string[]): TopicCluster[] {
  return Array.from(inferTopicClusters(keywords))
}
