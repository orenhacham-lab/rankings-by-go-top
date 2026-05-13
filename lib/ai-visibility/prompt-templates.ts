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
  | 'generic'

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

  if (/(perfume|fragrance|cologne|פרפיום|בושם|בשמים|או דה פרפיום|או דה טואלט)/.test(text)) return 'perfume'
  if (/(ניקיון|cleaner|cleaning|פוליש|נקיון|פוליסה|nettoyage)/.test(text)) return 'cleaning'
  if (/(seo|ppc|sem|google ads|adwords|agency|marketing|advertis|digital|קידום אתרים|ממומן|פרסום|שיווק|סוכנות|דיגיטל)/.test(text))
    return 'agency'
  if (/(sportwear|sportswear|sports|ספורט|נעלי ריצה|טייץ|adidas|nike|אדידס|נייקי|פומה|puma)/.test(text)) return 'sports_store'
  if (/(matnot|מתנ|gift shop|gifts|presents|מתנות)/.test(text)) return 'gifts'
  if (/(appliance|מקרר|מכונת כביסה|תנור|מוצרי חשמל|חשמל ביתי|electrolux|whirlpool)/.test(text)) return 'appliance_store'
  if (/(saas|app|software|cloud|platform|api|\.io|\.ai)/.test(text)) return 'saas'
  if (/(flower|florist|פרחים|זרים|זר)/.test(text)) return 'florist'
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
    { intent: 'recommendation', text: 'איזה בושם מומלץ לאישה?', score: 94, themeBoost: { audienceWomen: 6 } },
    { intent: 'recommendation', text: 'איזה בושם מומלץ לגבר?', score: 94, themeBoost: { audienceMen: 6 } },
    { intent: 'pre_purchase', text: 'איפה כדאי לקנות בשמים מקוריים אונליין?', score: 93, themeBoost: { online: 5 } },
    { intent: 'recommendation', text: 'אילו חנויות בשמים מומלצות בישראל?', score: 92 },
    { intent: 'pre_purchase', text: 'איך לבחור בושם שמתאים לי?', score: 90 },
    { intent: 'pre_purchase', text: 'איך יודעים אם בושם מקורי?', score: 89 },
    { intent: 'informational', text: 'אילו בשמים מחזיקים הרבה זמן?', score: 87 },
    { intent: 'comparison', text: 'מה ההבדל בין או דה פרפיום לאו דה טואלט?', score: 87 },
    { intent: 'gift', text: 'איזה בושם מתאים כמתנה?', score: 86, themeBoost: { gift: 8 } },
    { intent: 'local', text: 'איפה קונים בשמי נישה בישראל?', score: 85, themeBoost: { niche: 6 } },
    { intent: 'recommendation', text: 'אילו מותגי בושם נחשבים יוקרתיים?', score: 84 },
    { intent: 'commercial', text: 'איפה לקנות בשמים בהנחה?', score: 83, themeBoost: { price: 5 } },
    { intent: 'pre_purchase', text: 'איזה בושם מומלץ לעור רגיש?', score: 80 },
    { intent: 'informational', text: 'איך לבחור בושם לעונת הקיץ?', score: 78 },
    { intent: 'gift', text: 'איזה בושם מתאים לחתונה כמתנה?', score: 77, themeBoost: { gift: 4 } },
    { intent: 'local', text: 'חנויות בשמים מומלצות ב{{city}}', score: 82, requiresCity: true },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 70 },
  ],

  sports_store: [
    { intent: 'recommendation', text: 'אילו חנויות ספורט מומלצות בישראל?', score: 93 },
    { intent: 'pre_purchase', text: 'איך לבחור נעלי ריצה מתאימות?', score: 90 },
    { intent: 'recommendation', text: 'אילו מותגי ספורט מומלצים לאימון יומיומי?', score: 89 },
    { intent: 'recommendation', text: 'איפה כדאי לקנות נעלי ספורט בישראל?', score: 88 },
    { intent: 'pre_purchase', text: 'איפה לקנות ציוד ספורט אונליין?', score: 86, themeBoost: { online: 5 } },
    { intent: 'comparison', text: 'מה ההבדל בין נעלי ריצה לנעלי הליכה?', score: 85 },
    { intent: 'commercial', text: 'איזו חנות ספורט הכי משתלמת בישראל?', score: 84, themeBoost: { price: 4 } },
    { intent: 'recommendation', text: 'בגדי ספורט מומלצים לכושר', score: 82 },
    { intent: 'pre_purchase', text: 'איפה למצוא נעלי ספורט במידות גדולות?', score: 80 },
    { intent: 'recommendation', text: 'אילו חנויות ספורט עושות משלוחים מהירים?', score: 78, themeBoost: { online: 3 } },
    { intent: 'gift', text: 'מתנה לרץ מתחיל — מה כדאי לקנות?', score: 76, themeBoost: { gift: 6 } },
    { intent: 'local', text: 'חנות ספורט מומלצת ב{{city}}', score: 82, requiresCity: true },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 70 },
  ],

  gifts: [
    { intent: 'gift', text: 'איזו מתנה מומלצת לחתן וכלה?', score: 92 },
    { intent: 'gift', text: 'איזו מתנה לקנות לחבר טוב?', score: 90 },
    { intent: 'gift', text: 'מתנה לבר/בת מצווה — רעיונות מקוריים', score: 89 },
    { intent: 'recommendation', text: 'איפה כדאי לקנות מתנות מקוריות בישראל?', score: 88 },
    { intent: 'pre_purchase', text: 'איך לבחור מתנה ליום הולדת?', score: 87 },
    { intent: 'gift', text: 'מתנות מקוריות לעובדים', score: 85 },
    { intent: 'gift', text: 'איזו מתנה מתאימה לבני 30?', score: 84 },
    { intent: 'recommendation', text: 'אילו חנויות מתנות מומלצות לאונליין?', score: 83, themeBoost: { online: 4 } },
    { intent: 'gift', text: 'מתנות לאמא ליום הולדת', score: 80, themeBoost: { audienceWomen: 3 } },
    { intent: 'gift', text: 'מתנות לאבא ליום הולדת', score: 80, themeBoost: { audienceMen: 3 } },
    { intent: 'commercial', text: 'איפה לקנות מתנות במחירים זולים?', score: 78, themeBoost: { price: 4 } },
    { intent: 'local', text: 'חנות מתנות מומלצת ב{{city}}', score: 80, requiresCity: true },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 70 },
  ],

  appliance_store: [
    { intent: 'recommendation', text: 'אילו חנויות מוצרי חשמל מומלצות בישראל?', score: 92 },
    { intent: 'pre_purchase', text: 'איך לבחור מכונת כביסה?', score: 88 },
    { intent: 'pre_purchase', text: 'איך לבחור מקרר למשפחה?', score: 87 },
    { intent: 'commercial', text: 'איפה הכי משתלם לקנות מוצרי חשמל?', score: 86, themeBoost: { price: 5 } },
    { intent: 'recommendation', text: 'איפה לקנות מקרר אונליין?', score: 85, themeBoost: { online: 5 } },
    { intent: 'pre_purchase', text: 'איזה תנור מומלץ למטבח קטן?', score: 82 },
    { intent: 'comparison', text: 'מה ההבדל בין מקרר רגיל למקרר נו-פרוסט?', score: 80 },
    { intent: 'commercial', text: 'באיזו תקופה משתלם לקנות מוצרי חשמל?', score: 78, themeBoost: { price: 3 } },
    { intent: 'local', text: 'חנות מוצרי חשמל מומלצת ב{{city}}', score: 80, requiresCity: true },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 70 },
  ],

  agency: [
    { intent: 'recommendation', text: 'אילו סוכנויות SEO מומלצות בישראל?', score: 94 },
    { intent: 'recommendation', text: 'מי מומלץ לקידום אורגני בישראל?', score: 92 },
    { intent: 'recommendation', text: 'מי החברות המובילות בקידום אתרים?', score: 90 },
    { intent: 'pre_purchase', text: 'איך לבחור חברת קידום אתרים?', score: 89 },
    { intent: 'pre_purchase', text: 'מה צריך לבדוק לפני שכירת חברת SEO?', score: 88 },
    { intent: 'comparison', text: 'מה עדיף — קידום אורגני או ממומן?', score: 87 },
    { intent: 'comparison', text: 'השוואה בין חברות שיווק דיגיטלי בישראל', score: 85 },
    { intent: 'commercial', text: 'כמה עולה קידום אתרים בישראל?', score: 89, themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'כמה עולה ניהול Google Ads?', score: 87, themeBoost: { price: 3 } },
    { intent: 'recommendation', text: 'מומחי Google Ads מומלצים לעסקים קטנים', score: 84 },
    { intent: 'informational', text: 'כמה זמן לוקח לראות תוצאות מ-SEO?', score: 82 },
    { intent: 'local', text: 'חברת קידום אתרים מומלצת ב{{city}}', score: 82, requiresCity: true },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 72 },
  ],

  cleaning: [
    { intent: 'recommendation', text: 'מי חברות הניקיון המומלצות לעסקים?', score: 92 },
    { intent: 'recommendation', text: 'אילו חברות ניקיון מומלצות לבית פרטי?', score: 90 },
    { intent: 'pre_purchase', text: 'איך לבחור חברת ניקיון אמינה?', score: 88 },
    { intent: 'commercial', text: 'כמה עולה ניקיון משרדים?', score: 88, themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'מחיר לניקיון בית חודשי', score: 85, themeBoost: { price: 3 } },
    { intent: 'informational', text: 'באיזו תדירות צריך לנקות משרד?', score: 80 },
    { intent: 'comparison', text: 'מה ההבדל בין חברת ניקיון פרטית למקצועית?', score: 78 },
    { intent: 'local', text: 'חברת ניקיון משרדים מומלצת ב{{city}}', score: 90, requiresCity: true },
    { intent: 'local', text: 'שירותי ניקיון לעסקים ב{{city}}', score: 86, requiresCity: true },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 70 },
  ],

  ecommerce: [
    { intent: 'recommendation', text: 'אילו חנויות אונליין מומלצות בישראל?', score: 88 },
    { intent: 'commercial', text: 'איפה לקנות הכי זול אונליין בישראל?', score: 86, themeBoost: { price: 4 } },
    { intent: 'comparison', text: 'השוואה בין חנויות אונליין מובילות בישראל', score: 84 },
    { intent: 'pre_purchase', text: 'איך לבחור חנות אונליין אמינה?', score: 84 },
    { intent: 'informational', text: 'מה הזכויות שלי אם המוצר פגום?', score: 80 },
    { intent: 'pre_purchase', text: 'איך בודקים אמינות של חנות אונליין?', score: 78 },
    { intent: 'commercial', text: 'אילו חנויות מציעות משלוח חינם בישראל?', score: 76 },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 70 },
  ],

  saas: [
    { intent: 'recommendation', text: 'אילו כלי SaaS מומלצים לעסקים בישראל?', score: 90 },
    { intent: 'recommendation', text: 'אילו כלי AI מומלצים לעסקים?', score: 88 },
    { intent: 'comparison', text: 'מה ההבדל בין {{business}} למתחרים?', score: 85 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 88 },
    { intent: 'alternatives', text: 'מה דומה ל-{{business}} אבל זול יותר?', score: 84, themeBoost: { price: 3 } },
    { intent: 'commercial', text: 'כמה עולה {{business}}?', score: 80, themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'איך מתחילים להשתמש ב-{{business}}?', score: 75 },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  florist: [
    { intent: 'recommendation', text: 'אילו חנויות פרחים מומלצות בישראל?', score: 90 },
    { intent: 'pre_purchase', text: 'איך לבחור זר פרחים לאירוע?', score: 84 },
    { intent: 'commercial', text: 'מחירים לזרי פרחים לאירועים', score: 82, themeBoost: { price: 3 } },
    { intent: 'local', text: 'משלוח פרחים מהיר ב{{city}}', score: 88, requiresCity: true },
    { intent: 'local', text: 'חנות פרחים פתוחה עכשיו ב{{city}}', score: 84, requiresCity: true },
    { intent: 'gift', text: 'אילו פרחים מתאימים כמתנה לאישה?', score: 80, themeBoost: { gift: 4 } },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  restaurant: [
    { intent: 'recommendation', text: 'מהן המסעדות הכי מומלצות ב{{city}}?', score: 92, requiresCity: true },
    { intent: 'recommendation', text: 'מסעדות חדשות ומומלצות ב{{city}}', score: 88, requiresCity: true },
    { intent: 'local', text: 'מסעדה רומנטית ב{{city}}', score: 86, requiresCity: true },
    { intent: 'local', text: 'מסעדה כשרה מומלצת ב{{city}}', score: 82, requiresCity: true },
    { intent: 'commercial', text: 'מסעדה במחיר סביר ב{{city}}', score: 80, requiresCity: true, themeBoost: { price: 3 } },
    { intent: 'informational', text: 'איפה לחגוג יום הולדת ב{{city}}?', score: 80, requiresCity: true },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  healthcare: [
    { intent: 'recommendation', text: 'מרפאות פרטיות מומלצות בישראל', score: 90 },
    { intent: 'recommendation', text: 'אילו רופאים מומלצים לטיפול פרטי?', score: 86 },
    { intent: 'recommendation', text: 'מרפאת שיניים מומלצת ב{{city}}', score: 88, requiresCity: true },
    { intent: 'local', text: 'רופא מומחה מומלץ ב{{city}}', score: 84, requiresCity: true },
    { intent: 'pre_purchase', text: 'איך לבחור רופא פרטי טוב?', score: 80 },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  legal: [
    { intent: 'recommendation', text: 'משרדי עורכי דין מובילים בישראל', score: 92 },
    { intent: 'recommendation', text: 'אילו עורכי דין מומלצים לדיני משפחה?', score: 88 },
    { intent: 'recommendation', text: 'עורך דין פלילי מומלץ בישראל', score: 86 },
    { intent: 'pre_purchase', text: 'איך לבחור עורך דין מקצועי?', score: 84 },
    { intent: 'commercial', text: 'כמה עולה ייעוץ משפטי?', score: 86, themeBoost: { price: 3 } },
    { intent: 'informational', text: 'מתי כדאי לפנות לעורך דין?', score: 78 },
    { intent: 'local', text: 'עורך דין מומלץ ב{{city}}', score: 82, requiresCity: true },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  real_estate: [
    { intent: 'recommendation', text: 'אילו חברות נדל"ן מומלצות בישראל?', score: 90 },
    { intent: 'recommendation', text: 'מתווכים מומלצים ב{{city}}', score: 86, requiresCity: true },
    { intent: 'pre_purchase', text: 'איך לבחור מתווך נדל"ן אמין?', score: 84 },
    { intent: 'commercial', text: 'כמה גובה מתווך נדל"ן?', score: 84, themeBoost: { price: 3 } },
    { intent: 'informational', text: 'מה צריך לבדוק לפני קניית דירה?', score: 80 },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  fitness: [
    { intent: 'recommendation', text: 'אילו חדרי כושר מומלצים ב{{city}}?', score: 88, requiresCity: true },
    { intent: 'recommendation', text: 'מאמן כושר אישי מומלץ ב{{city}}', score: 84, requiresCity: true },
    { intent: 'commercial', text: 'כמה עולה מנוי לחדר כושר?', score: 84, themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'איך לבחור חדר כושר נכון?', score: 80 },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  beauty: [
    { intent: 'recommendation', text: 'מספרות מומלצות ב{{city}}', score: 88, requiresCity: true },
    { intent: 'recommendation', text: 'סלון יופי מומלץ ב{{city}}', score: 86, requiresCity: true },
    { intent: 'pre_purchase', text: 'איפה לעשות מניקור מקצועי ב{{city}}?', score: 82, requiresCity: true },
    { intent: 'commercial', text: 'מחירים לטיפולי יופי ב{{city}}', score: 80, requiresCity: true, themeBoost: { price: 3 } },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  education: [
    { intent: 'recommendation', text: 'אילו קורסי הייטק מומלצים בישראל?', score: 88 },
    { intent: 'recommendation', text: 'בתי ספר ומכללות מומלצים', score: 84 },
    { intent: 'commercial', text: 'כמה עולה קורס מקצועי בהייטק?', score: 84, themeBoost: { price: 3 } },
    { intent: 'comparison', text: 'השוואה בין מכללות פרטיות בישראל', score: 80 },
    { intent: 'pre_purchase', text: 'איך לבחור קורס מקצועי?', score: 78 },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  local_service: [
    { intent: 'recommendation', text: 'אילו בעלי מקצוע מומלצים ב{{city}}?', score: 88, requiresCity: true },
    { intent: 'recommendation', text: 'חשמלאי מומלץ ב{{city}}', score: 86, requiresCity: true },
    { intent: 'recommendation', text: 'אינסטלטור מומלץ ב{{city}}', score: 86, requiresCity: true },
    { intent: 'commercial', text: 'מחירים לשירות מקצועי ב{{city}}', score: 80, requiresCity: true, themeBoost: { price: 3 } },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
  ],

  generic: [
    { intent: 'recommendation', text: 'אילו עסקים מומלצים בתחום של {{business}}?', score: 78 },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 72 },
    { intent: 'alternatives', text: 'אלטרנטיבות ל-{{business}}', score: 70 },
    { intent: 'informational', text: 'מה התחום של {{business}}?', score: 68 },
  ],
}

/**
 * English curated banks. Smaller — Hebrew is the main supported language.
 */
const EN_BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    { intent: 'recommendation', text: 'Best perfume for women', score: 92, themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'Best perfume for men', score: 92, themeBoost: { audienceMen: 5 } },
    { intent: 'pre_purchase', text: 'Where to buy authentic perfumes online', score: 90, themeBoost: { online: 5 } },
    { intent: 'recommendation', text: 'Top recommended perfume stores in {{country}}', score: 88 },
    { intent: 'pre_purchase', text: 'How to choose a perfume that suits you', score: 86 },
    { intent: 'comparison', text: 'Difference between Eau de Parfum and Eau de Toilette', score: 85 },
    { intent: 'gift', text: 'Best perfumes as a gift', score: 84, themeBoost: { gift: 5 } },
    { intent: 'recommendation', text: 'Niche perfume brands worth trying', score: 82, themeBoost: { niche: 4 } },
    { intent: 'commercial', text: 'Where to buy perfumes with discounts', score: 80, themeBoost: { price: 4 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  sports_store: [
    { intent: 'recommendation', text: 'Best sports stores in {{country}}', score: 90 },
    { intent: 'pre_purchase', text: 'How to choose running shoes that fit', score: 88 },
    { intent: 'recommendation', text: 'Best sportswear brands for daily training', score: 86 },
    { intent: 'comparison', text: 'Running vs walking shoes — what is the difference?', score: 82 },
    { intent: 'commercial', text: 'Cheapest sports store in {{country}}', score: 82, themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  gifts: [
    { intent: 'gift', text: 'Best wedding gift ideas', score: 88 },
    { intent: 'gift', text: 'Original birthday gift ideas', score: 86 },
    { intent: 'gift', text: 'Corporate gift ideas for employees', score: 84 },
    { intent: 'recommendation', text: 'Best places to buy original gifts in {{country}}', score: 84 },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  appliance_store: [
    { intent: 'recommendation', text: 'Best home appliance stores in {{country}}', score: 88 },
    { intent: 'pre_purchase', text: 'How to choose a washing machine', score: 84 },
    { intent: 'commercial', text: 'Cheapest place to buy appliances online', score: 82, themeBoost: { online: 3, price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  agency: [
    { intent: 'recommendation', text: 'Best SEO agencies in {{country}}', score: 92 },
    { intent: 'recommendation', text: 'Top digital marketing agencies in {{country}}', score: 90 },
    { intent: 'pre_purchase', text: 'How to choose a digital marketing agency', score: 86 },
    { intent: 'comparison', text: 'SEO vs PPC — which is better?', score: 84 },
    { intent: 'commercial', text: 'How much does SEO cost in {{country}}?', score: 88, themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  cleaning: [
    { intent: 'recommendation', text: 'Best office cleaning companies in {{city}}', score: 92, requiresCity: true },
    { intent: 'pre_purchase', text: 'How to choose a reliable cleaning company', score: 84 },
    { intent: 'commercial', text: 'Office cleaning cost per month', score: 84, themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  ecommerce: [
    { intent: 'recommendation', text: 'Best online stores in {{country}}', score: 86 },
    { intent: 'comparison', text: 'Cheapest place to buy online in {{country}}', score: 84, themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'How to verify if an online store is reliable', score: 82 },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  saas: [
    { intent: 'recommendation', text: 'Best SaaS tools for businesses in {{country}}', score: 88 },
    { intent: 'comparison', text: 'How does {{business}} compare to competitors?', score: 84 },
    { intent: 'alternatives', text: 'Alternatives to {{business}}', score: 88 },
    { intent: 'commercial', text: 'How much does {{business}} cost?', score: 80, themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  florist: [
    { intent: 'recommendation', text: 'Best florist in {{city}}', score: 88, requiresCity: true },
    { intent: 'local', text: 'Same-day flower delivery in {{city}}', score: 84, requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  restaurant: [
    { intent: 'recommendation', text: 'Best restaurants in {{city}}', score: 90, requiresCity: true },
    { intent: 'local', text: 'Romantic dinner places in {{city}}', score: 84, requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  healthcare: [
    { intent: 'recommendation', text: 'Top private clinics in {{city}}', score: 88, requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  legal: [
    { intent: 'recommendation', text: 'Top law firms in {{country}}', score: 88 },
    { intent: 'commercial', text: 'Legal consultation fees in {{country}}', score: 82, themeBoost: { price: 3 } },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  real_estate: [
    { intent: 'recommendation', text: 'Best real estate agents in {{city}}', score: 88, requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  fitness: [
    { intent: 'recommendation', text: 'Best gyms in {{city}}', score: 88, requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  beauty: [
    { intent: 'recommendation', text: 'Best salons in {{city}}', score: 88, requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  education: [
    { intent: 'recommendation', text: 'Best tech courses in {{country}}', score: 86 },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  local_service: [
    { intent: 'recommendation', text: 'Recommended professionals in {{city}}', score: 86, requiresCity: true },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
  ],

  generic: [
    { intent: 'recommendation', text: 'Recommended businesses similar to {{business}}', score: 76 },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 72 },
    { intent: 'alternatives', text: 'Alternatives to {{business}}', score: 70 },
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
 * Lightweight Hebrew quality check.
 */
function isReadableHebrew(text: string): boolean {
  if (!text) return false
  if (/(לל|בב|מה ל|של של)/.test(text)) return false
  if (/\{\{[^}]+\}\}/.test(text)) return false
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
  // If 80% or more tokens overlap and total length is comparable, treat as dup
  return intersection / minLen >= 0.8 && Math.abs(maxLen - minLen) <= 1
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
 * Generate smart AI query suggestions, business-context driven.
 *
 * @param ctx Project context: business, domain, city, country, language
 * @param keywords Tracked keywords used ONLY as theme signals
 * @param shuffle If true, randomize order before slicing
 * @param limit Maximum number of suggestions to return (default 12)
 */
export function generatePromptSuggestions({
  businessName,
  domain,
  city = null,
  country = null,
  language = 'he',
  keywords = [],
  shuffle = false,
  limit = 12,
}: {
  businessName: string | null
  domain: string | null
  city?: string | null
  country?: string | null
  language?: string | null
  keywords?: string[]
  shuffle?: boolean
  limit?: number
}): PromptSuggestion[] {
  const business = businessName || ''
  const dom = domain || ''
  const lang = language === 'en' ? 'en' : 'he'
  const themes = extractThemes(keywords)
  const ctx: TemplateContext = { business, domain: dom, city, country, language: lang, themes }
  const category = detectCategory(business, dom, keywords)
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
  }
  const built: Built[] = []
  for (const def of eligible) {
    const filled = fillTemplate(def.text, ctx).trim()
    if (lang === 'he' && !isReadableHebrew(filled)) continue
    let score = def.score
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
    if (score < MIN_QUALITY_SCORE) continue
    built.push({ def, prompt: filled, score, themeMatched: matched })
  }

  // Semantic deduplication — drop near-duplicates, keep higher-scoring one
  built.sort((a, b) => b.score - a.score)
  const keptCanonicals: string[] = []
  const kept: Built[] = []
  for (const item of built) {
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

  // Build final suggestions
  const suggestions: PromptSuggestion[] = kept.map((item, idx) => ({
    id: `q-${idx}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: item.prompt,
    intent: item.def.intent,
    intentLabel: intentLabels[item.def.intent],
    category,
    language: lang,
    qualityScore: item.score,
    reason: buildReason(item.def, category, ctx, item.themeMatched),
  }))

  if (shuffle) {
    for (let i = suggestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[suggestions[i], suggestions[j]] = [suggestions[j], suggestions[i]]
    }
  }

  return suggestions.slice(0, limit)
}
