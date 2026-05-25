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
  { cluster: 'local_seo', patterns: /(קידום\s*מקומי|local\s*seo|local\s*business)/i },
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
  {
    text: () => 'איך לבחור חברת SEO?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 92,
  },
  {
    text: () => 'כמה עולה קידום אתרים בישראל?',
    intent: 'commercial',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 90,
  },
  {
    text: () => 'כמה זמן לוקח לראות תוצאות מ-SEO?',
    intent: 'informational',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 88,
  },
  {
    text: () => 'אילו חברות SEO מומלצות בישראל?',
    intent: 'recommendation',
    requiresAnyTopic: ['seo'],
    categories: ['agency'],
    score: 90,
  },
  {
    text: (ctx) => ctx.city ? `אילו חברות SEO מומלצות ב${ctx.city}?` : null,
    intent: 'local',
    requiresAnyTopic: ['seo'],
    requiresLocation: true,
    categories: ['agency'],
    score: 88,
  },
  {
    text: () => 'כמה עולה ניהול Google Ads?',
    intent: 'commercial',
    requiresAnyTopic: ['google_ads'],
    categories: ['agency'],
    score: 92,
  },
  {
    text: () => 'איך לבחור חברה לניהול Google Ads?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['google_ads'],
    categories: ['agency'],
    score: 88,
  },
  {
    text: () => 'מה עדיף — SEO או Google Ads?',
    intent: 'comparison',
    requiresAllTopics: ['seo', 'google_ads'],
    categories: ['agency'],
    score: 89,
  },
  {
    text: () => 'כמה עולה קמפיין לידים בפייסבוק?',
    intent: 'commercial',
    requiresAnyTopic: ['facebook_ads'],
    categories: ['agency'],
    score: 88,
  },
  {
    text: () => 'איך לבחור חברה לקידום אתרים לעסק קטן?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['seo', 'small_business'],
    categories: ['agency'],
    score: 86,
  },
  {
    text: () => 'איך לבחור חברה לבניית אתרי ecommerce?',
    intent: 'pre_purchase',
    requiresAnyTopic: ['ecommerce', 'shopify'],
    categories: ['agency'],
    score: 87,
  },
  {
    text: (ctx) => ctx.businessName ? `חוות דעת על ${ctx.businessName}` : null,
    intent: 'brand',
    requiresBusinessName: true,
    categories: ['agency'],
    score: 89,
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

// ----------------------------------------------------------------------------
// All Hebrew seeds combined
// ----------------------------------------------------------------------------
const ALL_SEEDS_HE: QuestionSeed[] = [
  ...AGENCY_SEEDS_HE,
  ...SPORTS_STORE_SEEDS_HE,
  ...FLORIST_SEEDS_HE,
  ...ECOMMERCE_SEEDS_HE,
  ...LEGAL_SEEDS_HE,
  ...HEALTHCARE_SEEDS_HE,
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

  // Currently English seeds are not curated. Return empty until seeded.
  if (language === 'en') return []

  const topics = inferTopicClusters(ctx.keywords || [])

  const seedCtx: SeedContext = {
    businessName: ctx.businessName,
    city: ctx.city || null,
    country: ctx.country || 'IL',
    language,
    topics,
  }

  const results: IntentEngineQuestion[] = []
  const seenNormalized = new Set<string>()

  for (const seed of ALL_SEEDS_HE) {
    // Category filter
    if (seed.categories && !seed.categories.includes(ctx.businessCategory)) continue

    // Requirements
    if (seed.requiresBusinessName && !seedCtx.businessName) continue
    if (seed.requiresLocation && !seedCtx.city) continue

    // Topic requirements
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

    results.push({ prompt: text, intent: seed.intent, score: seed.score })
  }

  // Sort by score descending, cap at 8
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 8)
}

/**
 * Debug helper: returns the inferred topics for a set of keywords.
 * Exposed so callers / tests can log what topics drove generation.
 */
export function debugInferTopics(keywords: string[]): TopicCluster[] {
  return Array.from(inferTopicClusters(keywords))
}
