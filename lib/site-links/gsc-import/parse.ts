/**
 * Reads the CSV files Search Console's Links report exports.
 *
 * Accepted: plain-text .csv files ONLY, several in one import (http.ts caps them)
 * (Search Console's "Download CSV" can arrive as a compressed folder of several
 * CSVs; the owner opens it on the computer and selects the CSVs inside). There is
 * no zip reader and no Excel reader here on purpose: a spreadsheet parser fed an
 * untrusted file is an attack surface (the npm `xlsx` package has open parsing
 * CVEs), and a zip reader is a decompression-bomb surface. Each file is
 * recognised by its HEADER ROW, in the English and the Hebrew Search Console UI,
 * never by its name or position:
 *
 *   linking sites   Site | Linking pages | Target pages
 *   target pages    Target page | Incoming links | Linking sites
 *   latest links    Linking page | Last crawled
 *
 * Anything else (anchor text, internal links, a file nobody asked about) is
 * ignored. Files with none of the three are "wrong_file"; with them but no rows,
 * "empty".
 *
 * STRICT. Every file must be named *.csv, must not start with a known binary
 * signature (zip "PK", PDF, Windows/Linux executables, old .xls, images), must
 * contain no NUL byte and must decode as text (UTF-8, or UTF-16LE with its BOM);
 * ONE rejected file rejects the whole import. Nothing is evaluated: a CSV is split
 * by a small state machine, rows per file and rows kept are capped (snapshot.ts),
 * every cell goes through cleanCell, and the parser throws nothing the caller
 * shows: it returns a code. Guarded by __qa__/gsc-import.qa.ts.
 */
import {
  MAX_ROWS_PER_SHEET, MAX_STORED_ROWS, cleanCell, parseCount,
  type GscImportSnapshot, type LatestLink, type LinkingSite, type TargetPage,
} from './snapshot'

export type ParseResult =
  | { ok: true; data: Pick<GscImportSnapshot, 'linkingSites' | 'targetPages' | 'latestLinks' | 'totals'> }
  | { ok: false; code: 'wrong_file' | 'empty' }

const MAX_CELL_CHARS = 4096
const HEADER_SEARCH_ROWS = 8

// ── headers ────────────────────────────────────────────────────────────────

/** A header cell, comparable: lower-case, letters and digits only, one space between words. */
export function normalizeHeader(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
const set = (...names: string[]) => new Set(names.map(normalizeHeader))

const H = {
  site: set('site', 'linking site', 'top linking sites', 'linking sites list', 'אתר', 'אתר מקשר', 'אתרים מקשרים מובילים', 'האתרים המקשרים המובילים'),
  linkingPages: set('linking pages', 'linking pages count', 'דפים מקשרים', 'עמודים מקשרים', 'דפים מפנים', 'מספר דפים מקשרים'),
  targetPagesCount: set('target pages', 'linked pages', 'דפי יעד', 'עמודי יעד', 'דפים מקושרים', 'עמודים מקושרים'),
  targetPage: set('target page', 'top linked pages', 'top linked page', 'linked page', 'top target pages', 'דף יעד', 'עמוד יעד', 'דף מקושר', 'עמוד מקושר', 'הדפים המקושרים המובילים', 'דפי היעד המובילים'),
  incoming: set('incoming links', 'external links', 'externally linked', 'links', 'number of links', 'קישורים נכנסים', 'קישורים חיצוניים', 'קישורים', 'מספר קישורים'),
  linkingSites: set('linking sites', 'sites', 'אתרים מקשרים', 'אתרים'),
  linkingPage: set('linking page', 'linking url', 'source page', 'source url', 'דף מקשר', 'עמוד מקשר', 'כתובת מקשרת', 'דף מקור', 'עמוד מקור'),
  lastCrawled: set('last crawled', 'last crawl', 'last crawl date', 'last crawled date', 'last seen', 'נסרק לאחרונה', 'סריקה אחרונה', 'תאריך סריקה אחרונה', 'נסרק לאחרונה בתאריך', 'התאריך של הסריקה האחרונה'),
}
/** A file about the site's OWN pages links to each other: not what this screen shows. */
const INTERNAL_NAME = /intern|פנימ/i

type Kind = 'sites' | 'targets' | 'latest'
interface Table { kind: Kind; cols: Record<string, number>; start: number; dateOrder: 'dmy' | 'mdy' }

function indexOfHeader(cells: string[], names: Set<string>, not: number[] = []): number {
  return cells.findIndex((c, i) => names.has(c) && !not.includes(i))
}

/** Which of the three lists this row is the header of, and where its columns are. */
function readHeader(cells: unknown[], row: number): Table | null {
  const c = cells.map(normalizeHeader)
  // Hebrew UI headers use Hebrew letters, which also tells the day-first date order.
  const hebrew = cells.some((x) => /[֐-׿]/.test(String(x ?? '')))
  const dateOrder = hebrew ? 'dmy' : 'mdy'
  const latestPage = indexOfHeader(c, H.linkingPage)
  const crawled = indexOfHeader(c, H.lastCrawled)
  if (latestPage >= 0 && crawled >= 0) return { kind: 'latest', cols: { page: latestPage, crawled }, start: row + 1, dateOrder }
  const target = indexOfHeader(c, H.targetPage)
  if (target >= 0) {
    const incoming = indexOfHeader(c, H.incoming, [target])
    const sites = indexOfHeader(c, H.linkingSites, [target])
    if (incoming >= 0 || sites >= 0) return { kind: 'targets', cols: { page: target, incoming, sites }, start: row + 1, dateOrder }
  }
  const site = indexOfHeader(c, H.site)
  if (site >= 0) {
    const pages = indexOfHeader(c, H.linkingPages, [site])
    const targets = indexOfHeader(c, H.targetPagesCount, [site])
    if (pages >= 0 || targets >= 0) return { kind: 'sites', cols: { site, pages, targets }, start: row + 1, dateOrder }
  }
  return null
}

function findTable(rows: unknown[][]): Table | null {
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_ROWS); i++) {
    const t = readHeader(rows[i] ?? [], i)
    if (t) return t
  }
  return null
}

// ── dates ──────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const iso = (y: number, m: number, d: number): string | null => {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null
}

/** A "last crawled" cell as YYYY-MM-DD when it is a date we can read, else its cleaned text. */
export function parseCrawlDate(value: unknown, order: 'dmy' | 'mdy' = 'mdy'): string | null {
  const s = cleanCell(value, 40)
  if (!s) return null
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return iso(+m[1], +m[2], +m[3]) ?? s
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    let a = +m[1], b = +m[2]
    // a > 12 can only be the day; b > 12 can only be the day; otherwise the UI language decides.
    const dayFirst = a > 12 ? true : b > 12 ? false : order === 'dmy'
    if (!dayFirst) [a, b] = [b, a]
    return iso(y, b, a) ?? s
  }
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(s)
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]) ?? s
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.?,? (\d{4})/.exec(s)
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) ?? s
  return s
}

// ── tables → lists ─────────────────────────────────────────────────────────

interface Lists { sites: LinkingSite[]; targets: TargetPage[]; latest: LatestLink[]; seen: Set<Kind> }
const emptyLists = (): Lists => ({ sites: [], targets: [], latest: [], seen: new Set() })

function addTable(rows: unknown[][], lists: Lists): void {
  const t = findTable(rows)
  if (!t || lists.seen.has(t.kind)) return
  lists.seen.add(t.kind)
  const body = rows.slice(t.start, t.start + MAX_ROWS_PER_SHEET)
  const cell = (r: unknown[], i: number) => (i >= 0 ? r[i] : undefined)
  const keys = new Set<string>()
  const fresh = (key: string) => (keys.has(key) ? false : (keys.add(key), true))
  for (const r of body) {
    if (t.kind === 'sites') {
      const site = cleanCell(cell(r, t.cols.site))
      if (!site || !fresh(site.toLowerCase())) continue
      lists.sites.push({ site, linkingPages: parseCount(cell(r, t.cols.pages)), targetPages: parseCount(cell(r, t.cols.targets)) })
    } else if (t.kind === 'targets') {
      const page = cleanCell(cell(r, t.cols.page), 2048)
      if (!page || !fresh(page)) continue
      lists.targets.push({ page, incomingLinks: parseCount(cell(r, t.cols.incoming)), linkingSites: parseCount(cell(r, t.cols.sites)) })
    } else {
      const linkingPage = cleanCell(cell(r, t.cols.page), 2048)
      if (!linkingPage || !fresh(linkingPage)) continue
      lists.latest.push({ linkingPage, lastCrawled: parseCrawlDate(cell(r, t.cols.crawled), t.dateOrder) })
    }
  }
}

const byCountDesc = <T>(get: (x: T) => number | null) => (a: T, b: T) => (get(b) ?? -1) - (get(a) ?? -1)
const isoLike = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '')

function finish(lists: Lists): ParseResult {
  if (lists.seen.size === 0) return { ok: false, code: 'wrong_file' }
  const totals = { linkingSites: lists.sites.length, targetPages: lists.targets.length, latestLinks: lists.latest.length }
  if (totals.linkingSites + totals.targetPages + totals.latestLinks === 0) return { ok: false, code: 'empty' }
  const sites = lists.sites.sort(byCountDesc((x) => x.linkingPages)).slice(0, MAX_STORED_ROWS)
  const targets = lists.targets.sort(byCountDesc((x) => x.incomingLinks)).slice(0, MAX_STORED_ROWS)
  // Newest first when the dates could be read; otherwise the file's own order (it is already newest first).
  const latest = lists.latest.map((x, i) => ({ x, i })).sort((a, b) => (isoLike(b.x.lastCrawled) < isoLike(a.x.lastCrawled) ? -1 : isoLike(b.x.lastCrawled) > isoLike(a.x.lastCrawled) ? 1 : a.i - b.i))
    .map((e) => e.x).slice(0, MAX_STORED_ROWS)
  return { ok: true, data: { linkingSites: sites, targetPages: targets, latestLinks: latest, totals } }
}

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * Signatures of binary files that are never a CSV export: any zip ("PK", which
 * also covers .xlsx/.docx), PDF, a Windows executable (MZ), a Linux executable
 * (ELF), an old Office file (.xls/.doc, OLE D0 CF 11 E0), GIF, PNG, JPEG.
 */
const BINARY_MAGIC: readonly (readonly number[])[] = [
  [0x50, 0x4b],
  [0x25, 0x50, 0x44, 0x46],
  [0x4d, 0x5a],
  [0x7f, 0x45, 0x4c, 0x46],
  [0xd0, 0xcf, 0x11, 0xe0],
  [0x47, 0x49, 0x46, 0x38],
  [0x89, 0x50, 0x4e, 0x47],
  [0xff, 0xd8, 0xff],
]
const startsWithMagic = (b: Uint8Array) => BINARY_MAGIC.some((m) => b.length >= m.length && m.every((x, i) => b[i] === x))

/**
 * The text of one uploaded file, or null when it is not a plain-text file:
 * a binary signature, a NUL byte, or bytes that are not valid UTF-8 (or
 * UTF-16LE after its BOM).
 */
export function csvText(bytes: Uint8Array): string | null {
  if (startsWithMagic(bytes)) return null
  try {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      const t = new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2))
      return t.includes('\u0000') ? null : t
    }
    // NUL never occurs in a text export.
    if (bytes.includes(0)) return null
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  } catch {
    return null
  }
}

function detectDelimiter(text: string): string {
  const head = text.slice(0, 2000).split(/\r?\n/).find((l) => l.trim()) ?? ''
  let best = ',', bestN = 0
  for (const d of [',', ';', '\t']) {
    let n = 0, q = false
    for (const ch of head) { if (ch === '"') q = !q; else if (ch === d && !q) n++ }
    if (n > bestN) { best = d; bestN = n }
  }
  return best
}

/** RFC 4180 CSV into rows, with a row cap and a cell cap. Never throws. */
export function parseCsv(text: string): string[][] {
  const delim = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const push = () => { row.push(cell.slice(0, MAX_CELL_CHARS)); cell = '' }
  const endRow = () => { push(); if (row.length > 1 || row[0] !== '') rows.push(row); row = [] }
  const limit = MAX_ROWS_PER_SHEET + HEADER_SEARCH_ROWS + 1
  for (let i = 0; i < text.length && rows.length < limit; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) push()
    else if (ch === '\n') endRow()
    else if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow() }
    else cell += ch
  }
  if (rows.length < limit && (cell !== '' || row.length > 0)) endRow()
  return rows
}

// ── entry point ────────────────────────────────────────────────────────────

export interface UploadedFile { name: string; bytes: Uint8Array }

/**
 * Reads the uploaded CSV files of one import. Every file is checked before any is
 * read: a name that is not *.csv, a binary file, or one that is not text rejects
 * the WHOLE import as "wrong_file" (nothing is stored). The lists are then filled
 * from the files' header rows; the first file of each kind wins.
 */
export async function parseLinksExportFiles(files: readonly UploadedFile[]): Promise<ParseResult> {
  if (files.length === 0) return { ok: false, code: 'empty' }
  if (files.every((f) => f.bytes.length === 0)) return { ok: false, code: 'empty' }
  const texts: { name: string; text: string }[] = []
  for (const f of files) {
    if (!/\.csv$/i.test(f.name.trim())) return { ok: false, code: 'wrong_file' }
    const text = csvText(f.bytes)
    if (text === null) return { ok: false, code: 'wrong_file' }
    texts.push({ name: f.name, text })
  }
  const lists = emptyLists()
  for (const t of texts) if (!INTERNAL_NAME.test(t.name)) addTable(parseCsv(t.text), lists)
  return finish(lists)
}
