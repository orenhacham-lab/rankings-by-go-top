/**
 * WHICH SEARCH CONSOLE ROWS ARE WORTH REMEMBERING, AND FOR HOW LONG.
 *
 * gsc_query_page_metrics keeps one snapshot per project and window (older runs'
 * rows are pruned, on purpose: they filled the database on 2026-11-05). So the
 * system could never say "this page was at position 14 three weeks ago and is
 * at 9 now". This module is the pure part of the fix: from a full window of
 * rows it picks the small set that can answer that question, and nothing else.
 *
 *   position 1-30    a page that climbs from 12 to 3 must still be recorded at 3,
 *                    so the floor is 1, not 5. Past 30 a page is not movable by
 *                    the kind of change this product makes.
 *   impressions >= 5 below that the numbers are noise, and noise is most of the
 *                    181 k rows: 33,020 of them qualify (measured 21 Nov 2026).
 *   at most 2000     per project per sync, highest impressions first, so one very
 *                    large property cannot decide the storage bill.
 *
 * Pure: no database, no clock. The store and the sync call it.
 */
import type { GscMetricRow } from './summary'

/** Only this window is archived; the 90-day one overlaps it and would double the storage. */
export const HISTORY_WINDOW_DAYS = 28
export const HISTORY_POSITION_MAX = 30
export const HISTORY_MIN_IMPRESSIONS = 5
export const HISTORY_MAX_ROWS_PER_SYNC = 2000
/** Rows older than this (against the newest window end) are deleted after each archive. */
export const HISTORY_RETENTION_DAYS = 182

export function selectHistoryRows(rows: readonly GscMetricRow[]): GscMetricRow[] {
  const kept = rows.filter((r) =>
    Number.isFinite(r.position) && r.position > 0 && r.position <= HISTORY_POSITION_MAX &&
    Number.isFinite(r.impressions) && r.impressions >= HISTORY_MIN_IMPRESSIONS &&
    typeof r.query === 'string' && r.query !== '' && typeof r.page === 'string' && r.page !== '')
  // Highest impressions first; query then page break ties so the cut is deterministic.
  kept.sort((a, b) => b.impressions - a.impressions || (a.query < b.query ? -1 : a.query > b.query ? 1 : 0) || (a.page < b.page ? -1 : a.page > b.page ? 1 : 0))
  return kept.slice(0, HISTORY_MAX_ROWS_PER_SYNC)
}

/** The oldest `window_end` still kept, as YYYY-MM-DD, or null when the date is not a date. */
export function historyRetentionCutoff(windowEnd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(windowEnd)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // Date.UTC rolls 2026-13-45 over into a real date; only a date that survives the round trip is one.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== windowEnd) return null
  d.setUTCDate(d.getUTCDate() - HISTORY_RETENTION_DAYS)
  return d.toISOString().slice(0, 10)
}
