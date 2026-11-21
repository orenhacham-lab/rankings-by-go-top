/**
 * OUR OWN SEARCH CONSOLE ROWS, READ FROM THE SYNC WE ALREADY RUN.
 *
 * gotopseo.com is itself one of the projects with a Search Console connection
 * (measured 21 Nov 2026: 5,061 stored rows, synced 7 and 15 Nov, a 90-day and
 * a 28-day window each time), so nothing here needs the Google API, a token or
 * a credential: it reads the newest succeeded sync run of the project whose
 * `site_url` is our own site.
 *
 * The project is found by that URL and not by an id written into the code, so
 * a reconnection — which makes a new project row — cannot silently turn a
 * caller into a reader of nothing.
 *
 * Read-only, and one place, because two callers now want the same rows: the
 * weekly reading and the keyword queue.
 */
import type { OutcomeRow } from '@/lib/blog/auto/outcomes'
import { SITE_URL } from '@/lib/blog/auto/brief'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/** How many recent syncs are scanned for ours. 28 projects sync, twice each. */
export const OWN_SYNC_SCAN = 80

export interface OwnSearchReading {
  /** When the sync ran, so a stale reading can say it is stale. */
  syncedAt: string | null
  windowStart: string | null
  windowEnd: string | null
  rows: OutcomeRow[]
}

const host = (url: string): string => {
  try { return new URL(url).host } catch { return '' }
}

export async function readOwnSearchRows(admin: Admin): Promise<OwnSearchReading | null> {
  const ours = host(SITE_URL)

  const { data: runs } = await admin
    .from('gsc_sync_runs')
    .select('id, site_url, start_date, end_date, started_at')
    .eq('status', 'succeeded')
    .order('started_at', { ascending: false })
    .limit(OWN_SYNC_SCAN)
  const run = ((runs ?? []) as { id: string; site_url: string | null; start_date: string | null; end_date: string | null; started_at: string | null }[])
    .find((r) => host(r.site_url ?? '') === ours)
  if (!run) return null

  const { data: metrics } = await admin
    .from('gsc_query_page_metrics')
    .select('query, page, clicks, impressions, position')
    .eq('sync_run_id', run.id)

  return {
    syncedAt: run.started_at ?? null,
    windowStart: run.start_date ?? null,
    windowEnd: run.end_date ?? null,
    rows: ((metrics ?? []) as { query: string | null; page: string | null; clicks: number | null; impressions: number | null; position: number | null }[])
      .filter((r) => r.query && r.page && r.position !== null)
      .map((r) => ({
        query: String(r.query), page: String(r.page),
        clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), position: Number(r.position),
      })),
  }
}
