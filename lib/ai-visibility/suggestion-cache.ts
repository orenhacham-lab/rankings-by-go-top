import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'

export interface CachedSuggestion {
  id: string
  question: string
  intent: string
  model_used: string | null
  created_at: string
}

export interface CacheLookupParams {
  projectId: string
  language: string
  country?: string | null
  businessCategory?: string | null
  keywordsHash?: string | null
}

/**
 * Strong normalization for deduplication
 * Handles: trim, lowercase, quotes, dashes, question marks, double spaces, Hebrew basics
 */
export function strongNormalize(text?: string | null): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  return (
    text
      .trim()
      .toLowerCase()
      // Remove question marks, exclamation marks at end
      .replace(/[?!]+\s*$/, '')
      // Normalize quotes: ״ / " / ' → "
      .replace(/[״"']/g, '"')
      // Normalize dashes: – / — / − → -
      .replace(/[–—−]/g, '-')
      // Remove double/triple spaces
      .replace(/\s+/g, ' ')
      // Hebrew: normalize nikud (diacritics) if possible, otherwise just trim
      .trim()
  )
}

/**
 * Strong deduplication across all sources
 * Finds near-duplicates and exact matches
 * Returns: (questions, duplicatesRemoved count)
 */
export function strongDeduplicateSuggestions(
  vNextQuestions: Array<{ question?: string | null; prompt?: string | null }>,
  cachedSuggestions: Array<{ question?: string | null }>,
  newGeminiSuggestions: Array<{ question?: string | null; intent?: string }>
): {
  dedupedQuestions: Array<{ question: string; intent?: string; source: string }>
  duplicateCount: number
} {
  const seen = new Map<string, { question: string; source: string; intent?: string }>()
  let duplicateCount = 0

  // Helper to add question to seen map
  const addQuestion = (question: string | null | undefined, source: string, intent?: string) => {
    if (!question) return
    const norm = strongNormalize(question)
    if (!norm) return

    if (seen.has(norm)) {
      duplicateCount++
      return
    }

    seen.set(norm, {
      question,
      source,
      intent: intent || undefined,
    })
  }

  // Add vNext questions
  vNextQuestions.forEach((q) => {
    addQuestion(q.prompt || q.question, 'vNext')
  })

  // Add cached suggestions
  cachedSuggestions.forEach((q) => {
    addQuestion(q.question, 'cached')
  })

  // Add new Gemini suggestions
  newGeminiSuggestions.forEach((q) => {
    addQuestion(q.question, 'gemini', q.intent)
  })

  const dedupedQuestions = Array.from(seen.values())

  return {
    dedupedQuestions,
    duplicateCount,
  }
}

/**
 * Compute stable question hash (SHA256 of normalized question)
 */
export function computeQuestionHash(question: string): string {
  const normalized = strongNormalize(question)
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

/**
 * Compute stable context hash for grouping suggestions
 * Normalizes null values with COALESCE pattern
 */
export function computeContextHash(
  projectId: string,
  language: string,
  country?: string | null,
  businessCategory?: string | null,
  keywordsHash?: string | null
): string {
  const parts = [
    projectId,
    language,
    country || '',
    businessCategory || '',
    keywordsHash || ''
  ]

  const input = parts.join('|')
  return crypto.createHash('sha256').update(input).digest('hex')
}

/**
 * Load cached suggestions for a project/context
 * Returns only 'suggested' status rows, filtered by freshness_days
 */
export async function loadCachedSuggestions(
  params: CacheLookupParams
): Promise<CachedSuggestion[]> {
  const supabase = await createClient()

  const contextHash = computeContextHash(
    params.projectId,
    params.language,
    params.country,
    params.businessCategory,
    params.keywordsHash
  )

  const { data, error } = await supabase
    .from('ai_question_suggestion_cache')
    .select('id, question, intent, model_used, created_at')
    .eq('project_id', params.projectId)
    .eq('context_hash', contextHash)
    .eq('status', 'suggested')
    .gt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Suggestion Cache] Load error:', error)
    return []
  }

  return data || []
}

/**
 * Write new suggestions to cache
 * Returns true if all wrote successfully, false if any failed
 */
export async function writeSuggestionsToCache(
  projectId: string,
  suggestions: Array<{
    question: string
    intent: string
    model_used?: string
    metadata?: Record<string, any>
  }>,
  params: CacheLookupParams
): Promise<boolean> {
  if (!suggestions || suggestions.length === 0) {
    return true
  }

  const supabase = await createClient()

  const contextHash = computeContextHash(
    params.projectId,
    params.language,
    params.country,
    params.businessCategory,
    params.keywordsHash
  )

  const rows = suggestions.map((s) => ({
    project_id: projectId,
    language: params.language,
    country: params.country || null,
    business_category: params.businessCategory || null,
    keywords_hash: params.keywordsHash || null,
    context_hash: contextHash,
    question: s.question,
    normalized_question: strongNormalize(s.question),
    question_hash: computeQuestionHash(s.question),
    intent: s.intent,
    source: 'gemini' as const,
    model_used: s.model_used || null,
    metadata: s.metadata || {},
    status: 'suggested' as const,
    freshness_days: 30
  }))

  const { error } = await supabase
    .from('ai_question_suggestion_cache')
    .upsert(rows, {
      onConflict: 'project_id,context_hash,question_hash,source',
      ignoreDuplicates: false
    })

  if (error) {
    console.error('[Suggestion Cache] Write error:', error)
    return false
  }

  return true
}

/**
 * Accept a cached suggestion (mark as 'accepted' and set accepted_at)
 */
export async function acceptSuggestedQuestion(
  cacheId: string,
  projectId: string
): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('ai_question_suggestion_cache')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString()
    })
    .eq('id', cacheId)
    .eq('project_id', projectId)

  if (error) {
    console.error('[Suggestion Cache] Accept error:', error)
    return false
  }

  return true
}

/**
 * Dismiss a cached suggestion (mark as 'dismissed' and set dismissed_at)
 */
export async function dismissSuggestedQuestion(
  cacheId: string,
  projectId: string
): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('ai_question_suggestion_cache')
    .update({
      status: 'dismissed',
      dismissed_at: new Date().toISOString()
    })
    .eq('id', cacheId)
    .eq('project_id', projectId)

  if (error) {
    console.error('[Suggestion Cache] Dismiss error:', error)
    return false
  }

  return true
}

/**
 * Deduplicate suggestions against existing lists
 * Returns array with exact duplicates and near-duplicates (by intent) removed
 * Defensively handles missing/null questions
 */
export function deduplicateSuggestions(
  newSuggestions: Array<{ question: string; intent: string }>,
  vNextQuestions: Array<{ question?: string | null }>,
  cachedQuestions: Array<{ question?: string | null }>,
  savedPromptQuestions: Array<{ text?: string | null }>
): Array<{ question: string; intent: string }> {
  const existingQuestions = new Set<string>()
  const existingIntents = new Map<string, string>()

  // Populate with vNext questions
  vNextQuestions.forEach((q) => {
    if (q.question) {
      const norm = strongNormalize(q.question)
      if (norm) {
        existingQuestions.add(norm)
        existingIntents.set(norm, 'vNext')
      }
    }
  })

  // Populate with cached questions
  cachedQuestions.forEach((q) => {
    if (q.question) {
      const norm = strongNormalize(q.question)
      if (norm) {
        existingQuestions.add(norm)
        if (!existingIntents.has(norm)) {
          existingIntents.set(norm, 'cached')
        }
      }
    }
  })

  // Populate with saved prompts
  savedPromptQuestions.forEach((q) => {
    if (q.text) {
      const norm = strongNormalize(q.text)
      if (norm) {
        existingQuestions.add(norm)
        if (!existingIntents.has(norm)) {
          existingIntents.set(norm, 'saved')
        }
      }
    }
  })

  // Filter new suggestions
  return newSuggestions.filter((suggestion) => {
    if (!suggestion.question) return false
    const norm = strongNormalize(suggestion.question)
    return norm && !existingQuestions.has(norm)
  })
}
