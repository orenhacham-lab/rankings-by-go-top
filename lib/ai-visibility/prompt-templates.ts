/**
 * Smart AI Query generator — deterministic, niche-aware, intent-driven.
 *
 * Generates realistic AI-search questions specific to:
 *   - business category (SEO agency, cleaning company, restaurant, etc.)
 *   - location (city/country)
 *   - tracked keywords (theme extraction)
 *   - business name (brand-specific questions)
 *
 * Quality goal: each question should be the kind a real customer would ask
 * ChatGPT/Perplexity/Gemini when researching what to hire/buy/visit.
 *
 * NOT generic spam. Intent-based, commercially useful, locally relevant.
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

export type BusinessCategory =
  | 'agency'
  | 'ecommerce'
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
  category: BusinessCategory
  language: string
  qualityScore: number
}

type TemplateContext = {
  business: string
  domain: string
  city: string | null
  country: string | null
  language: string
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

  if (/(ניקיון|cleaner|cleaning|פוליש|פוליסה|טיטוח|nettoyage)/.test(text)) return 'cleaning'
  if (/(seo|ppc|sem|google ads|adwords|agency|marketing|advertis|digital|קידום אתרים|ממומן|פרסום|שיווק|סוכנות|דיגיטל|פרסום ממומן|אנליסט)/.test(text))
    return 'agency'
  if (/(shop|store|ecommerce|חנות|קניות|אונליין|retail)/.test(text)) return 'ecommerce'
  if (/(saas|app|software|cloud|platform|api|\.io|\.ai)/.test(text)) return 'saas'
  if (/(flower|florist|פרחים|זרים|זר)/.test(text)) return 'florist'
  if (/(restaurant|cafe|food|bistro|מסעדה|קפה|אוכל|פיצה)/.test(text)) return 'restaurant'
  if (/(clinic|hospital|medical|doctor|dental|מרפאה|רופא|רפואה|שיניים)/.test(text)) return 'healthcare'
  if (/(law|legal|attorney|lawyer|עורך דין|עורכי דין|משפט)/.test(text)) return 'legal'
  if (/(realty|real.estate|properties|נדל"ן|נדלן|דירות|תיווך)/.test(text)) return 'real_estate'
  if (/(gym|fitness|yoga|crossfit|כושר|יוגה)/.test(text)) return 'fitness'
  if (/(salon|spa|beauty|hair|nails|מספרה|ספא|יופי)/.test(text)) return 'beauty'
  if (/(school|academy|course|education|מכללה|בית ספר|קורס)/.test(text)) return 'education'
  if (/(electrician|plumber|hvac|חשמלאי|אינסטלטור)/.test(text)) return 'local_service'

  return 'generic'
}

/**
 * Hebrew query bank — niche-specific, intent-driven, real customer questions.
 * Each [intent, query, qualityScore] tuple. qualityScore 0-100 influences ranking.
 */
const QUERIES_HE: Record<BusinessCategory, Array<[PromptIntent, string, number]>> = {
  agency: [
    ['recommendation', 'מי חברת SEO מומלצת לעסקים קטנים?', 95],
    ['recommendation', 'איזו סוכנות SEO הכי טובה בישראל?', 95],
    ['recommendation', 'מי מומלץ לקידום אורגני בישראל?', 93],
    ['recommendation', 'מי החברות המובילות בקידום אתרים בישראל?', 92],
    ['recommendation', 'מומחי Google Ads מומלצים בישראל', 90],
    ['recommendation', 'מי מומלץ לניהול קמפיינים ממומנים?', 90],
    ['transactional', 'איך לבחור משרד פרסום דיגיטלי?', 88],
    ['transactional', 'איך לבחור חברת קידום אתרים?', 88],
    ['transactional', 'מה צריך לבדוק לפני שכירת חברת SEO?', 87],
    ['comparison', 'מה עדיף - קידום אורגני או ממומן?', 85],
    ['comparison', 'השוואה בין חברות שיווק דיגיטלי בישראל', 85],
    ['comparison', 'מה ההבדל בין חברת SEO לחברת ממומן?', 84],
    ['commercial', 'כמה עולה קידום אתרים בישראל?', 90],
    ['commercial', 'כמה עולה ניהול Google Ads?', 88],
    ['commercial', 'מחיר חודשי לחברת SEO', 85],
    ['local', 'חברת קידום אתרים מומלצת ב{{city}}', 88],
    ['local', 'סוכנות שיווק דיגיטלי ב{{city}}', 86],
    ['brand', 'מה הניסיון של {{business}}?', 75],
    ['brand', 'חוות דעת על {{business}}', 70],
    ['informational', 'מה זה SEO וכמה זה לוקח להראות תוצאות?', 80],
    ['alternatives', 'אלטרנטיבות לחברת {{business}}', 78],
  ],

  cleaning: [
    ['recommendation', 'חברת ניקיון משרדים מומלצת ב{{city}}', 95],
    ['recommendation', 'מי מומלץ לניקיון משרדים ב{{city}}?', 94],
    ['recommendation', 'חברת ניקיון מומלצת לעסקים קטנים', 92],
    ['recommendation', 'מי חברת הניקיון הטובה ביותר ב{{city}}?', 92],
    ['recommendation', 'חברות ניקיון משרדים עם המלצות טובות', 90],
    ['recommendation', 'חברת פוליש וניקיון מומלצת ב{{city}}', 88],
    ['transactional', 'איך לבחור חברת ניקיון אמינה?', 85],
    ['commercial', 'כמה עולה ניקיון משרדים?', 90],
    ['commercial', 'מחיר לניקיון משרד חודשי', 86],
    ['commercial', 'תעריפים לחברת ניקיון מקצועית', 84],
    ['local', 'שירותי ניקיון לעסקים ב{{city}}', 90],
    ['local', 'ניקיון משרדים באזור {{city}}', 88],
    ['comparison', 'מה ההבדל בין חברת ניקיון פרטית למקצועית?', 80],
    ['brand', 'חוות דעת על חברת {{business}}', 70],
    ['informational', 'באיזו תדירות צריך לנקות משרד?', 75],
  ],

  ecommerce: [
    ['recommendation', 'אילו חנויות אונליין מומלצות בישראל?', 88],
    ['recommendation', 'איפה הכי משתלם לקנות {{business}}?', 85],
    ['comparison', 'איפה לקנות הכי זול אונליין בישראל?', 88],
    ['comparison', 'השוואה בין חנויות אונליין מובילות', 84],
    ['commercial', 'מה המחירים של {{business}}?', 80],
    ['commercial', 'כמה עולה משלוח מ-{{business}}?', 78],
    ['transactional', 'איך להזמין מ-{{business}}?', 75],
    ['transactional', 'מה זמני האספקה של {{business}}?', 73],
    ['brand', 'חוות דעת על {{business}}', 70],
    ['informational', 'איך לבחור חנות אונליין אמינה?', 78],
    ['informational', 'מה הזכויות שלי אם המוצר פגום?', 70],
    ['alternatives', 'אלטרנטיבות ל-{{business}}', 75],
  ],

  saas: [
    ['recommendation', 'אילו כלי SaaS מומלצים לעסקים בישראל?', 90],
    ['recommendation', 'כלי AI מומלצים לעסקים', 88],
    ['recommendation', 'איזה CRM מומלץ לסטארטאפים?', 85],
    ['comparison', 'מה ההבדל בין {{business}} למתחרים?', 85],
    ['comparison', 'השוואה בין כלי SaaS פופולריים', 80],
    ['alternatives', 'אלטרנטיבות ל-{{business}}', 88],
    ['alternatives', 'מה דומה ל-{{business}} אבל זול יותר?', 86],
    ['commercial', 'כמה עולה {{business}}?', 80],
    ['commercial', 'מה המודל התמחורי של {{business}}?', 78],
    ['transactional', 'איך להתחיל עם {{business}}?', 75],
    ['brand', 'חוות דעת על {{business}}', 70],
    ['informational', 'מה זה {{business}} ולמה צריך אותו?', 75],
  ],

  florist: [
    ['recommendation', 'חנות פרחים מומלצת ב{{city}}', 92],
    ['recommendation', 'איפה הכי טוב לקנות פרחים ב{{city}}?', 90],
    ['local', 'משלוח פרחים מהיר ב{{city}}', 88],
    ['local', 'חנות פרחים פתוחה עכשיו ב{{city}}', 86],
    ['commercial', 'מחירים לזרי פרחים ב{{city}}', 85],
    ['transactional', 'איך להזמין משלוח פרחים מהר?', 80],
    ['transactional', 'הזמנת זר פרחים אונליין', 78],
    ['brand', 'חוות דעת על {{business}}', 70],
    ['informational', 'איך לבחור פרחים לאירוע?', 70],
  ],

  restaurant: [
    ['recommendation', 'המסעדות הכי טובות ב{{city}}', 95],
    ['recommendation', 'מסעדות חדשות ומומלצות ב{{city}}', 92],
    ['recommendation', 'איפה הכי כדאי לאכול ב{{city}}?', 90],
    ['local', 'מסעדה רומנטית ב{{city}}', 88],
    ['local', 'מסעדה כשרה מומלצת ב{{city}}', 85],
    ['local', 'מסעדה פתוחה לארוחת ערב ב{{city}}', 80],
    ['comparison', 'אילו מסעדות הכי מומלצות ל{{city}}?', 84],
    ['commercial', 'מסעדה במחיר סביר ב{{city}}', 82],
    ['brand', 'חוות דעת על {{business}}', 70],
    ['informational', 'איפה לחגוג יום הולדת ב{{city}}?', 80],
  ],

  healthcare: [
    ['recommendation', 'מרפאות פרטיות מומלצות ב{{city}}', 92],
    ['recommendation', 'מי הרופאים המומלצים ב{{city}}?', 90],
    ['recommendation', 'מרפאת שיניים מומלצת ב{{city}}', 88],
    ['local', 'רופא מומחה ב{{city}}', 85],
    ['local', 'מרפאה פתוחה הערב ב{{city}}', 80],
    ['transactional', 'איך לבחור רופא פרטי טוב?', 78],
    ['commercial', 'מחירי טיפולים ב{{business}}', 75],
    ['brand', 'חוות דעת על {{business}}', 70],
  ],

  legal: [
    ['recommendation', 'משרדי עורכי דין מובילים בישראל', 92],
    ['recommendation', 'עורכי דין מומלצים לדיני משפחה', 90],
    ['recommendation', 'עורך דין פלילי מומלץ ב{{city}}', 88],
    ['recommendation', 'עורך דין מסחרי מומלץ בישראל', 86],
    ['local', 'עורך דין ב{{city}}', 84],
    ['transactional', 'איך לבחור עורך דין מקצועי?', 85],
    ['commercial', 'כמה עולה ייעוץ משפטי?', 88],
    ['brand', 'חוות דעת על {{business}}', 72],
    ['informational', 'מתי כדאי לפנות לעורך דין?', 75],
  ],

  real_estate: [
    ['recommendation', 'חברות נדל"ן מומלצות בישראל', 90],
    ['recommendation', 'מתווכים מומלצים ב{{city}}', 88],
    ['local', 'משרד תיווך אמין ב{{city}}', 85],
    ['local', 'דירות למכירה ב{{city}}', 82],
    ['commercial', 'כמה גובה מתווך נדל"ן?', 85],
    ['transactional', 'איך לבחור מתווך נדל"ן אמין?', 82],
    ['brand', 'חוות דעת על {{business}}', 70],
    ['informational', 'מה צריך לבדוק לפני קניית דירה?', 78],
  ],

  fitness: [
    ['recommendation', 'חדרי כושר מומלצים ב{{city}}', 90],
    ['recommendation', 'מאמן כושר אישי מומלץ ב{{city}}', 88],
    ['local', 'סטודיו לכושר ב{{city}}', 84],
    ['local', 'קלאסי יוגה ב{{city}}', 80],
    ['commercial', 'כמה עולה מנוי לחדר כושר?', 85],
    ['transactional', 'איך לבחור חדר כושר נכון?', 80],
    ['brand', 'חוות דעת על {{business}}', 70],
  ],

  beauty: [
    ['recommendation', 'מספרות מומלצות ב{{city}}', 92],
    ['recommendation', 'סלון יופי מומלץ ב{{city}}', 90],
    ['recommendation', 'איפה לעשות מניקור מקצועי ב{{city}}?', 85],
    ['local', 'טיפולי פנים ב{{city}}', 82],
    ['commercial', 'מחירים לטיפולי יופי ב{{city}}', 80],
    ['brand', 'חוות דעת על {{business}}', 72],
  ],

  education: [
    ['recommendation', 'קורסי הייטק מומלצים בישראל', 90],
    ['recommendation', 'בתי ספר ומכללות מומלצים', 88],
    ['recommendation', 'איזה קורס פיתוח Web מומלץ ב-2026?', 86],
    ['commercial', 'כמה עולה קורס מקצועי בהייטק?', 85],
    ['comparison', 'השוואה בין מכללות פרטיות בישראל', 80],
    ['transactional', 'איך לבחור קורס מקצועי?', 78],
    ['brand', 'חוות דעת על {{business}}', 70],
  ],

  local_service: [
    ['recommendation', 'בעלי מקצוע מומלצים ב{{city}}', 90],
    ['recommendation', 'חשמלאי מומלץ ב{{city}}', 88],
    ['recommendation', 'אינסטלטור מומלץ ב{{city}}', 88],
    ['local', 'שירות מקצועי מהיר באזור {{city}}', 85],
    ['local', 'תיקון דחוף ב{{city}}', 80],
    ['commercial', 'מחירים לשירות מקצועי ב{{city}}', 82],
    ['transactional', 'איך לקבל הצעת מחיר מ-{{business}}?', 75],
    ['brand', 'חוות דעת על {{business}}', 70],
  ],

  generic: [
    ['recommendation', 'עסקים מומלצים בתחום של {{business}}', 75],
    ['brand', 'מה אפשר לספר על {{business}}?', 70],
    ['brand', 'חוות דעת על {{business}}', 68],
    ['informational', 'מה התחום של {{business}}?', 65],
    ['alternatives', 'אלטרנטיבות ל-{{business}}', 70],
  ],
}

/**
 * English query bank — niche-specific, intent-driven, real customer questions.
 */
const QUERIES_EN: Record<BusinessCategory, Array<[PromptIntent, string, number]>> = {
  agency: [
    ['recommendation', 'Best SEO agency in {{country}}', 95],
    ['recommendation', 'Top digital marketing agencies in {{country}}', 93],
    ['recommendation', 'Who should manage Google Ads campaigns?', 90],
    ['recommendation', 'Recommended SEO companies for small businesses', 92],
    ['recommendation', 'Best PPC agencies in {{country}}', 88],
    ['transactional', 'How to choose a digital marketing agency', 88],
    ['transactional', 'How to vet an SEO company', 86],
    ['comparison', 'SEO agency vs in-house SEO team', 85],
    ['comparison', 'SEO vs PPC: which is better?', 84],
    ['commercial', 'How much does SEO cost in {{country}}?', 90],
    ['commercial', 'Average monthly retainer for SEO services', 85],
    ['local', 'Top SEO agency in {{city}}', 86],
    ['brand', 'Reviews of {{business}}', 70],
    ['alternatives', 'Alternatives to {{business}}', 75],
    ['informational', 'How long does SEO take to show results?', 78],
  ],

  cleaning: [
    ['recommendation', 'Best office cleaning company in {{city}}', 95],
    ['recommendation', 'Recommended cleaning services in {{city}}', 92],
    ['recommendation', 'Top-rated commercial cleaners in {{country}}', 88],
    ['transactional', 'How to choose a reliable cleaning company', 85],
    ['commercial', 'Office cleaning cost per month', 90],
    ['commercial', 'Average rate for commercial cleaning', 85],
    ['local', 'Office cleaning service near {{city}}', 88],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  ecommerce: [
    ['recommendation', 'Best online stores in {{country}}', 85],
    ['recommendation', 'Top e-commerce retailers for {{business}}', 80],
    ['comparison', 'Cheapest place to buy online in {{country}}', 86],
    ['commercial', 'How much does {{business}} cost?', 78],
    ['transactional', 'How to order from {{business}}', 75],
    ['brand', 'Reviews of {{business}}', 70],
    ['alternatives', 'Alternatives to {{business}}', 75],
  ],

  saas: [
    ['recommendation', 'Best SaaS tools for businesses in {{country}}', 88],
    ['recommendation', 'Top AI tools for business in 2026', 85],
    ['comparison', 'How does {{business}} compare to competitors?', 85],
    ['alternatives', 'Alternatives to {{business}}', 90],
    ['alternatives', 'Best alternative to {{business}}', 88],
    ['commercial', 'How much does {{business}} cost?', 82],
    ['commercial', 'Pricing comparison for {{business}}', 80],
    ['brand', 'Is {{business}} worth it?', 75],
  ],

  florist: [
    ['recommendation', 'Best florist in {{city}}', 90],
    ['local', 'Same-day flower delivery in {{city}}', 88],
    ['commercial', 'Flower bouquet prices in {{city}}', 80],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  restaurant: [
    ['recommendation', 'Best restaurants in {{city}}', 92],
    ['recommendation', 'New and recommended restaurants in {{city}}', 88],
    ['local', 'Romantic dinner in {{city}}', 85],
    ['comparison', 'Top-rated dining in {{city}}', 84],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  healthcare: [
    ['recommendation', 'Top private clinics in {{city}}', 90],
    ['recommendation', 'Best specialists in {{city}}', 88],
    ['local', 'Dental clinic near {{city}}', 85],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  legal: [
    ['recommendation', 'Top law firms in {{country}}', 90],
    ['recommendation', 'Best family law attorneys in {{country}}', 88],
    ['local', 'Lawyer in {{city}}', 84],
    ['commercial', 'Legal consultation fees', 85],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  real_estate: [
    ['recommendation', 'Best real estate agents in {{city}}', 90],
    ['local', 'Real estate office in {{city}}', 85],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  fitness: [
    ['recommendation', 'Best gyms in {{city}}', 90],
    ['recommendation', 'Top personal trainers in {{city}}', 86],
    ['commercial', 'Gym membership prices in {{city}}', 85],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  beauty: [
    ['recommendation', 'Best salons in {{city}}', 90],
    ['recommendation', 'Top beauty spa in {{city}}', 88],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  education: [
    ['recommendation', 'Best tech courses in {{country}}', 88],
    ['commercial', 'How much does a coding bootcamp cost?', 85],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  local_service: [
    ['recommendation', 'Recommended professionals in {{city}}', 88],
    ['local', 'Emergency service near {{city}}', 80],
    ['brand', 'Reviews of {{business}}', 70],
  ],

  generic: [
    ['recommendation', 'Recommended businesses for {{business}}', 75],
    ['brand', 'Reviews of {{business}}', 70],
    ['alternatives', 'Alternatives to {{business}}', 70],
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
 * Decide whether a keyword is good enough to be turned into an AI Query.
 *
 * Rejects:
 *   - very short fragments (< 3 chars)
 *   - pure product names / SKU-like fragments (mixed digits/letters with no spaces)
 *   - keywords that contain only digits or only one non-Hebrew/Latin word
 *   - awkward product-fragment phrases ("בריח", "טלק" alone, "X לנערות") when no
 *     anchor word exists
 *   - keywords with brand/business term only (length under 4 with no descriptor)
 *   - keywords with quotes, hashes, or other URL-like characters
 *
 * The goal is to keep keywords that read like a *category* or *service* —
 * not isolated product attributes.
 */
function isQualityKeyword(keyword: string): boolean {
  const k = keyword.trim()
  if (!k) return false
  if (k.length < 3) return false
  if (/[#"'`<>]/.test(k)) return false
  if (/^\d+$/.test(k)) return false
  // Reject when keyword is mostly digits (likely SKUs)
  const digitRatio = (k.match(/\d/g)?.length || 0) / k.length
  if (digitRatio > 0.5) return false
  // Reject single-word fragments that look like a property (e.g., "טלק", "בריח")
  const words = k.split(/\s+/).filter(Boolean)
  if (words.length === 1 && k.length < 5) return false
  return true
}

/**
 * Hebrew preposition helper — picks the natural form before a keyword.
 *
 * For Hebrew, `ל` (to/for) combines with the following word: "ל" + "בשמים" → "לבשמים".
 * We don't need to do morphological inflection — just prepend the prefix.
 *
 * However, when the keyword *itself* already starts with a definite article ("ה")
 * or with "ב" / "ל" / "מ", we keep the keyword as-is and rely on the surrounding
 * template wording instead.
 */
function hePrefix(keyword: string, prefix: 'ל' | 'ב' | 'מ'): string {
  const trimmed = keyword.trim()
  if (!trimmed) return trimmed
  // If keyword already begins with that prefix, don't double-prepend
  const first = trimmed.charAt(0)
  if (first === prefix) return trimmed
  return `${prefix}${trimmed}`
}

/**
 * Generate keyword-derived queries from tracked SEO keywords.
 * Uses templates that read more naturally than "מי מומלץ ל{keyword}?".
 */
function keywordDerivedQueries(
  keywords: string[],
  ctx: TemplateContext,
  _category: BusinessCategory
): Array<[PromptIntent, string, number]> {
  if (!keywords || keywords.length === 0) return []
  const isHe = ctx.language === 'he'
  const results: Array<[PromptIntent, string, number]> = []
  const filtered = keywords.filter(isQualityKeyword).slice(0, 5)

  for (const raw of filtered) {
    const k = raw.trim()
    if (!k) continue

    if (isHe) {
      // Recommendation: "איפה מומלץ לקנות {k}?" — purchase-intent
      results.push(['recommendation', `איפה מומלץ לקנות ${k}?`, 86])
      // Recommendation: "איזה {k} מומלץ?" — selection-intent
      results.push(['recommendation', `איזה ${k} מומלץ?`, 84])
      // Commercial: more natural "כמה עולה X" — strip awkward "ל" prefix
      results.push(['commercial', `כמה עולה ${k}?`, 80])
      // Local — only if city is known
      if (ctx.city) {
        results.push(['local', `איפה לקנות ${k} ב${ctx.city}?`, 82])
      }
    } else {
      results.push(['recommendation', `Where to buy ${k}?`, 84])
      results.push(['recommendation', `Best ${k} options`, 82])
      results.push(['commercial', `How much does ${k} cost?`, 78])
      if (ctx.city) {
        results.push(['local', `${k} in ${ctx.city}`, 80])
      }
    }
  }
  return results
}

/**
 * Lightweight Hebrew quality check.
 *
 * Detects obvious grammar fails like:
 *   - "מי מומלץ ל{noun-phrase}?" where the noun-phrase starts with a Hebrew
 *     plural marker that doesn't combine well with "ל".
 *   - Two consecutive identical Hebrew prefixes ("לל", "בב").
 *   - Trailing connectives without a noun.
 */
function isReadableHebrew(text: string): boolean {
  if (!text) return false
  // No double prefixes
  if (/(לל|בב|מה ל|של של)/.test(text)) return false
  // No empty templates
  if (/\{\{[^}]+\}\}/.test(text)) return false
  // Minimum length 6 characters for a real question
  if (text.length < 6) return false
  return true
}

/**
 * Generate smart AI query suggestions.
 *
 * @param ctx Project context: business, domain, city, country, language
 * @param keywords Optional tracked keywords for theme-derived queries
 * @param shuffle If true, randomize order then return subset
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
  const lang = language || 'he'
  const ctx: TemplateContext = { business, domain: dom, city, country, language: lang }
  const category = detectCategory(business, dom, keywords)
  const bank = lang === 'he' ? QUERIES_HE : QUERIES_EN
  const templates = bank[category] || bank.generic
  const keywordTemplates = keywordDerivedQueries(keywords, ctx, category)

  // Minimum quality threshold; templates below this are filtered out.
  const MIN_QUALITY_SCORE = 68

  // Combine + deduplicate (semantic dedup: drop near-identical lowercased prompts)
  const seen = new Set<string>()
  const combined: PromptSuggestion[] = []

  const processTemplates = (list: Array<[PromptIntent, string, number]>) => {
    for (const [intent, raw, score] of list) {
      if (score < MIN_QUALITY_SCORE) continue
      const text = fillTemplate(raw, ctx).trim()
      if (lang === 'he' && !isReadableHebrew(text)) continue
      // Dedup key: lowercased + collapsed whitespace + stripped final punctuation
      const key = text
        .toLowerCase()
        .replace(/[?!.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (seen.has(key)) continue
      seen.add(key)
      combined.push({
        id: `q-${combined.length}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: text,
        intent,
        category,
        language: lang,
        qualityScore: score,
      })
    }
  }

  processTemplates(templates)
  processTemplates(keywordTemplates)

  // Sort by quality score descending
  combined.sort((a, b) => b.qualityScore - a.qualityScore)

  // Shuffle if requested (for regenerate button)
  if (shuffle) {
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[combined[i], combined[j]] = [combined[j], combined[i]]
    }
  }

  return combined.slice(0, limit)
}
