/**
 * AI Visibility — /api/ai-visibility/enriched-suggestions
 *
 * POST → get enriched suggestions for a project
 * Combines vNext (ai_prompts) + cached Gemini + new Gemini if needed
 *
 * Input:
 * {
 *   projectId: string
 *   language: 'he' | 'en'
 *   country?: string
 *   businessCategory?: string
 * }
 *
 * Returns:
 * {
 *   vNextQuestions: Array<{ id, prompt, ... }>
 *   cachedSuggestions: Array<{ id, question, intent, ... }>
 *   newSuggestions?: Array<{ question, intent, ... }>
 *   total: number
 *   source: 'vNext' | 'vNext+cache' | 'vNext+cache+gemini'
 * }
 *
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  loadCachedSuggestions,
  writeSuggestionsToCache,
  type CacheWriteResult,
  deduplicateSuggestions,
  computeContextHash,
  strongNormalize,
  strongDeduplicateSuggestions,
  extractAllowedLocations,
  containsDisallowedLocation,
  extractBusinessScope,
  filterSuggestionsByBusinessScope,
  getCountryDisplayName,
  containsISOCountryCodeLeak,
  isTimeOrPromotionSensitive,
  extractAllowedServiceAreas,
  containsUnauthorizedLocation,
  containsBusinessNameInQuotes,
  normalizeQuotes,
  containsUnnaturalorBrokenHebrew,
  containsDirectAddress,
  isWeakPromotionalQuestion,
} from '@/lib/ai-visibility/suggestion-cache'
import { generateProjectEnrichmentQuestions } from '@/lib/ai-visibility/gemini-semantic-classifier'
import {
  buildFallbackSuggestions,
  isLegacyWeakQuestion,
  QUESTION_GENERATION_VERSION,
  type BusinessCategory,
  type PromptIntent,
} from '@/lib/ai-visibility/prompt-templates'

/** Valid BusinessCategory values for coercing the free-form businessCategory param. */
const VALID_BUSINESS_CATEGORIES: BusinessCategory[] = [
  'agency', 'ecommerce', 'perfume', 'sports_store', 'gifts', 'appliance_store',
  'saas', 'product_brand', 'local_service', 'home_improvement_service', 'cleaning',
  'florist', 'restaurant', 'healthcare', 'legal', 'real_estate', 'fitness',
  'beauty', 'education', 'second_hand_fashion', 'generic',
]

function coerceBusinessCategory(raw?: string | null): BusinessCategory | null {
  if (!raw || typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  return (VALID_BUSINESS_CATEGORIES as string[]).includes(v) ? (v as BusinessCategory) : null
}

/**
 * Map a PromptIntent (from the intent engine) to one of the intent values the
 * cache CHECK constraint accepts: commercial | pre_purchase | informational |
 * comparison | recommendation | brand | local.
 */
function mapIntentForCache(intent: PromptIntent): string {
  switch (intent) {
    case 'transactional':
    case 'gift':
      return 'commercial'
    case 'alternatives':
      return 'comparison'
    case 'commercial':
    case 'pre_purchase':
    case 'informational':
    case 'comparison':
    case 'recommendation':
    case 'brand':
    case 'local':
      return intent
    default:
      return 'recommendation'
  }
}

async function authAndProject(projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id, target_domain, business_name, country, language, city, ai_business_profile')
    .eq('id', projectId)
    .single()

  if (projectError || !project) return { error: 'Project not found', status: 404 as const }
  if ((project as { user_id?: string }).user_id !== user.id) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { user, admin, project }
}

export async function POST(request: Request) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: {
    projectId?: string
    language?: 'he' | 'en'
    country?: string | null
    businessCategory?: string | null
    cacheOnly?: boolean
    forceRefresh?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { projectId, language = 'he', country, businessCategory, cacheOnly = false, forceRefresh = false } = body

  if (!projectId || !language) {
    return Response.json({ error: 'projectId and language are required' }, { status: 400 })
  }

  const result = await authAndProject(projectId)
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  const { admin, project } = result

  try {
    // Extract allowed locations and service areas from project data
    const allowedLocations = extractAllowedLocations(project as Record<string, any>)
    const allowedServiceAreas = extractAllowedServiceAreas(project as Record<string, any>)
    const businessScope = extractBusinessScope(project as Record<string, any>)

    console.log('[enriched-suggestions] API called', {
      projectId,
      language,
      country,
      businessCategory,
      allowedLocations: allowedLocations.length > 0 ? allowedLocations : '(none)',
      allowedServiceAreas: allowedServiceAreas.length > 0 ? allowedServiceAreas : '(none)',
      allowedTopics: businessScope.allowedTopics.length > 0 ? businessScope.allowedTopics : '(none)',
      excludedTerms: businessScope.excludedTerms.length > 0 ? businessScope.excludedTerms : '(none)',
    })

    // Step 1: Load vNext (ai_prompts) questions
    const { data: vNextData } = await admin
      .from('ai_prompts')
      .select('id, prompt, target_domain, target_brand_name, country, language, created_at')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    const vNextQuestions = vNextData || []
    const vNextSet = new Set(
      vNextQuestions
        .filter(q => q.prompt) // Filter out null/empty prompts
        .map(q => strongNormalize(q.prompt))
    )

    console.log('[enriched-suggestions] vNext questions loaded', {
      count: vNextQuestions.length,
      unique: vNextSet.size,
    })

    // Step 2: Load cached Gemini suggestions (status = 'suggested' only)
    // CRITICAL: Use consistent context_hash computation for cache lookup
    const contextHashForLoad = computeContextHash(projectId, language, country, businessCategory)

    const rawCachedSuggestions = await loadCachedSuggestions({
      projectId,
      language,
      country,
      businessCategory,
      keywordsHash: null
    })

    console.log('[enriched-suggestions] Cached suggestions lookup', {
      contextHash: contextHashForLoad,
      projectId,
      cacheOnly,
      language,
      country: country || '(none)',
      businessCategory: businessCategory || '(none)',
      count: rawCachedSuggestions.length,
    })

    // Track detailed rejection reasons for cached suggestions
    const cachedRejectionLog: Array<{
      question: string
      id?: string
      source?: string
      status?: string
      rejectionReasons: string[]
      displayed: boolean
    }> = []

    // Initialize with all loaded cached rows
    rawCachedSuggestions.forEach((row: any) => {
      cachedRejectionLog.push({
        question: row.question,
        id: row.id,
        source: row.source,
        status: row.status,
        rejectionReasons: [],
        displayed: true,
      })
    })

    // Filter cached suggestions by business scope
    const filteredCachedLogs: Array<{ question: string; reason: string }> = []
    let cachedSuggestions = filterSuggestionsByBusinessScope(
      rawCachedSuggestions,
      businessScope,
      (question, reason) => {
        filteredCachedLogs.push({ question, reason })
        const logEntry = cachedRejectionLog.find(l => l.question === question)
        if (logEntry) {
          logEntry.rejectionReasons.push(`business_scope: ${reason}`)
          logEntry.displayed = false
        }
      }
    )

    console.log('[enriched-suggestions] Cached suggestions filtered by business scope', {
      beforeFilter: rawCachedSuggestions.length,
      afterFilter: cachedSuggestions.length,
      filtered: filteredCachedLogs.length,
      examples: filteredCachedLogs.slice(0, 3),
    })

    // Apply Hebrew quality filter to cached suggestions — removes stale/bad entries
    if (language === 'he') {
      const beforeQuality = cachedSuggestions.length
      const rejectedByQuality: string[] = []
      cachedSuggestions = cachedSuggestions.filter(q => {
        const isBroken = containsUnnaturalorBrokenHebrew(q.question)
        if (isBroken) {
          rejectedByQuality.push(q.question)
          const logEntry = cachedRejectionLog.find(l => l.question === q.question && l.displayed)
          if (logEntry) {
            logEntry.rejectionReasons.push('bad_hebrew')
            logEntry.displayed = false
          }
        }
        return !isBroken
      })
      const rejectedCount = beforeQuality - cachedSuggestions.length
      if (rejectedCount > 0) {
        console.log('[enriched-suggestions] Removed stale cached suggestions via Hebrew quality filter', {
          count: rejectedCount,
          examples: rejectedByQuality.slice(0, 2),
        })
      }

      // Also strip stale direct-address cached entries ("שלכם", "אצלכם", ...)
      const beforeDirect = cachedSuggestions.length
      const rejectedByDirect: string[] = []
      cachedSuggestions = cachedSuggestions.filter(q => {
        const isDirect = containsDirectAddress(q.question, project.business_name)
        if (isDirect) {
          rejectedByDirect.push(q.question)
          const logEntry = cachedRejectionLog.find(l => l.question === q.question && l.displayed)
          if (logEntry) {
            logEntry.rejectionReasons.push('direct_address')
            logEntry.displayed = false
          }
        }
        return !isDirect
      })
      const rejectedCount2 = beforeDirect - cachedSuggestions.length
      if (rejectedCount2 > 0) {
        console.log('[enriched-suggestions] Removed stale cached suggestions via direct-address filter', {
          count: rejectedCount2,
          examples: rejectedByDirect.slice(0, 2),
        })
      }
    }

    // Log detailed rejection reasons for all cached rows that were filtered
    const cachedFiltered = cachedRejectionLog.filter(log => !log.displayed)
    if (cachedFiltered.length > 0) {
      console.log('[enriched-suggestions] CACHED SUGGESTION REJECTION DETAILS', {
        projectId,
        contextHash: contextHashForLoad,
        totalLoaded: rawCachedSuggestions.length,
        totalFiltered: cachedFiltered.length,
        totalDisplayed: cachedRejectionLog.filter(log => log.displayed).length,
        filteredDetails: cachedFiltered.map(log => ({
          question: log.question,
          id: log.id,
          source: log.source,
          status: log.status,
          rejectionReasons: log.rejectionReasons.length > 0 ? log.rejectionReasons : ['unknown'],
        })),
      })
    }

    // ========================================================================
    // PHASE 4: Server-side generation_version gate + intent_v2 floor
    // ------------------------------------------------------------------------
    // Legacy row  = generation_version !== QUESTION_GENERATION_VERSION (NULL/old).
    // Rules:
    //   * Apply a server-side quality gate to EVERY cached row (any version):
    //     drop legacy/weak/slug/domain/raw-category phrasings (isLegacyWeakQuestion).
    //   * force_refresh=true: additionally drop ALL legacy rows outright (bypass
    //     old cache completely) and force fresh intent_v2 generation.
    //   * If the surviving quality pool (cache + vNext) falls below the floor,
    //     generate fresh intent_v2 questions, persist them as 'intent_v2', and
    //     reload so the API returns only vetted rows.
    // This never deletes rows and never touches ai_prompts (user tracked/active
    // questions). It only changes which cached suggestions are RETURNED.
    // ========================================================================
    const cacheRowsCount = rawCachedSuggestions.length
    const legacyRowsCount = rawCachedSuggestions.filter(
      (r: any) => (r.generation_version || null) !== QUESTION_GENERATION_VERSION
    ).length
    let legacyRowsRejected = 0
    let intentV2GeneratedCount = 0

    cachedSuggestions = cachedSuggestions.filter((row: any) => {
      const isLegacyVersion = (row.generation_version || null) !== QUESTION_GENERATION_VERSION

      // force_refresh: bypass legacy cache entirely.
      if (forceRefresh && isLegacyVersion) {
        legacyRowsRejected++
        return false
      }
      // Server-side quality gate (all versions): drop weak/slug/domain/template.
      if (isLegacyWeakQuestion(row.question, language)) {
        legacyRowsRejected++
        return false
      }
      return true
    })

    // Quality pool that already exists (cache + active vNext prompts that pass the gate).
    const vNextQualityCount = vNextQuestions.filter(
      q => q.prompt && !isLegacyWeakQuestion(q.prompt, language)
    ).length
    const MIN_QUALITY_FLOOR = 4

    // Generate fresh intent_v2 questions when the pool is depleted, or always on
    // force_refresh (so the user gets new questions after bypassing legacy cache).
    if (!cacheOnly && (forceRefresh || cachedSuggestions.length + vNextQualityCount < MIN_QUALITY_FLOOR)) {
      const generated = buildFallbackSuggestions(
        project.business_name || null,
        project.business_name || null,
        project.target_domain || null,
        coerceBusinessCategory(businessCategory) ?? coerceBusinessCategory(businessScope.businessCategory),
        project.city || null,
        [],
        [],
        language
      )

      const intentV2Candidates = generated
        .filter(s => s.confidenceTier !== 'insufficient_context')
        .filter(s => !isLegacyWeakQuestion(s.prompt, language))
        .map(s => ({ question: s.prompt, intent: mapIntentForCache(s.intent) }))

      // Dedup against existing vNext + surviving cached rows.
      const dedupedIntentV2 = deduplicateSuggestions(
        intentV2Candidates,
        vNextQuestions.map(q => ({ question: q.prompt })),
        cachedSuggestions,
        []
      )

      if (dedupedIntentV2.length > 0) {
        const writeRes = await writeSuggestionsToCache(
          projectId,
          dedupedIntentV2.map(s => ({ question: s.question, intent: s.intent, model_used: 'intent_v2' })),
          { projectId, language, country, businessCategory },
          QUESTION_GENERATION_VERSION
        )
        intentV2GeneratedCount = writeRes.rowsInserted

        // Reload so the returned set includes the freshly persisted intent_v2 rows,
        // then re-apply the server-side quality gate (intent_v2 rows pass it).
        const reloaded = await loadCachedSuggestions({
          projectId, language, country, businessCategory, keywordsHash: null,
        })
        cachedSuggestions = reloaded.filter((row: any) => {
          if (forceRefresh && (row.generation_version || null) !== QUESTION_GENERATION_VERSION) return false
          return !isLegacyWeakQuestion(row.question, language)
        })
      }
    }

    console.log('[ai-question-suggestions] generation_version gate', {
      'cache rows count': cacheRowsCount,
      'legacy rows count': legacyRowsCount,
      'legacy rows rejected': legacyRowsRejected,
      'generation version': QUESTION_GENERATION_VERSION,
      'force refresh': forceRefresh,
      'intent_v2 generated count': intentV2GeneratedCount,
      'cached after gate': cachedSuggestions.length,
    })

    const cachedSet = new Set(cachedSuggestions.map(q => strongNormalize(q.question)))

    // Step 3: Count unique questions so far
    const uniqueCount = vNextSet.size + (cachedSuggestions.length - Array.from(cachedSuggestions).filter(c => vNextSet.has(strongNormalize(c.question))).length)

    console.log('[enriched-suggestions] Unique count', {
      vNextUnique: vNextSet.size,
      cachedUnique: cachedSuggestions.length - Array.from(cachedSuggestions).filter(c => vNextSet.has(strongNormalize(c.question))).length,
      totalUnique: uniqueCount,
    })

    // Step 4: Gemini fill policy with MIN_RECOMMENDED_POOL contract.
    // MIN_RECOMMENDED_POOL: target minimum 30 questions (GLOBAL CONTRACT)
    // MAX_POOL: hard cap at 40 to prevent unbounded growth
    // If pool stays below 30, logs explain why (no silent failures)
    const MIN_RECOMMENDED_POOL = 30
    const MAX_POOL = 40
    const MIN_GEMINI_REQUEST = 15
    const MAX_GEMINI_REQUEST = 30
    let newSuggestions: Array<{ question: string; intent: string; model_used?: string }> = []
    let source: 'vNext' | 'vNext+cache' | 'vNext+cache+gemini' = 'vNext'
    let geminiWasCalled = false
    let geminiNotCalledReason = ''
    let cacheWriteResult: CacheWriteResult | null = null

    // Track Gemini generation details for debugging
    let geminiGenerationResult = {
      rawCount: 0,
      parsedCount: 0,
      afterValidationCount: 0,
      dedupedCount: 0,
      savedToCacheCount: 0,
      rejectionReasons: {} as Record<string, number>,
    }

    if (cacheOnly) {
      source = cachedSuggestions.length > 0 ? 'vNext+cache' : 'vNext'
      geminiNotCalledReason = 'cache_only_mode'
      console.log('[enriched-suggestions] Skipping Gemini (cacheOnly mode)', {
        cacheOnly,
        uniqueCount,
        cachedCount: cachedSuggestions.length,
        minRecommendedPool: MIN_RECOMMENDED_POOL,
      })
    } else if (uniqueCount < MAX_POOL && uniqueCount < MIN_RECOMMENDED_POOL) {
      // GLOBAL CONTRACT: Fill toward MIN_RECOMMENDED_POOL (30) as target.
      // Only stop if we reach MAX_POOL (40) or pool is full enough.
      // Scale Gemini request: if 13 questions and need 17 to reach 30,
      // ask for 2.5x (~42), capped between 15–30.
      const targetNeeded = Math.max(0, MIN_RECOMMENDED_POOL - uniqueCount)
      const candidateCount = Math.min(
        MAX_GEMINI_REQUEST,
        Math.max(MIN_GEMINI_REQUEST, Math.ceil(targetNeeded * 2.5))
      )

      source = 'vNext+cache+gemini'
      geminiWasCalled = true

      // Convert country code to display name for Gemini
      const countryForGemini = country ? getCountryDisplayName(country) : undefined

      console.log('[enriched-suggestions] Calling Gemini (pool below MIN)', {
        uniqueCount,
        minRecommendedPool: MIN_RECOMMENDED_POOL,
        targetNeeded,
        candidateRequest: candidateCount,
        maxPool: MAX_POOL,
        projectName: project.business_name || '(empty)',
        projectDomain: project.target_domain || '(empty)',
        language,
        countryCode: country || '(not specified)',
        countryDisplay: countryForGemini || '(not specified)',
      })

      // Generate new suggestions from Gemini based on project profile
      let geminiSuggestions: any[] = []
      try {
        geminiSuggestions = await generateProjectEnrichmentQuestions(
          project.business_name || 'Project',
          project.target_domain || '',
          language,
          countryForGemini, // Pass display name, not code
          allowedLocations,
          businessScope,
          candidateCount // Pass the scaled candidate count
        )

        geminiGenerationResult.rawCount = geminiSuggestions.length

        console.log('[enriched-suggestions] Gemini returned raw candidates', {
          count: geminiSuggestions.length,
          requestedCandidates: candidateCount,
          model: process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite',
          projectId,
          projectName: project.business_name || '(empty)',
        })
      } catch (geminiErr) {
        const errMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
        console.error('[enriched-suggestions] Gemini call failed:', {
          error: errMsg,
          projectId,
          requestedCandidates: candidateCount,
        })
        geminiSuggestions = []
      }

      // 11-Layer validation pipeline for production quality
      // Track what gets filtered out at each step
      let filteringLogs = {
        isoCodeLeak: [] as Array<{ question: string }>,
        temporal: [] as Array<{ question: string }>,
        locationDisallowed: [] as Array<{ question: string }>,
        serviceAreaUnauthorized: [] as Array<{ question: string }>,
        businessNameQuotes: [] as Array<{ question: string }>,
        hebrewQuality: [] as Array<{ question: string }>,
        directAddress: [] as Array<{ question: string }>,
        weakPromotion: [] as Array<{ question: string }>,
        businessScope: [] as Array<{ question: string; reason: string }>,
      }

      let filtered = geminiSuggestions
      const filterTracker = {
        start: geminiSuggestions.length,
        afterISO: 0,
        afterTemporal: 0,
        afterLocation: 0,
        afterServiceArea: 0,
        afterBusinessName: 0,
        afterHebrew: 0,
        afterDirectAddress: 0,
        afterWeakPromo: 0,
        afterScope: 0,
      }

      // 1. ISO country code leak detection
      filtered = filtered.filter(g => {
        const hasLeak = containsISOCountryCodeLeak(g.question)
        if (hasLeak) filteringLogs.isoCodeLeak.push({ question: g.question })
        return !hasLeak
      })
      filterTracker.afterISO = filtered.length

      // 2. Temporal/promotion sensitivity detection
      filtered = filtered.filter(g => {
        const isTemporal = isTimeOrPromotionSensitive(g.question)
        if (isTemporal) filteringLogs.temporal.push({ question: g.question })
        return !isTemporal
      })
      filterTracker.afterTemporal = filtered.length

      // 3. Disallowed location validation (legacy check)
      filtered = filtered.filter(g => {
        const hasDisallowed = containsDisallowedLocation(g.question, allowedLocations)
        if (hasDisallowed) filteringLogs.locationDisallowed.push({ question: g.question })
        return !hasDisallowed
      })

      // 4. Service area authorization (comprehensive)
      if (allowedServiceAreas.length > 0) {
        filtered = filtered.filter(g => {
          const hasUnauthorized = containsUnauthorizedLocation(g.question, allowedServiceAreas)
          if (hasUnauthorized) filteringLogs.serviceAreaUnauthorized.push({ question: g.question })
          return !hasUnauthorized
        })
      }

      // 5. Business name quote normalization and rejection
      filtered = filtered.map(g => {
        const hasQuotes = containsBusinessNameInQuotes(g.question, project.business_name)
        if (hasQuotes) {
          filteringLogs.businessNameQuotes.push({ question: g.question })
          return { ...g, question: normalizeQuotes(g.question, project.business_name) }
        }
        return g
      }).filter(g => {
        // Reject if after normalization still looks like quoted name
        return !containsBusinessNameInQuotes(g.question, project.business_name)
      })

      // 6. Hebrew quality validation
      if (language === 'he') {
        filtered = filtered.filter(g => {
          const isBroken = containsUnnaturalorBrokenHebrew(g.question)
          if (isBroken) filteringLogs.hebrewQuality.push({ question: g.question })
          return !isBroken
        })
      }

      // 6b. Direct-address rejection — questions phrased AT the business
      // ("שלכם", "אצלכם", "אתם", "יש לכם") read unnaturally for AI/search and
      // are poor for visibility tracking, unless they name the business.
      if (language === 'he') {
        filtered = filtered.filter(g => {
          const isDirectAddress = containsDirectAddress(g.question, project.business_name)
          if (isDirectAddress) filteringLogs.directAddress.push({ question: g.question })
          return !isDirectAddress
        })
      }

      // 6c. Weak promotional/unclear phrasing — reject time-sensitive promo claims
      // and unclear phrasing unless business explicitly offers these
      if (language === 'he') {
        filtered = filtered.filter(g => {
          const isWeakPromo = isWeakPromotionalQuestion(g.question, [])
          if (isWeakPromo) filteringLogs.weakPromotion.push({ question: g.question })
          return !isWeakPromo
        })
      }

      // 7. Business scope validation
      const scopeFilteredLogs: Array<{ question: string; reason: string }> = []
      filtered = filterSuggestionsByBusinessScope(
        filtered,
        businessScope,
        (question, reason) => {
          scopeFilteredLogs.push({ question, reason })
        }
      )
      filteringLogs.businessScope = scopeFilteredLogs

      console.log('[enriched-suggestions] Gemini output 11-layer filtering', {
        original: geminiSuggestions.length,
        afterISOCodeFilter: geminiSuggestions.length - filteringLogs.isoCodeLeak.length,
        isoCodeFiltered: filteringLogs.isoCodeLeak.length,
        afterTemporalFilter: geminiSuggestions.length - filteringLogs.isoCodeLeak.length - filteringLogs.temporal.length,
        temporalFiltered: filteringLogs.temporal.length,
        afterLocationFilter: geminiSuggestions.length - filteringLogs.isoCodeLeak.length - filteringLogs.temporal.length - filteringLogs.locationDisallowed.length,
        locationFiltered: filteringLogs.locationDisallowed.length,
        afterServiceAreaFilter: geminiSuggestions.length - filteringLogs.isoCodeLeak.length - filteringLogs.temporal.length - filteringLogs.locationDisallowed.length - filteringLogs.serviceAreaUnauthorized.length,
        serviceAreaFiltered: filteringLogs.serviceAreaUnauthorized.length,
        afterBusinessNameFilter: geminiSuggestions.length - filteringLogs.isoCodeLeak.length - filteringLogs.temporal.length - filteringLogs.locationDisallowed.length - filteringLogs.serviceAreaUnauthorized.length - filteringLogs.businessNameQuotes.length,
        businessNameFiltered: filteringLogs.businessNameQuotes.length,
        afterHebrewQualityFilter: geminiSuggestions.length - filteringLogs.isoCodeLeak.length - filteringLogs.temporal.length - filteringLogs.locationDisallowed.length - filteringLogs.serviceAreaUnauthorized.length - filteringLogs.businessNameQuotes.length - filteringLogs.hebrewQuality.length,
        hebrewQualityFiltered: filteringLogs.hebrewQuality.length,
        directAddressFiltered: filteringLogs.directAddress.length,
        weakPromotionFiltered: filteringLogs.weakPromotion.length,
        afterScopeFilter: filtered.length,
        scopeFiltered: filteringLogs.businessScope.length,
        exampleFilters: {
          isoCode: filteringLogs.isoCodeLeak.slice(0, 1),
          temporal: filteringLogs.temporal.slice(0, 1),
          serviceArea: filteringLogs.serviceAreaUnauthorized.slice(0, 1),
          hebrewQuality: filteringLogs.hebrewQuality.slice(0, 1),
          directAddress: filteringLogs.directAddress.slice(0, 1),
          weakPromotion: filteringLogs.weakPromotion.slice(0, 1),
        }
      })

      geminiSuggestions = filtered
      geminiGenerationResult.afterValidationCount = filtered.length

      // Deduplicate against vNext and cache
      const deduped = deduplicateSuggestions(
        geminiSuggestions.map(g => ({ question: g.question, intent: g.intent })),
        vNextQuestions.map(q => ({ question: q.prompt })),
        cachedSuggestions,
        []
      )

      geminiGenerationResult.dedupedCount = deduped.length

      // Cap so total unique persisted suggestions approaches MAX_POOL (40),
      // letting the cache accumulate a large expanded pool across clicks.
      const maxToAdd = Math.max(3, MAX_POOL - uniqueCount)
      newSuggestions = deduped.slice(0, maxToAdd).map(s => ({
        question: s.question,
        intent: s.intent,
        model_used: process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
      }))

      geminiGenerationResult.savedToCacheCount = newSuggestions.length

      console.log('[enriched-suggestions] GEMINI_GENERATION_FLOW', {
        projectId,
        geminiWasCalled,
        rawCount: geminiGenerationResult.rawCount,
        afterValidationCount: geminiGenerationResult.afterValidationCount,
        validationFiltersApplied: {
          isoCodeLeak: filteringLogs.isoCodeLeak.length,
          temporal: filteringLogs.temporal.length,
          locationDisallowed: filteringLogs.locationDisallowed.length,
          serviceAreaUnauthorized: filteringLogs.serviceAreaUnauthorized.length,
          businessNameQuotes: filteringLogs.businessNameQuotes.length,
          hebrewQuality: filteringLogs.hebrewQuality.length,
          directAddress: filteringLogs.directAddress.length,
          weakPromotion: filteringLogs.weakPromotion.length,
          businessScope: filteringLogs.businessScope.length,
        },
        afterDedupCount: deduped.length,
        savedToCacheCount: newSuggestions.length,
        reasonIfZero: newSuggestions.length === 0 ? 'all_filtered_or_deduped' : null,
      })

      // Write new suggestions to cache
      if (newSuggestions.length > 0) {
        cacheWriteResult = await writeSuggestionsToCache(
          projectId,
          newSuggestions,
          { projectId, language, country, businessCategory }
        )

        if (!cacheWriteResult.success || cacheWriteResult.rowsVisibleAfterWrite === 0) {
          console.error('[enriched-suggestions] CRITICAL: Cache write did NOT persist!', {
            ...cacheWriteResult,
            writeContextHash: cacheWriteResult.contextHash,
            readContextHash: contextHashForLoad,
            contextHashMatches: cacheWriteResult.contextHash === contextHashForLoad,
          })
        } else {
          console.log('[enriched-suggestions] Cache write SUCCESS (Gemini → DB)', {
            ...cacheWriteResult,
            writeContextHash: cacheWriteResult.contextHash,
            readContextHash: contextHashForLoad,
            contextHashMatches: cacheWriteResult.contextHash === contextHashForLoad,
          })

          // PHASE 2 FIX: Reload cache after write to ensure we only return persisted questions
          // This guarantees that displayed recommendations are stable across refresh
          const reloadedCachedSuggestions = await loadCachedSuggestions({
            projectId,
            language,
            country,
            businessCategory,
            keywordsHash: null
          })

          console.log('[enriched-suggestions] Cache reloaded after Gemini write', {
            beforeReload: cachedSuggestions.length,
            afterReload: reloadedCachedSuggestions.length,
            newQuestionsWritten: newSuggestions.length,
            contextHash: contextHashForLoad,
          })

          // Replace cachedSuggestions with freshly loaded cache
          // This ensures final dedup operates on persisted data only
          cachedSuggestions = reloadedCachedSuggestions
          newSuggestions = [] // Clear newSuggestions; they're now in cachedSuggestions after reload
        }
      }
    } else {
      source = cachedSuggestions.length > 0 ? 'vNext+cache' : 'vNext'
      geminiNotCalledReason = 'pool_full_max_reached'
      console.log('[enriched-suggestions] Gemini not called (pool at MAX_POOL)', {
        uniqueCount,
        minRecommendedPool: MIN_RECOMMENDED_POOL,
        maxPool: MAX_POOL,
      })
    }

    // Step 5: STRONG DEDUPLICATION across all sources
    // Apply strong normalization: quotes, dashes, spaces, case, punctuation
    const { dedupedQuestions, duplicateCount, removalLog } = strongDeduplicateSuggestions(
      vNextQuestions,
      cachedSuggestions,
      newSuggestions
    )

    console.log('[enriched-suggestions] Strong dedup results', {
      beforeDedup: vNextQuestions.length + cachedSuggestions.length + newSuggestions.length,
      afterDedup: dedupedQuestions.length,
      duplicatesRemoved: duplicateCount,
      bySource: {
        vNext: dedupedQuestions.filter(q => q.source === 'vNext').length,
        cached: dedupedQuestions.filter(q => q.source === 'cached').length,
        gemini: dedupedQuestions.filter(q => q.source === 'gemini').length,
      },
    })

    // Log detailed removal reasons grouped by source
    const removalsBySource = {
      vNext: removalLog.filter(r => r.source === 'vNext').length,
      cached: removalLog.filter(r => r.source === 'cached').length,
      gemini: removalLog.filter(r => r.source === 'gemini').length,
    }
    const removalsByReason = {
      exact_duplicate: removalLog.filter(r => r.removedReason === 'exact_duplicate').length,
      semantic_duplicate: removalLog.filter(r => r.removedReason === 'semantic_duplicate').length,
    }
    console.log('[enriched-suggestions] Detailed dedup removal analysis', {
      totalRemoved: removalLog.length,
      removalsBySource,
      removalsByReason,
      allRemovals: removalLog.map(r => ({
        removedQuestion: r.question,
        duplicateOf: r.removedAsDuplicateOf,
        duplicateReason: r.removedReason,
        source: r.source,
      })),
    })

    // Sample top questions for logging
    const sampleQuestions = dedupedQuestions.slice(0, 3).map(q => `"${q.question}" (${q.source})`)
    console.log('[enriched-suggestions] Top deduplicated questions', {
      count: dedupedQuestions.length,
      samples: sampleQuestions,
    })

    // POOL HEALTH LOG — explains if final pool meets MIN_RECOMMENDED_POOL target
    const poolBelowTarget = dedupedQuestions.length < MIN_RECOMMENDED_POOL
    let belowTargetReason = ''
    if (poolBelowTarget) {
      if (geminiWasCalled && geminiGenerationResult.savedToCacheCount === 0) {
        belowTargetReason = 'gemini_called_but_zero_survived'
      } else if (!geminiWasCalled && cacheOnly) {
        belowTargetReason = 'cache_only_mode_insufficient'
      } else if (!geminiWasCalled && !cacheOnly) {
        belowTargetReason = 'should_have_called_gemini'
      } else {
        belowTargetReason = 'unknown'
      }
    }

    console.log('[enriched-suggestions] POOL_HEALTH', {
      projectId,
      minRecommendedPool: MIN_RECOMMENDED_POOL,
      maxPool: MAX_POOL,
      finalPoolSize: dedupedQuestions.length,
      meetsTarget: !poolBelowTarget,
      belowTargetReason: poolBelowTarget ? belowTargetReason : null,
      breakdown: {
        vNext: dedupedQuestions.filter(q => q.source === 'vNext').length,
        cached: dedupedQuestions.filter(q => q.source === 'cached').length,
        gemini: dedupedQuestions.filter(q => q.source === 'gemini').length,
      },
      geminiMetrics: {
        called: geminiWasCalled,
        rawCount: geminiGenerationResult.rawCount,
        afterValidation: geminiGenerationResult.afterValidationCount,
        dedupedCount: geminiGenerationResult.dedupedCount,
        savedToCache: geminiGenerationResult.savedToCacheCount,
        notCalledReason: !geminiWasCalled ? geminiNotCalledReason : null,
      },
    })

    // CACHE VERIFICATION LOGGING for debugging
    console.log('[enriched-suggestions] CACHE VERIFICATION', {
      cacheOnly,
      contextHash: contextHashForLoad,
      vNextCount: vNextQuestions.length,
      cachedLoadedRaw: rawCachedSuggestions.length,
      cachedAfterScopeFilter: cachedSuggestions.length,
      cachedRejectedCount: rawCachedSuggestions.length - cachedSuggestions.length,
      cachedFiltered: filteredCachedLogs.length,
      cachedRejectedReasons: filteredCachedLogs.slice(0, 5).map(f => f.reason),
      newGeminiSuggestions: newSuggestions.length,
      geminiWasCalled,
      uniqueCountBefore: uniqueCount,
      uniqueCountAfter: dedupedQuestions.length,
      minRecommendedPool: MIN_RECOMMENDED_POOL,
      maxPool: MAX_POOL,
      geminiNotCalledReason: geminiWasCalled ? 'N/A' : geminiNotCalledReason,
    })

    console.log('[ai-question-suggestions] final returned count', {
      'final returned count': dedupedQuestions.length,
      'generation version': QUESTION_GENERATION_VERSION,
      'force refresh': forceRefresh,
    })

    return Response.json({
      vNextQuestions,
      cachedSuggestions,
      newSuggestions,
      dedupedQuestions,
      total: dedupedQuestions.length,
      duplicatesRemoved: duplicateCount,
      source,
      geminiWasCalled,
      geminiNotCalledReason: geminiWasCalled ? null : geminiNotCalledReason,
      contextHash: contextHashForLoad,
      cacheWrite: cacheWriteResult,
      generationVersion: QUESTION_GENERATION_VERSION,
      forceRefresh,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[Enriched Suggestions API] Error:', errorMsg)

    return Response.json(
      { error: 'Failed to generate enriched suggestions' },
      { status: 500 }
    )
  }
}
