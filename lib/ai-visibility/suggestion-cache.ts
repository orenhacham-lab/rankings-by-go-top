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
 * Business scope info for validating question relevance
 */
export interface BusinessScope {
  allowedTopics: string[]
  excludedTerms: string[]
  businessCategory: string | null
}

/**
 * Extract business scope from project and business profile data
 * Returns allowed topics and excluded/blocked terms
 */
export function extractBusinessScope(projectData: Record<string, any>): BusinessScope {
  const allowedTopics: Set<string> = new Set()
  const excludedTerms: Set<string> = new Set()
  let businessCategory: string | null = null

  // Extract from ai_business_profile if available
  if (projectData.ai_business_profile && typeof projectData.ai_business_profile === 'object') {
    const profile = projectData.ai_business_profile

    // Get primary category
    if (profile.primaryCategory && typeof profile.primaryCategory === 'string') {
      businessCategory = profile.primaryCategory
      allowedTopics.add(profile.primaryCategory)
    }

    // Get secondary categories
    if (Array.isArray(profile.secondaryCategories)) {
      profile.secondaryCategories.forEach((cat: any) => {
        if (typeof cat === 'string') {
          allowedTopics.add(cat)
        }
      })
    }

    // Get excluded topics (these are the terms to block)
    if (Array.isArray(profile.excludedTopics)) {
      profile.excludedTopics.forEach((term: any) => {
        if (typeof term === 'string') {
          excludedTerms.add(term)
        }
      })
    }
  }

  // Also add business_name as a topic hint if no categories defined
  if (allowedTopics.size === 0 && projectData.business_name && typeof projectData.business_name === 'string') {
    allowedTopics.add(projectData.business_name)
  }

  return {
    allowedTopics: Array.from(allowedTopics),
    excludedTerms: Array.from(excludedTerms),
    businessCategory
  }
}

/**
 * Check if a question contains excluded/blocked business terms
 * Returns true if question should be rejected (contains excluded term)
 */
export function containsExcludedBusinessTerm(
  question: string,
  excludedTerms: string[]
): boolean {
  if (!excludedTerms || excludedTerms.length === 0) {
    return false
  }

  const lowerQuestion = question.toLowerCase()

  // Check for exact word matches or substring matches of excluded terms
  for (const term of excludedTerms) {
    const lowerTerm = term.toLowerCase().trim()
    if (!lowerTerm) continue

    // Check for word boundaries match (more conservative)
    // This helps avoid false positives while catching most cases
    const wordBoundaryRegex = new RegExp(`\\b${lowerTerm}\\b|${lowerTerm}`, 'i')
    if (wordBoundaryRegex.test(lowerQuestion)) {
      return true
    }
  }

  return false
}

/**
 * Check if a question is within allowed business scope
 * Conservative validation: if unsure, consider it safe
 * Returns true if question should be ACCEPTED (is relevant or ambiguous-safe)
 * Returns false if question should be REJECTED (clearly outside scope)
 */
export function isWithinBusinessScope(
  question: string,
  businessScope: BusinessScope
): boolean {
  // If no allowed topics defined, accept anything (no constraints)
  if (!businessScope.allowedTopics || businessScope.allowedTopics.length === 0) {
    return true
  }

  const lowerQuestion = question.toLowerCase()
  const allowedLower = businessScope.allowedTopics.map(t => t.toLowerCase())

  // Check if any allowed topic appears in the question
  // This is a simple heuristic - if any allowed topic is mentioned, consider it in-scope
  for (const topic of allowedLower) {
    if (lowerQuestion.includes(topic)) {
      return true
    }
  }

  // If no explicit match but question is vague/general, accept it (conservative)
  // Examples: "מה חשוב?", "איך לבחור?", "כמה עולה?" - these could apply to anything
  const genericQuestionPatterns = [
    /^(כמה|איך|מה|איזה|למי|איפה)\s+/i, // Generic question starters
    /יש\s+\w+\s+טוב/i, // "is there good X"
  ]

  const isGeneric = genericQuestionPatterns.some(pattern => pattern.test(lowerQuestion))
  if (isGeneric) {
    // Generic questions are considered in-scope (safe to include)
    return true
  }

  // If we get here: question mentions something specific that's not in allowed topics
  // This is likely out of scope, so reject it
  return false
}

/**
 * Extract allowed locations from project data
 * Builds a list of actual locations mentioned in the project's own data
 * Does NOT invent or assume locations
 */
export function extractAllowedLocations(projectData: Record<string, any>): string[] {
  const locations = new Set<string>()

  // Extract from explicit location fields
  if (projectData.city && typeof projectData.city === 'string') {
    const trimmed = projectData.city.trim().toLowerCase()
    if (trimmed) locations.add(trimmed)
  }

  // Extract from country if specified (but usually too broad)
  // Only add if it's a city-level precision, not a whole country
  if (projectData.country && typeof projectData.country === 'string' && projectData.country.length < 10) {
    const trimmed = projectData.country.trim().toLowerCase()
    // Only add small country codes like "il", "us", "gb" if they look like city codes
    if (trimmed.length <= 2) {
      locations.add(trimmed)
    }
  }

  // Extract locations from service_areas if it's an array or comma-separated string
  if (projectData.service_areas) {
    const areas = Array.isArray(projectData.service_areas)
      ? projectData.service_areas
      : (typeof projectData.service_areas === 'string' ? projectData.service_areas.split(',') : [])

    areas.forEach((area: any) => {
      if (typeof area === 'string') {
        const trimmed = area.trim().toLowerCase()
        if (trimmed) locations.add(trimmed)
      }
    })
  }

  // Extract from description if it exists (be conservative)
  if (projectData.description && typeof projectData.description === 'string') {
    // Simple heuristic: look for patterns like "in [City]" or "[City], Israel"
    // but be very conservative to avoid false positives
    const matches = projectData.description.match(/(?:in|at|בתוך)\s+([A-Za-zא-ת\s'-]+)/gi)
    if (matches) {
      matches.forEach((match: string) => {
        const city = match.replace(/^(?:in|at|בתוך)\s+/i, '').trim().toLowerCase()
        if (city && city.length > 2 && city.length < 50) {
          locations.add(city)
        }
      })
    }
  }

  return Array.from(locations)
}

/**
 * Check if a question contains locations that are NOT in allowedLocations list
 * Returns true if the question contains a disallowed location
 * Returns false if the question is safe (no locations, or only allowed locations)
 */
export function containsDisallowedLocation(
  question: string,
  allowedLocations: string[]
): boolean {
  if (!allowedLocations || allowedLocations.length === 0) {
    // If no allowed locations, reject ANY question that mentions a location
    // Common location indicators in Hebrew and English
    const locationPatterns = [
      /בתל\s*אביב/i, // Tel Aviv in Hebrew
      /בהרצליה/i, // Herzliya in Hebrew
      /בחיפה/i, // Haifa in Hebrew
      /בירושלים/i, // Jerusalem in Hebrew
      /בבאר\s*שבע/i, // Beersheba in Hebrew
      /בראמת\s*גן/i, // Ramat Gan in Hebrew
      /בגבעתיים/i, // Givatayim in Hebrew
      /בהרצליה\s*פיתוח/i, // Herzliya Pituach in Hebrew
      /בעמק\s*רפאים/i, // Emek Refaim in Hebrew
      /in\s+Tel\s+Aviv/i,
      /in\s+Herzliya/i,
      /in\s+Haifa/i,
      /in\s+Jerusalem/i,
      /in\s+Beersheba/i,
      /in\s+Ramat\s+Gan/i,
      /in\s+Givatayim/i,
      /delivery\s+to\s+\w+/i,
      /משלוח.*ל[א-ת\s]+/i, // delivery to [Hebrew location]
    ]

    return locationPatterns.some(pattern => pattern.test(question))
  }

  // Normalize allowed locations for comparison
  const normalizedAllowed = allowedLocations.map(loc => loc.trim().toLowerCase())

  // Simple word-boundary check: look for city names in the question
  // This is a heuristic that may not catch everything, but avoids false positives
  const lowerQuestion = question.toLowerCase()

  // Check for common location patterns that might not be in allowedLocations
  const suspiciousPatterns = [
    /(?:בתל\s*אביב|in\s+Tel\s+Aviv)/,
    /(?:בהרצליה|in\s+Herzliya)/,
    /(?:בחיפה|in\s+Haifa)/,
    /(?:בירושלים|in\s+Jerusalem)/,
    /(?:בבאר\s*שבע|in\s+Beersheba)/,
    /(?:בראמת\s*גן|in\s+Ramat\s+Gan)/,
    /(?:בגבעתיים|in\s+Givatayim)/,
    /(?:בעמק\s*רפאים|in\s+Emek\s+Refaim)/,
    /משלוח.*(?:ל|to)\s+(\w+)/,
  ]

  for (const pattern of suspiciousPatterns) {
    const match = question.match(pattern)
    if (match) {
      const detectedLocation = match[1]?.toLowerCase() || match[0].toLowerCase()
      // If detected location is NOT in allowed list, it's disallowed
      if (!normalizedAllowed.some(allowed => detectedLocation.includes(allowed) || allowed.includes(detectedLocation))) {
        return true
      }
    }
  }

  return false
}

/**
 * Filter suggestions by business scope and excluded terms
 * Removes questions that violate business constraints
 */
export function filterSuggestionsByBusinessScope(
  suggestions: Array<{ question: string; intent?: string; source?: string }>,
  businessScope: BusinessScope,
  onFilteredOut?: (question: string, reason: string) => void
): Array<{ question: string; intent?: string; source?: string }> {
  return suggestions.filter(suggestion => {
    // Check for excluded terms first
    if (containsExcludedBusinessTerm(suggestion.question, businessScope.excludedTerms)) {
      onFilteredOut?.(suggestion.question, `contains excluded term: ${businessScope.excludedTerms.find(t => suggestion.question.toLowerCase().includes(t.toLowerCase()))}`)
      return false
    }

    // Check if within business scope
    if (!isWithinBusinessScope(suggestion.question, businessScope)) {
      onFilteredOut?.(suggestion.question, `outside business scope`)
      return false
    }

    return true
  })
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
