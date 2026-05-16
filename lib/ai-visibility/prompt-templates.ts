/**
 * Business-context AI question generator.
 *
 * Generates realistic AI-search questions based on the project's business
 * context (category, location, audience, intent) rather than mapping each
 * tracked keyword 1-to-1 into a question.
 *
 * Pipeline:
 *   1. Detect business category from name + domain + keywords
 *   2. Pull a curated question bank for that category (real customer questions)
 *   3. Extract THEMES from tracked keywords — audience, online-intent, gift,
 *      price, location — and use them only to BOOST or include relevant
 *      curated questions, never as direct source strings
 *   4. Fill {{business}} / {{city}} / {{country}} placeholders
 *   5. Filter: readable Hebrew, min quality score, semantic dedup
 *   6. Sort by quality
 *
 * Each suggestion carries: intent, intentLabel (localized), reason
 * (why it was suggested), and a quality score.
 */

export type PromptIntent =
  | 'brand'
  | 'comparison'
  | 'local'
  | 'transactional'
  | 'recommendation'
  | 'informational'
  | 'commercial'
  | 'alternatives'
  | 'pre_purchase'
  | 'gift'

export type BusinessCategory =
  | 'agency'
  | 'ecommerce'
  | 'perfume'
  | 'sports_store'
  | 'gifts'
  | 'appliance_store'
  | 'saas'
  | 'local_service'
  | 'cleaning'
  | 'florist'
  | 'restaurant'
  | 'healthcare'
  | 'legal'
  | 'real_estate'
  | 'fitness'
  | 'beauty'
  | 'education'
  | 'second_hand_fashion'
  | 'generic'

export type BusinessProfile = {
  primaryOfferings?: string[]
  secondaryOfferings?: string[]
  serviceLocations?: string[]
  excludedTopics?: string[]
}

export type CategoryProfile = {
  primaryOfferings: string[]
  secondaryOfferings: string[]
  excludedTopics: string[]
  // Semantic slots for proper Hebrew question generation
  businessType?: string // e.g., "חנות מוצרי כושר", "חנות פרחים"
  purchaseObjects?: string[] // e.g., ["ציוד כושר", "מוצרי כושר"], ["זר פרחים"]
  serviceActions?: string[] // e.g., ["לקנות", "להזמין"], ["להזמין"]
}

export type PromptSuggestion = {
  id: string
  prompt: string
  intent: PromptIntent
  intentLabel: string
  category: BusinessCategory
  language: string
  qualityScore: number
  reason: string
}

type TemplateContext = {
  business: string
  domain: string
  city: string | null
  country: string | null
  language: string
  themes: KeywordThemes
}

type QueryDef = {
  intent: PromptIntent
  text: string
  score: number
  /** Boost added when a matching theme is present in tracked keywords. */
  themeBoost?: Partial<Record<keyof KeywordThemes, number>>
  /** When true, this query is dropped if no city is configured. */
  requiresCity?: boolean
  /** Tags for offering-based weighting. 'primary' → 70%, 'secondary' → 10%, 'local' → 20%, 'generic' → fallback. */
  offering?: 'primary' | 'secondary' | 'local' | 'generic'
}

type KeywordThemes = {
  online: boolean
  gift: boolean
  audienceMen: boolean
  audienceWomen: boolean
  audienceKids: boolean
  price: boolean
  niche: boolean
  comparison: boolean
  /** Free-form category words extracted as fallback context. */
  topics: string[]
}

const HE_INTENT_LABEL: Record<PromptIntent, string> = {
  recommendation: 'המלצה',
  comparison: 'השוואה',
  commercial: 'מחיר',
  pre_purchase: 'מידע לפני רכישה',
  transactional: 'בחירה',
  local: 'מקומי',
  brand: 'מותג',
  informational: 'מידע',
  alternatives: 'אלטרנטיבות',
  gift: 'מתנה',
}

const EN_INTENT_LABEL: Record<PromptIntent, string> = {
  recommendation: 'Recommendation',
  comparison: 'Comparison',
  commercial: 'Price',
  pre_purchase: 'Pre-purchase',
  transactional: 'Selection',
  local: 'Local',
  brand: 'Brand',
  informational: 'Info',
  alternatives: 'Alternatives',
  gift: 'Gift',
}

const HE_CATEGORY_LABEL: Record<BusinessCategory, string> = {
  agency: 'סוכנות שיווק/SEO',
  ecommerce: 'חנות אונליין',
  perfume: 'חנות בשמים',
  sports_store: 'חנות ספורט',
  gifts: 'חנות מתנות',
  appliance_store: 'חנות מוצרי חשמל',
  saas: 'מוצר SaaS',
  local_service: 'שירות מקומי',
  cleaning: 'חברת ניקיון',
  florist: 'חנות פרחים',
  restaurant: 'מסעדה',
  healthcare: 'שירותי בריאות',
  legal: 'משרד עורכי דין',
  real_estate: 'נדל"ן',
  fitness: 'כושר',
  beauty: 'יופי וטיפוח',
  education: 'הכשרה והוראה',
  second_hand_fashion: 'בגדי יד שנייה לנשים',
  generic: 'עסק',
}

const EN_CATEGORY_LABEL: Record<BusinessCategory, string> = {
  agency: 'marketing/SEO agency',
  ecommerce: 'online store',
  perfume: 'perfume store',
  sports_store: 'sports store',
  gifts: 'gift store',
  appliance_store: 'home appliance store',
  saas: 'SaaS product',
  local_service: 'local service',
  cleaning: 'cleaning company',
  florist: 'florist',
  restaurant: 'restaurant',
  healthcare: 'healthcare provider',
  legal: 'law firm',
  real_estate: 'real-estate',
  fitness: 'fitness',
  beauty: 'beauty & wellness',
  education: 'education',
  second_hand_fashion: 'second-hand women\'s fashion',
  generic: 'business',
}

/**
 * Niche detection from business name + domain + keywords.
 * Order matters — more specific categories first.
 */
export function detectCategory(
  business: string,
  domain: string,
  keywords: string[] = []
): BusinessCategory {
  const text = `${business} ${domain} ${keywords.join(' ')}`.toLowerCase()

  // High-priority signals — check these FIRST to override weaker signals.
  // Flower/florist signals are high-priority; they override gift signals.
  if (/(flower|florist|פרחים|זרים|זר|משלוח פרחים|משלוחי פרחים|זר פרחים|זרי פרחים|חנות פרחים|bouquets|flower delivery|erez-flowers)/.test(text))
    return 'florist'

  if (/(perfume|fragrance|cologne|פרפיום|בושם|בשמים|או דה פרפיום|או דה טואלט)/.test(text)) return 'perfume'
  if (/(ניקיון|cleaner|cleaning|פוליש|נקיון|פוליסה|nettoyage)/.test(text)) return 'cleaning'
  if (/(seo|ppc|sem|google ads|adwords|agency|marketing|advertis|digital|קידום אתרים|ממומן|פרסום|שיווק|סוכנות|דיגיטל)/.test(text))
    return 'agency'
  if (/(sportwear|sportswear|sports|ספורט|נעלי ריצה|טייץ|adidas|nike|אדידס|נייקי|פומה|puma)/.test(text)) return 'sports_store'

  // Gift signals — checked AFTER florist so flowers aren't misclassified as gifts.
  if (/(matnot|מתנ|gift shop|gifts|presents|מתנות)/.test(text)) return 'gifts'

  if (/(appliance|מקרר|מכונת כביסה|תנור|מוצרי חשמל|חשמל ביתי|electrolux|whirlpool)/.test(text)) return 'appliance_store'
  if (/(saas|app|software|cloud|platform|api|\.io|\.ai)/.test(text)) return 'saas'
  if (/(restaurant|cafe|food|bistro|מסעדה|קפה|אוכל|פיצה)/.test(text)) return 'restaurant'
  if (/(clinic|hospital|medical|doctor|dental|מרפאה|רופא|רפואה|שיניים)/.test(text)) return 'healthcare'
  if (/(law|legal|attorney|lawyer|עורך דין|עורכי דין|משפט)/.test(text)) return 'legal'
  if (/(realty|real.estate|properties|נדל"ן|נדלן|דירות|תיווך)/.test(text)) return 'real_estate'
  if (/(gym|fitness|yoga|crossfit|כושר|יוגה)/.test(text)) return 'fitness'
  if (/(salon|spa|beauty|hair|nails|מספרה|ספא|איפור)/.test(text)) return 'beauty'
  if (/(school|academy|course|education|מכללה|בית ספר|קורס)/.test(text)) return 'education'
  if (/(electrician|plumber|hvac|חשמלאי|אינסטלטור)/.test(text)) return 'local_service'
  if (/(shop|store|ecommerce|חנות|קניות|אונליין|retail)/.test(text)) return 'ecommerce'

  return 'generic'
}

/**
 * Hebrew curated question banks per business category.
 * Each entry is a realistic AI-search question a customer would actually ask
 * ChatGPT / Perplexity / Gemini. Keywords are NOT used as direct source strings.
 */
const HE_BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    // Primary: selection & recommendations (70%)
    { intent: 'recommendation', text: 'איזה בושם מומלץ לאישה?', score: 95, offering: 'primary', themeBoost: { audienceWomen: 6 } },
    { intent: 'recommendation', text: 'איזה בושם מומלץ לגבר?', score: 95, offering: 'primary', themeBoost: { audienceMen: 6 } },
    { intent: 'pre_purchase', text: 'איך לבחור בושם שמתאים לי?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך יודעים אם בושם מקורי?', score: 90, offering: 'primary' },
    { intent: 'recommendation', text: 'אילו חנויות בשמים מומלצות בישראל?', score: 92, offering: 'primary' },
    { intent: 'informational', text: 'אילו בשמים מחזיקים הרבה זמן?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'מה ההבדל בין או דה פרפיום לאו דה טואלט?', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה בושם מומלץ לעור רגיש?', score: 80, offering: 'primary' },
    { intent: 'informational', text: 'איך לבחור בושם לעונת הקיץ?', score: 78, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איפה כדאי לקנות בשמים מקוריים אונליין?', score: 93, offering: 'primary', themeBoost: { online: 5 } },

    // Local: location-based (20%)
    { intent: 'local', text: 'חנויות בשמים מומלצות ב{{city}}', score: 85, offering: 'local', requiresCity: true },
    { intent: 'local', text: 'איפה קונים בשמי נישה בישראל?', score: 85, offering: 'local', themeBoost: { niche: 6 } },

    // Secondary: gifts & recommendations (10%)
    { intent: 'gift', text: 'איזה בושם מתאים כמתנה?', score: 86, offering: 'secondary', themeBoost: { gift: 8 } },
    { intent: 'gift', text: 'איזה בושם מתאים לחתונה כמתנה?', score: 77, offering: 'secondary', themeBoost: { gift: 4 } },
    { intent: 'commercial', text: 'איפה לקנות בשמים בהנחה?', score: 83, offering: 'secondary', themeBoost: { price: 5 } },
    { intent: 'recommendation', text: 'אילו מותגי בושם נחשבים יוקרתיים?', score: 84, offering: 'secondary' },

    // Generic: brand & comparison (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 71, offering: 'generic' },
  ],

  sports_store: [
    // Primary: selection & buying (70%)
    { intent: 'recommendation', text: 'אילו חנויות ספורט מומלצות בישראל?', score: 94, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור נעלי ריצה מתאימות?', score: 91, offering: 'primary' },
    { intent: 'recommendation', text: 'אילו מותגי ספורט מומלצים לאימון יומיומי?', score: 90, offering: 'primary' },
    { intent: 'recommendation', text: 'איפה כדאי לקנות נעלי ספורט בישראל?', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'מה ההבדל בין נעלי ריצה לנעלי הליכה?', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: 'בגדי ספורט מומלצים לכושר', score: 83, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איפה למצוא נעלי ספורט במידות גדולות?', score: 80, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איפה לקנות ציוד ספורט אונליין?', score: 87, offering: 'primary', themeBoost: { online: 5 } },

    // Local: location-based (20%)
    { intent: 'local', text: 'חנות ספורט מומלצת ב{{city}}', score: 85, offering: 'local', requiresCity: true },
    { intent: 'recommendation', text: 'אילו חנויות ספורט עושות משלוחים מהירים?', score: 79, offering: 'local', themeBoost: { online: 3 } },

    // Secondary: gifts & price (10%)
    { intent: 'gift', text: 'מתנה לרץ מתחיל — מה כדאי לקנות?', score: 77, offering: 'secondary', themeBoost: { gift: 6 } },
    { intent: 'commercial', text: 'איזו חנות ספורט הכי משתלמת בישראל?', score: 84, offering: 'secondary', themeBoost: { price: 4 } },

    // Generic: brand & comparison (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 71, offering: 'generic' },
  ],

  gifts: [
    // Primary: gift ideas & selection (70%)
    { intent: 'gift', text: 'איזו מתנה מומלצת לחתן וכלה?', score: 93, offering: 'primary' },
    { intent: 'gift', text: 'איזו מתנה לקנות לחבר טוב?', score: 91, offering: 'primary' },
    { intent: 'gift', text: 'מתנה לבר/בת מצווה — רעיונות מקוריים', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור מתנה ליום הולדת?', score: 88, offering: 'primary' },
    { intent: 'gift', text: 'מתנות מקוריות לעובדים', score: 86, offering: 'primary' },
    { intent: 'gift', text: 'איזו מתנה מתאימה לבני 30?', score: 85, offering: 'primary' },
    { intent: 'gift', text: 'מתנות לאמא ליום הולדת', score: 81, offering: 'primary', themeBoost: { audienceWomen: 3 } },
    { intent: 'gift', text: 'מתנות לאבא ליום הולדת', score: 81, offering: 'primary', themeBoost: { audienceMen: 3 } },
    { intent: 'recommendation', text: 'איפה כדאי לקנות מתנות מקוריות בישראל?', score: 89, offering: 'primary' },

    // Local: location-based (20%)
    { intent: 'local', text: 'חנות מתנות מומלצת ב{{city}}', score: 82, offering: 'local', requiresCity: true },
    { intent: 'recommendation', text: 'אילו חנויות מתנות מומלצות לאונליין?', score: 84, offering: 'local', themeBoost: { online: 4 } },

    // Secondary: price & deals (10%)
    { intent: 'commercial', text: 'איפה לקנות מתנות במחירים זולים?', score: 79, offering: 'secondary', themeBoost: { price: 4 } },

    // Generic: brand & comparison (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 71, offering: 'generic' },
  ],

  appliance_store: [
    // Primary: selection & buying (70%)
    { intent: 'recommendation', text: 'אילו חנויות מוצרי חשמל מומלצות בישראל?', score: 93, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור מכונת כביסה?', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור מקרר למשפחה?', score: 88, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה תנור מומלץ למטבח קטן?', score: 83, offering: 'primary' },
    { intent: 'comparison', text: 'מה ההבדל בין מקרר רגיל למקרר נו-פרוסט?', score: 80, offering: 'primary' },

    // Local: location-based (20%)
    { intent: 'local', text: 'חנות מוצרי חשמל מומלצת ב{{city}}', score: 82, offering: 'local', requiresCity: true },
    { intent: 'recommendation', text: 'איפה לקנות מקרר אונליין?', score: 86, offering: 'local', themeBoost: { online: 5 } },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'איפה הכי משתלם לקנות מוצרי חשמל?', score: 87, offering: 'secondary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'באיזו תקופה משתלם לקנות מוצרי חשמל?', score: 79, offering: 'secondary', themeBoost: { price: 3 } },

    // Generic: brand & comparison (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 71, offering: 'generic' },
  ],

  agency: [
    // Primary: service selection & comparison (70%)
    { intent: 'recommendation', text: 'אילו סוכנויות SEO מומלצות בישראל?', score: 95, offering: 'primary' },
    { intent: 'recommendation', text: 'מי מומלץ לקידום אורגני בישראל?', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'מי החברות המובילות בקידום אתרים?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור חברת קידום אתרים?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'מה צריך לבדוק לפני שכירת חברת SEO?', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'מה עדיף — קידום אורגני או ממומן?', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'השוואה בין חברות שיווק דיגיטלי בישראל', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: 'מומחי Google Ads מומלצים לעסקים קטנים', score: 85, offering: 'primary' },
    { intent: 'informational', text: 'כמה זמן לוקח לראות תוצאות מ-SEO?', score: 82, offering: 'primary' },

    // Local: location-based (20%)
    { intent: 'local', text: 'חברת קידום אתרים מומלצת ב{{city}}', score: 84, offering: 'local', requiresCity: true },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'כמה עולה קידום אתרים בישראל?', score: 90, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'כמה עולה ניהול Google Ads?', score: 88, offering: 'secondary', themeBoost: { price: 3 } },

    // Generic: brand & comparison (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 75, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 73, offering: 'generic' },
  ],

  cleaning: [
    // Primary: selection & recommendations (70%)
    { intent: 'recommendation', text: 'מי חברות הניקיון המומלצות לעסקים?', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'אילו חברות ניקיון מומלצות לבית פרטי?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור חברת ניקיון אמינה?', score: 89, offering: 'primary' },
    { intent: 'informational', text: 'באיזו תדירות צריך לנקות משרד?', score: 80, offering: 'primary' },
    { intent: 'comparison', text: 'מה ההבדל בין חברת ניקיון פרטית למקצועית?', score: 78, offering: 'primary' },

    // Local: location-based (20%)
    { intent: 'local', text: 'חברת ניקיון משרדים מומלצת ב{{city}}', score: 91, offering: 'local', requiresCity: true },
    { intent: 'local', text: 'שירותי ניקיון לעסקים ב{{city}}', score: 87, offering: 'local', requiresCity: true },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'כמה עולה ניקיון משרדים?', score: 89, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'מחיר לניקיון בית חודשי', score: 86, offering: 'secondary', themeBoost: { price: 3 } },

    // Generic: brand & comparison (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 71, offering: 'generic' },
  ],

  ecommerce: [
    // Primary: shopping & selection (70%)
    { intent: 'recommendation', text: 'אילו חנויות אונליין מומלצות בישראל?', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור חנות אונליין אמינה?', score: 85, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך בודקים אמינות של חנות אונליין?', score: 79, offering: 'primary' },
    { intent: 'informational', text: 'מה הזכויות שלי אם המוצר פגום?', score: 80, offering: 'primary' },
    { intent: 'comparison', text: 'השוואה בין חנויות אונליין מובילות בישראל', score: 85, offering: 'primary' },

    // Local: delivery & location (20%)
    { intent: 'commercial', text: 'אילו חנויות מציעות משלוח חינם בישראל?', score: 77, offering: 'local' },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'איפה לקנות הכי זול אונליין בישראל?', score: 87, offering: 'secondary', themeBoost: { price: 4 } },

    // Generic: brand & comparison (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 71, offering: 'generic' },
  ],

  saas: [
    // Primary: selection & usage (70%)
    { intent: 'recommendation', text: 'אילו כלי SaaS מומלצים לעסקים בישראל?', score: 91, offering: 'primary' },
    { intent: 'recommendation', text: 'אילו כלי AI מומלצים לעסקים?', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'מה ההבדל בין {{business}} למתחרים?', score: 86, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך מתחילים להשתמש ב-{{business}}?', score: 76, offering: 'primary' },

    // Secondary: alternatives & pricing (20% + 10%)
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 89, offering: 'secondary' },
    { intent: 'alternatives', text: 'מה דומה ל-{{business}} אבל זול יותר?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'כמה עולה {{business}}?', score: 81, offering: 'secondary', themeBoost: { price: 3 } },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  florist: [
    // PRIMARY: Local shop recommendations (20%)
    { intent: 'local', text: 'איזו חנות פרחים מומלצת בירושלים?', score: 96, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'איפה כדאי להזמין זר פרחים בירושלים?', score: 95, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'מי מומלץ למשלוחי פרחים בירושלים?', score: 94, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'חנות פרחים מומלצת בעיר שלי', score: 88, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'איפה אפשר להזמין פרחים טריים בירושלים?', score: 87, offering: 'primary', requiresCity: true },

    // PRIMARY: Same-day / Urgency (20%)
    { intent: 'local', text: 'איפה אפשר להזמין משלוח פרחים מהיום להיום בירושלים?', score: 97, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'מי עושה משלוח פרחים מהיר בירושלים?', score: 96, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'איפה אפשר להזמין זר פרחים ברגע האחרון?', score: 95, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'האם יש משלוחי פרחים באותו יום בירושלים?', score: 94, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'מי משלח פרחים בדחיפות בירושלים?', score: 93, offering: 'primary', requiresCity: true },

    // PRIMARY: Price / Commercial (15%)
    { intent: 'commercial', text: 'כמה עולה משלוח פרחים בירושלים?', score: 92, offering: 'primary', requiresCity: true, themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'כמה עולה זר פרחים ליום הולדת?', score: 91, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'מה המחיר הממוצע של זר פרחים מעוצב?', score: 90, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'כמה עולה זר פרחים רומנטי?', score: 89, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'האם יש משלוח פרחים במחיר משתלם בירושלים?', score: 88, offering: 'primary', requiresCity: true, themeBoost: { price: 3 } },

    // PRIMARY: Occasion-based (20%)
    { intent: 'pre_purchase', text: 'איזה זר פרחים מתאים ליום הולדת?', score: 93, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה זר פרחים מתאים לשבת?', score: 92, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה פרחים מתאימים ליולדת?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה זר מתאים למתנה רומנטית?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה פרחים מתאימים לחג?', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה זר פרחים מתאים ליום נישואין?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'איזה פרחים מתאימים לאנשים בגילאים שונים?', score: 87, offering: 'primary' },
    { intent: 'informational', text: 'פרחים לשבת — אילו סוגים מתאימים?', score: 86, offering: 'primary' },

    // PRIMARY: Trust / Pre-purchase (15%)
    { intent: 'pre_purchase', text: 'איך לבחור חנות פרחים אמינה?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'מה חשוב לבדוק לפני שמזמינים פרחים אונליין?', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך יודעים שהפרחים יגיעו טריים?', score: 88, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור זר פרחים איכותי?', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'מה חשוב לבדוק במשלוח פרחים?', score: 86, offering: 'primary' },
    { intent: 'informational', text: 'איך לשמור על פרחים ताזים יותר זמן?', score: 85, offering: 'primary' },
    { intent: 'informational', text: 'מה הזרים הטבעיים החזקים והעמידים?', score: 84, offering: 'primary' },

    // PRIMARY: Product/Information (10%)
    { intent: 'informational', text: 'פרחים רומנטיים — אילו הם טובים ביותר?', score: 83, offering: 'primary' },
    { intent: 'informational', text: 'מה ההבדל בין הזרים השונים לחגים?', score: 82, offering: 'primary' },
    { intent: 'informational', text: 'אילו פרחים מתאימים לבניין משרדים?', score: 81, offering: 'primary' },
    { intent: 'informational', text: 'איך בוחרים זר פרחים יפה ומעוצב?', score: 80, offering: 'primary' },

    // SECONDARY: Gift-with-flowers (only 3, rare)
    { intent: 'gift', text: 'איזה זר פרחים מתאים כמתנה לאישה?', score: 78, offering: 'secondary', themeBoost: { gift: 4 } },
    { intent: 'gift', text: 'פרחים ומתנה ליולדת בירושלים', score: 77, offering: 'secondary', requiresCity: true, themeBoost: { gift: 3 } },
    { intent: 'gift', text: 'מתנה של פרחים לחברה טובה', score: 76, offering: 'secondary', themeBoost: { gift: 3 } },

    // GENERIC: Brand & comparison
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72, offering: 'generic' },
    { intent: 'comparison', text: 'השוואה בין חנויות פרחים בישראל', score: 70, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 68, offering: 'generic' },
  ],

  second_hand_fashion: [
    // PRIMARY: Recommendations (25%)
    { intent: 'recommendation', text: 'איפה כדאי לקנות בגדי יד שנייה לנשים?', score: 96, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'אילו חנויות יד שנייה לנשים מומלצות בישראל?', score: 95, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'איזו חנות וינטג׳ לנשים מומלצת?', score: 94, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'recommendation', text: 'איפה אפשר למצוא בגדי יד שנייה איכותיים לנשים?', score: 93, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'recommendation', text: 'היכן קונים בגדים יד שנייה לנשים בירושלים?', score: 91, offering: 'primary', requiresCity: true, themeBoost: { audienceWomen: 3 } },

    // PRIMARY: Trust / Pre-purchase (20%)
    { intent: 'pre_purchase', text: 'איך לבחור חנות בגדי יד שנייה אמינה?', score: 94, offering: 'primary' },
    { intent: 'pre_purchase', text: 'מה חשוב לבדוק לפני שקונים בגדי יד שנייה אונליין?', score: 93, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך יודעים שבגד יד שנייה במצב טוב?', score: 92, offering: 'primary' },
    { intent: 'pre_purchase', text: 'האם כדאי לקנות בגדי יד שנייה אונליין?', score: 91, offering: 'primary' },
    { intent: 'informational', text: 'מה ההבדל בין בגדים וינטג׳ לבגדים יד שנייה?', score: 88, offering: 'primary' },

    // PRIMARY: Price / Value (15%)
    { intent: 'commercial', text: 'איפה קונים בגדי יד שנייה לנשים במחירים טובים?', score: 92, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'כמה עולים בגדי יד שנייה איכותיים?', score: 91, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'האם בגדי יד שנייה משתלמים יותר מבגדים חדשים?', score: 89, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: 'איפה למצוא בגדי מעצבים יד שנייה במחיר סביר?', score: 88, offering: 'primary', themeBoost: { price: 4 } },

    // PRIMARY: Discovery / Style (10%)
    { intent: 'informational', text: 'איפה אפשר למצוא פריטי וינטג׳ מיוחדים לנשים?', score: 90, offering: 'primary' },
    { intent: 'informational', text: 'איך למצוא בגדי מעצבים יד שנייה?', score: 89, offering: 'primary' },
    { intent: 'informational', text: 'איפה קונים בגדי מותגים יד שנייה לנשים?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'איך לבנות מלתחה עם בגדי יד שנייה?', score: 87, offering: 'primary' },

    // LOCAL: Location-based (15%)
    { intent: 'local', text: 'חנות בגדי יד שנייה לנשים מומלצת ב{{city}}', score: 92, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'local', text: 'איפה בירושלים קונים בגדי יד שנייה לנשים?', score: 90, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'local', text: 'חנויות וינטג׳ לנשים ב{{city}}', score: 88, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 2 } },

    // SECONDARY: Brand-specific (10%)
    { intent: 'brand', text: 'האם ששקה מומלצת לקניית בגדי יד שנייה?', score: 86, offering: 'secondary' },
    { intent: 'brand', text: 'מה אפשר לספר על {{business}}?', score: 85, offering: 'secondary' },
    { intent: 'brand', text: 'האם כדאי לקנות בגדי יד שנייה מ-{{business}}?', score: 84, offering: 'secondary' },

    // GENERIC: Alternatives & comparison (fallback)
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}} - חנויות בגדים יד שנייה', score: 78, offering: 'generic' },
    { intent: 'comparison', text: 'השוואה בין חנויות יד שנייה לנשים בישראל', score: 76, offering: 'generic' },
  ],

  restaurant: [
    // Primary & Local: location-based (90%)
    { intent: 'recommendation', text: 'מהן המסעדות הכי מומלצות ב{{city}}?', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'מסעדות חדשות ומומלצות ב{{city}}', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'מסעדה רומנטית ב{{city}}', score: 87, offering: 'local', requiresCity: true },
    { intent: 'local', text: 'מסעדה כשרה מומלצת ב{{city}}', score: 83, offering: 'local', requiresCity: true },
    { intent: 'informational', text: 'איפה לחגוג יום הולדת ב{{city}}?', score: 81, offering: 'local', requiresCity: true },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'מסעדה במחיר סביר ב{{city}}', score: 81, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  healthcare: [
    // Primary: selection & recommendations (70%)
    { intent: 'recommendation', text: 'מרפאות פרטיות מומלצות בישראל', score: 91, offering: 'primary' },
    { intent: 'recommendation', text: 'אילו רופאים מומלצים לטיפול פרטי?', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור רופא פרטי טוב?', score: 81, offering: 'primary' },

    // Local: location-based (20%)
    { intent: 'recommendation', text: 'מרפאת שיניים מומלצת ב{{city}}', score: 89, offering: 'local', requiresCity: true },
    { intent: 'local', text: 'רופא מומחה מומלץ ב{{city}}', score: 85, offering: 'local', requiresCity: true },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  legal: [
    // Primary: selection & recommendations (70%)
    { intent: 'recommendation', text: 'משרדי עורכי דין מובילים בישראל', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'אילו עורכי דין מומלצים לדיני משפחה?', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: 'עורך דין פלילי מומלץ בישראל', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור עורך דין מקצועי?', score: 85, offering: 'primary' },
    { intent: 'informational', text: 'מתי כדאי לפנות לעורך דין?', score: 79, offering: 'primary' },

    // Local: location-based (20%)
    { intent: 'local', text: 'עורך דין מומלץ ב{{city}}', score: 84, offering: 'local', requiresCity: true },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'כמה עולה ייעוץ משפטי?', score: 87, offering: 'secondary', themeBoost: { price: 3 } },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  real_estate: [
    // Primary: selection & recommendations (70%)
    { intent: 'recommendation', text: 'אילו חברות נדל"ן מומלצות בישראל?', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור מתווך נדל"ן אמין?', score: 85, offering: 'primary' },
    { intent: 'informational', text: 'מה צריך לבדוק לפני קניית דירה?', score: 81, offering: 'primary' },

    // Local: location-based (20%)
    { intent: 'recommendation', text: 'מתווכים מומלצים ב{{city}}', score: 87, offering: 'local', requiresCity: true },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'כמה גובה מתווך נדל"ן?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  fitness: [
    // Primary & Local: location-based (90%)
    { intent: 'recommendation', text: 'אילו חדרי כושר מומלצים ב{{city}}?', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'מאמן כושר אישי מומלץ ב{{city}}', score: 85, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'איך לבחור חדר כושר נכון?', score: 81, offering: 'local', requiresCity: true },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'כמה עולה מנוי לחדר כושר?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  beauty: [
    // Primary & Local: location-based (90%)
    { intent: 'recommendation', text: 'מספרות מומלצות ב{{city}}', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'סלון יופי מומלץ ב{{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'איפה לעשות מניקור מקצועי ב{{city}}?', score: 83, offering: 'local', requiresCity: true },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'מחירים לטיפולי יופי ב{{city}}', score: 81, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  education: [
    // Primary: selection & recommendations (70%)
    { intent: 'recommendation', text: 'אילו קורסי הייטק מומלצים בישראל?', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: 'בתי ספר ומכללות מומלצים', score: 85, offering: 'primary' },
    { intent: 'comparison', text: 'השוואה בין מכללות פרטיות בישראל', score: 81, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור קורס מקצועי?', score: 79, offering: 'primary' },

    // Secondary: pricing (20%)
    { intent: 'commercial', text: 'כמה עולה קורס מקצועי בהייטק?', score: 85, offering: 'secondary', themeBoost: { price: 3 } },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  local_service: [
    // Primary & Local: location-based (90%)
    { intent: 'recommendation', text: 'אילו בעלי מקצוע מומלצים ב{{city}}?', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'חשמלאי מומלץ ב{{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'אינסטלטור מומלץ ב{{city}}', score: 87, offering: 'primary', requiresCity: true },

    // Secondary: pricing (10%)
    { intent: 'commercial', text: 'מחירים לשירות מקצועי ב{{city}}', score: 81, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  generic: [
    { intent: 'recommendation', text: 'אילו עסקים מומלצים בתחום של {{business}}?', score: 79, offering: 'primary' },
    { intent: 'informational', text: 'מה התחום של {{business}}?', score: 69, offering: 'primary' },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 71, offering: 'generic' },
  ],
}

/**
 * English curated banks. Smaller — Hebrew is the main supported language.
 */
const EN_BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    { intent: 'recommendation', text: 'Best perfume for women', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Best perfume for men', score: 93, offering: 'primary', themeBoost: { audienceMen: 5 } },
    { intent: 'pre_purchase', text: 'How to choose a perfume that suits you', score: 87, offering: 'primary' },
    { intent: 'recommendation', text: 'Top recommended perfume stores in {{country}}', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'Difference between Eau de Parfum and Eau de Toilette', score: 85, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Where to buy authentic perfumes online', score: 91, offering: 'primary', themeBoost: { online: 5 } },
    { intent: 'local', text: 'Niche perfume brands worth trying', score: 83, offering: 'local', themeBoost: { niche: 4 } },
    { intent: 'gift', text: 'Best perfumes as a gift', score: 85, offering: 'secondary', themeBoost: { gift: 5 } },
    { intent: 'commercial', text: 'Where to buy perfumes with discounts', score: 81, offering: 'secondary', themeBoost: { price: 4 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  sports_store: [
    { intent: 'recommendation', text: 'Best sports stores in {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'How to choose running shoes that fit', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: 'Best sportswear brands for daily training', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'Running vs walking shoes — what is the difference?', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Cheapest sports store in {{country}}', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  gifts: [
    { intent: 'gift', text: 'Best wedding gift ideas', score: 89, offering: 'primary' },
    { intent: 'gift', text: 'Original birthday gift ideas', score: 87, offering: 'primary' },
    { intent: 'gift', text: 'Corporate gift ideas for employees', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: 'Best places to buy original gifts in {{country}}', score: 85, offering: 'primary' },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  appliance_store: [
    { intent: 'recommendation', text: 'Best home appliance stores in {{country}}', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'How to choose a washing machine', score: 85, offering: 'primary' },
    { intent: 'local', text: 'Cheapest place to buy appliances online', score: 83, offering: 'local', themeBoost: { online: 3, price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  agency: [
    { intent: 'recommendation', text: 'Best SEO agencies in {{country}}', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: 'Top digital marketing agencies in {{country}}', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'How to choose a digital marketing agency', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'SEO vs PPC — which is better?', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'How much does SEO cost in {{country}}?', score: 89, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  cleaning: [
    { intent: 'recommendation', text: 'Best office cleaning companies in {{city}}', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'How to choose a reliable cleaning company', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'Office cleaning cost per month', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  ecommerce: [
    { intent: 'recommendation', text: 'Best online stores in {{country}}', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'How to verify if an online store is reliable', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'Cheapest place to buy online in {{country}}', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  saas: [
    { intent: 'recommendation', text: 'Best SaaS tools for businesses in {{country}}', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'How does {{business}} compare to competitors?', score: 85, offering: 'primary' },
    { intent: 'alternatives', text: 'Alternatives to {{business}}', score: 89, offering: 'secondary' },
    { intent: 'commercial', text: 'How much does {{business}} cost?', score: 81, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  florist: [
    { intent: 'local', text: 'Same-day flower delivery in {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Best florist in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  second_hand_fashion: [
    { intent: 'recommendation', text: 'Where to buy second-hand women\'s clothing?', score: 94, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Best second-hand fashion shops for women', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Where to find vintage women\'s clothing?', score: 92, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'pre_purchase', text: 'How to identify quality in second-hand clothing', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Is it safe to buy used clothing online?', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Where to find affordable second-hand women\'s clothing', score: 90, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: 'How much should you spend on quality second-hand items', score: 88, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'How to build a wardrobe with second-hand pieces', score: 87, offering: 'primary' },
    { intent: 'informational', text: 'Where to find designer second-hand clothing', score: 86, offering: 'primary' },
    { intent: 'local', text: 'Second-hand fashion shops in {{city}}', score: 88, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'brand', text: 'Is {{business}} a reliable second-hand clothing store?', score: 84, offering: 'secondary' },
    { intent: 'alternatives', text: 'Alternatives to {{business}} for second-hand women\'s clothing', score: 80, offering: 'generic' },
  ],

  restaurant: [
    { intent: 'recommendation', text: 'Best restaurants in {{city}}', score: 91, offering: 'primary', requiresCity: true },
    { intent: 'local', text: 'Romantic dinner places in {{city}}', score: 85, offering: 'local', requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  healthcare: [
    { intent: 'recommendation', text: 'Top private clinics in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  legal: [
    { intent: 'recommendation', text: 'Top law firms in {{country}}', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'Legal consultation fees in {{country}}', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  real_estate: [
    { intent: 'recommendation', text: 'Best real estate agents in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  fitness: [
    { intent: 'recommendation', text: 'Best gyms in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  beauty: [
    { intent: 'recommendation', text: 'Best salons in {{city}}', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  education: [
    { intent: 'recommendation', text: 'Best tech courses in {{country}}', score: 87, offering: 'primary' },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  local_service: [
    { intent: 'recommendation', text: 'Recommended professionals in {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  generic: [
    { intent: 'recommendation', text: 'Recommended businesses similar to {{business}}', score: 77, offering: 'primary' },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
    { intent: 'alternatives', text: 'Alternatives to {{business}}', score: 71, offering: 'generic' },
  ],
}

const COUNTRY_NAMES_HE: Record<string, string> = {
  IL: 'ישראל',
  US: 'ארה"ב',
  GB: 'בריטניה',
  DE: 'גרמניה',
  FR: 'צרפת',
}

const COUNTRY_NAMES_EN: Record<string, string> = {
  IL: 'Israel',
  US: 'USA',
  GB: 'UK',
  DE: 'Germany',
  FR: 'France',
}

function fillTemplate(template: string, ctx: TemplateContext): string {
  const isHe = ctx.language === 'he'
  const countryName = isHe
    ? COUNTRY_NAMES_HE[ctx.country || ''] || ctx.country || ''
    : COUNTRY_NAMES_EN[ctx.country || ''] || ctx.country || ''
  return template
    .replace(/\{\{business\}\}/g, ctx.business || (isHe ? 'העסק' : 'the business'))
    .replace(/\{\{domain\}\}/g, ctx.domain || '')
    .replace(/\{\{city\}\}/g, ctx.city || (isHe ? 'אזורך' : 'your area'))
    .replace(/\{\{country\}\}/g, countryName)
}

/**
 * Extract themes from tracked keywords (used only as signals).
 *
 * Themes are higher-level intent markers that BOOST relevant curated questions.
 * They are NEVER turned into raw question text — that was the old failure mode.
 */
function extractThemes(keywords: string[]): KeywordThemes {
  const lowered = keywords.map((k) => k.toLowerCase()).join(' ')
  return {
    online: /(אונליין|online|הזמנה|משלוח|ברשת)/.test(lowered),
    gift: /(מתנ|מתנה|gift|present)/.test(lowered),
    audienceMen: /(לגבר|לגברים|גברים|for men|מנס|men's)/.test(lowered),
    audienceWomen: /(לאישה|לנשים|לאשה|נשים|לנערות|for women|נשי)/.test(lowered),
    audienceKids: /(לילד|לילדים|לתינוק|kids|baby|children)/.test(lowered),
    price: /(זול|הנחה|מבצע|כמה עולה|מחיר|cheap|discount|sale|price)/.test(lowered),
    niche: /(נישה|מותג יוקרה|יוקרת|niche|luxury|premium)/.test(lowered),
    comparison: /(השוואה|מה ההבדל|compare|vs|versus)/.test(lowered),
    topics: keywords.slice(0, 5).map((k) => k.trim()).filter(Boolean),
  }
}

/**
 * Lightweight Hebrew quality check — reject broken/awkward phrases.
 */
function isReadableHebrew(text: string): boolean {
  if (!text) return false
  // Reject unresolved templates
  if (/\{\{[^}]+\}\}/.test(text)) return false
  // Reject broken word repetitions
  if (/(לל|בב|של של|ביום ביום|בושם בושם|פרחים פרחים|מה מה)/.test(text)) return false
  // Reject awkward double prepositions
  if (/מה ל(?!ב|א|ש|כ|ה)|מי ל(?!ב|א|ש|כ|ה)/.test(text)) return false
  // Reject too short
  if (text.length < 6) return false
  return true
}

/**
 * Canonical form for semantic deduplication.
 * Lowercases, strips punctuation, collapses whitespace.
 */
function canonical(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?!.,'"״׳`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}


/**
 * Token-set similarity for near-duplicate detection.
 *
 * Two questions are considered duplicates if their token sets differ by at
 * most 1 short word. This catches cases like:
 *   "איזה בושם מומלץ לאישה?" vs "איזה בושם מומלץ לאשה?"
 *   "בושם לנערות מומלץ" vs "בושם לבנות מומלץ"
 */
function isNearDuplicate(a: string, b: string): boolean {
  const tokensA = canonical(a).split(' ').filter(Boolean)
  const tokensB = canonical(b).split(' ').filter(Boolean)
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  let intersection = 0
  for (const t of setA) if (setB.has(t)) intersection++
  const minLen = Math.min(tokensA.length, tokensB.length)
  const maxLen = Math.max(tokensA.length, tokensB.length)
  if (minLen === 0) return false
  // If 90% or more tokens overlap AND total length is identical, treat as dup.
  // This prevents "ליום הולדת" and "לשבת" variants from being merged.
  return intersection / minLen >= 0.9 && maxLen === minLen
}

/**
 * Per-category default offerings used to infer a BusinessProfile from project data.
 * Each entry contains primary offerings (what the business definitely does),
 * secondary offerings (related but not the focus), excluded topics,
 * and semantic slots for proper Hebrew question generation.
 */
const CATEGORY_PROFILES: Record<BusinessCategory, CategoryProfile> = {
  florist: {
    primaryOfferings: [
      'משלוחי פרחים', 'משלוח פרחים', 'זרי פרחים', 'זר פרחים', 'חנות פרחים',
      'פרחים ליום הולדת', 'פרחים לשבת', 'פרחים רומנטיים', 'פרחים לחג',
      'בוקטים', 'פרחים טריים', 'פרחי בר',
      'flower delivery', 'bouquets', 'fresh flowers', 'flower shop',
      'birthday flowers', 'romantic flowers', 'wedding flowers',
    ],
    secondaryOfferings: [
      'מתנות עם פרחים', 'מארזים עם פרחים', 'אגרטלים', 'צמחים בעציץ',
      'flower gifts', 'flower arrangements', 'potted plants',
    ],
    excludedTopics: [
      'מתנות כלליות', 'גאדג\'טים', 'מוצרי בית', 'מארזים כלליים',
      'מוצרי קוסמטיקה', 'general gifts', 'gadgets', 'home goods',
    ],
  },
  perfume: {
    primaryOfferings: [
      'בשמים מקוריים', 'בשמים לנשים', 'בשמים לגברים', 'בשמי נישה',
      'בשמים אונליין', 'או דה פרפיום', 'או דה טואלט', 'מבחר בשמים',
      'authentic perfumes', 'perfumes for women', 'perfumes for men',
      'niche perfumes', 'online perfumes', 'eau de parfum',
    ],
    secondaryOfferings: [
      'מתנות ריח', 'דוגמיות בושם', 'מארזי בישום', 'בשמים בהנחה',
      'fragrance gifts', 'perfume samples', 'perfume sets',
    ],
    excludedTopics: [
      'קוסמטיקה כללית', 'איפור', 'טיפוח עור', 'תכשירי שיער',
      'general cosmetics', 'makeup', 'skincare', 'hair products',
    ],
  },
  agency: {
    primaryOfferings: [
      'קידום אתרים אורגני', 'פרסום ממומן בגוגל', 'שיווק דיגיטלי',
      'ניהול קמפיינים', 'קידום אתרים מקומי', 'קידום SEO', 'גוגל אדס',
      'organic SEO', 'Google Ads', 'digital marketing', 'PPC campaigns',
      'local SEO', 'campaign management',
    ],
    secondaryOfferings: [
      'בניית אתרים', 'ייעוץ שיווקי', 'מיתוג', 'ניהול רשתות חברתיות',
      'web development', 'marketing consulting', 'branding', 'social media',
    ],
    excludedTopics: [
      'תוכן כללי', 'בלוגים אישיים', 'general blogging', 'personal content',
    ],
  },
  sports_store: {
    primaryOfferings: [
      'נעלי ספורט', 'נעלי ריצה', 'ציוד ספורט', 'בגדי ספורט', 'חנות ספורט',
      'מותגי ספורט', 'sports shoes', 'running shoes', 'sportswear', 'sports gear',
    ],
    secondaryOfferings: [
      'אביזרי ספורט', 'מתנות לרץ', 'תיקי ספורט',
      'sports accessories', 'gifts for runners',
    ],
    excludedTopics: [
      'בגדי יום-יום', 'אופנת רחוב', 'casual fashion', 'streetwear',
    ],
  },
  gifts: {
    primaryOfferings: [
      'מתנות מקוריות', 'מתנה ליום הולדת', 'מתנות לחתונה', 'מתנות לעובדים',
      'מתנה לחברה', 'מתנות לאמא', 'מתנות לאבא',
      'unique gifts', 'birthday gifts', 'wedding gifts', 'corporate gifts',
    ],
    secondaryOfferings: [
      'מארזים מעוצבים', 'מתנות אישיות', 'gift baskets', 'personalized gifts',
    ],
    excludedTopics: [
      'מצרכים כלליים', 'מוצרי משרד', 'office supplies', 'household items',
    ],
  },
  appliance_store: {
    primaryOfferings: [
      'מקרר', 'מכונת כביסה', 'תנור', 'מייבש כביסה', 'מדיח כלים', 'מזגן',
      'מוצרי חשמל', 'fridge', 'washing machine', 'oven', 'dryer', 'dishwasher',
      'home appliances',
    ],
    secondaryOfferings: [
      'אחריות מורחבת', 'התקנה', 'שירות', 'extended warranty', 'installation',
    ],
    excludedTopics: [
      'אלקטרוניקה ניידת', 'טלפונים סלולריים', 'mobile electronics', 'smartphones',
    ],
  },
  saas: {
    primaryOfferings: [
      'תוכנה לעסקים', 'כלי SaaS', 'פלטפורמה דיגיטלית',
      'business software', 'SaaS tool', 'platform', 'cloud software',
    ],
    secondaryOfferings: [
      'חבילות בתשלום', 'ניסיון חינם', 'integrations', 'pricing plans',
    ],
    excludedTopics: [
      'חומרה', 'מוצרים פיזיים', 'hardware', 'physical products',
    ],
  },
  cleaning: {
    primaryOfferings: [
      'ניקיון משרדים', 'ניקיון בתים', 'חברת ניקיון', 'שירותי ניקיון',
      'ניקיון אחרי שיפוץ', 'office cleaning', 'home cleaning', 'cleaning services',
    ],
    secondaryOfferings: [
      'ניקוי שטיחים', 'ניקיון חלונות', 'carpet cleaning', 'window cleaning',
    ],
    excludedTopics: [
      'מוצרי ניקיון', 'מטהרי אוויר', 'cleaning products', 'air fresheners',
    ],
  },
  ecommerce: {
    primaryOfferings: [
      'חנות אונליין', 'קניות באינטרנט', 'אונליין שופינג',
      'online store', 'online shopping', 'ecommerce',
    ],
    secondaryOfferings: [
      'משלוחים', 'החזרות', 'shipping', 'returns',
    ],
    excludedTopics: [],
  },
  restaurant: {
    primaryOfferings: [
      'מסעדה', 'תפריט', 'הזמנת מקום', 'ארוחה', 'restaurant', 'menu', 'reservation',
    ],
    secondaryOfferings: [
      'משלוחים', 'תפריט מיוחד', 'delivery', 'special menu',
    ],
    excludedTopics: [
      'מתכונים', 'בישול ביתי', 'recipes', 'home cooking',
    ],
  },
  healthcare: {
    primaryOfferings: [
      'מרפאה פרטית', 'רופא מומחה', 'טיפולים רפואיים',
      'private clinic', 'medical specialist', 'medical treatments',
    ],
    secondaryOfferings: [
      'בדיקות', 'ייעוץ', 'consultations', 'tests',
    ],
    excludedTopics: [
      'תרופות כלליות', 'תוספי תזונה', 'general medications', 'supplements',
    ],
  },
  legal: {
    primaryOfferings: [
      'עורך דין', 'ייעוץ משפטי', 'משרד עורכי דין', 'דיני משפחה',
      'lawyer', 'legal consultation', 'law firm',
    ],
    secondaryOfferings: [
      'נוטריון', 'תרגום משפטי', 'notary services',
    ],
    excludedTopics: [
      'ייעוץ עצמאי', 'self-help legal', 'DIY legal',
    ],
  },
  real_estate: {
    primaryOfferings: [
      'תיווך', 'דירות למכירה', 'דירות להשכרה', 'נדל"ן',
      'real estate', 'apartments for sale', 'apartments for rent',
    ],
    secondaryOfferings: [
      'ייעוץ משכנתא', 'הערכת שווי', 'mortgage advice',
    ],
    excludedTopics: [
      'עיצוב פנים', 'שיפוצים', 'interior design', 'renovations',
    ],
  },
  fitness: {
    primaryOfferings: [
      'חדר כושר', 'אימון אישי', 'מאמן כושר', 'יוגה', 'קרוספיט',
      'gym', 'personal training', 'fitness trainer', 'yoga', 'crossfit',
    ],
    secondaryOfferings: [
      'תוכניות תזונה', 'תוספי כושר', 'nutrition plans', 'supplements',
    ],
    excludedTopics: [
      'דיאטה כללית', 'general dieting',
    ],
  },
  beauty: {
    primaryOfferings: [
      'מספרה', 'סלון יופי', 'איפור', 'מניקור', 'פדיקור', 'טיפולי פנים',
      'hair salon', 'beauty salon', 'makeup', 'manicure', 'pedicure', 'facials',
    ],
    secondaryOfferings: [
      'מוצרי טיפוח', 'מוצרי שיער', 'hair products', 'beauty products',
    ],
    excludedTopics: [],
  },
  education: {
    primaryOfferings: [
      'קורסים', 'הכשרה מקצועית', 'מכללה', 'בית ספר', 'הוראה',
      'courses', 'professional training', 'school', 'academy',
    ],
    secondaryOfferings: [
      'הסמכות', 'תעודות', 'certifications',
    ],
    excludedTopics: [
      'בית ספר ציבורי', 'public school',
    ],
  },
  local_service: {
    primaryOfferings: [
      'חשמלאי', 'אינסטלטור', 'בעל מקצוע', 'תיקונים בבית',
      'electrician', 'plumber', 'handyman', 'home repairs',
    ],
    secondaryOfferings: [
      'שיפוצים', 'תחזוקה', 'renovations', 'maintenance',
    ],
    excludedTopics: [
      'מוצרי DIY', 'DIY products', 'tools for sale',
    ],
  },
  second_hand_fashion: {
    primaryOfferings: [
      'בגדי יד שנייה לנשים', 'אופנה יד שנייה', 'בגדים וינטג׳ לנשים',
      'בגדי יד שנייה', 'אופנה יד שנייה לנשים', 'חנות בגדי יד שנייה',
      'second-hand women\'s fashion', 'vintage women\'s clothing', 'used women\'s clothes',
      'second-hand fashion', 'pre-owned clothing', 'designer second-hand',
    ],
    secondaryOfferings: [
      'בגדי מעצבים יד שנייה', 'מכנסיים יד שנייה', 'חולצות יד שנייה',
      'designer second-hand', 'preloved fashion', 'thrifted clothing',
    ],
    excludedTopics: [
      'בגדים חדשים', 'בגדי גברים', 'בגדי ילדים',
      'new clothing', 'men\'s fashion', 'children\'s clothing',
    ],
  },
  generic: {
    primaryOfferings: [],
    secondaryOfferings: [],
    excludedTopics: [],
  },
}

/**
 * Semantic slots for each category — used to generate grammatically correct Hebrew questions.
 * businessType: what the business is (e.g., "חנות מוצרי כושר")
 * purchaseObjects: what customers buy (e.g., ["ציוד כושר", "מוצרי כושר"])
 * serviceActions: verbs to use (e.g., ["לקנות", "להזמין"])
 */
const CATEGORY_SEMANTIC_SLOTS: Partial<Record<BusinessCategory, {
  businessType?: string
  purchaseObjects?: string[]
  serviceActions?: string[]
}>> = {
  florist: {
    businessType: 'חנות פרחים',
    purchaseObjects: ['זר פרחים', 'משלוח פרחים', 'פרחים'],
    serviceActions: ['להזמין', 'לקנות'],
  },
  perfume: {
    businessType: 'חנות בשמים',
    purchaseObjects: ['בושם', 'בשמים מקוריים', 'בשמים'],
    serviceActions: ['לקנות', 'לבחור'],
  },
  sports_store: {
    businessType: 'חנות מוצרי כושר',
    purchaseObjects: ['ציוד כושר', 'מוצרי כושר', 'מכשיר כושר', 'משקולות'],
    serviceActions: ['לקנות', 'לבחור'],
  },
  gifts: {
    businessType: 'חנות מתנות',
    purchaseObjects: ['מתנה', 'מתנות', 'מארז מתנות'],
    serviceActions: ['לקנות', 'להזמין'],
  },
  restaurant: {
    businessType: 'מסעדה',
    purchaseObjects: ['ארוחה', 'פיתה', 'כרית', 'סלט'],
    serviceActions: ['לאכול', 'להזמין', 'לבחור'],
  },
  beauty: {
    businessType: 'סלון יופי',
    purchaseObjects: ['טיפול יופי', 'מספרה', 'טיפול פנים'],
    serviceActions: ['להזמין', 'לבחור'],
  },
  cleaning: {
    businessType: 'חברת ניקיון',
    purchaseObjects: ['שירות ניקיון', 'הניקיון', 'שטיפה'],
    serviceActions: ['להזמין', 'לשכור'],
  },
  ecommerce: {
    businessType: 'חנות אונליין',
    purchaseObjects: ['מוצר', 'פריט', 'מוצרים'],
    serviceActions: ['לקנות', 'להזמין'],
  },
  saas: {
    businessType: 'חברת תוכנה',
    purchaseObjects: ['רישיון', 'מנוי', 'שירות'],
    serviceActions: ['להשתמש', 'להירשם'],
  },
  healthcare: {
    businessType: 'קליניקה רפואית',
    purchaseObjects: ['טיפול רפואי', 'ביקור', 'בדיקה'],
    serviceActions: ['לבקר', 'להזמין'],
  },
  legal: {
    businessType: 'משרד עורכי דין',
    purchaseObjects: ['ייעוץ משפטי', 'ייעוץ', 'שירות משפטי'],
    serviceActions: ['להתייעץ', 'להזמין'],
  },
  real_estate: {
    businessType: 'משרד תיווך',
    purchaseObjects: ['דירה', 'דירות', 'קרקע', 'נכס'],
    serviceActions: ['לקנות', 'להשכיר', 'לחפש'],
  },
  education: {
    businessType: 'מוסד חינוך',
    purchaseObjects: ['קורס', 'הכשרה', 'שיעור'],
    serviceActions: ['ללמוד', 'להירשם', 'לחזור'],
  },
  second_hand_fashion: {
    businessType: 'חנות בגדי יד שנייה לנשים',
    purchaseObjects: ['בגדי יד שנייה', 'בגד יד שנייה', 'פריט וינטג׳', 'בגד'],
    serviceActions: ['לקנות', 'להזמין'],
  },
}

/**
 * Detect Israeli cities mentioned in any of the provided strings.
 */
function detectIsraeliCities(...strings: (string | null | undefined)[]): string[] {
  const text = strings.filter(Boolean).join(' ').toLowerCase()
  const cities = [
    'ירושלים', 'תל אביב', 'תל-אביב', 'חיפה', 'באר שבע', 'באר-שבע',
    'ראשון לציון', 'פתח תקווה', 'אשדוד', 'אשקלון', 'נתניה', 'הרצליה',
    'רעננה', 'רמת גן', 'גבעתיים', 'בני ברק', 'חולון', 'בת ים',
    'מעלה אדומים', 'מעלה-אדומים', 'מודיעין', 'כפר סבא', 'נצרת',
    'טבריה', 'אילת', 'עפולה', 'קריות', 'יבנה', 'רחובות', 'ראש העין',
  ]
  const found = new Set<string>()
  for (const c of cities) {
    if (text.includes(c)) found.add(c.replace('-', ' '))
  }
  return Array.from(found)
}

/**
 * Infer a BusinessProfile from existing project data.
 *
 * Pipeline: detect category → seed from CATEGORY_PROFILES → augment with
 * keywords/locations from the project. No database changes needed.
 *
 * Example — for "הפרחים של ארז" + "erez-flowers.co.il":
 *   { primaryCategory: 'florist',
 *     primaryOfferings: ['משלוחי פרחים', 'זרי פרחים', ...],
 *     excludedTopics: ['מתנות כלליות', ...] }
 */
export function inferBusinessProfile(args: {
  businessName: string | null
  domain: string | null
  keywords?: string[]
  city?: string | null
  country?: string | null
}): BusinessProfile & { primaryCategory: BusinessCategory } {
  const { businessName, domain, keywords = [], city, country } = args
  const category = detectCategory(businessName || '', domain || '', keywords)
  const template = CATEGORY_PROFILES[category] || CATEGORY_PROFILES.generic

  const primaryOfferings = new Set<string>(template.primaryOfferings)
  const secondaryOfferings = new Set<string>(template.secondaryOfferings)
  const excludedTopics = new Set<string>(template.excludedTopics)

  // Augment primary offerings from tracked keywords — these are what the
  // business actively tracks, so they reflect its real focus areas.
  for (const raw of keywords) {
    const kw = (raw || '').trim()
    if (!kw || kw.length < 3) continue
    // Skip if matches an excluded topic
    if (Array.from(excludedTopics).some((ex) => kw.toLowerCase().includes(ex.toLowerCase()))) continue
    // Skip pure brand-name keywords
    if (businessName && kw.toLowerCase() === businessName.toLowerCase()) continue
    primaryOfferings.add(kw)
  }

  // Detect locations from city + keywords + business name
  const detected = detectIsraeliCities(city, businessName, domain, keywords.join(' '))
  const serviceLocations = new Set<string>(detected)
  if (city) serviceLocations.add(city)

  return {
    primaryCategory: category,
    primaryOfferings: Array.from(primaryOfferings),
    secondaryOfferings: Array.from(secondaryOfferings),
    serviceLocations: Array.from(serviceLocations),
    excludedTopics: Array.from(excludedTopics),
  }
}

/**
 * Normalized substring match for offering/excluded-topic comparisons.
 */
function textMatchesAny(text: string, candidates: string[]): boolean {
  if (!candidates || candidates.length === 0) return false
  const lowered = text.toLowerCase()
  for (const c of candidates) {
    const term = (c || '').toLowerCase().trim()
    if (!term || term.length < 3) continue
    if (lowered.includes(term)) return true
  }
  return false
}

/**
 * Build a reason string explaining why a suggestion was included.
 */
function buildReason(
  def: QueryDef,
  category: BusinessCategory,
  ctx: TemplateContext,
  themeMatched: Array<keyof KeywordThemes>
): string {
  const isHe = ctx.language === 'he'
  const catLabel = (isHe ? HE_CATEGORY_LABEL : EN_CATEGORY_LABEL)[category]
  const intentLabel = (isHe ? HE_INTENT_LABEL : EN_INTENT_LABEL)[def.intent]

  const parts: string[] = []
  if (isHe) {
    parts.push(`מבוסס על קטגוריית העסק: ${catLabel}`)
    parts.push(`כוונת חיפוש: ${intentLabel}`)
    if (def.requiresCity && ctx.city) parts.push(`מיקום: ${ctx.city}`)
    if (themeMatched.includes('gift')) parts.push('זוהתה כוונת מתנה במילות המפתח')
    if (themeMatched.includes('online')) parts.push('זוהתה כוונת קנייה אונליין במילות המפתח')
    if (themeMatched.includes('price')) parts.push('זוהתה רגישות למחיר במילות המפתח')
    if (themeMatched.includes('audienceMen')) parts.push('זוהה קהל יעד: גברים')
    if (themeMatched.includes('audienceWomen')) parts.push('זוהה קהל יעד: נשים')
    if (themeMatched.includes('audienceKids')) parts.push('זוהה קהל יעד: ילדים')
    if (themeMatched.includes('niche')) parts.push('זוהתה התעניינות במותגי יוקרה/נישה')
  } else {
    parts.push(`Based on business category: ${catLabel}`)
    parts.push(`Search intent: ${intentLabel}`)
    if (def.requiresCity && ctx.city) parts.push(`Location: ${ctx.city}`)
    if (themeMatched.includes('gift')) parts.push('Gift intent detected in keywords')
    if (themeMatched.includes('online')) parts.push('Online-purchase intent detected')
    if (themeMatched.includes('price')) parts.push('Price-sensitivity detected')
  }
  return parts.join(' · ')
}

/**
 * Manual AI Business Profile — user override stored per project.
 * When `mode` is 'manual', the generator uses these values directly.
 * When `mode` is 'auto' (or the profile is null), auto-detection is used.
 */
/**
 * `primaryCategory` is a freeform string (not the BusinessCategory enum) so
 * the user can type custom Hebrew labels like "משלוחי פרחים", "בשמי נישה",
 * "ניקיון משרדים". `resolveManualPrimaryCategory` maps known aliases back to
 * an internal BusinessCategory; unknown strings fall back to auto-detection
 * but are still passed through as `secondaryOfferings` context.
 */
export type ManualAIProfile = {
  mode: 'auto' | 'manual'
  primaryCategory: string | null
  secondaryCategories: string[]
  excludedTopics: string[]
}

const BUSINESS_CATEGORY_SET: ReadonlySet<BusinessCategory> = new Set<BusinessCategory>([
  'agency', 'ecommerce', 'perfume', 'sports_store', 'gifts', 'appliance_store',
  'saas', 'local_service', 'cleaning', 'florist', 'restaurant', 'healthcare',
  'legal', 'real_estate', 'fitness', 'beauty', 'education', 'second_hand_fashion', 'generic',
])

function isBusinessCategory(value: string): value is BusinessCategory {
  return BUSINESS_CATEGORY_SET.has(value as BusinessCategory)
}

/**
 * Map a user-typed freeform category string to an internal BusinessCategory.
 * Returns null if no known alias matches — in that case the generator falls
 * back to the auto-detected category but still uses the custom text as a
 * secondary-offering signal (so the user's intent isn't lost).
 *
 * NOTE: Order doesn't matter for the substring checks because each branch is
 * mutually exclusive — but flower/perfume/agency aliases are listed first
 * because they're the most common user inputs.
 */
export function resolveManualPrimaryCategory(raw: string | null | undefined): BusinessCategory | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Exact enum match wins.
  if (isBusinessCategory(trimmed)) return trimmed
  const t = trimmed.toLowerCase()

  // Florist / flower delivery
  if (/(פרח|זר פרחים|זרי פרחים|משלוח פרחים|משלוחי פרחים|חנות פרחים|flower|florist|bouquet)/.test(t))
    return 'florist'
  // Perfume / fragrance
  if (/(בושם|בשמ|בשמי נישה|פרפיום|או דה פרפיום|או דה טואלט|perfume|fragrance|cologne)/.test(t))
    return 'perfume'
  // Agency / paid ads / SEO
  if (/(פרסום ממומן|ממומן בגוגל|google ads|adwords|פרסום|שיווק|סוכנות|דיגיטל|seo|ppc|sem|קידום אתרים|agency|marketing)/.test(t))
    return 'agency'
  // Cleaning services (offices, home, etc.)
  if (/(ניקיון|נקיון|cleaning|cleaner|מנקה)/.test(t)) return 'cleaning'
  // Gifts
  if (/(מתנ|gift|present)/.test(t)) return 'gifts'
  // Second-hand / vintage women fashion
  if (/(יד שנייה|וינטג׳|וינטג'|בגדי יד שנייה|אופנה יד שנייה|second.hand|vintage|used clothing|second hand fashion)/.test(t))
    return 'second_hand_fashion'
  // Sports store
  if (/(ספורט|sport|נעלי ריצה|adidas|nike|פומה)/.test(t)) return 'sports_store'
  // Appliances
  if (/(מקרר|תנור|מוצרי חשמל|מכונת כביסה|appliance|חשמל ביתי)/.test(t)) return 'appliance_store'
  // SaaS
  if (/(saas|software|cloud|platform|api|אפליקציה)/.test(t)) return 'saas'
  // Restaurant
  if (/(מסעדה|קפה|פיצה|food|restaurant|bistro|cafe)/.test(t)) return 'restaurant'
  // Healthcare
  if (/(מרפאה|רופא|רפואה|שיניים|clinic|hospital|medical|dental|doctor)/.test(t)) return 'healthcare'
  // Legal
  if (/(עורך דין|עורכי דין|משפט|law|legal|attorney|lawyer)/.test(t)) return 'legal'
  // Real estate
  if (/(נדל|דירות|תיווך|real estate|realty|properties)/.test(t)) return 'real_estate'
  // Fitness
  if (/(כושר|יוגה|gym|fitness|yoga|crossfit)/.test(t)) return 'fitness'
  // Beauty
  if (/(מספרה|ספא|איפור|טיפוח|salon|spa|beauty|hair|nails)/.test(t)) return 'beauty'
  // Education
  if (/(מכללה|בית ספר|קורס|school|academy|course|education)/.test(t)) return 'education'
  // Local service (electrician, plumber, cleaning of offices, dog products etc.)
  if (/(חשמלאי|אינסטלטור|electrician|plumber|hvac|מוצרים לכלבים|pet|dog)/.test(t)) return 'local_service'
  // Generic e-commerce
  if (/(חנות|store|shop|ecommerce|retail|אונליין)/.test(t)) return 'ecommerce'

  return null
}

/**
 * Get semantic slots for a category (businessType, purchaseObjects, serviceActions).
 * These slots are used to generate grammatically correct Hebrew questions.
 */
function getSemanticSlots(category: BusinessCategory): {
  businessType?: string
  purchaseObjects?: string[]
  serviceActions?: string[]
} {
  return CATEGORY_SEMANTIC_SLOTS[category] ?? {}
}

/**
 * Check if a Hebrew phrase contains invalid verb-object combinations.
 * Examples to reject:
 * - "קונים חנות" (buying a store/category, not a product)
 * - "לקנות חברה" (buying a company)
 * - "כמה עולה חנות" (how much does a store cost)
 */
function isInvalidHebrewPhrase(phrase: string): boolean {
  const p = phrase.toLowerCase()

  // CRITICAL: Reject double-lamed verbs
  const doubleLamedVerbs = [
    'ללקנות', 'ללהזמין', 'ללבחור', 'ללמצוא', 'ללקבל', 'ללרכוש',
    'ללהשוות', 'ללבדוק', 'ללשאול', 'ללחפש'
  ]
  for (const verb of doubleLamedVerbs) {
    if (p.includes(verb)) return true
  }

  // Reject awkward secondary constructs
  if (/(וינטג׳|מותגים|אקססוריז)\s+איכותיים/.test(p)) {
    return true
  }

  // Reject buying verbs with business types
  if (/(קנו|קונים|לקנות|להזמין).*\b(חנות|חברה|משרד|מרכז|מוסד)\b/.test(p)) {
    return true
  }

  // Reject construct-state errors
  if (/מוצרים\s+(?!ספורט|נישה|בחנות|שונים|אחרים|יוקרה|אונליין|לבית|כלליים)(\S+)/.test(p)) {
    return true
  }

  // Reject price questions about business types
  if (/(כמה עול|מחיר).*\b(חנות|חברה|משרד|מרכז)\b/.test(p)) {
    return true
  }

  return false
}

/**
 * Map a secondary category string to a proper purchasable object
 * e.g., "וינטג׳" → "פריטי וינטג׳", "מותגים" → "בגדי מותגים יד שנייה"
 */
function resolveSecondaryPurchaseObject(
  secondaryCategory: string,
  _primaryCategory: BusinessCategory
): string {
  const sec = secondaryCategory.toLowerCase().trim()

  // For second-hand fashion, map secondary categories to proper purchase objects
  const secondaryObjectMap: Record<string, string> = {
    'וינטג׳': 'פריטי וינטג׳',
    'vintage': 'vintage items',
    'מותגים': 'בגדי מותגים יד שנייה',
    'brands': 'designer items',
    'שמלות ערב': 'שמלות ערב יד שנייה',
    'evening dresses': 'evening dresses',
    'אקססוריז': 'אקססוריז יד שנייה',
    'accessories': 'accessories',
    'בגדי מעצבים': 'בגדי מעצבים יד שנייה',
    'משקולות': 'משקולות',
    'weights': 'weights',
    'הליכונים': 'הליכונים',
    'treadmills': 'treadmills',
  }

  return secondaryObjectMap[sec] || secondaryCategory
}

/**
 * Normalize common Hebrew construct-state mistakes.
 */
function normalizeHebrewConstructState(phrase: string): string {
  let normalized = phrase
  // "מוצרים כושר" → "מוצרי כושר"
  normalized = normalized.replace(/מוצרים\s+/g, 'מוצרי ')
  // "בגדים יד שנייה" → "בגדי יד שנייה"
  normalized = normalized.replace(/בגדים\s+יד/g, 'בגדי יד')
  // "מוצרים ספורט" → "מוצרי ספורט"
  normalized = normalized.replace(/מוצרים\s+ספורט/g, 'מוצרי ספורט')
  // "פרחים יום הולדת" → "פרחים ליום הולדת"
  normalized = normalized.replace(/פרחים\s+יום\s+הולדת/g, 'פרחים ליום הולדת')
  return normalized
}

/**
 * Generate smart AI query suggestions, business-context driven.
 *
 * With optional business profile: weights offerings (70% primary, 20% local, 10% secondary).
 * @param ctx Project context: business, domain, city, country, language
 * @param keywords Tracked keywords used ONLY as theme signals
 * @param profile Optional business profile with offering preferences
 * @param manualProfile User-saved manual override. When `mode='manual'`, its
 *   primaryCategory wins over auto-detection, its secondaryCategories augment
 *   secondaryOfferings (20-30% influence), and its excludedTopics are always
 *   filtered. When `mode='auto'` or null, this is ignored.
 * @param shuffle If true, randomize order before slicing
 * @param limit Maximum number of suggestions to return (default 12)
 * @param excludePrompts Normalized prompt texts already shown in the session
 * @param previousSet Last shown set — generator avoids returning the same set
 * @param recentlyUsedSecondaryCategories Categories used in the last regenerate (rotated away)
 * @param diversify If true (default), use weighted random selection from a top
 *   pool grouped by intent bucket. This produces a meaningfully different set
 *   each call. Set to false to get deterministic top-N by score.
 */
export function generatePromptSuggestions({
  businessName,
  domain,
  city = null,
  country = null,
  language = 'he',
  keywords = [],
  profile = null,
  manualProfile = null,
  shuffle = false,
  limit = 12,
  excludePrompts = [],
  previousSet = [],
  recentlyUsedSecondaryCategories = [],
  diversify = true,
}: {
  businessName: string | null
  domain: string | null
  city?: string | null
  country?: string | null
  language?: string | null
  keywords?: string[]
  profile?: BusinessProfile | null
  manualProfile?: ManualAIProfile | null
  shuffle?: boolean
  limit?: number
  excludePrompts?: string[]
  previousSet?: string[]
  recentlyUsedSecondaryCategories?: string[]
  diversify?: boolean
}): PromptSuggestion[] {
  const business = businessName || ''
  const dom = domain || ''
  const lang = language === 'en' ? 'en' : 'he'
  const themes = extractThemes(keywords)
  const ctx: TemplateContext = { business, domain: dom, city, country, language: lang, themes }

  // Always derive a BusinessProfile — infer from project data when none given.
  // This is what drives the 70/20/10 weighting + excluded-topic filtering.
  const autoProfile = profile ?? inferBusinessProfile({
    businessName, domain, keywords, city, country,
  })

  // If a manual profile is active, its primaryCategory overrides auto-detection
  // and its excludedTopics/secondaryCategories augment the auto-inferred profile.
  // primaryCategory is a freeform string (user may have typed "משלוחי פרחים");
  // resolveManualPrimaryCategory maps known aliases to internal BusinessCategory.
  const hasManual = manualProfile && manualProfile.mode === 'manual'
  let category: BusinessCategory
  let customCategoryContext: string[] = []

  if (hasManual && manualProfile.primaryCategory) {
    const resolved = resolveManualPrimaryCategory(manualProfile.primaryCategory)
    category = resolved || (autoProfile as { primaryCategory: BusinessCategory }).primaryCategory
    // If custom text didn't map to a known category, include it as a secondary
    // signal so it still influences question scoring even though we fell back to auto.
    if (!resolved) {
      customCategoryContext = [manualProfile.primaryCategory.trim()]
    }
  } else {
    category = (autoProfile as { primaryCategory: BusinessCategory }).primaryCategory
  }

  // Build the effective profile: keep auto-inferred offerings, but layer manual
  // secondary categories + excluded topics on top so user choices win.
  const effectiveProfile: BusinessProfile = hasManual
    ? {
        primaryOfferings: autoProfile.primaryOfferings || [],
        // Manual secondary categories + custom category text take precedence; auto values appended after.
        secondaryOfferings: [
          ...(manualProfile.secondaryCategories || []),
          ...customCategoryContext,
          ...(autoProfile.secondaryOfferings || []),
        ],
        serviceLocations: autoProfile.serviceLocations || [],
        // Manual excluded topics are ADDED to auto-detected ones (union).
        excludedTopics: [
          ...(manualProfile.excludedTopics || []),
          ...(autoProfile.excludedTopics || []),
        ],
      }
    : autoProfile

  const bank = lang === 'he' ? HE_BANK : EN_BANK
  const defs = bank[category] || bank.generic
  const intentLabels = lang === 'he' ? HE_INTENT_LABEL : EN_INTENT_LABEL

  const MIN_QUALITY_SCORE = 70

  // Filter: drop entries that require a city when none is configured
  const eligible = defs.filter((d) => !d.requiresCity || !!ctx.city)

  // Apply theme boosts, fill placeholders, build suggestions
  type Built = {
    def: QueryDef
    prompt: string
    score: number
    themeMatched: Array<keyof KeywordThemes>
    offering: string
  }
  const built: Built[] = []
  for (const def of eligible) {
    const filled = fillTemplate(def.text, ctx).trim()
    if (lang === 'he' && !isReadableHebrew(filled)) continue

    // Excluded-topic filter: drop any question that hits an excluded theme
    if (textMatchesAny(filled, effectiveProfile.excludedTopics || [])) continue

    let score = def.score
    let effectiveOffering = def.offering || 'generic'
    const matched: Array<keyof KeywordThemes> = []
    if (def.themeBoost) {
      for (const [key, boost] of Object.entries(def.themeBoost)) {
        const themeKey = key as keyof KeywordThemes
        if (themeKey === 'topics') continue
        if (themes[themeKey] && typeof boost === 'number') {
          score += boost
          matched.push(themeKey)
        }
      }
    }

    // Profile-driven boosts: if the question text matches any primary offering,
    // boost it strongly and re-tag it as 'primary' so the weighting picks it up.
    if (textMatchesAny(filled, effectiveProfile.primaryOfferings || [])) {
      score += 10
      effectiveOffering = 'primary'
    } else if (textMatchesAny(filled, effectiveProfile.secondaryOfferings || [])) {
      score += 4
      if (effectiveOffering === 'generic') effectiveOffering = 'secondary'
    }

    // Location boost if a service location matches the city template
    if (def.requiresCity && (effectiveProfile.serviceLocations || []).length > 0) {
      score += 3
    }

    if (score < MIN_QUALITY_SCORE) continue
    built.push({ def, prompt: filled, score, themeMatched: matched, offering: effectiveOffering })
  }

  // Exclude already-seen prompts so the next regenerate shows fresh ones.
  // `previousSet` is treated like `excludePrompts` — never return the same set.
  const excludeSet = new Set<string>([
    ...excludePrompts.map(normalizePromptForCompare),
    ...previousSet.map(normalizePromptForCompare),
  ])

  // Generate secondary category questions if we have secondary categories
  const secondaryCategoryQuestions: Built[] = []
  if (hasManual && manualProfile.secondaryCategories && manualProfile.secondaryCategories.length > 0) {
    const slots = getSemanticSlots(category)
    const purchaseObjects = slots.purchaseObjects || []
    const serviceActions = slots.serviceActions || ['לקנות', 'להזמין']

    // Generate questions for each secondary category using semantic templates
    for (const secondaryCategory of manualProfile.secondaryCategories) {
      if (!secondaryCategory || secondaryCategory.trim().length === 0) continue
      const secondary = secondaryCategory.trim()

      // Resolve secondary category to proper purchase object
      const resolvedObject = lang === 'he' ? resolveSecondaryPurchaseObject(secondary, category) : secondary
      const objectsToUse = purchaseObjects.length > 0 ? purchaseObjects : [resolvedObject]
      const actionsToUse = serviceActions.length > 0 ? serviceActions : ['לקנות']

      // Helper: get action without leading ל if it already has one
      const getAction = (action: string) => {
        return action.startsWith('ל') ? action : `ל${action}`
      }

      // Helper: get bare action (without ל) for use after prepositions like "שקונים", "שמזמינים"
      const getBareAction = (action: string) => {
        return action.startsWith('ל') ? action.substring(1) : action
      }

      // Generate semantic templates that use proper objects and avoid double-lamed verbs
      const templates = lang === 'he' ?
        [
          // Recommendations - use resolved object
          `איפה כדאי ${getAction(actionsToUse[0])} ${resolvedObject}?`,
          `איזו חנות מומלצת ל${secondary}?`,
          // Quality check
          ...(purchaseObjects.length > 0 ? [
            `מה חשוב לבדוק לפני ש${actionsToUse[0] === 'להזמין' ? 'מזמינים' : 'קונים'} ${objectsToUse[0] || resolvedObject}?`,
          ] : []),
          // Price
          ...(purchaseObjects.length > 0 ? [
            `כמה עולים ${objectsToUse[0] || resolvedObject}?`,
          ] : []),
          // Discovery - use resolved object
          `איפה אפשר למצוא ${resolvedObject}?`,
          // Location
          `איפה כדאי ${getAction(actionsToUse[0])} ${resolvedObject}?`,
        ].filter(Boolean) :
        [
          `Where to find ${secondary}?`,
          `Best shops for ${secondary}`,
          `How to choose quality ${secondary}?`,
          `What to check when buying ${secondary}?`,
          `How much should you spend on ${secondary}?`,
        ]

      for (const template of templates) {
        const filled = normalizeHebrewConstructState(template.trim())

        // Skip invalid Hebrew phrases
        if (lang === 'he' && isInvalidHebrewPhrase(filled)) continue

        // Filter by excluded topics
        if (textMatchesAny(filled, effectiveProfile.excludedTopics || [])) continue
        // Filter by already-seen questions and previous set
        if (excludeSet.has(normalizePromptForCompare(filled))) continue

        let score = 85 // Secondary category questions get a good baseline score
        const matched: Array<keyof KeywordThemes> = []

        // Apply theme boosts if applicable
        if (themes && Object.keys(themes).length > 0) {
          for (const [key, value] of Object.entries(themes)) {
            const themeKey = key as keyof KeywordThemes
            if (themeKey === 'topics') continue
            if (value && typeof value === 'number' && value > 0) {
              score += 2
              matched.push(themeKey)
            }
          }
        }

        secondaryCategoryQuestions.push({
          def: {
            intent: 'recommendation' as const,
            text: template,
            score: score,
            offering: 'secondary',
          },
          prompt: filled,
          score,
          themeMatched: matched,
          offering: 'secondary',
        })
      }
    }
  }

  // Semantic deduplication — drop near-duplicates, keep higher-scoring one
  const allBuilt = [...built, ...secondaryCategoryQuestions]
  allBuilt.sort((a, b) => b.score - a.score)
  const keptCanonicals: string[] = []
  const kept: Built[] = []
  for (const item of allBuilt) {
    const c = canonical(item.prompt)
    let isDup = false
    for (const existing of keptCanonicals) {
      if (existing === c || isNearDuplicate(existing, c)) {
        isDup = true
        break
      }
    }
    if (isDup) continue
    keptCanonicals.push(c)
    kept.push(item)
  }
  const poolAfterExclude: Built[] = kept.filter(
    (item) => !excludeSet.has(normalizePromptForCompare(item.prompt))
  )

  // Pool-exhaustion fallback: if filtering left us with too few candidates,
  // fall back to the full deduplicated pool (still excluding the previous set
  // when possible, so consecutive regenerates never echo each other).
  let pool: Built[] = poolAfterExclude
  if (pool.length < limit) {
    const onlyPrevious = new Set<string>(previousSet.map(normalizePromptForCompare))
    pool = kept.filter((item) => !onlyPrevious.has(normalizePromptForCompare(item.prompt)))
    if (pool.length < limit) pool = kept
  }

  // Pick suggestions: diversified pool-random when requested, deterministic otherwise.
  const suggestions: Built[] = diversify
    ? diversifiedPick(pool, limit)
    : weightByOffering(pool, limit)

  // Debug logging (dev only)
  if (process.env.NODE_ENV === 'development' && manualProfile?.mode === 'manual') {
    console.log('[AI-Profile Debug]', {
      mode: manualProfile.mode,
      rawPrimaryCategory: manualProfile.primaryCategory,
      resolvedCategory: category,
      primaryCandidateCount: built.length,
      secondaryCandidateCount: secondaryCategoryQuestions.length,
      totalCandidateCount: allBuilt.length,
      dedupedCount: kept.length,
      poolAfterExclude: poolAfterExclude.length,
      finalPool: pool.length,
      selectedCount: suggestions.length,
      seenPromptsCount: excludePrompts.length,
      previousSetCount: previousSet.length,
      diversify,
      secondaryCategories: manualProfile.secondaryCategories,
    })
  }

  // Build final suggestions
  const result: PromptSuggestion[] = suggestions.map((item, idx) => ({
    id: `q-${idx}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: item.prompt,
    intent: item.def.intent,
    intentLabel: intentLabels[item.def.intent],
    category,
    language: lang,
    qualityScore: item.score,
    reason: buildReason(item.def, category, ctx, item.themeMatched),
  }))

  if (shuffle && !diversify) {
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
  }

  return result.slice(0, limit)
}

/**
 * Normalize a prompt for cross-call comparison. Same logic as the UI's
 * normalizePrompt — keeps generator + UI in sync for seen-set tracking.
 */
function normalizePromptForCompare(p: string): string {
  return (p || '')
    .toLowerCase()
    .replace(/[?!.,;:'"״׳`\-–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Classify a question into a coarse intent bucket used to balance the result
 * set. Buckets are derived from question phrasing (Hebrew + English regex) and
 * fall back to the QueryDef intent/offering. Each bucket contributes at most
 * one question per result set, ensuring users see a varied mix.
 */
type IntentBucket =
  | 'recommendation'
  | 'urgency'
  | 'price'
  | 'occasion'
  | 'trust'
  | 'brand'
  | 'secondary'
  | 'other'

function getIntentBucket(prompt: string, def: QueryDef, offering: string): IntentBucket {
  // Brand / comparison / alternatives — explicit intents take priority.
  if (def.intent === 'brand' || def.intent === 'comparison' || def.intent === 'alternatives') {
    return 'brand'
  }
  // Urgency / same-day delivery (most time-sensitive bucket — check first).
  if (
    /(משלוח.*מהיום|משלוח.*באותו יום|משלוח.*מהיר|רגע האחרון|בדחיפות|same.?day|urgent|fast delivery)/i.test(
      prompt
    )
  ) {
    return 'urgency'
  }
  // Price / commercial.
  if (/(כמה עול|מחיר|משתלם|בהנחה|cost|price|how much|cheap|discount)/i.test(prompt)) {
    return 'price'
  }
  // Occasion-based.
  if (
    /(ליום הולדת|לשבת|ליולדת|רומנטי|לחג|לנישואין|מתנה רומנטית|לאירוע|birthday|wedding|anniversary|romantic|holiday)/i.test(
      prompt
    )
  ) {
    return 'occasion'
  }
  // Trust / quality / pre-purchase considerations.
  if (
    /(איך לבחור|חשוב לבדוק|טריים|איכותי|אמינה|איך יודעים|how to choose|reliable|trust|fresh|quality)/i.test(
      prompt
    )
  ) {
    return 'trust'
  }
  // Secondary offerings (gifts as secondary, etc.).
  if (offering === 'secondary' || def.intent === 'gift') {
    return 'secondary'
  }
  // Recommendation / local — default for primary discovery questions.
  if (
    def.intent === 'recommendation' ||
    def.intent === 'local' ||
    /(מומלצת|מומלץ|איפה כדאי|recommend|where can i)/i.test(prompt)
  ) {
    return 'recommendation'
  }
  return 'other'
}

/**
 * Weighted random pick from a list of scored items. Higher score → higher
 * chance, but lower-scored items still have a non-zero chance, so consecutive
 * calls produce different selections from the same pool.
 */
function weightedRandomPick<T extends { score: number }>(items: T[]): T | undefined {
  if (items.length === 0) return undefined
  if (items.length === 1) return items[0]
  const weights = items.map((i) => Math.max(1, i.score - 60))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return items[Math.floor(Math.random() * items.length)]
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/**
 * Diversified selection from a pool of scored candidates.
 *
 * Algorithm:
 *   1. Separate secondary-category questions (offering='secondary') into their own tier.
 *   2. Group remaining candidates by IntentBucket.
 *   3. Define a target distribution that ensures:
 *      - Secondary category questions: 1–2 out of 6 (20-30%)
 *      - Core buckets (recommendation, trust, price, etc.): fill the remaining slots
 *   4. For each target slot, pick a weighted-random candidate from the top
 *      of that bucket (top 5 by score). This injects controlled randomness:
 *      relevance stays high but the exact pick varies per call.
 *   5. If the result is still short, fill from remaining candidates pool-wide.
 *
 * Result: different regenerates produce different SETS with secondary categories included.
 */
function diversifiedPick(
  built: Array<{
    def: QueryDef
    prompt: string
    score: number
    themeMatched: Array<keyof KeywordThemes>
    offering: string
  }>,
  limit: number
) {
  type Built = (typeof built)[number]
  if (built.length === 0) return [] as Built[]

  // Separate secondary-category questions for dedicated slot allocation
  const secondaryCategoryQuestions = built.filter((b) => b.offering === 'secondary' && b.def.intent === 'recommendation')
  const otherQuestions = built.filter((b) => !(b.offering === 'secondary' && b.def.intent === 'recommendation'))

  // Step 1: group remaining by intent bucket, sorted by score within each bucket.
  const buckets: Record<IntentBucket, Built[]> = {
    recommendation: [],
    urgency: [],
    price: [],
    occasion: [],
    trust: [],
    brand: [],
    secondary: [],
    other: [],
  }
  for (const item of otherQuestions) {
    const bucket = getIntentBucket(item.prompt, item.def, item.offering)
    buckets[bucket].push(item)
  }
  for (const key of Object.keys(buckets) as IntentBucket[]) {
    buckets[key].sort((a, b) => b.score - a.score)
  }

  // Step 2: target distribution.
  // Allocate 1–2 slots for secondary category questions (20-30% of limit).
  // For limit=6: 1-2 slots (17-33%). For limit=12: 2-4 slots (17-33%).
  const secondarySlotsTarget = limit >= 6 ? 2 : 1
  const primarySlotsTarget = Math.max(limit - secondarySlotsTarget, limit - 2)

  const baseTargets: Array<{ bucket: IntentBucket; count: number }> = [
    { bucket: 'recommendation', count: 1 },
    { bucket: 'urgency', count: 1 },
    { bucket: 'price', count: 1 },
    { bucket: 'occasion', count: 1 },
    { bucket: 'trust', count: 1 },
    { bucket: 'brand', count: primarySlotsTarget > 5 ? 1 : 0 },
  ]

  const result: Built[] = []
  const picked = new Set<Built>()
  const localCanonicals: string[] = []

  // Helper: pick from a bucket using weighted random from its top candidates,
  // skipping items that would near-duplicate something already picked.
  const pickFromBucket = (bucket: IntentBucket | 'secondary_category'): Built | undefined => {
    const candidates = bucket === 'secondary_category'
      ? secondaryCategoryQuestions.filter((c) => !picked.has(c))
      : buckets[bucket as IntentBucket].filter((c) => !picked.has(c))

    if (candidates.length === 0) return undefined
    // Restrict random picking to the top 5 to keep relevance high.
    const top = candidates.slice(0, 5)
    // Try a few times to avoid near-duplicates of items already in result.
    for (let attempt = 0; attempt < Math.min(5, top.length); attempt++) {
      const pick = weightedRandomPick(top)
      if (!pick) return undefined
      const c = canonical(pick.prompt)
      const dup = localCanonicals.some((e) => e === c || isNearDuplicate(e, c))
      if (!dup) return pick
      // Remove the dup candidate and retry.
      const idx = top.indexOf(pick)
      if (idx >= 0) top.splice(idx, 1)
      if (top.length === 0) return undefined
    }
    return undefined
  }

  // Step 3: fill primary slots first
  for (const target of baseTargets) {
    if (result.length >= limit) break
    if (target.count === 0) continue
    const pick = pickFromBucket(target.bucket)
    if (pick) {
      result.push(pick)
      picked.add(pick)
      localCanonicals.push(canonical(pick.prompt))
    }
  }

  // Step 4: fill secondary category slots
  for (let i = 0; i < secondarySlotsTarget && result.length < limit; i++) {
    const pick = pickFromBucket('secondary_category')
    if (pick) {
      result.push(pick)
      picked.add(pick)
      localCanonicals.push(canonical(pick.prompt))
    }
  }

  // Step 5: if still short, fill from any bucket (still weighted-random from
  // a top slice, still skipping near-duplicates).
  if (result.length < limit) {
    const allRemaining: Built[] = []
    for (const key of Object.keys(buckets) as IntentBucket[]) {
      for (const item of buckets[key]) {
        if (!picked.has(item)) allRemaining.push(item)
      }
    }
    // Also include unpicked secondary category questions
    for (const item of secondaryCategoryQuestions) {
      if (!picked.has(item)) allRemaining.push(item)
    }
    allRemaining.sort((a, b) => b.score - a.score)
    while (result.length < limit && allRemaining.length > 0) {
      const top = allRemaining.slice(0, 8)
      const pick = weightedRandomPick(top)
      if (!pick) break
      const idx = allRemaining.indexOf(pick)
      if (idx >= 0) allRemaining.splice(idx, 1)
      const c = canonical(pick.prompt)
      if (localCanonicals.some((e) => e === c || isNearDuplicate(e, c))) continue
      result.push(pick)
      picked.add(pick)
      localCanonicals.push(c)
    }
  }

  return result
}

/**
 * Weight suggestions by offering type: 70% primary, 20% local, 10% secondary/generic.
 * Semantic deduplication (isNearDuplicate) ensures we don't show similar questions together.
 */
function weightByOffering(
  built: Array<{
    def: QueryDef
    prompt: string
    score: number
    themeMatched: Array<keyof KeywordThemes>
    offering: string
  }>,
  limit: number
) {
  const byOffering: Record<
    string,
    Array<{
      def: QueryDef
      prompt: string
      score: number
      themeMatched: Array<keyof KeywordThemes>
      offering: string
    }>
  > = {
    primary: [],
    local: [],
    secondary: [],
    generic: [],
  }
  for (const item of built) {
    const key = item.offering as keyof typeof byOffering
    if (byOffering[key]) byOffering[key].push(item)
    else byOffering.generic.push(item)
  }

  type Built = {
    def: QueryDef
    prompt: string
    score: number
    themeMatched: Array<keyof KeywordThemes>
    offering: string
  }
  const result: Built[] = []
  const needed = {
    primary: Math.round(limit * 0.7),
    local: Math.round(limit * 0.2),
    secondary: Math.round(limit * 0.1),
  }

  // Helper: pick from a list up to maxCount
  const pickUpTo = (items: Built[], maxCount: number) => {
    return items.slice(0, maxCount)
  }

  // Take up to needed amount from each category
  for (const [key, count] of Object.entries(needed)) {
    const items = byOffering[key as keyof typeof byOffering]
    result.push(...pickUpTo(items, count))
  }

  // If short, add generics
  if (result.length < limit) {
    const remaining = pickUpTo(byOffering.generic, limit - result.length)
    result.push(...remaining)
  }

  // If still short, add overflow from any category
  if (result.length < limit) {
    const allRemaining = [
      ...byOffering.primary.slice(needed.primary),
      ...byOffering.local.slice(needed.local),
      ...byOffering.secondary.slice(needed.secondary),
    ]
    const overflow = pickUpTo(allRemaining, limit - result.length)
    result.push(...overflow)
  }

  return result.slice(0, limit)
}
