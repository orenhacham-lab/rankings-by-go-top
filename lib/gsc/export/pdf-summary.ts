/**
 * THE SEARCH CONSOLE SUMMARY, AS TWO PAGES A CUSTOMER CAN READ.
 *
 * Asked for by the owner alongside the spreadsheet export: the workbook is the
 * whole truth and can run to tens of thousands of rows, which nobody reads. This
 * is the opposite deliverable — four figures, where the opportunities are, and
 * the few tables worth a glance, on two pages.
 *
 * It is built from the SAME GscExportInput the workbook is built from
 * (lib/gsc/export/sheets.ts), over the same latest-succeeded run, so the two
 * downloads cannot disagree about a number. Pure: data in, HTML out, no browser
 * and no provider, so the QA suite renders it and reads what it says.
 *
 * WHAT IT FILTERS, AND WHY IT SAYS SO ON THE PAGE. A property's long tail is
 * mostly rows Google reported once or twice, where the position is noise. The
 * summary therefore ignores anything under MIN_IMPRESSIONS over the window, and
 * calls something an opportunity only between positions 4 and 20 — close enough
 * to the first page to be worth the work, far enough from it that there is work
 * to do. Both numbers are printed on the page: a reader who does not know what
 * was left out cannot tell a quiet property from a filtered one.
 *
 * CLICKS AND IMPRESSIONS ADD UP; CTR AND POSITION DO NOT. The headline figures
 * are the property totals Google itself returned for the window, never sums of
 * the rows. Where a row has to be rolled up (a query across its pages, a page
 * across its queries) CTR is recomputed from the two sums and the position is
 * weighted by impressions, exactly as the workbook does it.
 */
import { INTL_LOCALE, type PublicLocale } from '@/lib/i18n/locales'
import { ctrPercent, onePlace, type GscExportInput } from './sheets'

/** Under this many impressions over the window, a row is noise rather than data. */
export const MIN_IMPRESSIONS = 10
/** An opportunity is close to the first page, but not on it. */
export const OPPORTUNITY_MIN_POSITION = 4
export const OPPORTUNITY_MAX_POSITION = 20
/** How many rows each table shows, so the whole thing stays two pages. */
export const TOP_QUERIES = 20
export const TOP_PAGES = 10
export const TOP_OPPORTUNITIES = 10
export const TOP_KEYWORDS = 25

export interface GscPdfLabels {
  title: string
  generatedOn: string
  figuresTitle: string
  opportunitiesTitle: string
  opportunitiesSub: string
  opportunitiesNone: string
  topQueriesTitle: string
  topQueriesSub: (n: number) => string
  topPagesTitle: string
  topPagesSub: (n: number) => string
  keywordsTitle: string
  keywordsMore: (n: number) => string
  filterNote: (minImpressions: number, from: number, to: number) => string
  truncatedNote: string
  nothingTitle: string
  nothingBody: (minImpressions: number) => string
}

export interface GscPdfInput extends GscExportInput {
  pdf: GscPdfLabels
  language: PublicLocale
  generatedAt: string
}

interface Rolled {
  key: string
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const esc = escapeHtml

/**
 * Roll the run's query+page rows up by one of the two, summing what sums and
 * weighting the position by impressions. A row with no impressions contributes
 * nothing to the position, which is why the weight is guarded rather than the
 * divisor assumed.
 */
export function rollUp(rows: GscExportInput['rows'], by: 'query' | 'page'): Rolled[] {
  const acc = new Map<string, { clicks: number; impressions: number; weighted: number }>()
  for (const r of rows) {
    const key = by === 'query' ? r.query : r.page
    if (!key) continue
    const cur = acc.get(key) ?? { clicks: 0, impressions: 0, weighted: 0 }
    const impressions = num(r.impressions)
    cur.clicks += num(r.clicks)
    cur.impressions += impressions
    cur.weighted += num(r.position) * impressions
    acc.set(key, cur)
  }
  return [...acc.entries()].map(([key, v]) => ({
    key,
    clicks: v.clicks,
    impressions: v.impressions,
    ctr: v.impressions > 0 ? v.clicks / v.impressions : null,
    position: v.impressions > 0 ? v.weighted / v.impressions : null,
  }))
}

/** Enough searches over the window to mean something. */
export function worthShowing(row: Rolled): boolean {
  return row.impressions >= MIN_IMPRESSIONS
}

/**
 * The queries already close to the first page. Sorted by impressions rather than
 * by position: a query at 6 that 400 people searched is worth more work than one
 * at 4 that two people searched.
 */
export function opportunities(queries: Rolled[]): Rolled[] {
  return queries
    .filter((q) => worthShowing(q)
      && q.position !== null
      && q.position >= OPPORTUNITY_MIN_POSITION
      && q.position <= OPPORTUNITY_MAX_POSITION)
    .sort((a, b) => b.impressions - a.impressions || a.key.localeCompare(b.key))
    .slice(0, TOP_OPPORTUNITIES)
}

export function topQueries(queries: Rolled[]): Rolled[] {
  return queries
    .filter(worthShowing)
    .sort((a, b) => b.impressions - a.impressions || a.key.localeCompare(b.key))
    .slice(0, TOP_QUERIES)
}

export function topPages(pages: Rolled[]): Rolled[] {
  return pages
    .filter(worthShowing)
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.key.localeCompare(b.key))
    .slice(0, TOP_PAGES)
}

/** `search-console-summary-28d-2026-10-04.pdf` — ASCII only, so no browser renames it. */
export function gscSummaryFileName(windowDays: number, endDate: string | null): string {
  const date = (endDate ?? '').replace(/[^0-9-]/g, '') || 'latest'
  const days = Math.max(1, Math.floor(windowDays)) || 28
  return `search-console-summary-${days}d-${date}.pdf`
}

export function generateGscSummaryHTML(input: GscPdfInput): string {
  const L = input.labels
  const P = input.pdf
  const locale = INTL_LOCALE[input.language]
  const rtl = input.language === 'he'

  const whole = (n: number | null | undefined): string =>
    typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat(locale).format(Math.round(n)) : '—'
  const decimal = (n: number | null | undefined): string =>
    typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) : '—'
  const percent = (ctr: number | null | undefined): string => {
    const p = ctrPercent(ctr ?? null)
    return p === null ? '—' : `${decimal(p)}%`
  }
  const position = (p: number | null | undefined): string => {
    const v = onePlace(p ?? null)
    return v === null ? '—' : decimal(v)
  }

  const queries = rollUp(input.rows, 'query')
  const pages = rollUp(input.rows, 'page')
  const chances = opportunities(queries)
  const top = topQueries(queries)
  const bestPages = topPages(pages)
  const keywords = input.keywords.filter((k) => num(k.impressions) > 0 || num(k.clicks) > 0)
  const shownKeywords = keywords.slice(0, TOP_KEYWORDS)

  const figure = (label: string, value: string) =>
    `<div class="fig"><span class="label">${esc(label)}</span><strong>${esc(value)}</strong></div>`

  const section = (title: string, body: string, sub?: string) =>
    `<section><h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}${body}</section>`

  // A query or a page is text that came from outside, so it is escaped and
  // rendered left to right even on a Hebrew page: a URL reversed is unreadable.
  const textCell = (value: string) => `<td dir="ltr" class="text">${esc(value)}</td>`

  const rolledTable = (header: string, rows: Rolled[]) => `<table>
  <thead><tr><th>${esc(header)}</th><th>${esc(L.clicks)}</th><th>${esc(L.impressions)}</th><th>${esc(L.ctr)}</th><th>${esc(L.avgPosition)}</th></tr></thead>
  <tbody>${rows.map((r) => `<tr>${textCell(r.key)}<td>${whole(r.clicks)}</td><td>${whole(r.impressions)}</td><td>${percent(r.ctr)}</td><td>${position(r.position)}</td></tr>`).join('')}</tbody></table>`

  const keywordsTable = `<table>
  <thead><tr><th>${esc(L.keyword)}</th><th>${esc(L.clicks)}</th><th>${esc(L.impressions)}</th><th>${esc(L.avgPosition)}</th></tr></thead>
  <tbody>${shownKeywords.map((k) => `<tr>${textCell(k.keyword)}<td>${whole(k.clicks)}</td><td>${whole(k.impressions)}</td><td>${position(k.position)}</td></tr>`).join('')}</tbody></table>`

  const meta = [
    input.domain ? `${L.domain}: ${input.domain}` : '',
    input.siteUrl ? `${L.property}: ${input.siteUrl}` : '',
    L.windowDays(input.windowDays),
    input.startDate && input.endDate ? `${input.startDate} — ${input.endDate}` : '',
    input.latestAvailableDate ? `${L.latestAvailable}: ${input.latestAvailableDate}` : '',
  ].filter(Boolean).join(' · ')

  // Nothing above the floor is a real state, not an error: a new property, or a
  // quiet one. It says which floor it applied, so the page cannot read as a bug.
  const nothing = top.length === 0 && chances.length === 0 && bestPages.length === 0

  const firstPage = [
    `<div class="figs">
    ${figure(L.clicks, input.totals ? whole(input.totals.clicks) : '—')}
    ${figure(L.impressions, input.totals ? whole(input.totals.impressions) : '—')}
    ${figure(L.ctr, input.totals ? percent(input.totals.ctr) : '—')}
    ${figure(L.avgPosition, input.totals ? position(input.totals.avgPosition) : '—')}
  </div>`,
    nothing
      ? section(P.nothingTitle, `<p class="note">${esc(P.nothingBody(MIN_IMPRESSIONS))}</p>`)
      : section(
        P.opportunitiesTitle,
        chances.length ? rolledTable(L.query, chances) : `<p class="note">${esc(P.opportunitiesNone)}</p>`,
        P.opportunitiesSub,
      ),
    `<p class="note">${esc(P.filterNote(MIN_IMPRESSIONS, OPPORTUNITY_MIN_POSITION, OPPORTUNITY_MAX_POSITION))}</p>`,
    input.truncated ? `<p class="note">${esc(P.truncatedNote)}</p>` : '',
  ].join('')

  const secondPage = nothing ? '' : [
    top.length ? section(P.topQueriesTitle, rolledTable(L.query, top), P.topQueriesSub(top.length)) : '',
    bestPages.length ? section(P.topPagesTitle, rolledTable(L.page, bestPages), P.topPagesSub(bestPages.length)) : '',
    shownKeywords.length
      ? section(P.keywordsTitle, keywordsTable + (keywords.length > shownKeywords.length ? `<p class="sub">${esc(P.keywordsMore(keywords.length - shownKeywords.length))}</p>` : ''))
      : '',
  ].join('')

  return `<!DOCTYPE html>
<html dir="${rtl ? 'rtl' : 'ltr'}" lang="${esc(input.language)}">
<head>
<meta charset="UTF-8">
<title>${esc(`${P.title} · ${input.projectName}`)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${rtl ? "'Segoe UI', Arial" : "'Segoe UI', Helvetica, Arial"}, sans-serif; color: #111827; font-size: 12px; line-height: 1.55; padding: 28px 32px; }
  header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-size: 22px; }
  .meta { color: #6b7280; font-size: 11px; margin-top: 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  section { break-inside: avoid; }
  .sub { color: #6b7280; font-size: 10.5px; }
  .note { color: #374151; max-width: 60em; margin: 6px 0 8px; font-size: 11px; }
  .figs { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0 4px; }
  .fig { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; min-width: 130px; }
  .fig .label { display: block; color: #6b7280; font-size: 10.5px; }
  .fig strong { display: block; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 6px; text-align: ${rtl ? 'right' : 'left'}; }
  th { color: #6b7280; font-size: 10.5px; font-weight: 600; }
  td.text { width: 48%; word-break: break-all; }
  .page-two { break-before: page; }
</style>
</head>
<body>
<header>
  <h1>${esc(`${P.title} · ${input.projectName}`)}</h1>
  <p class="meta">${esc(meta)}</p>
  <p class="meta">${esc(`${P.generatedOn}: ${input.generatedAt}`)}</p>
</header>
${firstPage}
${secondPage ? `<div class="page-two">${secondPage}<p class="note">${esc(L.positionNote)}</p></div>` : `<p class="note">${esc(L.positionNote)}</p>`}
</body>
</html>`
}
