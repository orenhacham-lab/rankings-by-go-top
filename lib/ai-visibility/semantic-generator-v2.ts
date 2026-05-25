/**
 * Semantic Question Generator v2
 *
 * Core principle: Understand entity first, then simulate realistic human search behavior.
 * NOT template-combinatorial, but behavior-driven.
 *
 * Flow:
 * 1. comprehendEntity() - identify entity type & characteristics
 * 2. inferRealUserNeeds() - what would real humans search?
 * 3. phraseNaturalHebrewQuestion() - create natural Hebrew query
 * 4. validateHumanSearchQuery() - check semantic realism
 * 5. return only validated questions (might be 2, 3, 4, etc. — no quota)
 */

import type { PromptIntent, BusinessCategory, PromptSuggestion } from './prompt-templates'
import { detectCategory, getConfidenceTier, generateSignalChips, generateValueReason } from './prompt-templates'

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
  naturalPhrase: string // e.g., "cost", "reliability", "local availability"
  likelihood: 'high' | 'medium' | 'low'
}

// ============================================================================
// 1. COMPREHEND ENTITY
// ============================================================================

function comprehendEntity(keyword: string, businessName: string | null, businessCategory: BusinessCategory): EntityProfile {
  const kwLower = keyword.toLowerCase()
  const bnLower = (businessName || '').toLowerCase()

  // Entity type detection
  let entityType: EntityProfile['entityType'] = 'product'

  // Heuristics for entity type classification
  const isBrandKeyword = keyword.length > 2 && /^[A-Z]|[א-ת]{2,}$/.test(keyword)
  const isAbstractService = /שירות|service|platform|tool|software|app/i.test(kwLower)
  const isTopical = /איך|how to|עצות|טיפים|דרך|שיטה|תרגול/i.test(kwLower)
  const isComparison = /vs|אלו|which|איזה|מה ההבדל|comparison/i.test(kwLower)

  // SERVICE-LIKE categories should be treated as service_category
  const SERVICE_LIKE = ['local_service', 'cleaning', 'home_improvement_service', 'healthcare', 'legal', 'beauty', 'fitness', 'restaurant', 'florist']
  const isServiceCategory = SERVICE_LIKE.includes(businessCategory)

  if (isServiceCategory || isAbstractService) {
    entityType = 'service_category'
  } else if (isBrandKeyword) {
    entityType = 'brand'
  } else if (isTopical) {
    entityType = 'topic'
  } else if (/platform|tool|software|app|saas/i.test(businessCategory)) {
    entityType = 'platform'
  }

  // Determine what people actually search about this entity
  const isPriceRelevant = ['ecommerce', 'perfume', 'sports_store', 'appliance_store', 'gift', 'restaurant'].includes(businessCategory) ||
                          /מחיר|price|עלות|cost|כמה|how much|expenses/i.test(kwLower)

  const isReviewRelevant = true // people review almost everything

  const isComparisonRelevant = !isServiceCategory && (businessCategory === 'product_brand' || businessCategory === 'saas')

  const isLocalRelevant = isServiceCategory || /מקומי|local|בקרבת|near|עיר|city/i.test(kwLower)

  const hasLocation = /ב|in|near|close|קרוב|עיר|city|location/i.test(kwLower)

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

function inferRealUserNeeds(entity: EntityProfile, city: string | null): UserNeed[] {
  const needs: UserNeed[] = []
  const { entityType, businessCategory } = entity

  // Service category: users search for provider selection, pricing, reviews, local availability
  if (entityType === 'service_category') {
    // Provider recommendation is ALWAYS high-likelihood for services
    needs.push({
      intent: 'recommendation',
      behavior: 'provider_selection',
      naturalPhrase: 'provider recommendation',
      likelihood: 'high',
    })

    // Local availability is high if city is available
    if (city) {
      needs.push({
        intent: 'local',
        behavior: 'local_availability',
        naturalPhrase: `availability in ${city}`,
        likelihood: 'high',
      })
    }

    // Reviews and pricing are always natural
    needs.push({
      intent: 'pre_purchase',
      behavior: 'quality_assurance',
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
  // Product or brand: users search for specifications, reviews, alternatives, pricing
  else if (entityType === 'product' || entityType === 'brand') {
    // Reviews are universal
    needs.push({
      intent: 'pre_purchase',
      behavior: 'quality_assurance',
      naturalPhrase: 'reviews and feedback',
      likelihood: 'high',
    })

    // Price for products/brands
    if (entity.isPriceRelevant) {
      needs.push({
        intent: 'commercial',
        behavior: 'price_discovery',
        naturalPhrase: 'pricing and cost',
        likelihood: 'high',
      })
    }

    // Comparison for products that have real alternatives
    if (entity.isComparisonRelevant) {
      needs.push({
        intent: 'comparison',
        behavior: 'alternative_evaluation',
        naturalPhrase: 'comparison to alternatives',
        likelihood: 'medium',
      })
    }
  }
  // Platform/SaaS: users search for pricing, integrations, alternatives, use cases
  else if (entityType === 'platform') {
    needs.push({
      intent: 'commercial',
      behavior: 'pricing_plans',
      naturalPhrase: 'pricing and plans',
      likelihood: 'high',
    })

    needs.push({
      intent: 'pre_purchase',
      behavior: 'feature_discovery',
      naturalPhrase: 'features and capabilities',
      likelihood: 'high',
    })

    needs.push({
      intent: 'comparison',
      behavior: 'alternative_evaluation',
      naturalPhrase: 'comparison to competitors',
      likelihood: 'medium',
    })
  }
  // Topic: users search for how-to, explanations, best practices
  else if (entityType === 'topic') {
    needs.push({
      intent: 'informational',
      behavior: 'explanation',
      naturalPhrase: 'how and best practices',
      likelihood: 'high',
    })
  }

  // Filter duplicates and sort by likelihood
  const seen = new Set<string>()
  const unique = needs.filter((n) => {
    if (seen.has(n.intent)) return false
    seen.add(n.intent)
    return true
  })

  return unique.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.likelihood] - order[b.likelihood]
  })
}

// ============================================================================
// 3. PHRASE NATURAL HEBREW QUESTION
// ============================================================================

function phraseNaturalHebrewQuestion(
  need: UserNeed,
  entity: EntityProfile,
  city: string | null,
  language: string
): string | null {
  const { keyword, entityType, businessCategory } = entity
  const isHebrew = language === 'he'

  if (!isHebrew) {
    return phraseNaturalEnglishQuestion(need, entity, city)
  }

  // Price discovery
  if (need.behavior === 'price_discovery') {
    // For services: "כמה עולה שירות ניקיון?"
    // For products: "כמה עולה iPhone?"
    if (entityType === 'service_category') {
      return `כמה עולה ${keyword}?`
    } else if (entityType === 'product' || entityType === 'brand') {
      return `כמה עולה ${keyword}?`
    }
  }

  // Provider recommendation (ONLY for services)
  if (need.behavior === 'provider_selection') {
    if (entityType === 'service_category') {
      if (city) {
        return `איזה ספק מומלץ ל${keyword} ב${city}?`
      } else {
        return `איזה ספק מומלץ ל${keyword}?`
      }
    }
  }

  // Local availability
  if (need.behavior === 'local_availability') {
    if (city) {
      return `איפה אפשר למצוא ${keyword} ב${city}?`
    }
  }

  // Quality assurance / reviews
  if (need.behavior === 'quality_assurance') {
    if (entityType === 'service_category') {
      return `מה צריך לבדוק בעת בחירת ${keyword}?`
    } else if (entityType === 'product' || entityType === 'brand') {
      return `מה דעות על ${keyword}?`
    }
  }

  // Feature discovery (for platforms)
  if (need.behavior === 'feature_discovery') {
    return `מה היכולות של ${keyword}?`
  }

  // Pricing plans (for platforms)
  if (need.behavior === 'pricing_plans') {
    return `כמה עולה ${keyword}?`
  }

  // Alternative evaluation
  if (need.behavior === 'alternative_evaluation') {
    if (entityType === 'product' || entityType === 'brand') {
      return `מה חלופות טובות ל${keyword}?`
    } else if (entityType === 'platform') {
      return `מה חלופות ל${keyword}?`
    }
  }

  // Explanation / how-to
  if (need.behavior === 'explanation') {
    return `איך משתמשים ב${keyword}?`
  }

  return null
}

function phraseNaturalEnglishQuestion(
  need: UserNeed,
  entity: EntityProfile,
  city: string | null
): string | null {
  const { keyword, entityType } = entity

  if (need.behavior === 'price_discovery') {
    return `How much does ${keyword} cost?`
  }

  if (need.behavior === 'provider_selection') {
    if (city) {
      return `Best providers for ${keyword} in ${city}`
    } else {
      return `Best providers for ${keyword}`
    }
  }

  if (need.behavior === 'local_availability') {
    if (city) {
      return `Where to find ${keyword} in ${city}`
    }
  }

  if (need.behavior === 'quality_assurance') {
    if (entityType === 'service_category') {
      return `What to look for when choosing ${keyword}`
    } else {
      return `Reviews of ${keyword}`
    }
  }

  if (need.behavior === 'feature_discovery') {
    return `Features of ${keyword}`
  }

  if (need.behavior === 'pricing_plans') {
    return `${keyword} pricing`
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
// 4. VALIDATE HUMAN SEARCH QUERY
// ============================================================================

function validateHumanSearchQuery(
  question: string,
  entity: EntityProfile,
  language: string
): { isValid: boolean; score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 100

  // Hebrew-specific validation
  if (language === 'he') {
    // Check for naturalness markers

    // Template patterns that sound AI-generated
    const aiPatterns = [
      /או חלופות אחרות/,
      /בבחירת [^?]+\?/,
      /איך לבחור/,
      /מי המומלץ/,
      /מה הטוב ביותר/,
      /מה ה\w+\s+שלם/,
    ]

    for (const pattern of aiPatterns) {
      if (pattern.test(question)) {
        reasons.push('generic_template_pattern')
        score -= 15
        break
      }
    }

    // Check for awkward phrasing
    if (/\s{2,}/.test(question)) {
      reasons.push('double_spaces')
      score -= 5
    }

    if (question.length < 5) {
      reasons.push('too_short')
      score -= 20
    }

    if (question.length > 120) {
      reasons.push('too_long')
      score -= 10
    }
  }

  // English-specific validation
  if (language === 'en') {
    if (question.length < 5) {
      reasons.push('too_short')
      score -= 20
    }

    if (question.length > 100) {
      reasons.push('too_long')
      score -= 10
    }
  }

  // Universal: check if question actually relates to the entity
  const kwLower = entity.keyword.toLowerCase()
  if (!question.toLowerCase().includes(kwLower)) {
    reasons.push('entity_not_referenced')
    score -= 20
  }

  // Universal: no unfinished constructions
  if (question.endsWith(' ') || question.endsWith('-')) {
    reasons.push('unfinished_construction')
    score -= 25
  }

  const isValid = score >= 70
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
}

export function generateHumanLikeSmartQuestions(ctx: GeneratorContext): GeneratedQuestion[] {
  const { keyword, businessName, city, businessCategory, language } = ctx

  const questions: GeneratedQuestion[] = []

  // Step 1: Understand the entity
  const entity = comprehendEntity(keyword, businessName, businessCategory)

  // Step 2: Infer realistic user needs
  const needs = inferRealUserNeeds(entity, city)

  // Step 3 & 4: Generate and validate questions
  for (const need of needs) {
    // Generate natural phrasing
    const phrase = language === 'he'
      ? phraseNaturalHebrewQuestion(need, entity, city, language)
      : phraseNaturalEnglishQuestion(need, entity, city)

    if (!phrase) continue

    // Validate semantic realism
    const validation = validateHumanSearchQuery(phrase, entity, language)

    if (!validation.isValid) {
      // Skip questions that fail validation
      continue
    }

    // Calculate final score: base intent score + validation bonus
    const baseScore = need.likelihood === 'high' ? 85 : need.likelihood === 'medium' ? 70 : 55
    const finalScore = baseScore + (validation.score - 100) * 0.5 // validation can add/subtract

    questions.push({
      prompt: phrase,
      intent: need.intent,
      score: Math.max(40, Math.min(100, finalScore)),
      validation,
    })
  }

  // Return only questions that passed validation (no forced quota)
  return questions.sort((a, b) => b.score - a.score)
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
