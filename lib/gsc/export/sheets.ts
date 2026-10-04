/**
 * THE SEARCH CONSOLE POSITIONS REPORT, AS ROWS — the whole of what the file says.
 *
 * Everything here is pure: data in, rows of cells out. The workbook or the CSV is
 * built from these rows somewhere else, so what the customer receives can be
 * checked without writing or parsing a single byte of a spreadsheet.
 *
 * WHY IT IS ITS OWN REPORT, AND NOT A COLUMN IN THE EXISTING ONE.
 *
 * The rank report (lib/export/pdf.ts, lib/export/excel.ts) is OUR position: a
 * scan we ran, for a place, a device and an engine we chose, at a moment we can
 * name. Search Console's position is Google's own average over a 28 or 90 day
 * window, over every place and device a real visitor searched from, and only for
 * searches that actually happened. The two answer different questions and the
 * median gap between them was measured at about 2.9 positions, so putting them
 * side by side in one table would read as a disagreement about the same number.
 *
 * So this is a separate file, every sheet says the window it covers, and the
 * position column is named as Google's average rather than "position". The live
 * rank report is not touched by any of this.
 *
 * WHAT GOOGLE'S NUMBERS MEAN, and why they are not re-derived here. Search
 * Console reports one row per query and page. Clicks and impressions add up;
 * CTR and position do NOT, so the summary's figures are the property totals
 * Google itself returned for the window (gsc_sync_runs), never sums of the rows
 * below, and a per-query average is weighted by impressions (tab-metrics.ts).
 */

/** One cell of the report: a string, a number, or blank. */
export type Cell = string | number | null

export interface ExportSheet {
  /** The sheet's name, also the CSV file's single table. */
  name: string
  /** The header row, then the data rows. */
  rows: Cell[][]
}

export interface GscExportLabels {
  summarySheet: string
  queriesSheet: string
  pagesSheet: string
  keywordsSheet: string
  field: string
  value: string
  project: string
  domain: string
  property: string
  window: string
  windowDays: (n: number) => string
  range: string
  latestAvailable: string
  syncedAt: string
  clicks: string
  impressions: string
  ctr: string
  avgPosition: string
  query: string
  page: string
  keyword: string
  rowsIncluded: string
  truncatedYes: string
  truncatedNo: string
  truncatedField: string
  positionNote: string
  noKeywordData: string
}

export interface GscExportInput {
  projectName: string
  domain: string | null
  siteUrl: string | null
  windowDays: number
  startDate: string | null
  endDate: string | null
  latestAvailableDate: string | null
  syncedAt: string | null
  /** The property totals Google returned for the window; null when a run predates them. */
  totals: { clicks: number; impressions: number; ctr: number | null; avgPosition: number | null } | null
  /** Query+page rows of the latest succeeded run, most impressions first. */
  rows: { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }[]
  /** True when the run itself stored only part of what Google had, or the read was capped. */
  truncated: boolean
  /** The project's tracked keywords with Google's own average for each. */
  keywords: { keyword: string; clicks: number; impressions: number; position: number | null }[]
  labels: GscExportLabels
}

/** Google reports CTR as a fraction; the file shows the percentage, at one decimal. */
export function ctrPercent(ctr: number | null | undefined): number | null {
  if (typeof ctr !== 'number' || !Number.isFinite(ctr)) return null
  return Math.round(ctr * 1000) / 10
}

/** One decimal, like Search Console's own display. */
export function onePlace(n: number | null | undefined): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.round(n * 10) / 10
}

const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

/**
 * The summary sheet: what window this is, and Google's own totals for it. The
 * last line is the sentence that keeps the file from being read as our rank
 * report, and it is part of the data rather than a styling flourish, so the CSV
 * carries it too.
 */
export function summarySheet(input: GscExportInput): ExportSheet {
  const L = input.labels
  const rows: Cell[][] = [
    [L.field, L.value],
    [L.project, input.projectName],
    [L.domain, input.domain ?? ''],
    [L.property, input.siteUrl ?? ''],
    [L.window, L.windowDays(input.windowDays)],
    [L.range, input.startDate && input.endDate ? `${input.startDate} — ${input.endDate}` : ''],
    [L.latestAvailable, input.latestAvailableDate ?? ''],
    [L.syncedAt, input.syncedAt ?? ''],
    [L.clicks, input.totals ? num(input.totals.clicks) : ''],
    [L.impressions, input.totals ? num(input.totals.impressions) : ''],
    [L.ctr, input.totals ? ctrPercent(input.totals.ctr) ?? '' : ''],
    [L.avgPosition, input.totals ? onePlace(input.totals.avgPosition) ?? '' : ''],
    [L.rowsIncluded, input.rows.length],
    [L.truncatedField, input.truncated ? L.truncatedYes : L.truncatedNo],
    [L.positionNote, ''],
  ]
  return { name: L.summarySheet, rows }
}

/** Every query+page row of the run: the report itself. */
export function queriesSheet(input: GscExportInput): ExportSheet {
  const L = input.labels
  const rows: Cell[][] = [[L.query, L.page, L.clicks, L.impressions, L.ctr, L.avgPosition]]
  for (const r of input.rows) {
    rows.push([r.query ?? '', r.page ?? '', num(r.clicks), num(r.impressions), ctrPercent(r.ctr), onePlace(r.position)])
  }
  return { name: L.queriesSheet, rows }
}

/**
 * Per page, summed over its queries. Clicks and impressions add up; CTR is
 * recomputed from those two sums and the position is weighted by impressions,
 * because neither can be averaged.
 */
export function pagesSheet(input: GscExportInput): ExportSheet {
  const L = input.labels
  const byPage = new Map<string, { clicks: number; impressions: number; weighted: number }>()
  for (const r of input.rows) {
    if (!r.page) continue
    const cur = byPage.get(r.page) ?? { clicks: 0, impressions: 0, weighted: 0 }
    const impressions = num(r.impressions)
    cur.clicks += num(r.clicks)
    cur.impressions += impressions
    cur.weighted += num(r.position) * impressions
    byPage.set(r.page, cur)
  }
  const rows: Cell[][] = [[L.page, L.clicks, L.impressions, L.ctr, L.avgPosition]]
  const sorted = [...byPage.entries()].sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions || a[0].localeCompare(b[0]))
  for (const [page, v] of sorted) {
    rows.push([
      page,
      v.clicks,
      v.impressions,
      v.impressions > 0 ? ctrPercent(v.clicks / v.impressions) : null,
      v.impressions > 0 ? onePlace(v.weighted / v.impressions) : null,
    ])
  }
  return { name: L.pagesSheet, rows }
}

/**
 * The project's tracked keywords with Google's own average for each. A keyword
 * Google reported nothing for says so rather than printing a zero: no searches
 * recorded is not the same as no clicks.
 */
export function keywordsSheet(input: GscExportInput): ExportSheet {
  const L = input.labels
  const rows: Cell[][] = [[L.keyword, L.clicks, L.impressions, L.avgPosition]]
  for (const k of input.keywords) {
    const none = k.position === null && num(k.impressions) === 0 && num(k.clicks) === 0
    rows.push(none
      ? [k.keyword, L.noKeywordData, L.noKeywordData, L.noKeywordData]
      : [k.keyword, num(k.clicks), num(k.impressions), onePlace(k.position)])
  }
  return { name: L.keywordsSheet, rows }
}

/** The whole report, in sheet order. */
export function gscExportSheets(input: GscExportInput): ExportSheet[] {
  return [summarySheet(input), queriesSheet(input), pagesSheet(input), keywordsSheet(input)]
}

/** `search-console-28d-2026-10-04.csv` — ASCII only, so no browser renames it. */
export function gscExportFileName(windowDays: number, endDate: string | null, extension: 'xlsx' | 'csv'): string {
  const date = (endDate ?? '').replace(/[^0-9-]/g, '') || 'latest'
  const days = Math.max(1, Math.floor(windowDays)) || 28
  return `search-console-${days}d-${date}.${extension}`
}

/**
 * One table as CSV. Quotes every cell that could otherwise change meaning, and
 * doubles a quote inside a cell, which is the whole of RFC 4180's escaping.
 *
 * A cell that starts with =, +, - or @ is prefixed with a single quote: a
 * spreadsheet reads those as a formula, and these cells carry queries and page
 * URLs that came from outside. The customer sees the text; nothing is executed.
 */
export function toCsv(sheet: ExportSheet): string {
  const cell = (c: Cell): string => {
    if (c === null || c === undefined) return ''
    if (typeof c === 'number') return Number.isFinite(c) ? String(c) : ''
    const guarded = /^[=+\-@\t\r]/.test(c) ? `'${c}` : c
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
  }
  return sheet.rows.map((r) => r.map(cell).join(',')).join('\r\n')
}
