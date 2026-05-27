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
  rejectedByTopic: number
  finalCount: number
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
  limit = 3,
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
  const debug: EnrichmentDebug = {
    inputKeywordsCount: projectKeywords.length,
    analyzedKeywordsCount: 0,
    generableKeywordsCount: 0,
    rejectedByConfidence: 0,
    rejectedByMismatch: 0,
    rejectedByDuplicate: 0,
    rejectedByQuality: 0,
    rejectedByTopic: 0,
    finalCount: 0,
    details: [],
  }

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
    limit * 3, // ask for more to allow filtering
  )

  debug.details.push(`Generated: ${krQuestions.length} candidate question(s)`)

  // ========================================================================
  // STEP 4: Build dedup set from existing suggestions + saved + shown
  // ========================================================================

  const existingNormalized = new Set<string>()
  const existingIntents = new Set<string>()

  for (const s of existingSuggestions) {
    existingNormalized.add(normalizePrompt(s.prompt))
    existingIntents.add(`${s.intent}`)
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

  // ========================================================================
  // STEP 5: Filter candidates through quality gates
  // ========================================================================

  const filtered: EnrichmentCandidate[] = []

  for (const krQuestion of krQuestions) {
    if (filtered.length >= limit) break

    // Check exact text duplicate
    if (existingNormalized.has(normalizePrompt(krQuestion.question))) {
      debug.rejectedByDuplicate++
      debug.details.push(`  ✗ duplicate: "${krQuestion.question}"`)
      continue
    }

    // Check quality (length, Hebrew safety, etc.)
    if (!isAcceptableEnrichment(krQuestion.question, language)) {
      debug.rejectedByQuality++
      debug.details.push(`  ✗ quality: "${krQuestion.question}" (too short/unsafe/awkward)`)
      continue
    }

    // Map intent
    const intent = mapIntentType(krQuestion.type)

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
    debug.details.push(`  ✓ included: "${candidate.question}"`)
  }

  debug.finalCount = filtered.length
  debug.details.push(`Final: ${debug.finalCount} candidate(s) after all filters`)

  return {
    candidates: filtered.slice(0, limit),
    debug,
  }
}
