/**
 * Search Object Classification Pipeline
 *
 * Transforms raw secondary-category / keyword strings into typed, validated
 * search objects before they are turned into AI-question templates.
 *
 * Pipeline:
 *   extractSearchObjects → normalizeSearchObject → rejectSearchObject →
 *   chooseTemplatesByObjectType.
 *
 * The generator must only build questions from objects that pass all four
 * steps. If a secondary category cannot produce a validated object, it is
 * skipped — the generator returns fewer high-quality questions rather than
 * padding the list with weak fallbacks.
 */

export type SearchObjectType =
  | 'product'
  | 'product_category'
  | 'service'
  | 'local_service'
  | 'professional_service'
  | 'software_tool'
  | 'abstract_category'
  | 'brand'
  | 'business_name'

export type SearchObjectSource = 'category' | 'secondary' | 'keyword' | 'manual'

export type SearchObject = {
  text: string
  type: SearchObjectType
  source: SearchObjectSource
  confidence: number
  providerLabel?: string
}

type NormRule = {
  match: RegExp
  output: {
    text: string
    type: SearchObjectType
    providerLabel?: string
    confidence?: number
  }
}

/**
 * Hebrew normalization rules — ordered most-specific first.
 * Rules that produce empty text or business_name/abstract_category types
 * are explicit rejections, handled downstream.
 */
const HE_RULES: NormRule[] = [
  // --- Business-type rejections (must come BEFORE product matches) ---
  { match: /^חנות\s+(מוצרי\s+כושר|ציוד\s+כושר|ספורט|פרחים|בשמים|מתנות|מוצרי\s+חשמל)$/, output: { text: '', type: 'business_name', confidence: 0 } },
  { match: /^חברת\s+(ניקיון|שיפוצים|בנייה|תוכנה)$/, output: { text: '', type: 'business_name', confidence: 0 } },
  { match: /^מותגי\s+ספורט$|^מותגים?\s+ספורט/, output: { text: '', type: 'abstract_category', confidence: 0 } },
  { match: /^בגדי\s+ספורט|^נעלי\s+ספורט|^נעלי\s+ריצה$/, output: { text: '', type: 'abstract_category', confidence: 0 } },

  // --- Fitness equipment (products) ---
  { match: /^סט\s+משקולות$/, output: { text: 'סט משקולות', type: 'product', confidence: 0.95 } },
  { match: /^משקולות?$/, output: { text: 'משקולות', type: 'product', confidence: 0.95 } },
  { match: /^הליכון(ים)?$/, output: { text: 'הליכון', type: 'product', confidence: 0.95 } },
  { match: /^אופני\s+כושר|^אופניים?\s+נייחים?$/, output: { text: 'אופני כושר', type: 'product', confidence: 0.92 } },
  { match: /^ספסל\s+כושר|^ספת\s+כושר$/, output: { text: 'ספסל כושר', type: 'product', confidence: 0.92 } },
  { match: /^גומיות\s+התנגדות$/, output: { text: 'גומיות התנגדות', type: 'product', confidence: 0.9 } },
  { match: /^מזרן\s+יוגה|^מזרון\s+יוגה$/, output: { text: 'מזרן יוגה', type: 'product', confidence: 0.9 } },

  // --- Fitness equipment (categories) ---
  { match: /ציוד\s+כושר\s+ביתי|^ציוד\s+ביתי\s+לכושר$/, output: { text: 'ציוד כושר ביתי', type: 'product_category', confidence: 0.93 } },
  { match: /^(ציוד\s+כושר|מוצרי\s+כושר)$/, output: { text: 'ציוד כושר ביתי', type: 'product_category', confidence: 0.9 } },

  // --- Flowers (products / categories / services) ---
  { match: /^זר\s+פרחים$|^זרי\s+פרחים$/, output: { text: 'זר פרחים', type: 'product', confidence: 0.95 } },
  { match: /^בוקט(ים)?$/, output: { text: 'בוקט', type: 'product', confidence: 0.9 } },
  { match: /^פרחים\s+ליום\s+הולדת/, output: { text: 'פרחים ליום הולדת', type: 'product_category', confidence: 0.9 } },
  { match: /^פרחים\s+רומנטיים|^פרחים\s+ליום\s+נישואין/, output: { text: 'זר פרחים רומנטי', type: 'product_category', confidence: 0.9 } },
  { match: /^פרחים\s+לשבת|^פרחים\s+לחג/, output: { text: 'פרחים לשבת', type: 'product_category', confidence: 0.88 } },
  { match: /^משלוח\s+פרחים|^משלוחי\s+פרחים$/, output: { text: 'משלוח פרחים', type: 'service', providerLabel: 'חנות פרחים', confidence: 0.95 } },

  // --- Home improvement (services) ---
  { match: /^שיפוץ\s+מטבח/, output: { text: 'שיפוץ מטבח', type: 'service', providerLabel: 'קבלן שיפוצים', confidence: 0.95 } },
  { match: /^שיפוץ\s+(חדר\s+)?אמבטיה/, output: { text: 'שיפוץ חדר אמבטיה', type: 'service', providerLabel: 'קבלן שיפוצים', confidence: 0.95 } },
  { match: /^שיפוץ\s+בית|^שיפוצים?$/, output: { text: 'שיפוץ בית', type: 'service', providerLabel: 'קבלן שיפוצים', confidence: 0.9 } },
  { match: /^קבלן\s+שיפוצים?/, output: { text: 'שיפוצים', type: 'professional_service', providerLabel: 'קבלן שיפוצים', confidence: 0.9 } },
  { match: /^התקנת\s+מטבח/, output: { text: 'התקנת מטבח', type: 'service', providerLabel: 'קבלן שיפוצים', confidence: 0.9 } },

  // --- Cleaning (local services) ---
  { match: /^ניקיון\s+משרד(ים)?|^שירותי?\s+ניקיון\s+למשרד/, output: { text: 'ניקיון משרדים', type: 'local_service', providerLabel: 'חברת ניקיון משרדים', confidence: 0.95 } },
  { match: /^ניקיון\s+אחרי\s+שיפוץ/, output: { text: 'ניקיון אחרי שיפוץ', type: 'local_service', providerLabel: 'חברת ניקיון', confidence: 0.9 } },
  { match: /^ניקיון\s+חלונות/, output: { text: 'ניקיון חלונות', type: 'local_service', providerLabel: 'חברת ניקיון', confidence: 0.9 } },
  { match: /^שירותי?\s+ניקיון|^ניקיון\s+בית$/, output: { text: 'ניקיון בית', type: 'local_service', providerLabel: 'חברת ניקיון', confidence: 0.9 } },

  // --- SaaS / SEO tools (software_tool) ---
  { match: /^מעקב\s+אחר\s+(דירוגים|מיקומים)|^מעקב\s+דירוגים/, output: { text: 'מערכת מעקב דירוגים', type: 'software_tool', confidence: 0.92 } },
  { match: /^כלי\s+seo|^מערכת\s+seo|^תוכנת\s+seo/i, output: { text: 'מערכת SEO', type: 'software_tool', confidence: 0.9 } },
  { match: /^דוחות\s+seo|^דיווח\s+seo/i, output: { text: 'מערכת דוחות SEO', type: 'software_tool', confidence: 0.9 } },
  { match: /^נראות\s+ai|^מעקב\s+נראות/i, output: { text: 'כלי מעקב נראות ב-AI', type: 'software_tool', confidence: 0.9 } },

  // --- Perfume ---
  { match: /^בושם\s+לאישה|^בשמים?\s+לנשים?/, output: { text: 'בושם לנשים', type: 'product_category', confidence: 0.9 } },
  { match: /^בושם\s+לגבר|^בשמים?\s+לגברים?/, output: { text: 'בושם לגברים', type: 'product_category', confidence: 0.9 } },
  { match: /^בשמי\s+נישה/, output: { text: 'בשמי נישה', type: 'product_category', confidence: 0.9 } },

  // --- Appliance ---
  { match: /^מקרר(ים)?$/, output: { text: 'מקרר', type: 'product', confidence: 0.9 } },
  { match: /^מכונת\s+כביסה/, output: { text: 'מכונת כביסה', type: 'product', confidence: 0.9 } },
  { match: /^מייבש(\s+כביסה)?$/, output: { text: 'מייבש כביסה', type: 'product', confidence: 0.9 } },

  // --- Generic agency abstract — reject ---
  { match: /^seo$|^פרסום\s+ממומן\s+כללי/i, output: { text: '', type: 'abstract_category', confidence: 0 } },
]

const EN_RULES: NormRule[] = [
  // --- Business-type / abstract rejections ---
  { match: /^(fitness|sports|sporting\s+goods|gym|home\s+improvement|appliance|perfume|gift|flower|stationery)\s+store$/i, output: { text: '', type: 'business_name', confidence: 0 } },
  { match: /^(cleaning|remodeling|construction|design.build|seo|marketing)\s+(company|firm|agency)$/i, output: { text: '', type: 'business_name', confidence: 0 } },
  { match: /^sports\s+brands?$|^sneaker\s+brands?$/i, output: { text: '', type: 'abstract_category', confidence: 0 } },
  { match: /^sports?\s+shoes?$|^running\s+shoes?$|^sportswear$/i, output: { text: '', type: 'abstract_category', confidence: 0 } },
  { match: /^home\s+improvement$/i, output: { text: 'home remodeling', type: 'service', providerLabel: 'remodeling contractor', confidence: 0.85 } },
  { match: /^seo$/i, output: { text: '', type: 'abstract_category', confidence: 0 } },

  // --- Fitness equipment (products) ---
  { match: /^dumbbells?$/i, output: { text: 'dumbbells', type: 'product', confidence: 0.95 } },
  { match: /^weight\s+set|^set\s+of\s+weights$/i, output: { text: 'weight set', type: 'product', confidence: 0.95 } },
  { match: /^kettlebells?$/i, output: { text: 'kettlebells', type: 'product', confidence: 0.93 } },
  { match: /^treadmills?$/i, output: { text: 'treadmill', type: 'product', confidence: 0.95 } },
  { match: /^exercise\s+bikes?|^stationary\s+bikes?$/i, output: { text: 'exercise bike', type: 'product', confidence: 0.93 } },
  { match: /^(workout|weight)\s+bench(es)?$/i, output: { text: 'workout bench', type: 'product', confidence: 0.92 } },
  { match: /^resistance\s+bands$/i, output: { text: 'resistance bands', type: 'product', confidence: 0.92 } },
  { match: /^yoga\s+mats?$/i, output: { text: 'yoga mat', type: 'product', confidence: 0.9 } },

  // --- Fitness equipment (categories) ---
  { match: /^(home\s+gym|gym|fitness)\s+equipment$/i, output: { text: 'home gym equipment', type: 'product_category', confidence: 0.93 } },

  // --- Home improvement / construction (services) ---
  { match: /^kitchen\s+remodel(ing|s)?$/i, output: { text: 'kitchen remodeling', type: 'service', providerLabel: 'remodeling contractor', confidence: 0.95 } },
  { match: /^bathroom\s+remodel(ing|s)?$/i, output: { text: 'bathroom remodeling', type: 'service', providerLabel: 'remodeling contractor', confidence: 0.95 } },
  { match: /^home\s+(remodel(ing)?|renovation)$/i, output: { text: 'home remodeling', type: 'service', providerLabel: 'remodeling contractor', confidence: 0.9 } },
  { match: /^design.build( contractor)?$/i, output: { text: 'design-build remodeling', type: 'service', providerLabel: 'design-build contractor', confidence: 0.95 } },
  { match: /^remodeling\s+contractor$/i, output: { text: 'home remodeling', type: 'professional_service', providerLabel: 'remodeling contractor', confidence: 0.92 } },
  { match: /^general\s+contractor$/i, output: { text: 'construction', type: 'professional_service', providerLabel: 'general contractor', confidence: 0.9 } },
  { match: /^home\s+improvement\s+(service|contractor)$/i, output: { text: 'home remodeling', type: 'professional_service', providerLabel: 'remodeling contractor', confidence: 0.9 } },
  { match: /^construction(\s+services?)?$/i, output: { text: 'construction', type: 'service', providerLabel: 'construction company', confidence: 0.88 } },
  { match: /^custom\s+cabinetry$/i, output: { text: 'custom cabinetry', type: 'service', providerLabel: 'cabinetry contractor', confidence: 0.88 } },

  // --- Cleaning (local services) ---
  { match: /^office\s+cleaning(\s+services?)?$/i, output: { text: 'office cleaning', type: 'local_service', providerLabel: 'office cleaning company', confidence: 0.95 } },
  { match: /^commercial\s+cleaning(\s+services?)?$/i, output: { text: 'commercial cleaning', type: 'local_service', providerLabel: 'commercial cleaning company', confidence: 0.93 } },
  { match: /^building\s+maintenance$/i, output: { text: 'building maintenance', type: 'local_service', providerLabel: 'building maintenance company', confidence: 0.9 } },
  { match: /^residential\s+cleaning|^home\s+cleaning$/i, output: { text: 'home cleaning', type: 'local_service', providerLabel: 'cleaning company', confidence: 0.92 } },
  { match: /^post.construction\s+cleaning$/i, output: { text: 'post-construction cleaning', type: 'local_service', providerLabel: 'cleaning company', confidence: 0.9 } },

  // --- Florist (products + services) ---
  { match: /^flower\s+delivery$/i, output: { text: 'flower delivery', type: 'service', providerLabel: 'florist', confidence: 0.95 } },
  { match: /^same.day\s+flower\s+delivery$/i, output: { text: 'same-day flower delivery', type: 'service', providerLabel: 'florist', confidence: 0.95 } },
  { match: /^bouquets?$/i, output: { text: 'bouquets', type: 'product', confidence: 0.92 } },
  { match: /^birthday\s+flowers$/i, output: { text: 'birthday flowers', type: 'product_category', confidence: 0.9 } },
  { match: /^wedding\s+flowers$/i, output: { text: 'wedding flowers', type: 'product_category', confidence: 0.9 } },
  { match: /^romantic\s+flowers$/i, output: { text: 'romantic bouquets', type: 'product_category', confidence: 0.88 } },

  // --- SaaS / SEO tools ---
  { match: /^rank\s+tracking(\s+software|\s+tool)?$/i, output: { text: 'rank tracking software', type: 'software_tool', confidence: 0.95 } },
  { match: /^google\s+rank\s+tracking(\s+tool)?$/i, output: { text: 'Google rank tracking tool', type: 'software_tool', confidence: 0.95 } },
  { match: /^local\s+rank\s+tracking$/i, output: { text: 'local rank tracking tool', type: 'software_tool', confidence: 0.92 } },
  { match: /^seo\s+reporting(\s+software|\s+tool)?$/i, output: { text: 'SEO reporting software', type: 'software_tool', confidence: 0.93 } },
  { match: /^seo\s+(software|tool|platform)$/i, output: { text: 'SEO software', type: 'software_tool', confidence: 0.9 } },
  { match: /^ai\s+visibility(\s+tracking|\s+tool)?$/i, output: { text: 'AI visibility tracking tool', type: 'software_tool', confidence: 0.92 } },
  { match: /^ai\s+search\s+(tracking|visibility)$/i, output: { text: 'AI search visibility tool', type: 'software_tool', confidence: 0.9 } },
  { match: /^keyword\s+tracker?$/i, output: { text: 'keyword tracking software', type: 'software_tool', confidence: 0.9 } },

  // --- Perfume ---
  { match: /^perfumes?\s+for\s+women$/i, output: { text: "women's perfume", type: 'product_category', confidence: 0.9 } },
  { match: /^perfumes?\s+for\s+men$/i, output: { text: "men's perfume", type: 'product_category', confidence: 0.9 } },
  { match: /^niche\s+perfumes?$/i, output: { text: 'niche perfumes', type: 'product_category', confidence: 0.9 } },

  // --- Appliance ---
  { match: /^washing\s+machines?$/i, output: { text: 'washing machine', type: 'product', confidence: 0.9 } },
  { match: /^refrigerators?|^fridges?$/i, output: { text: 'refrigerator', type: 'product', confidence: 0.9 } },
  { match: /^dishwashers?$/i, output: { text: 'dishwasher', type: 'product', confidence: 0.9 } },
]

/**
 * Try to normalize a single raw string into a typed search object.
 * Returns null when no rule matches — the caller must skip that object.
 */
export function normalizeSearchObject(
  raw: string,
  language: 'he' | 'en'
): Omit<SearchObject, 'source'> | null {
  const trimmed = (raw || '').trim()
  if (!trimmed) return null
  const rules = language === 'he' ? HE_RULES : EN_RULES
  for (const rule of rules) {
    if (rule.match.test(trimmed)) {
      return {
        text: rule.output.text,
        type: rule.output.type,
        providerLabel: rule.output.providerLabel,
        confidence: rule.output.confidence ?? 0.85,
      }
    }
  }
  return null
}

/**
 * Reject an object before template generation.
 */
export function rejectSearchObject(
  object: Omit<SearchObject, 'source'>,
  businessName: string
): boolean {
  const text = (object.text || '').trim()
  if (!text) return true
  if (object.type === 'abstract_category') return true
  if (object.type === 'business_name') return true
  if (object.type === 'brand') return true
  if (object.confidence < 0.7) return true

  const brand = (businessName || '').trim()
  if (brand) {
    const lt = text.toLowerCase()
    const lb = brand.toLowerCase()
    if (lt === lb) return true
    if (lt.includes(lb)) return true
    if (lb.includes(lt) && lt.length > 4) return true
  }
  return false
}

export type ExtractContext = {
  language: 'he' | 'en'
  businessName: string
  secondaryCategories: string[]
  keywords?: string[]
}

/**
 * Extract validated, typed search objects from project context.
 * Sources: secondaryCategories (primary) + keywords (fallback).
 * Each candidate is normalized then rejected if invalid. Deduplicated by text.
 */
export function extractSearchObjects(ctx: ExtractContext): SearchObject[] {
  const seen = new Set<string>()
  const out: SearchObject[] = []

  const tryAdd = (raw: string, source: SearchObjectSource) => {
    const norm = normalizeSearchObject(raw, ctx.language)
    if (!norm) return
    if (rejectSearchObject(norm, ctx.businessName)) return
    const key = norm.text.toLowerCase().trim()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ ...norm, source })
  }

  for (const sec of ctx.secondaryCategories || []) {
    tryAdd(sec, 'secondary')
  }
  for (const kw of ctx.keywords || []) {
    tryAdd(kw, 'keyword')
  }

  return out
}

/**
 * English article helper: "a" / "an" based on initial sound.
 */
function enArticle(noun: string): string {
  const first = (noun || '').trim().charAt(0).toLowerCase()
  return /[aeiou]/.test(first) ? 'an' : 'a'
}

/**
 * Choose appropriate question templates for an object type.
 * Returns filled question strings (no placeholders remaining).
 */
export function chooseTemplatesByObjectType(
  object: SearchObject,
  language: 'he' | 'en',
  city: string | null
): string[] {
  const cityHe = city ? ` ב${city}` : ''
  const cityEn = city ? ` in ${city}` : ''
  const obj = object.text

  if (language === 'he') {
    switch (object.type) {
      case 'product':
        return [
          `איפה אפשר לקנות ${obj}?`,
          `איזו חנות מומלצת לקניית ${obj}?`,
          `כמה עולה ${obj}?`,
          `מה חשוב לבדוק לפני שקונים ${obj}?`,
        ]
      case 'product_category':
        return [
          `איזה ${obj} מומלץ לשימוש ביתי?`,
          `איפה כדאי לקנות ${obj}?`,
          `מה חשוב לבדוק לפני שקונים ${obj}?`,
        ]
      case 'service':
      case 'local_service':
      case 'professional_service': {
        const provider = object.providerLabel || 'חברה מומלצת'
        return [
          `מי מומלץ ל${obj}${cityHe}?`,
          `כמה עולה ${obj}${cityHe}?`,
          `מה חשוב לבדוק לפני שבוחרים ${provider}?`,
          `איזו ${provider} מומלצת${cityHe}?`,
        ]
      }
      case 'software_tool':
        return [
          `איזו מערכת מומלצת ל${obj}?`,
          `איך לבחור ${obj}?`,
          `כמה עולה ${obj}?`,
          `מה היתרונות של ${obj} לעסקים?`,
        ]
      default:
        return []
    }
  }

  // English
  switch (object.type) {
    case 'product':
      return [
        `Where can I buy ${obj}?`,
        `Which store is recommended for buying ${obj}?`,
        `How much do ${obj} cost?`,
        `What should I check before buying ${obj}?`,
      ]
    case 'product_category':
      return [
        `What is the best ${obj} for home use?`,
        `Where can I buy ${obj}?`,
        `What should I check before buying ${obj}?`,
      ]
    case 'service':
    case 'local_service':
    case 'professional_service': {
      const provider = object.providerLabel || 'provider'
      const article = enArticle(provider)
      const list: string[] = [
        `Who is recommended for ${obj}${cityEn}?`,
        `How much does ${obj} cost${cityEn}?`,
        `What should I check before hiring ${article} ${provider}?`,
        `Which ${provider} is recommended${cityEn}?`,
      ]
      if (/delivery$/i.test(obj)) {
        list.push(`Where can I order ${obj}${cityEn}?`)
        list.push(`Can I schedule ${obj} in advance?`)
      }
      return list
    }
    case 'software_tool':
      return [
        `What is the best ${obj}?`,
        `Which ${obj} is recommended for agencies?`,
        `How do I choose ${obj}?`,
        `How much does ${obj} cost?`,
      ]
    default:
      return []
  }
}
