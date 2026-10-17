/**
 * GET /api/keyword-research/competitive?projectId=… — the research tab's competitive
 * view (lib/keyword-research/competitive.ts), read from what is already stored:
 *
 *   tracking_targets                the project's Google organic keywords and volumes
 *   scan_results                    each keyword's latest check (our exact position)
 *   ai_visibility_competitors       the competitors the scan records positions for
 *   keyword_competitor_positions    where each stood in that same check
 *   gsc_sync_runs + gsc_query_page_metrics   the latest 28-day Search Console sync
 *
 * No Serper, no Google API, no model: opening the tab spends nothing.
 *
 * proxy.ts does not cover /api/*, so the handler authenticates the user and checks
 * ownership itself. The admin client bypasses RLS, so EVERY read is filtered by the
 * project (and, where the table has it, by its owner) explicitly. Failures answer a
 * stable code only; nothing the database said reaches the merchant.
 */
import { trackedCompetitorsFrom, type CompetitorPositionRow } from '@/lib/competitors/comparison'
import { buildCompetitiveModel, type CompetitiveModel, type CompetitiveTarget, type GscQueryPageRow } from './competitive'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminLike = { from: (table: string) => any }

export type CompetitiveRouteDeps = {
  session: () => Promise<{ userId: string | null }>
  admin: () => AdminLike
  /** Search Console read-only features are switched on (GSC_READ_ONLY_ENABLED). */
  gscEnabled: () => boolean
  /** Competitors can be added from this screen (the competitors route is on). */
  competitorsManageable: () => boolean
}

/** Tracked keywords read at most (the largest plan allows 200 per project). */
export const MAX_TARGETS = 1_000
/** Targets per scan_results / positions read, so each page stays under PostgREST's 1,000 rows. */
const TARGETS_PER_READ = 25
const PAGE = 1_000
/** Search Console rows read at most (a sync stores up to 50,000; the widest queries come first). */
export const GSC_MAX_ROWS = 20_000

export type CompetitiveResponse = {
  ok: true
  ownDomain: string | null
  /** Search Console is switched on; its setup state is read from /api/gsc/status. */
  gscEnabled: boolean
  /** The latest 28-day sync the Search Console figures come from; null without one. */
  gscRun: { startDate: string | null; endDate: string | null } | null
  competitorsManageable: boolean
  /** Tracked competitor domains (for the "suggested" list: never offered twice). */
  competitorDomains: string[]
  model: CompetitiveModel
}

const fail = (code: string, status: number) => Response.json({ ok: false, error: code }, { status })

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null)

export async function handleCompetitiveGet(request: Request, deps: CompetitiveRouteDeps): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get('projectId')
  if (!projectId) return fail('project_required', 400)
  const { userId } = await deps.session()
  if (!userId) return fail('unauthorized', 401)
  const admin = deps.admin()

  try {
    // Ownership first: the project must be this user's.
    const { data: project, error: projectError } = await admin
      .from('projects').select('id, user_id, target_domain').eq('id', projectId).eq('user_id', userId).maybeSingle()
    if (projectError) return fail('read_failed', 500)
    if (!project || project.user_id !== userId) return fail('not_found', 404)

    // Tracked keywords on Google organic results (Maps is a different result page).
    const { data: targetRows, error: targetsError } = await admin
      .from('tracking_targets')
      .select('id, keyword, engine_type, avg_monthly_searches, is_active')
      .eq('project_id', projectId)
      .eq('engine_type', 'google_search')
      .limit(MAX_TARGETS)
    if (targetsError) return fail('read_failed', 500)
    const targets = ((targetRows ?? []) as Array<Record<string, unknown>>)
      .filter((t) => t.is_active !== false && typeof t.id === 'string' && typeof t.keyword === 'string')
    const ids = targets.map((t) => t.id as string)

    // Each keyword's latest check.
    const latest = new Map<string, { checkedAt: string; found: boolean; position: number | null; url: string | null }>()
    for (const chunk of chunks(ids, TARGETS_PER_READ)) {
      const { data, error } = await admin
        .from('scan_results')
        .select('tracking_target_id, found, position, result_url, checked_at')
        .in('tracking_target_id', chunk)
        .order('checked_at', { ascending: false })
        .limit(PAGE)
      if (error) return fail('read_failed', 500)
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const id = r.tracking_target_id as string
        const at = typeof r.checked_at === 'string' ? r.checked_at : null
        if (!at || !chunk.includes(id)) continue
        const prev = latest.get(id)
        if (prev && Date.parse(prev.checkedAt) >= Date.parse(at)) continue
        latest.set(id, { checkedAt: at, found: r.found === true, position: num(r.position), url: typeof r.result_url === 'string' && /^https?:\/\//i.test(r.result_url) ? r.result_url : null })
      }
    }

    // The competitors the scan records, exactly as the scanner loads them.
    const { data: competitorRows, error: competitorsError } = await admin
      .from('ai_visibility_competitors')
      .select('name, domain, is_active')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('is_active', true)
    if (competitorsError) return fail('read_failed', 500)
    const competitors = trackedCompetitorsFrom((competitorRows ?? []) as Array<Record<string, unknown>>)

    // Where they stood in those same checks.
    const rows: CompetitorPositionRow[] = []
    const checked = ids.filter((id) => latest.has(id))
    if (competitors.length > 0) {
      for (const chunk of chunks(checked, TARGETS_PER_READ)) {
        const { data, error } = await admin
          .from('keyword_competitor_positions')
          .select('tracking_target_id, competitor_domain, position, url, checked_at')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .in('tracking_target_id', chunk)
          .in('checked_at', [...new Set(chunk.map((id) => latest.get(id)!.checkedAt))])
          .limit(PAGE)
        if (error) return fail('read_failed', 500)
        rows.push(...((data ?? []) as CompetitorPositionRow[]).filter((r) => chunk.includes(r.tracking_target_id)))
      }
    }

    // Search Console: the latest succeeded 28-day sync of THIS project.
    const gscEnabled = deps.gscEnabled()
    let gsc: GscQueryPageRow[] | null = null
    let gscRun: CompetitiveResponse['gscRun'] = null
    if (gscEnabled) {
      const { data: run, error: runError } = await admin
        .from('gsc_sync_runs')
        .select('id, start_date, end_date')
        .eq('project_id', projectId)
        .eq('window_days', 28)
        .eq('status', 'succeeded')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (runError) return fail('read_failed', 500)
      if (run?.id) {
        gscRun = { startDate: run.start_date ?? null, endDate: run.end_date ?? null }
        gsc = []
        for (let offset = 0; offset < GSC_MAX_ROWS; offset += PAGE) {
          const { data, error } = await admin
            .from('gsc_query_page_metrics')
            .select('query, page, clicks, impressions, position')
            .eq('sync_run_id', run.id)
            .eq('project_id', projectId)
            .order('impressions', { ascending: false }).order('query', { ascending: true }).order('page', { ascending: true })
            .range(offset, offset + PAGE - 1)
          if (error) return fail('read_failed', 500)
          const batch = (data ?? []) as Array<Record<string, unknown>>
          for (const r of batch) {
            if (typeof r.query !== 'string' || typeof r.page !== 'string') continue
            gsc.push({ query: r.query, page: r.page, clicks: num(r.clicks) ?? 0, impressions: num(r.impressions) ?? 0, position: num(r.position) ?? 0 })
          }
          if (batch.length < PAGE) break
        }
      }
    }

    const modelTargets: CompetitiveTarget[] = targets.map((t) => ({
      id: t.id as string,
      keyword: t.keyword as string,
      volume: num(t.avg_monthly_searches),
      check: latest.get(t.id as string) ?? null,
    }))
    const ownDomain = typeof project.target_domain === 'string' && project.target_domain.trim() ? project.target_domain.trim() : null
    const body: CompetitiveResponse = {
      ok: true,
      ownDomain,
      gscEnabled,
      gscRun,
      competitorsManageable: deps.competitorsManageable(),
      competitorDomains: competitors.map((c) => c.domain),
      model: buildCompetitiveModel({ ownDomain, targets: modelTargets, competitors, rows, gsc }),
    }
    return Response.json(body, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return fail('read_failed', 500)
  }
}
