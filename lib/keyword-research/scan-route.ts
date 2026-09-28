/**
 * GET /api/keyword-research/scan?projectId=… — the keyword research of one project,
 * for the research tab: the seeding scan's, and the project's own.
 *
 * CACHE ONLY. It reads what steps b2 and b3 stored (keyword_research_cache, the
 * `seed:` rows), every other research row of the project (a research the owner
 * ran before the scan existed is data too: lib/keyword-research/project-research.ts),
 * the project's tracked keywords, and the site vocabulary the relevance filter
 * needs (the site's cached index). It never asks Google Ads, Serper or a model:
 * opening the tab spends nothing.
 *
 * THE CONTRACT, in order (lib/keyword-research/__qa__/scan-route.qa.ts):
 *   1. signed in, or 401 `unauthorized`;
 *   2. the project is the caller's, read through their own RLS-scoped client with
 *      the owner named in the filter too, or 404 `not_found` (a malformed id is
 *      the same 404: nothing tells a stranger whether a project exists);
 *   3. the research and the tracked keywords, read as the owner; a failed read is
 *      500 `internal`.
 * It is NOT behind the scan's flag (part B of the UX review): it reads only what
 * the owner already has, so every project, scanned or not, opens on the same
 * research screen. Starting a scan stays behind the flag, in the seed route.
 * Every answer is a stable code or data we produced; no database or provider text
 * reaches it, and it is never cached.
 *
 * RELEVANCE: each keyword is checked again with the engine's own filter
 * (researchKeywordIssue, with the vocabulary rule b2 uses), so "suggested for
 * tracking" never offers what the filter rejects today. The vocabulary is read
 * with the service role (the engine's reader requires it) only after step 2 has
 * proven the project is the caller's; its crawl-index read names the owner too.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { tokens } from '@/lib/content/recommendations/dedupe'
import { MIN_SITE_VOCAB_TOKENS, researchKeywordIssue } from '@/lib/content/recommendations/keyword-research'
import type { SeedResearchRow } from '@/lib/seed-scan/research'
import { readProjectResearch, researchSources } from './project-research'
import { getLatestSeedRun } from '@/lib/seed-scan/store'
import { readSummary } from '@/lib/seed-scan/summary'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { mergeSeedResearch, readIdea, type ScanKeyword, type ScanResearchErrorCode, type ScanResearchResponse, type TrackedKeyword } from './scan-research'

export type ScanRouteDeps = {
  session: () => Promise<{ userId: string | null; db: SupabaseClient }>
  admin: () => ServiceRoleClient
  /** The engine's site vocabulary (lib/content/recommendations/engine.ts buildSiteVocabulary). */
  vocabulary: (admin: ServiceRoleClient, projectId: string, extras: string[], userId: string) => Promise<Set<string>>
}

/** Tracked keywords read per project: well above any plan's keyword quota. */
export const MAX_TRACKED = 2_000

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refuse(status: number, code: ScanResearchErrorCode): Response {
  const body: ScanResearchResponse = { ok: false, code }
  return Response.json(body, { status, headers: NO_STORE })
}

type OwnProject = { id: string; user_id: string; business_name: string | null }
type Scope = { projectId: string; userId: string }

async function readOwnProject(db: SupabaseClient, projectId: string, userId: string): Promise<OwnProject | null | 'error'> {
  const { data, error } = await db
    .from('projects')
    .select('id, user_id, business_name')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return 'error'
  const project = data as OwnProject | null
  return project && project.user_id === userId ? project : null
}

async function readTracked(db: SupabaseClient, scope: Scope): Promise<TrackedKeyword[] | 'error'> {
  const { data, error } = await db
    .from('tracking_targets')
    .select('id, keyword, avg_monthly_searches, competition, competition_index, low_top_of_page_bid, high_top_of_page_bid, metrics_currency')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .limit(MAX_TRACKED)
  if (error) return 'error'
  const out: TrackedKeyword[] = []
  for (const r of (data as Record<string, unknown>[] | null) ?? []) {
    if (typeof r.id !== 'string' || typeof r.keyword !== 'string' || !r.keyword.trim()) continue
    const idea = readIdea({
      keyword: r.keyword,
      avgMonthlySearches: r.avg_monthly_searches,
      competition: r.competition,
      competitionIndex: r.competition_index,
      lowTopOfPageBid: r.low_top_of_page_bid,
      highTopOfPageBid: r.high_top_of_page_bid,
      currency: r.metrics_currency ?? '',
    })
    if (!idea) continue
    const hasMetrics = idea.avgMonthlySearches !== null || idea.competition !== null || idea.highTopOfPageBid !== null || idea.lowTopOfPageBid !== null
    out.push({ id: r.id, keyword: idea.keyword, metrics: hasMetrics ? idea : null })
  }
  return out
}

/** The run's seed keywords, as b2 stored them in its row's key (when the run itself is unreadable). */
function seedKeywordsOf(rows: readonly (Omit<SeedResearchRow, 'origin'> & { origin: string })[]): string[] {
  const row = rows.find((r) => r.origin === 'seed_keywords')
  return row ? row.value.split('|').map((k) => k.trim()).filter(Boolean).slice(0, 5) : []
}

export async function handleScanResearchGet(request: Request, deps: ScanRouteDeps): Promise<Response> {
  try {
    let session: { userId: string | null; db: SupabaseClient }
    try {
      session = await deps.session()
    } catch {
      return refuse(503, 'unavailable')
    }
    if (!session.userId) return refuse(401, 'unauthorized')
    const userId = session.userId
    const projectId = new URL(request.url).searchParams.get('projectId') ?? ''
    if (!UUID.test(projectId)) return refuse(404, 'not_found')

    const project = await readOwnProject(session.db, projectId, userId)
    if (project === 'error') return refuse(500, 'internal')
    if (!project) return refuse(404, 'not_found')

    let admin: ServiceRoleClient | null = null
    const adminClient = () => (admin ??= deps.admin())

    const scope: Scope = { projectId: project.id, userId }
    const rows = await readProjectResearch(session.db, scope)
    if (rows === 'error') return refuse(500, 'internal')
    const tracked = await readTracked(session.db, scope)
    if (tracked === 'error') return refuse(500, 'internal')

    const merged = mergeSeedResearch(rows)
    let keywords: ScanKeyword[] = []
    if (merged.keywords.length > 0) {
      const run = await getLatestSeedRun(session.db, scope)
      const summary = run && run !== 'error' ? readSummary(run.summary) : null
      const name = (project.business_name || summary?.business?.companyName || '').trim()
      const seeds = summary?.seedKeywords.length ? summary.seedKeywords : seedKeywordsOf(rows)
      let vocab: Set<string> | null = null
      try {
        const found = await deps.vocabulary(adminClient(), project.id, [name, ...seeds], userId)
        vocab = found.size >= MIN_SITE_VOCAB_TOKENS ? found : null
      } catch {
        vocab = null
      }
      const brandTokens = tokens(name)
      keywords = merged.keywords.map((k) => ({ ...k, relevant: researchKeywordIssue(k.keyword, { brandTokens, vocab }) === null }))
    }

    const body: ScanResearchResponse = {
      ok: true,
      market: merged.market,
      fetchedAt: merged.fetchedAt,
      keywords,
      truncated: merged.truncated,
      tracked,
      sources: researchSources(rows, merged.market),
    }
    return Response.json(body, { status: 200, headers: NO_STORE })
  } catch (err) {
    console.error('[keyword-research/scan] read failed', { error: err instanceof Error ? err.name : typeof err })
    return refuse(500, 'internal')
  }
}
