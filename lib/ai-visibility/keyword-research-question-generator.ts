/**
 * Keyword Research Question Generator — Phase 2.5
 *
 * Converts KeywordAnalysis[] + keywordResearchSeeds into final question objects
 * ready for display in the Keyword Research → Generate AI Questions modal.
 *
 * Design rules (enforced here, not only in seeds):
 *   - Skip any analysis where shouldGenerate is false
 *   - Skip any analysis with low confidence
 *   - Skip any rendered question that contains unreplaced placeholders
 *   - Skip any rendered question that is too short or has injected nulls
 *   - Deduplicate across all analyses in the batch
 *   - Default limit: 10 questions total
 *
 * Not wired to UI yet. Phase 3 will connect this to keyword-research/page.tsx.
 *
 * Compatible with AIQuestionsModal via `toGeneratedQuestions()` adapter.
 */

import type { KeywordAnalysis, KeywordType, KeywordTopic } from './keyword-analysis'
import { resolveSeedsForKeyword, type KRSeedContext } from './keyword-research-seeds'
import type { GeneratedQuestion } from '../ai-questions/generate-questions'
import { detectEntityType, isQuestionCompatibleWithEntityType } from './keyword-entity-classifier'

// ============================================================================
// OUTPUT TYPE
// ============================================================================

/**
 * A fully-rendered question output for the Keyword Research modal.
 * Superset of GeneratedQuestion — extra fields are for debugging and logging.
 */
export interface GeneratedKRQuestion {
  question: string
  /** Maps to AIQuestionsModal type labels. */
  type: 'price' | 'recommendation' | 'comparison' | 'info'
  /** The raw selected keyword this question traces back to. */
  sourceKeyword: string
  /** Classified keyword type (service, product, marketing_channel, etc.) */
  sourceType: KeywordType
  /** Primary topic the question is based on, if any. */
  topic: KeywordTopic | null
  /** Classification confidence. */
  confidence: string
}

// ============================================================================
// HELPERS
// ============================================================================

/** Map seed intent → GeneratedKRQuestion type. */
function intentToType(intent: string): GeneratedKRQuestion['type'] {
  switch (intent) {
    case 'commercial':   return 'price'
    case 'pre_purchase': return 'recommendation'
    case 'comparison':   return 'comparison'
    case 'brand':        return 'recommendation'
    case 'informational':
    default:             return 'info'
  }
}

/**
 * Build the KRSeedContext for a single KeywordAnalysis.
 * Only fills the slot matching the keyword type — everything else is undefined.
 */
function buildSeedContext(
  analysis: KeywordAnalysis,
  language: 'he' | 'en',
  country?: string,
): KRSeedContext {
  const label = analysis.normalizedLabel ?? undefined
  const ctx: KRSeedContext = { language, country }

  switch (analysis.keywordType) {
    case 'service':
      ctx.serviceLabel = label
      break
    case 'product':
      ctx.productLabel = label
      break
    case 'marketing_channel':
      ctx.channelLabel = label
      break
    case 'brand':
      ctx.brandName = label
      break
    // professional_topic / informational: no specific slot needed
  }

  return ctx
}

/**
 * Validate a rendered question string.
 * Returns false for any string that would look broken to a user.
 *
 * Safety checks:
 *   - Minimum length
 *   - No unreplaced {{placeholder}} tokens
 *   - No injected JS falsy values (undefined, null, "null", "undefined")
 *   - Not a bare placeholder default fallback that reads awkwardly
 */
function isAcceptable(text: string, language: 'he' | 'en'): boolean {
  if (!text) return false
  if (text.trim().length < 12) return false
  if (text.includes('{{') || text.includes('}}')) return false
  if (text.includes('undefined')) return false
  if (text.includes('null')) return false

  // Hebrew-specific: reject if "מתאים/ה/ים/ות" immediately follows a label
  // that was injected (best-effort check — acts as a safety net).
  // Seeds have already been fixed, but this catches any future regressions.
  if (language === 'he') {
    // Matches a word-boundary before מתאים with potential prefix letter
    const adjPattern = /\s(מתאים[ות]*)\?$/
    // Only reject if it appears to follow an injected variable (non-hardcoded context)
    // We check by seeing if the word before מתאים is NOT a known safe fixed noun
    // This is an approximation — the real fix is in the seeds.
    const safeHardcoded = /^(איך לבחור עורך דין מתאים\?|)$/
    if (adjPattern.test(text) && !safeHardcoded.test(text)) return false
  }

  return true
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate questions from a batch of KeywordAnalysis results.
 *
 * Only generates questions for analyses where `shouldGenerate === true`
 * and confidence is not low.
 *
 * @param analyses  Output of `analyzeSelectedKeywordSignals()`
 * @param language  Display language for questions ('he' | 'en')
 * @param country   Optional country context (passed to seed context)
 * @param limit     Max total questions to return (default: 10)
 */
export function generateKeywordResearchQuestions(
  analyses: KeywordAnalysis[],
  language: 'he' | 'en',
  country?: string,
  limit = 10,
): GeneratedKRQuestion[] {
  const result: GeneratedKRQuestion[] = []
  const seen = new Set<string>()

  // Only eligible analyses
  const eligible = analyses.filter(
    a => a.shouldGenerate && a.confidence !== 'low' && a.keywordType !== 'irrelevant',
  )

  for (const analysis of eligible) {
    if (result.length >= limit) break

    const ctx = buildSeedContext(analysis, language, country)

    // Ask for more seeds than needed so we have room after quality filtering
    const resolved = resolveSeedsForKeyword(
      analysis.keywordType,
      analysis.topics,
      ctx,
      limit * 2,
    )

    for (const { text, intent } of resolved) {
      if (result.length >= limit) break
      if (!isAcceptable(text, language)) continue

      // Phase 1: Entity classifier safety filter
      // Detect entity type and check semantic compatibility
      const entityType = detectEntityType(analysis.keyword, language)
      if (!isQuestionCompatibleWithEntityType(text, analysis.keyword, entityType, language)) {
        continue
      }

      const key = text.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      result.push({
        question: text,
        type: intentToType(intent),
        sourceKeyword: analysis.keyword,
        sourceType: analysis.keywordType,
        topic: analysis.topics[0] ?? null,
        confidence: analysis.confidence,
      })
    }
  }

  return result
}

// ============================================================================
// ADAPTER — GeneratedQuestion compatibility
// ============================================================================

/**
 * Convert GeneratedKRQuestion[] to GeneratedQuestion[] for AIQuestionsModal.
 * AIQuestionsModal imports GeneratedQuestion from lib/ai-questions/generate-questions.
 * This adapter will be used in Phase 3 when wiring into page.tsx.
 */
export function toGeneratedQuestions(krQuestions: GeneratedKRQuestion[]): GeneratedQuestion[] {
  return krQuestions.map(q => ({
    question: q.question,
    sourceKeyword: q.sourceKeyword,
    type: q.type,
  }))
}

// ============================================================================
// DIAGNOSTIC HELPER (development only)
// ============================================================================

/**
 * Returns a summary of what would be generated, grouped by sourceKeyword.
 * Useful for logging and debugging during Phase 3 integration.
 */
export function summarizeGeneration(questions: GeneratedKRQuestion[]): string {
  if (questions.length === 0) return '[no questions generated]'

  const grouped = new Map<string, GeneratedKRQuestion[]>()
  for (const q of questions) {
    const key = q.sourceKeyword
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(q)
  }

  const lines: string[] = [`Generated ${questions.length} question(s):`]
  for (const [kw, qs] of grouped) {
    lines.push(`  "${kw}" (${qs[0].sourceType} / ${qs[0].topic ?? 'no topic'}):`)
    for (const q of qs) {
      lines.push(`    [${q.type}] ${q.question}`)
    }
  }
  return lines.join('\n')
}
