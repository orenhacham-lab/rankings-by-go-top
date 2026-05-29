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
} from '@/lib/ai-visibility/suggestion-cache'
import { generateProjectEnrichmentQuestions } from '@/lib/ai-visibility/gemini-semantic-classifier'

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
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { projectId, language = 'he', country, businessCategory } = body

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
    const rawCachedSuggestions = await loadCachedSuggestions({
      projectId,
      language,
      country,
      businessCategory,
      keywordsHash: null
    })

    console.log('[enriched-suggestions] Cached suggestions loaded (before scope filter)', {
      count: rawCachedSuggestions.length,
    })

    // Filter cached suggestions by business scope
    const filteredCachedLogs: Array<{ question: string; reason: string }> = []
    const cachedSuggestions = filterSuggestionsByBusinessScope(
      rawCachedSuggestions,
      businessScope,
      (question, reason) => {
        filteredCachedLogs.push({ question, reason })
      }
    )

    console.log('[enriched-suggestions] Cached suggestions filtered by business scope', {
      beforeFilter: rawCachedSuggestions.length,
      afterFilter: cachedSuggestions.length,
      filtered: filteredCachedLogs.length,
      examples: filteredCachedLogs.slice(0, 3),
    })

    const cachedSet = new Set(cachedSuggestions.map(q => strongNormalize(q.question)))

    // Step 3: Count unique questions so far
    const uniqueCount = vNextSet.size + (cachedSuggestions.length - Array.from(cachedSuggestions).filter(c => vNextSet.has(strongNormalize(c.question))).length)

    console.log('[enriched-suggestions] Unique count', {
      vNextUnique: vNextSet.size,
      cachedUnique: cachedSuggestions.length - Array.from(cachedSuggestions).filter(c => vNextSet.has(strongNormalize(c.question))).length,
      totalUnique: uniqueCount,
    })

    // Step 4: If <20 total unique, call Gemini for new suggestions
    const QUALITY_THRESHOLD = 20
    let newSuggestions: Array<{ question: string; intent: string; model_used?: string }> = []
    let source: 'vNext' | 'vNext+cache' | 'vNext+cache+gemini' = 'vNext'
    let geminiWasCalled = false

    if (uniqueCount < QUALITY_THRESHOLD) {
      source = cachedSuggestions.length > 0 ? 'vNext+cache+gemini' : 'vNext+cache+gemini'
      geminiWasCalled = true

      // Convert country code to display name for Gemini
      const countryForGemini = country ? getCountryDisplayName(country) : undefined

      console.log('[enriched-suggestions] Calling Gemini (threshold not met)', {
        uniqueCount,
        threshold: QUALITY_THRESHOLD,
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
          businessScope
        )

        console.log('[enriched-suggestions] Gemini returned', {
          count: geminiSuggestions.length,
          model: process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite',
        })
      } catch (geminiErr) {
        const errMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
        console.error('[enriched-suggestions] Gemini call failed:', errMsg)
        geminiSuggestions = []
      }

      // 11-Layer validation pipeline for production quality
      let filteringLogs = {
        isoCodeLeak: [] as Array<{ question: string }>,
        temporal: [] as Array<{ question: string }>,
        locationDisallowed: [] as Array<{ question: string }>,
        serviceAreaUnauthorized: [] as Array<{ question: string }>,
        businessNameQuotes: [] as Array<{ question: string }>,
        hebrewQuality: [] as Array<{ question: string }>,
        businessScope: [] as Array<{ question: string; reason: string }>,
      }

      let filtered = geminiSuggestions

      // 1. ISO country code leak detection
      filtered = filtered.filter(g => {
        const hasLeak = containsISOCountryCodeLeak(g.question)
        if (hasLeak) filteringLogs.isoCodeLeak.push({ question: g.question })
        return !hasLeak
      })

      // 2. Temporal/promotion sensitivity detection
      filtered = filtered.filter(g => {
        const isTemporal = isTimeOrPromotionSensitive(g.question)
        if (isTemporal) filteringLogs.temporal.push({ question: g.question })
        return !isTemporal
      })

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
        afterScopeFilter: filtered.length,
        scopeFiltered: filteringLogs.businessScope.length,
        exampleFilters: {
          isoCode: filteringLogs.isoCodeLeak.slice(0, 1),
          temporal: filteringLogs.temporal.slice(0, 1),
          serviceArea: filteringLogs.serviceAreaUnauthorized.slice(0, 1),
          hebrewQuality: filteringLogs.hebrewQuality.slice(0, 1),
        }
      })

      geminiSuggestions = filtered

      // Deduplicate against vNext and cache
      const deduped = deduplicateSuggestions(
        geminiSuggestions.map(g => ({ question: g.question, intent: g.intent })),
        vNextQuestions.map(q => ({ question: q.prompt })),
        cachedSuggestions,
        []
      )

      // Cap at reasonable number to fill threshold
      const maxToAdd = Math.max(3, QUALITY_THRESHOLD - uniqueCount)
      newSuggestions = deduped.slice(0, maxToAdd).map(s => ({
        question: s.question,
        intent: s.intent,
        model_used: process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
      }))

      console.log('[enriched-suggestions] After dedup and cap', {
        maxToAdd,
        newCount: newSuggestions.length,
      })

      // Write new suggestions to cache
      if (newSuggestions.length > 0) {
        const writeSuccess = await writeSuggestionsToCache(
          projectId,
          newSuggestions,
          { projectId, language, country, businessCategory }
        )

        console.log('[enriched-suggestions] Cache write', {
          success: writeSuccess,
          count: newSuggestions.length,
        })

        // Add to cached list for response
        cachedSuggestions.push(
          ...newSuggestions.map(s => ({
            id: `generated-${Date.now()}-${Math.random()}`,
            question: s.question,
            intent: s.intent,
            model_used: s.model_used || null,
            created_at: new Date().toISOString()
          }))
        )
      }
    } else {
      source = cachedSuggestions.length > 0 ? 'vNext+cache' : 'vNext'
      console.log('[enriched-suggestions] Gemini not called (threshold met)', {
        uniqueCount,
        threshold: QUALITY_THRESHOLD,
      })
    }

    // Step 5: STRONG DEDUPLICATION across all sources
    // Apply strong normalization: quotes, dashes, spaces, case, punctuation
    const { dedupedQuestions, duplicateCount } = strongDeduplicateSuggestions(
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

    // Sample top questions for logging
    const sampleQuestions = dedupedQuestions.slice(0, 3).map(q => `"${q.question}" (${q.source})`)
    console.log('[enriched-suggestions] Top deduplicated questions', {
      count: dedupedQuestions.length,
      samples: sampleQuestions,
    })

    // CACHE VERIFICATION LOGGING for debugging
    console.log('[enriched-suggestions] CACHE VERIFICATION', {
      vNextCount: vNextQuestions.length,
      cachedLoadedRaw: rawCachedSuggestions.length,
      cachedAfterScopeFilter: cachedSuggestions.length,
      cachedFiltered: filteredCachedLogs.length,
      newGeminiSuggestions: newSuggestions.length,
      geminiWasCalled,
      uniqueCountBefore: uniqueCount,
      uniqueCountAfter: dedupedQuestions.length,
      threshold: QUALITY_THRESHOLD,
      geminiNotCalledReason: geminiWasCalled ? 'N/A' : 'threshold met or >= 20 unique',
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
