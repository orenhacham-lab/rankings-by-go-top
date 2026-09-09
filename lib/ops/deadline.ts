/**
 * DEADLINES AND OPERATION DIAGNOSTICS for request-scoped work that talks to a
 * third party.
 *
 * WHY THIS EXISTS. Two merchant-facing operations — the manual ranking scan and
 * the search-volume update — each waited about a minute and then produced
 * nothing: no row, no error in the retained platform window, no truthful
 * outcome in the UI. Neither had anything wrong with its business logic. What
 * they had in common is that NOTHING BOUNDED THEM and NOTHING RECORDED THEM:
 *
 *   * the search-volume route's two provider calls carried no AbortSignal at
 *     all, so a provider that accepts the connection and never answers holds
 *     the request open until the PLATFORM kills the function — and a killed
 *     function throws nothing, logs nothing and persists nothing;
 *   * the scan route's duration was simply the SUM of its external calls, and
 *     the entitlement step alone was measured at 46.2s against an unresponsive
 *     Shopify Partner API (three attempts, 15s each, plus backoff).
 *
 * A per-attempt timeout is not a deadline. Three 15-second attempts is a
 * 46-second operation. What a merchant-facing request needs is a budget for the
 * WHOLE operation, spent down by each step, so the handler always answers with
 * something true before the platform stops it.
 *
 * NOTHING HERE LOGS A SECRET. The diagnostics carry stable enum-like codes,
 * identifiers the account already owns, and durations — never a token, a
 * credential, a raw provider payload or an unclassified provider message.
 */

/** Thrown when a step ran out of the operation's remaining budget. */
export class DeadlineExceededError extends Error {
  readonly stage: string
  constructor(stage: string) {
    super(`deadline_exceeded:${stage}`)
    this.name = 'DeadlineExceededError'
    this.stage = stage
  }
}

/**
 * A budget for one operation, spent down as it proceeds.
 *
 * `remaining()` is what every step must be bounded by — never a fresh constant,
 * which is how three 15-second attempts became a 46-second wait.
 */
export class Deadline {
  private readonly endsAt: number
  constructor(budgetMs: number, private readonly nowFn: () => number = Date.now) {
    this.endsAt = nowFn() + budgetMs
  }
  remaining(): number {
    return Math.max(0, this.endsAt - this.nowFn())
  }
  expired(): boolean {
    return this.remaining() <= 0
  }
  /** The budget for one step: what is left, capped by the step's own limit. */
  sliceFor(stepLimitMs: number): number {
    return Math.min(stepLimitMs, this.remaining())
  }
  /** Fails the operation NOW rather than starting work that cannot finish. */
  assertNotExpired(stage: string): void {
    if (this.expired()) throw new DeadlineExceededError(stage)
  }
}

/**
 * Races a promise against a timeout. The promise itself is NOT cancelled — a
 * caller that owns a cancellation mechanism (an AbortController) should use it
 * instead; this is the backstop for work that offers none, so the handler can
 * still answer.
 */
export async function withDeadline<T>(work: Promise<T>, ms: number, stage: string): Promise<T> {
  if (ms <= 0) throw new DeadlineExceededError(stage)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DeadlineExceededError(stage)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** How a provider call ended, in terms a merchant-facing message can be built
 *  from — and a log line can carry — without quoting the provider. */
export type ProviderOutcome = 'ok' | 'timeout' | 'network' | 'auth' | 'rate_limited' | 'server_error' | 'bad_request' | 'malformed'

export interface ProviderResult<T> {
  ok: boolean
  outcome: ProviderOutcome
  status: number | null
  data: T | null
  /**
   * The parsed body of a NON-2xx response, best-effort.
   *
   * Providers put the actionable part of a failure in the body — which
   * credential is wrong, which quota was hit — and without it a caller has to
   * either re-issue the request to find out or report nothing useful. It is
   * returned to the CALLER for classification and must never be forwarded to a
   * merchant or written to a log: it is provider text.
   */
  errorBody: unknown
}

/**
 * One HTTP call to a third party, bounded by `timeoutMs` and classified.
 *
 * The classification is the point: `[keyword-metrics] api error` told us a call
 * failed but not whether it timed out, was refused, or was throttled — and when
 * the platform killed the function there was not even that.
 */
export async function fetchProvider<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderResult<T>> {
  if (timeoutMs <= 0) return { ok: false, outcome: 'timeout', status: null, data: null, errorBody: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      const outcome: ProviderOutcome =
        res.status === 401 || res.status === 403 ? 'auth'
          : res.status === 429 ? 'rate_limited'
            : res.status >= 500 ? 'server_error'
              : 'bad_request'
      // Read the body ONCE, here, so no caller has to re-issue the request to
      // learn why it failed.
      const errorBody = await res.json().catch(() => null)
      return { ok: false, outcome, status: res.status, data: null, errorBody }
    }
    try {
      return { ok: true, outcome: 'ok', status: res.status, data: (await res.json()) as T, errorBody: null }
    } catch {
      return { ok: false, outcome: 'malformed', status: res.status, data: null, errorBody: null }
    }
  } catch (err) {
    const aborted = controller.signal.aborted || (err as Error)?.name === 'AbortError'
    return { ok: false, outcome: aborted ? 'timeout' : 'network', status: null, data: null, errorBody: null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * ONE structured line per merchant-facing operation, emitted whatever happens.
 *
 * Both production failures left the retained window with nothing at all, so the
 * first question — which stage consumed the minute — could not be answered from
 * the platform log. This is what answers it next time. Deliberately one line of
 * JSON, deliberately non-secret, and deliberately emitted from a `finally`.
 */
export interface OperationDiagnostics {
  operation: 'ranking_scan' | 'search_volume'
  stage: string
  outcome: string
  durationMs: number
  requestId: string
  userId?: string
  projectId?: string
  targetId?: string
  targetCount?: number
  providerStatus?: number | null
  providerOutcome?: ProviderOutcome | null
  reservationOutcome?: string | null
  persisted?: number | null
  persistenceOutcome?: string | null
}

export function logOperation(d: OperationDiagnostics): void {
  console.log('[operation]', JSON.stringify(d))
}

/** A short, non-secret correlation id the response can also carry, so a
 *  merchant report ("it failed at about 14:30") can be matched to a log line. */
export function newRequestId(): string {
  return `op_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
