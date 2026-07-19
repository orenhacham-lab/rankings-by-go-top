/**
 * QA/ADMIN SMART-COMPARISON runner — POST /api/content/automation/reco-qa/compare
 *
 * Runs the Stage-B Flash-vs-Pro comparison over ONE immutable snapshot for a single
 * OWNED project, against REAL project data + the REAL Gemini API. QA/admin ONLY — the
 * exact same double gate + ownership check as the acceptance runner. It NEVER persists
 * a recommendation (persist:false is server-enforced and not client-controllable), and
 * it is wired to NOTHING in the normal recommendations flow.
 *
 * Two-step for cost safety:
 *   confirm !== true → PREFLIGHT: returns the maximum authorized QA run cost + limits,
 *                      prepares no snapshot, spends nothing.
 *   confirm === true → RUN: prepares one snapshot, runs discovery once, runs Flash and
 *                      Pro repeatedly against it (fresh controller + fresh guard per
 *                      attempt), finalizes each identically, returns every attempt
 *                      (failed / empty / successful) + aggregates + the blind-review
 *                      artifacts (the blind file is withheld if the leakage scan trips).
 */
import { authContentProject, isContentAutomationEnabled } from '@/lib/content/api-auth'
import { runSmartComparison, maxAuthorizedCostFor, parseQaCostCapUsd, authorizeQaRunCost, HARNESS_MIN_ATTEMPTS_PER_MODEL } from '@/lib/content/recommendations/smart-run-harness'
import { assembleComparisonPayload } from '@/lib/content/recommendations/smart-run-report'
import { RECOMMENDATION_MODEL_PRIMARY, RECOMMENDATION_MODEL_CURATOR } from '@/lib/content/recommendations/model'
import { runBudget } from '@/lib/content/recommendations/reco-cost'
import { currentGitSha } from '@/lib/runtime-info'

export const runtime = 'nodejs'
export const maxDuration = 300

// Server-side operator-facing maxima (defense the harness ALSO clamps internally).
const SERVER_MAX_ATTEMPTS_PER_MODEL = 6
const SERVER_MAX_TARGET_COUNT = 20
const DEFAULT_ATTEMPTS_PER_MODEL = 3
const DEFAULT_TARGET_COUNT = 12
const QA_MODE = 'premium' as const
// Fallback authorized cap when RECO_QA_MAX_RUN_COST_USD is unset/invalid.
const DEFAULT_QA_MAX_RUN_COST_USD = 5

// One comparison per project at a time (in-memory best-effort concurrency guard).
const inFlightProjects = new Set<string>()

const clampInt = (v: unknown, def: number, min: number, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def
  return Math.min(max, Math.max(min, n))
}

export async function POST(request: Request) {
  // Identical double gate to the acceptance runner: unreachable outside QA.
  if (!isContentAutomationEnabled() || process.env.RECO_ISOLATION_DIAGNOSTICS !== '1') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const targetCount = clampInt(body.targetCount, DEFAULT_TARGET_COUNT, 1, SERVER_MAX_TARGET_COUNT)
  const attemptsPerModel = clampInt(body.attemptsPerModel, DEFAULT_ATTEMPTS_PER_MODEL, HARNESS_MIN_ATTEMPTS_PER_MODEL, SERVER_MAX_ATTEMPTS_PER_MODEL)
  const confirm = body.confirm === true

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  // Cost model: each attempt is one bounded run; preparation is one discovery call.
  const perAttemptCeilingUsd = runBudget(QA_MODE, targetCount).maxEstimatedCostUsd
  const preparationCeilingUsd = perAttemptCeilingUsd
  // WORST-CASE estimate (attempts × per-run ceiling); NOT the authorized cap.
  const estimatedWorstCaseCostUsd = maxAuthorizedCostFor(attemptsPerModel, perAttemptCeilingUsd, preparationCeilingUsd)
  // The ENFORCED authorized QA cap (env; safe-parsed so an invalid value falls back).
  const authorizedLimitUsd = parseQaCostCapUsd(process.env.RECO_QA_MAX_RUN_COST_USD, DEFAULT_QA_MAX_RUN_COST_USD)
  const { withinAuthorizedLimit } = authorizeQaRunCost(estimatedWorstCaseCostUsd, authorizedLimitUsd)
  const limits = {
    serverMaxAttemptsPerModel: SERVER_MAX_ATTEMPTS_PER_MODEL,
    serverMaxTargetCount: SERVER_MAX_TARGET_COUNT,
    minAttemptsPerModel: HARNESS_MIN_ATTEMPTS_PER_MODEL,
    authorizedLimitUsd,
  }

  // ── PREFLIGHT — show the worst-case estimate AND the enforced limit; spend
  //    nothing. A confirm is offered ONLY when the estimate is within the cap. ──
  if (!confirm) {
    return Response.json({
      ok: true, preflight: true,
      project: { id: auth.project.id },
      commitSha: currentGitSha(),
      targetCount, attemptsPerModel, persist: false,
      estimatedWorstCaseCostUsd,
      authorizedLimitUsd,
      withinAuthorizedLimit,
      // Back-compat alias (equals the worst-case estimate).
      maxAuthorizedCostUsd: estimatedWorstCaseCostUsd,
      limits,
      // The operator may confirm ONLY when the run is within the authorized cap.
      requiresConfirmation: withinAuthorizedLimit,
    })
  }

  // ── COST GATE — a confirmed run whose worst case exceeds the authorized cap is
  //    REJECTED before any snapshot prep or provider spend (defence beyond the UI). ─
  if (!withinAuthorizedLimit) {
    return Response.json({
      ok: false, error: 'cost_exceeds_authorized_limit',
      estimatedWorstCaseCostUsd, authorizedLimitUsd,
      message: `Worst-case QA cost $${estimatedWorstCaseCostUsd} exceeds the authorized limit $${authorizedLimitUsd}. Lower attemptsPerModel or raise RECO_QA_MAX_RUN_COST_USD (then redeploy Preview).`,
    }, { status: 402 })
  }

  // ── RUN — requires explicit confirmation ────────────────────────────────────
  if (inFlightProjects.has(auth.project.id)) {
    return Response.json({ ok: false, error: 'comparison_already_running', message: 'A comparison for this project is already in progress.' }, { status: 409 })
  }
  inFlightProjects.add(auth.project.id)
  try {
    const budgetMaxima = {
      preparationMaxUsd: preparationCeilingUsd,
      flashAttemptMaxUsd: perAttemptCeilingUsd * attemptsPerModel,
      proRescueMaxUsd: perAttemptCeilingUsd * attemptsPerModel,
      globalAuthorizedUsd: authorizedLimitUsd,
    }
    const result = await runSmartComparison(
      auth.admin,
      { projectId: auth.project.id, targetCount, qualityMode: QA_MODE, userId: auth.user.id },
      {
        flashModel: RECOMMENDATION_MODEL_PRIMARY,
        proModel: RECOMMENDATION_MODEL_CURATOR,
        flashAttempts: attemptsPerModel,
        proAttempts: attemptsPerModel,
        mode: QA_MODE,
        budgetMaxima,
        perAttemptCeilingUsd,
        preparationCeilingUsd,
        signal: request.signal,
      },
    )

    const { response, blindReview, mapping } = assembleComparisonPayload(result, currentGitSha())
    // persist:false is server-enforced; the harness performs no writes.
    return Response.json({ ...response, limits, authorizedLimitUsd, withinAuthorizedLimit, estimatedWorstCaseCostUsd, blindReview, mapping })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: 'comparison_failed', message: message.slice(0, 300) }, { status: 500 })
  } finally {
    inFlightProjects.delete(auth.project.id)
  }
}
