/**
 * Area A — weekly Search Console auto-sync: a DAILY, BOUNDED dispatcher.
 *
 * The cron runs daily but each project is only due once its last SUCCESSFUL sync is
 * older than 7 days, so a daily invocation syncs only what is actually due. Projects
 * are ordered oldest-successful-sync-first (never-synced first) and a bounded batch
 * runs per invocation — a just-synced project naturally sorts to the back tomorrow,
 * so no cursor/bookkeeping table is needed (no migration).
 *
 * This module does NOT implement syncing: it selects who is due and delegates each
 * project to the EXISTING executeManualSync engine (injected as `syncOne`), so manual
 * and automatic syncs always share one implementation and one set of semantics.
 *
 * Selection is a pure function (selectDueProjects) so eligibility, the 7-day filter,
 * ordering and the batch bound are unit-testable without a database.
 */

/** A project that has a Search Console property assigned (pre-join of the 4 sources). */
export interface AutoSyncCandidate {
  projectId: string
  connectionId: string
  siteUrl: string
  /** projects.is_active */
  projectActive: boolean
  /** gsc_connections.status */
  connectionStatus: 'connected' | 'reauth_required' | 'revoked' | 'error' | string
  /** finished_at of the most recent SUCCEEDED run, or null when never synced. */
  lastSuccessAt: string | null
}

export type SkipReason =
  | 'project_inactive'
  | 'connection_reauth_required'
  | 'connection_revoked'
  | 'connection_not_connected'
  | 'synced_recently'

export interface SkippedProject { projectId: string; reason: SkipReason }

/** Minimum age of the last successful sync before a project is due again. */
export const AUTO_SYNC_MIN_INTERVAL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** Default projects launched per invocation (env-overridable). */
export function getAutoSyncBatchSize(): number {
  const raw = Number(process.env.GSC_AUTO_SYNC_BATCH_SIZE)
  return Number.isFinite(raw) && raw > 0 ? Math.min(100, Math.floor(raw)) : 10
}

/**
 * Wall-clock budget for one invocation, and the slice reserved for a single project.
 * The dispatcher stops LAUNCHING new projects once the remaining time is under the
 * reserve, so a run never gets killed mid-project by the platform duration limit.
 * A project skipped for time is simply picked up on the next daily run.
 */
export function getAutoSyncTimeBudgetMs(): number {
  const raw = Number(process.env.GSC_AUTO_SYNC_TIME_BUDGET_MS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 240_000
}
export function getAutoSyncPerProjectReserveMs(): number {
  const raw = Number(process.env.GSC_AUTO_SYNC_PROJECT_RESERVE_MS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 45_000
}

/**
 * PURE selection: which candidates are due, in run order, bounded by `limit`.
 *
 * Eligible = active project + assigned property (implied by being a candidate) +
 * connection status 'connected' + no successful sync within the interval.
 * Order = oldest successful sync first, with NEVER-SYNCED FIRST (NULLS FIRST),
 * tie-broken by projectId so the order is deterministic.
 */
export function selectDueProjects(
  candidates: AutoSyncCandidate[],
  opts: { nowMs: number; limit: number; minIntervalDays?: number },
): { due: AutoSyncCandidate[]; skipped: SkippedProject[]; dueTotal: number } {
  const minIntervalMs = (opts.minIntervalDays ?? AUTO_SYNC_MIN_INTERVAL_DAYS) * DAY_MS
  const skipped: SkippedProject[] = []
  const eligible: AutoSyncCandidate[] = []

  for (const c of candidates) {
    if (!c.projectActive) { skipped.push({ projectId: c.projectId, reason: 'project_inactive' }); continue }
    if (c.connectionStatus !== 'connected') {
      const reason: SkipReason =
        c.connectionStatus === 'reauth_required' ? 'connection_reauth_required'
          : c.connectionStatus === 'revoked' ? 'connection_revoked'
            : 'connection_not_connected'
      skipped.push({ projectId: c.projectId, reason }); continue
    }
    if (c.lastSuccessAt) {
      const last = Date.parse(c.lastSuccessAt)
      // An unparseable timestamp is treated as "never synced" (fail toward syncing),
      // never as "recently synced" — a project must not be starved by bad data.
      if (Number.isFinite(last) && opts.nowMs - last < minIntervalMs) {
        skipped.push({ projectId: c.projectId, reason: 'synced_recently' }); continue
      }
    }
    eligible.push(c)
  }

  eligible.sort((a, b) => {
    const ta = a.lastSuccessAt ? Date.parse(a.lastSuccessAt) : NaN
    const tb = b.lastSuccessAt ? Date.parse(b.lastSuccessAt) : NaN
    const aNever = !Number.isFinite(ta)
    const bNever = !Number.isFinite(tb)
    if (aNever !== bNever) return aNever ? -1 : 1   // NULLS FIRST
    if (!aNever && !bNever && ta !== tb) return ta - tb // oldest first
    return a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0
  })

  return { due: eligible.slice(0, Math.max(0, opts.limit)), skipped, dueTotal: eligible.length }
}

/**
 * Outcomes that are NOT failures: another sync already holds the active-run lock, or
 * the connection needs the user's attention. Counting these as failures would make the
 * run summary misleading, so they are reported as `skipped` at run time.
 */
export const BENIGN_SKIP_CODES = new Set([
  'sync_in_progress',      // the unique-active-run index rejected a concurrent run
  'reauth_required',       // connection flipped between selection and token refresh
  'connection_revoked',
  'connection_missing',
  'no_property_assigned',
])

export interface AutoSyncProjectResult {
  projectId: string
  status: 'succeeded' | 'partial' | 'failed' | 'skipped'
  /** Sanitized code only — never a token, URL secret, or raw provider text. */
  error?: string
}

export interface AutoSyncSummary {
  candidates: number
  dueTotal: number
  launched: number
  succeeded: number
  partial: number
  failed: number
  /** Projects that were launched but yielded a benign skip (see BENIGN_SKIP_CODES). */
  skippedAtRun: number
  /** Projects filtered out before launch (ineligible / not yet due). */
  skipped: SkippedProject[]
  /** True when the run stopped launching projects to stay inside the time budget. */
  stoppedForTime: boolean
  durationMs: number
  results: AutoSyncProjectResult[]
}

/**
 * Run one bounded dispatch pass. `syncOne` performs the actual sync for a project
 * (in production: the existing executeManualSync engine). Each project is isolated:
 * one failure never stops the others, and only sanitized codes are recorded.
 */
export async function dispatchAutoSync(args: {
  candidates: AutoSyncCandidate[]
  syncOne: (c: AutoSyncCandidate) => Promise<{ status: 'succeeded' | 'partial' | 'failed' | 'skipped'; error?: string }>
  nowMs: number
  limit: number
  timeBudgetMs: number
  perProjectReserveMs: number
  /** Injected for tests; defaults to real elapsed wall-clock. */
  elapsedMs?: () => number
}): Promise<AutoSyncSummary> {
  const started = args.nowMs
  const elapsed = args.elapsedMs ?? (() => Date.now() - started)
  const { due, skipped, dueTotal } = selectDueProjects(args.candidates, { nowMs: args.nowMs, limit: args.limit })

  const results: AutoSyncProjectResult[] = []
  let stoppedForTime = false

  for (const c of due) {
    // Time-budget guard: stop LAUNCHING when the remaining time can't fit one project.
    if (elapsed() > args.timeBudgetMs - args.perProjectReserveMs) { stoppedForTime = true; break }
    try {
      const r = await args.syncOne(c)
      results.push({ projectId: c.projectId, status: r.status, ...(r.error ? { error: r.error } : {}) })
    } catch (e) {
      // Per-project isolation: record a sanitized code and continue with the rest.
      // A benign code (lock held / needs reconnect) is reported as a skip, not a failure.
      const code = e instanceof Error && typeof (e as { code?: string }).code === 'string'
        ? String((e as { code?: string }).code)
        : 'sync_failed'
      results.push({ projectId: c.projectId, status: BENIGN_SKIP_CODES.has(code) ? 'skipped' : 'failed', error: code })
    }
  }

  return {
    candidates: args.candidates.length,
    dueTotal,
    launched: results.length,
    succeeded: results.filter((r) => r.status === 'succeeded').length,
    partial: results.filter((r) => r.status === 'partial').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skippedAtRun: results.filter((r) => r.status === 'skipped').length,
    skipped,
    stoppedForTime,
    durationMs: elapsed(),
    results,
  }
}
