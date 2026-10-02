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
import { platformSetupHref, settingsGscHref } from '@/lib/content/content-hub-setup'
import { strategyHref } from '@/lib/content/strategy/view'
import { FIX_TYPE } from '@/lib/site-health/rules'
import type { FindingKind } from '@/lib/site-health/types'
import { bulkCandidates, rowOpenForBulk, safeFixesEnabled } from '@/lib/site-fix/bulk'
import type { FixCapabilities, FixJobView, FixType } from '@/lib/site-fix/types'
import { LOW_QUEUE, type WaitingAnswer } from './waiting'

export const MAX_WAITING_ROWS = 3
/** The status filter the articles screen opens with when it arrives from a nudge. */
export const ARTICLES_WAITING_STATUS = 'ready'

/**
 * `site` (no site connection yet) and `gsc` (no Search Console connection) are the two
 * setup rows of wave 10: always present while the thing is missing, each with a call to the
 * right settings section, and never counted in the card's cap of three.
 */
export type WaitingRowKind = 'connection' | 'site' | 'gsc' | 'articles' | 'topics' | 'fixes'
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

/** `null` (the fix queue could not be read) counts as nothing: the row and the badge stay hidden, never a guess. */
const pos = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

const SETUP_ROWS: ReadonlySet<WaitingRowKind> = new Set<WaitingRowKind>(['site', 'gsc'])

export function waitingRows(projectId: string, w: WaitingAnswer | null, safeFixes: number | null): WaitingRow[] {
  const rows = allWaitingRows(projectId, w, safeFixes)
  // The setup rows (a missing connection) always show; the cap is for the rest, as before.
  const setup = rows.filter((r) => SETUP_ROWS.has(r.kind))
  return [...setup, ...rows.filter((r) => !SETUP_ROWS.has(r.kind)).slice(0, MAX_WAITING_ROWS)]
}

/**
 * Every row, in the same order and by the same rule, without the card's cap: the top
 * bar's notifications list (components/layout/NotificationsBell.tsx) shows them all.
 */
export function allWaitingRows(projectId: string, w: WaitingAnswer | null, safeFixes: number | null): WaitingRow[] {
  if (!w) return []
  const rows: WaitingRow[] = []
  if (w.connectionDown) {
    rows.push({ kind: 'connection', n: 0, href: w.connectionDown === 'plugin' ? '/site-health' : platformSetupHref(projectId), dryOn: null })
  }
  // Nothing goes live without a site, so its absence comes first; Search Console follows it,
  // and stays until it is connected too. `false` only: an unread answer (null) makes no row.
  if (w.siteConnected === false) rows.push({ kind: 'site', n: 0, href: platformSetupHref(projectId), dryOn: null })
  if (w.gscConnected === false) rows.push({ kind: 'gsc', n: 0, href: settingsGscHref(projectId), dryOn: null })
  if (pos(w.articles) > 0) rows.push({ kind: 'articles', n: pos(w.articles), href: waitingArticlesHref(), dryOn: null })
  if (pos(w.topics) > 0) {
    const low = pos(w.queued) < LOW_QUEUE && !!w.queueEndsAt
    rows.push({ kind: 'topics', n: pos(w.topics), href: strategyHref('list', 'ideas'), dryOn: low ? w.queueEndsAt : null })
  }
  // Safe fixes are written through the plugin only: without it there is nothing to "see".
  if (w.pluginConnected && pos(safeFixes) > 0) rows.push({ kind: 'fixes', n: pos(safeFixes), href: FIXES_HREF, dryOn: null })
  return rows
}

/** The bell's badge: one per thing to do (a lost connection is one, however many articles wait behind it). */
export function bellCount(rows: readonly WaitingRow[]): number {
  return rows.reduce((sum, r) => sum + (r.kind === 'connection' || r.kind === 'site' || r.kind === 'gsc' ? 1 : Math.max(0, r.n)), 0)
}

export interface RailCounts { articles: number; strategy: number; siteHealth: number }

/** The count pills: hidden at 0. The health entry counts the fixes, or 1 while the connection is down. */
export function railCounts(w: WaitingAnswer | null, safeFixes: number | null): RailCounts {
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

// ── Safe fixes: the last scan kept in this browser + the fix queue ─────────────

interface CachedScan {
  v?: number
  report?: { findings?: Array<{ id?: unknown; fixType?: unknown; pages?: Array<{ url?: unknown; kind?: unknown }> }> }
}

/** What GET /api/site-health/fixes answers (the same read the health screen makes). */
export interface FixesRead { capabilities: FixCapabilities; jobs: FixJobView[] }

/**
 * How many safe fixes are ready, by the SAME rule as the site-health screen's "Fix {n} safe items for
 * me" button, and from the same two sources it uses: the last scan kept in this browser and the fix
 * queue (GET /api/site-health/fixes).
 *
 *   - the button exists only when `safeFixesEnabled(capabilities)` (lib/site-fix/bulk.ts), else 0;
 *   - the rows are `bulkCandidates` (Google title, Google description and image alt text only; never the
 *     home page; at most 25 pages) minus every place the queue already holds or fixed in the last 30 days
 *     (`rowOpenForBulk` + `pageBusy`), so after a batch is applied the count is 0 and the nudge and the
 *     badge go away at once.
 *
 * NEVER A GUESS: `null` when the queue could not be read (no answer, a failed read, or a scan we cannot
 * parse); the caller then shows neither the row nor the badge. 0 when there is no scan or nothing to fix.
 */
export function safeFixCountFromScan(raw: string | null, fixes: FixesRead | null, now: number = Date.now()): number | null {
  if (!fixes || !fixes.capabilities || !Array.isArray(fixes.jobs)) return null
  if (!safeFixesEnabled(fixes.capabilities)) return 0
  if (!raw) return 0
  let parsed: CachedScan
  try { parsed = JSON.parse(raw) as CachedScan } catch { return 0 }
  if (!parsed || parsed.v !== 1 || !parsed.report || !Array.isArray(parsed.report.findings)) return 0
  const findings: { id: string; fixType: FixType | null; pages: { url: string; kind: string }[] }[] = []
  for (const f of parsed.report.findings) {
    if (typeof f.id !== 'string' || !Array.isArray(f.pages)) continue
    // A report kept from before the fix queue has no fix type: take it from the scan's own rules, as the screen does.
    const fixType = typeof f.fixType === 'string' ? f.fixType as FixType : FIX_TYPE[f.id as FindingKind] ?? null
    const pages = f.pages.flatMap((p) => typeof p.url === 'string' ? [{ url: p.url, kind: typeof p.kind === 'string' ? p.kind : '' }] : [])
    findings.push({ id: f.id, fixType, pages })
  }
  const typeOf = new Map(findings.map((f) => [f.id, f.fixType] as const))
  return bulkCandidates(findings, {
    fixable: (id, url) => { const t = typeOf.get(id); return !!t && rowOpenForBulk(fixes.jobs, t, url) },
    jobs: fixes.jobs,
    now,
  }).length
}
