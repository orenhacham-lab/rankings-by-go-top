/**
 * The imported Search Console Links snapshot: its shape, its caps, and how its
 * text is made safe. Pure, no I/O, shared by the server (parse + route) and the
 * screen, so what is stored and what is drawn go through the same rules.
 *
 * WHY AN IMPORT. The Search Console API has no links report (see
 * lib/site-links/search-console-links.ts). The owner can export the Links report
 * from Search Console and upload the file here. What is stored is a SNAPSHOT of
 * that file, not a connection: it never updates by itself, and the screen says
 * so with the import date.
 *
 * SAFETY OF THE TEXT. Every cell comes from a file the user chose, which may
 * have been edited or come from somewhere else. A cell is plain text only:
 *   - control characters are dropped and the length is capped;
 *   - leading = + - @ (and tab / carriage return) are stripped, so a cell can
 *     never be read as a spreadsheet formula if the text is ever copied out;
 *   - a value is a link only when it is an http(s) address with a real host
 *     (importedHref); anything else, a bare domain included, is drawn as text.
 * Nothing here evaluates anything.
 */
import { safeExternalUrl } from '@/lib/site-links/model'

/** Each file, and all the files of one import together, above this are refused (Vercel's own limit on a function body is 4.5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
/** CSV files in one import (Search Console's Links export is a few CSVs). */
export const MAX_IMPORT_FILES = 5
/** Rows read from one sheet. A bigger sheet is cut here, never rejected. */
export const MAX_ROWS_PER_SHEET = 50_000
/** Rows stored per list (the biggest, by count). */
export const MAX_STORED_ROWS = 500
/** Rows a list shows before "show all". */
export const DEFAULT_VISIBLE_ROWS = 25

export interface LinkingSite { site: string; linkingPages: number | null; targetPages: number | null }
export interface TargetPage { page: string; incomingLinks: number | null; linkingSites: number | null }
export interface LatestLink { linkingPage: string; lastCrawled: string | null }

export interface GscImportSnapshot {
  /** ISO timestamp of the import. */
  importedAt: string
  fileName: string | null
  linkingSites: LinkingSite[]
  targetPages: TargetPage[]
  latestLinks: LatestLink[]
  /** How many rows each list had in the file (the lists above keep the top MAX_STORED_ROWS). */
  totals: { linkingSites: number; targetPages: number; latestLinks: number }
}

/** Stable codes the screen turns into words; never a parser's or a database's own text. */
export type ImportErrorCode =
  | 'unauthorized' | 'not_found' | 'no_file' | 'too_big' | 'too_many_files' | 'wrong_file' | 'empty' | 'unavailable' | 'internal'

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g

/**
 * One cell as plain text: no control or bidi-override characters, no leading
 * formula characters, trimmed, capped. Idempotent.
 */
export function cleanCell(value: unknown, max = 300): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  s = s.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
  // A leading = + - @ (ASCII or full-width) is how a cell becomes a formula.
  s = s.replace(/^[=+\-@\uff1d\uff0b\uff0d\uff20\s]+/, '')
  return s.slice(0, max)
}

/** The address to link to, or null: only http(s) with a real host, no credentials. */
export function importedHref(value: unknown): string | null {
  return safeExternalUrl(cleanCell(value, 2048))
}

/** A count from a cell: "1,234", "1.234", "1 234", 56. Null when it is not a whole, sane number. */
export function parseCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 1e9 ? Math.round(value) : null
  if (typeof value !== 'string') return null
  const s = value.replace(/[  \s]/g, '')
  if (!s) return null
  if (/^\d{1,3}([,.]\d{3})+$/.test(s)) return Number(s.replace(/[,.]/g, ''))
  if (/^\d+$/.test(s)) { const n = Number(s); return n <= 1e9 ? n : null }
  return null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9 ? Math.round(v) : null)

/**
 * A stored row as the screen should see it: every field re-checked, so a row
 * written by anything else (or an older version) cannot put markup, a formula
 * or a wrong type on the screen. Returns null when the row is not a snapshot.
 */
export function readSnapshot(row: unknown): GscImportSnapshot | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const at = typeof r.imported_at === 'string' ? r.imported_at : typeof r.importedAt === 'string' ? r.importedAt : ''
  if (!at || Number.isNaN(Date.parse(at))) return null
  const arr = (v: unknown): Record<string, unknown>[] =>
    (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, MAX_STORED_ROWS)
  const linkingSites: LinkingSite[] = arr(r.linking_sites ?? r.linkingSites).map((x) => ({
    site: cleanCell(x.site), linkingPages: num(x.linkingPages), targetPages: num(x.targetPages),
  })).filter((x) => x.site)
  const targetPages: TargetPage[] = arr(r.target_pages ?? r.targetPages).map((x) => ({
    page: cleanCell(x.page, 2048), incomingLinks: num(x.incomingLinks), linkingSites: num(x.linkingSites),
  })).filter((x) => x.page)
  const latestLinks: LatestLink[] = arr(r.latest_links ?? r.latestLinks).map((x) => ({
    linkingPage: cleanCell(x.linkingPage, 2048), lastCrawled: cleanCell(x.lastCrawled, 40) || null,
  })).filter((x) => x.linkingPage)
  const t = (r.totals && typeof r.totals === 'object' ? r.totals : {}) as Record<string, unknown>
  const total = (stored: unknown, shown: number) => Math.max(shown, num(stored) ?? 0)
  return {
    importedAt: new Date(at).toISOString(),
    fileName: cleanCell(r.file_name ?? r.fileName, 200) || null,
    linkingSites, targetPages, latestLinks,
    totals: {
      linkingSites: total(r.linking_sites_total ?? t.linkingSites, linkingSites.length),
      targetPages: total(r.target_pages_total ?? t.targetPages, targetPages.length),
      latestLinks: total(r.latest_links_total ?? t.latestLinks, latestLinks.length),
    },
  }
}

/** The rows a list shows: the first DEFAULT_VISIBLE_ROWS, or all of them. */
export function visibleRows<T>(rows: readonly T[], showAll: boolean): T[] {
  return showAll ? rows.slice() : rows.slice(0, DEFAULT_VISIBLE_ROWS)
}
