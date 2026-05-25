/**
 * Semantic Question Generator v2
 *
 * Core principle: Understand entity first, then simulate realistic human search behavior.
 * NOT template-combinatorial, but behavior-driven.
 *
 * Flow:
 * 1. comprehendEntity() - identify entity type & characteristics
 * 2. inferRealUserNeeds() - what would real humans search?
 * 3. phraseNaturalHebrewQuestion() - create natural Hebrew query (or null if can't)
 * 4. validateHumanSearchQuery() - strict semantic + Hebrew naturalness validation
 * 5. return only validated questions (might be 0, 2, 3, etc. — no quota)
 */

import type { PromptIntent, BusinessCategory, PromptSuggestion } from './prompt-templates'
import { getConfidenceTier, generateSignalChips, generateValueReason } from './prompt-templates'
import { classifyKeywordMode, type KeywordMode, type KeywordClassification } from './keyword-classifier'

// ============================================================================
// ENTITY UNDERSTANDING
// ============================================================================

interface EntityProfile {
  keyword: string
  entityType: 'company' | 'brand' | 'product' | 'service_category' | 'platform' | 'topic'
  businessCategory: BusinessCategory
  businessName: string
  hasLocation: boolean
  isPriceRelevant: boolean
  isReviewRelevant: boolean
  isComparisonRelevant: boolean
  isLocalRelevant: boolean
}

interface UserNeed {
  intent: PromptIntent
  behavior: string // e.g., "price_discovery", "quality_assurance", "provider_selection"
  naturalPhrase: string // human-readable description of what they're looking for
  likelihood: 'high' | 'medium' | 'low'
}

// ============================================================================
// 1. COMPREHEND ENTITY
// ============================================================================

function comprehendEntity(keyword: string, businessName: string | null, businessCategory: BusinessCategory): EntityProfile {
  const kwLower = keyword.toLowerCase()

  // Entity type detection
  let entityType: EntityProfile['entityType'] = 'product'

  const isAbstractService = /שירות|service|platform|tool|software|app/i.test(kwLower)
  const isTopical = /איך|how to|עצות|טיפים|דרך|שיטה|תרגול/i.test(kwLower)

  // SERVICE-LIKE categories (where users search for providers, not products)
  // NOTE: florist is mixed — "משלוח פרחים" is a service, but "זר ורדים" is a product.
  // We detect this from the keyword itself, not from the category alone.
  const PURE_SERVICE = ['local_service', 'cleaning', 'home_improvement_service', 'healthcare', 'legal', 'fitness', 'agency']
  const MIXED_CATEGORIES = ['florist', 'beauty', 'restaurant'] // can be product OR service depending on keyword

  // Service indicators in the keyword take PRIORITY over product indicators.
  // "משלוח מתנה" → service (it's about the delivery), not product.
  // "התקנת מזגן" → service, not product.
  const isServiceKeyword = /(משלוח|התקנה|שיפוץ|תיקון|ניקיון|ייעוץ|delivery|installation|service|consultation|repair)/i.test(kwLower)

  // Product indicators in the keyword (for mixed categories like florist)
  const isProductKeyword = /(זר|זרים|מתנה|מתנות|בקבוק|חבילה|פריט|תיק|נעלי|טבעת|שעון|gift|bouquet|item|package)/i.test(kwLower)

  const isPureService = PURE_SERVICE.includes(businessCategory)
  const isMixed = MIXED_CATEGORIES.includes(businessCategory)

  if (isPureService || isAbstractService) {
    entityType = 'service_category'
  } else if (isServiceKeyword) {
    // Service keyword wins regardless of category
    entityType = 'service_category'
  } else if (isMixed && !isProductKeyword) {
    // Mixed category without explicit product indicator → service
    entityType = 'service_category'
  } else if (isTopical) {
    entityType = 'topic'
  } else if (businessCategory === 'saas') {
    entityType = 'platform'
  } else if (businessCategory === 'product_brand') {
    entityType = 'brand'
  }

  // Determine what people actually search about this entity
  const isPriceRelevant = ['ecommerce', 'perfume', 'sports_store', 'appliance_store', 'gifts', 'restaurant', 'florist'].includes(businessCategory) ||
                          /מחיר|price|עלות|cost|כמה|how much/i.test(kwLower)

  const isReviewRelevant = true // people review almost everything

  const isComparisonRelevant = entityType !== 'service_category' && (businessCategory === 'product_brand' || businessCategory === 'saas')

  const isLocalRelevant = entityType === 'service_category' || /מקומי|local|בקרבת|near|ב.*עיר|in.*city/i.test(kwLower)

  const hasLocation = /\bב[א-ת]+\s*$|בעיר|in city|local/i.test(kwLower)

  return {
    keyword,
    entityType,
    businessCategory,
    businessName: businessName || '',
    hasLocation,
    isPriceRelevant,
    isReviewRelevant,
    isComparisonRelevant,
    isLocalRelevant,
  }
}

// ============================================================================
// 2. INFER REAL USER NEEDS
// ============================================================================

function inferRealUserNeeds(
  entity: EntityProfile,
  city: string | null,
  allowedIntents?: Set<string>
): UserNeed[] {
  const needs: UserNeed[] = []
  const { entityType } = entity

  // Service category: users search for provider selection, pricing, reviews, local availability
  if (entityType === 'service_category') {
    needs.push({
      intent: 'recommendation',
      behavior: 'provider_selection',
      naturalPhrase: 'provider recommendation',
      likelihood: 'high',
    })

    if (city) {
      needs.push({
        intent: 'local',
        behavior: 'local_availability',
        naturalPhrase: `availability in ${city}`,
        likelihood: 'high',
      })
    }

    needs.push({
      intent: 'pre_purchase',
      behavior: 'quality_assurance_service',
      naturalPhrase: 'quality and reliability factors',
      likelihood: 'high',
    })

    if (entity.isPriceRelevant) {
      needs.push({
        intent: 'commercial',
        behavior: 'price_discovery',
        naturalPhrase: 'pricing',
        likelihood: 'high',
      })
    }
  }
  // Product or brand: users search for reviews, alternatives, pricing.
  // NOTE: We deliberately do NOT include "איזה X מומלץ?" because Hebrew
  // grammatical agreement (singular/plural, masc/fem) is too fragile.
  // The curated bank handles product recommendation via category-specific
  // phrasings ("איזה בושם מומלץ לאישה?") with correct grammar.
  else if (entityType === 'product' || entityType === 'brand') {
    // Reviews ("חוות דעת על X") — always grammatically safe
    needs.push({
      intent: 'pre_purchase',
      behavior: 'product_reviews',
      naturalPhrase: 'reviews and feedback',
      likelihood: 'high',
    })

    if (entity.isPriceRelevant) {
      needs.push({
        intent: 'commercial',
        behavior: 'price_discovery',
        naturalPhrase: 'pricing and cost',
        likelihood: 'high',
      })
    }

    if (entity.isComparisonRelevant) {
      needs.push({
        intent: 'comparison',
        behavior: 'alternative_evaluation',
        naturalPhrase: 'comparison to alternatives',
        likelihood: 'medium',
      })
    }
  }
  // Platform/SaaS
  else if (entityType === 'platform') {
    needs.push({
      intent: 'commercial',
      behavior: 'pricing_plans',
      naturalPhrase: 'pricing and plans',
      likelihood: 'high',
    })

    needs.push({
      intent: 'comparison',
      behavior: 'alternative_evaluation',
      naturalPhrase: 'comparison to competitors',
      likelihood: 'medium',
    })
  }
  // Topic
  else if (entityType === 'topic') {
    needs.push({
      intent: 'informational',
      behavior: 'explanation',
      naturalPhrase: 'how and best practices',
      likelihood: 'high',
    })
  }

  // Filter by allowed intents (from keyword classification)
  let filtered = needs
  if (allowedIntents && allowedIntents.size > 0) {
    filtered = needs.filter((n) => allowedIntents.has(n.intent))
  }

  // Sort by likelihood
  return filtered.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.likelihood] - order[b.likelihood]
  })
}

// ============================================================================
// 3. PHRASE NATURAL HEBREW QUESTION
// ============================================================================

/**
 * Generate a natural Hebrew question for a given user need + entity.
 * Returns null if no natural phrasing is possible (do NOT force).
 *
 * Uses ONLY phrasings that sound like real Israeli searches:
 * - "כמה עולה X?" — price (universal)
 * - "חוות דעת על X" — reviews (universal, natural)
 * - "איזה X מומלץ?" — product recommendation (natural)
 * - "האם X מומלץ?" — yes/no recommendation (natural)
 * - "איזה ספק מומלץ ל-X" — service provider (services only)
 * - "מה חשוב לבדוק לפני X" — quality checks (services)
 * - "אילו חלופות יש ל-X" — alternatives
 *
 * BANNED phrasings (sound like AI/translation):
 * - "מה דעות על X" (literal translation from English "what are opinions about")
 * - "איזה דעות על X"
 * - "מה הדעה על X" (unless X is a specific brand name)
 * - "מה היכולות של X" (corporate/AI-sounding)
 * - "מה חלופות טובות ל-X" (awkward, "טובות" feels forced)
 */
/**
 * Check if keyword contains a city or location reference.
 * Used to avoid adding city twice (e.g., "ברמת גן ברמת גן").
 */
function keywordContainsCity(keyword: string, city: string | null): boolean {
  if (!city) return false
  return keyword.toLowerCase().includes(city.toLowerCase())
}

/**
 * Smart connector for Hebrew "ל" prefix.
 * - "ל" + Hebrew word: "לקידום"
 * - "ל-" + English word: "ל-Go Top" (with hyphen for readability)
 */
function connectorL(word: string): string {
  const firstChar = word.trim().charAt(0)
  // English / Latin character: add hyphen
  if (/[a-zA-Z]/.test(firstChar)) {
    return `ל-${word}`
  }
  return `ל${word}`
}

/**
 * Smart connector for Hebrew "ב" prefix (same logic).
 */
function connectorB(word: string): string {
  const firstChar = word.trim().charAt(0)
  if (/[a-zA-Z]/.test(firstChar)) {
    return `ב-${word}`
  }
  return `ב${word}`
}

/**
 * Check if keyword IS the business name (entity searching for itself doesn't make sense).
 */
function isKeywordBusinessName(keyword: string, businessName: string): boolean {
  if (!businessName) return false
  const kwNorm = keyword.trim().toLowerCase()
  const bnNorm = businessName.trim().toLowerCase()
  return kwNorm === bnNorm || kwNorm.includes(bnNorm) || bnNorm.includes(kwNorm)
}

function phraseNaturalHebrewQuestion(
  need: UserNeed,
  entity: EntityProfile,
  city: string | null
): string | null {
  const { keyword, entityType, businessName } = entity

  // CRITICAL: If keyword IS the business name, don't generate questions about
  // it as a "category". The business name should appear in curated bank questions,
  // not in generic keyword-based templates.
  if (isKeywordBusinessName(keyword, businessName)) {
    return null
  }

  const cleanKw = keyword.trim()
  const cityInKw = keywordContainsCity(cleanKw, city)

  // PRICE — universal natural phrasing
  if (need.behavior === 'price_discovery' || need.behavior === 'pricing_plans') {
    return `כמה עולה ${cleanKw}?`
  }

  // PROVIDER SELECTION — services only
  if (need.behavior === 'provider_selection') {
    if (entityType !== 'service_category') return null

    const lKw = connectorL(cleanKw)
    // Don't add city if it's already in the keyword
    if (city && !cityInKw) {
      return `איזה ספק מומלץ ${lKw} ב${city}?`
    }
    return `איזה ספק מומלץ ${lKw}?`
  }

  // PRODUCT REVIEWS — "חוות דעת על X" (natural, never "מה דעות על")
  if (need.behavior === 'product_reviews') {
    if (entityType !== 'product' && entityType !== 'brand') return null
    return `חוות דעת על ${cleanKw}`
  }

  // LOCAL AVAILABILITY — only if city is set AND not already in keyword
  if (need.behavior === 'local_availability') {
    if (!city || cityInKw) return null
    return `איפה כדאי לקבל ${cleanKw} ב${city}?`
  }

  // QUALITY ASSURANCE FOR SERVICES
  if (need.behavior === 'quality_assurance_service') {
    if (entityType !== 'service_category') return null
    return `מה חשוב לבדוק לפני בחירת ${cleanKw}?`
  }

  // ALTERNATIVE EVALUATION
  if (need.behavior === 'alternative_evaluation') {
    if (entityType !== 'product' && entityType !== 'brand' && entityType !== 'platform') return null
    const lKw = connectorL(cleanKw)
    return `אילו חלופות יש ${lKw}?`
  }

  // EXPLANATION / HOW-TO
  if (need.behavior === 'explanation') {
    const bKw = connectorB(cleanKw)
    return `איך משתמשים ${bKw}?`
  }

  return null
}

function phraseNaturalEnglishQuestion(
  need: UserNeed,
  entity: EntityProfile,
  city: string | null
): string | null {
  const { keyword, entityType } = entity

  if (need.behavior === 'price_discovery' || need.behavior === 'pricing_plans') {
    return `How much does ${keyword} cost?`
  }

  if (need.behavior === 'provider_selection') {
    if (entityType === 'service_category') {
      if (city) return `Best providers for ${keyword} in ${city}`
      return `Best providers for ${keyword}`
    }
    return null
  }

  if (need.behavior === 'product_recommendation') {
    if (entityType === 'product' || entityType === 'brand') {
      return `Which ${keyword} is recommended?`
    }
    return null
  }

  if (need.behavior === 'product_reviews') {
    if (entityType === 'product' || entityType === 'brand') {
      return `Reviews of ${keyword}`
    }
    return null
  }

  if (need.behavior === 'local_availability') {
    if (city) return `Where to find ${keyword} in ${city}`
    return null
  }

  if (need.behavior === 'quality_assurance_service') {
    if (entityType === 'service_category') {
      return `What to look for when choosing ${keyword}`
    }
    return null
  }

  if (need.behavior === 'alternative_evaluation') {
    return `Best alternatives to ${keyword}`
  }

  if (need.behavior === 'explanation') {
    return `How to use ${keyword}`
  }

  return null
}

// ============================================================================
// 4. VALIDATE HUMAN SEARCH QUERY (STRICT)
// ============================================================================

/**
 * Strict validation: any question failing ANY check is rejected.
 * No "partial credit" - either it sounds like a real search or it doesn't.
 *
 * This validator is exported for use by v1 fallback path too.
 * Same standards apply to both v2 and v1 candidates.
 */
export function validateHumanSearchQuery(
  question: string,
  keyword: string,
  language: string
): { isValid: boolean; score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 100

  // Universal: empty or near-empty
  if (!question || question.trim().length < 5) {
    reasons.push('too_short')
    return { isValid: false, score: 0, reasons }
  }

  if (question.length > 120) {
    reasons.push('too_long')
    score -= 20
  }

  // Universal: unfinished phrasing
  if (/\s[ולבכמ]\s*$/u.test(question) || question.endsWith('-') || question.endsWith(' ')) {
    reasons.push('unfinished_construction')
    return { isValid: false, score: 0, reasons: ['unfinished_construction'] }
  }

  // Universal: keyword must appear
  if (!question.toLowerCase().includes(keyword.toLowerCase())) {
    reasons.push('entity_not_referenced')
    return { isValid: false, score: 0, reasons: ['entity_not_referenced'] }
  }

  // Universal: double spaces / formatting
  if (/\s{2,}/.test(question)) {
    reasons.push('double_spaces')
    score -= 10
  }

  // Hebrew-specific naturalness checks
  if (language === 'he') {
    // BANNED phrasings — these sound like AI translations or unnatural Hebrew

    // "מה דעות על X" - literal translation from English, sounds wrong
    if (/מה\s+דעות\s+על/.test(question)) {
      reasons.push('unnatural_phrasing: "מה דעות על" (use "חוות דעת על" instead)')
      return { isValid: false, score: 0, reasons }
    }

    // "איזה דעות על X" - same problem
    if (/איזה\s+דעות\s+על/.test(question)) {
      reasons.push('unnatural_phrasing: "איזה דעות על"')
      return { isValid: false, score: 0, reasons }
    }

    // "מה הדעה על" - awkward for generic products
    if (/מה\s+הדעה\s+על/.test(question)) {
      reasons.push('unnatural_phrasing: "מה הדעה על"')
      return { isValid: false, score: 0, reasons }
    }

    // "מה היכולות של" - corporate/AI-sounding, real users don't ask this
    if (/מה\s+היכולות\s+של/.test(question)) {
      reasons.push('unnatural_phrasing: "מה היכולות של"')
      return { isValid: false, score: 0, reasons }
    }

    // "מה חלופות טובות ל" - awkward construction; "טובות" feels forced
    if (/מה\s+חלופות\s+טובות\s+ל/.test(question)) {
      reasons.push('unnatural_phrasing: "מה חלופות טובות ל"')
      return { isValid: false, score: 0, reasons }
    }

    // "מי מומלץ עבור" - vague, sounds AI-generated
    if (/מי\s+מומלץ\s+עבור/.test(question)) {
      reasons.push('unnatural_phrasing: "מי מומלץ עבור"')
      return { isValid: false, score: 0, reasons }
    }

    // "מה עדיף X או חלופות אחרות" - abstract comparison
    if (/או\s+חלופות\s+אחרות/.test(question)) {
      reasons.push('unnatural_phrasing: "או חלופות אחרות"')
      return { isValid: false, score: 0, reasons }
    }

    // "איך לבחור ספק ל" - overlaps awkwardly with other templates
    if (/איך\s+לבחור\s+ספק\s+ל/.test(question)) {
      reasons.push('unnatural_phrasing: "איך לבחור ספק ל"')
      return { isValid: false, score: 0, reasons }
    }

    // Generic abstract comparison
    if (/מה\s+עדיף\s+[^?]+\s+או\s+/.test(question)) {
      reasons.push('unnatural_phrasing: abstract comparison')
      return { isValid: false, score: 0, reasons }
    }

    // Check minimum Hebrew character density
    const hebrewChars = (question.match(/[א-ת]/g) || []).length
    const totalChars = question.replace(/\s/g, '').length
    if (totalChars > 5 && hebrewChars / totalChars < 0.3) {
      reasons.push('insufficient_hebrew')
      score -= 30
    }
  }

  // English-specific
  if (language === 'en') {
    // BANNED: AI-sounding patterns
    if (/^what is the difference between/i.test(question) && !/[A-Z][a-z]+\s+(vs|versus)\s+[A-Z][a-z]+/i.test(question)) {
      reasons.push('unnatural_phrasing: abstract difference')
      return { isValid: false, score: 0, reasons }
    }
  }

  const isValid = score >= 80
  return { isValid, score, reasons }
}

// ============================================================================
// 5. MAIN GENERATOR
// ============================================================================

export interface GeneratorContext {
  keyword: string
  businessName: string | null
  city: string | null
  businessCategory: BusinessCategory
  language: string
}

export interface GeneratedQuestion {
  prompt: string
  intent: PromptIntent
  score: number
  validation: {
    isValid: boolean
    score: number
    reasons: string[]
  }
  debug?: {
    entityType: string
    behavior: string
    likelihood: string
  }
}

export interface GenerationResult {
  questions: GeneratedQuestion[]
  rejected: Array<{ prompt: string; reasons: string[] }>
  entityProfile: EntityProfile
  classification?: KeywordClassification
}

export function generateHumanLikeSmartQuestions(ctx: GeneratorContext): GeneratedQuestion[] {
  const result = generateHumanLikeSmartQuestionsDebug(ctx)
  return result.questions
}

/**
 * Debug version: returns both generated and rejected questions for inspection.
 */
export function generateHumanLikeSmartQuestionsDebug(ctx: GeneratorContext): GenerationResult {
  const { keyword, businessName, city, businessCategory, language } = ctx

  const questions: GeneratedQuestion[] = []
  const rejected: Array<{ prompt: string; reasons: string[] }> = []

  // Step 0: Classify keyword mode
  const classification = classifyKeywordMode(keyword, businessName, businessCategory)

  // If this is a complete query, skip generation entirely
  if (classification.shouldSkip) {
    return {
      questions: [],
      rejected: [],
      entityProfile: {} as EntityProfile,
      classification,
    }
  }

  // Step 1: Understand the entity
  const entity = comprehendEntity(keyword, businessName, businessCategory)

  // Step 2: Infer realistic user needs
  const needs = inferRealUserNeeds(entity, city, classification.allowedIntents)

  // Step 3 & 4: Generate and validate questions
  for (const need of needs) {
    // Generate natural phrasing
    const phrase = language === 'he'
      ? phraseNaturalHebrewQuestion(need, entity, city)
      : phraseNaturalEnglishQuestion(need, entity, city)

    if (!phrase) {
      // Couldn't phrase naturally - skip silently (this is OK, not an error)
      continue
    }

    // Validate semantic realism
    const validation = validateHumanSearchQuery(phrase, keyword, language)

    if (!validation.isValid) {
      rejected.push({ prompt: phrase, reasons: validation.reasons })
      continue
    }

    // Calculate final score
    const baseScore = need.likelihood === 'high' ? 85 : need.likelihood === 'medium' ? 72 : 60
    const finalScore = Math.min(100, baseScore + (validation.score - 80) * 0.3)

    questions.push({
      prompt: phrase,
      intent: need.intent,
      score: finalScore,
      validation,
      debug: {
        entityType: entity.entityType,
        behavior: need.behavior,
        likelihood: need.likelihood,
      },
    })
  }

  return {
    questions: questions.sort((a, b) => b.score - a.score),
    rejected,
    entityProfile: entity,
    classification,
  }
}

// ============================================================================
// UTILITY: Convert v2 questions to PromptSuggestion format for UI compatibility
// ============================================================================

export function convertToPromptSuggestions(
  v2Questions: GeneratedQuestion[],
  businessName: string | null,
  language: string
): Partial<PromptSuggestion>[] {
  const suggestions: Partial<PromptSuggestion>[] = []

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

  const intentLabels = language === 'he' ? HE_INTENT_LABEL : EN_INTENT_LABEL

  for (const q of v2Questions) {
    const tier = getConfidenceTier(q.score)
    const chips = generateSignalChips(q.prompt, q.intent, q.score, language as 'he' | 'en', false)
    const valueReason = generateValueReason(q.intent, q.score, q.prompt, language as 'he' | 'en', false)

    suggestions.push({
      prompt: q.prompt,
      intent: q.intent,
      intentLabel: intentLabels[q.intent],
      language,
      qualityScore: q.score,
      confidenceTier: tier,
      reason: `[v2] Semantic understanding of entity behavior`,
      chips,
      valueReason,
    })
  }

  return suggestions
}
