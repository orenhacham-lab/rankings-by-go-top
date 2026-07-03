/**
 * Content module — POST /api/content/topic-suggestions
 *
 * Generates SEO/GEO article-topic ideas for a project via Gemini (the same
 * provider used by AI-recommended-questions). Falls back to the deterministic
 * template generator only if Gemini is unavailable/fails. READ-ONLY: suggests
 * topics, writes nothing. No article generation, no publish.
 *
 * Gated by ENABLE_CONTENT. Auth + project ownership. No secrets returned.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import {
  generateTopicSuggestionsWithGemini,
  type GeminiTopicSuggestion,
} from '@/lib/content/gemini-topics'
import { suggestTopics, type SuggestionLanguage, type SuggestionIntent } from '@/lib/content/topic-suggestions'

const VALID_INTENTS: SuggestionIntent[] = ['informational', 'commercial', 'local', 'comparison', 'transactional', 'other']

function normLang(v: unknown): SuggestionLanguage {
  return typeof v === 'string' && v.toLowerCase().startsWith('en') ? 'en' : 'he'
}

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const auth = await authContentProject(typeof body.projectId === 'string' ? body.projectId : null)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const primaryKeyword = typeof body.primaryKeyword === 'string' ? body.primaryKeyword.trim() : ''
  if (!primaryKeyword) {
    return Response.json({ error: 'primaryKeyword is required' }, { status: 400 })
  }

  const language = normLang(body.language)
  const intent = (typeof body.searchIntent === 'string' && VALID_INTENTS.includes(body.searchIntent as SuggestionIntent)
    ? body.searchIntent
    : 'commercial') as SuggestionIntent
  const count = Math.min(10, Math.max(5, Number(body.count) || 8))
  const secondaryKeywords = Array.isArray(body.secondaryKeywords)
    ? (body.secondaryKeywords as unknown[]).filter((k): k is string => typeof k === 'string')
    : []
  const targetAudience = typeof body.targetAudience === 'string' ? body.targetAudience : null

  // Project context for domain-aware topics (safe fields only — no secrets).
  const { data: project } = await auth.admin
    .from('projects')
    .select('business_name, target_domain, ai_business_profile')
    .eq('id', auth.project.id)
    .maybeSingle()

  const category =
    project && (project as { ai_business_profile?: { primaryCategory?: string } }).ai_business_profile?.primaryCategory
      ? (project as { ai_business_profile?: { primaryCategory?: string } }).ai_business_profile!.primaryCategory!
      : null

  const gemini = await generateTopicSuggestionsWithGemini({
    primaryKeyword,
    language,
    searchIntent: intent,
    count,
    businessName: (project as { business_name?: string } | null)?.business_name ?? null,
    domain: (project as { target_domain?: string } | null)?.target_domain ?? null,
    category,
    secondaryKeywords,
    targetAudience,
  })

  if (gemini && gemini.length > 0) {
    return Response.json({ source: 'gemini', topics: gemini })
  }

  // Fallback: deterministic templates (only when Gemini failed).
  console.log('[content-topic-suggestions] gemini failed, using fallback')
  const fallbackTitles = suggestTopics(primaryKeyword, language, intent, count)
  const topics: GeminiTopicSuggestion[] = fallbackTitles.map((title) => ({
    title,
    primaryKeyword,
    searchIntent: intent,
    angle: '',
    whyThisTopic: '',
    suggestedSecondaryKeywords: [],
    recommendedWordCount: 1000,
  }))
  return Response.json({ source: 'fallback', topics })
}
