/**
 * Smart prompt suggestion generator (deterministic, template-based).
 * No external LLM calls — pure local logic.
 *
 * Inputs:
 *   - business name, target domain (for category detection + filling)
 *   - country, language (for templates + country name lookup)
 *   - city (for local intent)
 *   - tracked keywords (for theme extraction → keyword-derived prompts)
 *
 * Output: array of PromptSuggestion typed by intent + category.
 *
 * Multi-language: returns Hebrew prompts when language='he', English otherwise.
 * Intent variety: brand, comparison, local, transactional, recommendation, informational.
 */

export type PromptIntent =
  | 'brand'
  | 'comparison'
  | 'local'
  | 'transactional'
  | 'recommendation'
  | 'informational'

export type BusinessCategory =
  | 'agency'
  | 'ecommerce'
  | 'saas'
  | 'local_service'
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
}

type TemplateContext = {
  business: string
  domain: string
  city: string | null
  country: string | null
  language: string
}

/**
 * Heuristic category detection from business name + domain + keywords.
 */
export function detectCategory(
  business: string,
  domain: string,
  keywords: string[] = []
): BusinessCategory {
  const text = `${business} ${domain} ${keywords.join(' ')}`.toLowerCase()

  if (/(seo|ppc|sem|google ads|agency|marketing|advertis|digital|קידום אתרים|ממומן|פרסום|שיווק|סוכנות|דיגיטל)/.test(text)) return 'agency'
  if (/(shop|store|ecommerce|חנות|קניות|אונליין)/.test(text)) return 'ecommerce'
  if (/(saas|app|software|cloud|platform|api|\.io|\.ai)/.test(text)) return 'saas'
  if (/(flower|florist|פרחים|זרים|זר)/.test(text)) return 'florist'
  if (/(restaurant|cafe|food|bistro|מסעדה|קפה|אוכל|פיצה)/.test(text)) return 'restaurant'
  if (/(clinic|hospital|medical|doctor|dental|מרפאה|רופא|רפואה|שיניים)/.test(text)) return 'healthcare'
  if (/(law|legal|attorney|lawyer|עורך דין|עורכי דין|משפט)/.test(text)) return 'legal'
  if (/(realty|real.estate|properties|נדל"ן|נדלן|דירות)/.test(text)) return 'real_estate'
  if (/(gym|fitness|yoga|crossfit|כושר|יוגה)/.test(text)) return 'fitness'
  if (/(salon|spa|beauty|hair|nails|מספרה|ספא|יופי)/.test(text)) return 'beauty'
  if (/(school|academy|course|education|מכללה|בית ספר|קורס)/.test(text)) return 'education'
  if (/(electrician|plumber|cleaner|hvac|חשמלאי|אינסטלטור|ניקיון)/.test(text)) return 'local_service'

  return 'generic'
}

/**
 * Hebrew templates — expanded for each category (8-12 templates each for variety).
 */
const TEMPLATES_HE: Record<BusinessCategory, [PromptIntent, string][]> = {
  agency: [
    ['recommendation', 'מי הן חברות קידום האתרים המובילות בישראל?'],
    ['recommendation', 'איזו חברת SEO מומלצת לעסק קטן?'],
    ['recommendation', 'חברות פרסום ממומן מומלצות בישראל'],
    ['recommendation', 'מומחי Google Ads מומלצים בישראל'],
    ['comparison', 'מה ההבדל בין סוכנויות SEO גדולות לקטנות?'],
    ['comparison', 'השוואה בין חברות שיווק דיגיטלי בישראל'],
    ['comparison', 'מה עדיף - SEO או Google Ads?'],
    ['brand', 'מה אפשר לספר על {{business}}?'],
    ['brand', 'חוות דעת על {{business}}'],
    ['local', 'סוכנות SEO מומלצת ב{{city}}'],
    ['local', 'חברת קידום אתרים ב{{city}}'],
    ['transactional', 'איך לבחור חברת קידום אתרים'],
    ['transactional', 'איך לבחור סוכנות שיווק דיגיטלי'],
    ['informational', 'כמה עולה קידום אתרים בישראל?'],
    ['informational', 'מה זה SEO וכמה הוא עולה?'],
    ['informational', 'מהן השיטות העדכניות לקידום אתרים ב-2026?'],
  ],
  ecommerce: [
    ['recommendation', 'אילו חנויות אונליין מומלצות בישראל?'],
    ['comparison', 'איפה הכי משתלם לקנות אונליין בישראל?'],
    ['comparison', 'השוואה בין חנויות אונליין מובילות'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['brand', 'חוות דעת על {{business}}'],
    ['transactional', 'איפה לקנות מ-{{business}} אונליין?'],
    ['transactional', 'איך להזמין מ-{{business}}'],
    ['informational', 'איך לבחור חנות אונליין אמינה'],
    ['informational', 'איך לקנות בבטחה אונליין'],
  ],
  saas: [
    ['recommendation', 'אילו פלטפורמות SaaS מומלצות לעסקים בישראל?'],
    ['recommendation', 'כלי AI מומלצים לעסקים'],
    ['comparison', 'השוואה בין כלי SaaS פופולריים'],
    ['comparison', 'אלטרנטיבות ל-{{business}}'],
    ['brand', 'מה אפשר לספר על {{business}}?'],
    ['brand', 'חוות דעת על {{business}}'],
    ['transactional', 'איך לבחור כלי SaaS לעסק שלי'],
    ['informational', 'מה הוא {{business}} ולמה צריך אותו?'],
  ],
  florist: [
    ['recommendation', 'חנות פרחים מומלצת ב{{city}}'],
    ['recommendation', 'איפה לקנות פרחים איכותיים ב{{city}}?'],
    ['local', 'משלוח פרחים ב{{city}}'],
    ['local', 'חנות פרחים פתוחה כעת ב{{city}}'],
    ['transactional', 'משלוח פרחים היום ב{{city}}'],
    ['transactional', 'הזמנת זר פרחים אונליין'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'איך לבחור חנות פרחים אמינה'],
  ],
  restaurant: [
    ['recommendation', 'מסעדות מומלצות ב{{city}}'],
    ['recommendation', 'מסעדות חדשות ושוות ב{{city}}'],
    ['local', 'איפה לאכול ב{{city}}?'],
    ['local', 'מסעדה רומנטית ב{{city}}'],
    ['comparison', 'המסעדות הכי טובות ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'איפה לחגוג יום הולדת ב{{city}}'],
  ],
  healthcare: [
    ['recommendation', 'מרפאות פרטיות מומלצות בישראל'],
    ['recommendation', 'הרופאים הטובים בישראל בתחום שלך'],
    ['local', 'רופא מומחה ב{{city}}'],
    ['local', 'מרפאת שיניים מומלצת ב{{city}}'],
    ['brand', 'חוות דעת על {{business}}'],
    ['informational', 'איך לבחור רופא פרטי'],
  ],
  legal: [
    ['recommendation', 'משרדי עורכי דין מובילים בישראל'],
    ['recommendation', 'עורכי דין מומלצים לדיני משפחה'],
    ['local', 'עורך דין ב{{city}}'],
    ['comparison', 'איך לבחור עורך דין נכון'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'מתי כדאי לפנות לעורך דין'],
  ],
  real_estate: [
    ['recommendation', 'חברות נדל"ן מומלצות בישראל'],
    ['recommendation', 'מתווכים מומלצים ב{{city}}'],
    ['local', 'דירות למכירה ב{{city}}'],
    ['local', 'משרד תיווך ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'איך לבחור מתווך אמין'],
  ],
  fitness: [
    ['recommendation', 'חדרי כושר מומלצים ב{{city}}'],
    ['local', 'מאמן כושר אישי ב{{city}}'],
    ['local', 'סטודיו לכושר ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'איך לבחור חדר כושר'],
  ],
  beauty: [
    ['recommendation', 'מספרות מומלצות ב{{city}}'],
    ['recommendation', 'סלון יופי מומלץ ב{{city}}'],
    ['local', 'מניקור ב{{city}}'],
    ['local', 'טיפולי פנים ב{{city}}'],
    ['brand', 'חוות דעת על {{business}}'],
  ],
  education: [
    ['recommendation', 'בתי ספר ומכללות מומלצים בישראל'],
    ['recommendation', 'קורסי הייטק מומלצים בישראל'],
    ['local', 'קורסים מקצועיים ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'איך לבחור קורס מקצועי'],
  ],
  local_service: [
    ['recommendation', 'בעלי מקצוע מומלצים ב{{city}}'],
    ['local', 'שירות מקצועי באזור {{city}}'],
    ['local', 'תיקון דחוף ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['transactional', 'איך לקבל הצעת מחיר מ-{{business}}'],
  ],
  generic: [
    ['recommendation', 'עסקים מומלצים בישראל'],
    ['brand', 'מה אפשר לספר על {{business}}?'],
    ['brand', 'חוות דעת על {{business}}'],
    ['local', 'שירות איכותי ב{{city}}'],
    ['informational', 'איך לבחור עסק אמין'],
  ],
}

/**
 * English templates.
 */
const TEMPLATES_EN: Record<BusinessCategory, [PromptIntent, string][]> = {
  agency: [
    ['recommendation', 'Best SEO agencies in {{country_full}}'],
    ['recommendation', 'Recommended SEO agency in {{country_full}}'],
    ['recommendation', 'Best PPC company in {{country_full}}'],
    ['recommendation', 'Top Google Ads experts in {{country_full}}'],
    ['recommendation', 'Top digital marketing agencies in {{country_full}}'],
    ['comparison', 'SEO vs Google Ads — which is better for small business?'],
    ['comparison', 'Compare top digital marketing agencies in {{country_full}}'],
    ['brand', 'What can you tell me about {{business}}?'],
    ['brand', 'Reviews of {{business}}'],
    ['local', 'SEO agency in {{city}}'],
    ['local', 'Digital marketing agency in {{city}}'],
    ['transactional', 'How to choose a digital marketing agency'],
    ['transactional', 'How to choose an SEO agency'],
    ['informational', 'SEO services pricing in {{country_full}}'],
    ['informational', 'What is SEO and how much does it cost?'],
    ['informational', 'Latest SEO trends for 2026'],
  ],
  ecommerce: [
    ['recommendation', 'Best online stores in {{country_full}}'],
    ['comparison', 'Top ecommerce sites in {{country_full}}'],
    ['comparison', 'Compare online stores in {{country_full}}'],
    ['brand', 'Reviews of {{business}}'],
    ['transactional', 'Where to buy from {{business}} online'],
    ['informational', 'How to choose a reliable online store'],
  ],
  saas: [
    ['recommendation', 'Best SaaS platforms for businesses'],
    ['recommendation', 'Top AI tools for businesses'],
    ['comparison', 'Compare {{business}} with alternatives'],
    ['comparison', 'Best alternatives to {{business}}'],
    ['brand', 'What is {{business}}?'],
    ['transactional', 'How to choose a SaaS tool for my business'],
  ],
  florist: [
    ['recommendation', 'Best flower shop in {{city}}'],
    ['local', 'Flower delivery in {{city}}'],
    ['transactional', 'Same-day flower delivery {{city}}'],
    ['transactional', 'Order flowers online {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  restaurant: [
    ['recommendation', 'Best restaurants in {{city}}'],
    ['recommendation', 'New restaurants in {{city}}'],
    ['local', 'Where to eat in {{city}}'],
    ['local', 'Romantic restaurant in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  healthcare: [
    ['recommendation', 'Top private clinics in {{country_full}}'],
    ['local', 'Specialist doctor in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
    ['informational', 'How to choose a private doctor'],
  ],
  legal: [
    ['recommendation', 'Top law firms in {{country_full}}'],
    ['local', 'Lawyer in {{city}}'],
    ['comparison', 'How to choose the right lawyer'],
    ['brand', 'Reviews of {{business}}'],
  ],
  real_estate: [
    ['recommendation', 'Top real estate agencies in {{country_full}}'],
    ['local', 'Properties for sale in {{city}}'],
    ['local', 'Real estate agent in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  fitness: [
    ['recommendation', 'Best gyms in {{city}}'],
    ['local', 'Personal trainer in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  beauty: [
    ['recommendation', 'Top salons in {{city}}'],
    ['local', 'Beauty salon in {{city}}'],
    ['local', 'Nail salon in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  education: [
    ['recommendation', 'Top schools/academies in {{country_full}}'],
    ['local', 'Professional courses in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  local_service: [
    ['recommendation', 'Recommended professionals in {{city}}'],
    ['local', 'Local services in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  generic: [
    ['recommendation', 'Best businesses in {{country_full}}'],
    ['brand', 'What can you tell me about {{business}}?'],
    ['brand', 'Reviews of {{business}}'],
    ['local', 'Recommended services in {{city}}'],
    ['informational', 'How to find a reliable business'],
  ],
}

const COUNTRY_NAMES: Record<string, { he: string; en: string }> = {
  IL: { he: 'ישראל', en: 'Israel' },
  US: { he: 'ארה"ב', en: 'the US' },
  GB: { he: 'בריטניה', en: 'the UK' },
  DE: { he: 'גרמניה', en: 'Germany' },
  FR: { he: 'צרפת', en: 'France' },
}

function fillTemplate(template: string, ctx: TemplateContext): string {
  const countryFull =
    ctx.country && COUNTRY_NAMES[ctx.country.toUpperCase()]
      ? ctx.language === 'he'
        ? COUNTRY_NAMES[ctx.country.toUpperCase()].he
        : COUNTRY_NAMES[ctx.country.toUpperCase()].en
      : ctx.country || ''

  return template
    .replace(/\{\{business\}\}/g, ctx.business || (ctx.language === 'he' ? 'העסק שלי' : 'this business'))
    .replace(/\{\{domain\}\}/g, ctx.domain || '')
    .replace(/\{\{city\}\}/g, ctx.city || (ctx.language === 'he' ? 'אזורי' : 'my area'))
    .replace(/\{\{country\}\}/g, ctx.country || '')
    .replace(/\{\{country_full\}\}/g, countryFull)
    .trim()
}

/**
 * Generate keyword-derived prompts from tracked keywords.
 * Picks 2-3 representative keywords and builds variant prompts.
 */
function keywordDerivedPrompts(
  keywords: string[],
  ctx: TemplateContext,
  existing: Set<string>
): PromptSuggestion[] {
  if (keywords.length === 0) return []
  const out: PromptSuggestion[] = []
  // Pick up to 3 distinct keywords (random shuffle)
  const sample = [...keywords].sort(() => Math.random() - 0.5).slice(0, 3)
  for (const kw of sample) {
    const clean = kw.trim()
    if (!clean) continue
    const tpls = ctx.language === 'he'
      ? [
          ['informational', `${clean} - מי המובילים בתחום בישראל?`],
          ['recommendation', `${clean} - חברות מומלצות`],
          ['comparison', `איך לבחור שירות ${clean}`],
        ] as [PromptIntent, string][]
      : [
          ['informational', `Who are the leaders in ${clean}?`],
          ['recommendation', `Best ${clean} services`],
          ['comparison', `How to choose ${clean} service`],
        ] as [PromptIntent, string][]
    for (const [intent, tpl] of tpls) {
      const filled = fillTemplate(tpl, ctx)
      if (filled && !existing.has(filled)) {
        existing.add(filled)
        out.push({
          id: `kw-${intent}-${out.length}-${Date.now().toString(36).slice(-4)}`,
          prompt: filled,
          intent,
          category: 'generic',
          language: ctx.language,
        })
      }
    }
  }
  return out
}

/**
 * Generate prompt suggestions for a project.
 *
 * @param input.businessName - Business / brand name
 * @param input.domain - Target domain
 * @param input.city - City (for local intent)
 * @param input.country - Country ISO code
 * @param input.language - Language code (he/en)
 * @param input.keywords - Tracked keywords for theme extraction
 * @param input.shuffle - If true, randomizes order + selects subset (regenerate behavior)
 * @param input.limit - Max suggestions to return (default 12)
 */
export function generatePromptSuggestions(input: {
  businessName: string | null
  domain: string | null
  city: string | null
  country: string | null
  language: string | null
  keywords?: string[]
  shuffle?: boolean
  limit?: number
}): PromptSuggestion[] {
  const business = input.businessName?.trim() || ''
  const domain = input.domain?.trim() || ''
  const city = input.city?.trim() || null
  const country = input.country?.trim() || null
  const language = (input.language || 'en').toLowerCase()
  const keywords = (input.keywords || []).filter((k) => k && k.trim().length > 0)
  const shuffle = input.shuffle ?? false
  const limit = input.limit ?? 12

  const category = detectCategory(business, domain, keywords)
  const templates = language === 'he' ? TEMPLATES_HE : TEMPLATES_EN
  const familyTemplates = templates[category] || templates.generic

  const ctx: TemplateContext = { business, domain, city, country, language }
  const seen = new Set<string>()
  const suggestions: PromptSuggestion[] = []

  // Category templates first
  let entries = [...familyTemplates]
  if (shuffle) {
    entries = entries.sort(() => Math.random() - 0.5)
  }

  for (const [intent, tpl] of entries) {
    const filled = fillTemplate(tpl, ctx)
    if (!filled || seen.has(filled)) continue
    seen.add(filled)
    suggestions.push({
      id: `${category}-${intent}-${suggestions.length}-${shuffle ? Date.now().toString(36).slice(-4) : 'a'}`,
      prompt: filled,
      intent,
      category,
      language,
    })
    if (suggestions.length >= limit - 2) break
  }

  // Add keyword-derived prompts
  const kwPrompts = keywordDerivedPrompts(keywords, ctx, seen)
  for (const kw of kwPrompts) {
    suggestions.push(kw)
    if (suggestions.length >= limit) break
  }

  return suggestions
}
