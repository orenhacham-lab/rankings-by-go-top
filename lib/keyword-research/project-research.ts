/**
 * Every keyword research a project has, for the research tab: the seeding scan's
 * rows (the `seed:` prefix, lib/seed-scan/research.ts) AND the project's own —
 * any other row of keyword_research_cache (a research the owner ran, or the
 * content engine's demand research), marked `manual`.
 *
 * An older project has no scan, and its research used to be invisible: the tab
 * read the scan's rows only and showed the empty form. It now opens on the same
 * overview as a scanned project, computed from what it already has.
 *
 * Two reads, each named by the owner as well as by RLS: the scan's rows (50) and
 * the others (20). Kept apart so the engine's rows, however many it writes, never
 * push the scan's out of their page, and the other way round.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { readSeedResearch, seedResearchOrigin } from '@/lib/seed-scan/research'
import type { SeedScope } from '@/lib/seed-scan/types'
import type { ResearchRow } from './scan-research'

/** The project's own research rows read per answer: far more than one owner runs in the cache's 30 days. */
export const MAX_MANUAL_ROWS = 20

function ideasOf(v: unknown): ResearchRow['keywords'] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is ResearchRow['keywords'][number] => !!x && typeof x === 'object' && typeof (x as { keyword?: unknown }).keyword === 'string')
}

export async function readProjectResearch(db: SupabaseClient, scope: SeedScope): Promise<ResearchRow[] | 'error'> {
  const seed = await readSeedResearch(db, scope)
  if (seed === 'error') return 'error'
  const { data, error } = await db
    .from('keyword_research_cache')
    .select('seed_type, seed_value, country, language, results_json, fetched_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .not('seed_value', 'like', 'seed:%')
    .order('fetched_at', { ascending: false })
    .limit(MAX_MANUAL_ROWS)
  if (error) return 'error'
  const out: ResearchRow[] = [...seed]
  for (const r of (data as Record<string, unknown>[] | null) ?? []) {
    const seedType = String(r.seed_type ?? '')
    const seedValue = String(r.seed_value ?? '')
    // The filter above already leaves the scan's rows out; a reader that ignores it must not count them twice.
    if (seedResearchOrigin(seedType, seedValue)) continue
    out.push({
      origin: 'manual',
      value: seedValue.slice(0, 300),
      country: String(r.country ?? ''),
      language: String(r.language ?? ''),
      fetchedAt: String(r.fetched_at ?? ''),
      keywords: ideasOf(r.results_json),
    })
  }
  return out
}

/** What the merged research came from, in its market: the scan's rows, and the newest research of the project's own. */
export function researchSources(rows: readonly ResearchRow[], market: { country: string; language: string } | null): { scan: boolean; manualAt: string | null } {
  if (!market) return { scan: false, manualAt: null }
  const inMarket = rows.filter((r) => r.country === market.country && r.language === market.language && r.keywords.length > 0)
  const manual = inMarket.filter((r) => r.origin === 'manual').map((r) => r.fetchedAt).filter((t) => Number.isFinite(Date.parse(t))).sort()
  return { scan: inMarket.some((r) => r.origin !== 'manual'), manualAt: manual.length ? manual[manual.length - 1] : null }
}
