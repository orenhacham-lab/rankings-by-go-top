/**
 * What the competitive view shows, decided from its two answers: the competitive
 * route (lib/keyword-research/competitive-route.ts) and Search Console's status
 * (the same /api/gsc/status every Search Console widget of the page shares).
 *
 * NEVER A FLASH OF THE WRONG STATE: until both answers are in, the view is its
 * skeleton, never "no competitors", "connect Search Console" or an empty table that
 * the next answer would replace. A failed read is an error with a retry, never an
 * empty state.
 *
 * Pure: no React, no I/O.
 */
import type { GscSetupState, GscStatusView } from '@/lib/gsc/widget-state'
import type { MappingFlag, MappingRow, RankingRow } from '@/lib/keyword-research/competitive'
import type { CompetitiveResponse } from '@/lib/keyword-research/competitive-route'

export type CompetitiveFetch =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; data: CompetitiveResponse }

/** Search Console's part of the rankings: its figures, or why they are not there. */
export type RankingsSource = 'ready' | 'disabled' | GscSetupState

export type CompetitiveScreen =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; data: CompetitiveResponse; gsc: RankingsSource }

export function competitiveScreen(fetchState: CompetitiveFetch, gsc: GscStatusView): CompetitiveScreen {
  if (fetchState.state === 'error') return { state: 'error' }
  if (fetchState.state === 'loading') return { state: 'loading' }
  const data = fetchState.data
  // Switched off on the server: no prompt to connect what cannot be connected.
  if (!data.gscEnabled || gsc.state === 'disabled') return { state: 'ready', data, gsc: 'disabled' }
  if (gsc.state === 'loading') return { state: 'loading' }
  if (gsc.state === 'error') return { state: 'error' }
  if (gsc.state === 'ready') return { state: 'ready', data, gsc: data.gscRun ? 'ready' : 'never_synced' }
  return { state: 'ready', data, gsc: gsc.state }
}

export type RankingsFilter = 'all' | 'tracked' | 'gsc'
export type MappingFilter = 'all' | 'no_page' | 'competing'

export function filterRankings(rows: readonly RankingRow[], filter: RankingsFilter): RankingRow[] {
  if (filter === 'tracked') return rows.filter((r) => r.scan !== null)
  if (filter === 'gsc') return rows.filter((r) => r.scan === null && r.gsc !== null)
  return [...rows]
}

export function filterMapping(rows: readonly MappingRow[], filter: MappingFilter): MappingRow[] {
  if (filter === 'all') return [...rows]
  return rows.filter((r) => r.flag === (filter as MappingFlag))
}

/**
 * A mapping row's status label key. "No page shows on Google" is said only when
 * Search Console backs it; from our top-20 check alone it is "none in the top 20".
 */
export function mappingFlagKey(row: Pick<MappingRow, 'flag' | 'confirmedByGsc'>): 'ok' | 'no_page' | 'no_page_top20' | 'competing' | 'unknown' {
  if (row.flag === 'no_page') return row.confirmedByGsc ? 'no_page' : 'no_page_top20'
  return row.flag
}

/** "/services/drain-cleaning" of a page URL, for a caption; the URL itself when unparseable. */
export function pagePath(url: string): string {
  try {
    const u = new URL(url)
    const path = decodeURI(u.pathname + u.search)
    return path === '/' ? u.hostname.replace(/^www\./, '') : path
  } catch {
    return url
  }
}
