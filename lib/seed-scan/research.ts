/**
 * Where steps b2 and b3 keep the keyword ideas they found, and how the research
 * tab reads them back later without asking Google Ads again.
 *
 * STORAGE: the existing Google Ads cache, public.keyword_research_cache
 * (supabase/migrations/20260716_add_keyword_research_cache.sql). One row per
 * project + seed + market, `results_json` a KeywordIdeaResult[] — the shape the
 * recommendation engine already reads as demand evidence (generate-from-briefs
 * loads every row of the project), so b4's content plan sees what b2 and b3
 * found without another call. The table's seed_type CHECK allows 'url',
 * 'keyword' and 'keyword_url' only, so there is no migration: the seeding
 * scan's rows are told apart by a seed_value prefix, which never collides with
 * the engine's own keys (a bare URL, or seed keywords joined by '|'):
 *
 *   seed:keywords:<k1|k2|…>   seed_type 'keyword'   b2, the run's seed keywords
 *   seed:home:<url>           seed_type 'url'       b2, the home page
 *   seed:site:<domain>        seed_type 'url'       b2, the whole domain (siteSeed)
 *   seed:competitor:<domain>  seed_type 'url'       b3, one validated competitor
 *
 * Only what a step KEPT is stored (after the noise and relevance filters), so
 * the research tab and the engine read keywords that are already the site's
 * own; a competitor's row is marked as such by its prefix. The cache's own TTL
 * applies (30 days): a rescan inside it reads the row and spends nothing.
 *
 * Every query here names the owner — the service role bypasses RLS. The
 * research tab reads with the owner's own session client (the table's RLS lets
 * an owner read their project's rows) through readSeedResearch.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { SeedScope } from './types'

/** The cache's own freshness (lib/content/keyword-research-cache.ts). */
export const SEED_RESEARCH_TTL_DAYS = 30
/** Keywords kept per seed row. */
export const MAX_KEPT_PER_SEED = 200

export type SeedResearchOrigin = 'seed_keywords' | 'home_page' | 'site' | 'competitor'
export type SeedResearchKey = { seedType: 'keyword' | 'url'; seedValue: string }
export type SeedMarket = { country: string; language: string }

const PREFIX: Record<SeedResearchOrigin, string> = {
  seed_keywords: 'seed:keywords:',
  home_page: 'seed:home:',
  site: 'seed:site:',
  competitor: 'seed:competitor:',
}

/** The cache key of one of the scan's seeds. */
export function seedResearchKey(origin: SeedResearchOrigin, value: string | string[]): SeedResearchKey {
  const raw = Array.isArray(value)
    ? value.map((v) => v.trim().toLowerCase()).filter(Boolean).join('|')
    : origin === 'home_page'
      ? value.trim()
      : value.trim().toLowerCase()
  return { seedType: origin === 'seed_keywords' ? 'keyword' : 'url', seedValue: `${PREFIX[origin]}${raw}` }
}

/** Which of the scan's seeds a cache row came from; null for a row the engine wrote. */
export function seedResearchOrigin(seedType: string, seedValue: string): { origin: SeedResearchOrigin; value: string } | null {
  for (const origin of Object.keys(PREFIX) as SeedResearchOrigin[]) {
    const expected = origin === 'seed_keywords' ? 'keyword' : 'url'
    if (seedType === expected && seedValue.startsWith(PREFIX[origin])) return { origin, value: seedValue.slice(PREFIX[origin].length) }
  }
  return null
}

function readIdeas(v: unknown): KeywordIdeaResult[] | null {
  if (!Array.isArray(v)) return null
  const out: KeywordIdeaResult[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const r = x as Record<string, unknown>
    if (typeof r.keyword !== 'string' || !r.keyword.trim()) continue
    const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null)
    const competition = r.competition === 'LOW' || r.competition === 'MEDIUM' || r.competition === 'HIGH' ? r.competition : null
    out.push({
      keyword: r.keyword.trim(),
      avgMonthlySearches: num(r.avgMonthlySearches),
      competition,
      competitionIndex: num(r.competitionIndex),
      lowTopOfPageBid: num(r.lowTopOfPageBid),
      highTopOfPageBid: num(r.highTopOfPageBid),
      currency: typeof r.currency === 'string' ? r.currency.slice(0, 8) : '',
    })
  }
  return out
}

/** A fresh cached row for this seed, or null (none, stale, unreadable). 'error' when the read failed. */
export async function readSeedIdeas(
  admin: ServiceRoleClient,
  scope: SeedScope,
  key: SeedResearchKey,
  market: SeedMarket,
  now: Date,
): Promise<KeywordIdeaResult[] | null | 'error'> {
  const { data, error } = await admin
    .from('keyword_research_cache')
    .select('results_json, fetched_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('seed_type', key.seedType)
    .eq('seed_value', key.seedValue)
    .eq('country', market.country)
    .eq('language', market.language)
    .maybeSingle()
  if (error) return 'error'
  if (!data) return null
  const row = data as { results_json: unknown; fetched_at: string }
  const fetchedAt = new Date(row.fetched_at).getTime()
  if (!Number.isFinite(fetchedAt) || now.getTime() - fetchedAt > SEED_RESEARCH_TTL_DAYS * 24 * 60 * 60 * 1000) return null
  return readIdeas(row.results_json)
}

/** Store what a step kept for one seed (replacing the row of the same seed and market). */
export async function writeSeedIdeas(
  admin: ServiceRoleClient,
  scope: SeedScope,
  key: SeedResearchKey,
  market: SeedMarket,
  kept: KeywordIdeaResult[],
  now: Date,
): Promise<boolean> {
  const { error } = await admin
    .from('keyword_research_cache')
    .upsert(
      {
        user_id: scope.userId,
        project_id: scope.projectId,
        seed_type: key.seedType,
        seed_value: key.seedValue,
        country: market.country,
        language: market.language,
        results_json: kept.slice(0, MAX_KEPT_PER_SEED),
        fetched_at: now.toISOString(),
      },
      { onConflict: 'project_id,seed_type,seed_value,country,language' },
    )
  return !error
}

export type SeedResearchRow = {
  origin: SeedResearchOrigin
  /** The seed itself: the keywords joined by '|', the page URL, or the domain. */
  value: string
  country: string
  language: string
  fetchedAt: string
  keywords: KeywordIdeaResult[]
}

/**
 * The scan's keyword research of a project, newest first, for the research
 * tab: no Google Ads call. Pass the owner's own session client (RLS scopes
 * it); the owner is named in the filter as well. Only the scan's own rows are
 * read (the `seed:` prefix, a LIKE with a constant pattern, whatever the
 * collation): the engine's rows share the table, and however many newer ones
 * it writes, they never push the scan's out of the 50.
 */
export async function readSeedResearch(db: SupabaseClient, scope: SeedScope): Promise<SeedResearchRow[] | 'error'> {
  const { data, error } = await db
    .from('keyword_research_cache')
    .select('seed_type, seed_value, country, language, results_json, fetched_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .like('seed_value', 'seed:%')
    .order('fetched_at', { ascending: false })
    .limit(50)
  if (error) return 'error'
  const out: SeedResearchRow[] = []
  for (const r of (data as Record<string, unknown>[] | null) ?? []) {
    const origin = seedResearchOrigin(String(r.seed_type ?? ''), String(r.seed_value ?? ''))
    if (!origin) continue
    out.push({
      origin: origin.origin,
      value: origin.value,
      country: String(r.country ?? ''),
      language: String(r.language ?? ''),
      fetchedAt: String(r.fetched_at ?? ''),
      keywords: readIdeas(r.results_json) ?? [],
    })
  }
  return out
}
