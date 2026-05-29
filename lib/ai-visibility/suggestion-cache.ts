import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
 * Extract main topic keywords from a question for semantic comparison
 * Filters out generic words to find the substantive topics
 */
export function extractTopicKeywords(question: string): Set<string> {
  if (!question) return new Set()

  const normalized = strongNormalize(question).toLowerCase()

  // Hebrew stop words (generic words that don't represent topic)
  const hebrewStopWords = new Set([
    'את', 'או', 'אל', 'אלו', 'אם', 'אתה', 'אתן', 'אתכם',
    'את', 'אתך', 'אתה', 'בא', 'בד', 'בה', 'בהם', 'בהן',
    'בו', 'בי', 'בנו', 'בן', 'בעצם', 'בעל', 'בעלת',
    'בפני', 'בצורה', 'בשביל', 'בשם', 'בתא',
    'גם', 'גם',
    'ד', 'דבר',
    'ה', 'הוא', 'היא', 'היום', 'הם', 'הן', 'הערה',
    'כ', 'כאן', 'כאלו', 'כמו', 'כל', 'כלא', 'כן',
    'לא', 'לאן', 'לאור', 'לאחד', 'לאיזה', 'לבקש', 'לי', 'לנו', 'לעצמו',
    'מ', 'מה', 'מהן', 'מהו', 'מהיום', 'מו', 'מועד',
    'נ', 'נא', 'נעם', 'נתון',
    'ס', 'סוג', 'סימן',
    'ע', 'על', 'עלי', 'עליהם', 'עליה', 'עליך', 'עליכם', 'עלינו',
    'עצמו', 'עצמה', 'עצמם', 'עצמן',
    'פ', 'פה', 'פי',
    'ש', 'שאיזה', 'שאם', 'שבוע',
    'תא', 'תוך', 'תי', 'תיתן',
    'ו', 'ויש',
    'ז', 'זה', 'זו', 'זאת',
    'חוקי', 'חוקן',
    'י', 'יד', 'יום', 'יוש', 'יש',
  ])

  // English stop words
  const englishStopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'should', 'could', 'can', 'may', 'might', 'must',
    'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its',
    'with', 'from', 'as', 'by', 'about', 'what', 'which', 'who', 'how',
    'where', 'when', 'why', 'if', 'because', 'as', 'while', 'if'
  ])

  const keywords = new Set<string>()

  // Extract words (split by spaces and punctuation)
  const words = normalized
    .split(/\s+/)
    .filter(w => w && w.length > 2) // Only words longer than 2 chars

  words.forEach(word => {
    // Remove trailing punctuation
    const clean = word.replace(/[?!.,;:-]+$/, '')

    // Check if it's not a stop word
    if (
      clean.length > 2 &&
      !hebrewStopWords.has(clean) &&
      !englishStopWords.has(clean)
    ) {
      keywords.add(clean)
    }
  })

  return keywords
}

/**
 * Generate semantic signature for a question for stronger dedup
 * Signature captures: intent, main entity, action, occasion, location
 */
export function generateSemanticSignature(question: string, intent?: string): {
  intent: string
  mainEntity: string // e.g., "זר פרחים", "הליכון"
  actions: Set<string> // e.g., {"משלוח", "קנייה"}
  occasion: string // e.g., "יום הולדת", "חתונה"
  location: string // e.g., "ירושלים"
} {
  const lower = question.toLowerCase()

  // Extract main entity (main topic)
  const entityPatterns = [
    /זר\s+פרחים|פרחים|זר/i,
    /הליכון|אופני כושר|מכשיר כושר/i,
    /משפחה|בית|דירה/i,
  ]
  let mainEntity = 'unknown'
  for (const pattern of entityPatterns) {
    const match = lower.match(pattern)
    if (match) {
      mainEntity = match[0].toLowerCase()
      break
    }
  }

  // Extract actions
  const actions = new Set<string>()
  const actionPatterns: Record<string, string[]> = {
    משלוח: ['משלוח', 'דליברי', 'משלח'],
    קנייה: ['קונים', 'לקנות', 'קונה', 'קניה', 'קנה'],
    // 'כמה' removed — it is a generic question word ("how much/how long") not a price signal.
    // "כמה זמן לוקח" (delivery time) and "כמה עולה" (price) both contain "כמה",
    // causing them to share the מחיר action and be incorrectly treated as duplicates.
    מחיר: ['עולה', 'מחיר', 'עלות'],
    בחירה: ['בוחרים', 'מתאים', 'בחירה', 'כיצד לבחור'],
  }

  for (const [action, keywords] of Object.entries(actionPatterns)) {
    if (keywords.some(kw => lower.includes(kw))) {
      actions.add(action)
    }
  }

  // Extract occasion — ordered most-specific first so "יום הולדת" wins over generic "מתנה"
  const occasionPatterns: Record<string, string[]> = {
    'יום הולדת': ['יום הולדת'],
    'יום נישואין': ['יום נישואין', 'יום נישואים'],
    'חתונה': ['חתונה', 'חתן', 'כלה', 'חתונת'],  // 'חתונת' = construct form (e.g. "לחתונת שישי")
    'לידה': ['לידה', 'תינוק', 'תינוקת', 'ברית', 'נולד'],
    'הנצחה': ['הנצחה', 'זיכרון', 'ניחומים', 'אבל'],
    'מתנה': ['מתנה', 'מתנות'],
  }
  let occasion = ''
  for (const [occ, keywords] of Object.entries(occasionPatterns)) {
    if (keywords.some(kw => lower.includes(kw))) {
      occasion = occ
      break
    }
  }

  // Extract location
  const locationPattern = /(ירושלים|תל אביב|הרצליה|פתח תקווה|בת ים|נתניה|ראשון לציון|גבעתיים|עמק רפאים)/
  const locationMatch = lower.match(locationPattern)
  const location = locationMatch ? locationMatch[0] : ''

  return {
    intent: intent || 'unknown',
    mainEntity,
    actions,
    occasion,
    location,
  }
}

/**
 * Check if two questions are semantic duplicates
 * Uses semantic signature (intent + entity + actions + occasion + location)
 * Returns true if they should be considered duplicates
 */
export function areSemanticDuplicates(
  q1: { question: string; intent?: string },
  q2: { question: string; intent?: string },
  similarityThreshold: number = 0.6
): boolean {
  // Must have same intent to be semantic duplicate
  if (!q1.intent || !q2.intent || q1.intent !== q2.intent) {
    return false
  }

  // Generate semantic signatures
  const sig1 = generateSemanticSignature(q1.question, q1.intent)
  const sig2 = generateSemanticSignature(q2.question, q2.intent)

  // Intent must match (already checked above, but included in signature)
  if (sig1.intent !== sig2.intent) {
    return false
  }

  // HARD GATE — occasion: if either question has a recognized occasion and they differ, keep both.
  // "ללידה" vs "לחתונת שישי", "ליום נישואין" vs "ליום הולדת" must never collapse.
  if ((sig1.occasion || sig2.occasion) && sig1.occasion !== sig2.occasion) {
    return false
  }

  // HARD GATE — location: if either question names a city and they differ, keep both.
  // "לירושלים" vs "לבית" are different delivery contexts.
  if ((sig1.location || sig2.location) && sig1.location !== sig2.location) {
    return false
  }

  // Main entity must match (primary topic)
  if (sig1.mainEntity !== sig2.mainEntity && sig1.mainEntity !== 'unknown' && sig2.mainEntity !== 'unknown') {
    return false
  }

  // Check action similarity
  const actionIntersection = new Set([...sig1.actions].filter(a => sig2.actions.has(a)))
  const actionUnion = new Set([...sig1.actions, ...sig2.actions])
  const actionSimilarity = actionUnion.size === 0 ? 1 : actionIntersection.size / actionUnion.size

  // Check overall topic similarity.
  // Inject the extracted location into the keyword sets so that
  // "לירושלים" and "בירושלים" — both mapping to location "ירושלים" — are treated as the same token.
  const topics1 = extractTopicKeywords(q1.question)
  const topics2 = extractTopicKeywords(q2.question)
  if (sig1.location) topics1.add(sig1.location)
  if (sig2.location) topics2.add(sig2.location)

  if (topics1.size < 2 || topics2.size < 2) {
    return false
  }

  const topicIntersection = new Set([...topics1].filter(x => topics2.has(x)))
  const topicUnion = new Set([...topics1, ...topics2])
  const topicSimilarity = topicUnion.size === 0 ? 0 : topicIntersection.size / topicUnion.size

  // Topic overlap is the primary signal. A shared generic action verb alone
  // (e.g. both contain "מתאים" → action "בחירה") must NOT collapse two questions
  // whose actual topics differ — that over-aggressive rule was shrinking the
  // legitimately diverse pool. Action similarity only counts when the questions
  // also share meaningful topic overlap.
  // 0.25 (not 0.3): short questions like "כמה עולה זר ורדים?" vs "מה המחיר של זר ורדים?"
  // share only "ורדים" (because "זר" is 2 chars and filtered), giving tS=0.25 exactly.
  const SECONDARY_TOPIC_GATE = 0.25
  const isSemanticallyDuplicate =
    topicSimilarity >= similarityThreshold ||
    (actionSimilarity >= similarityThreshold && topicSimilarity >= SECONDARY_TOPIC_GATE)

  return isSemanticallyDuplicate
}

/**
 * Strong deduplication across all sources with detailed logging
 * Finds exact matches AND semantic duplicates (same intent + similar topics)
 * Returns: (questions, duplicatesRemoved count, removalLog)
 */
export function strongDeduplicateSuggestions(
  vNextQuestions: Array<{ question?: string | null; prompt?: string | null; intent?: string; id?: string }>,
  cachedSuggestions: Array<{ question?: string | null; intent?: string; id?: string }>,
  newGeminiSuggestions: Array<{ question?: string | null; intent?: string; id?: string }>
): {
  dedupedQuestions: Array<{ question: string; intent?: string; source: string }>
  duplicateCount: number
  removalLog: Array<{ question: string; source: string; removedBy: string; removedAsDuplicateOf?: string; removedReason: string }>
} {
  const seen = new Map<string, { question: string; source: string; intent?: string; id?: string }>()
  let duplicateCount = 0
  const removalLog: Array<{ question: string; source: string; removedBy: string; removedAsDuplicateOf?: string; removedReason: string }> = []

  // Helper to add question to seen map
  const addQuestion = (question: string | null | undefined, source: string, intent?: string, id?: string) => {
    if (!question) return
    const norm = strongNormalize(question)
    if (!norm) return

    // Check for exact text duplicate
    if (seen.has(norm)) {
      const existing = seen.get(norm)!
      removalLog.push({
        question,
        source,
        removedBy: 'client',
        removedAsDuplicateOf: existing.question,
        removedReason: 'exact_duplicate'
      })
      duplicateCount++
      return
    }

    // Check for semantic duplicate with existing questions of same intent
    const newEntry = { question, source, intent: intent || undefined, id }
    let isSemanticDuplicate = false
    let matchedExisting: typeof seen extends Map<string, infer V> ? V : never

    for (const [_, existing] of seen) {
      if (areSemanticDuplicates(newEntry, existing)) {
        isSemanticDuplicate = true
        matchedExisting = existing
        break
      }
    }

    if (isSemanticDuplicate) {
      removalLog.push({
        question,
        source,
        removedBy: 'client',
        removedAsDuplicateOf: matchedExisting!.question,
        removedReason: 'semantic_duplicate'
      })
      duplicateCount++
    } else {
      seen.set(norm, newEntry)
    }
  }

  // Add vNext questions
  vNextQuestions.forEach((q) => {
    addQuestion(q.prompt || q.question, 'vNext', (q as { intent?: string }).intent, (q as { id?: string }).id)
  })

  // Add cached suggestions — preserve intent so labels survive the round-trip
  cachedSuggestions.forEach((q) => {
    addQuestion(q.question, 'cached', (q as { intent?: string }).intent, (q as { id?: string }).id)
  })

  // Add new Gemini suggestions
  newGeminiSuggestions.forEach((q) => {
    addQuestion(q.question, 'gemini', q.intent, (q as { id?: string }).id)
  })

  const dedupedQuestions = Array.from(seen.values())

  return {
    dedupedQuestions,
    duplicateCount,
    removalLog,
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
    keywordsHash || '' // Treat undefined and null the same
  ]

  const input = parts.join('|')
  return crypto.createHash('sha256').update(input).digest('hex')
}

/**
 * Load cached suggestions for a project/context
 * Returns only 'suggested' status rows, filtered by freshness_days
 *
 * Uses the admin (service-role) client so that Row-Level Security can never be
 * the silent reason a row is invisible. The API route authorizes project
 * ownership BEFORE calling this, so bypassing RLS here is safe.
 */
export async function loadCachedSuggestions(
  params: CacheLookupParams
): Promise<CachedSuggestion[]> {
  const supabase = createAdminClient()

  const contextHash = computeContextHash(
    params.projectId,
    params.language,
    params.country,
    params.businessCategory,
    params.keywordsHash
  )

  const { data, error } = await supabase
    .from('ai_question_suggestion_cache')
    .select('id, question, intent, model_used, created_at, status, source, question_hash, context_hash')
    .eq('project_id', params.projectId)
    .eq('context_hash', contextHash)
    .eq('status', 'suggested')
    .gt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Suggestion Cache] Load error:', {
      errorCode: (error as any)?.code,
      errorMessage: error.message,
      contextHash,
      projectId: params.projectId,
    })
    return []
  }

  const loaded = data || []

  // Log comprehensive details for each cached row
  console.log('[loadCachedSuggestions] Detailed row tracking', {
    projectId: params.projectId,
    contextHash,
    loadedCount: loaded.length,
    freshnessCutoff: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    rows: loaded.map((row: any) => ({
      id: row.id,
      question: row.question,
      question_hash: row.question_hash,
      source: row.source,
      status: row.status,
      intent: row.intent,
      created_at: row.created_at,
      displayedFlag: true, // Will be marked false if filtered later
    })),
  })

  return loaded
}

export interface CacheWriteResult {
  success: boolean
  contextHash: string
  rowsAttempted: number
  rowsInserted: number
  rowsAlreadyPresent: number
  rowsVisibleAfterWrite: number
  errorCode: string | null
  errorMessage: string | null
  sampleQuestionHashes: string[]
}

/**
 * Write new suggestions to cache.
 *
 * IMPORTANT: This implementation does NOT depend on any UNIQUE constraint or
 * ON CONFLICT target. The original code relied on an upsert against a column
 * list, but the production table only has a *partial/filtered* unique index
 * (`WHERE status NOT IN ('expired','dismissed')`). Postgres cannot use a
 * partial index as an ON CONFLICT inference target from a column list, so the
 * upsert failed with error 42P10 and the failure was swallowed — nothing was
 * ever persisted. That was the production persistence bug.
 *
 * This version instead:
 *   1. Uses the admin (service-role) client (RLS can't silently block it).
 *   2. Reads the existing question_hashes for this project+context_hash.
 *   3. Inserts ONLY the genuinely-new rows via a plain INSERT (no constraint).
 *   4. Performs a post-write SELECT to PROVE the rows are visible.
 *
 * Returns a detailed proof object so the caller can log/verify persistence.
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
): Promise<CacheWriteResult> {
  const contextHash = computeContextHash(
    params.projectId,
    params.language,
    params.country,
    params.businessCategory,
    params.keywordsHash
  )

  if (!suggestions || suggestions.length === 0) {
    return {
      success: true,
      contextHash,
      rowsAttempted: 0,
      rowsInserted: 0,
      rowsAlreadyPresent: 0,
      rowsVisibleAfterWrite: 0,
      errorCode: null,
      errorMessage: null,
      sampleQuestionHashes: [],
    }
  }

  const supabase = createAdminClient()

  // Build candidate rows, de-duplicating by question_hash within this batch.
  const candidateByHash = new Map<string, {
    project_id: string
    language: string
    country: string | null
    business_category: string | null
    keywords_hash: string | null
    context_hash: string
    question: string
    normalized_question: string
    question_hash: string
    intent: string
    source: 'gemini'
    model_used: string | null
    metadata: Record<string, any>
    status: 'suggested'
    freshness_days: number
  }>()

  for (const s of suggestions) {
    const question_hash = computeQuestionHash(s.question)
    if (candidateByHash.has(question_hash)) continue
    candidateByHash.set(question_hash, {
      project_id: projectId,
      language: params.language,
      country: params.country || null,
      business_category: params.businessCategory || null,
      keywords_hash: params.keywordsHash || null,
      context_hash: contextHash,
      question: s.question,
      normalized_question: strongNormalize(s.question),
      question_hash,
      intent: s.intent,
      source: 'gemini',
      model_used: s.model_used || null,
      metadata: s.metadata || {},
      status: 'suggested',
      freshness_days: 30,
    })
  }

  const sampleQuestionHashes = Array.from(candidateByHash.keys()).slice(0, 5)

  // Step 1: Find which question_hashes already exist for this project+context.
  // This makes the insert idempotent WITHOUT needing a unique constraint.
  const { data: existingRows, error: existingErr } = await supabase
    .from('ai_question_suggestion_cache')
    .select('question_hash')
    .eq('project_id', projectId)
    .eq('context_hash', contextHash)
    .in('question_hash', Array.from(candidateByHash.keys()))

  if (existingErr) {
    console.error('[Suggestion Cache] Pre-insert existence check failed:', {
      errorCode: (existingErr as any)?.code,
      errorMessage: existingErr.message,
      contextHash,
      projectId,
    })
    // Continue anyway — worst case we attempt to insert rows that exist.
  }

  const existingHashes = new Set((existingRows || []).map((r: any) => r.question_hash))
  const rowsToInsert = Array.from(candidateByHash.values()).filter(
    (r) => !existingHashes.has(r.question_hash)
  )
  const rowsAlreadyPresent = candidateByHash.size - rowsToInsert.length

  // Step 2: Plain INSERT of only the new rows (no ON CONFLICT, no constraint).
  let insertErrorCode: string | null = null
  let insertErrorMessage: string | null = null
  let rowsInserted = 0

  if (rowsToInsert.length > 0) {
    const { data: inserted, error: insertErr } = await supabase
      .from('ai_question_suggestion_cache')
      .insert(rowsToInsert)
      .select('id')

    if (insertErr) {
      insertErrorCode = (insertErr as any)?.code ?? 'unknown'
      insertErrorMessage = insertErr.message
      console.error('[Suggestion Cache] INSERT failed (CRITICAL - persistence blocked):', {
        errorCode: insertErrorCode,
        errorMessage: insertErrorMessage,
        errorDetails: (insertErr as any)?.details,
        errorHint: (insertErr as any)?.hint,
        rowsToInsert: rowsToInsert.length,
        contextHash,
        projectId,
        firstQuestion: rowsToInsert[0]?.question?.substring(0, 60),
      })
    } else {
      rowsInserted = inserted?.length ?? rowsToInsert.length
    }
  }

  // Step 3: Post-write verification SELECT — prove the rows are persisted.
  const { count: visibleCount, error: verifyErr } = await supabase
    .from('ai_question_suggestion_cache')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('context_hash', contextHash)
    .eq('status', 'suggested')

  if (verifyErr) {
    console.error('[Suggestion Cache] Post-write verification SELECT failed:', {
      errorCode: (verifyErr as any)?.code,
      errorMessage: verifyErr.message,
      contextHash,
      projectId,
    })
  }

  const rowsVisibleAfterWrite = visibleCount ?? 0
  const success = insertErrorCode === null

  console.log('[Suggestion Cache Write]', {
    projectId,
    contextHash,
    rowsAttempted: candidateByHash.size,
    rowsAlreadyPresent,
    rowsInserted,
    upsertSuccess: success,
    upsertErrorCode: insertErrorCode,
    upsertErrorMessage: insertErrorMessage,
    rowsVisibleAfterWrite,
    sampleQuestionHashes,
  })

  return {
    success,
    contextHash,
    rowsAttempted: candidateByHash.size,
    rowsInserted,
    rowsAlreadyPresent,
    rowsVisibleAfterWrite,
    errorCode: insertErrorCode,
    errorMessage: insertErrorMessage,
    sampleQuestionHashes,
  }
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
 * Map ISO country codes to display names for user-facing content
 */
const COUNTRY_CODE_TO_DISPLAY_NAME: Record<string, string> = {
  'il': 'ישראל',
  'us': 'United States',
  'gb': 'United Kingdom',
  'uk': 'United Kingdom',
  'gr': 'Greece',
  'cy': 'Cyprus',
  'de': 'Germany',
  'fr': 'France',
  'it': 'Italy',
  'es': 'Spain',
  'pt': 'Portugal',
  'nl': 'Netherlands',
  'be': 'Belgium',
  'ch': 'Switzerland',
  'at': 'Austria',
  'cz': 'Czech Republic',
  'pl': 'Poland',
  'ca': 'Canada',
  'mx': 'Mexico',
  'br': 'Brazil',
  'ar': 'Argentina',
  'au': 'Australia',
  'nz': 'New Zealand',
  'jp': 'Japan',
  'cn': 'China',
  'in': 'India',
  'sg': 'Singapore',
  'hk': 'Hong Kong',
}

/**
 * Convert ISO country code to display-friendly name
 * Returns the display name if mapped, otherwise returns the input unchanged
 */
export function getCountryDisplayName(countryCode?: string | null): string | undefined {
  if (!countryCode) return undefined
  const code = countryCode.toLowerCase().trim()
  return COUNTRY_CODE_TO_DISPLAY_NAME[code] || code
}

/**
 * Check if a question contains raw ISO country codes that leaked from internal processing
 * Returns true if question should be rejected (contains ISO code)
 */
export function containsISOCountryCodeLeak(question: string): boolean {
  if (!question) return false

  const lowerQuestion = question.toLowerCase()

  // List of ISO codes that should never appear in user-facing questions
  const isoCodePatterns = [
    /\b(il|us|uk|gb|gr|cy|de|fr|it|es|pt|nl|be|ch|at|cz|pl|ca|mx|br|ar|au|nz|jp|cn|in|sg|hk)\b/gi,
    /ל-(il|us|uk|gb|gr|cy)/gi, // "ל-IL", "ל-US" in Hebrew
    /to-(il|us|uk|gb|gr|cy)/gi, // "to-IL", "to-US" in English
  ]

  for (const pattern of isoCodePatterns) {
    if (pattern.test(lowerQuestion)) {
      return true
    }
  }

  return false
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
 * Extract allowed service areas from project data
 * More comprehensive than allowedLocations - includes keywords and saved content
 */
export function extractAllowedServiceAreas(projectData: Record<string, any>): string[] {
  const areas = new Set<string>()

  // 1. Project city (primary location)
  if (projectData.city && typeof projectData.city === 'string') {
    const trimmed = projectData.city.trim().toLowerCase()
    if (trimmed) areas.add(trimmed)
  }

  // 2. Service areas from business profile
  if (projectData.ai_business_profile && typeof projectData.ai_business_profile === 'object') {
    const profile = projectData.ai_business_profile
    if (Array.isArray(profile.serviceAreas)) {
      profile.serviceAreas.forEach((area: any) => {
        if (typeof area === 'string') {
          const trimmed = area.trim().toLowerCase()
          if (trimmed) areas.add(trimmed)
        }
      })
    }
    // Also check if service areas mentioned in description
    if (typeof profile.description === 'string') {
      // Extract location-like words from description
      const locationMatches = profile.description.match(/ב(ירושלים|תל אביב|הרצליה|פתח תקווה|בת ים|נתניה|ראשון לציון|גבעתיים|עמק רפאים|הדסה|שערי צדק)/g)
      if (locationMatches) {
        locationMatches.forEach((match: string) => {
          const city = match.replace(/^ב/, '').toLowerCase()
          if (city) areas.add(city)
        })
      }
    }
  }

  // 3. Location terms in keywords
  if (Array.isArray(projectData.keywords)) {
    projectData.keywords.forEach((kw: any) => {
      if (typeof kw === 'string') {
        const lower = kw.toLowerCase()
        // Check if keyword looks like a location (Hebrew cities)
        const locationPattern = /(ירושלים|תל אביב|הרצליה|פתח תקווה|בת ים|נתניה|ראשון לציון|גבעתיים|עמק רפאים|הדסה|שערי צדק|חיפה|באר שבע|אשדוד|אשקלון)/
        const matches = lower.match(locationPattern)
        if (matches) {
          areas.add(matches[0].toLowerCase())
        }
      }
    })
  }

  // 4. Explicitly NOT supported: inferred regions or nearby cities
  // Do not add "אזור המרכז" or "קו הדרום" unless explicitly mentioned

  return Array.from(areas)
}

/**
 * Validate if a question mentions only allowed service areas
 * Rejects questions mentioning unauthorized locations
 */
export function containsUnauthorizedLocation(
  question: string,
  allowedServiceAreas: string[]
): boolean {
  if (!question) return false

  const lowerQuestion = question.toLowerCase()

  // All known Israeli cities/regions (comprehensive list)
  const allCities = [
    'ירושלים', 'תל אביב', 'הרצליה', 'פתח תקווה', 'בת ים', 'נתניה', 'ראשון לציון',
    'גבעתיים', 'עמק רפאים', 'הדסה', 'שערי צדק', 'חיפה', 'באר שבע', 'אשדוד',
    'אשקלון', 'לוד', 'רמלה', 'יפו', 'בת ים', 'רמת גן', 'בני ברק', 'גני תקווה',
    'הרצליה פיתוח', 'כפר סבא', 'קדימה', 'רמת השרון', 'צור יצחק', 'עמק עברים',
  ]

  const normalizedAllowed = allowedServiceAreas.map(a => a.toLowerCase())

  // Check if question mentions any city
  for (const city of allCities) {
    if (lowerQuestion.includes(city)) {
      // City is mentioned - check if it's allowed
      if (!normalizedAllowed.some(allowed => city.includes(allowed) || allowed.includes(city))) {
        return true // Unauthorized city found
      }
    }
  }

  // Check for region references that should not be inferred
  const unauthorizedRegions = ['אזור המרכז', 'קו הדרום', 'הצפון', 'הדרום', 'המרכז']
  for (const region of unauthorizedRegions) {
    if (lowerQuestion.includes(region.toLowerCase())) {
      // Region mentioned but not explicitly in allowed areas - reject
      return true
    }
  }

  return false
}

/**
 * Check if a question contains business name in quotation marks
 * Returns true if question should be rejected/normalized
 */
export function containsBusinessNameInQuotes(
  question: string,
  businessName: string | null | undefined
): boolean {
  if (!question || !businessName) return false

  const lowerQuestion = question.toLowerCase()
  const lowerBusiness = businessName.toLowerCase()

  // Check for quotes around business name: "חנות פרחים" or ״חנות פרחים״
  const quotePatterns = [
    `"${lowerBusiness}"`,
    `״${lowerBusiness}״`,
    `'${lowerBusiness}'`,
    `\`${lowerBusiness}\``,
  ]

  return quotePatterns.some(pattern => lowerQuestion.includes(pattern))
}

/**
 * Remove unnecessary quotes from questions
 */
export function normalizeQuotes(question: string, businessName?: string | null): string {
  if (!question) return question

  let normalized = question

  // Remove quotes around business name
  if (businessName) {
    const lowerBusiness = businessName.toLowerCase()
    // Match various quote styles
    normalized = normalized.replace(new RegExp(`[״"']${lowerBusiness}[״"']`, 'gi'), businessName)
  }

  // Remove other weird quote patterns
  normalized = normalized.replace(/["״"'`]+(\w+)["״"'`]+/g, '$1')

  return normalized
}

/**
 * Check if Hebrew text contains unnatural/broken phrases
 * Returns true if question should be rejected
 */
export function containsUnnaturalorBrokenHebrew(question: string): boolean {
  if (!question) return false

  // Unnatural Hebrew patterns to reject
  const unnatternalPatterns = [
    /בהרגעת\s+(הבוקר|הערב|היום)/i, // "in soothing the morning" - nonsense
    /בהגעת\s+/i, // "in arrival of" - weird phrasing unless clearly about arriving at location
    /משלוח\s+ל-[A-Z]{2}/i, // delivery to ISO code
    /עם\s+משלוח\s+ל-[A-Z]{2}/i, // with delivery to ISO code
    /בעיר\s+מרכזית/i, // "in a central city" - vague unless city is specified
    /חנות\s+אמינה\s+שעושה\s+משלוחים\s+מהירים/i, // awkward phrasing
    /כיצד\s+ניתן/i, // "how can one" - explicitly blocked pattern
    /מהן\s+האפשרויות/i, // "what are the options" - explicitly blocked
    /איפה\s+ניתן\s+למצוא/i, // "where can one find" - explicitly blocked
    /עם\s+משלוח\s+בהתאם/i, // awkward with delivery according
    /לפי\s+\[.*?\]/i, // template with bracketed placeholder
    /של\s+\[.*?\]/i, // template with bracketed placeholder
    /מה\s+המחיר\s+של\s+חבילה/i, // "what's the price of a package" - ambiguous/unclear reference
    /כמה\s+עולה\s+חבילה/i, // "how much does a package cost" - ambiguous/unclear reference
  ]

  for (const pattern of unnatternalPatterns) {
    if (pattern.test(question)) {
      return true
    }
  }

  // Check for suspicious quote patterns (broken HTML entities, etc.)
  if (question.includes('&quot;') || question.includes('&#') || question.includes('&#39;')) {
    return true
  }

  // Very short questions might be incomplete
  if (question.length < 10) {
    return true
  }

  // Question should end with question mark
  if (!question.trim().endsWith('?') && !question.trim().endsWith('?‍')) {
    return true
  }

  return false
}

/**
 * Detect "direct-address" questions — phrased as if speaking directly to the
 * business ("שלכם", "אצלכם", "אתם", "יש לכם") rather than asking an AI/search
 * engine in natural third person. These are poor for AI-visibility tracking
 * because the AI engine has no "you" to answer about.
 *
 * EXCEPTION: if the question also names the business explicitly, the
 * second-person phrasing is acceptable (it reads naturally) — but in practice
 * Gemini rarely combines both, so the safe default is to reject when a
 * direct-address marker is present and no business name is included.
 *
 * Examples rejected:
 *   "מה מדיניות ההחזרות שלכם?"
 *   "יש לכם משלוח פרחים?"
 *   "כמה עולה אצלכם זר ורדים?"
 *
 * Examples allowed (third-person / generic):
 *   "איפה אפשר להזמין זר ורדים עם משלוח?"
 *   "מה מדיניות ההחזרות של פרחי ארז?" (business name present)
 */
export function containsDirectAddress(question: string, businessName?: string | null): boolean {
  if (!question || typeof question !== 'string') return false

  const text = question.trim()

  // Second-person / direct-address markers (Hebrew). Word-boundary-ish via
  // surrounding whitespace or punctuation so we don't match inside other words.
  const directAddressPatterns = [
    /(^|[\s,.?!"׳״()-])שלכם($|[\s,.?!"׳״()-])/u,   // "...שלכם" (your, plural)
    /(^|[\s,.?!"׳״()-])שלכן($|[\s,.?!"׳״()-])/u,   // "...שלכן" (your, fem. plural)
    /(^|[\s,.?!"׳״()-])אצלכם($|[\s,.?!"׳״()-])/u,  // "at your place"
    /(^|[\s,.?!"׳״()-])אצלכן($|[\s,.?!"׳״()-])/u,
    /(^|[\s,.?!"׳״()-])אתם($|[\s,.?!"׳״()-])/u,    // "you" (plural)
    /(^|[\s,.?!"׳״()-])אתן($|[\s,.?!"׳״()-])/u,
    /(^|[\s,.?!"׳״()-])יש\s+לכם($|[\s,.?!"׳״()-])/u, // "do you have"
    /(^|[\s,.?!"׳״()-])יש\s+לכן($|[\s,.?!"׳״()-])/u,
    /(^|[\s,.?!"׳״()-])תוכלו($|[\s,.?!"׳״()-])/u,   // "can you (plural)"
    /(^|[\s,.?!"׳״()-])מציעים\s+לי($|[\s,.?!"׳״()-])/u,
  ]

  const hasDirectAddress = directAddressPatterns.some((p) => p.test(text))
  if (!hasDirectAddress) return false

  // Exception: if the business name appears naturally, second person is OK.
  if (businessName && businessName.trim().length > 1) {
    const bn = businessName.trim()
    if (text.includes(bn)) return false
  }

  return true
}

/**
 * Check if question is weak promotional or out-of-scope
 * Rejects:
 * - Unclear/awkward phrasing (לחנות, unclear references)
 * - Promotion/time-sensitive claims without context (הנחות, מבצע, היום, חגים, משלוח חינם)
 * - Used/second-hand questions unless applicable to business
 */
export function isWeakPromotionalQuestion(
  question: string,
  businessKeywords?: string[] | null
): boolean {
  if (!question || typeof question !== 'string') return false

  const lower = question.toLowerCase()
  const businessKeywordsLower = (businessKeywords || []).map((k) => k.toLowerCase())

  // Unclear phrasing patterns
  const unclearPatterns = [
    /לחנות\b/i, // "לחנות" (to store/shop) is unclear without context - should be "לבית" (to home) or omitted
    /משקולות.*לחנות/i, // dumbells for store (unclear context)
    /מה\s+המחיר\s+של\s+משקולות\s+מתכווננות\s+לחנות/i, // specific unclear example
  ]

  // Weak promotional/time-sensitive patterns (unless business explicitly in promo mode)
  const promotionalPatterns = [
    /\bהנחות\b/i, // discounts
    /\bמבצע\b/i, // sale/promotion
    /\bהיום\b/i, // today (time-sensitive)
    /לקראת\s+החגים/i, // before holidays
    /עד\s+סוף\s+החודש/i, // until end of month
    /משלוח\s+חינם/i, // free shipping
  ]

  // Used/second-hand patterns (only valid if business handles these)
  const secondHandPatterns = [
    /יד\s+שנייה/i, // second-hand
    /משומש/i, // used
    /מחודש/i, // refurbished
  ]

  // Check unclear phrasing
  for (const pattern of unclearPatterns) {
    if (pattern.test(question)) {
      return true
    }
  }

  // Check promotional - only reject if business doesn't explicitly offer promos
  const hasPromoMarker = promotionalPatterns.some((p) => p.test(question))
  if (hasPromoMarker) {
    // Check if business keywords include promo indicators
    const hasPromoKeyword = businessKeywordsLower.some((kw) =>
      ['הנחה', 'מבצע', 'קידום', 'הצעה', 'חסכון', 'הנחות'].some((pk) => kw.includes(pk))
    )
    if (!hasPromoKeyword) {
      return true // Reject promo questions if business doesn't advertise promos
    }
  }

  // Check second-hand - only reject if business doesn't handle used items
  const hasSecondHandMarker = secondHandPatterns.some((p) => p.test(question))
  if (hasSecondHandMarker) {
    // Check if business keywords include used/refurbished indicators
    const hasSecondHandKeyword = businessKeywordsLower.some((kw) =>
      ['יד שנייה', 'משומש', 'מחודש', 'רפורביש'].some((uk) => kw.includes(uk))
    )
    if (!hasSecondHandKeyword) {
      return true // Reject second-hand questions if business doesn't offer them
    }
  }

  return false
}

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
 * Check if a question is time-sensitive/promotional
 * Returns true if question should be rejected (assumes current promotions without evidence)
 */
export function isTimeOrPromotionSensitive(question: string): boolean {
  if (!question) return false

  const lowerQuestion = question.toLowerCase()

  // Time/promotion sensitive patterns
  const temporalPatterns = [
    /עד\s+סוף\s+ה(חודש|שבוע)/i, // until end of month/week in Hebrew
    /ב(חודש|שבוע)\s+ה/i, // in the current month/week
    /חודש\s+ז/i, // this month
    /שבוע\s+ז/i, // this week
    /מבצע/i, // sale/campaign
    /הנחה/i, // discount
    /קופון/i, // coupon
    /סייל/i, // sale
    /לתקופה\s+מוגבלת/i, // for limited time
    /עכשיו\s+בלבד/i, // only now
    /today only/i,
    /this month only/i,
    /this week only/i,
    /limited time/i,
    /special promotion/i,
    /current sale/i,
  ]

  return temporalPatterns.some(pattern => pattern.test(lowerQuestion))
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
