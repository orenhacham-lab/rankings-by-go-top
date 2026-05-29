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
import { loadCachedSuggestions, writeSuggestionsToCache, deduplicateSuggestions, computeContextHash, normalizeQuestion } from '@/lib/ai-visibility/suggestion-cache'
import { classifyKeywordsWithGemini, generateFallbackQuestions } from '@/lib/ai-visibility/gemini-semantic-classifier'

async function authAndProject(projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id, target_domain, business_name, country, language')
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
    console.log('[enriched-suggestions] API called', {
      projectId,
      language,
      country,
      businessCategory,
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
        .map(q => normalizeQuestion(q.prompt))
    )

    console.log('[enriched-suggestions] vNext questions loaded', {
      count: vNextQuestions.length,
      unique: vNextSet.size,
    })

    // Step 2: Load cached Gemini suggestions (status = 'suggested' only)
    const cachedSuggestions = await loadCachedSuggestions({
      projectId,
      language,
      country,
      businessCategory,
      keywordsHash: null
    })

    console.log('[enriched-suggestions] Cached Gemini suggestions loaded', {
      count: cachedSuggestions.length,
    })

    const cachedSet = new Set(cachedSuggestions.map(q => normalizeQuestion(q.question)))

    // Step 3: Count unique questions so far
    const uniqueCount = vNextSet.size + (cachedSuggestions.length - Array.from(cachedSuggestions).filter(c => vNextSet.has(normalizeQuestion(c.question))).length)

    console.log('[enriched-suggestions] Unique count', {
      vNextUnique: vNextSet.size,
      cachedUnique: cachedSuggestions.length - Array.from(cachedSuggestions).filter(c => vNextSet.has(normalizeQuestion(c.question))).length,
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

      console.log('[enriched-suggestions] Calling Gemini (threshold not met)', {
        uniqueCount,
        threshold: QUALITY_THRESHOLD,
      })

      // Generate new suggestions from Gemini
      const geminiSuggestions = await generateFallbackQuestions(
        project.business_name || '',
        project.target_domain || '',
        language,
        country || undefined
      )

      console.log('[enriched-suggestions] Gemini returned', {
        count: geminiSuggestions.length,
      })

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

    const finalTotal = vNextQuestions.length + cachedSuggestions.filter(c => !vNextSet.has(normalizeQuestion(c.question))).length

    console.log('[enriched-suggestions] API response', {
      vNextCount: vNextQuestions.length,
      cachedCount: cachedSuggestions.length,
      newCount: newSuggestions.length,
      finalTotal,
      source,
      geminiWasCalled,
    })

    return Response.json({
      vNextQuestions,
      cachedSuggestions,
      newSuggestions,
      total: finalTotal,
      source
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
