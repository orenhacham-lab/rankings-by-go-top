/**
 * SMART-RUN REPORT ASSEMBLY (Stage B, Increment 6) — pure, QA/admin-only.
 *
 * Shapes a SmartComparisonResult into the client payload the protected /reco-qa
 * comparison view renders, and builds the blind-review artifacts:
 *   - a client-safe per-attempt row set (model VISIBLE here — the whole endpoint is
 *     QA/admin — but the raw finalized suggestions, which carry modelUsed, are NEVER
 *     put on the wire; only counts/telemetry + the anonymous batch id);
 *   - the blind-review export (review-safe content only), and the SEPARATE id→model
 *     mapping (never merged into the export);
 *   - the leakage gate: the blind export is scanned and WITHHELD if anything leaks —
 *     a contaminated file is never returned.
 *
 * Pure/deterministic (seeded from the snapshot id): no I/O, no persistence.
 */
import type { SmartComparisonResult, SmartAttemptRecord, AggregateMetrics } from './smart-run-harness'
import { buildBlindReview, scanBlindExportForLeakage, type BlindReviewExport, type BlindReviewMapping, type AttemptForReview } from './blind-review-export'
import type { SelectResult, BudgetAuthorization, EscalationResult } from './smart-controller'

export interface AttemptRow {
  attemptId: string
  role: 'flash' | 'pro'
  model: string | null
  attemptIndex: number
  engineAcceptedCount: number
  finalizedCount: number
  zeroResult: boolean
  providerStatus: 'ok' | 'failed'
  synthesisStatus: 'ok' | 'failed'
  stopReason: string
  estimatedCostUsd: number
  tokenUsage: { input: number; output: number; thinking: number }
  callCount: number
  latencyMs: number
  uniqueAcceptedCount: number
  uniqueAcceptedBriefIds: string[]
  rescueCounts: SmartAttemptRecord['rescueCounts']
  escalation: EscalationResult
  failed: boolean
  error: string | null
}

export interface ComparisonResponse {
  ok: true
  preflight: false
  snapshotId: string
  commitSha: string | null
  poolSize: number
  orderedBriefIds: string[]
  discoveryRan: boolean
  preparationProviderCalls: number
  targetCount: number
  attempts: AttemptRow[]
  aggregate: { flash: AggregateMetrics; pro: AggregateMetrics }
  selection: SelectResult
  budget: BudgetAuthorization
  maxAuthorizedCostUsd: number
  actualCostUsd: number
  persist: false
  persistedWrites: number
  /** Whether a clean blind-review export is available for download. */
  blindAvailable: boolean
  blindBlocked: { reason: string; hitCount: number } | null
}

export interface AssembledPayload {
  response: ComparisonResponse
  /** The clean blind-review file (null when withheld by the leakage gate). */
  blindReview: BlindReviewExport | null
  /** The SEPARATE id→model un-blinding key (always available; never inside the file). */
  mapping: BlindReviewMapping
}

function seedFromSnapshotId(snapshotId: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < snapshotId.length; i++) { h ^= snapshotId.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

/**
 * Assemble the QA/admin comparison payload + blind artifacts. `commitSha` is stamped
 * for provenance. The blind export is scanned for model-identity leakage and withheld
 * (blindReview=null, blindAvailable=false) if anything leaks — the response still lists
 * every attempt; only the downloadable blind FILE is gated.
 */
export function assembleComparisonPayload(result: SmartComparisonResult, commitSha: string | null): AssembledPayload {
  const attempts = [...result.flash, ...result.pro]

  // Blind bundle over ALL attempts (each attempt = one anonymous batch). Seeded from
  // the snapshot id so the shuffle is deterministic but content/role-independent.
  const forReview: AttemptForReview[] = attempts.map((a) => ({ role: a.role, model: a.model, attemptIndex: a.attemptIndex, suggestions: a.finalizedSuggestions }))
  const { export: blindExport, mapping } = buildBlindReview(forReview, seedFromSnapshotId(result.snapshotId))

  // Reverse index (role#index) → anonymous batch id, so each QA row can show its
  // anonymous id while the operator still sees the model (QA-only).
  const idByAttempt = new Map<string, string>()
  for (const [batchId, m] of Object.entries(mapping)) idByAttempt.set(`${m.role}#${m.attemptIndex}`, batchId)

  const leak = scanBlindExportForLeakage(blindExport)
  const blindAvailable = leak.clean

  const rows: AttemptRow[] = attempts.map((a) => ({
    attemptId: idByAttempt.get(`${a.role}#${a.attemptIndex}`) ?? `att_${a.role}_${a.attemptIndex}`,
    role: a.role,
    model: a.model,
    attemptIndex: a.attemptIndex,
    engineAcceptedCount: a.engineAcceptedCount,
    finalizedCount: a.finalizedCount,
    zeroResult: a.zeroResult,
    providerStatus: a.providerOk ? 'ok' : 'failed',
    synthesisStatus: a.synthesisFailure === null ? 'ok' : 'failed',
    stopReason: a.stopReason,
    estimatedCostUsd: a.estimatedCostUsd,
    tokenUsage: a.tokenUsage,
    callCount: a.callCount,
    latencyMs: a.latencyMs,
    uniqueAcceptedCount: a.uniqueAcceptedBriefIds.length,
    uniqueAcceptedBriefIds: a.uniqueAcceptedBriefIds,
    rescueCounts: a.rescueCounts,
    escalation: a.escalation,
    failed: a.failed,
    error: a.error,
  }))

  const response: ComparisonResponse = {
    ok: true,
    preflight: false,
    snapshotId: result.snapshotId,
    commitSha,
    poolSize: result.poolSize,
    orderedBriefIds: result.orderedBriefIds,
    discoveryRan: result.discoveryRan,
    preparationProviderCalls: result.preparationProviderCalls,
    targetCount: result.targetCount,
    attempts: rows,
    aggregate: result.aggregate,
    selection: result.selection,
    budget: result.budget,
    maxAuthorizedCostUsd: result.maxAuthorizedCostUsd,
    actualCostUsd: result.actualCostUsd,
    persist: false,
    persistedWrites: result.persistedWrites,
    blindAvailable,
    blindBlocked: blindAvailable ? null : { reason: 'model_identity_leakage_detected', hitCount: leak.hits.length },
  }

  return { response, blindReview: blindAvailable ? blindExport : null, mapping }
}
