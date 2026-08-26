/**
 * Content module — POST /api/content/topic-suggestions
 *
 * Generates SEO/GEO article-topic ideas via Gemini (same provider as
 * AI-recommended-questions). The PRIMARY KEYWORD drives suggestions; project
 * context only refines when it fits the keyword. Retries once (stronger prompt)
 * before ever falling back, so a working Gemini call is not discarded just
 * because the quality filter trimmed it. Template fallback ONLY on real
 * Gemini failure (missing key / request failed / no valid JSON).
 *
 * Gated by ENABLE_CONTENT + auth + project ownership. Read-only.
 */

import { authContentProject, isContentModuleEnabled } from '@/lib/content/api-auth'
import {
  generateRawTopics,
  filterTopicSuggestions,
  assessProjectKeywordFit,
  type GeminiTopicSuggestion,
  type ProjectKeywordFit,
} from '@/lib/content/gemini-topics'
import { suggestTopics, type SuggestionLanguage, type SuggestionIntent } from '@/lib/content/topic-suggestions'
import { assertContentGenerationAllowedForUser } from '@/lib/content/entitlement-guard'

const VALID_INTENTS: SuggestionIntent[] = ['informational', 'commercial', 'local', 'comparison', 'transactional', 'other']
const MIN_GOOD = 6

function normLang(v: unknown): SuggestionLanguage {
  return typeof v === 'string' && v.toLowerCase().startsWith('en') ? 'en' : 'he'
}
function dedupeByTitle(items: GeminiTopicSuggestion[]): GeminiTopicSuggestion[] {
  const seen = new Set<string>()
  const out: GeminiTopicSuggestion[] = []
  for (const it of items) {
    const key = (it?.title || '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
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

  // Blocker D fix — central gate, before any Gemini call. Single caller of
  // generateRawTopics (no queue/cron for this subsystem), so the route is
  // the narrowest shared point.
  const gate = await assertContentGenerationAllowedForUser(auth.admin, auth.user.id)
  if (!gate.allowed) return Response.json({ error: 'Shopify billing required', reason: gate.reason }, { status: 403 })

  const primaryKeyword = typeof body.primaryKeyword === 'string' ? body.primaryKeyword.trim() : ''
  if (!primaryKeyword) return Response.json({ error: 'primaryKeyword is required' }, { status: 400 })

  const language = normLang(body.language)
  const intent = (typeof body.searchIntent === 'string' && VALID_INTENTS.includes(body.searchIntent as SuggestionIntent)
    ? body.searchIntent
    : 'informational') as SuggestionIntent
  const requestedCount = Math.min(10, Math.max(5, Number(body.count) || 8))
  const targetAudience = typeof body.targetAudience === 'string' ? body.targetAudience : null

  // Project context (safe fields only) + keyword-fit assessment.
  const { data: project } = await auth.admin
    .from('projects')
    .select('business_name, target_domain, ai_business_profile')
    .eq('id', auth.project.id)
    .maybeSingle()

  const businessName = (project as { business_name?: string } | null)?.business_name ?? null
  const category = (project as { ai_business_profile?: { primaryCategory?: string } } | null)?.ai_business_profile?.primaryCategory ?? null

  const fit: ProjectKeywordFit = assessProjectKeywordFit(primaryKeyword, { businessName, category })
  const useProjectContext = fit !== 'unrelated'
  const warnings: string[] = fit === 'unrelated' ? ['keyword_project_mismatch'] : []

  const ctx = {
    primaryKeyword,
    language,
    searchIntent: intent,
    count: requestedCount,
    businessName,
    domain: (project as { target_domain?: string } | null)?.target_domain ?? null,
    category,
    targetAudience,
    useProjectContext,
  }

  const fallback = (reason: string) => {
    console.log('[content-topic-suggestions] source=fallback reason=' + reason)
    const titles = suggestTopics(primaryKeyword, language, intent, requestedCount)
    const topics: GeminiTopicSuggestion[] = titles.map((title) => ({
      title, primaryKeyword, searchIntent: intent, angle: '', whyThisTopic: '', suggestedSecondaryKeywords: [], recommendedWordCount: 1000,
    }))
    return Response.json({
      source: 'fallback', fallbackReason: reason, projectKeywordFit: fit, warnings,
      requestedCount, rawGeminiCount: 0, filteredCount: topics.length, topics,
    })
  }

  // Attempt 1.
  const first = await generateRawTopics(ctx, false)
  if ('error' in first) return fallback(first.error) // real Gemini failure only

  let combinedRaw = dedupeByTitle(first.raw)
  let filtered = filterTopicSuggestions(combinedRaw, primaryKeyword, requestedCount)

  // Retry once (stronger prompt) if the filtered set is thin — NOT a fallback.
  if (filtered.length < MIN_GOOD) {
    const second = await generateRawTopics(ctx, true)
    if ('raw' in second) {
      combinedRaw = dedupeByTitle([...combinedRaw, ...second.raw])
      filtered = filterTopicSuggestions(combinedRaw, primaryKeyword, requestedCount)
    }
  }

  // Last resort before fallback: relax the relatedness gate so a working Gemini
  // response is never fully discarded by the filter.
  if (filtered.length === 0 && combinedRaw.length > 0) {
    filtered = filterTopicSuggestions(combinedRaw, primaryKeyword, requestedCount, { relaxed: true })
  }

  if (filtered.length === 0) return fallback('gemini_all_filtered_after_retry')

  console.log('[content-topic-suggestions] source=gemini count=' + filtered.length + ' fit=' + fit)
  return Response.json({
    source: 'gemini', projectKeywordFit: fit, warnings,
    requestedCount, rawGeminiCount: combinedRaw.length, filteredCount: filtered.length, topics: filtered,
  })
}
