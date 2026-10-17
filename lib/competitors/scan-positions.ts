/**
 * The competitor side of a rank scan, for the two places a scan is persisted:
 * the manual scan (app/api/scan/route.ts) and the scheduled scan
 * (lib/scan-scheduler/process-scheduled-scan.ts).
 *
 * The scanner already fetches the top 20 organic results for every keyword and
 * used to keep only the project's own position. It now also reports where each
 * of the project's competitors stood in that same page (see
 * lib/scanner/competitor-positions.ts); this module loads the competitor list
 * for a scan and writes what the scanner reported.
 *
 * BEST EFFORT, BY CONSTRUCTION. A scan is what the merchant paid a check for;
 * competitor positions are extra. So nothing here may fail or hold up a scan:
 *   - no function in this module rejects or throws, whatever the database does;
 *   - every database call is bounded by its own short timeout;
 *   - the scan never waits on this module: the competitor list loads while the
 *     scan prepares, each keyword's insert runs while the scan moves on, and
 *     the inserts still in flight at the end finish after the response;
 *   - a failure is logged as a stable code (and the PostgREST/SQLSTATE code,
 *     which is ours, not the provider's), never a message, a URL or a payload.
 *
 * Service-role only. The caller passes the admin client it already holds, and
 * every read and write here is scoped to the project AND its owner explicitly,
 * because that client bypasses RLS.
 */
import { after } from 'next/server'
import type { CompetitorPosition } from '@/lib/scanner/types'
import type { KeywordCompetitorPosition } from '@/lib/supabase/types'
import { MAX_COMPETITOR_DOMAINS, COMPETITOR_TOP_N } from '@/lib/scanner/competitor-positions'

/** The subset of a Supabase client this module uses; satisfied by the admin client and QA fakes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminLike = { from: (table: string) => any }

/** The competitor list read. The scan does not wait for it either way. */
export const COMPETITOR_LOAD_TIMEOUT_MS = 2_000
/** One keyword's insert. It runs while the scan moves on to the next keyword. */
export const COMPETITOR_SAVE_TIMEOUT_MS = 3_000
/** A result URL longer than this is not stored (the position still is). */
const MAX_URL_LENGTH = 2_048

export type CompetitorSaveOutcome = 'saved' | 'skipped' | 'failed' | 'timeout'

export type KeywordCompetitorPositionInsert = Omit<KeywordCompetitorPosition, 'id' | 'created_at'>

const TIMED_OUT = Symbol('timed_out')

/** Resolves to the work's result, or to TIMED_OUT once `ms` has passed. Never rejects on its own. */
async function within<T>(work: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), Math.max(0, ms)) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function logCode(event: string, fields: Record<string, string | number | null | undefined> = {}) {
  console.error('[competitor-positions]', { event, ...fields })
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && code.length <= 16 ? code : null
}

/**
 * The domains of the project's ACTIVE competitors, as configured today in
 * ai_visibility_competitors (the list the AI visibility tab manages). Raw
 * configured strings: the scanner normalizes them exactly as it normalizes the
 * project's own domain. Resolves to [] on any failure.
 */
export async function loadCompetitorDomainsForScan(
  admin: AdminLike,
  scope: { projectId: string; ownerId: string | null | undefined },
): Promise<string[]> {
  if (!scope.projectId || !scope.ownerId) return []
  try {
    const res = await within(
      admin
        .from('ai_visibility_competitors')
        .select('domain')
        .eq('project_id', scope.projectId)
        .eq('user_id', scope.ownerId)
        .eq('is_active', true),
      COMPETITOR_LOAD_TIMEOUT_MS,
    )
    if (res === TIMED_OUT) {
      logCode('competitors_load_timeout', { projectId: scope.projectId })
      return []
    }
    const { data, error } = (res ?? {}) as { data?: Array<{ domain?: unknown }> | null; error?: unknown }
    if (error) {
      logCode('competitors_load_failed', { projectId: scope.projectId, code: errorCode(error) })
      return []
    }
    const out: string[] = []
    for (const row of data ?? []) {
      const domain = typeof row?.domain === 'string' ? row.domain.trim() : ''
      if (domain && !out.includes(domain)) out.push(domain)
      if (out.length >= MAX_COMPETITOR_DOMAINS) break
    }
    return out
  } catch {
    logCode('competitors_load_exception', { projectId: scope.projectId })
    return []
  }
}

/** The rows one keyword check produces: one per competitor, position or not. */
export function competitorPositionRows(args: {
  ownerId: string
  projectId: string
  trackingTargetId: string
  checkedAt: string
  positions: readonly CompetitorPosition[]
}): KeywordCompetitorPositionInsert[] {
  const rows: KeywordCompetitorPositionInsert[] = []
  const seen = new Set<string>()
  for (const p of args.positions) {
    const domain = typeof p?.domain === 'string' ? p.domain.trim() : ''
    if (!domain || seen.has(domain)) continue
    seen.add(domain)
    const ranked = Number.isInteger(p.position) && (p.position as number) >= 1 && (p.position as number) <= COMPETITOR_TOP_N
    const url = ranked && typeof p.url === 'string' && p.url.length > 0 && p.url.length <= MAX_URL_LENGTH ? p.url : null
    rows.push({
      user_id: args.ownerId,
      project_id: args.projectId,
      tracking_target_id: args.trackingTargetId,
      competitor_domain: domain,
      position: ranked ? (p.position as number) : null,
      url,
      checked_at: args.checkedAt,
    })
  }
  return rows
}

/**
 * Writes one keyword check's competitor positions. `checkedAt` MUST be the
 * `checked_at` of the scan_results row written for the same check, which is how
 * a screen pairs "your position" with the competitors' positions from the same
 * result page. Never rejects; resolves to what happened.
 */
export async function recordCompetitorPositions(
  admin: AdminLike,
  args: {
    ownerId: string | null | undefined
    projectId: string
    trackingTargetId: string
    checkedAt: string
    positions: readonly CompetitorPosition[] | null | undefined
  },
): Promise<CompetitorSaveOutcome> {
  try {
    if (!args.ownerId || !Array.isArray(args.positions) || args.positions.length === 0) return 'skipped'
    const rows = competitorPositionRows({
      ownerId: args.ownerId, projectId: args.projectId, trackingTargetId: args.trackingTargetId,
      checkedAt: args.checkedAt, positions: args.positions,
    })
    if (rows.length === 0) return 'skipped'
    const res = await within(admin.from('keyword_competitor_positions').insert(rows), COMPETITOR_SAVE_TIMEOUT_MS)
    if (res === TIMED_OUT) {
      logCode('save_timeout', { projectId: args.projectId, targetId: args.trackingTargetId })
      return 'timeout'
    }
    const error = (res as { error?: unknown } | null)?.error
    if (error) {
      logCode('save_failed', { projectId: args.projectId, targetId: args.trackingTargetId, code: errorCode(error) })
      return 'failed'
    }
    return 'saved'
  } catch {
    logCode('save_exception', { projectId: args.projectId, targetId: args.trackingTargetId })
    return 'failed'
  }
}

/** Resolves once every save has settled, or after `graceMs`, whichever is first. Never rejects. */
export async function settleCompetitorSaves(saves: ReadonlyArray<Promise<unknown>>, graceMs: number): Promise<void> {
  if (saves.length === 0) return
  try {
    await within(Promise.allSettled(saves), graceMs)
  } catch {
    // allSettled does not reject; this only keeps the promise contract total.
  }
}

/**
 * The inserts still in flight when a scan is done finish AFTER its response:
 * `after()` keeps the function alive for them (bounded) and the scan answers
 * without waiting. Outside a request (a script, a QA run) there is no response
 * to hold and nothing to keep alive: the saves, each bounded and never
 * rejecting, simply run on. Never throws.
 */
export function finishCompetitorSavesAfterResponse(
  saves: ReadonlyArray<Promise<unknown>>,
): 'none' | 'after_response' | 'no_request_scope' {
  if (saves.length === 0) return 'none'
  const pending = [...saves]
  try {
    after(() => settleCompetitorSaves(pending, COMPETITOR_SAVE_TIMEOUT_MS))
    return 'after_response'
  } catch {
    return 'no_request_scope'
  }
}
