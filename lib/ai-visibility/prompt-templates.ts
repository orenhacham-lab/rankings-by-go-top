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

import {
  extractSearchObjects,
  chooseTemplatesByObjectType,
  type SearchObject,
} from './search-object-classifier'
import {
  generateHumanLikeSmartQuestions,
  validateHumanSearchQuery,
  convertToPromptSuggestions,
  type GeneratorContext,
} from './semantic-generator-v2'
import { generateIntentQuestions } from './intent-engine'

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
  | 'product_brand'
  | 'local_service'
  | 'home_improvement_service'
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
  confidenceTier: 'high' | 'good' | 'medium' | 'opportunity' | 'experimental'
  reason: string
  chips: string[] // signal-based, e.g. 'chip_commercial_phrase', 'chip_competitor_gap'
  valueReason: string // localized 1-line explanation of business value
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
  product_brand: 'מותג מוצרים',
  local_service: 'שירות מקומי',
  home_improvement_service: 'שיפוצים ובנייה',
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
  product_brand: 'product brand',
  local_service: 'local service',
  home_improvement_service: 'home improvement & remodeling',
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
  const businessLower = business.toLowerCase().trim()
  const domainLower = domain.toLowerCase().trim()

  // High-priority signals — check these FIRST to override weaker signals.
  // Flower/florist signals are high-priority; they override gift signals.
  if (/(flower|florist|פרחים|זרים|זר|משלוח פרחים|משלוחי פרחים|זר פרחים|זרי פרחים|חנות פרחים|bouquets|flower delivery|erez-flowers)/.test(text))
    return 'florist'

  if (/(perfume|fragrance|cologne|פרפיום|בושם|בשמים|או דה פרפיום|או דה טואלט)/.test(text)) return 'perfume'
  if (/(ניקיון|cleaner|cleaning|פוליש|נקיון|פוליסה|nettoyage)/.test(text)) return 'cleaning'

  // SaaS / platform brands — must come BEFORE product_brand so brand names like
  // Shopify/Wix/Notion don't get classified as consumer product ecosystems.
  // These are tools/platforms where the brand IS the product (singular SaaS),
  // not a brand of multiple physical products like Apple/Samsung.
  const saasPlatformBrands = /\b(shopify|wix|squarespace|godaddy|wordpress|woocommerce|magento|bigcommerce|monday|hubspot|salesforce|pipedrive|zoho|freshworks|intercom|zendesk|helpscout|mailchimp|sendgrid|klaviyo|activecampaign|convertkit|constantcontact|notion|slack|asana|trello|clickup|jira|confluence|basecamp|airtable|coda|figma|miro|canva|adobe express|loom|zoom|webex|teams|google workspace|gsuite|dropbox|onedrive|box|semrush|ahrefs|moz|seoclarity|screamingfrog|brightedge|conductor|searchmetrics|sistrix|serpstat|spyfu|raven|brightlocal|whitespark|yext|stripe|paypal|square|braintree|adyen|klarna|afterpay|quickbooks|xero|freshbooks|wave|sage|netsuite|sap|oracle|workday|bamboohr|gusto|rippling|deel|remote|datadog|newrelic|splunk|sumologic|loggly|papertrail|grafana|pagerduty|opsgenie|statuspage|sentry|bugsnag|rollbar|raygun|loggly|crashlytics|firebase|amplitude|mixpanel|heap|fullstory|hotjar|crazyegg|optimizely|launchdarkly|segment|rudderstack|fivetran|stitch|matillion|alteryx|tableau|powerbi|looker|metabase|periscope|chartio|domo|sisense|qlik|thoughtspot|alteryx|databricks|snowflake|redshift|bigquery|webflow|elementor|divi|themeforest|envato|kajabi|teachable|thinkific|podia|gumroad|substack|patreon|onlyfans|memberful|kit|beehiiv|ghost)\b/i

  if (saasPlatformBrands.test(domainLower) || saasPlatformBrands.test(businessLower)) {
    return 'saas'
  }

  // Major consumer / product ecosystem brands (HIGH priority, before generic SaaS)
  // These are brands that produce a LINE of physical products (iPhone, MacBook,
  // Galaxy phone, PlayStation, etc.), not single SaaS tools.
  const productEcosystemBrands = /\b(apple|iphone|ipad|macbook|applecare|airpods|samsung|galaxy|dyson|sony|playstation|xbox|nintendo|switch|adobe creative|photoshop|illustrator|premiere|microsoft surface|surface|pixel|nexus|canon|nikon|gopro|fitbit|garmin|tomtom|dji|phantom|mavic|osmo|infinix|realme|oppo|vivo|xiaomi|poco|redmi|oneplus|nokia|tcl|hisense|haier|panasonic|philips|bosch|siemens|electrolux|whirlpool|miele|bissell|irobot|roomba|anker|aukey|belkin|logitech|corsair|razer|steelseries|hyperx|sennheiser|bose|jbl|beats|skullcandy|pioneer|yamaha|denon|onkyo|marantz|technics|bang olufsen|klipsch|polk|svs|asus|msi|gigabyte|asrock|nike|adidas|puma|reebok|under armour|new balance|asics|brooks|hoka|saucony|tesla|toyota|honda|bmw|mercedes|audi|ford|chevrolet|volkswagen|hyundai|kia|nissan|mazda|subaru|lexus|porsche|ferrari|lamborghini|rolex|omega|tag heuer|breitling|hublot|cartier|tiffany|louis vuitton|gucci|chanel|prada|hermes|dior|burberry|coach|kate spade|michael kors|fendi|valentino|versace|armani|kraft|nestle|coca cola|pepsi|red bull|monster)\b/i

  if (productEcosystemBrands.test(domainLower) || productEcosystemBrands.test(businessLower)) {
    return 'product_brand'
  }

  // SaaS / software tools (must come BEFORE agency so SEO/SEM tools don't get
  // classified as marketing agencies)
  if (/(rank tracker|rank tracking|seo software|seo tool|tracking software|seo platform|seo saas|rank checker|rank monitor|visibility tool|visibility tracking|gotopseo|seoclarity|semrush|ahrefs|moz)/.test(text))
    return 'saas'
  if (/(saas|software as a service|cloud platform|\.io|\.ai|api platform|developer tool|monitoring tool|analytics platform|business intelligence)/.test(text)) return 'saas'

  if (/(seo|ppc|sem|google ads|adwords|agency|marketing|advertis|digital|קידום אתרים|ממומן|פרסום|שיווק|סוכנות|דיגיטל)/.test(text))
    return 'agency'
  if (/(home improv|remodel|construc|contractor|kitchen|bathroom|design.build|plumb|electric|hvac|renov|cabinet|שיפוץ|קבלן|רימודל)/.test(text))
    return 'home_improvement_service'

  // Fitness equipment store — must come BEFORE generic fitness/gym so a store
  // selling weights/treadmills doesn't get classified as a gym.
  if (/(ציוד כושר|מוצרי כושר|חנות ציוד|חנות ספורט|משקולות|fitness equipment|gym equipment|weights|dumbbell|treadmill|exercise bike|home gym)/.test(text))
    return 'sports_store'

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
    // Primary: brand-specific platform selection (70%)
    { intent: 'pre_purchase', text: 'האם {{business}} מתאים לעסק קטן?', score: 92, offering: 'primary' },
    { intent: 'commercial', text: 'כמה עולה {{business}}?', score: 90, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: 'מה היתרונות והחסרונות של {{business}}?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'האם {{business}} שווה את המחיר?', score: 86, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'איך מתחילים להשתמש ב-{{business}}?', score: 84, offering: 'primary' },
    { intent: 'pre_purchase', text: 'למי מתאים {{business}}?', score: 82, offering: 'primary' },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
  ],

  product_brand: [
    // Primary: ecosystem-level questions that read naturally with brand as ecosystem (70%)
    { intent: 'informational', text: 'מה היתרונות והחסרונות של מוצרי {{business}}?', score: 92, offering: 'primary' },
    { intent: 'local', text: 'איפה כדאי לקנות מוצרי {{business}} בישראל?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'מה חשוב לבדוק לפני קניית מוצר של {{business}}?', score: 88, offering: 'primary' },
    { intent: 'commercial', text: 'איפה הכי משתלם לקנות מוצרי {{business}}?', score: 86, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'האם כדאי לקנות מוצרי {{business}} חדשים או מחודשים?', score: 84, offering: 'primary' },
    { intent: 'recommendation', text: 'אילו מוצרים של {{business}} מומלצים השנה?', score: 83, offering: 'primary' },

    // Generic: brand & reviews (fallback)
    { intent: 'brand', text: 'חוות דעת על מוצרי {{business}}', score: 74, offering: 'generic' },
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
    { intent: 'pre_purchase', text: 'איזה זר פרחים מעוצב כדאי להזמין לשבת?', score: 86, offering: 'primary' },

    // PRIMARY: Trust / Pre-purchase (15%)
    { intent: 'pre_purchase', text: 'איך לבחור חנות פרחים אמינה?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'מה חשוב לבדוק לפני שמזמינים פרחים אונליין?', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך יודעים שהפרחים יגיעו טריים?', score: 88, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איך לבחור זר פרחים איכותי?', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'מה חשוב לבדוק במשלוח פרחים?', score: 86, offering: 'primary' },
    { intent: 'informational', text: 'איך לשמור על פרחים ताזים יותר זמן?', score: 85, offering: 'primary' },
    { intent: 'informational', text: 'מה הזרים הטבעיים החזקים והעמידים?', score: 84, offering: 'primary' },

    // PRIMARY: Product/Information (10%)
    { intent: 'pre_purchase', text: 'איזה זר פרחים רומנטי כדאי להזמין?', score: 83, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה זר מתאים לכל חג או אירוע?', score: 82, offering: 'primary' },
    { intent: 'pre_purchase', text: 'איזה זרים מתאימים לחלל עסקים או משרדים?', score: 81, offering: 'primary' },
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
  ],

  home_improvement_service: [
    // Primary: recommendations & quality checks (70%)
    { intent: 'recommendation', text: 'מי מומלץ לשיפוץ מטבח ב{{city}}?', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'איזו חברה מומלצת לשיפוץ חדר אמבטיה ב{{city}}?', score: 92, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'מה חשוב לבדוק לפני שבוחרים קבלן שיפוצים?', score: 88, offering: 'primary' },
    { intent: 'recommendation', text: 'איזו חברת design-build מומלצת ב{{city}}?', score: 90, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'קבלן שיפוצים מומלץ ב{{city}}', score: 89, offering: 'primary', requiresCity: true },
    { intent: 'informational', text: 'איך לתכננת שיפוץ בית בצורה נכונה?', score: 85, offering: 'primary' },

    // Secondary: pricing & process (20%)
    { intent: 'commercial', text: 'כמה עולה שיפוץ בית ב{{city}}?', score: 89, offering: 'secondary', requiresCity: true, themeBoost: { price: 4 } },
    { intent: 'transactional', text: 'איך בוחרים קבלן לשיפוץ?', score: 83, offering: 'secondary' },

    // Local: specific services (10%)
    { intent: 'recommendation', text: 'מי מומלץ להתקנת מטבח חדש ב{{city}}?', score: 87, offering: 'local', requiresCity: true },
  ],

  generic: [
    { intent: 'recommendation', text: 'אילו עסקים מומלצים בתחום של {{business}}?', score: 79, offering: 'primary' },
    { intent: 'informational', text: 'מה התחום של {{business}}?', score: 69, offering: 'primary' },
    { intent: 'brand', text: 'חוות דעת על {{business}}', score: 74, offering: 'generic' },
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
    // Primary: brand-specific platform selection (70%)
    { intent: 'pre_purchase', text: 'Is {{business}} good for small businesses?', score: 92, offering: 'primary' },
    { intent: 'commercial', text: 'How much does {{business}} cost?', score: 90, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: 'What are the pros and cons of {{business}}?', score: 88, offering: 'primary' },
    { intent: 'informational', text: 'Is {{business}} worth the price?', score: 86, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: 'How do I get started with {{business}}?', score: 84, offering: 'primary' },
    { intent: 'pre_purchase', text: 'Who is {{business}} good for?', score: 82, offering: 'primary' },

    // Generic: brand (fallback)
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
  ],

  product_brand: [
    // Primary: ecosystem-level questions that read naturally with brand as ecosystem (70%)
    { intent: 'informational', text: 'What are the pros and cons of {{business}} products?', score: 92, offering: 'primary' },
    { intent: 'local', text: 'Where can I buy {{business}} products?', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: 'What should I check before buying {{business}} products?', score: 88, offering: 'primary' },
    { intent: 'commercial', text: 'Where is the cheapest place to buy {{business}} products?', score: 86, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: 'Should I buy {{business}} products new or refurbished?', score: 84, offering: 'primary' },
    { intent: 'recommendation', text: 'Which {{business}} products are recommended this year?', score: 83, offering: 'primary' },

    // Generic: brand & reviews (fallback)
    { intent: 'brand', text: 'Reviews of {{business}} products', score: 74, offering: 'generic' },
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

  home_improvement_service: [
    { intent: 'recommendation', text: 'Who is recommended for kitchen remodeling in {{city}}?', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: 'Best bathroom remodeling contractor in {{city}}', score: 92, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'What to check before hiring a remodeling contractor?', score: 88, offering: 'primary' },
    { intent: 'recommendation', text: 'Which design-build company is recommended in {{city}}?', score: 90, offering: 'primary', requiresCity: true },
    { intent: 'commercial', text: 'How much does home remodeling cost in {{city}}?', score: 89, offering: 'secondary', requiresCity: true, themeBoost: { price: 4 } },
    { intent: 'transactional', text: 'How to choose a reliable contractor for home projects?', score: 85, offering: 'primary' },
  ],

  local_service: [
    { intent: 'recommendation', text: 'Recommended professionals in {{city}}', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'What to look for when hiring a service professional?', score: 81, offering: 'primary' },
    { intent: 'commercial', text: 'How much do professional services cost in {{city}}?', score: 79, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },
  ],

  generic: [
    { intent: 'recommendation', text: 'Best {{business}} features and benefits', score: 77, offering: 'primary' },
    { intent: 'brand', text: 'Reviews of {{business}}', score: 74, offering: 'generic' },
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
 * Well-known brand-vs-competitor pairs. Used to generate specific comparison
 * questions instead of generic "Brand vs competitors". Only used when the
 * business name matches a known key — otherwise comparison questions are
 * simply skipped (we do not fall back to generic "competitors").
 */
const BRAND_COMPARISONS: Record<string, string[]> = {
  shopify: ['WooCommerce', 'BigCommerce'],
  wix: ['Squarespace', 'WordPress'],
  squarespace: ['Wix', 'WordPress'],
  woocommerce: ['Shopify', 'BigCommerce'],
  bigcommerce: ['Shopify', 'WooCommerce'],
  monday: ['Asana', 'ClickUp'],
  asana: ['Monday', 'ClickUp', 'Trello'],
  hubspot: ['Salesforce', 'Pipedrive'],
  salesforce: ['HubSpot', 'Pipedrive'],
  pipedrive: ['HubSpot', 'Salesforce'],
  semrush: ['Ahrefs', 'Moz'],
  ahrefs: ['Semrush', 'Moz'],
  moz: ['Semrush', 'Ahrefs'],
  notion: ['Evernote', 'Obsidian'],
  slack: ['Microsoft Teams', 'Discord'],
  canva: ['Adobe Express', 'Figma'],
  mailchimp: ['Klaviyo', 'ActiveCampaign'],
  apple: ['Samsung', 'Google'],
  iphone: ['Samsung Galaxy', 'Google Pixel'],
  macbook: ['Dell XPS', 'ThinkPad'],
  samsung: ['Apple', 'Google'],
  galaxy: ['iPhone', 'Pixel'],
  sony: ['LG', 'Samsung'],
  playstation: ['Xbox', 'Nintendo Switch'],
  xbox: ['PlayStation', 'Nintendo Switch'],
  nintendo: ['PlayStation', 'Xbox'],
  nike: ['Adidas', 'Puma'],
  adidas: ['Nike', 'Puma'],
  dyson: ['Shark', 'Bissell'],
  dji: ['Autel', 'Skydio'],
  gopro: ['DJI Osmo', 'Insta360'],
}

function getBrandComparisonQuestions(
  business: string,
  language: 'he' | 'en'
): Array<{ text: string; intent: PromptIntent; score: number }> {
  const key = (business || '').trim().toLowerCase()
  if (!key) return []
  const competitors = BRAND_COMPARISONS[key]
  if (!competitors || competitors.length === 0) return []

  const out: Array<{ text: string; intent: PromptIntent; score: number }> = []
  for (const competitor of competitors) {
    if (language === 'he') {
      out.push({ text: `מה ההבדל בין ${business} ל-${competitor}?`, intent: 'comparison', score: 90 })
      out.push({ text: `מה עדיף ${business} או ${competitor}?`, intent: 'comparison', score: 88 })
    } else {
      out.push({ text: `${business} vs ${competitor}: which is better?`, intent: 'comparison', score: 90 })
      out.push({ text: `What is the difference between ${business} and ${competitor}?`, intent: 'comparison', score: 88 })
    }
  }
  return out
}

/**
 * Curated product families per major consumer-product brand. Only seeds the
 * generator when a brand provides NO manual secondary categories / tracking
 * keywords — manual signals always win. SaaS / platform brands (Shopify, Wix,
 * Monday, HubSpot, etc.) are intentionally NOT listed here: they remain SaaS.
 */
const KNOWN_BRAND_PRODUCTS: Record<string, { he: string[]; en: string[] }> = {
  apple: {
    he: ['אייפון', 'מקבוק', 'אייפד', 'Apple Watch', 'AirPods', 'iCloud', 'AppleCare'],
    en: ['iPhone', 'MacBook', 'iPad', 'Apple Watch', 'AirPods', 'iCloud', 'AppleCare'],
  },
  samsung: {
    he: ['Samsung Galaxy', 'Galaxy Watch', 'Galaxy Buds', 'Galaxy Tab'],
    en: ['Samsung Galaxy', 'Galaxy Watch', 'Galaxy Buds', 'Galaxy Tab'],
  },
  microsoft: {
    he: ['Surface', 'Xbox', 'Microsoft 365', 'OneDrive'],
    en: ['Surface', 'Xbox', 'Microsoft 365', 'OneDrive'],
  },
  sony: {
    he: ['PlayStation', 'Sony Alpha', 'אוזניות Sony'],
    en: ['PlayStation', 'Sony Alpha', 'Sony headphones'],
  },
  dyson: {
    he: ['שואב אבק Dyson', 'Dyson Airwrap', 'מטהר אוויר Dyson'],
    en: ['Dyson vacuum', 'Dyson Airwrap', 'Dyson purifier'],
  },
  nintendo: {
    he: ['Nintendo Switch', 'Switch OLED'],
    en: ['Nintendo Switch', 'Switch OLED'],
  },
  gopro: {
    he: ['GoPro Hero', 'GoPro Max'],
    en: ['GoPro Hero', 'GoPro Max'],
  },
  dji: {
    he: ['DJI Mavic', 'DJI Osmo', 'DJI Mini'],
    en: ['DJI Mavic', 'DJI Osmo', 'DJI Mini'],
  },
  adobe: {
    he: ['Photoshop', 'Illustrator', 'Premiere Pro'],
    en: ['Photoshop', 'Illustrator', 'Premiere Pro'],
  },
}

/**
 * Product-to-competitor pairs at the PRODUCT level (not brand level). Used so
 * Apple/Samsung comparisons read as "iPhone vs Samsung Galaxy" instead of
 * "Apple vs Samsung" when product terms are known. Lookup key is lower-cased
 * product term; competitors are the exact strings to insert.
 */
const PRODUCT_LEVEL_COMPETITORS: Record<string, string[]> = {
  iphone: ['Samsung Galaxy', 'Google Pixel'],
  'אייפון': ['Samsung Galaxy', 'Google Pixel'],
  macbook: ['Dell XPS', 'ThinkPad'],
  'מקבוק': ['Dell XPS', 'ThinkPad'],
  'macbook pro': ['Dell XPS 15', 'ThinkPad X1'],
  'מקבוק פרו': ['Dell XPS 15', 'ThinkPad X1'],
  'macbook air': ['Dell XPS 13', 'ThinkPad X13'],
  'מקבוק אייר': ['Dell XPS 13', 'ThinkPad X13'],
  ipad: ['Samsung Galaxy Tab', 'Microsoft Surface'],
  'אייפד': ['Samsung Galaxy Tab', 'Microsoft Surface'],
  'apple watch': ['Galaxy Watch'],
  airpods: ['Galaxy Buds', 'Sony WF'],
  icloud: ['Google Drive', 'OneDrive'],
  applecare: ['SquareTrade', 'Asurion'],
  'samsung galaxy': ['iPhone', 'Google Pixel'],
  'galaxy watch': ['Apple Watch'],
  'galaxy buds': ['AirPods', 'Sony WF'],
  'galaxy tab': ['iPad', 'Microsoft Surface'],
  surface: ['MacBook', 'iPad'],
  xbox: ['PlayStation', 'Nintendo Switch'],
  playstation: ['Xbox', 'Nintendo Switch'],
  'nintendo switch': ['PlayStation', 'Xbox'],
  'sony alpha': ['Canon EOS', 'Nikon Z'],
  'dyson vacuum': ['Shark vacuum', 'Bissell'],
  'שואב אבק dyson': ['Shark', 'Bissell'],
  'dyson airwrap': ['Shark FlexStyle', 'Revlon One-Step'],
}

export type ProductTermSpec = {
  term: string
  source: 'manual' | 'keyword' | 'known_brand' | 'fallback'
  specificity: 'variant' | 'product' | 'generic'
  base?: string
}

/**
 * Extract a prioritized list of product terms that should drive the visible
 * question text for a product_brand business. Priority order:
 *   1) manual secondaryCategories         (source: 'manual')
 *   2) tracking keywords                  (source: 'keyword')
 *   3) known brand products for the brand (source: 'known_brand')
 *   4) generic brand fallback             (source: 'fallback') — only if
 *      nothing else produced a specific term
 *
 * Keyword variants (e.g., "מקבוק פרו" when "מקבוק" is a manual category) are
 * detected and tagged so a comparison question can be generated.
 */
export function extractProductTerms(input: {
  businessName: string
  language: 'he' | 'en'
  manualSecondaryCategories?: string[]
  keywords?: string[]
}): ProductTermSpec[] {
  const businessName = (input.businessName || '').trim()
  const manualSecondary = (input.manualSecondaryCategories || [])
    .map((s) => (s || '').trim())
    .filter((s) => s.length > 0)
  const keywords = (input.keywords || [])
    .map((s) => (s || '').trim())
    .filter((s) => s.length > 0)

  const out: ProductTermSpec[] = []
  const seen = new Set<string>()
  const brandLower = businessName.toLowerCase()

  const add = (
    term: string,
    source: ProductTermSpec['source'],
    specificity: ProductTermSpec['specificity'],
    base?: string
  ) => {
    const clean = (term || '').trim()
    if (!clean) return
    if (clean.length < 2) return
    // Skip pure brand name as a "product term" (it's the fallback bucket only)
    if (source !== 'fallback' && brandLower && clean.toLowerCase() === brandLower) return
    const key = clean.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ term: clean, source, specificity, base })
  }

  // --- Priority 1: manual secondary categories ---
  for (const m of manualSecondary) {
    add(m, 'manual', 'product')
  }

  // --- Priority 2: tracking keywords, tagged variant when more specific than a manual term ---
  for (const kw of keywords) {
    if (brandLower && kw.toLowerCase() === brandLower) continue
    let base: string | undefined
    for (const m of manualSecondary) {
      const lk = kw.toLowerCase()
      const lm = m.toLowerCase()
      if (lk !== lm && lk.includes(lm)) {
        base = m
        break
      }
    }
    if (base) {
      add(kw, 'keyword', 'variant', base)
    } else {
      add(kw, 'keyword', 'product')
    }
  }

  // --- Priority 3: known brand products for the business name ---
  const known = KNOWN_BRAND_PRODUCTS[brandLower]
  if (known) {
    const list = input.language === 'he' ? known.he : known.en
    for (const k of list) add(k, 'known_brand', 'product')
  }

  // --- Priority 4: generic fallback (only if nothing specific) ---
  const hasSpecific = out.some((t) => t.specificity !== 'generic')
  if (!hasSpecific && businessName) {
    add(businessName, 'fallback', 'generic')
  }

  return out
}

/**
 * Build product-aware questions for a product_brand business. Uses the
 * prioritized product terms returned by extractProductTerms() so manual
 * secondary categories and tracking keywords actively shape the visible text.
 *
 * - Per-term questions use the actual product term ("איזה אייפון מומלץ?")
 * - When the user tracks multiple variants of the same base (מקבוק פרו /
 *   מקבוק אייר) a variant comparison is emitted.
 * - When a term has a known product-level competitor (PRODUCT_LEVEL_COMPETITORS)
 *   a product-level comparison is emitted instead of a brand-level one.
 */
function getProductBrandQuestions(
  terms: ProductTermSpec[],
  language: 'he' | 'en'
): Array<{ text: string; intent: PromptIntent; score: number }> {
  const out: Array<{ text: string; intent: PromptIntent; score: number }> = []
  if (!terms || terms.length === 0) return out

  // 1. Per-term templates — manual & variant lead, known_brand fills in
  for (const t of terms) {
    if (t.specificity === 'generic') continue
    const term = t.term
    const baseScore =
      t.specificity === 'variant'
        ? 96
        : t.source === 'manual'
          ? 94
          : t.source === 'keyword'
            ? 92
            : 88

    if (language === 'he') {
      out.push({ text: `איזה ${term} מומלץ לקנות?`, intent: 'recommendation', score: baseScore })
      out.push({ text: `האם ${term} שווה את המחיר?`, intent: 'commercial', score: baseScore - 2 })
      out.push({ text: `כמה עולה ${term}?`, intent: 'commercial', score: baseScore - 3 })
      out.push({ text: `איפה כדאי לקנות ${term} בישראל?`, intent: 'local', score: baseScore - 4 })
      out.push({ text: `מה חשוב לבדוק לפני קניית ${term}?`, intent: 'pre_purchase', score: baseScore - 5 })
      out.push({ text: `מה היתרונות והחסרונות של ${term}?`, intent: 'informational', score: baseScore - 6 })
      if (t.specificity === 'variant' || t.source === 'manual') {
        out.push({ text: `האם ${term} מתאים לעבודה?`, intent: 'pre_purchase', score: baseScore - 7 })
        out.push({ text: `האם ${term} מתאים ללימודים?`, intent: 'pre_purchase', score: baseScore - 8 })
      }
    } else {
      out.push({ text: `Which ${term} should I buy?`, intent: 'recommendation', score: baseScore })
      out.push({ text: `Is ${term} worth the price?`, intent: 'commercial', score: baseScore - 2 })
      out.push({ text: `How much does ${term} cost?`, intent: 'commercial', score: baseScore - 3 })
      out.push({ text: `Where can I buy ${term}?`, intent: 'local', score: baseScore - 4 })
      out.push({ text: `What should I check before buying ${term}?`, intent: 'pre_purchase', score: baseScore - 5 })
      out.push({ text: `What are the pros and cons of ${term}?`, intent: 'informational', score: baseScore - 6 })
      if (t.specificity === 'variant' || t.source === 'manual') {
        out.push({ text: `Is ${term} good for work?`, intent: 'pre_purchase', score: baseScore - 7 })
        out.push({ text: `Is ${term} good for students?`, intent: 'pre_purchase', score: baseScore - 8 })
      }
    }
  }

  // 2. Variant comparison questions — when ≥2 variants share a base
  const byBase: Record<string, ProductTermSpec[]> = {}
  for (const t of terms) {
    if (t.specificity === 'variant' && t.base) {
      const key = t.base.toLowerCase()
      if (!byBase[key]) byBase[key] = []
      byBase[key].push(t)
    }
  }
  for (const key of Object.keys(byBase)) {
    const variants = byBase[key]
    if (variants.length < 2) continue
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const a = variants[i].term
        const b = variants[j].term
        if (language === 'he') {
          out.push({ text: `מה ההבדל בין ${a} ל${b}?`, intent: 'comparison', score: 97 })
          out.push({ text: `מה עדיף, ${a} או ${b}?`, intent: 'comparison', score: 95 })
        } else {
          out.push({ text: `${a} vs ${b}: which should I buy?`, intent: 'comparison', score: 97 })
          out.push({ text: `What is the difference between ${a} and ${b}?`, intent: 'comparison', score: 95 })
        }
      }
    }
  }

  // 3. Product-level competitor comparisons (replace brand-level)
  for (const t of terms) {
    if (t.specificity === 'generic') continue
    const competitors = PRODUCT_LEVEL_COMPETITORS[t.term.toLowerCase()]
    if (!competitors || competitors.length === 0) continue
    for (const comp of competitors) {
      if (language === 'he') {
        out.push({ text: `מה ההבדל בין ${t.term} ל${comp}?`, intent: 'comparison', score: 90 })
        out.push({ text: `מה עדיף, ${t.term} או ${comp}?`, intent: 'comparison', score: 88 })
      } else {
        out.push({ text: `${t.term} vs ${comp}: which is better?`, intent: 'comparison', score: 90 })
        out.push({ text: `What is the difference between ${t.term} and ${comp}?`, intent: 'comparison', score: 88 })
      }
    }
  }

  return out
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
  home_improvement_service: {
    primaryOfferings: [
      'שיפוץ מטבח', 'שיפוץ חדר אמבטיה', 'שיפוץ בית', 'בנייה', 'קבלן שיפוצים',
      'kitchen remodeling', 'bathroom remodeling', 'home renovation', 'construction',
      'design-build contractor', 'design and build',
    ],
    secondaryOfferings: [
      'ריהוט בהזמנה', 'עיצוב פנים', 'קירור וחימום',
      'custom cabinetry', 'interior design', 'HVAC installation',
    ],
    excludedTopics: [
      'ציוד כושר', 'מוצרי חשמל ניידים', 'fitness equipment', 'portable appliances',
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
  product_brand: {
    primaryOfferings: [
      'מוצרי טק', 'אלקטרוניקה', 'מוצרים אלקטרוניים', 'מוצרי מותג',
      'tech products', 'electronics', 'consumer products', 'brand products',
    ],
    secondaryOfferings: [
      'אביזרים', 'חלפים', 'שירות תמיכה', 'accessories', 'parts', 'support',
    ],
    excludedTopics: [
      'שירותי כלליים', 'חנויות כלליות', 'general services', 'generic retailers',
    ],
  },
  generic: {
    primaryOfferings: [],
    secondaryOfferings: [],
    excludedTopics: [],
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
  'saas', 'product_brand', 'local_service', 'cleaning', 'florist', 'restaurant', 'healthcare',
  'legal', 'real_estate', 'fitness', 'beauty', 'education', 'second_hand_fashion', 'generic',
  'home_improvement_service',
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
  // Sports / fitness equipment store — must come BEFORE generic fitness so a
  // store selling weights/treadmills isn't classified as a gym.
  if (/(חנות ציוד|חנות ספורט|ציוד כושר|מוצרי כושר|משקולות|fitness equipment|gym equipment|home gym|sports store|sporting goods)/.test(t))
    return 'sports_store'
  if (/(ספורט|sport|נעלי ריצה|adidas|nike|פומה)/.test(t)) return 'sports_store'
  // Appliances
  if (/(מקרר|תנור|מוצרי חשמל|מכונת כביסה|appliance|חשמל ביתי)/.test(t)) return 'appliance_store'
  // Product brand / consumer tech brand (Apple, Samsung, Sony, etc.)
  if (/(מותג|מוצר אלקטרוני|מוצר טק|brand|product brand|consumer tech|apple|iphone|ipad|macbook|samsung|galaxy|sony|microsoft|dyson)/.test(t))
    return 'product_brand'
  // SaaS — also rank tracking / SEO tools (not the same as SEO agencies)
  if (/(rank track|seo tool|seo software|tracking software|saas|software|cloud|platform|api|אפליקציה|כלי seo|מערכת מעקב)/.test(t))
    return 'saas'
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
 * Reject low-quality questions that slipped through templates.
 * Runs on the FINAL filled question text in both languages.
 *
 * Common failure modes caught here:
 * - "Alternatives to {brand}" / "אלטרנטיבות ל..." (competitive intent)
 * - "similar to {brand}" / "Recommended businesses similar to..."
 * - "Where to find {product}" (unnatural — should be "Where can I buy")
 * - "What to check when buying {abstract category}" (e.g. "buying home improvement")
 * - "איזו חנות מומלצת ל-X" without "לקניית" / "להזמנת" (e.g. "מומלצת למשקולות")
 * - "איפה אפשר למצוא X" for a product (should be "לקנות")
 * - "כמה עולים X" for a singular generic category
 */
function isBadQuestion(question: string, businessName: string): boolean {
  const q = question.trim()
  const brand = (businessName || '').trim()

  // Unresolved placeholders — always reject
  if (/\{\{[^}]+\}\}/.test(q)) return true

  // ENGLISH rejections

  // Competitor / alternatives intent — too generic, especially for product brands
  if (/\balternatives?\s+to\b/i.test(q)) return true
  if (/\bsimilar\s+to\b/i.test(q)) return true
  if (/\brecommended\s+businesses?\s+similar\s+to\b/i.test(q)) return true
  if (/\bcompetitors?\s+of\b/i.test(q)) return true
  if (/\bcompetitors?\b/i.test(q)) return true
  if (/\bbusinesses?\s+like\b/i.test(q)) return true
  if (brand && new RegExp(`\\b${escapeRegex(brand)}\\s+alternatives?\\b`, 'i').test(q)) return true

  // "Where to find {generic-abstract}" — service categories aren't "found", they're hired
  // Reject only abstract service categories, not products.
  if (/\bwhere\s+to\s+find\s+(home\s+improvement|fitness|cleaning|landscaping|construction)\b/i.test(q))
    return true

  // "What to check when buying {abstract service}" — services aren't "bought"
  if (/\bwhat\s+to\s+check\s+when\s+buying\s+(home\s+improvement|fitness|cleaning|landscaping|construction|seo|legal|consulting)\b/i.test(q))
    return true

  // "Where can I buy SEO/home improvement" — services aren't bought
  if (/\bwhere\s+(can\s+i|to)\s+buy\s+(home\s+improvement|seo|consulting|legal\s+services|cleaning|fitness)\b/i.test(q))
    return true

  // Buying a business type ("buy a fitness equipment store") — never valid
  if (/\bbuy\s+(a\s+)?(fitness|sports|sporting\s+goods|gift|appliance|perfume)\s+store\b/i.test(q))
    return true
  if (/\bbuying\s+(a\s+)?(store|company|firm|agency|provider)\b/i.test(q))
    return true

  // HEBREW rejections

  // אלטרנטיבות ל{brand} - competitive intent
  if (/אלטרנטיבות\s+ל/.test(q)) return true
  if (/חלופות\s+ל|לחלופות/.test(q)) return true
  if (/דומה?\s+ל/.test(q) && brand && q.includes(brand)) return true
  if (/עסקים\s+דומים\s+ל/.test(q)) return true
  if (/מתחרה|מתחרים|תחרות/.test(q)) return true

  // "איזו חנות מומלצת למשקולות" — must use "לקניית" / "להזמנת" not bare "ל"
  // Only reject if "ל" is followed by a product noun (not "לקניית/לקנות/הזמנת/...")
  if (/איזו\s+חנות\s+מומלצת\s+ל(?!קני|הזמ|בחיר|השג|שירות|רכישת|מציאת)/.test(q))
    return true

  // "איפה אפשר למצוא X" - should be "איפה אפשר לקנות" for products
  if (/איפה\s+אפשר\s+למצוא/.test(q)) return true

  // "כמה עולים {plural category}" — should be "כמה עולה" singular
  if (/כמה\s+עולים\s+ציוד/.test(q)) return true

  // Buying a store/business type — never valid in Hebrew
  if (/(לקנות|קונים|לקניית).*\b(חנות|חברה|משרד|מרכז|מוסד)\b/.test(q)) return true
  if (/איפה\s+כדאי\s+לקנות\s+חנות/.test(q)) return true

  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Intent-bearing words that should be stripped from raw keywords before
// they are injected into question templates. Keywords like "הליכון ביתי מומלץ"
// or "מחיר הליכון" need to be cleaned to "הליכון ביתי" / "הליכון" so the
// resulting question is natural ("כמה עולה הליכון?" not "כמה עולה מחיר הליכון?").
const HE_KEYWORD_INTENT_WORDS = new Set([
  'מומלץ', 'מומלצת', 'מומלצה', 'מומלצים', 'מומלצות',
  'במבצע', 'מבצע', 'מבצעים', 'הנחה', 'בהנחה', 'הנחות',
  'מחיר', 'מחירים', 'מחירון', 'עלות', 'עלויות', 'מחירי',
  'זול', 'זולה', 'זולים', 'בזול', 'יקר', 'יקרה', 'יקרים',
  'לקנייה', 'קנייה', 'לרכישה', 'רכישה', 'לקנות', 'לרכוש', 'לקניית',
  'הטוב', 'הטובה', 'הטובים', 'הטובות', 'ביותר',
  'ביקורת', 'ביקורות', 'דירוג', 'דירוגים',
  'השוואה', 'השוואת', 'מול',
])

const HE_KEYWORD_INTENT_PHRASES = [
  'חוות דעת',
  'הכי טוב',
  'הכי טובה',
  'הכי טובים',
  'הטוב ביותר',
  'הטובה ביותר',
]

const EN_KEYWORD_INTENT_WORDS = new Set([
  'recommended', 'best', 'top', 'cheap', 'cheapest', 'price', 'pricing',
  'cost', 'costs', 'discount', 'discounted', 'reviews', 'review', 'rating',
  'ratings', 'comparison', 'vs', 'versus',
])

const EN_KEYWORD_INTENT_PHRASES = ['on sale', 'for sale', 'best price']

/**
 * Clean a raw keyword for safe injection into question templates. Strips
 * intent-bearing words/phrases that would either duplicate the template's own
 * intent ("מחיר" inside "כמה עולה ${kw}") or produce awkward phrasing
 * ("מומלץ" inside "איזה מומחה מומלץ ל${kw}").
 *
 * Returns empty string if nothing meaningful remains (caller should skip).
 */
function cleanKeywordForQuestion(keyword: string, lang: 'he' | 'en'): string {
  if (!keyword) return ''
  let cleaned = keyword.trim()

  const phrases = lang === 'he' ? HE_KEYWORD_INTENT_PHRASES : EN_KEYWORD_INTENT_PHRASES
  for (const phrase of phrases) {
    cleaned = cleaned.replace(new RegExp(escapeRegex(phrase), 'gi'), ' ')
  }

  const stopSet = lang === 'he' ? HE_KEYWORD_INTENT_WORDS : EN_KEYWORD_INTENT_WORDS
  const words = cleaned.split(/\s+/).filter((w) => {
    if (!w) return false
    const wl = lang === 'he' ? w : w.toLowerCase()
    return !stopSet.has(wl)
  })

  return words.join(' ').replace(/\s+/g, ' ').trim()
}

const GIFT_CATEGORIES: BusinessCategory[] = ['gifts', 'florist', 'perfume']

/**
 * Detect awkward / unnatural questions that survive isBadQuestion. Catches
 * keyword-stuffing artifacts, doubled intents (the keyword already mentioned
 * "מחיר" and the template added "כמה עולה"), and category mismatches
 * (a "מתנה" template firing for a fitness store).
 *
 * Run alongside isBadQuestion in every pipeline that produces candidate
 * prompts. Returns true → reject.
 */
function isAwkwardQuestion(
  question: string,
  category: BusinessCategory,
  lang: 'he' | 'en'
): boolean {
  const q = question.trim()
  if (!q) return true

  if (lang === 'he') {
    // Doubled intent words (template added one + keyword carried another).
    if (/מומלץ[\s\S]*מומלץ|מומלצת[\s\S]*מומלצת|מומלצים[\s\S]*מומלצים/.test(q)) return true
    if (/מתאים[\s\S]*מתאים|מתאימה[\s\S]*מתאימה/.test(q)) return true
    if (/(כמה\s+עולה[\s\S]*\bמחיר\b|\bמחיר\b[\s\S]*כמה\s+עולה|המחיר\s+של[\s\S]*\bמחיר\b)/.test(q))
      return true
    if (/חוות\s+דעת[\s\S]*חוות\s+דעת/.test(q)) return true
    if (/השוואה[\s\S]*השוואה|השוואת[\s\S]*השוואת/.test(q)) return true
    if (/\bזול\b[\s\S]*\bזול\b|\bבמבצע\b[\s\S]*\bבמבצע\b/.test(q)) return true

    // Gift template firing for a non-gift business.
    if (/\b(?:מתנה|מתנות|כמתנה|למתנה)\b/.test(q) && !GIFT_CATEGORIES.includes(category))
      return true

    // Bad slicing artifacts. "הליכון יד" comes from a keyword like
    // "משקולות יד" leaking the "יד" suffix into a הליכון question.
    if (/הליכון\s+יד\b/.test(q)) return true
    if (/אופניים\s+יד\b/.test(q)) return true

    // Too many stacked modifiers — feels like keyword stuffing.
    const stackedModifiers = [
      'מומלץ', 'מומלצת', 'איכותי', 'איכותית', 'הכי\\s+טוב', 'מתקפל', 'ביתי',
      'במבצע', 'זול', 'מקצועי',
    ]
    const modifierCount = stackedModifiers.filter((m) => new RegExp(m).test(q)).length
    if (modifierCount >= 3) return true
  } else {
    if (/\brecommended\b[\s\S]*\brecommended\b/i.test(q)) return true
    if (/\bbest\b[\s\S]*\bbest\b/i.test(q)) return true
    if (/(how\s+much[\s\S]*\bprice\b|\bprice\b[\s\S]*how\s+much)/i.test(q)) return true
    if (/\breviews?\s+of\b[\s\S]*\breviews?\s+of\b/i.test(q)) return true
    if (/\bcheap\b[\s\S]*\bcheap\b|\bon\s+sale\b[\s\S]*\bon\s+sale\b/i.test(q)) return true

    if (/\bgifts?\b|\bpresents?\b/i.test(q) && !GIFT_CATEGORIES.includes(category)) return true

    const stackedModifiers = [
      'recommended', 'best', 'top', 'cheap', 'quality', 'foldable', 'home',
      'on sale', 'discounted',
    ]
    const modifierCount = stackedModifiers.filter((m) => new RegExp(`\\b${m}\\b`, 'i').test(q))
      .length
    if (modifierCount >= 3) return true
  }

  return false
}

/**
 * Detect questions that READ as AI-generated padding rather than something a
 * real user would type into Google/ChatGPT/Gemini. These are filtered out
 * post-isAwkwardQuestion, regardless of confidence score — quality > quantity.
 *
 * Patterns caught:
 *   • Abstract comparisons with no real entity:
 *       "מה עדיף — הליכון או חלופות אחרות?"
 *       "What's better — treadmill or alternatives?"
 *   • Generic "expert / provider / company for X" when X is a product keyword:
 *       "איך לבחור ספק להליכון?"
 *       "איזה מומחה מתאים להליכון?"
 *   • Vague openers a real user almost never uses:
 *       "מי מומלץ עבור הליכון?"
 *
 * Returns true → reject the question.
 */
const SERVICE_LIKE_CATEGORIES: BusinessCategory[] = [
  'agency',
  'cleaning',
  'saas',
  'local_service',
  'home_improvement_service',
  'healthcare',
  'legal',
  'real_estate',
  'fitness',
  'beauty',
  'education',
]

function isUnnaturalQuestion(
  question: string,
  category: BusinessCategory,
  lang: 'he' | 'en'
): boolean {
  const q = question.trim()
  if (!q) return true

  const isServiceCategory = SERVICE_LIKE_CATEGORIES.includes(category)

  if (lang === 'he') {
    // Abstract comparison — almost never sounds like a real query.
    // (JS \b does not fire between Hebrew characters, so use whitespace
    // anchors via (?:^|\s) / (?=\s|$|[?.,!]) instead.)
    if (/(?:^|\s)או\s+(?:חלופות\s+אחרות|פתרונות\s+אחרים|אפשרויות\s+אחרות|מתחרים\s+אחרים)/.test(q)) {
      return true
    }
    // Vague opener "מי מומלץ עבור X" — too abstract.
    if (/^מי\s+מומלץ\s+(?:עבור|ל)/.test(q)) {
      return true
    }
    // "ספק" / "מומחה" / "חברה" for product categories — feels AI-generated.
    if (!isServiceCategory) {
      if (/(?:^|\s)ספק\s+ל/.test(q)) return true
      if (/(?:^|\s)מומחה\s+(?:ל|מתאים|מומלץ)/.test(q)) return true
      if (/(?:^|\s)חברה\s+מומלצת\s+ל/.test(q)) return true
    }
    // "איך לבחור X בעיר שלי" — awkward phrasing.
    if (/איך\s+לבחור\s+\S+\s+בעיר\s+שלי/.test(q)) return true
  } else {
    if (/\b(?:or\s+alternatives|or\s+other\s+(?:solutions|options|providers))\b/i.test(q)) {
      return true
    }
    if (/^who\s+is\s+recommended\s+for\b/i.test(q)) {
      return true
    }
    if (!isServiceCategory) {
      if (/\bprovider\s+for\b/i.test(q)) return true
      if (/\bexpert\s+(?:for|suits|recommended)\b/i.test(q)) return true
      if (/\bcompany\s+(?:recommended|is\s+recommended)\b/i.test(q)) return true
    }
    if (/how\s+to\s+(?:find|choose)\s+\S+\s+in\s+my\s+(?:city|area)/i.test(q)) return true
  }

  return false
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
 * Generate keyword-based questions using v2 (semantic) first, with v1 (template) fallback.
 *
 * v2 returns only high-quality, realistic questions (might be 2-4 per keyword).
 * If v2 produces too few questions, fill remaining slots carefully from v1
 * but only after strict semantic validation.
 *
 * Returns a flat list of {prompt, score, intentBucket} that can be merged with
 * template-based suggestions.
 */
function generateKeywordBasedQuestionsWithFallback({
  keywords,
  businessName,
  city,
  language,
  trackedPrompts,
  category,
}: {
  keywords: string[]
  businessName: string | null
  city: string | null
  language: string
  trackedPrompts: string[]
  category: BusinessCategory
}): Array<{ prompt: string; score: number; intentBucket: string }> {
  const isHebrew = language === 'he'
  const results: Array<{ prompt: string; score: number; intentBucket: string }> = []

  // Normalize tracked prompts for dedup
  const normalizeForDedup = (text: string): string =>
    text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()
  const trackedSet = new Set(trackedPrompts.map(normalizeForDedup))
  const generatedSet = new Set<string>()

  // Try v2 first for each keyword
  for (const keyword of keywords) {
    if (!keyword || keyword.length < 3) continue

    const v2Ctx: GeneratorContext = {
      keyword,
      businessName: businessName || null,
      city: city || null,
      businessCategory: category,
      language,
    }

    // Generate using semantic understanding
    const v2Questions = generateHumanLikeSmartQuestions(v2Ctx)

    // Add v2 questions that passed validation
    for (const q of v2Questions) {
      const normalized = normalizeForDedup(q.prompt)
      if (trackedSet.has(normalized) || generatedSet.has(normalized)) continue

      // Map v2 intent to intentBucket for downstream processing
      const intentBucketMap: Record<PromptIntent, string> = {
        commercial: 'price',
        pre_purchase: 'pre_purchase',
        informational: 'review',
        recommendation: 'recommendation',
        local: 'local',
        brand: 'recommendation',
        comparison: 'recommendation',
        transactional: 'pre_purchase',
        alternatives: 'recommendation',
        gift: 'recommendation',
      }

      results.push({
        prompt: q.prompt,
        score: q.score,
        intentBucket: intentBucketMap[q.intent] || 'recommendation',
      })

      generatedSet.add(normalized)
    }
  }

  // Quality > quantity. v2 returns however many realistic questions exist.
  // v1 fallback ONLY supplements with candidates that ALSO pass the strict
  // validateHumanSearchQuery validator. If no v1 candidate passes, we return
  // only what v2 produced — even if that's 0, 1, or 2 questions.
  //
  // We never pad with weak questions just to hit a count.

  // Run v1 generation only to find supplemental candidates
  const v1Results = generateKeywordBasedQuestions({
    keywords,
    businessName,
    city,
    language,
    trackedPrompts,
    category,
  })

  // Apply STRICT validation to each v1 candidate (same standard as v2)
  for (const v1q of v1Results) {
    const normalized = normalizeForDedup(v1q.prompt)
    if (trackedSet.has(normalized) || generatedSet.has(normalized)) continue

    // Find which keyword this v1 question was generated from (for validation)
    // The v1 keyword-based generator puts the keyword in the prompt, so we find
    // the longest matching keyword
    let matchedKeyword = ''
    for (const kw of keywords) {
      if (v1q.prompt.toLowerCase().includes(kw.toLowerCase()) && kw.length > matchedKeyword.length) {
        matchedKeyword = kw
      }
    }
    if (!matchedKeyword) continue

    // Apply the SAME strict validator that v2 uses
    const validation = validateHumanSearchQuery(v1q.prompt, matchedKeyword, language)
    if (!validation.isValid) continue

    // Also apply legacy filters as additional safety
    if (language === 'he' && isUnnaturalQuestion(v1q.prompt, category, language as 'he' | 'en')) {
      continue
    }

    results.push({
      prompt: v1q.prompt,
      score: Math.min(v1q.score, validation.score), // v1 capped at validator score
      intentBucket: v1q.intentBucket,
    })
    generatedSet.add(normalized)
  }

  return results.sort((a, b) => b.score - a.score)
}

/**
 * Generate AI questions directly from tracked keywords (v1, template-based).
 *
 * This layer expands the suggestion pool by transforming each keyword
 * into multiple intent-based questions (recommendation, price, pre-purchase, local, review).
 *
 * Returns a flat list of {prompt, score} that can be merged with template-based suggestions.
 *
 * NOTE: This is now used as a FALLBACK only. Primary generation uses v2 (semantic).
 */
function generateKeywordBasedQuestions({
  keywords,
  businessName,
  city,
  language,
  trackedPrompts,
  category,
}: {
  keywords: string[]
  businessName: string | null
  city: string | null
  language: string
  trackedPrompts: string[]
  category: BusinessCategory
}): Array<{ prompt: string; score: number; intentBucket: string }> {
  const results: Array<{ prompt: string; score: number; intentBucket: string }> = []
  const isHebrew = language === 'he'
  const isService = SERVICE_LIKE_CATEGORIES.includes(category)

  // Normalization helper
  const normalize = (text: string): string =>
    text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,;؟،]+\s*$/u, '').trim()

  // Index tracked prompts for dedup
  const trackedSet = new Set(trackedPrompts.map(normalize))
  const generatedSet = new Set<string>()

  // Filter keywords: skip very short, brand-only, or non-service keywords
  const relevantKeywords = keywords.filter((kw) => {
    if (!kw || kw.length < 3) return false
    const normalized = normalize(kw)
    if (normalized.length < 4) return false
    // Skip if keyword is exactly the business name
    if (businessName && normalize(kw) === normalize(businessName)) return false
    return true
  })

  // Per-keyword saturation: at most ONE template per intent bucket. This
  // stops the same keyword from feeding 6+ variants into the pool when only
  // 3 of those buckets are actually natural for the category.
  const MAX_INTENTS_PER_KEYWORD = 3

  // For each keyword, generate one template per intent bucket (saturation-aware)
  for (const rawKw of relevantKeywords) {
    // Strip intent words from the keyword BEFORE substituting into templates.
    // Prevents "כמה עולה מחיר הליכון?" and "איזה מומחה מומלץ להליכון מומלץ?".
    const kw = cleanKeywordForQuestion(rawKw, isHebrew ? 'he' : 'en')
    if (!kw || kw.length < 3) continue
    const kwNorm = normalize(kw)

    // Skip if this keyword is part of an already-tracked prompt (avoid sub-phrase dupes)
    if (Array.from(trackedSet).some((tracked) => tracked.includes(kwNorm))) {
      continue
    }

    // Build candidates: [intent_bucket, template, baseScore]. Each bucket
    // contributes at MOST one prompt per keyword. Buckets are ordered by
    // natural-search likelihood — price + reviews + recommendation are the
    // common ones, comparison is dropped entirely (always abstract).
    const candidates: Array<{ bucket: string; prompt: string; score: number }> = []

    // PRICE — universally natural, high priority
    if (isHebrew) {
      candidates.push({ bucket: 'price', prompt: `כמה עולה ${kw}?`, score: 16 })
    } else {
      candidates.push({ bucket: 'price', prompt: `How much does ${kw} cost?`, score: 16 })
    }

    // REVIEW — natural for any keyword
    if (isHebrew) {
      candidates.push({ bucket: 'review', prompt: `חוות דעת על ${kw}`, score: 14 })
    } else {
      candidates.push({ bucket: 'review', prompt: `Reviews of ${kw}`, score: 14 })
    }

    // PRE-PURCHASE — natural for any keyword
    if (isHebrew) {
      candidates.push({
        bucket: 'pre_purchase',
        prompt: `מה חשוב לבדוק לפני בחירת ${kw}?`,
        score: 13,
      })
    } else {
      candidates.push({
        bucket: 'pre_purchase',
        prompt: `What to check before choosing ${kw}?`,
        score: 13,
      })
    }

    // RECOMMENDATION — only for SERVICE categories. For products, the bank
    // already produces natural "איזה X מומלץ?" via curated templates; the
    // generic "איזו חברה מומלצת ל-X" feels AI-generated for products.
    if (isService) {
      if (isHebrew) {
        candidates.push({
          bucket: 'recommendation',
          prompt: `איזה ספק מומלץ ל${kw}?`,
          score: 12,
        })
      } else {
        candidates.push({
          bucket: 'recommendation',
          prompt: `Which provider is recommended for ${kw}?`,
          score: 12,
        })
      }
    }

    // LOCAL — only if city is set AND it's a service or has a real local need
    if (city && isService) {
      if (isHebrew) {
        candidates.push({
          bucket: 'local',
          prompt: `איזה ספק מומלץ ל${kw} ב${city}?`,
          score: 15,
        })
      } else {
        candidates.push({
          bucket: 'local',
          prompt: `Which provider is recommended for ${kw} in ${city}?`,
          score: 15,
        })
      }
    }

    // Drop these buckets entirely (always feel AI-generated when generic):
    //   - "מי מומלץ עבור X" (vague opener)
    //   - "איזה מומחה מתאים ל-X" (only fits very specific service contexts)
    //   - "מה עדיף — X או חלופות אחרות" (abstract comparison)
    //   - "איך לבחור ספק ל-X" (overlaps with pre_purchase but more abstract)
    //   - "איזו חנות מומלצת ל-X" / "איפה אפשר לקנות X" (curated bank handles
    //     where-to-buy with better entity context)

    // Saturation: pick the top N candidates by score and stop.
    candidates.sort((a, b) => b.score - a.score)
    const seenBuckets = new Set<string>()
    let added = 0
    for (const c of candidates) {
      if (added >= MAX_INTENTS_PER_KEYWORD) break
      if (seenBuckets.has(c.bucket)) continue
      seenBuckets.add(c.bucket)

      const normalized = normalize(c.prompt)
      if (trackedSet.has(normalized)) continue
      if (generatedSet.has(normalized)) continue

      // Keyword-length specificity boost (longer = more specific = more natural)
      let score = c.score + Math.min(kw.length / 2, 10)
      if (city && c.prompt.includes(city)) score += 3

      results.push({ prompt: c.prompt, score, intentBucket: c.bucket })
      generatedSet.add(normalized)
      added += 1
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

/**
 * Generate smart AI query suggestions, business-context driven.
 *
 * With optional business profile: weights offerings (70% primary, 20% local, 10% secondary).
 * @param ctx Project context: business, domain, city, country, language
 * @param keywords Tracked keywords used for both theme signals AND direct question generation
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
// ============================================================================
// SAFE MODE: Curated-only generation
// Feature flag to disable aggressive keyword wrapping from v2 generator
// ============================================================================

// Smart Questions vNext: intent recommendation engine.
// When true, all live UI suggestions come from lib/ai-visibility/intent-engine.ts.
// Bypasses safe mode placeholders, semantic-generator-v2, v1 fallback mutation,
// and aggressive template generation.
const USE_SMART_QUESTIONS_VNEXT = true
// Legacy fallback flag (kept for emergency rollback). Only consulted if vNext is off.
const USE_SAFE_SMART_QUESTIONS = false

interface SafeCuratedPrompt {
  text: string
  intent: PromptIntent
  category: BusinessCategory
  requiresLocation?: boolean
  requiresBusinessName?: boolean
}

/**
 * Generate safe, curated suggestions only.
 * Blocks all keyword-to-question wrapping.
 * Returns only high-confidence templates that work across contexts.
 */
function generateSafeCuratedSuggestions({
  businessName,
  city,
  language,
  category,
  excludePrompts,
}: {
  businessName: string | null
  city: string | null
  language: string
  category: BusinessCategory
  excludePrompts: string[]
}): PromptSuggestion[] {
  const lang = language === 'en' ? 'en' : 'he'
  const isService = SERVICE_LIKE_CATEGORIES.includes(category)
  const hasLocation = !!city
  const hasBusinessName = !!businessName && businessName.length > 2
  const results: PromptSuggestion[] = []
  const excludeSet = new Set(excludePrompts.map(p => normalizePromptForCompare(p)))

  // Define safe curated templates
  const templates: SafeCuratedPrompt[] = []

  if (lang === 'he') {
    // Universal commercial questions (work for all business types)
    templates.push({
      text: `כמה עולה ${category === 'saas' ? 'מנוי' : 'שירות'} כזה?`,
      intent: 'commercial',
      category,
    })

    // How to choose (only for services, not generic)
    if (isService) {
      templates.push({
        text: `איך לבחור חברת ${getCategoryLabel(category, lang)}?`,
        intent: 'pre_purchase',
        category,
      })
    }

    // Brand mention if business name exists
    if (hasBusinessName) {
      templates.push({
        text: `חוות דעת על ${businessName}`,
        intent: 'brand',
        category,
        requiresBusinessName: true,
      })
    }

    // Local recommendation only if business is actually local
    if (hasLocation && isService) {
      templates.push({
        text: `אילו חברות ${getCategoryLabel(category, lang)} מומלצות ב${city}?`,
        intent: 'local',
        category,
        requiresLocation: true,
      })
    }

    // High-confidence commercial comparison (for ecommerce/products only)
    if (['ecommerce', 'product_brand'].includes(category)) {
      templates.push({
        text: `מה הביקורות על ${category === 'product_brand' ? 'המוצר הזה' : 'מוצר זה'}?`,
        intent: 'pre_purchase',
        category,
      })
    }
  } else {
    // English safe templates
    templates.push({
      text: `How much does ${isService ? 'this service' : 'a service like this'} cost?`,
      intent: 'commercial',
      category,
    })

    if (isService) {
      templates.push({
        text: `How do I choose a ${getCategoryLabel(category, lang)}?`,
        intent: 'pre_purchase',
        category,
      })
    }

    if (hasBusinessName) {
      templates.push({
        text: `Reviews of ${businessName}`,
        intent: 'brand',
        category,
        requiresBusinessName: true,
      })
    }

    if (hasLocation && isService) {
      templates.push({
        text: `Top ${getCategoryLabel(category, lang)} in ${city}`,
        intent: 'local',
        category,
        requiresLocation: true,
      })
    }
  }

  // Process templates, filtering out excluded ones
  for (const template of templates) {
    const normalized = normalizePromptForCompare(template.text)
    if (excludeSet.has(normalized)) continue

    // Respect requirements
    if (template.requiresBusinessName && !hasBusinessName) continue
    if (template.requiresLocation && !hasLocation) continue

    const score = 85 // Safe curated templates get good confidence
    results.push({
      id: `safe-${Math.random().toString(36).slice(2, 8)}`,
      prompt: template.text,
      intent: template.intent,
      intentLabel: getIntentLabel(template.intent, lang),
      category,
      language: lang,
      qualityScore: score,
      confidenceTier: getConfidenceTier(score),
      reason: '[Safe Mode] Curated business template',
      chips: generateSignalChips(template.text, template.intent, score, lang as 'he' | 'en', hasLocation),
      valueReason: generateValueReason(template.intent, score, template.text, lang as 'he' | 'en', hasLocation),
    })
  }

  return results
}

function getCategoryLabel(category: BusinessCategory, lang: string): string {
  const heLabels: Record<BusinessCategory, string> = {
    saas: 'תוכנה',
    agency: 'סוכנות',
    ecommerce: 'חנות',
    local_service: 'שירות',
    fitness: 'מתחם כושר',
    restaurant: 'מסעדה',
    beauty: 'סלון יופי',
    florist: 'חנות פרחים',
    legal: 'משרד עורכי דין',
    healthcare: 'קליניקה',
    real_estate: 'משרדון',
    product_brand: 'מוצר',
    cleaning: 'שירות ניקיון',
    home_improvement_service: 'שרות תיקון בית',
    sports_store: 'חנות ספורט',
    perfume: 'בושם',
    appliance_store: 'חנות מכשירים',
    gifts: 'מתנות',
    education: 'חינוך',
    second_hand_fashion: 'ביגוד יד שנייה',
    generic: 'עסק',
  }

  const enLabels: Record<BusinessCategory, string> = {
    saas: 'software',
    agency: 'agency',
    ecommerce: 'shop',
    local_service: 'service',
    fitness: 'gym',
    restaurant: 'restaurant',
    beauty: 'salon',
    florist: 'florist',
    legal: 'law firm',
    healthcare: 'clinic',
    real_estate: 'real estate',
    product_brand: 'brand',
    cleaning: 'cleaning service',
    home_improvement_service: 'home service',
    sports_store: 'sports shop',
    perfume: 'perfume',
    appliance_store: 'appliance store',
    gifts: 'gifts',
    education: 'education',
    second_hand_fashion: 'fashion',
    generic: 'business',
  }

  const labels = lang === 'he' ? heLabels : enLabels
  return labels[category] || 'business'
}

function getIntentLabel(intent: PromptIntent, lang: string): string {
  const heLabels: Record<PromptIntent, string> = {
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

  const enLabels: Record<PromptIntent, string> = {
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

  const labels = lang === 'he' ? heLabels : enLabels
  return labels[intent] || intent
}

// ============================================================================
// ORIGINAL GENERATION PATH
// ============================================================================

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

  // ========================================================================
  // SMART QUESTIONS vNEXT — intent recommendation engine
  // Keywords are signals for topic inference only, never source for wrapping.
  // Bypasses semantic-generator-v2, safe mode placeholders, fallback mutation,
  // and aggressive template generation.
  // ========================================================================
  if (USE_SMART_QUESTIONS_VNEXT) {
    // Resolve category the same way the legacy path does, so manual profile
    // overrides apply consistently.
    const hasManualEarly = manualProfile && manualProfile.mode === 'manual'
    let resolvedCategory: BusinessCategory
    if (hasManualEarly && manualProfile.primaryCategory) {
      const r = resolveManualPrimaryCategory(manualProfile.primaryCategory)
      resolvedCategory = r || (autoProfile as { primaryCategory: BusinessCategory }).primaryCategory
    } else {
      resolvedCategory = (autoProfile as { primaryCategory: BusinessCategory }).primaryCategory
    }

    const excludeNormalized = new Set(excludePrompts.map((p) => normalizePromptForCompare(p)))
    const engineQuestions = generateIntentQuestions({
      businessName,
      businessCategory: resolvedCategory,
      language: lang as 'he' | 'en',
      country,
      city,
      keywords,
    })

    const intentLabels = lang === 'he' ? HE_INTENT_LABEL : EN_INTENT_LABEL
    const result: PromptSuggestion[] = []
    for (const q of engineQuestions) {
      if (excludeNormalized.has(normalizePromptForCompare(q.prompt))) continue
      // vNext focuses on output quality. Chips/valueReason/confidenceTier are
      // not computed in this phase — provide neutral defaults so the existing
      // UI contract is preserved without hallucinated signals.
      result.push({
        id: `vnext-${Math.random().toString(36).slice(2, 8)}`,
        prompt: q.prompt,
        intent: q.intent,
        intentLabel: intentLabels[q.intent],
        category: resolvedCategory,
        language: lang,
        qualityScore: q.score,
        confidenceTier: getConfidenceTier(q.score),
        reason: '',
        chips: [],
        valueReason: '',
      })
    }
    return result.slice(0, limit)
  }
  // ========================================================================

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

  // Narrow-context exclusions: when the user has explicitly described a
  // fitness equipment store (not a general sports store), exclude
  // sports-brand / sports-shoe / sportswear drift from the primary bank.
  // Same for home-improvement-only profiles, etc. These keep the typed
  // object pipeline from being drowned out by overly broad bank questions.
  const narrowSignal = [
    manualProfile?.primaryCategory || '',
    ...(manualProfile?.secondaryCategories || []),
    ...keywords,
  ]
    .join(' ')
    .toLowerCase()
  const isFitnessEquipmentNarrow =
    /(ציוד\s+כושר|מוצרי\s+כושר|משקולות|הליכון|אופני\s+כושר|fitness\s+equipment|gym\s+equipment|home\s+gym|dumbbell|treadmill)/.test(
      narrowSignal
    ) &&
    !/(נעלי\s+ספורט|נעלי\s+ריצה|בגדי\s+ספורט|מותגי\s+ספורט|running\s+shoes|sportswear|sports\s+brands?)/.test(
      narrowSignal
    )
  if (isFitnessEquipmentNarrow) {
    effectiveProfile.excludedTopics = [
      ...(effectiveProfile.excludedTopics || []),
      'מותגי ספורט',
      'נעלי ספורט',
      'נעלי ריצה',
      'בגדי ספורט',
      'ציוד ספורט',
      'חנות ספורט',
      'חנויות ספורט',
      'sports brands',
      'running shoes',
      'sportswear',
      'sports shoes',
    ]
  }

  const bank = lang === 'he' ? HE_BANK : EN_BANK
  const defs = bank[category] || bank.generic
  const intentLabels = lang === 'he' ? HE_INTENT_LABEL : EN_INTENT_LABEL

  const MIN_QUALITY_SCORE = 70

  // Extract product terms for product_brand. When manual secondary categories /
  // tracking keywords supply specific product terms, the generic "{{business}}
  // products" / "מוצרי {{business}}" bank entries are suppressed and replaced
  // with product-aware questions that USE those terms in the visible text.
  let productTerms: ProductTermSpec[] = []
  let hasSpecificProductTerms = false
  if (category === 'product_brand') {
    productTerms = extractProductTerms({
      businessName: business,
      language: lang as 'he' | 'en',
      manualSecondaryCategories: hasManual ? manualProfile.secondaryCategories || [] : [],
      keywords,
    })
    hasSpecificProductTerms = productTerms.some((t) => t.specificity !== 'generic')
  }

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
    // For product_brand: when specific product terms exist, suppress the
    // generic bank ("מוצרי {{business}}" / "{{business}} products"). The
    // product-aware questions below take over.
    if (category === 'product_brand' && hasSpecificProductTerms) continue

    const filled = fillTemplate(def.text, ctx).trim()
    if (lang === 'he' && !isReadableHebrew(filled)) continue

    // CRITICAL: Reject low-quality / competitive-intent / unnatural questions
    // even if they came from the curated bank.
    if (isBadQuestion(filled, business)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AI-Questions] REJECTED (primary):', filled)
      }
      continue
    }
    if (isAwkwardQuestion(filled, category, lang as 'he' | 'en')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AI-Questions] REJECTED awkward (primary):', filled)
      }
      continue
    }
    if (isUnnaturalQuestion(filled, category, lang as 'he' | 'en')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AI-Questions] REJECTED unnatural (primary):', filled)
      }
      continue
    }

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

  // ----- Object classification pipeline -----
  // Replace the old raw-secondary-category loop with a typed pipeline:
  //   extractSearchObjects → (already includes normalize + reject)
  //   chooseTemplatesByObjectType → per-object templates
  //   isBadQuestion → final validation
  // If a secondary category cannot produce a validated object, it is skipped.
  // We never generate questions directly from raw secondary strings.
  const secondaryCategoryQuestions: Built[] = []
  const objectDebug: Array<{ raw: string; object?: SearchObject; reason?: string }> = []
  if (
    hasManual &&
    manualProfile.secondaryCategories &&
    manualProfile.secondaryCategories.length > 0
  ) {
    const objects = extractSearchObjects({
      language: lang as 'he' | 'en',
      businessName: business,
      secondaryCategories: manualProfile.secondaryCategories,
      keywords,
    })

    for (const raw of manualProfile.secondaryCategories) {
      const trimmed = (raw || '').trim()
      if (!trimmed) continue
      const matched = objects.find((o) =>
        trimmed.toLowerCase().includes(o.text.toLowerCase()) ||
        o.text.toLowerCase().includes(trimmed.toLowerCase())
      )
      if (!matched) objectDebug.push({ raw: trimmed, reason: 'not_normalized_or_rejected' })
    }

    for (const obj of objects) {
      const templates = chooseTemplatesByObjectType(obj, lang as 'he' | 'en', ctx.city)
      objectDebug.push({ raw: obj.text, object: obj })

      for (const template of templates) {
        const filled = lang === 'he' ? normalizeHebrewConstructState(template.trim()) : template.trim()

        if (lang === 'he' && !isReadableHebrew(filled)) continue
        if (lang === 'he' && isInvalidHebrewPhrase(filled)) continue

        // Final validation layer
        if (isBadQuestion(filled, business)) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[AI-Questions] REJECTED (object-pipeline):', filled)
          }
          continue
        }
        if (isAwkwardQuestion(filled, category, lang as 'he' | 'en')) continue
        if (isUnnaturalQuestion(filled, category, lang as 'he' | 'en')) continue

        if (textMatchesAny(filled, effectiveProfile.excludedTopics || [])) continue
        if (excludeSet.has(normalizePromptForCompare(filled))) continue

        // Score by confidence: high-confidence objects beat low-confidence ones,
        // and product/service templates beat abstract fallbacks.
        const baseScore = 82 + Math.round(obj.confidence * 10)
        const score = baseScore

        secondaryCategoryQuestions.push({
          def: {
            intent: 'recommendation' as const,
            text: template,
            score,
            offering: 'secondary',
          },
          prompt: filled,
          score,
          themeMatched: [],
          offering: 'secondary',
        })
      }
    }
  }

  // Brand-vs-known-competitor questions (only when business name matches a
  // curated brand pair — never produces generic "X vs competitors"). For
  // product_brand, skip when specific product terms exist — product-level
  // comparisons (iPhone vs Samsung Galaxy) come from getProductBrandQuestions
  // below and are more useful than brand-level (Apple vs Samsung).
  const brandComparisonQuestions: Built[] = []
  const allowBrandComparisons =
    category === 'saas' ||
    (category === 'product_brand' && !hasSpecificProductTerms)
  if (allowBrandComparisons) {
    const pairs = getBrandComparisonQuestions(business, lang as 'he' | 'en')
    for (const pair of pairs) {
      const filled = pair.text.trim()
      if (lang === 'he' && !isReadableHebrew(filled)) continue
      if (isBadQuestion(filled, business)) continue
      if (isAwkwardQuestion(filled, category, lang as 'he' | 'en')) continue
      if (isUnnaturalQuestion(filled, category, lang as 'he' | 'en')) continue
      if (textMatchesAny(filled, effectiveProfile.excludedTopics || [])) continue
      brandComparisonQuestions.push({
        def: { intent: pair.intent, text: pair.text, score: pair.score, offering: 'primary' },
        prompt: filled,
        score: pair.score,
        themeMatched: [],
        offering: 'primary',
      })
    }
  }

  // Product-aware questions for product_brand: use the actual product terms
  // (manual categories, keywords, known brand products) so they appear in the
  // visible question text rather than being collapsed to "מוצרי [Brand]".
  const productBrandQuestions: Built[] = []
  if (category === 'product_brand' && hasSpecificProductTerms) {
    const items = getProductBrandQuestions(productTerms, lang as 'he' | 'en')
    for (const it of items) {
      const filled = it.text.trim()
      if (lang === 'he' && !isReadableHebrew(filled)) continue
      if (lang === 'he' && isInvalidHebrewPhrase(filled)) continue
      if (isBadQuestion(filled, business)) continue
      if (isAwkwardQuestion(filled, category, lang as 'he' | 'en')) continue
      if (isUnnaturalQuestion(filled, category, lang as 'he' | 'en')) continue
      if (textMatchesAny(filled, effectiveProfile.excludedTopics || [])) continue
      if (excludeSet.has(normalizePromptForCompare(filled))) continue
      productBrandQuestions.push({
        def: { intent: it.intent, text: it.text, score: it.score, offering: 'primary' },
        prompt: filled,
        score: it.score,
        themeMatched: [],
        offering: 'primary',
      })
    }
  }

  // Generate keyword-based questions to expand the candidate pool.
  // Primary: v2 (semantic understanding) for realistic human search behavior.
  // Fallback: v1 (template-based) if v2 produces too few questions.
  const keywordBasedResults = generateKeywordBasedQuestionsWithFallback({
    keywords,
    businessName: business,
    city,
    language: lang as 'he' | 'en',
    trackedPrompts: excludePrompts,
    category,
  })

  // Convert keyword-based results to Built type format, applying every quality
  // filter — including the new isUnnaturalQuestion check.
  const keywordBasedQuestions: Built[] = []
  for (const result of keywordBasedResults) {
    if (lang === 'he' && !isReadableHebrew(result.prompt)) continue
    if (lang === 'he' && isInvalidHebrewPhrase(result.prompt)) continue
    if (isBadQuestion(result.prompt, business)) continue
    if (isAwkwardQuestion(result.prompt, category, lang as 'he' | 'en')) continue
    if (isUnnaturalQuestion(result.prompt, category, lang as 'he' | 'en')) continue
    if (textMatchesAny(result.prompt, effectiveProfile.excludedTopics || [])) continue

    // Map intent bucket to PromptIntent for downstream chip/value-reason logic.
    const intentMap: Record<string, PromptIntent> = {
      price: 'transactional',
      review: 'informational',
      pre_purchase: 'pre_purchase',
      recommendation: 'recommendation',
      local: 'local',
    }
    const mappedIntent = intentMap[result.intentBucket] || 'recommendation'

    keywordBasedQuestions.push({
      def: {
        intent: mappedIntent,
        text: result.prompt,
        score: result.score,
        offering: 'primary',
      },
      prompt: result.prompt,
      score: result.score,
      themeMatched: [],
      offering: 'primary',
    })
  }

  // When product_brand has specific product terms, defensively strip any
  // generic-brand prompts (e.g., "Apple products", "מוצרי Apple", "Apple vs
  // Samsung") that may have leaked from secondary pipelines.
  let mergedPool: Built[] = [
    ...keywordBasedQuestions,
    ...built,
    ...productBrandQuestions,
    ...secondaryCategoryQuestions,
    ...brandComparisonQuestions,
  ]
  if (category === 'product_brand' && hasSpecificProductTerms && business) {
    const brandEsc = escapeRegex(business)
    const reGenericProductsHe = new RegExp(`(מוצרי|מוצר\\s+של|חוות\\s+דעת\\s+על\\s+מוצרי)\\s+${brandEsc}`, 'i')
    const reGenericProductsEn = new RegExp(`\\b${brandEsc}\\s+products?\\b`, 'i')
    const reBrandVsEn = new RegExp(`\\b${brandEsc}\\s+(vs|versus)\\b`, 'i')
    const reBrandVsHe = new RegExp(`(מה\\s+עדיף|ההבדל\\s+בין)\\s+${brandEsc}(?!\\p{L})`, 'iu')
    mergedPool = mergedPool.filter((item) => {
      const p = item.prompt
      if (reGenericProductsHe.test(p)) return false
      if (reGenericProductsEn.test(p)) return false
      if (reBrandVsEn.test(p)) return false
      if (reBrandVsHe.test(p)) return false
      return true
    })
  }

  // Semantic deduplication — drop near-duplicates, keep higher-scoring one
  const allBuilt = mergedPool
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

  // Pick suggestions: diversity-aware selection enforces intent + keyword
  // family + phrasing-pattern caps so a large candidate pool still produces a
  // varied result set (no 6 "איזו חברה מומלצת..." in a row, no 4 city variants
  // of the same keyword). Falls back to offering-weighted pick when caller
  // explicitly opts out of diversity.
  const selectedSuggestions: Built[] = diversify
    ? selectDiverseSuggestions(pool, limit, lang as 'he' | 'en')
    : weightByOffering(pool, limit)

  // Debug logging (dev only)
  if (process.env.NODE_ENV === 'development' && manualProfile?.mode === 'manual') {
    console.log('[AI-Profile Debug]', {
      mode: manualProfile.mode,
      rawPrimaryCategory: manualProfile.primaryCategory,
      resolvedCategory: category,
      primaryCandidateCount: built.length,
      secondaryCandidateCount: secondaryCategoryQuestions.length,
      productBrandCandidateCount: productBrandQuestions.length,
      productTerms,
      totalCandidateCount: allBuilt.length,
      dedupedCount: kept.length,
      poolAfterExclude: poolAfterExclude.length,
      finalPool: pool.length,
      selectedCount: selectedSuggestions.length,
      seenPromptsCount: excludePrompts.length,
      previousSetCount: previousSet.length,
      diversify,
      secondaryCategories: manualProfile.secondaryCategories,
      searchObjects: objectDebug,
    })
  }

  // Build result items with confidence tiers, signal chips, and value reason.
  // Chip generator is SIGNAL-BASED (commercial language, regional demand,
  // competitor gap, etc.), not just intent labels. valueReason is a 1-line
  // localized business-value statement separate from `reason`.
  const hasCity = !!ctx.city
  const unsequencedResult: PromptSuggestion[] = selectedSuggestions.map((item, idx) => {
    const score = Math.min(100, Math.round(item.score))
    return {
      id: `q-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      prompt: item.prompt,
      intent: item.def.intent,
      intentLabel: intentLabels[item.def.intent],
      category,
      language: lang,
      qualityScore: score,
      confidenceTier: getConfidenceTier(score),
      reason: buildReason(item.def, category, ctx, item.themeMatched),
      chips: generateSignalChips(item.prompt, item.def.intent, score, lang as 'he' | 'en', hasCity),
      valueReason: generateValueReason(item.def.intent, score, item.prompt, lang as 'he' | 'en', hasCity),
    }
  })

  // Sequence for visual variety: reorder to avoid adjacent same families/intents/phrasings
  const sequencedResult = sequenceSuggestionsForDisplay(unsequencedResult, lang as 'he' | 'en')

  if (shuffle && !diversify) {
    for (let i = sequencedResult.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[sequencedResult[i], sequencedResult[j]] = [sequencedResult[j], sequencedResult[i]]
    }
  }

  return sequencedResult.slice(0, limit)
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
 * Classify a prompt by its phrasing pattern (sentence template), not its topic.
 * Patterns are intentionally COARSE — multiple surface variants collapse to one
 * label so the diversity cap throttles all of them together. e.g. these all
 * map to 'he_recommendation_provider':
 *   "איזו חברה מומלצת ל..."
 *   "מי מומלץ ל..."
 *   "איזה מומחה מתאים ל..."
 *   "איזה ספק מומלץ ל..."
 *
 * This is critical: previous fine-grained labels left "איזו חברה" and
 * "מי מומלץ" in separate buckets, so the cap didn't actually throttle the
 * "recommendation opener" feel.
 */
function classifyPhrasingPattern(prompt: string, lang: 'he' | 'en'): string {
  const p = prompt.trim()
  if (lang === 'he') {
    // All recommendation/provider question variants → one bucket.
    if (
      /^(איזו?|איזה)\s+(?:חברה|מומחה|ספק|מותג|דגם|אפשרות|בית|חנות|אופציה)\s+(?:מומלץ|מומלצת|מומלצה|מתאים|מתאימה|מתאימת|כדאי|הכי\s+טוב)/.test(p) ||
      /^מי\s+(?:מומלץ|המומחה|הספק|הכי\s+טוב)/.test(p) ||
      /^איזה\s+\S+\s+(?:מומלץ|כדאי|הכי\s+טוב)/.test(p)
    ) {
      return 'he_recommendation_provider'
    }
    // All price/cost variants → one bucket.
    if (
      /^(כמה\s+(?:עולה|צריך\s+להשקיע|כסף\s+צריך|זה\s+עולה)|מה\s+(?:המחיר|טווח\s+המחירים|העלות))/.test(p)
    ) {
      return 'he_price'
    }
    // All pre-purchase / decision-making variants → one bucket.
    if (
      /^(איך\s+לבחור|מה\s+(?:חשוב\s+לבדוק|לבדוק\s+לפני|כדאי\s+לדעת|כדאי\s+לבחון|כדאי)|איך\s+(?:יודעים|להבחין|להעריך|להחליט))/.test(
        p
      )
    ) {
      return 'he_pre_purchase'
    }
    // Comparison (incl. "what's the difference between").
    if (/^(מה\s+עדיף|מה\s+ההבדל\s+בין|מי\s+(?:יותר\s+טוב|עדיף))/.test(p)) {
      return 'he_comparison'
    }
    // Reviews / verification / what people say.
    if (/^(חוות\s+דעת|איך\s+לבדוק\s+אם|מה\s+אומרים\s+על)/.test(p)) {
      return 'he_reviews'
    }
    // Where to / acquisition.
    if (/^(איפה\s+(?:כדאי|אפשר|לקנות|להזמין)|איך\s+(?:למצוא|לקנות|להזמין))/.test(p)) {
      return 'he_where_to'
    }
    return 'he_other'
  } else {
    if (
      /^which\s+(?:company|expert|provider|brand|model|store|option|service)\s+(?:is\s+(?:recommended|best)|suits|fits)/i.test(
        p
      ) ||
      /^who\s+is\s+(?:recommended|the\s+(?:best|expert|provider))/i.test(p) ||
      /^which\s+\S+\s+is\s+(?:recommended|best|good)/i.test(p)
    ) {
      return 'en_recommendation_provider'
    }
    if (
      /^(how\s+much\s+(?:does|to\s+(?:invest|pay))|what(?:'|’|`)?s\s+the\s+(?:price|cost|price\s+range))/i.test(
        p
      )
    ) {
      return 'en_price'
    }
    if (
      /^(how\s+to\s+choose|what\s+to\s+(?:check\s+before|look\s+for|consider)|how\s+do\s+you\s+(?:know|tell))/i.test(
        p
      )
    ) {
      return 'en_pre_purchase'
    }
    if (/^(what(?:'|’|`)?s\s+(?:better|the\s+difference)|which\s+is\s+better)/i.test(p)) {
      return 'en_comparison'
    }
    if (/^(reviews?\s+of|how\s+to\s+verify|what\s+do\s+people\s+say)/i.test(p)) {
      return 'en_reviews'
    }
    if (/^(where\s+(?:can\s+i|to)|how\s+to\s+(?:find|buy|order|get))/i.test(p)) {
      return 'en_where_to'
    }
    return 'en_other'
  }
}

const HE_FAMILY_MODIFIERS = new Set([
  // Common adjectives / descriptors
  'ביתי', 'ביתית', 'הביתי', 'הביתית', 'מקצועי', 'מקצועית', 'מתקפל', 'מתקפלת',
  'איכותי', 'איכותית', 'זול', 'זולה', 'יקר', 'יקרה', 'קטן', 'קטנה', 'גדול',
  'גדולה', 'מהיר', 'מהירה', 'איטי', 'איטית', 'טוב', 'טובה', 'מומלץ', 'מומלצת',
  'לבית', 'למשרד', 'לעסק', 'לשימוש', 'מודרני', 'מודרנית', 'קלאסי', 'קלאסית',
  'חזק', 'חזקה', 'יציב', 'יציבה', 'נוח', 'נוחה', 'אמין', 'אמינה', 'חדש', 'חדשה',
  'ישן', 'ישנה', 'הכי', 'הטוב', 'הטובה', 'משובח', 'משובחת', 'כושר',
  // Transaction / action prefixes that leak through (קניית משקולות → משקולות)
  'קניית', 'קנות', 'קנייה', 'רכישת', 'רכישה', 'הזמנת', 'הזמנה', 'מציאת',
  'בחירת', 'בחירה', 'איתור', 'חיפוש', 'שירותי', 'שירות',
])

const EN_FAMILY_MODIFIERS = new Set([
  'best', 'good', 'great', 'top', 'cheap', 'expensive', 'small', 'big', 'large',
  'home', 'office', 'professional', 'commercial', 'residential', 'foldable',
  'compact', 'modern', 'classic', 'new', 'old', 'reliable', 'fast', 'slow',
  'quality', 'recommended', 'affordable', 'fitness', 'buying', 'purchase',
  'purchasing', 'ordering', 'finding', 'choosing', 'service', 'services',
])

/**
 * Extract the keyword family from a prompt — the product/service ROOT.
 *
 * Algorithm:
 *   1. Strip the template wrapper (broader regex than before — catches
 *      "איזה הליכון מומלץ", "איזה מומחה מומלץ ל...", etc.)
 *   2. Strip trailing recommendation suffix ("...מומלץ?")
 *   3. Strip trailing city ("...בתל אביב")
 *   4. Strip "or alternatives" comparison tail
 *   5. Strip leading prepositions
 *   6. Remove common modifier words (ביתי / מתקפל / best / fitness ...)
 *   7. Take the first 3 content words
 *
 * Examples (HE):
 *   "איזה הליכון ביתי מומלץ?"           → "הליכון"
 *   "כמה עולה הליכון מתקפל?"            → "הליכון"
 *   "איך לבחור הליכון לבית קטן?"        → "הליכון"
 *   "קידום אתרים בתל אביב"              → "קידום אתרים"
 *   "קידום אתרים ברמת גן"               → "קידום אתרים"
 *   "קידום אתרים לרופאים"               → "קידום אתרים לרופאים" (audience kept)
 *
 * The family is a deterministic cap key — it does not have to be semantically
 * perfect, only stable enough that obvious variants collapse together.
 */
function extractKeywordFamily(prompt: string, lang: 'he' | 'en'): string {
  let core = prompt.toLowerCase().trim()

  if (lang === 'he') {
    // Strip broad template prefix — covers all our generation patterns plus
    // bare "איזה X מומלץ" forms from curated banks.
    // IMPORTANT: longer alternatives MUST come before shorter ones (regex
    // alternation is left-to-right). e.g. "חשוב לבדוק לפני שקונים" before
    // "חשוב לבדוק", otherwise the short one wins and leaves "לפני שקונים..."
    // dangling in the family key.
    core = core.replace(
      /^(איזו?\s+(?:חברה|מומחה|ספק|מותג|דגם|אפשרות|בית|חנות|אופציה)\s+(?:מומלץ|מומלצת|מומלצה|מתאים|מתאימה|מתאימת|כדאי|הכי\s+טוב)\s*(?:ל|עבור|של|ב)?\s*|מי\s+(?:מומלץ\s+עבור|מומלץ|המומחה|הספק|הכי\s+טוב)\s*(?:ל|עבור|של)?\s*|איזה\s+\S+\s+(?:מומלץ|כדאי|הכי\s+טוב)\s*(?:ל|עבור|של|ב)?\s*|איזה\s+|איזו\s+|כמה\s+(?:עולה|צריך\s+להשקיע\s+ב|כסף\s+צריך\s+ל|זה\s+עולה)\s*|מה\s+(?:המחיר|טווח\s+המחירים|העלות)\s+(?:של\s+)?|איך\s+(?:לבחור\s+ספק\s+ל?|לבחור\s+ל?|לבחור|למצוא|לקנות|להזמין|יודעים\s+ש|להבחין\s+בין|להעריך|להחליט|לבדוק\s+אם\s+שירות|לבדוק\s+אם)\s*|מה\s+(?:חשוב\s+לבדוק\s+לפני\s+(?:בחירת|שקונים|רוכשים|רכישת|קניית|הזמנת)\s*|חשוב\s+לבדוק\s*|לבדוק\s+לפני\s+שקונים\s*|עדיף\s*[—\-–]?\s*|כדאי\s+ל?\s*|ההבדל\s+בין\s*|אומרים\s+על\s*)|חוות\s+דעת\s+על(?:\s+שירותי)?\s*|איפה\s+(?:כדאי|אפשר)\s+(?:ל?(?:קנות|הזמין|מצוא))\s*|איפה\s+(?:כדאי|אפשר|לקנות|להזמין)\s*ל?\s*|איך\s+(?:למצוא|לקנות|להזמין)\s*ל?\s*|מי\s+(?:יותר\s+טוב|עדיף)\s+מ?\s*)/u,
      ''
    )
    // Strip dangling pre-purchase tail words that survive the prefix strip.
    // e.g. "מה חשוב לבדוק" → leaves "לפני שקונים X" → strip that too.
    core = core.replace(/^(?:לפני\s+(?:שקונים|שרוכשים|שמזמינים|בחירת|רכישת|קניית|הזמנת)\s+)/u, '')
    // Strip leading prepositions and ל.
    core = core.replace(/^(?:של|עבור|את)\s+/u, '')
    core = core.replace(/^ל/u, '')
    // Strip trailing recommendation suffix ("...מומלץ?", "...כדאי?").
    core = core.replace(
      /\s+(?:מומלץ|מומלצת|טוב|טובה|כדאי|מתאים|מתאימה|הכי\s+(?:טוב|טובה))\s*\??\s*$/u,
      ''
    )
    // Strip trailing comparison tail.
    core = core.replace(/\s+או\s+(?:חלופות\s+אחרות|מתחרים|אחרים).*$/u, '')
    // Strip trailing city / "in my city".
    core = core.replace(/\s+ב[א-ת][א-ת\s\-־"׳']*\??$/u, '')
    core = core.replace(/\s+בעיר\s+שלי\s*\??$/u, '')
    // Strip punctuation.
    core = core.replace(/[?!.,;:'"״׳`\-–—]/g, '')
    core = core.replace(/\s+/g, ' ').trim()

    // Remove modifier words so "הליכון ביתי" / "הליכון מתקפל" collapse to "הליכון".
    const words = core.split(' ').filter((w) => w && !HE_FAMILY_MODIFIERS.has(w))
    return words.slice(0, 3).join(' ')
  } else {
    core = core.replace(
      /^(which\s+(?:company|expert|provider|brand|model|store|option|service)\s+(?:is\s+(?:recommended|best)|suits|fits)\s+(?:for|of)?\s*|who\s+is\s+(?:recommended|the\s+(?:best|expert|provider))\s+(?:for|of)?\s*|which\s+\S+\s+is\s+(?:recommended|best|good)\s+for?\s*|how\s+much\s+(?:does|to\s+(?:invest|pay))\s*|what(?:'|’|`)?s\s+the\s+(?:price|cost|price\s+range)\s+(?:of\s+)?|how\s+to\s+(?:choose\s+a\s+provider\s+for|choose|find|buy|order|verify\s+if\s+a)\s*|what\s+to\s+(?:check\s+before(?:\s+choosing)?|look\s+for|consider)\s*|how\s+do\s+you\s+(?:know|tell)\s*|what(?:'|’|`)?s\s+(?:better\s*[—\-–]?|the\s+difference\s+between)\s*|which\s+is\s+better\s*|reviews?\s+of(?:\s+services?)?\s*|where\s+(?:can\s+i|to\s+(?:buy|order|find))\s*|how\s+to\s+(?:find|buy|order|get)\s*|what\s+do\s+people\s+say\s+about\s*)/i,
      ''
    )
    core = core.replace(/^(?:the|a|an|to|for|of|by)\s+/i, '')
    core = core.replace(/\s+is\s+(?:recommended|best|good)\s*\??\s*$/i, '')
    core = core.replace(/\s+or\s+(?:alternatives|competitors|others).*$/i, '')
    core = core.replace(/\sin\s+[a-z][a-z\s\-]*$/i, '')
    core = core.replace(/\s+in\s+my\s+city\s*\??$/i, '')
    core = core.replace(/\s+(?:services?|cost|reliability)\s*\??\s*$/i, '')
    core = core.replace(/[?!.,;:'"`\-–—]/g, '')
    core = core.replace(/\s+/g, ' ').trim()

    const words = core.split(' ').filter((w) => w && !EN_FAMILY_MODIFIERS.has(w))
    return words.slice(0, 3).join(' ')
  }
}

/**
 * Diversity-aware selection. Picks AT MOST `limit` items from `candidates`,
 * but is allowed to return fewer when the diversity caps prevent more.
 *
 * The previous implementation had a score-only fallback that filled the limit
 * regardless of diversity — that defeated the purpose. Quality > quantity:
 * if the candidate pool only supports 7 truly diverse suggestions, return 7.
 *
 * Two stages:
 *   Stage 1 (first 4 items, the prominent batch):
 *     - max 1 per keyword family
 *     - max 1 per phrasing pattern
 *     - max 2 per intent bucket
 *   Stage 2 (remaining slots):
 *     - max ceil(limit/6) per keyword family (≈2 for limit=12)
 *     - max ceil(limit/6) per phrasing pattern
 *     - max ceil(limit/4) per intent bucket (≈3 for limit=12)
 *
 * Both stages walk candidates in score order and pick the first that fits the
 * current caps. No randomness inside the caps — randomness comes from the
 * generator's pool-level shuffle and the excludePrompts ledger across
 * regenerate calls.
 */
function selectDiverseSuggestions<
  T extends {
    def: QueryDef
    prompt: string
    score: number
    themeMatched: Array<keyof KeywordThemes>
    offering: string
  }
>(candidates: T[], limit: number, lang: 'he' | 'en'): T[] {
  if (candidates.length === 0) return []

  const sorted = [...candidates].sort((a, b) => b.score - a.score)

  type Classified = { item: T; intent: IntentBucket; family: string; phrasing: string }
  const classified: Classified[] = sorted.map((item) => ({
    item,
    intent: getIntentBucket(item.prompt, item.def, item.offering),
    family: extractKeywordFamily(item.prompt, lang),
    phrasing: classifyPhrasingPattern(item.prompt, lang),
  }))

  const intentCounts: Record<string, number> = {}
  const familyCounts: Record<string, number> = {}
  const phrasingCounts: Record<string, number> = {}

  const selected: T[] = []
  const used = new Set<T>()

  const commit = (c: Classified) => {
    selected.push(c.item)
    used.add(c.item)
    intentCounts[c.intent] = (intentCounts[c.intent] || 0) + 1
    familyCounts[c.family] = (familyCounts[c.family] || 0) + 1
    phrasingCounts[c.phrasing] = (phrasingCounts[c.phrasing] || 0) + 1
  }

  // Stage 1: first 4 items get the strictest caps so the most prominent
  // suggestions are maximally varied.
  const STAGE_1_SIZE = Math.min(4, limit)
  for (const c of classified) {
    if (selected.length >= STAGE_1_SIZE) break
    if (used.has(c.item)) continue
    if ((familyCounts[c.family] || 0) >= 1) continue
    if ((phrasingCounts[c.phrasing] || 0) >= 1) continue
    if ((intentCounts[c.intent] || 0) >= 2) continue
    commit(c)
  }

  // Stage 2: fill remaining slots with looser-but-still-strict caps PLUS a
  // dynamic family-repeat penalty applied to the effective score at each step.
  // Rationale: hard caps alone left one family (e.g. "הליכון") taking the full
  // familyCap in scoring order. The exponential-ish penalty (0, -8, -18, -35,
  // -60) makes a same-family repeat lose to a fresh-family candidate even when
  // the repeat's base score is several points higher.
  const familyCap = Math.max(2, Math.ceil(limit / 6))
  const phrasingCap = Math.max(2, Math.ceil(limit / 6))
  const intentCap = Math.max(3, Math.ceil(limit / 4))

  while (selected.length < limit) {
    let best: Classified | null = null
    let bestEffective = -Infinity

    for (const c of classified) {
      if (used.has(c.item)) continue
      if ((familyCounts[c.family] || 0) >= familyCap) continue
      if ((phrasingCounts[c.phrasing] || 0) >= phrasingCap) continue
      if ((intentCounts[c.intent] || 0) >= intentCap) continue
      const penalty = familyRepeatPenalty(familyCounts[c.family] || 0)
      const effective = c.item.score - penalty
      if (effective > bestEffective) {
        bestEffective = effective
        best = c
      }
    }

    if (!best) break
    commit(best)
  }

  // NO score-only fallback. If diversity caps prevent filling `limit`, the
  // caller renders fewer suggestions + a "no more diverse questions" hint.
  return selected
}

/**
 * Map a quality score to a confidence tier.
 * 90-100: High, 75-89: Good, 50-74: Medium, 30-49: Opportunity, 0-29: Experimental
 */
export function getConfidenceTier(score: number): 'high' | 'good' | 'medium' | 'opportunity' | 'experimental' {
  if (score >= 90) return 'high'
  if (score >= 75) return 'good'
  if (score >= 50) return 'medium'
  if (score >= 30) return 'opportunity'
  return 'experimental'
}

/**
 * Generate 1–3 SIGNAL-BASED explanation chips.
 *
 * Chips no longer just mirror the intent label — they describe real signals
 * derived from the prompt text and scoring context. Each suggestion is
 * guaranteed at least one "signal" chip (volume, visibility gap, commercial
 * language, regional demand, competitor gap, etc.). Generic intent-only chips
 * are filtered out unless paired with a stronger signal.
 *
 * Inputs:
 *   - prompt: the rendered question (Hebrew or English)
 *   - intent: classified intent of the underlying query def
 *   - score: quality score (0-100), used as volume/confidence proxy
 *   - hasCity: whether the project has a configured city (regional demand)
 *
 * Output: ordered list of chip i18n keys, max 3, deduped.
 */
export function generateSignalChips(
  prompt: string,
  intent: PromptIntent,
  score: number,
  lang: 'he' | 'en',
  hasCity: boolean
): string[] {
  type Candidate = { chip: string; priority: number; isSignal: boolean }
  const candidates: Candidate[] = []

  // ---- Strong commercial signals (text-derived) ----
  const isCommercialPhrase = lang === 'he'
    ? /(מחיר|כמה\s+עולה|במבצע|בהנחה|לקנות|להזמין|זול|משתלם|טווח\s+מחירים|העלות)/.test(prompt)
    : /(price|cost|how\s+much|to\s+buy|order|cheap|discount|affordable|price\s+range)/i.test(prompt)
  if (isCommercialPhrase) {
    candidates.push({ chip: 'chip_commercial_phrase', priority: 11, isSignal: true })
  }

  // ---- Volume / demand signal (score is the proxy) ----
  if (score >= 88) {
    candidates.push({ chip: 'chip_high_search_volume', priority: 10, isSignal: true })
  }

  // ---- Visibility gap signals ----
  // Every suggestion implies "business not appearing here yet". Use for
  // mid-to-high confidence so the chip carries weight.
  if (score >= 75) {
    candidates.push({ chip: 'chip_not_in_ai', priority: 6, isSignal: true })
  } else if (score >= 50) {
    // Lower-confidence suggestions = ranking opportunity in Google + AI
    candidates.push({ chip: 'chip_low_google_rank', priority: 5, isSignal: true })
  }

  // ---- Purchase / commercial intent ----
  if (intent === 'transactional' || intent === 'commercial') {
    candidates.push({ chip: 'chip_purchase_intent', priority: 9, isSignal: true })
    if (score >= 80) {
      candidates.push({ chip: 'chip_conversion_potential', priority: 9, isSignal: true })
    }
  }

  // ---- Comparison / competitor gap ----
  if (intent === 'comparison' || intent === 'alternatives') {
    candidates.push({ chip: 'chip_comparison_search', priority: 8, isSignal: true })
    candidates.push({ chip: 'chip_competitor_gap', priority: 7, isSignal: true })
  }

  // ---- Brand → competitor pattern ----
  if (intent === 'brand') {
    candidates.push({ chip: 'chip_competitor_gap', priority: 8, isSignal: true })
  }

  // ---- Pre-purchase research ----
  if (intent === 'pre_purchase') {
    candidates.push({ chip: 'chip_pre_purchase_search', priority: 8, isSignal: true })
  }

  // ---- Local + regional demand ----
  const hasLocationToken = lang === 'he'
    ? /(תל\s+אביב|ירושלים|חיפה|ראשון|פתח\s+תקווה|רמת\s+גן|אילת|נתניה|רעננה|הרצליה|באר\s+שבע|כפר\s+סבא|בעיר\s+שלי|באזור)/.test(prompt)
    : /(near\s+me|in\s+my\s+(?:city|area)|nearby)/i.test(prompt)
  if (intent === 'local' || hasLocationToken) {
    candidates.push({ chip: 'chip_local_search', priority: 8, isSignal: true })
    // Only show regional demand chip if there's actual location evidence, not just hasCity
    if (hasLocationToken) {
      candidates.push({ chip: 'chip_regional_demand', priority: 7, isSignal: true })
    }
  }

  // ---- Recommendation → lead opportunity ----
  if (intent === 'recommendation') {
    candidates.push({ chip: 'chip_lead_opportunity', priority: 7, isSignal: true })
    if (score >= 85) {
      candidates.push({ chip: 'chip_conversion_potential', priority: 8, isSignal: true })
    }
  }

  // Sort by priority, dedupe, return top 3. Guarantee at least one signal chip
  // (the candidates list already filters intent-only labels — all chips here
  // ARE signals).
  const seen = new Set<string>()
  const sorted = candidates.sort((a, b) => b.priority - a.priority)
  const chips: string[] = []
  for (const c of sorted) {
    if (seen.has(c.chip)) continue
    seen.add(c.chip)
    chips.push(c.chip)
    if (chips.length >= 3) break
  }

  // Fallback: every suggestion gets at least one signal chip
  if (chips.length === 0) {
    chips.push('chip_not_in_ai')
  }

  return chips
}

/**
 * One-line business-value reason. Different from `reason` (which describes
 * WHY the question was generated). valueReason describes WHY tracking this
 * question matters — what action it should drive.
 *
 * Signal-prioritized: commercial phrasing wins over generic intent class.
 */
export function generateValueReason(
  intent: PromptIntent,
  score: number,
  prompt: string,
  lang: 'he' | 'en',
  hasCity: boolean
): string {
  const isCommercial = lang === 'he'
    ? /(מחיר|כמה\s+עולה|במבצע|בהנחה|לקנות|להזמין|זול|משתלם)/.test(prompt)
    : /(price|cost|how\s+much|to\s+buy|order|cheap|discount)/i.test(prompt)
  const hasLocation = lang === 'he'
    ? /(תל\s+אביב|ירושלים|חיפה|ראשון|פתח\s+תקווה|רמת\s+גן|אילת|נתניה|רעננה|הרצליה|באר\s+שבע|בעיר\s+שלי|באזור)/.test(prompt)
    : /(near\s+me|in\s+my\s+(?:city|area)|nearby)/i.test(prompt)

  if (lang === 'he') {
    if (isCommercial || intent === 'transactional' || intent === 'commercial') {
      return 'משתמשים שמחפשים זאת קרובים לרכישה.'
    }
    if (intent === 'comparison' || intent === 'alternatives' || intent === 'brand') {
      return 'מתחרים מופיעים כאן יותר מהעסק.'
    }
    // Only show local opportunity if intent is local OR if there's a location token in the prompt.
    // Don't infer from hasCity alone — that's hallucination.
    if (intent === 'local' || hasLocation) {
      return 'הזדמנות לשיפור נראות מקומית.'
    }
    if (intent === 'pre_purchase') {
      return 'החיפוש בעל כוונת רכישה גבוהה.'
    }
    if (intent === 'recommendation' && score >= 85) {
      return 'הזדמנות טובה להגדלת לידים אורגניים.'
    }
    if (score >= 88) {
      return 'השאלה נפוצה במנועי AI.'
    }
    return 'העסק כמעט לא מופיע בשאלות מהסוג הזה.'
  }

  if (isCommercial || intent === 'transactional' || intent === 'commercial') {
    return 'Searchers here are close to purchasing.'
  }
  if (intent === 'comparison' || intent === 'alternatives' || intent === 'brand') {
    return 'Competitors appear more often than the business here.'
  }
  // Only show local opportunity if intent is local OR if there's a location token in the prompt.
  // Don't infer from hasCity alone — that's hallucination.
  if (intent === 'local' || hasLocation) {
    return 'Opportunity to improve local visibility.'
  }
  if (intent === 'pre_purchase') {
    return 'High purchase intent in this search.'
  }
  if (intent === 'recommendation' && score >= 85) {
    return 'Good opportunity for organic lead generation.'
  }
  if (score >= 88) {
    return 'Common question across AI engines.'
  }
  return 'The business barely appears in this type of question.'
}

/**
 * Exponential-ish penalty applied to the effective score during diversity
 * selection. Stops one keyword family (e.g. "הליכון") from dominating the
 * batch even when its candidates score highest.
 *
 *   usage 0 → 0     (first pick, no penalty)
 *   usage 1 → 8     (second time same family is considered)
 *   usage 2 → 18    (third time)
 *   usage 3 → 35    (fourth)
 *   usage 4+ → 60   (effectively suppressed)
 */
function familyRepeatPenalty(usage: number): number {
  if (usage <= 0) return 0
  if (usage === 1) return 8
  if (usage === 2) return 18
  if (usage === 3) return 35
  return 60
}

/**
 * Reorder suggestions post-selection to avoid adjacent repetition of keyword families,
 * intents, and phrasing patterns. Uses greedy algorithm: pick next item with fewest
 * conflicts with the previous item. Priority: family > intent > phrasing > score.
 *
 * Result: visual variety improves even though diversity caps are already enforced.
 */
function sequenceSuggestionsForDisplay<
  T extends {
    prompt: string
    intent: PromptIntent
    qualityScore: number
  }
>(items: T[], lang: 'he' | 'en'): T[] {
  if (items.length <= 1) return items

  type Classified = {
    item: T
    intent: PromptIntent
    family: string
    phrasing: string
  }
  const classified = items.map((item) => ({
    item,
    intent: item.intent,
    family: extractKeywordFamily(item.prompt, lang),
    phrasing: classifyPhrasingPattern(item.prompt, lang),
  }))

  const result: T[] = []
  const remaining = new Set(classified)

  // Pick first item (highest score)
  const first = [...classified].sort((a, b) => b.item.qualityScore - a.item.qualityScore)[0]
  if (first) {
    result.push(first.item)
    remaining.delete(first)
  }

  // Greedy: for each step, pick the item with fewest conflicts with previous
  while (remaining.size > 0) {
    const prev = classified.find((c) => c.item === result[result.length - 1])!
    let bestCandidate: (typeof classified)[0] | null = null
    let bestScore = -Infinity

    for (const candidate of remaining) {
      // Count conflicts: family match, intent match, phrasing match
      const familyConflict = candidate.family === prev.family ? 1 : 0
      const intentConflict = candidate.intent === prev.intent ? 1 : 0
      const phrasingConflict = candidate.phrasing === prev.phrasing ? 1 : 0

      // Prefer items with fewer conflicts. Tiebreak by quality score.
      const conflictScore = -(familyConflict * 100 + intentConflict * 10 + phrasingConflict)
      const totalScore = conflictScore + candidate.item.qualityScore * 0.01

      if (totalScore > bestScore) {
        bestScore = totalScore
        bestCandidate = candidate
      }
    }

    if (bestCandidate) {
      result.push(bestCandidate.item)
      remaining.delete(bestCandidate)
    } else {
      // Shouldn't happen, but fallback: pick any remaining
      const next = remaining.values().next().value
      if (next) {
        result.push(next.item)
        remaining.delete(next)
      }
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
