/**
 * THE GENERATION FUNNEL, WRITTEN DOWN.
 *
 * A run of the recommendation engine already counts, with a typed reason, every
 * candidate it threw away. That ledger was only ever sent to the browser inside the
 * response and then dropped: so when a merchant pressed "find ideas" and got 3 topics
 * out of a 26-brief pool, nothing anywhere said which gate removed the rest. The
 * diagnostics dry-run that would answer it is refused in production, by design.
 *
 * This module turns that ledger into ONE structured runtime log line per run, which
 * the Vercel log reader can fetch by project id. It is counts and OUR OWN reason
 * codes only — never a title, a keyword, a URL, a domain or any other merchant text,
 * because a runtime log is not a place for a customer's content. `reasonCounts`
 * enforces that mechanically: a key that is not a snake_case reason code is dropped,
 * and every value is coerced to a finite non-negative integer.
 */

/** Reason codes the engine, the route and the blog gate emit: snake_case, ASCII. */
const REASON_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/

/** A count map stripped to reason codes with integer counts. Anything else is dropped. */
export function reasonCounts(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!REASON_CODE_RE.test(key)) continue
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
    if (n > 0) out[key] = n
  }
  return out
}

/** A single value that may only be a reason code, or nothing. */
function reasonCode(value: unknown): string | null {
  return typeof value === 'string' && REASON_CODE_RE.test(value) ? value : null
}

export interface RecoFunnelLog {
  projectId: string
  runId: string | null
  /** Which generator ran (evidence_first_briefs, pro_first_production, …). */
  path: string
  /** The model id the synthesis calls used. A model id, never merchant text. */
  model: string | null
  /** How many topics the run was asked for. */
  target: number
  /** Deterministic stage: candidates built from the project's own evidence. */
  rawBriefCandidates: number
  /** …and how many of them were admitted to the brief pool. */
  briefPool: number
  /** Why the pool is smaller than the raw candidate count. */
  briefPoolRejected: Record<string, number>
  /** Model stage: candidates the model actually produced. */
  generated: number
  /** …how many survived the engine's own validation gates, and why the rest did not. */
  engineAccepted: number
  engineRejected: Record<string, number>
  /** Route finalization (exact-keyword, title, coverage, intra-run, cannibalization). */
  routeRejected: Record<string, number>
  /** The blog-only gate. */
  blogRejected: Record<string, number>
  /** What the merchant ends up seeing, and what was durably written. */
  fresh: number
  persisted: number
  /** Why the run stopped asking for more. */
  stopReason: string | null
}

export interface FunnelLogInput {
  projectId: string
  runId: string | null
  path: string
  model: string | null
  target: number
  rawBriefCandidates: number
  briefPool: number
  briefPoolRejected: unknown
  generated: number
  engineAccepted: number
  engineRejected: unknown
  routeRejected: unknown
  blogRejected: unknown
  fresh: number
  persisted: number
  stopReason: unknown
}

const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0)

/** Pure: build the log payload. Every text-bearing field is a code or a model id. */
export function buildRecoFunnelLog(input: FunnelLogInput): RecoFunnelLog {
  return {
    projectId: input.projectId,
    runId: input.runId,
    path: input.path,
    model: input.model,
    target: count(input.target),
    rawBriefCandidates: count(input.rawBriefCandidates),
    briefPool: count(input.briefPool),
    briefPoolRejected: reasonCounts(input.briefPoolRejected),
    generated: count(input.generated),
    engineAccepted: count(input.engineAccepted),
    engineRejected: reasonCounts(input.engineRejected),
    routeRejected: reasonCounts(input.routeRejected),
    blogRejected: reasonCounts(input.blogRejected),
    fresh: count(input.fresh),
    persisted: count(input.persisted),
    stopReason: reasonCode(input.stopReason),
  }
}

/** The one line per run. Never throws: an observability failure must not fail a run. */
export function logRecoFunnel(input: FunnelLogInput): void {
  try {
    console.log('[automation-recommendations] funnel', buildRecoFunnelLog(input))
  } catch { /* observability only */ }
}
