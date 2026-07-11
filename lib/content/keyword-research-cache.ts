/**
 * Best-effort cache for Google Ads keyword-ideas results (per project + seed).
 *
 * All access is wrapped so a missing table (migration not applied) or any error
 * degrades gracefully to a cache miss — the caller just re-fetches from Google.
 * Default TTL 30 days.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'

type Admin = ReturnType<typeof createAdminClient>

const DEFAULT_TTL_DAYS = 30

interface CacheKey {
  projectId: string
  seedType: 'url' | 'keyword' | 'keyword_url'
  seedValue: string
  country: string
  language: string
}

/** Return cached results if fresh (<= ttlDays), else null. Never throws. */
export async function getCachedKeywordResults(
  admin: Admin,
  key: CacheKey,
  ttlDays = DEFAULT_TTL_DAYS,
): Promise<KeywordIdeaResult[] | null> {
  try {
    const { data, error } = await admin
      .from('keyword_research_cache')
      .select('results_json, fetched_at')
      .eq('project_id', key.projectId)
      .eq('seed_type', key.seedType)
      .eq('seed_value', key.seedValue)
      .eq('country', key.country)
      .eq('language', key.language)
      .maybeSingle()
    if (error || !data) return null
    const fetchedAt = new Date((data as { fetched_at: string }).fetched_at).getTime()
    if (!Number.isFinite(fetchedAt)) return null
    const ageMs = Date.now() - fetchedAt
    if (ageMs > ttlDays * 24 * 60 * 60 * 1000) return null
    const rows = (data as { results_json: unknown }).results_json
    return Array.isArray(rows) ? (rows as KeywordIdeaResult[]) : null
  } catch {
    return null
  }
}

/** Upsert cached results. Never throws. */
export async function setCachedKeywordResults(
  admin: Admin,
  userId: string,
  key: CacheKey,
  results: KeywordIdeaResult[],
): Promise<void> {
  try {
    await admin
      .from('keyword_research_cache')
      .upsert(
        {
          user_id: userId,
          project_id: key.projectId,
          seed_type: key.seedType,
          seed_value: key.seedValue,
          country: key.country,
          language: key.language,
          results_json: results,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,seed_type,seed_value,country,language' },
      )
  } catch {
    /* best-effort */
  }
}
