/**
 * GET /api/gsc/opportunities?projectId=…&window=28|90 — read-only opportunity intelligence
 * over the LATEST SUCCEEDED sync run for the window. Optional: type, minScore (filters);
 * page, pageSize (server-side pagination).
 *
 * Read-only: NO database writes. It never creates/updates/approves/rejects/queues/publishes
 * any content item, and never calls the recommendation engine. Stage E1's server flag is
 * authoritative; only the authenticated project owner may read. Deterministic ordering:
 * opportunityScore DESC, impressions DESC, id ASC.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadUserConnection, loadProjectProperty, GscServiceError } from '@/lib/gsc/service'
import { loadOpportunityInputs, OpportunityLoadError } from '@/lib/gsc/opportunities/load'
import { buildOpportunities, type OpportunityType } from '@/lib/gsc/opportunities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PAGE_SIZE = 100
const VALID_TYPES = new Set<OpportunityType>([
  'improve_existing_page', 'improve_title_meta_ctr', 'supporting_content_candidate', 'internal_link_support_candidate', 'multi_page_signal',
])

export async function GET(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const windowDays = Number(url.searchParams.get('window'))
  if (windowDays !== 28 && windowDays !== 90) return Response.json({ ok: false, error: 'invalid_window' }, { status: 400 })

  const typeParam = url.searchParams.get('type')
  const typeFilter = typeParam && VALID_TYPES.has(typeParam as OpportunityType) ? (typeParam as OpportunityType) : null
  if (typeParam && !typeFilter) return Response.json({ ok: false, error: 'invalid_type' }, { status: 400 })
  const page = Math.max(0, Number(url.searchParams.get('page')) || 0)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get('pageSize')) || 25))
  const minScore = Math.max(0, Math.min(100, Number(url.searchParams.get('minScore')) || 0))

  try {
    const connection = await loadUserConnection(auth.admin, auth.user.id)
    if (!connection || connection.status === 'revoked') return Response.json({ ok: true, state: 'not_connected', window: windowDays })
    const property = await loadProjectProperty(auth.admin, auth.project.id)
    if (!property) return Response.json({ ok: true, state: 'no_property', window: windowDays })

    const inputs = await loadOpportunityInputs(auth.admin, auth.project.id, windowDays)
    if (inputs.state === 'never_synced') return Response.json({ ok: true, state: 'never_synced', window: windowDays })

    const all = buildOpportunities(inputs.rows, inputs.evidence, inputs.runMeta)
    // minScore first (default 0 keeps analyzable opportunities), then optional type filter.
    const scoped = all.filter((o) => o.opportunityScore >= minScore)
    const typeCounts: Record<string, number> = {}
    for (const o of scoped) typeCounts[o.opportunityType] = (typeCounts[o.opportunityType] ?? 0) + 1
    const filtered = typeFilter ? scoped.filter((o) => o.opportunityType === typeFilter) : scoped
    const from = page * pageSize
    const pageItems = filtered.slice(from, from + pageSize)

    return Response.json({
      ok: true,
      state: 'ok',
      window: windowDays,
      run: { syncRunId: inputs.runMeta.syncRunId, dateStart: inputs.runMeta.dateStart, dateEnd: inputs.runMeta.dateEnd },
      total: filtered.length,
      page,
      pageSize,
      typeCounts,
      opportunities: pageItems,
    })
  } catch (e) {
    if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    if (e instanceof OpportunityLoadError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    return Response.json({ ok: false, error: 'opportunities_failed' }, { status: 500 })
  }
}
