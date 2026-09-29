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
import { FIX_TYPE } from '@/lib/site-health/rules'
import type { FindingKind } from '@/lib/site-health/types'
import { bulkCandidates } from '@/lib/site-fix/bulk'
import type { FixType } from '@/lib/site-fix/types'
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

interface CachedScan {
  v?: number
  report?: { findings?: Array<{ id?: unknown; fixType?: unknown; pages?: Array<{ url?: unknown; kind?: unknown; fixable?: unknown }> }> }
  fixed?: unknown
}

/**
 * How many safe fixes the last scan found, by the SAME rule as the site-health screen's
 * "Fix {n} safe items for me" button: lib/site-fix/bulk.ts `bulkCandidates` (Google title,
 * Google description and image alt text only; never the home page; at most 25 pages).
 *
 * AN ESTIMATE, AND THE COPY SAYS SO ("up to"). The scan report lives only in this browser (nothing
 * is stored on the server), and the screen's button also leaves out pages the fix queue already
 * holds and checks the plugin's channel per type; neither is read here. So this is the button's
 * count before the queue is taken into account: the same or higher, never lower.
 */
export function safeFixCountFromScan(raw: string | null): number {
  if (!raw) return 0
  let parsed: CachedScan
  try { parsed = JSON.parse(raw) as CachedScan } catch { return 0 }
  if (!parsed || parsed.v !== 1 || !parsed.report || !Array.isArray(parsed.report.findings)) return 0
  const fixed = new Set(Array.isArray(parsed.fixed) ? parsed.fixed.filter((v): v is string => typeof v === 'string') : [])
  const findings: { id: string; fixType: FixType | null; pages: { url: string; kind: string; fixable: boolean }[] }[] = []
  for (const f of parsed.report.findings) {
    if (typeof f.id !== 'string' || !Array.isArray(f.pages)) continue
    // A report kept from before the fix queue has no fix type: take it from the scan's own rules, as the screen does.
    const fixType = typeof f.fixType === 'string' ? f.fixType as FixType : FIX_TYPE[f.id as FindingKind] ?? null
    const pages = f.pages.flatMap((p) => typeof p.url === 'string' ? [{ url: p.url, kind: typeof p.kind === 'string' ? p.kind : '', fixable: p.fixable === true }] : [])
    findings.push({ id: f.id, fixType, pages })
  }
  const byKey = new Map(findings.flatMap((f) => f.pages.map((p) => [`${f.id}|${p.url}`, p.fixable] as const)))
  return bulkCandidates(findings, {
    fixable: (id, url) => byKey.get(`${id}|${url}`) === true && !fixed.has(`${id}|${url}`),
    jobs: [],
    now: Date.now(),
  }).length
}
