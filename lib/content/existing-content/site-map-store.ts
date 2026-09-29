/**
 * site_page_map: one row per project, the full-site mapping's state and result
 * (supabase/migrations/20260929000000_site_page_map.sql).
 *
 * Written only by server code with the service role, which BYPASSES RLS, so
 * every read and write here is filtered by the project AND its owner. The owner
 * may read the row through RLS; there is no write policy.
 *
 * DEGRADES while the migration is not applied: a missing table reads as
 * `available: false` (the screen hides the mapping and shows what the other
 * sources hold), and a start answers 'unavailable'. Nothing throws for it.
 *
 * ONE RUN AT A TIME. A run holds a lease (lease_expires_at). A start takes the
 * row only when no run holds it: a conditional update for an existing row, an
 * insert for a new one (the primary key refuses a second insert). The previous
 * result stays in the row while a new run works, so the screen never goes blank.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { SiteMapEntry, SiteMapState, SiteMapStatus, TabCounts } from './model'

type Admin = ReturnType<typeof createAdminClient>

export const MAP_TABLE = 'site_page_map'
/** Longer than a run's work window, so a live run never loses its lease; short enough that a dead one frees quickly. */
export const MAP_LEASE_MS = 150_000
/** A finished mapping younger than this is fresh: visiting the screen does not start another. */
export const MAP_FRESH_MS = 7 * 24 * 3600_000
/** The refresh button waits this long after the last run finished. */
export const MAP_MIN_INTERVAL_MS = 5 * 60_000

export const missingTable = (e: unknown) => ['42P01', 'PGRST205'].includes(String((e as { code?: unknown } | null)?.code ?? ''))

export interface SiteMapRow {
  status: 'running' | 'completed' | 'partial' | 'failed'
  phase: string | null
  urls_found: number | null
  docs_read: number | null
  docs_seen: number | null
  capped: boolean | null
  stop_reason: string | null
  lease_expires_at: string | null
  started_at: string | null
  finished_at: string | null
  site_url?: string | null
  counts?: Partial<TabCounts> | null
  entries?: SiteMapEntry[] | null
}

const STATUS_COLUMNS = 'status, phase, urls_found, docs_read, docs_seen, capped, stop_reason, lease_expires_at, started_at, finished_at, site_url'

export class SiteMapReadError extends Error {
  constructor() { super('site_map_read_failed'); this.name = 'SiteMapReadError' }
}

/** The row, with its entries or without them (the progress poll). */
export async function readSiteMap(
  admin: Admin,
  scope: { projectId: string; userId: string },
  opts: { entries: boolean },
): Promise<{ available: false } | { available: true; row: SiteMapRow | null }> {
  const { data, error } = await admin
    .from(MAP_TABLE)
    .select(opts.entries ? `${STATUS_COLUMNS}, counts, entries` : `${STATUS_COLUMNS}, counts`)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error) {
    if (missingTable(error)) return { available: false }
    throw new SiteMapReadError()
  }
  return { available: true, row: (data as SiteMapRow | null) ?? null }
}

/** The row as the screen sees it. A run whose lease ran out died mid-way: it is shown as failed. */
export function mapStatus(
  read: { available: false } | { available: true; row: SiteMapRow | null },
  hasSite: boolean,
  now: number,
): SiteMapStatus {
  const blank: SiteMapStatus = { state: 'never', phase: null, found: 0, docsRead: 0, docsSeen: 0, startedAt: null, finishedAt: null, capped: false, stopReason: null }
  if (!read.available) return { ...blank, state: 'unavailable' }
  if (!hasSite) return { ...blank, state: 'no_site' }
  const row = read.row
  if (!row) return blank
  const dead = row.status === 'running' && (!row.lease_expires_at || Date.parse(row.lease_expires_at) < now)
  const state: SiteMapState = dead ? 'failed' : row.status
  return {
    state,
    phase: state === 'running' ? row.phase : null,
    found: Number(row.urls_found) || 0,
    docsRead: Number(row.docs_read) || 0,
    docsSeen: Number(row.docs_seen) || 0,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    capped: !!row.capped,
    stopReason: dead ? 'lease_expired' : row.stop_reason,
  }
}

export type ClaimOutcome = 'claimed' | 'running' | 'recent' | 'unavailable' | 'failed'

/**
 * Take the row for a new run. 'running' when a live run holds it; 'recent' when
 * the last run finished less than minIntervalMs ago, so repeated clicks cannot
 * make the app hammer the merchant's site.
 */
export async function claimSiteMap(
  admin: Admin,
  scope: { projectId: string; userId: string },
  opts: { siteUrl: string; now: number; minIntervalMs?: number },
): Promise<ClaimOutcome> {
  const { projectId, userId } = scope
  const nowIso = new Date(opts.now).toISOString()
  const lease = new Date(opts.now + MAP_LEASE_MS).toISOString()
  const read = await readSiteMap(admin, scope, { entries: false }).catch(() => null)
  if (!read) return 'failed'
  if (!read.available) return 'unavailable'
  const fresh = {
    status: 'running', phase: 'robots', urls_found: 0, docs_read: 0, docs_seen: 0, capped: false, stop_reason: null,
    site_url: opts.siteUrl, lease_expires_at: lease, started_at: nowIso, finished_at: null,
  }
  const row = read.row
  if (row) {
    if (row.status === 'running' && row.lease_expires_at && Date.parse(row.lease_expires_at) >= opts.now) return 'running'
    const minInterval = opts.minIntervalMs ?? MAP_MIN_INTERVAL_MS
    if (row.status !== 'running' && row.finished_at && opts.now - Date.parse(row.finished_at) < minInterval) return 'recent'
    const { data, error } = await admin
      .from(MAP_TABLE)
      .update(fresh)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .or(`status.neq.running,lease_expires_at.lt.${nowIso}`)
      .select('project_id')
    if (error) return missingTable(error) ? 'unavailable' : 'failed'
    return (data ?? []).length > 0 ? 'claimed' : 'running'
  }
  const { error } = await admin.from(MAP_TABLE).insert({ project_id: projectId, user_id: userId, ...fresh, entries: [], counts: {} })
  if (!error) return 'claimed'
  if (String((error as { code?: unknown }).code) === '23505') return 'running'
  return missingTable(error) ? 'unavailable' : 'failed'
}

/** Progress while the run works; extends the lease. Never throws: progress is best-effort. */
export async function progressSiteMap(
  admin: Admin,
  scope: { projectId: string; userId: string },
  p: { phase: string; found: number; docsRead: number; docsSeen: number; now: number },
): Promise<void> {
  try {
    await admin
      .from(MAP_TABLE)
      .update({
        phase: p.phase, urls_found: p.found, docs_read: p.docsRead, docs_seen: p.docsSeen,
        lease_expires_at: new Date(p.now + MAP_LEASE_MS).toISOString(),
      })
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .eq('status', 'running')
  } catch { /* the final write carries the result */ }
}

/** The result. Stable codes only in stop_reason, never provider text. */
export async function finishSiteMap(
  admin: Admin,
  scope: { projectId: string; userId: string },
  r: {
    status: 'completed' | 'partial' | 'failed'
    entries: SiteMapEntry[] | null
    counts: TabCounts | null
    capped: boolean
    stopReason: string | null
    docsRead: number
    docsSeen: number
    now: number
  },
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    status: r.status, phase: null, capped: r.capped, stop_reason: r.stopReason,
    docs_read: r.docsRead, docs_seen: r.docsSeen, lease_expires_at: null, finished_at: new Date(r.now).toISOString(),
  }
  // A failed run keeps the previous result: the screen goes on showing it.
  if (r.entries) { patch.entries = r.entries; patch.urls_found = r.entries.length }
  if (r.counts) patch.counts = r.counts
  const { error } = await admin
    .from(MAP_TABLE)
    .update(patch)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
  return !error
}
