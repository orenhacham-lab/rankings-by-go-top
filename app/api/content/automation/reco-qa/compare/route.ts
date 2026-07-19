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
import { runSmartComparison, maxAuthorizedCostFor, HARNESS_MIN_ATTEMPTS_PER_MODEL } from '@/lib/content/recommendations/smart-run-harness'
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
  const maxAuthorizedCostUsd = maxAuthorizedCostFor(attemptsPerModel, perAttemptCeilingUsd, preparationCeilingUsd)
  const globalAuthorizedUsd = Number(process.env.RECO_QA_MAX_RUN_COST_USD ?? '5')
  const limits = {
    serverMaxAttemptsPerModel: SERVER_MAX_ATTEMPTS_PER_MODEL,
    serverMaxTargetCount: SERVER_MAX_TARGET_COUNT,
    minAttemptsPerModel: HARNESS_MIN_ATTEMPTS_PER_MODEL,
    globalAuthorizedUsd,
  }

  // ── PREFLIGHT — show the maximum authorized cost; spend nothing ──────────────
  if (!confirm) {
    return Response.json({
      ok: true, preflight: true,
      project: { id: auth.project.id },
      commitSha: currentGitSha(),
      targetCount, attemptsPerModel, persist: false,
      maxAuthorizedCostUsd, limits,
      requiresConfirmation: true,
    })
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
      globalAuthorizedUsd,
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
    return Response.json({ ...response, limits, blindReview, mapping })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: 'comparison_failed', message: message.slice(0, 300) }, { status: 500 })
  } finally {
    inFlightProjects.delete(auth.project.id)
  }
}
