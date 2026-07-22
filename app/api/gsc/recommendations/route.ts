/**
 * GET /api/gsc/recommendations?projectId=…&window=28|90 — Stage E2C client-facing Search Console
 * RECOMMENDATIONS. Returns only the small, bounded, aggregated recommendation set (≤20 total, ≤2 per
 * page) — never thousands of raw opportunities.
 *
 * Read-only: NO database writes. Categories A–D only (no new-content creation — GSC new content flows
 * exclusively through E3A inside normal topic generation). It never imports the recommendation engine.
 * Deterministic ordering. The authoritative server flag is re-checked; only the project owner may read.
 */
import { authContentProject } from '@/lib/content/api-auth'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadUserConnection, loadProjectProperty, GscServiceError } from '@/lib/gsc/service'
import { loadOpportunityInputs, OpportunityLoadError } from '@/lib/gsc/opportunities/load'
import { buildOpportunities } from '@/lib/gsc/opportunities'
import { loadDecisionsMap, DecisionError } from '@/lib/gsc/opportunities/decisions'
import { buildClientRecommendations } from '@/lib/gsc/client-recommendations/builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isGscReadOnlyEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const windowDays = Number(url.searchParams.get('window'))
  if (windowDays !== 28 && windowDays !== 90) return Response.json({ ok: false, error: 'invalid_window' }, { status: 400 })

  try {
    const connection = await loadUserConnection(auth.admin, auth.user.id)
    if (!connection || connection.status === 'revoked') return Response.json({ ok: true, state: 'not_connected', window: windowDays })
    const property = await loadProjectProperty(auth.admin, auth.project.id)
    if (!property) return Response.json({ ok: true, state: 'no_property', window: windowDays })

    const inputs = await loadOpportunityInputs(auth.admin, auth.project.id, windowDays)
    if (inputs.state === 'never_synced') return Response.json({ ok: true, state: 'never_synced', window: windowDays })

    // Stage E2A engine — unchanged. Then aggregate into the bounded client recommendation set.
    const opportunities = buildOpportunities(inputs.rows, inputs.evidence, inputs.runMeta)
    const decisions = await loadDecisionsMap(auth.admin, auth.project.id) // fail-closed; hide decided
    const decidedOpportunityIds = new Set(decisions.keys())
    const { recommendations, summary } = buildClientRecommendations({
      opportunities, decidedOpportunityIds, window: windowDays, projectId: auth.project.id,
    })

    return Response.json({
      ok: true,
      state: 'ok',
      window: windowDays,
      run: { syncRunId: inputs.runMeta.syncRunId, dateStart: inputs.runMeta.dateStart, dateEnd: inputs.runMeta.dateEnd },
      summary,
      recommendations,
    })
  } catch (e) {
    if (e instanceof GscServiceError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    if (e instanceof OpportunityLoadError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    if (e instanceof DecisionError) return Response.json({ ok: false, error: e.code }, { status: e.status })
    return Response.json({ ok: false, error: 'recommendations_failed' }, { status: 500 })
  }
}
