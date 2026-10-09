/**
 * Everything the weekly summary reads and writes.
 *
 * SCOPE. Every read is filtered by the project AND its owner (the service role bypasses
 * RLS); the one table without a user_id column (scan_results) is reached only through the
 * owner's own tracking targets. Nothing here is written except the sent-log.
 *
 * A SECTION THAT CANNOT BE READ COMES BACK NULL, never zero: lib/reports/weekly/aggregate.ts
 * leaves a null section out of the email instead of reporting that nothing happened.
 *
 * THE SENT-LOG is the two columns 20261009184500 adds to the row that already holds the
 * owner's switch. A database without them is reported as `unavailable`, and nothing is sent.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { rankedPosition } from '@/lib/reports/monthly/aggregate'
import type { WeeklyArticle, WeeklyInputs } from './aggregate'
import { isWeekKey } from './period'

export const PREFS_TABLE = 'project_report_preferences'
/** Rows read per source, and active keywords a week's ranking section looks at. */
export const LIST_CAP = 50
export const TARGETS_CAP = 200
export const TARGET_CHUNK = 50
export const CHECK_ROWS_CAP = 1000
/** How far back a keyword's "before" check may come from. */
export const BASELINE_LOOKBACK_DAYS = 60

const MISSING = new Set(['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'])
type Row = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const code = (e: unknown): string => String((e as { code?: unknown } | null)?.code ?? '')

/** Rows, or null when the read failed. A table that is not installed is "no rows". */
async function rows(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[] | null> {
  try {
    const { data, error } = await q
    if (error) return MISSING.has(code(error)) ? [] : null
    return Array.isArray(data) ? (data as Row[]) : []
  } catch {
    return null
  }
}

export interface WeeklyProject { id: string; user_id: string }

async function loadPublished(admin: ServiceRoleClient, p: WeeklyProject, start: Date, end: Date): Promise<WeeklyArticle[] | null> {
  const cols = 'title, published_at, shopify_published_at, wp_post_url, shopify_article_url'
  const owned = () => admin.from('generated_articles').select(cols).eq('project_id', p.id).eq('user_id', p.user_id)
  const [wp, shop] = await Promise.all([
    rows(owned().eq('status', 'published').gte('published_at', start.toISOString()).lt('published_at', end.toISOString()).limit(LIST_CAP)),
    rows(owned().eq('shopify_status', 'published').gte('shopify_published_at', start.toISOString()).lt('shopify_published_at', end.toISOString()).limit(LIST_CAP)),
  ])
  if (!wp || !shop) return null
  const out: WeeklyArticle[] = []
  for (const r of [...wp, ...shop]) {
    const at = str(r.published_at) ?? str(r.shopify_published_at)
    if (!at) continue
    out.push({ title: str(r.title) ?? '', url: str(r.wp_post_url) ?? str(r.shopify_article_url), at })
  }
  return out.filter((a) => a.title).sort((a, b) => a.at.localeCompare(b.at))
}

async function loadWaiting(admin: ServiceRoleClient, p: WeeklyProject): Promise<number | null> {
  const got = await rows(admin.from('generated_articles').select('id')
    .eq('project_id', p.id).eq('user_id', p.user_id).eq('status', 'ready').is('scheduled_at', null).limit(LIST_CAP * 4))
  return got ? got.length : null
}

async function loadNextScheduled(admin: ServiceRoleClient, p: WeeklyProject, from: Date): Promise<{ title: string | null; at: string } | null> {
  const got = await rows(admin.from('generated_articles').select('title, scheduled_at')
    .eq('project_id', p.id).eq('user_id', p.user_id).eq('status', 'scheduled')
    .gte('scheduled_at', from.toISOString()).order('scheduled_at', { ascending: true }).limit(1))
  const at = got && got[0] ? str(got[0].scheduled_at) : null
  return at ? { title: str(got![0].title), at } : null
}

/**
 * The week's ranking moves: for each active keyword, its last check inside the window
 * against its last check before it. Null when no check ran inside the window, or when a
 * read failed.
 */
async function loadRank(admin: ServiceRoleClient, p: WeeklyProject, start: Date, end: Date):
  Promise<{ checked: number; improved: number; dropped: number } | null> {
  const targets = await rows(admin.from('tracking_targets').select('id')
    .eq('project_id', p.id).eq('user_id', p.user_id).eq('is_active', true).limit(TARGETS_CAP))
  if (!targets) return null
  const ids = targets.flatMap((r) => (str(r.id) ? [String(r.id)] : []))
  if (ids.length === 0) return null

  const lookback = new Date(start.getTime() - BASELINE_LOOKBACK_DAYS * 86_400_000)
  const cols = 'tracking_target_id, position, found, checked_at'
  const latest = new Map<string, { position: number | null; at: string }>()
  const prior = new Map<string, { position: number | null; at: string }>()
  for (let i = 0; i < ids.length; i += TARGET_CHUNK) {
    const chunk = ids.slice(i, i + TARGET_CHUNK)
    const [during, before] = await Promise.all([
      rows(admin.from('scan_results').select(cols).in('tracking_target_id', chunk)
        .gte('checked_at', start.toISOString()).lt('checked_at', end.toISOString())
        .order('checked_at', { ascending: false }).limit(CHECK_ROWS_CAP)),
      rows(admin.from('scan_results').select(cols).in('tracking_target_id', chunk)
        .gte('checked_at', lookback.toISOString()).lt('checked_at', start.toISOString())
        .order('checked_at', { ascending: false }).limit(CHECK_ROWS_CAP)),
    ])
    if (!during || !before) return null
    const keep = (into: Map<string, { position: number | null; at: string }>, list: Row[]) => {
      for (const r of list) {
        const id = str(r.tracking_target_id), at = str(r.checked_at)
        if (!id || !at || !chunk.includes(id) || into.has(id)) continue
        into.set(id, { position: rankedPosition({ position: typeof r.position === 'number' ? r.position : null, found: typeof r.found === 'boolean' ? r.found : null }), at })
      }
    }
    // Both pages are newest first, so the first row seen for a keyword is the one that counts.
    keep(latest, during)
    keep(prior, before)
  }
  if (latest.size === 0) return null

  let improved = 0, dropped = 0
  for (const [id, end_] of latest) {
    const start_ = prior.get(id)
    if (!start_ || start_.position === null || end_.position === null) continue
    if (end_.position < start_.position) improved++
    else if (end_.position > start_.position) dropped++
  }
  return { checked: latest.size, improved, dropped }
}

/** Search Console clicks over the latest 28-day window, and over the latest one a week older. */
async function loadGsc(admin: ServiceRoleClient, p: WeeklyProject, end: Date): Promise<{ clicks: number; previousClicks: number | null } | null> {
  const property = await rows(admin.from('project_gsc_properties').select('project_id').eq('project_id', p.id).limit(1))
  if (!property) return null
  if (property.length === 0) return null
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const run = async (before: Date) => rows(admin.from('gsc_sync_runs')
    .select('total_clicks, summary_total_clicks, end_date')
    .eq('project_id', p.id).eq('window_days', 28).eq('status', 'succeeded')
    .lte('end_date', day(before)).order('end_date', { ascending: false }).limit(1))
  const [now_, then] = await Promise.all([run(end), run(new Date(end.getTime() - 7 * 86_400_000))])
  if (!now_ || !then) return null
  const clicks = (r: Row | undefined): number | null => {
    const v = typeof r?.total_clicks === 'number' ? r.total_clicks : typeof r?.summary_total_clicks === 'number' ? r.summary_total_clicks : null
    return v
  }
  const current = clicks(now_[0])
  if (current === null) return null
  return { clicks: current, previousClicks: clicks(then[0]) }
}

export async function loadWeekInputs(admin: ServiceRoleClient, p: WeeklyProject, start: Date, end: Date): Promise<WeeklyInputs> {
  const [published, waiting, nextScheduled, rank, gsc] = await Promise.all([
    loadPublished(admin, p, start, end),
    loadWaiting(admin, p),
    loadNextScheduled(admin, p, end),
    loadRank(admin, p, start, end),
    loadGsc(admin, p, end),
  ])
  return { published, waiting, nextScheduled, rank, gsc }
}

// ── the sent-log ────────────────────────────────────────────────────────────

export interface WeeklyPrefs {
  on: boolean
  lastWeek: string | null
  lastSentAt: string | null
  /** The row's version: a claim only wins against the version it read. */
  version: string | null
}
export type WeeklyPrefsRead = { status: 'ok'; prefs: WeeklyPrefs | null } | { status: 'unavailable' } | { status: 'failed' }

export async function readWeeklyPrefs(admin: ServiceRoleClient, projectId: string, ownerId: string): Promise<WeeklyPrefsRead> {
  const { data, error } = await admin.from(PREFS_TABLE)
    .select('weekly_email_summary, weekly_last_week, weekly_last_sent_at, updated_at')
    .eq('project_id', projectId).eq('user_id', ownerId).maybeSingle()
  if (error) return MISSING.has(code(error)) ? { status: 'unavailable' } : { status: 'failed' }
  if (!data) return { status: 'ok', prefs: null }
  const r = data as Row
  return {
    status: 'ok',
    prefs: {
      on: r.weekly_email_summary === true,
      lastWeek: isWeekKey(r.weekly_last_week) ? r.weekly_last_week : null,
      lastSentAt: str(r.weekly_last_sent_at),
      version: str(r.updated_at),
    },
  }
}

/**
 * Take the right to send ONE weekly summary: record the week as covered, but only if nobody
 * wrote the row since it was read and the switch is still on. The claim comes BEFORE the
 * send, so a crash can lose one week's email but never doubles one. There is no insert
 * path: no row means the switch was never turned on, and nothing is sent.
 */
export async function claimWeeklySend(
  admin: ServiceRoleClient, projectId: string, ownerId: string, prior: WeeklyPrefs, next: { week: string; at: string },
): Promise<boolean> {
  if (!prior.version) return false
  const { data, error } = await admin.from(PREFS_TABLE)
    .update({ weekly_last_week: next.week, weekly_last_sent_at: next.at, updated_at: next.at })
    .eq('project_id', projectId).eq('user_id', ownerId).eq('updated_at', prior.version).eq('weekly_email_summary', true)
    .select('project_id')
  return !error && Array.isArray(data) && data.length === 1
}

/**
 * Turn the weekly summary off for one project, from the one-click unsubscribe link. Never
 * creates a row (no row means the switch was never on) and never turns anything on. Returns
 * what happened; the caller does not fail an unsubscribe over it.
 */
export async function writeWeeklyOff(admin: ServiceRoleClient, projectId: string, ownerId: string, nowIso: string): Promise<'ok' | 'unavailable' | 'failed'> {
  const { error } = await admin.from(PREFS_TABLE)
    .update({ weekly_email_summary: false, updated_at: nowIso })
    .eq('project_id', projectId).eq('user_id', ownerId)
  if (!error) return 'ok'
  return MISSING.has(code(error)) ? 'unavailable' : 'failed'
}

/** Undo a claim whose email was not accepted, so next week's run is not blocked by it. */
export async function releaseWeeklyClaim(
  admin: ServiceRoleClient, projectId: string, ownerId: string, prior: WeeklyPrefs, claimedAt: string,
): Promise<void> {
  await admin.from(PREFS_TABLE)
    .update({ weekly_last_week: prior.lastWeek, weekly_last_sent_at: prior.lastSentAt, updated_at: prior.version ?? claimedAt })
    .eq('project_id', projectId).eq('user_id', ownerId).eq('updated_at', claimedAt)
}
