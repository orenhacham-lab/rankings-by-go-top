/**
 * Keyword Analysis Layer — Phase 1
 *
 * Deterministic classification of selected keywords for the
 * Keyword Research → Generate AI Questions modal.
 *
 * Architecture principle:
 *   selected keywords → understand type/topic → decide whether to generate
 *
 * This module is intentionally isolated:
 *   - No API calls
 *   - No LLM
 *   - No randomness
 *   - Same input always produces same output
 *   - Not wired to any UI (yet)
 *
 * Usage:
 *   The modal should call analyzeSelectedKeywordSignals() to understand each
 *   selected keyword before attempting question generation.
 *   Phase 3 will wire this into keyword-research/page.tsx.
 */

import type { TopicCluster } from './intent-engine'
import type { BusinessCategory } from './prompt-templates'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Broad semantic type of a keyword — what kind of thing the user is searching for.
 */
export type KeywordType =
  | 'service'           // a service someone can hire/use  (e.g., קידום אתרים, ניקיון משרדים)
  | 'product'           // a physical/digital product       (e.g., הליכון ביתי, שמלה)
  | 'brand'             // a business/brand name             (e.g., Go Top, ששקה)
  | 'marketing_channel' // a paid-media / marketing channel (e.g., Google Ads, פרסום בפייסבוק)
  | 'professional_topic'// professional knowledge/concept   (e.g., מה זה SEO, שיווק דיגיטלי)
  | 'informational'     // broad informational query         (e.g., מה זה, איך עובד)
  | 'irrelevant'        // unrelated to any supported domain (e.g., איראן, מזג אוויר)

/**
 * Extended topic clusters for keyword analysis — superset of TopicCluster
 * with generic paid_ads bucket for unplatformed paid-media terms.
 */
export type KeywordTopic =
  | TopicCluster
  | 'paid_ads'          // generic paid advertising (פרסום ממומן, קידום ממומן, performance marketing)
  | 'home_improvement'  // kitchen remodeling, bathroom, carpentry
  | 'sports_product'    // treadmill, bike, gym equipment
  | 'perfume_product'   // fragrances, cologne
  | 'florist_product'   // flowers, bouquets

export type RelevanceResult = 'matched' | 'mismatch' | 'uncertain'
export type ConfidenceLevel = 'high' | 'medium' | 'low'

export interface KeywordAnalysis {
  keyword: string
  keywordType: KeywordType
  topics: KeywordTopic[]
  relevance: RelevanceResult
  confidence: ConfidenceLevel
  reason: string
  /** Normalized human-readable label safe for use in question templates. */
  normalizedLabel: string | null
  /** Master flag: should the modal attempt to generate questions for this keyword? */
  shouldGenerate: boolean
  /** Ordered list of rule IDs that fired, for debugging/logging. */
  debugRules: string[]
}

export interface KeywordAnalysisInput {
  selectedKeywords: string[]
  /** Detected project business category, if known. */
  projectCategory?: BusinessCategory | null
  projectBusinessName?: string | null
  projectDomain?: string | null
  language: 'he' | 'en'
  country?: string
  /**
   * true when the project has very few indexed keywords (new project).
   * Relaxes the mismatch gate — we cannot reliably detect category yet.
   */
  isNewProject?: boolean
}

// ============================================================================
// INTERNAL PATTERN BANKS
// (Compiled once, used across all keyword checks)
// ============================================================================

// ── Marketing channels: platform-specific ──────────────────────────────────
const CHANNEL_GOOGLE_ADS = /(google\s*ads|גוגל\s*אדס|פרסום\s*ממומן\s*בגוגל|פרסום\s*בגוגל|adwords|ניהול\s*קמפיינים\s*בגוגל|קמפיין\s*בגוגל)/i
const CHANNEL_FACEBOOK   = /(פרסום\s*(ב)?פייסבוק|פייסבוק\s*אדס|facebook\s*ads|קמפיין\s*בפייסבוק|לידים\s*בפייסבוק|פרסום\s*ממומן\s*בפייסבוק)/i
const CHANNEL_INSTAGRAM  = /(פרסום\s*(ב)?אינסטגרם|instagram\s*ads|קמפיין\s*באינסטגרם|פרסום\s*ממומן\s*באינסטגרם)/i
const CHANNEL_TIKTOK     = /(פרסום(\s*ממומן)?\s*(ב)?טיקטוק|tiktok\s*ads|קמפיין\s*(ב)?טיקטוק)/i
const CHANNEL_LINKEDIN   = /(פרסום(\s*ממומן)?\s*(ב)?לינקדאין|linkedin\s*ads)/i
// Generic paid advertising — NOT mapped to any platform
const CHANNEL_PAID_ADS_GENERIC = /(^פרסום\s*ממומן$|^קידום\s*ממומן$|paid\s*ads?|performance\s*marketing|ניהול\s*קמפיינים$|^פרסום\s*ממומן\b(?!\s*ב))/i

// ── Services ───────────────────────────────────────────────────────────────
const SERVICE_SEO        = /(קידום\s*אתר|קידום\s*אורגני|seo\b|ניהול\s*seo)/i
const SERVICE_LOCAL_SEO  = /(קידום\s*מקומי|local\s*seo|גוגל\s*מפות|google\s*maps|מיקום\s*בגוגל)/i
const SERVICE_WEB_DEV    = /(בניית\s*אתר|פיתוח\s*אתר|web\s*dev(elopment)?|website\s*build|עיצוב\s*אתר)/i
const SERVICE_CLEANING   = /(ניקיון|cleaning|ניקוי|חברת\s*ניקיון)/i
const SERVICE_HOME_IMP   = /(שיפוץ|שיפוצים|renovation|remodel|carpent|נגרות|אינסטלציה|חשמלאי|צבעי|kitchen\s*remodel|bathroom\s*remodel|home\s*improvement)/i
const SERVICE_FLORIST    = /(משלוח\s*פרחים|זר\s*פרחים|זר\s*ורד|חנות\s*פרחים|florist|flower\s*deliver)/i
const SERVICE_LEGAL      = /(עורכי?\s*דין|משרד\s*עורכי?\s*דין|ייעוץ\s*משפטי|lawyers?|legal\s*service)/i
const SERVICE_MEDICAL    = /(רופא|קליניקה|רפואה|dental|דנטל|חדר\s*שיניים|doctor|clinic)/i
const SERVICE_CONTENT    = /(שיווק\s*תוכן|content\s*marketing|כתיבת\s*תוכן|בלוגים)/i
const SERVICE_EMAIL      = /(שיווק\s*במייל|email\s*marketing|ניוזלטר|דיוור)/i
const SERVICE_SOCIAL_MGT = /(ניהול\s*(רשתות|פרופיל|עמוד)|community\s*management|social\s*media\s*management)/i
const SERVICE_GENERIC    = /(ניהול|שירות|חברת|ספק|סוכנות|agency|management\s*service)/i

// ── Products ───────────────────────────────────────────────────────────────
const PRODUCT_FASHION    = /(שמלה|שמלות|חולצה|חולצות|מכנסיים|ג'ינס|מעיל|מעילים|חצאית|חצאיות|בגד|בגדים|נעל|נעלים|נעלי\s*\w+|תיק|תיקים|אביזרי\s*אופנה|fashion|clothing|apparel)/i
const PRODUCT_SPORTS     = /(הליכון|אופניים|כדורגל|כדורסל|ציוד\s*ספורט|ציוד\s*כושר|חדר\s*כושר|אימון|יוגה|מזרן|מזרני|ציוד\s*יוגה|אביזרי\s*יוגה|פילאטיס|ציוד\s*פילאטיס|משקולות|ספורט|כושר|אביזרי\s*כושר|treadmill|bicycle|yoga|mat|gym|sports?\s*equipment|fitness)/i
const PRODUCT_PERFUME    = /(בושם|בשמ|ניחוח|עליות\s*בושם|parfum|perfume|cologne|fragrance)/i
const PRODUCT_APPLIANCE  = /(מכונת\s*כביסה|מקרר|מדיח|תנור|מיקרוגל|מזגן|dishwasher|washing\s*machine|fridge|appliance)/i
const PRODUCT_FLOWERS    = /(זר\s*ורד|זר\s*פרחים|בוקה|bouquet|flower\s*arrangement)/i

// ── Brands (well-known brands in the system) ───────────────────────────────
const KNOWN_BRANDS       = /\b(go\s*top|גו\s*טופ|עידו\s*ספורט|ששקה|הלהיט\s*בניקיון|רמי\s*לוי|אמזון|amazon|google|apple|samsung|nike|adidas)\b/i

// ── Informational / professional topic ────────────────────────────────────
const INFORMATIONAL      = /^(מה\s*(זה|הוא|היא)|איך\s*עובד|what\s*is|how\s*does|שיווק\s*דיגיטלי|digital\s*marketing|דירוג\s*ב|מה\s*זה\s*seo)/i

// ── Hard-irrelevant topics ─────────────────────────────────────────────────
const IRRELEVANT         = /(^(איראן|ישראל|פוליטיקה|חדשות|מזג\s*אוויר|ספורט\s*עולמי|כדורגל\s*ישראלי|ביורוקרטיה|פרלמנט|כנסת|ממשלה)$|breaking\s*news|weather|politics|iran|ukraine|war\b|celebrity|gossip)/i

// ── Paid-media / channel signal (broad, to detect "marketing_channel" type) ─
const IS_MARKETING_CHANNEL = /(פרסום|קמפיין|ads?\b|marketing|performance|paid|ממומן|קידום\s*ממומן|google\s*ads|facebook\s*ads|instagram\s*ads)/i

// ============================================================================
// PROJECT CATEGORY → BROAD DOMAIN GROUP
//
// Design principle: default permissive.
// Hard-block only when both project and keyword belong to clearly unrelated
// business domains and both sides are high-confidence/specific.
//
// Generic on either side → never block.
// Marketing keywords do NOT block retail projects (a store may research SEO).
// Only marketing + physical-service industries are blocked (cleaning, home_services).
// ============================================================================

/**
 * Broad industry domain group.
 * Coarser than BusinessCategory — used only for mismatch detection.
 */
type BroadDomain =
  | 'marketing'      // agency, SEO, ads, digital marketing services
  | 'retail_apparel' // fashion, clothing, second-hand, shoes
  | 'retail_sports'  // sports store, gym equipment, fitness
  | 'retail_beauty'  // perfume, cosmetics, beauty products
  | 'retail_home'    // appliances, home goods
  | 'retail_gifts'   // gifts, specialty retail
  | 'home_services'  // renovation, carpentry, local trades
  | 'cleaning'       // cleaning company
  | 'florist'        // flower delivery, florist
  | 'food'           // restaurant, catering
  | 'professional'   // legal, medical, healthcare
  | 'tech'           // SaaS, software, education
  | 'generic'        // unknown / too broad to classify → always permissive

const CATEGORY_TO_BROAD_DOMAIN: Partial<Record<BusinessCategory, BroadDomain>> = {
  agency:                   'marketing',
  saas:                     'tech',
  education:                'tech',
  ecommerce:                'generic',    // general ecommerce → permissive
  product_brand:            'generic',
  real_estate:              'generic',
  generic:                  'generic',
  perfume:                  'retail_beauty',
  beauty:                   'retail_beauty',
  second_hand_fashion:      'retail_apparel',
  sports_store:             'retail_sports',
  fitness:                  'retail_sports',
  appliance_store:          'retail_home',
  gifts:                    'retail_gifts',
  florist:                  'florist',
  cleaning:                 'cleaning',
  local_service:            'home_services',
  home_improvement_service: 'home_services',
  legal:                    'professional',
  healthcare:               'professional',
  restaurant:               'food',
}

/** Keyword domain — what industry does this keyword signal? */
type KeywordDomain = BroadDomain | 'any'

/**
 * Map keyword classification to a broad domain group.
 * Returns 'any' when the keyword is domain-agnostic (brand, info, generic service).
 */
function topicsToBroadDomain(topics: KeywordTopic[], keywordType: KeywordType): KeywordDomain {
  if (keywordType === 'marketing_channel') return 'marketing'

  if (keywordType === 'service') {
    // Marketing services
    if (topics.some(t => [
      'seo', 'google_ads', 'facebook_ads', 'instagram_ads', 'paid_ads',
      'social_media', 'local_seo', 'content_marketing', 'email_marketing', 'web_dev',
    ].includes(t))) return 'marketing'
    // Physical service industries
    if (topics.some(t => ['office_cleaning', 'building_cleaning', 'residential_cleaning'].includes(t))) return 'cleaning'
    if (topics.includes('home_improvement')) return 'home_services'
    if (topics.includes('florist_product')) return 'florist'
    if (topics.includes('lawyers')) return 'professional'
    if (topics.includes('doctors')) return 'professional'
    // Generic service (no specific industry signal)
    return 'any'
  }

  if (keywordType === 'product') {
    if (topics.includes('fashion'))         return 'retail_apparel'
    if (topics.includes('sports_product'))  return 'retail_sports'
    if (topics.includes('perfume_product')) return 'retail_beauty'
    if (topics.includes('florist_product')) return 'florist'
    // Appliances and other products without a specific topic → generic
    return 'generic'
  }

  // brand / professional_topic / informational → domain-agnostic
  return 'any'
}

/**
 * Cross-domain conflict table.
 * An entry `A: [B, C]` means: a keyword in domain A is clearly mismatched
 * with a project in domain B or C.
 *
 * Key rules:
 *  - marketing does NOT conflict with retail domains
 *    (a fashion/sports/beauty store may legitimately research SEO or ads)
 *  - retail_sports ↔ retail_beauty block each other (sports equipment vs perfume)
 *  - retail_apparel does NOT block retail_sports (athletic wear / shoes overlap)
 *  - generic on either side → handled before this table (always permissive)
 */
const CROSS_DOMAIN_CONFLICTS: Partial<Record<BroadDomain, BroadDomain[]>> = {
  // Marketing keywords only conflict with physical-service industries
  marketing: ['cleaning', 'home_services'],

  // Retail apparel: blocks service/food/professional — NOT retail_sports (overlap)
  retail_apparel: ['cleaning', 'home_services', 'food', 'professional'],

  // Retail sports: additionally blocks retail_beauty (perfume ↔ sports = clear mismatch)
  retail_sports: ['cleaning', 'home_services', 'food', 'professional', 'retail_beauty'],

  // Retail beauty: symmetric with retail_sports
  retail_beauty: ['cleaning', 'home_services', 'food', 'professional', 'retail_sports'],

  // Retail home (appliances, etc.): blocks service/food/professional
  retail_home: ['cleaning', 'food', 'professional'],

  // Retail gifts: permissive — gifts can span many product domains
  retail_gifts: ['cleaning', 'home_services', 'food', 'professional'],

  // Florist: blocks service/food/professional
  florist: ['cleaning', 'home_services', 'food', 'professional'],

  // Cleaning: incompatible with all retail, other services, food, professional
  cleaning: [
    'marketing', 'retail_apparel', 'retail_sports', 'retail_beauty',
    'retail_home', 'retail_gifts', 'home_services', 'food', 'professional', 'florist',
  ],

  // Home services (renovation): incompatible with retail, food, professional
  home_services: [
    'marketing', 'retail_apparel', 'retail_sports', 'retail_beauty',
    'retail_gifts', 'food', 'professional', 'florist', 'cleaning',
  ],

  // Food: incompatible with retail, cleaning, home_services, professional
  food: [
    'retail_apparel', 'retail_sports', 'retail_beauty',
    'retail_home', 'retail_gifts', 'cleaning', 'home_services', 'professional', 'florist',
  ],

  // Professional (legal/medical): incompatible with retail, cleaning, home_services, food
  professional: [
    'retail_apparel', 'retail_sports', 'retail_beauty',
    'retail_home', 'retail_gifts', 'cleaning', 'home_services', 'food', 'florist',
  ],

  // Tech is fully permissive
  tech: [],
}

/**
 * Returns true only when a keyword domain and project domain are clearly
 * from unrelated industries and both sides are specific (not generic/any).
 *
 * Conservative by design — unknown or generic domains always return false.
 */
function areKeywordAndProjectClearlyConflicting(
  keywordDomain: KeywordDomain,
  projectDomain: BroadDomain,
): boolean {
  // Permissive escape hatches — never block when information is incomplete
  if (keywordDomain === 'any') return false
  if (keywordDomain === 'generic' || projectDomain === 'generic') return false
  if (keywordDomain === projectDomain) return false

  return CROSS_DOMAIN_CONFLICTS[keywordDomain]?.includes(projectDomain) ?? false
}

// ============================================================================
// CORE CLASSIFIER
// ============================================================================

function classifyKeyword(
  keyword: string,
  language: 'he' | 'en',
): {
  keywordType: KeywordType
  topics: KeywordTopic[]
  confidence: ConfidenceLevel
  normalizedLabel: string | null
  debugRules: string[]
} {
  const rules: string[] = []
  const topics: KeywordTopic[] = []
  const kw = keyword.trim()

  // ── 1. Empty / too short ──────────────────────────────────────────────────
  if (kw.length < 2) {
    return { keywordType: 'irrelevant', topics: [], confidence: 'low', normalizedLabel: null, debugRules: ['empty_keyword'] }
  }

  // ── 2. Too long — likely noise or scraped title ──────────────────────────
  const wordCount = kw.split(/\s+/).length
  if (wordCount > 10) {
    return { keywordType: 'irrelevant', topics: [], confidence: 'low', normalizedLabel: null, debugRules: ['too_long'] }
  }

  // ── 3. Hard irrelevant terms ─────────────────────────────────────────────
  if (IRRELEVANT.test(kw)) {
    rules.push('irrelevant_pattern')
    return { keywordType: 'irrelevant', topics: [], confidence: 'low', normalizedLabel: null, debugRules: rules }
  }

  // ── 4. Known brand ────────────────────────────────────────────────────────
  if (KNOWN_BRANDS.test(kw)) {
    rules.push('known_brand_match')
    return { keywordType: 'brand', topics: [], confidence: 'high', normalizedLabel: kw, debugRules: rules }
  }

  // ── 5. Informational prefix patterns ─────────────────────────────────────
  if (INFORMATIONAL.test(kw)) {
    rules.push('informational_prefix')
    // Still try to derive topics from the rest
    if (SERVICE_SEO.test(kw))       topics.push('seo')
    if (CHANNEL_GOOGLE_ADS.test(kw)) topics.push('google_ads')
    return {
      keywordType: 'informational',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }

  // ── 6. Marketing channels (platform-specific first, then generic) ─────────
  if (CHANNEL_GOOGLE_ADS.test(kw)) {
    rules.push('channel_google_ads')
    topics.push('google_ads')
    return {
      keywordType: 'marketing_channel',
      topics,
      confidence: 'high',
      normalizedLabel: 'גוגל אדס',
      debugRules: rules,
    }
  }
  if (CHANNEL_FACEBOOK.test(kw)) {
    rules.push('channel_facebook')
    topics.push('facebook_ads')
    return {
      keywordType: 'marketing_channel',
      topics,
      confidence: 'high',
      normalizedLabel: 'פייסבוק אדס',
      debugRules: rules,
    }
  }
  if (CHANNEL_INSTAGRAM.test(kw)) {
    rules.push('channel_instagram')
    topics.push('instagram_ads')
    return {
      keywordType: 'marketing_channel',
      topics,
      confidence: 'high',
      normalizedLabel: 'אינסטגרם אדס',
      debugRules: rules,
    }
  }
  if (CHANNEL_TIKTOK.test(kw)) {
    rules.push('channel_tiktok')
    topics.push('social_media')
    return {
      keywordType: 'marketing_channel',
      topics,
      confidence: 'high',
      normalizedLabel: 'טיקטוק אדס',
      debugRules: rules,
    }
  }
  if (CHANNEL_LINKEDIN.test(kw)) {
    rules.push('channel_linkedin')
    topics.push('social_media')
    return {
      keywordType: 'marketing_channel',
      topics,
      confidence: 'high',
      normalizedLabel: 'לינקדאין אדס',
      debugRules: rules,
    }
  }
  // Generic paid ads — no specific platform found
  if (CHANNEL_PAID_ADS_GENERIC.test(kw) || IS_MARKETING_CHANNEL.test(kw)) {
    // Double-check it's not a service management keyword that just contains "ניהול"
    const isManagementService = /ניהול\s*(מדיה|רשתות|תוכן|עמוד|פרופיל|community)/i.test(kw)
    if (!isManagementService) {
      rules.push('channel_paid_ads_generic')
      topics.push('paid_ads')
      // If it also involves social platforms generically
      if (/סושיאל|social/i.test(kw)) topics.push('social_media')
      return {
        keywordType: 'marketing_channel',
        topics,
        confidence: 'medium',
        normalizedLabel: 'קידום ממומן',
        debugRules: rules,
      }
    }
  }

  // ── 7. Services (before products — services are verb/activity-based) ──────
  if (SERVICE_SEO.test(kw)) {
    rules.push('service_seo')
    topics.push('seo')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: 'קידום אתרים אורגני',
      debugRules: rules,
    }
  }
  if (SERVICE_LOCAL_SEO.test(kw)) {
    rules.push('service_local_seo')
    topics.push('local_seo')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: 'קידום מקומי',
      debugRules: rules,
    }
  }
  if (SERVICE_WEB_DEV.test(kw)) {
    rules.push('service_web_dev')
    topics.push('web_dev')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: 'בניית אתר',
      debugRules: rules,
    }
  }
  if (SERVICE_SOCIAL_MGT.test(kw)) {
    rules.push('service_social_management')
    topics.push('social_media')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: 'ניהול רשתות חברתיות',
      debugRules: rules,
    }
  }
  if (SERVICE_CONTENT.test(kw)) {
    rules.push('service_content')
    topics.push('content_marketing')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: 'שיווק תוכן',
      debugRules: rules,
    }
  }
  if (SERVICE_EMAIL.test(kw)) {
    rules.push('service_email')
    topics.push('email_marketing')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: 'שיווק במייל',
      debugRules: rules,
    }
  }
  if (SERVICE_CLEANING.test(kw)) {
    rules.push('service_cleaning')
    if (/משרד|עסקי|מסחרי/i.test(kw)) topics.push('office_cleaning')
    else if (/בניין|מבנה/i.test(kw)) topics.push('building_cleaning')
    else topics.push('residential_cleaning')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  if (SERVICE_HOME_IMP.test(kw)) {
    rules.push('service_home_improvement')
    topics.push('home_improvement')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  if (SERVICE_FLORIST.test(kw)) {
    rules.push('service_florist')
    topics.push('florist_product')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  if (SERVICE_LEGAL.test(kw)) {
    rules.push('service_legal')
    topics.push('lawyers')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  if (SERVICE_MEDICAL.test(kw)) {
    rules.push('service_medical')
    topics.push('doctors')
    return {
      keywordType: 'service',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  // Generic service catch-all (weaker confidence)
  if (SERVICE_GENERIC.test(kw)) {
    rules.push('service_generic')
    return {
      keywordType: 'service',
      topics: [],
      confidence: 'medium',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }

  // ── 8. Products ───────────────────────────────────────────────────────────
  if (PRODUCT_FASHION.test(kw)) {
    rules.push('product_fashion')
    topics.push('fashion')
    return {
      keywordType: 'product',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  if (PRODUCT_SPORTS.test(kw)) {
    rules.push('product_sports')
    topics.push('sports_product')
    return {
      keywordType: 'product',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  if (PRODUCT_PERFUME.test(kw)) {
    rules.push('product_perfume')
    topics.push('perfume_product')
    return {
      keywordType: 'product',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  if (PRODUCT_APPLIANCE.test(kw)) {
    rules.push('product_appliance')
    return {
      keywordType: 'product',
      topics: [],
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }
  if (PRODUCT_FLOWERS.test(kw)) {
    rules.push('product_flowers')
    topics.push('florist_product')
    return {
      keywordType: 'product',
      topics,
      confidence: 'high',
      normalizedLabel: kw,
      debugRules: rules,
    }
  }

  // ── 9. Fallback: treat as product if it looks commercial ────────────────────
  // Soften the mismatch gate per product decision:
  // "If keyword is understandable and business-relevant, prefer generating questions."
  //
  // Only mark as irrelevant if truly nonsensical. Otherwise, treat as product
  // with medium confidence to allow Keyword Research modal to attempt generation.
  rules.push('fallback_product')

  // Conservative approach: unless clearly junk, assume it could be a product/service.
  // This prevents false positives like "מזרני יוגה" being blocked for sports stores.
  const looksCommercial = kw.length > 2 && wordCount <= 5

  if (looksCommercial) {
    // Treat as product with medium confidence
    // May generate questions if it doesn't conflict with project domain
    return {
      keywordType: 'product',
      topics: [],
      confidence: 'medium',
      normalizedLabel: kw,
      debugRules: rules,
    }
  } else {
    // Only mark truly irrelevant if it's too short, too long, or clearly junk
    return {
      keywordType: 'irrelevant',
      topics: [],
      confidence: 'low',
      normalizedLabel: null,
      debugRules: rules,
    }
  }
}

// ============================================================================
// RELEVANCE CHECK
// ============================================================================

function computeRelevance(
  keywordType: KeywordType,
  keywordTopics: KeywordTopic[],
  projectCategory: BusinessCategory | null | undefined,
  isNewProject: boolean,
): RelevanceResult {
  // Only truly irrelevant keywords (clearly nonsensical) → hard block
  if (keywordType === 'irrelevant') return 'mismatch'

  // No project category — cannot determine relevance, generate conservatively
  if (!projectCategory || projectCategory === 'generic') return 'uncertain'

  // New projects: be lenient — category detection may not be reliable yet
  if (isNewProject) return 'uncertain'

  const projectDomain = CATEGORY_TO_BROAD_DOMAIN[projectCategory] ?? 'generic'
  const keywordDomain = topicsToBroadDomain(keywordTopics, keywordType)

  // Only hard-block on clear, symmetric conflicts.
  // Otherwise, default to 'uncertain' → allow generation with conservative messaging.
  if (areKeywordAndProjectClearlyConflicting(keywordDomain, projectDomain)) return 'mismatch'

  // For products/services without a specific topic, default to 'matched'
  // even if there's some ambiguity. The Keyword Research modal is forgiving by design.
  if (keywordType === 'product' || keywordType === 'service') return 'matched'

  return 'matched'
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Analyze a list of selected keywords and return a structured interpretation
 * for each, including type, topics, relevance to the project, confidence,
 * and a `shouldGenerate` flag.
 *
 * This function is pure and deterministic: no API calls, no randomness,
 * no side effects. Same input always returns same output.
 *
 * @example
 * const results = analyzeSelectedKeywordSignals({
 *   selectedKeywords: ['פרסום באינסטגרם', 'קידום אתרים'],
 *   projectCategory: 'agency',
 *   language: 'he',
 * });
 */
export function analyzeSelectedKeywordSignals(input: KeywordAnalysisInput): KeywordAnalysis[] {
  const {
    selectedKeywords,
    projectCategory,
    language,
    isNewProject = false,
  } = input

  return selectedKeywords
    .filter(kw => kw && kw.trim().length > 0)
    .map(kw => {
      const {
        keywordType,
        topics,
        confidence,
        normalizedLabel,
        debugRules,
      } = classifyKeyword(kw, language)

      const relevance = computeRelevance(
        keywordType,
        topics,
        projectCategory,
        isNewProject,
      )

      // ── Decide shouldGenerate ──────────────────────────────────────────
      // Only generate if:
      //  • keyword type is meaningful (not irrelevant)
      //  • confidence is not low
      //  • not a hard mismatch with the project
      const shouldGenerate =
        keywordType !== 'irrelevant' &&
        confidence !== 'low' &&
        relevance !== 'mismatch'

      // ── Compose reason ────────────────────────────────────────────────
      let reason: string
      if (keywordType === 'irrelevant') {
        reason = 'Keyword does not match any supported business or commercial domain.'
      } else if (confidence === 'low') {
        reason = `Classified as ${keywordType} but confidence is low — too ambiguous to generate reliably.`
      } else if (relevance === 'mismatch') {
        reason = `Keyword topic (${topics.join(', ') || keywordType}) conflicts with project category (${projectCategory}).`
      } else if (relevance === 'uncertain') {
        reason = `Keyword is ${keywordType} (topics: ${topics.join(', ') || 'none'}). Project category uncertain or unrelated — generating conservatively.`
      } else {
        reason = `${keywordType} keyword matched to project (${projectCategory}) in domain. Topics: ${topics.join(', ') || 'none'}.`
      }

      return {
        keyword: kw,
        keywordType,
        topics,
        relevance,
        confidence,
        reason,
        normalizedLabel,
        shouldGenerate,
        debugRules,
      } satisfies KeywordAnalysis
    })
}

/**
 * Convenience: returns true if at least one keyword in a batch should generate questions.
 */
export function batchShouldGenerate(analyses: KeywordAnalysis[]): boolean {
  return analyses.some(a => a.shouldGenerate)
}

/**
 * Convenience: extract all unique KeywordTopics from a batch that should generate.
 */
export function extractGenerableTopics(analyses: KeywordAnalysis[]): KeywordTopic[] {
  const seen = new Set<KeywordTopic>()
  for (const a of analyses) {
    if (a.shouldGenerate) {
      for (const t of a.topics) seen.add(t)
    }
  }
  return [...seen]
}
