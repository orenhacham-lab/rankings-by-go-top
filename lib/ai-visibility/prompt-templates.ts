/**
 * Smart prompt suggestion generator (deterministic, template-based).
 * No external LLM calls. Pure local logic.
 *
 * Output: an array of suggested prompt strings tailored to:
 *   - business name
 *   - target domain
 *   - country/language
 *   - inferred business category (from name keywords)
 *
 * Multi-language: returns Hebrew prompts when language='he', English otherwise.
 * Future-ready: templates are grouped by intent (brand, comparison, local,
 * transactional, recommendation, informational) so we can later expand to
 * AI-generated, competitor-inspired, or keyword-derived suggestions.
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
 * Heuristic category detection from business name + domain.
 * Falls back to 'generic' when nothing matches.
 */
export function detectCategory(business: string, domain: string): BusinessCategory {
  const text = `${business} ${domain}`.toLowerCase()

  // Agency / SEO / marketing
  if (/(seo|agency|marketing|advertising|digital|סוכנות|פרסום|שיווק)/.test(text)) return 'agency'
  // Ecommerce / shop
  if (/(shop|store|ecommerce|store\.com|חנות|קניות)/.test(text)) return 'ecommerce'
  // SaaS / app / tech
  if (/(saas|app|software|cloud|platform|api|\.io|\.ai)/.test(text)) return 'saas'
  // Florist
  if (/(flower|florist|פרחים|זרים)/.test(text)) return 'florist'
  // Restaurant / food
  if (/(restaurant|cafe|food|bistro|מסעדה|קפה|אוכל|פיצה)/.test(text)) return 'restaurant'
  // Healthcare / clinic / medical
  if (/(clinic|hospital|medical|doctor|dental|מרפאה|רופא|רפואה|שיניים)/.test(text)) return 'healthcare'
  // Legal
  if (/(law|legal|attorney|lawyer|עורך דין|עורכי דין|משפט)/.test(text)) return 'legal'
  // Real estate
  if (/(realty|real estate|properties|נדל"ן|נדלן|דירות)/.test(text)) return 'real_estate'
  // Fitness / gym
  if (/(gym|fitness|yoga|crossfit|כושר|יוגה)/.test(text)) return 'fitness'
  // Beauty / salon / spa
  if (/(salon|spa|beauty|hair|nails|מספרה|ספא|יופי)/.test(text)) return 'beauty'
  // Education / academy
  if (/(school|academy|course|education|מכללה|בית ספר|קורס)/.test(text)) return 'education'
  // Local service (electrician, plumber, etc.)
  if (/(electrician|plumber|cleaner|hvac|חשמלאי|אינסטלטור|ניקיון)/.test(text)) return 'local_service'

  return 'generic'
}

/**
 * Hebrew template families. Each tuple: [intent, template string].
 * {{business}} {{domain}} {{city}} {{country}} placeholders.
 */
const TEMPLATES_HE: Record<BusinessCategory, [PromptIntent, string][]> = {
  agency: [
    ['recommendation', 'מהן סוכנויות ה-SEO המומלצות בישראל?'],
    ['comparison', 'מה ההבדל בין סוכנויות SEO גדולות לקטנות?'],
    ['brand', 'מה אפשר לספר על {{business}}?'],
    ['local', 'סוכנות SEO מומלצת ב{{city}}'],
    ['transactional', 'איך לבחור סוכנות שיווק דיגיטלי'],
    ['informational', 'כמה עולה קידום אתרים בישראל?'],
  ],
  ecommerce: [
    ['recommendation', 'אילו חנויות אונליין מומלצות בישראל?'],
    ['comparison', 'איפה הכי משתלם לקנות אונליין בישראל?'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['transactional', 'איפה לקנות {{business}} אונליין?'],
    ['informational', 'איך לבחור חנות אונליין אמינה'],
  ],
  saas: [
    ['recommendation', 'אילו פלטפורמות SaaS מומלצות לעסקים בישראל?'],
    ['comparison', 'השוואה בין כלי SaaS פופולריים'],
    ['brand', 'מה אפשר לספר על {{business}}?'],
    ['transactional', 'איך לבחור כלי SaaS לעסק שלי'],
  ],
  florist: [
    ['recommendation', 'חנות פרחים מומלצת ב{{city}}'],
    ['local', 'משלוח פרחים ב{{city}}'],
    ['transactional', 'משלוח פרחים היום ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'איך לבחור חנות פרחים אמינה'],
  ],
  restaurant: [
    ['recommendation', 'מסעדות מומלצות ב{{city}}'],
    ['local', 'איפה לאכול ב{{city}}?'],
    ['comparison', 'המסעדות הכי טובות ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
  ],
  healthcare: [
    ['recommendation', 'מרפאות פרטיות מומלצות בישראל'],
    ['local', 'רופא מומחה ב{{city}}'],
    ['brand', 'חוות דעת על {{business}}'],
    ['informational', 'איך לבחור רופא פרטי'],
  ],
  legal: [
    ['recommendation', 'משרדי עורכי דין מובילים בישראל'],
    ['local', 'עורך דין ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'איך לבחור עורך דין מומחה'],
  ],
  real_estate: [
    ['recommendation', 'חברות נדל"ן מומלצות בישראל'],
    ['local', 'דירות למכירה ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
    ['informational', 'איך לבחור מתווך אמין'],
  ],
  fitness: [
    ['recommendation', 'חדרי כושר מומלצים ב{{city}}'],
    ['local', 'מאמן כושר אישי ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
  ],
  beauty: [
    ['recommendation', 'מספרות מומלצות ב{{city}}'],
    ['local', 'סלון יופי ב{{city}}'],
    ['brand', 'חוות דעת על {{business}}'],
  ],
  education: [
    ['recommendation', 'בתי ספר/מכללות מומלצים בישראל'],
    ['local', 'קורסים מקצועיים ב{{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
  ],
  local_service: [
    ['recommendation', 'בעלי מקצוע מומלצים ב{{city}}'],
    ['local', 'שירות מקצועי באזור {{city}}'],
    ['brand', 'מה דעתכם על {{business}}?'],
  ],
  generic: [
    ['recommendation', 'עסקים מומלצים בישראל'],
    ['brand', 'מה אפשר לספר על {{business}}?'],
    ['local', 'שירות איכותי ב{{city}}'],
    ['informational', 'איך לבחור עסק אמין'],
  ],
}

/**
 * English template families.
 */
const TEMPLATES_EN: Record<BusinessCategory, [PromptIntent, string][]> = {
  agency: [
    ['recommendation', 'Best SEO agencies in {{country_full}}'],
    ['comparison', 'Top digital marketing agencies in {{country_full}}'],
    ['brand', 'What can you tell me about {{business}}?'],
    ['local', 'SEO agency in {{city}}'],
    ['transactional', 'How to choose a digital marketing agency'],
    ['informational', 'SEO services pricing in {{country_full}}'],
  ],
  ecommerce: [
    ['recommendation', 'Best online stores in {{country_full}}'],
    ['comparison', 'Top ecommerce sites in {{country_full}}'],
    ['brand', 'Reviews of {{business}}'],
    ['transactional', 'Where to buy from {{business}} online'],
  ],
  saas: [
    ['recommendation', 'Best SaaS platforms for businesses'],
    ['comparison', 'Compare {{business}} with alternatives'],
    ['brand', 'What is {{business}}?'],
    ['transactional', 'How to choose a SaaS tool for my business'],
  ],
  florist: [
    ['recommendation', 'Best flower shop in {{city}}'],
    ['local', 'Flower delivery in {{city}}'],
    ['transactional', 'Same-day flower delivery {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  restaurant: [
    ['recommendation', 'Best restaurants in {{city}}'],
    ['local', 'Where to eat in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  healthcare: [
    ['recommendation', 'Top private clinics in {{country_full}}'],
    ['local', 'Specialist doctor in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  legal: [
    ['recommendation', 'Top law firms in {{country_full}}'],
    ['local', 'Lawyer in {{city}}'],
    ['brand', 'Reviews of {{business}}'],
  ],
  real_estate: [
    ['recommendation', 'Top real estate agencies in {{country_full}}'],
    ['local', 'Properties for sale in {{city}}'],
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
    .replace(/\{\{business\}\}/g, ctx.business || 'this business')
    .replace(/\{\{domain\}\}/g, ctx.domain || '')
    .replace(/\{\{city\}\}/g, ctx.city || (ctx.language === 'he' ? 'אזור שלי' : 'my area'))
    .replace(/\{\{country\}\}/g, ctx.country || '')
    .replace(/\{\{country_full\}\}/g, countryFull)
    .trim()
}

/**
 * Generate smart prompt suggestions for a project.
 * @returns array of PromptSuggestion objects
 */
export function generatePromptSuggestions(input: {
  businessName: string | null
  domain: string | null
  city: string | null
  country: string | null
  language: string | null
}): PromptSuggestion[] {
  const business = input.businessName?.trim() || ''
  const domain = input.domain?.trim() || ''
  const city = input.city?.trim() || null
  const country = input.country?.trim() || null
  const language = (input.language || 'en').toLowerCase()

  const category = detectCategory(business, domain)
  const templates = language === 'he' ? TEMPLATES_HE : TEMPLATES_EN
  const familyTemplates = templates[category] || templates.generic

  const ctx: TemplateContext = { business, domain, city, country, language }

  const seen = new Set<string>()
  const suggestions: PromptSuggestion[] = []

  for (const [intent, tpl] of familyTemplates) {
    const filled = fillTemplate(tpl, ctx)
    if (!filled || seen.has(filled)) continue
    seen.add(filled)
    suggestions.push({
      id: `${category}-${intent}-${suggestions.length}`,
      prompt: filled,
      intent,
      category,
      language,
    })
  }

  return suggestions
}
