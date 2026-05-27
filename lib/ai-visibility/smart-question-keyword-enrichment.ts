/**
 * Smart Question Keyword Enrichment — Isolated Helper
 *
 * Generates additional high-quality question candidates based on project keywords,
 * designed as a potential enrichment layer for Smart Questions vNext.
 *
 * This helper:
 * - Analyzes project keywords as relevance signals (not wrapped)
 * - Generates focused candidate questions via keyword-research-question-generator
 * - Deduplicates against existing Smart Questions
 * - Applies strict quality filters
 * - Caps output at 3 candidates
 *
 * DOES NOT:
 * - Modify Smart Questions vNext
 * - Touch UI or database
 * - Affect current production behavior
 * - Use project-specific exceptions or brand names in logic
 *
 * Used only for testing/simulation until explicitly integrated into UI.
 */

import { analyzeSelectedKeywordSignals } from './keyword-analysis'
import { generateKeywordResearchQuestions } from './keyword-research-question-generator'
import type { PromptSuggestion } from './prompt-templates'
import type { BusinessCategory, PromptIntent } from './prompt-templates'
import type { KeywordType, KeywordTopic } from './keyword-analysis'

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface EnrichmentCandidate {
  question: string
  sourceKeyword: string
  sourceType: KeywordType
  topic: KeywordTopic | null
  intent: PromptIntent
  intentLabel: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface EnrichmentDebug {
  inputKeywordsCount: number
  analyzedKeywordsCount: number
  generableKeywordsCount: number
  rejectedByConfidence: number
  rejectedByMismatch: number
  rejectedByDuplicate: number
  rejectedByQuality: number
  rejectedByTopicIntent: number
  rejectedByCapExceeded: number
  finalCount: number
  dynamicLimit: number
  intendedPlacement: 'refresh_only'
  details: string[]
}

export interface EnrichmentResult {
  candidates: EnrichmentCandidate[]
  debug: EnrichmentDebug
}

// ============================================================================
// HELPERS
// ============================================================================

/** Normalize prompt for dedup comparison — must match PromptSuggestions logic */
function normalizePrompt(p: string): string {
  return p
    .toLowerCase()
    .replace(/[?!.,;:'"״׳`\-–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Map intent from keyword research to Smart Questions intent */
function mapIntentType(krType: string): PromptIntent {
  switch (krType) {
    case 'price':
      return 'transactional'
    case 'recommendation':
      return 'pre_purchase'
    case 'comparison':
      return 'comparison'
    case 'info':
    default:
      return 'informational'
  }
}

/** Normalize intent for dedup purposes: treat commercial/transactional as equivalent */
function normalizeIntentForDedupe(intent: PromptIntent): string {
  switch (intent) {
    case 'commercial':
    case 'transactional':
      return 'commercial_or_transactional'
    case 'pre_purchase':
    case 'recommendation':
      return intent
    case 'comparison':
    case 'informational':
    case 'brand':
      return intent
    case 'local':
    case 'alternatives':
    case 'gift':
      return intent
    default:
      return intent
  }
}

/**
 * Extract stable business nouns / product/service roots from text for dedup.
 * Conservative approach: only extract known entity patterns.
 */
function extractDedupeEntities(text: string, language: 'he' | 'en'): string[] {
  const entities: string[] = []
  const normalized = normalizePrompt(text)

  if (language === 'he') {
    // Hebrew entity extraction patterns
    const hebrewPatterns = [
      // Fashion/apparel
      { pattern: /בושם|בשמים/, entity: 'בושם' },
      { pattern: /שמלה|שמלות/, entity: 'שמלה' },
      { pattern: /נעל|נעלי|נעליים/, entity: 'נעל' },
      { pattern: /בגד|בגדים/, entity: 'בגד' },
      // Equipment/fitness
      { pattern: /הליכון/, entity: 'הליכון' },
      { pattern: /אופניים/, entity: 'אופניים' },
      { pattern: /ציוד ספורט|ציוד כושר/, entity: 'ציוד ספורט' },
      // Services
      { pattern: /ניקיון|ניקוי/, entity: 'ניקיון' },
      { pattern: /קידום אתרים|seo|קידום/, entity: 'קידום אתרים' },
      { pattern: /פרסום|advertising/, entity: 'פרסום' },
      { pattern: /אינסטגרם|instagram/, entity: 'אינסטגרם' },
      { pattern: /גוגל|google/, entity: 'גוגל' },
    ]

    for (const { pattern, entity } of hebrewPatterns) {
      if (pattern.test(normalized)) {
        entities.push(entity)
      }
    }
  } else {
    // English entity extraction patterns
    const englishPatterns = [
      // Fashion/apparel
      { pattern: /fragrance|perfume|cologne/, entity: 'fragrance' },
      { pattern: /dress|dresses|clothing|garment/, entity: 'dress' },
      { pattern: /shoe|shoes|footwear/, entity: 'shoe' },
      { pattern: /clothes|garments|apparel/, entity: 'clothing' },
      // Equipment/fitness
      { pattern: /treadmill|treadmills/, entity: 'treadmill' },
      { pattern: /bicycle|bikes|cycling/, entity: 'bicycle' },
      { pattern: /equipment|gear/, entity: 'equipment' },
      // Services
      { pattern: /clean|cleaning|janitorial/, entity: 'cleaning' },
      { pattern: /seo|optimization|promotion/, entity: 'seo' },
      { pattern: /advertis|ads|advertising/, entity: 'advertising' },
      { pattern: /instagram/, entity: 'instagram' },
      { pattern: /google|goog/, entity: 'google' },
      // Home improvement
      { pattern: /renovation|remodel|construction/, entity: 'renovation' },
      { pattern: /contractor|contractor/, entity: 'contractor' },
    ]

    for (const { pattern, entity } of englishPatterns) {
      if (pattern.test(normalized)) {
        entities.push(entity)
      }
    }
  }

  return entities.length > 0 ? entities : [normalized.substring(0, 20)] // fallback to text prefix
}

/** Localized intent labels */
const INTENT_LABELS: Record<PromptIntent, Record<string, string>> = {
  brand: { he: 'מיתוג', en: 'Brand' },
  comparison: { he: 'השוואה', en: 'Comparison' },
  local: { he: 'מקומי', en: 'Local' },
  transactional: { he: 'עסקה', en: 'Transactional' },
  recommendation: { he: 'המלצה', en: 'Recommendation' },
  informational: { he: 'מידע', en: 'Information' },
  commercial: { he: 'מסחרי', en: 'Commercial' },
  alternatives: { he: 'חלופות', en: 'Alternatives' },
  pre_purchase: { he: 'לפני הקנייה', en: 'Pre-purchase' },
  gift: { he: 'מתנה', en: 'Gift' },
}

/**
 * Check if a question is safe and of sufficient quality.
 * Reuses validation logic from keyword-research-question-generator.ts.
 */
function isAcceptableEnrichment(text: string, language: 'he' | 'en'): boolean {
  if (!text) return false
  if (text.trim().length < 12) return false
  if (text.includes('{{') || text.includes('}}')) return false
  if (text.includes('undefined') || text.includes('null')) return false

  // Hebrew-specific safety checks
  if (language === 'he') {
    // Reject if "מתאים/ה/ים/ות" appears after a variable (injected noun)
    // This was fixed in Phase 2.5 but acts as a safety net.
    const adjPattern = /\s(מתאים[ות]*)\?$/
    if (adjPattern.test(text)) return false

    // Reject if "לקנות" appears after a service keyword (common error)
    if (/שיפוץ|ניקיון|קידום|עורך דין|רופא/.test(text) && /לקנות|לרכוש/.test(text)) {
      return false
    }
  }

  // Reject if too long (unlikely but defensive)
  if (text.length > 150) return false

  return true
}

// ============================================================================
// MAIN HELPER
// ============================================================================

/**
 * Generate enrichment candidates from project keywords.
 *
 * @param projectKeywords - keywords already in the project
 * @param language - 'he' or 'en'
 * @param projectCategory - business category (used for relevance checking)
 * @param businessName - optional business name
 * @param country - optional country code
 * @param existingSuggestions - Smart Questions vNext output to dedupe against
 * @param savedQuestions - questions already saved to the project
 * @param alreadyShownQuestions - questions shown in the modal this session (optional)
 * @param limit - max candidates to return (default 3)
 * @returns enrichment candidates + detailed debug info
 */
export function generateSmartQuestionKeywordEnrichment({
  projectKeywords,
  language,
  projectCategory,
  businessName,
  country,
  existingSuggestions,
  savedQuestions,
  alreadyShownQuestions = [],
  limit,
}: {
  projectKeywords: string[]
  language: 'he' | 'en'
  projectCategory?: BusinessCategory
  businessName?: string
  country?: string
  existingSuggestions: PromptSuggestion[]
  savedQuestions: string[]
  alreadyShownQuestions?: string[]
  limit?: number
}): EnrichmentResult {
  // Calculate dynamic limit based on existing Smart Questions vNext baseline
  const existingCount = existingSuggestions.length
  const dynamicLimit = existingCount <= 3 ? 2 : 1

  const debug: EnrichmentDebug = {
    inputKeywordsCount: projectKeywords.length,
    analyzedKeywordsCount: 0,
    generableKeywordsCount: 0,
    rejectedByConfidence: 0,
    rejectedByMismatch: 0,
    rejectedByDuplicate: 0,
    rejectedByQuality: 0,
    rejectedByTopicIntent: 0,
    rejectedByCapExceeded: 0,
    finalCount: 0,
    dynamicLimit,
    intendedPlacement: 'refresh_only',
    details: [],
  }

  debug.details.push(`vNext baseline: ${existingCount} question(s) → dynamic limit: ${dynamicLimit}`)
  debug.details.push(`Enrichment intended for: refresh-only (צור עוד שאלות)`)

  // ========================================================================
  // STEP 1: Analyze project keywords
  // ========================================================================

  const keywordsFiltered = projectKeywords
    .filter(k => k && k.trim().length > 0)
    .map(k => k.trim())

  debug.inputKeywordsCount = keywordsFiltered.length
  debug.details.push(`Filtering input: ${debug.inputKeywordsCount} keywords`)

  if (keywordsFiltered.length === 0) {
    debug.details.push('No keywords provided — returning empty')
    return { candidates: [], debug }
  }

  const analyses = analyzeSelectedKeywordSignals({
    selectedKeywords: keywordsFiltered,
    projectCategory,
    language,
    isNewProject: false, // project keywords are assumed relevant
  })

  debug.analyzedKeywordsCount = analyses.length
  debug.details.push(`Analyzed: ${analyses.length} keyword(s)`)

  // ========================================================================
  // STEP 2: Filter for generability (high confidence, not mismatch, not irrelevant)
  // ========================================================================

  const generable = analyses.filter(a => {
    if (!a.shouldGenerate) {
      if (a.keywordType === 'irrelevant') {
        debug.rejectedByMismatch++
        debug.details.push(`  ✗ irrelevant: "${a.keyword}"`)
      } else if (a.confidence === 'low') {
        debug.rejectedByConfidence++
        debug.details.push(`  ✗ low confidence: "${a.keyword}"`)
      } else if (a.relevance === 'mismatch') {
        debug.rejectedByMismatch++
        debug.details.push(`  ✗ mismatch: "${a.keyword}" (${a.reason})`)
      }
      return false
    }
    debug.details.push(`  ✓ generable: "${a.keyword}" (${a.keywordType}, ${a.confidence})`)
    return true
  })

  debug.generableKeywordsCount = generable.length
  debug.details.push(`Generable: ${generable.length} keyword(s)`)

  if (generable.length === 0) {
    debug.details.push('No generable keywords — returning empty')
    return { candidates: [], debug }
  }

  // ========================================================================
  // STEP 3: Generate questions from generable keywords
  // ========================================================================

  const krQuestions = generateKeywordResearchQuestions(
    generable,
    language,
    country,
    dynamicLimit * 3, // ask for more to allow filtering
  )

  debug.details.push(`Generated: ${krQuestions.length} candidate question(s)`)

  // ========================================================================
  // STEP 4: Build dedup set from existing suggestions + saved + shown
  //         Including normalized-intent + entity overlap detection
  // ========================================================================

  const existingNormalized = new Set<string>()
  // Map from normalized intent → Set of entity sets (each entry is a stringified entity set)
  const existingIntentEntities = new Map<string, Set<string>>()
  const existingIntentCounts = new Map<PromptIntent, number>()

  for (const s of existingSuggestions) {
    const normalizedText = normalizePrompt(s.prompt)
    existingNormalized.add(normalizedText)

    const normalizedIntent = normalizeIntentForDedupe(s.intent)
    const entities = extractDedupeEntities(s.prompt, language)
    const entitiesKey = entities.sort().join('|')

    if (!existingIntentEntities.has(normalizedIntent)) {
      existingIntentEntities.set(normalizedIntent, new Set())
    }
    existingIntentEntities.get(normalizedIntent)!.add(entitiesKey)

    existingIntentCounts.set(s.intent, (existingIntentCounts.get(s.intent) ?? 0) + 1)
  }

  for (const q of savedQuestions) {
    existingNormalized.add(normalizePrompt(q))
  }

  for (const q of alreadyShownQuestions) {
    existingNormalized.add(normalizePrompt(q))
  }

  debug.details.push(
    `Dedup set: ${existingNormalized.size} unique existing question(s)`,
  )
  debug.details.push(`Intent breakdown: ${Array.from(existingIntentCounts.entries()).map(([intent, count]) => `${intent}=${count}`).join(', ')}`)

  // ========================================================================
  // STEP 5: Filter candidates through quality gates (with topic+intent dedup)
  // ========================================================================

  const filtered: EnrichmentCandidate[] = []

  for (const krQuestion of krQuestions) {
    // Check if we've reached the dynamic cap
    if (filtered.length >= dynamicLimit) {
      debug.rejectedByCapExceeded++
      debug.details.push(`  ✗ cap_exceeded: "${krQuestion.question}" (limit: ${dynamicLimit})`)
      continue
    }

    const normalizedQuestion = normalizePrompt(krQuestion.question)

    // Check exact text duplicate
    if (existingNormalized.has(normalizedQuestion)) {
      debug.rejectedByDuplicate++
      debug.details.push(`  ✗ exact_duplicate: "${krQuestion.question}"`)
      continue
    }

    // Check quality (length, Hebrew safety, etc.)
    if (!isAcceptableEnrichment(krQuestion.question, language)) {
      debug.rejectedByQuality++
      debug.details.push(`  ✗ failed_quality: "${krQuestion.question}" (too short/unsafe/awkward)`)
      continue
    }

    // Map intent
    const intent = mapIntentType(krQuestion.type)

    // Check entity+intent near-duplicate detection
    // Reject if vNext already has the same normalized intent + overlapping entities
    const normalizedIntent = normalizeIntentForDedupe(intent)
    const enrichmentEntities = extractDedupeEntities(krQuestion.question, language)
    const enrichmentEntitiesKey = enrichmentEntities.sort().join('|')

    const vnextEntitiesForIntent = existingIntentEntities.get(normalizedIntent)
    if (vnextEntitiesForIntent && vnextEntitiesForIntent.size > 0) {
      let foundEntityIntentOverlap = false

      for (const vnextEntitiesKey of vnextEntitiesForIntent) {
        const vnextEntities = vnextEntitiesKey.split('|')
        // Check if any entity overlaps
        const hasOverlap = enrichmentEntities.some(e => vnextEntities.includes(e))
        if (hasOverlap) {
          foundEntityIntentOverlap = true
          break
        }
      }

      if (foundEntityIntentOverlap) {
        debug.rejectedByTopicIntent++
        debug.details.push(
          `  ✗ entity_intent_duplicate: "${krQuestion.question}" (intent: ${intent}, entities: ${enrichmentEntities.join(', ')}, sourceKeyword: ${krQuestion.sourceKeyword})`
        )
        continue
      }
    }

    // Ensure confidence is properly typed
    const confidence = (krQuestion.confidence === 'high' ||
      krQuestion.confidence === 'medium' ||
      krQuestion.confidence === 'low'
      ? krQuestion.confidence
      : 'medium') as 'high' | 'medium' | 'low'

    // Convert to enrichment candidate
    const candidate: EnrichmentCandidate = {
      question: krQuestion.question,
      sourceKeyword: krQuestion.sourceKeyword,
      sourceType: krQuestion.sourceType,
      topic: krQuestion.topic,
      intent,
      intentLabel: INTENT_LABELS[intent][language] || intent,
      confidence,
      reason: `Enrichment from keyword: ${krQuestion.sourceKeyword} (${krQuestion.sourceType})`,
    }

    filtered.push(candidate)
    debug.details.push(`  ✓ included: "${candidate.question}" (intent: ${intent}, topic: ${krQuestion.topic})`)
  }

  debug.finalCount = filtered.length
  debug.details.push(`Final: ${debug.finalCount} genuine candidate(s) after all filters`)

  return {
    candidates: filtered,
    debug,
  }
}
