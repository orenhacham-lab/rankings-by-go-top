/**
 * The dashboard's "waiting for you" card and the sidebar's count pills, decided from
 * numbers alone (lib/nudges/waiting.ts): pure, so every rule runs under test.
 *
 * ONE RULE FOR BOTH SURFACES: a nudge is hidden at 0, the card holds at most three rows
 * in a fixed priority (the connection first, because nothing goes live without it; then
 * articles waiting for the owner's OK; then topics; then safe fixes), and each row names
 * ONE internal screen. Nothing here reads, writes or sends anything.
 */
import { CONTENT_ROOT_PATH } from '@/lib/content/content-workspace-nav'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { strategyHref } from '@/lib/content/strategy/view'
import { LOW_QUEUE, type WaitingAnswer } from './waiting'

export const MAX_WAITING_ROWS = 3
/** The status filter the articles screen opens with when it arrives from a nudge. */
export const ARTICLES_WAITING_STATUS = 'ready'

export type WaitingRowKind = 'connection' | 'articles' | 'topics' | 'fixes'
export interface WaitingRow {
  kind: WaitingRowKind
  /** The count the sentence is about (0 for the connection). */
  n: number
  /** An internal path; never a host. */
  href: string
  /** Topics only: the queue holds fewer than LOW_QUEUE approved topics and this is when it empties. */
  dryOn: string | null
}

/** The articles screen, opened on the articles that wait for the owner's OK. */
export function waitingArticlesHref(): string {
  return `${CONTENT_ROOT_PATH}?status=${ARTICLES_WAITING_STATUS}`
}
export const FIXES_HREF = '/site-health#fixes'

const pos = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

export function waitingRows(projectId: string, w: WaitingAnswer | null, safeFixes: number): WaitingRow[] {
  if (!w) return []
  const rows: WaitingRow[] = []
  if (w.connectionDown) {
    rows.push({ kind: 'connection', n: 0, href: w.connectionDown === 'plugin' ? '/site-health' : platformSetupHref(projectId), dryOn: null })
  }
  if (pos(w.articles) > 0) rows.push({ kind: 'articles', n: pos(w.articles), href: waitingArticlesHref(), dryOn: null })
  if (pos(w.topics) > 0) {
    const low = pos(w.queued) < LOW_QUEUE && !!w.queueEndsAt
    rows.push({ kind: 'topics', n: pos(w.topics), href: strategyHref('list', 'ideas'), dryOn: low ? w.queueEndsAt : null })
  }
  // Safe fixes are written through the plugin only: without it there is nothing to "see".
  if (w.pluginConnected && pos(safeFixes) > 0) rows.push({ kind: 'fixes', n: pos(safeFixes), href: FIXES_HREF, dryOn: null })
  return rows.slice(0, MAX_WAITING_ROWS)
}

export interface RailCounts { articles: number; strategy: number; siteHealth: number }

/** The count pills: hidden at 0. The health entry counts the fixes, or 1 while the connection is down. */
export function railCounts(w: WaitingAnswer | null, safeFixes: number): RailCounts {
  if (!w) return { articles: 0, strategy: 0, siteHealth: 0 }
  const fixes = w.pluginConnected ? pos(safeFixes) : 0
  return {
    articles: pos(w.articles),
    strategy: pos(w.topics),
    siteHealth: fixes + (w.connectionDown === 'plugin' ? 1 : 0),
  }
}

/** A pill never shows more than 99. */
export const pillText = (n: number): string => (n > 99 ? '99+' : String(n))

// ── Safe fixes, from the last site scan kept in this browser ───────────────────

/** Fix types that only change what search engines read, never what visitors see. */
const SAFE_FINDINGS: ReadonlySet<string> = new Set([
  'title_missing', 'title_long', 'title_short', 'title_duplicate',
  'description_missing', 'description_length', 'description_duplicate',
  'images_alt',
])
/** A batch never holds more than this many pages. */
export const SAFE_BATCH_MAX = 25

interface CachedScan {
  v?: number
  report?: { findings?: Array<{ id?: unknown; pages?: Array<{ url?: unknown; kind?: unknown; fixable?: unknown }> }> }
  fixed?: unknown
}

/**
 * How many pages the last scan found a safe, one-click fix for: a title, a description or an
 * image description; not the home page; not already fixed. A LOWER BOUND, read from the report
 * this browser kept (nothing is stored on the server); the site-health screen has the exact list.
 */
export function safeFixCountFromScan(raw: string | null): number {
  if (!raw) return 0
  let parsed: CachedScan
  try { parsed = JSON.parse(raw) as CachedScan } catch { return 0 }
  if (!parsed || parsed.v !== 1 || !parsed.report || !Array.isArray(parsed.report.findings)) return 0
  const fixed = new Set(Array.isArray(parsed.fixed) ? parsed.fixed.filter((v): v is string => typeof v === 'string') : [])
  const pages = new Set<string>()
  for (const f of parsed.report.findings) {
    if (typeof f.id !== 'string' || !SAFE_FINDINGS.has(f.id) || !Array.isArray(f.pages)) continue
    for (const p of f.pages) {
      if (typeof p.url !== 'string' || p.fixable !== true || p.kind === 'home') continue
      if (fixed.has(`${f.id}|${p.url}`)) continue
      pages.add(`${f.id}|${p.url}`)
    }
  }
  return Math.min(pages.size, SAFE_BATCH_MAX)
}
