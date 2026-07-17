/**
 * OPERATOR-ONLY live acceptance runner — POST /api/content/automation/reco-qa
 *
 * Runs the evidence-first engine for ONE owned project against REAL project
 * data + the REAL Gemini API, evaluates the full live-acceptance rule set
 * (qa-acceptance.ts), and returns a structured report — so the acceptance
 * matrix is one button press on the /reco-qa page, not manual network
 * archaeology. Preview-gated: requires RECO_ISOLATION_DIAGNOSTICS=1 AND an
 * authenticated session that owns the project. Persistence is OPT-IN
 * (persist:true) — the default run is analysis-only and writes nothing.
 */

import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { generateFromBriefs } from '@/lib/content/recommendations/generate-from-briefs'
import { newRunCostController } from '@/lib/content/recommendations/run-cost-controller'
import { insertPendingIdeas, loadPendingIdeas, topicIdeaFingerprint } from '@/lib/content/recommendations/topic-idea-store'
import { evaluateRunAcceptance } from '@/lib/content/recommendations/qa-acceptance'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
  // Double gate: content automation on AND Preview diagnostics on. This runner
  // must be unreachable in any environment not explicitly set up for QA.
  if (!isContentAutomationEnabled() || process.env.RECO_ISOLATION_DIAGNOSTICS !== '1') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const tier: 'standard' | 'premium' = body.tier === 'standard' ? 'standard' : 'premium'
  const persist = body.persist === true

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  try {
    // Pending inventory BEFORE (current-run separation evidence).
    const pendingBeforeRows = await loadPendingIdeas(auth.admin, auth.project.id)
    const pendingBefore = pendingBeforeRows?.length ?? 0

    const generationRunId = randomUUID()
    const controller = newRunCostController(tier, generationRunId, 12)
    const startedAt = Date.now()
    const run = await generateFromBriefs(auth.admin, { projectId: auth.project.id, targetCount: 12, qualityMode: tier }, controller)

    // Optional REAL persistence + reload proof (opt-in; additive rows only).
    let persistence: { attempted: number; inserted: number; duplicate: number; failed: number; reloadedFreshCount: number } | null = null
    if (persist && run.suggestions.length > 0) {
      const outcome = await insertPendingIdeas(auth.admin, { projectId: auth.project.id, userId: auth.user.id, batchId: generationRunId, source: 'hybrid', suggestions: run.suggestions })
      const reloaded = await loadPendingIdeas(auth.admin, auth.project.id)
      const freshFps = new Set(run.suggestions.map((s) => topicIdeaFingerprint(s.primaryKeyword, s.title)))
      const reloadedFreshCount = (reloaded ?? []).filter((r) => r.fingerprint && freshFps.has(r.fingerprint)).length
      persistence = outcome ? { attempted: outcome.attempted, inserted: outcome.inserted, duplicate: outcome.duplicate, failed: outcome.failed, reloadedFreshCount } : null
    }

    const acceptance = evaluateRunAcceptance({ tierRequested: tier, diagnostics: run.diagnostics, suggestions: run.suggestions, persistence, pendingBefore })

    return Response.json({
      ok: true,
      project: { id: auth.project.id },
      tierRequested: tier,
      persist,
      durationMs: Date.now() - startedAt,
      acceptance,
      run: {
        modelPath: run.diagnostics.modelPath,
        stop_reason: run.diagnostics.stop_reason,
        insufficient_inventory: run.diagnostics.insufficient_inventory,
        model_calls: run.diagnostics.model_calls,
        brief_pool: run.diagnostics.brief_pool,
        rounds: run.diagnostics.rounds,
        rejected_by_reason: run.diagnostics.rejected_by_reason,
        shadow_rejected_by_reason: run.diagnostics.shadow_rejected_by_reason,
        evidence_inventory: run.diagnostics.evidence_inventory,
        generated: run.diagnostics.generated_opportunities,
        repaired: run.diagnostics.rounds.reduce((s, r) => s + r.repaired, 0),
        accepted: run.suggestions.length,
        pendingBefore,
        persistence,
        cost: run.diagnostics.cost,
      },
      topics: run.suggestions.map((s) => ({
        title: s.title,
        primaryKeyword: s.primaryKeyword,
        secondaryKeywords: s.secondaryKeywords,
        intent: s.searchIntent,
        reason: s.suggestionReason,
        demand: s.demandEvidence ?? null,
        links: (s.suggestedInternalLinks ?? []).map((l) => ({ url: l.url, anchor: l.anchor })),
        recommendedPageType: s.recommendedPageType ?? null,
        family: s.opportunityFamily ?? null,
        modelUsed: s.modelUsed ?? null,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: 'qa_run_failed', message: message.slice(0, 300) }, { status: 500 })
  }
}
