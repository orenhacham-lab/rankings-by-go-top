/**
 * Where a geo-grid check's measurement points are stored.
 *
 * The aggregate of a grid check is a scan_results row like any other check's.
 * The points are the thing a map can draw, and until now the product threw
 * exactly this away: radius mode has measured nine points per check since it
 * shipped and kept none of them, so nine paid provider requests left one number
 * behind and the customer could never be shown WHERE they were weak.
 *
 * BEST EFFORT, like the competitor positions beside it: a scan is what the
 * customer paid a check for, and nothing here may fail or delay it. Every call
 * is bounded by its own timeout, nothing throws, and a failure is logged as a
 * stable code with the SQLSTATE — never a keyword, a coordinate or a row.
 *
 * Service-role only. The caller passes the admin client it already holds, and
 * every row carries the owner and the project explicitly, because that client
 * bypasses RLS.
 */
import { after } from 'next/server'
import type { GridScanMetadata } from './types'

/** The subset of a Supabase client this module uses; satisfied by the admin client and QA fakes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminLike = { from: (table: string) => any }

/** One grid's insert. The scan moves on without waiting for it. */
export const GRID_SAVE_TIMEOUT_MS = 4_000

/**
 * How much of the request's remaining time the grid batch leaves behind: enough
 * to write the aggregate row and these points after the last provider call.
 */
export const GRID_DEADLINE_MARGIN_MS = 5_000

export interface GridPointsSave {
  ownerId: string
  projectId: string
  trackingTargetId: string
  scanResultId: string
  checkedAt: string
  grid: GridScanMetadata
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/**
 * Never rejects. Returns the number of points written, or 0.
 */
export async function recordGridPoints(admin: AdminLike, save: GridPointsSave): Promise<number> {
  const rows = save.grid.points.map((p) => ({
    user_id: save.ownerId,
    project_id: save.projectId,
    tracking_target_id: save.trackingTargetId,
    scan_result_id: save.scanResultId,
    row_index: p.row,
    col_index: p.col,
    lat: p.lat,
    lng: p.lng,
    found: p.found,
    // The table's own constraint: a position only where the business was found.
    position: p.found ? p.position : null,
  }))
  const valid = rows.filter(
    (r) =>
      r.row_index >= 0 && r.row_index <= 8 && r.col_index >= 0 && r.col_index <= 8 &&
      Number.isFinite(r.lat) && Number.isFinite(r.lng) &&
      Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180 &&
      (r.found ? typeof r.position === 'number' && r.position >= 1 && r.position <= 20 : true)
  ).map((r) => ({ ...r, position: r.found ? r.position : null, checked_at: save.checkedAt }))

  if (valid.length === 0) return 0

  const result = await withTimeout(
    Promise.resolve(admin.from('scan_grid_points').insert(valid)),
    GRID_SAVE_TIMEOUT_MS
  )
  const error = (result as { error?: { code?: string } } | null)?.error
  if (error) {
    console.error('[grid-points] save failed', { code: error.code ?? null, points: valid.length })
    return 0
  }
  if (result === null) {
    console.error('[grid-points] save timed out', { points: valid.length })
    return 0
  }
  return valid.length
}

/**
 * Grid inserts still in flight when the response is sent finish afterwards, the
 * same arrangement the competitor positions use: the customer is not kept
 * waiting for a map's detail, and the detail is not dropped either. Outside a
 * request scope (a test, a script) there is no `after`, so nothing is scheduled
 * and the caller is told so.
 */
export function finishGridSavesAfterResponse(
  saves: ReadonlyArray<Promise<unknown>>
): 'none' | 'after_response' | 'no_request_scope' {
  if (saves.length === 0) return 'none'
  const pending = [...saves]
  try {
    after(async () => {
      await withTimeout(Promise.all(pending).then(() => null), GRID_SAVE_TIMEOUT_MS)
    })
    return 'after_response'
  } catch {
    return 'no_request_scope'
  }
}
