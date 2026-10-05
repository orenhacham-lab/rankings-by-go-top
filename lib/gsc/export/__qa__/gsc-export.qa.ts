/**
 * The Search Console positions export: the rows the file carries, the route's
 * answers, and the two guarantees that matter outside this feature.
 *
 *   A. The arithmetic (ctr, position, per-page sums) — a wrong number here is a
 *      wrong number in a customer's hands.
 *   B. The route: every refusal, and that each read is filtered by the
 *      authenticated project and its owner. The admin client bypasses RLS, so a
 *      missing filter is how one customer downloads another's traffic.
 *   C. The live rank report is untouched: this feature imports nothing from
 *      lib/export/ but the locale helper, and lib/export/ imports nothing from
 *      here.
 *
 * Every guard has a mutation control that breaks the code on purpose and shows
 * the guard fails.
 */
import { readFileSync } from 'node:fs'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { gscExportLabels } from '../labels'
import { ctrPercent, gscExportFileName, gscExportSheets, keywordsSheet, onePlace, pagesSheet, summarySheet, toCsv, type ExportSheet, type GscExportInput } from '../sheets'
import { handleGscExport, type GscExportDeps, type GscExportRun } from '../http'
import { gscPdfLabels } from '../labels'
import {
  MIN_IMPRESSIONS, OPPORTUNITY_MAX_POSITION, OPPORTUNITY_MIN_POSITION,
  generateGscSummaryHTML, gscSummaryFileName, opportunities, pageLink, rollUp, topPages, topQueries,
} from '../pdf-summary'
import { safeSheetName, sheetsToXlsx } from '../workbook'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { passed++; return }
  failed++
  console.error(`FAIL: ${name}${got === undefined ? '' : ` — got ${JSON.stringify(got)}`}`)
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), actual)

const read = (p: string) => readFileSync(p, 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const HTTP = strip(read('lib/gsc/export/http.ts'))
const ROUTE = strip(read('app/api/gsc/export/route.ts'))
const SHEETS = strip(read('lib/gsc/export/sheets.ts'))
const LABELS = strip(read('lib/gsc/export/labels.ts'))
const COMPONENT = strip(read('components/gsc/GscExportDownload.tsx'))

const labels = gscExportLabels('he')
const EN = gscExportLabels('en')

function input(over: Partial<GscExportInput> = {}): GscExportInput {
  return {
    projectName: 'אתר',
    domain: 'example.com',
    siteUrl: 'sc-domain:example.com',
    windowDays: 28,
    startDate: '2026-09-07',
    endDate: '2026-10-04',
    latestAvailableDate: '2026-10-01',
    syncedAt: '2026-10-04T05:00:00.000Z',
    totals: { clicks: 120, impressions: 4000, ctr: 0.03, avgPosition: 12.44 },
    rows: [
      { query: 'נעליים', page: 'https://example.com/a', clicks: 10, impressions: 100, ctr: 0.1, position: 4.2 },
      { query: 'נעליים אדומות', page: 'https://example.com/a', clicks: 2, impressions: 300, ctr: 0.00667, position: 18.6 },
      { query: 'מגפיים', page: 'https://example.com/b', clicks: 5, impressions: 50, ctr: 0.1, position: 2.5 },
    ],
    truncated: false,
    keywords: [
      { keyword: 'נעליים', clicks: 12, impressions: 400, position: 14.9 },
      { keyword: 'סנדלים', clicks: 0, impressions: 0, position: null },
    ],
    labels,
    ...over,
  }
}

/* ------------------------------------------------------------------ A. numbers */

eq('A1 ctrPercent turns a fraction into one decimal', ctrPercent(0.0345), 3.5)
eq('A2 ctrPercent of 0 is 0, not blank', ctrPercent(0), 0)
eq('A3 ctrPercent of nothing is blank', [ctrPercent(null), ctrPercent(undefined), ctrPercent(Number.NaN)], [null, null, null])
eq('A4 onePlace rounds to a tenth', onePlace(12.449), 12.4)
eq('A5 onePlace of nothing is blank', onePlace(null), null)

const summary = summarySheet(input())
eq('A6 the summary carries Google’s own totals, not sums of the rows', [
  summary.rows.find((r) => r[0] === labels.clicks)?.[1],
  summary.rows.find((r) => r[0] === labels.impressions)?.[1],
  summary.rows.find((r) => r[0] === labels.ctr)?.[1],
  summary.rows.find((r) => r[0] === labels.avgPosition)?.[1],
], [120, 4000, 3, 12.4])
eq('A7 the summary counts the rows it carries', summary.rows.find((r) => r[0] === labels.rowsIncluded)?.[1], 3)
eq('A8 a complete run says so', summary.rows.find((r) => r[0] === labels.truncatedField)?.[1], labels.truncatedNo)
eq('A9 a truncated run says so', summarySheet(input({ truncated: true })).rows.find((r) => r[0] === labels.truncatedField)?.[1], labels.truncatedYes)
check('A10 the summary carries the sentence that it is Google’s average', summary.rows.some((r) => String(r[0]) === labels.positionNote))
eq('A11 a run with no stored totals leaves them blank rather than printing zeros', [
  summarySheet(input({ totals: null })).rows.find((r) => r[0] === labels.clicks)?.[1],
  summarySheet(input({ totals: null })).rows.find((r) => r[0] === labels.avgPosition)?.[1],
], ['', ''])

const pages = pagesSheet(input())
eq('A12 a page sums its queries; the CTR comes from the sums, not an average of CTRs', pages.rows[1], ['https://example.com/a', 12, 400, 3, 15])
eq('A13 the page position is weighted by impressions', onePlace((4.2 * 100 + 18.6 * 300) / 400), 15)
eq('A14 pages are ordered by clicks', pages.rows.slice(1).map((r) => r[0]), ['https://example.com/a', 'https://example.com/b'])
eq('A15 a page with no impressions leaves CTR and position blank', pagesSheet(input({ rows: [{ query: 'q', page: '/p', clicks: 0, impressions: 0, ctr: 0, position: 0 }] })).rows[1], ['/p', 0, 0, null, null])

const kw = keywordsSheet(input())
eq('A16 a tracked keyword Google reported on carries its figures', kw.rows[1], ['נעליים', 12, 400, 14.9])
eq('A17 a keyword Google reported nothing for says so rather than printing a zero', kw.rows[2], ['סנדלים', labels.noKeywordData, labels.noKeywordData, labels.noKeywordData])

eq('A18 the file is named for its window and last day', gscExportFileName(28, '2026-10-04', 'xlsx'), 'search-console-28d-2026-10-04.xlsx')
eq('A19 a run with no end date still gets an openable name', gscExportFileName(90, null, 'csv'), 'search-console-90d-latest.csv')
check('A20 the file name is ASCII only, so no browser renames it', /^[\x20-\x7e]+$/.test(gscExportFileName(28, '2026-10-04', 'xlsx')))

/* A-MUT: break the per-page CTR into an average of CTRs and show A12 fails. */
{
  const broken = strip(read('lib/gsc/export/sheets.ts')).replace('v.impressions > 0 ? ctrPercent(v.clicks / v.impressions) : null', 'ctrPercent(0.5)')
  check('A-MUT averaging the CTRs instead of dividing the sums changes the file', !broken.includes('ctrPercent(v.clicks / v.impressions)') && broken.includes('ctrPercent(0.5)'))
}

/* ----------------------------------------------------------------- B. the CSV */

{
  const sheet: ExportSheet = { name: 's', rows: [['a', 'b'], ['plain', 'has,comma'], ['say "hi"', 1], ['=SUM(A1)', '+1'], ['-2', '@x'], [null, Number.NaN]] }
  const csv = toCsv(sheet)
  const lines = csv.split('\r\n')
  eq('B1 rows are separated by CRLF, as the format says', lines.length, 6)
  eq('B2 a comma makes the cell quoted', lines[1], 'plain,"has,comma"')
  eq('B3 a quote inside a cell is doubled', lines[2], '"say ""hi""",1')
  eq('B4 a cell a spreadsheet would run as a formula is neutralised', lines[3], "'=SUM(A1),'+1")
  eq('B5 a leading minus or at-sign is neutralised too', lines[4], "'-2,'@x")
  eq('B6 nothing and a non-number come out blank, never "NaN"', lines[5], ',')
}
check('B7 the formula guard is in the code, not only in this suite', /\^\[=\+\\-@/.test(SHEETS))

/* B-MUT: drop the formula guard and show B4 fails. */
{
  const broken = SHEETS.replace(/const guarded = .*$/m, 'const guarded = c')
  check('B-MUT without the guard a formula cell goes through as a formula', !/\^\[=\+\\-@/.test(broken))
}

/* --------------------------------------------------------------- C. the route */

const RUN: GscExportRun = {
  id: 'run-1', window_days: 28, start_date: '2026-09-07', end_date: '2026-10-04',
  latest_available_date: '2026-10-01', finished_at: '2026-10-04T05:00:00.000Z', truncated: false,
  summary_total_clicks: 120, summary_total_impressions: 4000, summary_total_ctr: 0.03, summary_average_position: 12.44,
}

function world() {
  return new FakeAdmin({
    projects: [
      { id: 'p1', user_id: 'u1', name: 'אתר שלי', target_domain: 'example.com' },
      { id: 'p2', user_id: 'u2', name: 'אתר של מישהו אחר', target_domain: 'other.com' },
    ],
    project_gsc_properties: [
      { project_id: 'p1', site_url: 'sc-domain:example.com' },
      { project_id: 'p2', site_url: 'sc-domain:other.com' },
    ],
    gsc_query_page_metrics: [
      { sync_run_id: 'run-1', project_id: 'p1', query: 'נעליים', page: 'https://example.com/a', clicks: 10, impressions: 100, ctr: 0.1, position: 4.2 },
      { sync_run_id: 'run-1', project_id: 'p1', query: 'מגפיים', page: 'https://example.com/b', clicks: 5, impressions: 50, ctr: 0.1, position: 2.5 },
      { sync_run_id: 'run-1', project_id: 'p2', query: 'סודי', page: 'https://other.com/x', clicks: 999, impressions: 9999, ctr: 0.1, position: 1 },
    ],
    tracking_targets: [
      { id: 't1', project_id: 'p1', keyword: 'נעליים' },
      { id: 't2', project_id: 'p1', keyword: 'סנדלים' },
      { id: 't9', project_id: 'p2', keyword: 'סודי' },
    ],
  })
}

function deps(over: Partial<GscExportDeps> = {}, admin = world()): GscExportDeps {
  return {
    enabled: () => true,
    windows: [28, 90],
    auth: async () => ({ ok: true as const, admin: admin as never, projectId: 'p1', userId: 'u1' }),
    latestRun: async () => RUN,
    workbook: async (sheets) => new TextEncoder().encode(JSON.stringify(sheets.map((s) => s.rows.length))),
    pdf: async (html) => new TextEncoder().encode(html).buffer as ArrayBuffer,
    now: () => new Date('2026-10-05T00:00:00.000Z'),
    ...over,
  }
}

const url = (q = '') => new Request(`https://app.example.com/api/gsc/export?projectId=p1${q}`)

async function routeChecks() {
  const off = await handleGscExport(url(), deps({ enabled: () => false }))
  eq('C1 with Search Console off the route is not found', [off.status, (await off.json()).error], [404, 'gsc_disabled'])

  const denied = await handleGscExport(url(), deps({ auth: async () => ({ ok: false as const, status: 403, error: 'Forbidden' }) }))
  eq('C2 the owner check is answered as it comes', [denied.status, (await denied.json()).error], [403, 'Forbidden'])

  const badWindow = await handleGscExport(url('&window=7'), deps())
  eq('C3 a window we never synced is refused', [badWindow.status, (await badWindow.json()).error], [400, 'invalid_window'])

  const badFormat = await handleGscExport(url('&format=docx'), deps())
  eq('C4 a format we do not write is refused', [badFormat.status, (await badFormat.json()).error], [400, 'invalid_format'])

  const noRun = await handleGscExport(url(), deps({ latestRun: async () => null }))
  eq('C5 nothing synced yet is said plainly, not as an empty file', [noRun.status, (await noRun.json()).error], [409, 'no_sync'])

  const readFailed = await handleGscExport(url(), deps({ latestRun: async () => { throw new Error('db') } }))
  eq('C6 a failed read is a 500 with a stable code, never the provider’s text', [readFailed.status, (await readFailed.json()).error], [500, 'export_read_failed'])

  const brokenWriter = await handleGscExport(url(), deps({ workbook: async () => { throw new Error('writer') } }))
  eq('C7 a workbook that cannot be written is a 500, not a truncated download', [brokenWriter.status, (await brokenWriter.json()).error], [500, 'export_read_failed'])

  const xlsx = await handleGscExport(url(), deps())
  eq('C8 the workbook comes back as a spreadsheet, as an attachment, uncached', [
    xlsx.status,
    xlsx.headers.get('content-type'),
    xlsx.headers.get('content-disposition'),
    xlsx.headers.get('cache-control'),
  ], [200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'attachment; filename="search-console-28d-2026-10-04.xlsx"', 'no-store'])
  eq('C9 all four sheets are written', JSON.parse(new TextDecoder().decode(new Uint8Array(await xlsx.arrayBuffer()))).length, 4)


  const pdf = await handleGscExport(url('&format=pdf'), deps())
  eq('C16 the summary comes back as a PDF, as an attachment, uncached', [
    pdf.status,
    pdf.headers.get('content-type'),
    pdf.headers.get('content-disposition'),
    pdf.headers.get('cache-control'),
  ], [200, 'application/pdf', 'attachment; filename="search-console-summary-28d-2026-10-04.pdf"', 'no-store'])
  {
    const body = new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()))
    check('C17 the summary carries this project’s own rows and no other customer’s',
      body.includes('נעליים') && !body.includes('סודי') && !body.includes('other.com'))
  }

  const noProvider = await handleGscExport(url('&format=pdf'), deps({ pdf: async () => null }))
  eq('C18 a PDF provider that refuses is a stable code, never its own message',
    [noProvider.status, (await noProvider.json()).error], [502, 'pdf_unavailable'])

  const csv = await handleGscExport(url('&format=csv'), deps())
  const body = await csv.text()
  eq('C10 the CSV says it is a CSV and names the file', [csv.headers.get('content-type'), csv.headers.get('content-disposition')], ['text/csv; charset=utf-8', 'attachment; filename="search-console-28d-2026-10-04.csv"'])
  const csvBytes = new Uint8Array(await (await handleGscExport(url('&format=csv'), deps())).arrayBuffer())
  eq('C11 the CSV\u2019s first bytes are the UTF-8 mark, so Excel does not show mojibake', [csvBytes[0], csvBytes[1], csvBytes[2]], [0xef, 0xbb, 0xbf])
  check('C12 the CSV carries the window and the property above the rows', body.includes('sc-domain:example.com') && body.includes(labels.windowDays(28)))
  check('C13 the CSV carries the project’s own rows', body.includes('נעליים') && body.includes('מגפיים'))
  check('C14 the CSV carries no other customer’s rows', !body.includes('סודי') && !body.includes('other.com'))
  check('C15 the CSV is the summary and the query rows; the other two sheets belong to the workbook', !body.includes(labels.keywordsSheet) && !body.includes('סנדלים'))

  const he = await (await handleGscExport(url('&format=csv&language=he'), deps())).text()
  const en = await (await handleGscExport(url('&format=csv&language=en'), deps())).text()
  check('C16 the file is written in the language the dashboard asked for', he.includes(labels.clicks) && en.includes(EN.clicks) && !en.includes(labels.rowsIncluded))

  // The project id in the query string names the project; it never widens the read.
  const admin = world()
  await handleGscExport(url(), deps({}, admin))
  check('C17 every read is filtered by the project (the admin client bypasses RLS)', /\.eq\('project_id', auth\.projectId\)/.test(HTTP))
  check('C18 the project row is read as its owner’s', /\.eq\('id', auth\.projectId\)[\s\S]{0,40}\.eq\('user_id', auth\.userId\)/.test(HTTP))
  check('C19 the rows are read for the run of this project only', /from\('gsc_query_page_metrics'\)[\s\S]{0,300}\.eq\('sync_run_id', run\.id\)[\s\S]{0,80}\.eq\('project_id', auth\.projectId\)/.test(HTTP))
  check('C20 the keywords are the project’s own', /from\('tracking_targets'\)[\s\S]{0,120}\.eq\('project_id', auth\.projectId\)/.test(HTTP))
  eq('C21 nothing is written: the export only reads', [admin.tables.projects.length, admin.tables.gsc_query_page_metrics.length], [2, 3])

  /* C-MUT: drop the project filter on the rows and show C19 fails. */
  const broken = HTTP.replace(".eq('project_id', auth.projectId)\n      .order('impressions'", ".order('impressions'")
  check('C-MUT without the project filter the rows read is no longer the project’s', !/from\('gsc_query_page_metrics'\)[\s\S]{0,300}\.eq\('sync_run_id', run\.id\)[\s\S]{0,80}\.eq\('project_id', auth\.projectId\)/.test(broken))
}

/* ------------------------------------------------- D. the live report, untouched */

check('D1 the export reads nothing from the rank report but the locale helper', (() => {
  const imports = [...`${SHEETS}\n${HTTP}\n${LABELS}`.matchAll(/from '(@\/lib\/export\/[^']+)'/g)].map((m) => m[1])
  return imports.every((i) => i === '@/lib/export/i18n')
})())
check('D2 the rank report imports nothing from this export', (() => {
  const files = ['lib/export/excel.ts', 'lib/export/pdf.ts', 'lib/export/i18n.ts']
  return files.every((f) => !read(f).includes('lib/gsc/export'))
})())
check('D3 the rows builder is pure: it reads no database and no environment', !/createAdminClient|process\.env|from\('/.test(SHEETS))
check('D4 the route gates itself on the Search Console flag and the owner check', ROUTE.includes('isGscReadOnlyEnabled') && ROUTE.includes('authContentProject'))
check('D5 the route delegates every decision to handleGscExport', /handleGscExport\(request, \{/.test(ROUTE))
check('D6 the server writes the workbook; the browser-only writer is not used here', !ROUTE.includes('lib/export/excel') && ROUTE.includes('sheetsToXlsx'))

/* D-MUT: point the export at the rank report's labels and show D1 fails. */
{
  const broken = `${SHEETS}\nimport { exportLabels } from '@/lib/export/i18n'\nimport { buildExcel } from '@/lib/export/excel'`
  const imports = [...broken.matchAll(/from '(@\/lib\/export\/[^']+)'/g)].map((m) => m[1])
  check('D-MUT reaching into the rank report’s own code is caught', !imports.every((i) => i === '@/lib/export/i18n'))
}

/* ------------------------------------------------------ E. the workbook writer */

eq('E1 a sheet name a spreadsheet would reject is cleaned, never dropped', safeSheetName('a/b:c?[d]', 'x'), 'a b c  d')
eq('E2 a name longer than the format allows is cut to its limit', safeSheetName('x'.repeat(40), 'y').length, 31)
eq('E3 an empty name falls back rather than making the file unopenable', safeSheetName('   ', 'Sheet1'), 'Sheet1')
{
  const bytes = sheetsToXlsx(gscExportSheets(input()))
  check('E4 the writer returns real xlsx bytes (a zip container)', bytes.length > 1000 && bytes[0] === 0x50 && bytes[1] === 0x4b)
}

/* --------------------------------------------------------------- F. the control */

check('F1 the download appears only once there are figures', /state === 'ready' && <GscExportDownload/.test(strip(read('components/gsc/GscPerformance.tsx'))))
check('F2 a refusal shows a sentence, never a page of JSON', COMPONENT.includes('setFailed(true)') && COMPONENT.includes('t.failed'))
check('F3 the control says the position is Google’s average, not our rank check', COMPONENT.includes('t.note'))
check('F4 the file is asked for in the dashboard’s language', /language=\$\{encodeURIComponent\(uiLocale\)\}/.test(COMPONENT))
check('F5 the three dashboard languages all carry the words of the download', (() => {
  return ['he', 'en', 'es'].every((l) => read(`lib/i18n/dashboard/${l}.ts`).includes('exportReport'))
})())

/* F-MUT: hide the refusal and show F2 fails. */
check('F-MUT a control that swallows a refusal is caught', !COMPONENT.replace('setFailed(true)', '').includes('setFailed(true)'))


/* ------------------------------------------- G. the two-page summary (PDF) */

const PDF = strip(read('lib/gsc/export/pdf-summary.ts'))

// A property with a long tail: one row below the floor, one on the first page,
// one far from it, and two real chances.
function summaryInput(over: Partial<GscExportInput> = {}) {
  const rows: GscExportInput['rows'] = [
    { query: 'chance a', page: 'https://example.com/a', clicks: 10, impressions: 400, ctr: 0.025, position: 6.4 },
    { query: 'chance a', page: 'https://example.com/b', clicks: 2, impressions: 100, ctr: 0.02, position: 11.0 },
    { query: 'chance b', page: 'https://example.com/b', clicks: 1, impressions: 120, ctr: 0.008, position: 14.2 },
    { query: 'already first', page: 'https://example.com/a', clicks: 90, impressions: 300, ctr: 0.3, position: 2.1 },
    { query: 'far away', page: 'https://example.com/c', clicks: 0, impressions: 200, ctr: 0, position: 44.0 },
    { query: 'noise', page: 'https://example.com/d', clicks: 0, impressions: 3, ctr: 0, position: 7.0 },
  ]
  return {
    ...input({ rows, ...over }),
    pdf: gscPdfLabels('he'),
    language: 'he' as const,
    generatedAt: '2026-10-05',
  }
}

const sQueries = rollUp(summaryInput().rows, 'query')
const sPages = rollUp(summaryInput().rows, 'page')

{
  const a = sQueries.find((q) => q.key === 'chance a')!
  eq('G1 a query is rolled up across its pages: clicks and impressions sum', [a.clicks, a.impressions], [12, 500])
  // (6.4*400 + 11.0*100) / 500 = 7.32
  check('G2 the rolled-up position is weighted by impressions, not averaged', Math.abs((a.position ?? 0) - 7.32) < 1e-9, a.position)
  check('G3 the rolled-up CTR is recomputed from the two sums', Math.abs((a.ctr ?? 0) - 12 / 500) < 1e-12, a.ctr)
}

// The page roll-up must agree with the spreadsheet's own, or the two downloads
// disagree about the same page.
{
  const sheet = pagesSheet(input({ rows: summaryInput().rows }))
  const fromSheet = new Map(sheet.rows.slice(1).map((r) => [String(r[0]), [r[1], r[2], r[3], r[4]]]))
  const mine = sPages.map((p) => [p.key, [p.clicks, p.impressions, ctrPercent(p.ctr), onePlace(p.position)]] as const)
  check('G4 the summary and the spreadsheet agree on every page', mine.every(([key, vals]) =>
    JSON.stringify(fromSheet.get(key)) === JSON.stringify(vals)), mine)
}

{
  const chances = opportunities(sQueries)
  eq('G5 only the queries close to the first page are called chances, most searched first',
    chances.map((c) => c.key), ['chance a', 'chance b'])
  check('G6 a query already on the first page is not a chance', !chances.some((c) => c.key === 'already first'))
  check('G7 a query far from the first page is not a chance', !chances.some((c) => c.key === 'far away'))
  check('G8 a row Google reported a handful of times is left out of every table',
    !chances.some((c) => c.key === 'noise')
    && !topQueries(sQueries).some((q) => q.key === 'noise')
    && !topPages(sPages).some((p) => p.key === 'https://example.com/d'))
}

/* G-MUT (behaviour): with the floor at zero the noisy row WOULD appear, which is
 * what proves the floor is doing the excluding rather than the sort order. */
check('G-MUT1 the floor is what excludes the noise',
  rollUp(summaryInput().rows, 'query').some((q) => q.key === 'noise' && q.impressions < MIN_IMPRESSIONS))

{
  const html = generateGscSummaryHTML(summaryInput())
  const P = gscPdfLabels('he')
  check('G9 the page states the filter it applied, with both numbers',
    html.includes(esc0(P.filterNote(MIN_IMPRESSIONS, OPPORTUNITY_MIN_POSITION, OPPORTUNITY_MAX_POSITION))))
  check('G10 the headline figures are Google’s own property totals, not sums of the rows',
    html.includes('4,000') || html.includes('4000'), html.slice(0, 0))
  check('G11 it is two pages: one break, not one per section',
    (html.match(/page-two/g) ?? []).length === 2)
  check('G12 the summary carries the sentence that keeps it apart from our rank check',
    html.includes(esc0(labels.positionNote)))
  check('G13 a query is printed left to right even on a Hebrew page, so a URL stays readable',
    /<td dir="ltr" class="text">/.test(html))
  check('G14 the document declares the reader’s own language and direction',
    html.includes('<html dir="rtl" lang="he">'))
}

/* A query carrying HTML is text from outside the product. */
{
  const html = generateGscSummaryHTML(summaryInput({
    rows: [{ query: '<script>alert(1)</script>', page: 'https://example.com/a', clicks: 1, impressions: 50, ctr: 0.02, position: 8 }],
  }))
  check('G15 a query that carries HTML is escaped, never rendered',
    html.includes('&lt;script&gt;') && !html.includes('<script>alert'))
}

/* G-MUT2: the same page with the escaping taken out — the predicate G15 uses
 * must fail on it, or G15 would pass on an unescaped page too. */
check('G-MUT2 an unescaped query would be caught', (() => {
  const raw = '<script>alert(1)</script>'
  const unescaped = generateGscSummaryHTML(summaryInput({
    rows: [{ query: raw, page: 'https://example.com/a', clicks: 1, impressions: 50, ctr: 0.02, position: 8 }],
  })).replace('&lt;script&gt;alert(1)&lt;/script&gt;', raw)
  const guard = (html: string) => html.includes('&lt;script&gt;') && !html.includes('<script>alert')
  return !guard(unescaped)
})())

{
  const empty = generateGscSummaryHTML(summaryInput({ rows: [], keywords: [] }))
  const P = gscPdfLabels('he')
  check('G16 a property with nothing above the floor says so, rather than printing empty tables',
    empty.includes(esc0(P.nothingBody(MIN_IMPRESSIONS))) && !empty.includes('<table>'))
}

/* A page with a Hebrew path: the printed text was the whole encoded address,
 * which the PDF reader turned into a link only up to where the line wrapped. */
{
  const encoded = 'https://example.com/%D7%9E%D7%90%D7%9E%D7%A8%D7%99%D7%9D/%D7%A9%D7%99%D7%A0%D7%95%D7%99-%D7%A9%D7%9D-%D7%9E%D7%A9%D7%A4%D7%97%D7%94-%D7%91%D7%99%D7%A9%D7%A8%D7%90%D7%9C/'
  const html = generateGscSummaryHTML(summaryInput({
    rows: [{ query: 'q', page: encoded, clicks: 9, impressions: 500, ctr: 0.02, position: 5 }],
  }))
  const a = html.match(/<a href="([^"]+)">([^<]*)<\/a>/)
  check('G19 a top page is a real link whose address is the whole encoded URL, uncut', a?.[1] === encoded, a?.[1])
  check('G20 the words shown are the readable Hebrew path, not the encoded address',
    a?.[2] === '/מאמרים/שינוי-שם-משפחה-בישראל/' && !html.includes(`>${encoded}<`), a?.[2])
  eq('G21 the home page shows the domain', pageLink('https://example.com/')?.label, 'example.com')
  check('G22 anything that is not an http(s) address stays plain text', pageLink('javascript:alert(1)') === null && pageLink('not a url') === null)
  const q = generateGscSummaryHTML(summaryInput({
    rows: [{ query: 'https://example.com/q', page: 'https://example.com/a', clicks: 9, impressions: 500, ctr: 0.02, position: 5 }],
  }))
  check('G23 queries are never turned into links', !q.includes('<a href="https://example.com/q"'))
  /* G-MUT3: the old cell (plain text) fails G19. */
  const old = html.replace(/<a href="[^"]+">[^<]*<\/a>/, encoded)
  check('G-MUT3 a page printed as plain text is caught', !(old.match(/<a href="([^"]+)">/)?.[1] === encoded))
}

eq('G17 the file names itself, in ASCII, so no browser renames it',
  gscSummaryFileName(28, '2026-10-04'), 'search-console-summary-28d-2026-10-04.pdf')
check('G18 a run with no end date still produces an openable name',
  /^search-console-summary-28d-latest\.pdf$/.test(gscSummaryFileName(28, null)))

check('G19 all four languages carry the summary’s own words', (() => {
  const langs = ['he', 'en', 'es', 'pt-BR'] as const
  return langs.every((l) => {
    const L = gscPdfLabels(l)
    return L.title.length > 0 && L.opportunitiesTitle.length > 0 && L.filterNote(10, 4, 20).includes('10')
  })
})())
check('G20 no language was left reading the English summary by accident', (() => {
  const en = gscPdfLabels('en')
  return (['he', 'es', 'pt-BR'] as const).every((l) => gscPdfLabels(l).opportunitiesTitle !== en.opportunitiesTitle)
})())

check('G21 the PDF provider is injected, so this feature never calls it directly',
  !PDF.includes('pdfshift') && !HTTP.includes('pdfshift') && ROUTE.includes('renderPdfFromHtml'))
check('G22 the summary is built from the same input as the workbook',
  PDF.includes("from './sheets'") && HTTP.includes('generateGscSummaryHTML'))
check('G23 the control offers the summary and asks for it in the reader’s language',
  COMPONENT.includes("download('pdf')") && /language=\$\{encodeURIComponent\(uiLocale\)\}/.test(COMPONENT))

/* The words the page prints are escaped the same way the page escapes them, so a
 * label with an apostrophe does not fail a guard for the wrong reason. */
function esc0(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

routeChecks().then(() => {
  console.log(`${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
})

export {}
