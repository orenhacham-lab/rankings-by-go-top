/**
 * Reads the file Search Console's Links report exports.
 *
 * Accepted: the CSV export (a .zip of several CSV files), a single .csv, and
 * Excel (.xlsx, read with the `xlsx` package the app already has). Each sheet
 * (a zip entry, a CSV file, an Excel sheet) is recognised by its HEADER ROW, in
 * the English and the Hebrew Search Console UI, never by its position:
 *
 *   linking sites   Site | Linking pages | Target pages
 *   target pages    Target page | Incoming links | Linking sites
 *   latest links    Linking page | Last crawled
 *
 * Anything else (anchor text, internal links, a sheet nobody asked about) is
 * ignored. A file with none of the three is "wrong_file"; with them but no rows,
 * "empty".
 *
 * STRICT. Nothing is evaluated: a CSV is split by a small state machine, a zip
 * is read with node:zlib (inflateRaw, output-capped against a zip bomb) from its
 * central directory, an Excel sheet is read as values only (no formulas, no
 * styles, no HTML). Rows per sheet and rows kept are capped (snapshot.ts), every
 * cell goes through cleanCell, and the parser throws nothing the caller shows: it
 * returns a code. Server only (node:zlib, Buffer). Guarded by __qa__/gsc-import.qa.ts.
 */
import { inflateRawSync } from 'node:zlib'
import {
  MAX_ROWS_PER_SHEET, MAX_STORED_ROWS, cleanCell, parseCount,
  type GscImportSnapshot, type LatestLink, type LinkingSite, type TargetPage,
} from './snapshot'

export type ParseResult =
  | { ok: true; data: Pick<GscImportSnapshot, 'linkingSites' | 'targetPages' | 'latestLinks' | 'totals'> }
  | { ok: false; code: 'wrong_file' | 'empty' | 'too_big' }

const MAX_ZIP_ENTRIES = 40
const MAX_ENTRY_BYTES = 25 * 1024 * 1024
const MAX_ZIP_TOTAL_BYTES = 40 * 1024 * 1024
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
/** A file or sheet about the site's OWN pages links to each other: not what this screen shows. */
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

function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  const text = new TextDecoder('utf-8').decode(bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
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

// ── ZIP ────────────────────────────────────────────────────────────────────

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

export const isZip = (b: Uint8Array) => b.length > 22 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)

/**
 * The files of a .zip, read from its central directory. Entries that are
 * encrypted, use zip64, have an unsafe name or inflate past the cap are skipped;
 * more than MAX_ZIP_ENTRIES entries, or a total past MAX_ZIP_TOTAL_BYTES, is
 * "too_big". Returns null when the bytes are not a readable zip.
 */
export function readZip(b: Uint8Array): { files: { name: string; data: Uint8Array }[] } | { error: 'too_big' } | null {
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const count = u16(b, eocd + 10)
  let p = u32(b, eocd + 16)
  if (count === 0xffff || p === 0xffffffff) return null
  if (count > MAX_ZIP_ENTRIES) return { error: 'too_big' }
  const files: { name: string; data: Uint8Array }[] = []
  let total = 0
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) return null
    const flags = u16(b, p + 8), method = u16(b, p + 10)
    const csize = u32(b, p + 20), usize = u32(b, p + 24)
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32)
    const local = u32(b, p + 42)
    const name = new TextDecoder('utf-8').decode(b.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/') || (flags & 1) || csize === 0xffffffff || usize === 0xffffffff) continue
    if (/(^|[\\/])\.\.([\\/]|$)/.test(name) || name.startsWith('__MACOSX/') || /(^|\/)\._/.test(name)) continue
    if (usize > MAX_ENTRY_BYTES) return { error: 'too_big' }
    if (local + 30 > b.length || u32(b, local) !== 0x04034b50) return null
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28)
    if (start + csize > b.length) return null
    const raw = b.subarray(start, start + csize)
    let data: Uint8Array
    if (method === 0) data = raw
    else if (method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }) } catch { return { error: 'too_big' } }
    } else continue
    total += data.length
    if (total > MAX_ZIP_TOTAL_BYTES) return { error: 'too_big' }
    files.push({ name, data })
  }
  return { files }
}

// ── Excel ──────────────────────────────────────────────────────────────────

async function excelSheets(bytes: Uint8Array): Promise<{ name: string; rows: unknown[][] }[] | null> {
  try {
    const mod = await import('xlsx')
    const XLSX = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod
    // Values only: no formulas, no styles, no HTML, no external files; rows capped.
    const wb = XLSX.read(Buffer.from(bytes), { type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false, cellNF: false, bookVBA: false, sheetRows: MAX_ROWS_PER_SHEET + HEADER_SEARCH_ROWS + 1 })
    return wb.SheetNames.slice(0, MAX_ZIP_ENTRIES).map((name) => ({
      name,
      rows: (XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false }) as unknown[][]),
    }))
  } catch {
    return null
  }
}

// ── entry point ────────────────────────────────────────────────────────────

const ext = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase()

/**
 * Reads an uploaded file. `fileName` only picks the format when the bytes do not
 * say (zip and xlsx announce themselves); the content decides everything else.
 */
export async function parseLinksExport(fileName: string, bytes: Uint8Array): Promise<ParseResult> {
  if (bytes.length === 0) return { ok: false, code: 'empty' }
  const lists = emptyLists()
  if (isZip(bytes)) {
    const zip = readZip(bytes)
    if (!zip) return { ok: false, code: 'wrong_file' }
    if ('error' in zip) return { ok: false, code: 'too_big' }
    // An .xlsx is a zip too: its parts are XML, so it has no .csv entries; hand it to the Excel reader.
    const isExcel = zip.files.some((f) => f.name === '[Content_Types].xml' || f.name.startsWith('xl/'))
    if (isExcel) {
      const sheets = await excelSheets(bytes)
      if (!sheets) return { ok: false, code: 'wrong_file' }
      for (const s of sheets) if (!INTERNAL_NAME.test(s.name)) addTable(s.rows, lists)
      return finish(lists)
    }
    for (const f of zip.files) {
      if (ext(f.name) !== 'csv' || INTERNAL_NAME.test(f.name)) continue
      addTable(parseCsv(decodeText(f.data)), lists)
    }
    return finish(lists)
  }
  if (ext(fileName) === 'xlsx' || ext(fileName) === 'xls') return { ok: false, code: 'wrong_file' }
  if (ext(fileName) !== 'csv' && ext(fileName) !== 'txt') return { ok: false, code: 'wrong_file' }
  // A binary file renamed .csv: NUL bytes never occur in a text export.
  if (bytes.subarray(0, 4096).includes(0) && !(bytes[0] === 0xff && bytes[1] === 0xfe)) return { ok: false, code: 'wrong_file' }
  if (!INTERNAL_NAME.test(fileName)) addTable(parseCsv(decodeText(bytes)), lists)
  return finish(lists)
}
