/**
 * THE SEARCH CONSOLE LINKS IMPORT (wave 14): the guards. Every rule has a MUTATION
 * CONTROL: the same check on a deliberately broken copy of the code must fail.
 *
 *   A  parser, each list type: linking sites, target pages, latest links, in the
 *      English and the Hebrew Search Console headers, from several CSVs in one
 *      import or a single csv; sorted by count; numbers like "1,234"; dates in
 *      either order.
 *   B  an unknown file is ignored; files with none of the three are "wrong_file".
 *   C  caps: rows read per file, rows kept per list, files per import, the upload
 *      size per file and in total.
 *   D  a cell can never be a formula (leading = + - @ stripped), on the way in
 *      and on the screen.
 *   E  only http(s) addresses with a real host are links, with nofollow noopener.
 *   F  owner scoping: session + project ownership, every table query filtered by
 *      project AND owner, the written user id is the project's owner; a re-import
 *      replaces the snapshot.
 *   G  no raw errors: friendly codes only; a database without the table is a
 *      graceful "not yet available", never an error.
 *   H  the screen: 25 rows by default + "show all", the import date and "does not
 *      update by itself" shown, Hebrew and English words, three steps.
 *   I  the migration is additive, owner-only, never applied by code.
 *   J  (wave 15) CSV ONLY: no zip reader, no Excel reader (no `xlsx` / `zlib` in
 *      the parser); every file must be *.csv, not binary, without NUL, valid
 *      text; one bad file rejects the whole import; the picker takes several
 *      .csv files and nothing else.
 *   K  no crawling: the signed-in area's layout says noindex/nofollow/nocache
 *      (googleBot too), and every answer of the import route sends
 *      X-Robots-Tag: noindex, nofollow.
 *
 * Run: npx tsx lib/site-links/gsc-import/__qa__/gsc-import.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import * as XLSX from 'xlsx' // WRITE only, to build a real .xlsx fixture the import must refuse
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { withMutant } from '../../../reminders/__qa__/_mutant'
import { parseLinksExportFiles, parseCsv, parseCrawlDate } from '../parse'
import { handleGscImportGet, handleGscImportPost, type GscImportDeps } from '../http'
import { DEFAULT_VISIBLE_ROWS, MAX_IMPORT_FILES, MAX_ROWS_PER_SHEET, MAX_STORED_ROWS, MAX_UPLOAD_BYTES, cleanCell, importedHref, parseCount, readSnapshot, visibleRows, type GscImportSnapshot } from '../snapshot'
import { dashboardHe } from '../../../i18n/dashboard/he'
import { dashboardEn } from '../../../i18n/dashboard/en'

const { DashboardLanguageProvider } = require('../../../i18n/dashboard/useDashboardLanguage')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const bytes = (s: string) => new TextEncoder().encode(s)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const crc32 = (b: Uint8Array) => { let c, crc = 0xffffffff; for (let i = 0; i < b.length; i++) { c = (crc ^ b[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c } return (crc ^ 0xffffffff) >>> 0 }

/** A .zip writer for the fixtures (deflate), with an optional lie about the uncompressed size. */
function zip(files: Record<string, string | Uint8Array>, opts: { lieUsize?: number; stored?: boolean } = {}): Uint8Array {
  const parts: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(typeof content === 'string' ? bytes(content) : content)
    const body = opts.stored ? data : deflateRawSync(data)
    const nm = Buffer.from(name)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(opts.stored ? 0 : 8, 8)
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(opts.lieUsize ?? data.length, 22); lh.writeUInt16LE(nm.length, 26)
    parts.push(lh, nm, body)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(opts.stored ? 0 : 8, 10)
    ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(opts.lieUsize ?? data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42)
    central.push(ch, nm)
    offset += lh.length + nm.length + body.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...parts, cd, end]))
}
function xlsx(sheets: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// ── fixtures (what Search Console's export looks like) ──────────────────────
const EN = {
  sites: 'Site,Linking pages,Target pages\nsmall.example.org,3,1\nbig-blog.example.com,"1,240",12\nmid.co.il,87,5\n',
  targets: 'Target page,Incoming links,Linking sites\nhttps://plumber.example/,"2,100",80\nhttps://plumber.example/leaks,340,25\nhttps://plumber.example/blog/x,12,3\n',
  latest: 'Linking page,Last crawled\nhttps://old.example.org/a,2026-08-01\nhttps://new.example.org/b,2026-09-28\nhttps://mid.example.org/c,"Sep 15, 2026"\n',
}
const HE = {
  sites: 'אתר,דפים מקשרים,דפי יעד\nקטן.example.org,3,1\nגדול.example.com,"1,240",12\nבינוני.co.il,87,5\n',
  targets: 'דף יעד,קישורים נכנסים,אתרים מקשרים\nhttps://plumber.example/,"2,100",80\nhttps://plumber.example/leaks,340,25\nhttps://plumber.example/blog/x,12,3\n',
  latest: 'דף מקשר,נסרק לאחרונה\nhttps://old.example.org/a,01/08/2026\nhttps://new.example.org/b,28/09/2026\nhttps://mid.example.org/c,15/09/2026\n',
}
type F = { name: string; bytes: Uint8Array }
const filesOf = (o: Record<string, string | Uint8Array>): F[] => Object.entries(o).map(([name, c]) => ({ name, bytes: typeof c === 'string' ? bytes(c) : c }))
// Search Console's "Download CSV": the CSVs the owner selects (after opening the compressed folder).
const csvsEn = () => filesOf({ 'Top linking sites.csv': EN.sites, 'Top linked pages - externally.csv': EN.targets, 'Latest links.csv': EN.latest })
const csvsHe = () => filesOf({ 'אתרים מקשרים.csv': HE.sites, 'דפים מקושרים.csv': HE.targets, 'קישורים אחרונים.csv': HE.latest })
const one = (name: string, b: Uint8Array) => parseLinksExportFiles([{ name, bytes: b }])
const okFiles = async (fs: F[]) => { const r = await parseLinksExportFiles(fs); return r.ok ? r.data : null }
const okData = async (name: string, b: Uint8Array) => okFiles([{ name, bytes: b }])
const codeOf = async (p: Promise<{ ok: boolean; code?: string }>) => { const r = await p; return r.ok ? 'ok' : r.code }

async function main() {
  // ── A. each sheet type ────────────────────────────────────────────────────
  console.log('\nA) parser: each list type, English and Hebrew headers, several CSVs / one csv')
  const en = await okFiles(csvsEn())
  check('A1: EN 3 CSVs in one import → linking sites, sorted by linking pages desc, "1,240" read as 1240',
    !!en && en.linkingSites.map((s) => s.site).join() === 'big-blog.example.com,mid.co.il,small.example.org' && en.linkingSites[0].linkingPages === 1240 && en.linkingSites[0].targetPages === 12, en?.linkingSites)
  check('A2: EN 3 CSVs → target pages, sorted by incoming links desc, with linking sites',
    !!en && en.targetPages.map((s) => s.incomingLinks).join() === '2100,340,12' && en.targetPages[0].linkingSites === 80 && en.targetPages[0].page === 'https://plumber.example/', en?.targetPages)
  check('A3: EN 3 CSVs → latest links, newest first, "Sep 15, 2026" read as a date',
    !!en && en.latestLinks.map((l) => l.lastCrawled).join() === '2026-09-28,2026-09-15,2026-08-01', en?.latestLinks)
  check('A4: totals count the rows of each list', !!en && en.totals.linkingSites === 3 && en.totals.targetPages === 3 && en.totals.latestLinks === 3)
  const he = await okFiles(csvsHe())
  check('A5: HE 3 CSVs → the same three lists from the Hebrew headers, day-first dates read right',
    !!he && he.linkingSites[0].site === 'גדול.example.com' && he.linkingSites[0].linkingPages === 1240 && he.targetPages[0].incomingLinks === 2100
      && he.latestLinks.map((l) => l.lastCrawled).join() === '2026-09-28,2026-09-15,2026-08-01', he)
  for (const [k, csv] of Object.entries(EN)) {
    const one = await okData(`${k}.csv`, bytes(csv))
    check(`A6: a single English ${k}.csv is read on its own`, !!one && (k === 'sites' ? one.linkingSites.length === 3 && one.targetPages.length === 0 : k === 'targets' ? one.targetPages.length === 3 && one.linkingSites.length === 0 : one.latestLinks.length === 3 && one.targetPages.length === 0))
  }
  const heSingle = await okData('x.csv', bytes('﻿' + HE.sites.replace(/,/g, ';').replace(/"1;240"/, '"1,240"')))
  check('A7: a Hebrew single csv with a BOM and ";" as the delimiter is read', !!heSingle && heSingle.linkingSites.length === 3 && heSingle.linkingSites[0].linkingPages === 1240, heSingle)
  check('A10: crawl dates: ISO, either order by the UI language, "28 Sep 2026", unreadable text kept',
    parseCrawlDate('2026-09-28T10:00:00Z') === '2026-09-28' && parseCrawlDate('28/09/2026', 'dmy') === '2026-09-28' && parseCrawlDate('09/28/2026', 'mdy') === '2026-09-28'
      && parseCrawlDate('03/04/2026', 'dmy') === '2026-04-03' && parseCrawlDate('03/04/2026', 'mdy') === '2026-03-04' && parseCrawlDate('28 Sep 2026') === '2026-09-28' && parseCrawlDate('yesterday') === 'yesterday')
  check('A11: counts: 1,234 / 1.234 / 1 234 / 56 / junk', parseCount('1,234') === 1234 && parseCount('1.234') === 1234 && parseCount('1 234') === 1234 && parseCount(56) === 56 && parseCount('abc') === null && parseCount('-5') === null && parseCount('') === null)
  check('A12: csv: quoted commas, doubled quotes and CRLF', JSON.stringify(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')) === JSON.stringify([['a', 'b'], ['x, y', 'say "hi"']]))

  const mutSites = await withMutant<any, number>('lib/site-links/gsc-import/parse.ts', [["if (pages >= 0 || targets >= 0) return { kind: 'sites'", 'if (false) return { kind: \'sites\'']], async (m) => ((await m.parseLinksExportFiles([{ name: 'x.csv', bytes: bytes(EN.sites) }])).ok ? 1 : 0))
  check('A-MUT1: without the linking-sites detection that file is not read → caught', mutSites === 0)
  const mutTargets = await withMutant<any, number>('lib/site-links/gsc-import/parse.ts', [["if (incoming >= 0 || sites >= 0) return { kind: 'targets'", 'if (false) return { kind: \'targets\'']], async (m) => ((await m.parseLinksExportFiles([{ name: 'x.csv', bytes: bytes(EN.targets) }])).ok ? 1 : 0))
  check('A-MUT2: without the target-pages detection → caught', mutTargets === 0)
  const mutLatest = await withMutant<any, number>('lib/site-links/gsc-import/parse.ts', [["if (latestPage >= 0 && crawled >= 0) return", 'if (false) return']], async (m) => ((await m.parseLinksExportFiles([{ name: 'x.csv', bytes: bytes(EN.latest) }])).ok ? 1 : 0))
  check('A-MUT3: without the latest-links detection → caught', mutLatest === 0)
  const mutHe = await withMutant<any, number>('lib/site-links/gsc-import/parse.ts', [["'אתר', 'אתר מקשר', 'אתרים מקשרים מובילים'", "'zz'"]], async (m) => ((await m.parseLinksExportFiles([{ name: 'x.csv', bytes: bytes(HE.sites) }])).ok ? 1 : 0))
  check('A-MUT4: without the Hebrew "site" header the Hebrew file is not read → caught', mutHe === 0)
  const mutMulti = await withMutant<any, number>('lib/site-links/gsc-import/parse.ts', [['for (const t of texts) if', 'for (const t of texts.slice(0, 1)) if']], async (m) => { const r = await m.parseLinksExportFiles(csvsEn()); return r.ok ? r.data.targetPages.length + r.data.latestLinks.length : -1 })
  check('A-MUT5: reading only the first of several CSVs → caught', mutMulti === 0)
  const mutDate = await withMutant<any, string | null>('lib/site-links/gsc-import/parse.ts', [["const dayFirst = a > 12 ? true : b > 12 ? false : order === 'dmy'", 'const dayFirst = false']], (m) => m.parseCrawlDate('03/04/2026', 'dmy'))
  check('A-MUT6: ignoring the day-first Hebrew order → caught', mutDate !== '2026-04-03')

  // ── B. unknown sheets ─────────────────────────────────────────────────────
  console.log('\nB) an unknown file is ignored')
  const mixed = await okFiles(filesOf({ 'Top linking text.csv': 'Linking text,Count\nbuy now,5\n', 'Top linking sites.csv': EN.sites, 'Top linked pages - internally.csv': 'Target page,Incoming links,Linking sites\nhttps://plumber.example/internal,999,1\n' }))
  check('B1: anchor-text and internal-links CSVs among the files are ignored; the linking sites are read',
    !!mixed && mixed.linkingSites.length === 3 && mixed.targetPages.length === 0 && mixed.latestLinks.length === 0, mixed)
  const only = await one('Top linking text.csv', bytes('Linking text,Count\nbuy now,5\n'))
  check('B2: a file with none of the three lists is "wrong_file"', !only.ok && only.code === 'wrong_file')
  const mutIgnore = await withMutant<any, string>('lib/site-links/gsc-import/parse.ts', [["if (lists.seen.size === 0) return { ok: false, code: 'wrong_file' }", '']], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'Top linking text.csv', bytes: bytes('Linking text,Count\nbuy now,5\n') }]); return r.ok ? 'ok' : r.code })
  check('B-MUT: not rejecting a file with no known list → caught', mutIgnore !== 'wrong_file')
  const mutInternal = await withMutant<any, number>('lib/site-links/gsc-import/parse.ts', [['const INTERNAL_NAME = /intern|פנימ/i', 'const INTERNAL_NAME = /^$^/']], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'Top linked pages - internally.csv', bytes: bytes('Target page,Incoming links,Linking sites\nhttps://plumber.example/internal,999,1\n') }]); return r.ok ? r.data.targetPages.length : 0 })
  check('B-MUT2: without skipping the internal-links sheet it is shown as if external → caught', mutInternal === 1)
  const emptyList = await one('e.csv', bytes('Site,Linking pages,Target pages\n'))
  check('B3: the right headers and no rows is "empty"', !emptyList.ok && emptyList.code === 'empty')
  check('B4: zero bytes is "empty"; text that is not an export, and a binary renamed .csv, are "wrong_file"',
    (await codeOf(one('x.csv', new Uint8Array()))) === 'empty' && (await codeOf(one('x.csv', bytes('hello,world\n1,2\n')))) === 'wrong_file'
      && (await codeOf(one('x.csv', new Uint8Array([0x50, 0x00, 0x01, 0x02])))) === 'wrong_file' && (await codeOf(one('x.pdf', bytes('%PDF-1.4')))) === 'wrong_file')
  const bad = await one('z.csv', new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(40).fill(7)]))
  check('B5: broken zip bytes named .csv are "wrong_file", never a thrown error', !bad.ok && bad.code === 'wrong_file')

  // ── C. caps ───────────────────────────────────────────────────────────────
  console.log('\nC) caps')
  const bigCsv = 'Site,Linking pages,Target pages\n' + Array.from({ length: MAX_ROWS_PER_SHEET + 5000 }, (_, i) => `s${i}.example.org,${i % 997},1`).join('\n') + '\n'
  const bigRes = await okData('big.csv', bytes(bigCsv))
  check(`C1: a sheet is read to ${MAX_ROWS_PER_SHEET} rows and no further; ${MAX_STORED_ROWS} are kept, the largest first`,
    !!bigRes && bigRes.totals.linkingSites === MAX_ROWS_PER_SHEET && bigRes.linkingSites.length === MAX_STORED_ROWS && bigRes.linkingSites[0].linkingPages === 996, bigRes && { total: bigRes.totals.linkingSites, kept: bigRes.linkingSites.length })
  const rowsMut = await withMutant<any, number>('lib/site-links/gsc-import/parse.ts', [['rows.slice(t.start, t.start + MAX_ROWS_PER_SHEET)', 'rows.slice(t.start)'], ['const limit = MAX_ROWS_PER_SHEET + HEADER_SEARCH_ROWS + 1', 'const limit = Infinity']], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'big.csv', bytes: bytes(bigCsv) }]); return r.ok ? r.data.totals.linkingSites : -1 })
  check('C1-MUT: without the per-sheet row cap → caught', rowsMut > MAX_ROWS_PER_SHEET)
  const keepMut = await withMutant<any, number>('lib/site-links/gsc-import/parse.ts', [[/\.slice\(0, MAX_STORED_ROWS\)/g, '']], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'big.csv', bytes: bytes(bigCsv) }]); return r.ok ? r.data.linkingSites.length : -1 })
  check('C2-MUT: without the kept-rows cap → caught', keepMut > MAX_STORED_ROWS)

  // ── D. formulas ───────────────────────────────────────────────────────────
  console.log('\nD) a cell can never be a formula')
  const evil = ['=HYPERLINK("http://evil.example","x")', '+1+1', '-2+3', '@SUM(A1:A9)', '\t=1+1', '＝1+1', ' =cmd|\' /C calc\'!A0']
  check('D1: cleanCell strips leading = + - @ (and tab, full-width =)', evil.every((e) => !/^[=+\-@\t＝]/.test(cleanCell(e))), evil.map((e) => cleanCell(e)))
  const fx = await okData('f.csv', bytes('Site,Linking pages,Target pages\n=HYPERLINK("http://evil.example","x"),5,1\n+1+1,4,1\n@SUM(A1),3,1\nnormal.example.org,2,1\n'))
  check('D2: after parsing, no stored site starts with a formula character', !!fx && fx.linkingSites.length === 4 && fx.linkingSites.every((s) => !/^[=+\-@]/.test(s.site)), fx?.linkingSites)
  const cleanMut = await withMutant<any, string>('lib/site-links/gsc-import/snapshot.ts', [['s = s.replace(/^[=+\\-@\\uff1d\\uff0b\\uff0d\\uff20\\s]+/, \'\')', '']], (m) => m.cleanCell('=1+1'))
  check('D-MUT: without the leading-character strip → caught', cleanMut === '=1+1')
  const snapRow = readSnapshot({ imported_at: '2026-10-01T10:00:00Z', file_name: '=evil.csv', linking_sites: [{ site: '=SUM(1)', linkingPages: 1 }], target_pages: [{ page: '+x', incomingLinks: 2 }], latest_links: [{ linkingPage: '@y', lastCrawled: '-1' }] })
  check('D4: readSnapshot re-cleans a stored row (an old or foreign row cannot put a formula on the screen)',
    !!snapRow && snapRow.fileName === 'evil.csv' && snapRow.linkingSites[0].site === 'SUM(1)' && snapRow.targetPages[0].page === 'x' && snapRow.latestLinks[0].linkingPage === 'y' && snapRow.latestLinks[0].lastCrawled === '1', snapRow)

  // ── E. links ──────────────────────────────────────────────────────────────
  console.log('\nE) only http(s) addresses are links')
  const { ImportedText, ImportView } = require('../../../../components/site-links/GscLinksImport')
  const heCopy = dashboardHe.siteLinks, enCopy = dashboardEn.siteLinks
  const render = (locale: 'he' | 'en', node: unknown) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale }, node as never) as never)
  const draw = (value: string, mod: any = ImportedText) => render('he', createElement(mod, { value, newTabLabel: 'נפתח בלשונית חדשה' }))
  const notLinks = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://files.example.org/x', 'https://user:pw@evil.example.org/', 'file:///etc/passwd', '//evil.example.org/x', 'example.org', 'http://localhost/x', 'http://127.0.0.1/']
  check('E1: javascript:, data:, ftp:, file:, credentials, protocol-relative, a bare domain, localhost and IPs are drawn as text, never as <a>',
    notLinks.every((v) => !/<a[\s>]/.test(draw(v))), notLinks.filter((v) => /<a[\s>]/.test(draw(v))))
  const good = draw('https://plumber.example/leaks?a=1&b=2')
  check('E2: an https address is a link: new tab, rel nofollow noopener noreferrer, the address as href', /<a /.test(good) && /target="_blank"/.test(good) && /rel="nofollow noopener noreferrer"/.test(good) && /href="https:\/\/plumber\.example\/leaks\?a=1&amp;b=2"/.test(good), good)
  check('E3: importedHref', importedHref('https://a.example.org/x') === 'https://a.example.org/x' && importedHref('javascript:1') === null && importedHref('=https://a.example.org') === 'https://a.example.org/')
  const hrefMut = await withMutant<any, string | null>('lib/site-links/gsc-import/snapshot.ts', [['return safeExternalUrl(cleanCell(value, 2048))', 'return cleanCell(value, 2048) || null']], (m) => m.importedHref('javascript:alert(1)'))
  check('E-MUT: a link check that lets javascript: through → caught', hrefMut !== null)
  const srcMut = strip(read('components/site-links/GscLinksImport.tsx')).replace('const href = importedHref(text)', 'const href = text')
  check('E4: the component takes every href from importedHref (source guard) and its mutation is caught', /const href = importedHref\(text\)/.test(strip(read('components/site-links/GscLinksImport.tsx'))) && !/const href = importedHref\(text\)/.test(srcMut))
  const formulaShown = text(draw('=HYPERLINK("http://evil.example")'))
  check('E5: on the screen a formula-looking value is shown without its leading "="', !/(^|\s)=HYPERLINK/.test(formulaShown) && /HYPERLINK/.test(formulaShown), formulaShown)

  // ── F. owner scoping ──────────────────────────────────────────────────────
  console.log('\nF) owner scoping')
  const OWNER = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222'
  const P_OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', P_OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const mkDb = (hooks: any = {}) => new FakeAdmin({
    projects: [{ id: P_OWN, user_id: OWNER }, { id: P_OTHER, user_id: OTHER }],
    site_links_gsc_imports: [
      { id: 'o', project_id: P_OTHER, user_id: OTHER, imported_at: '2026-09-01T00:00:00Z', file_name: 'OTHER-TENANT.zip', linking_sites: [{ site: 'other-secret.example', linkingPages: 1 }], target_pages: [], latest_links: [] },
      // A row that names the owner's project under another user: it must not be served to the owner.
      { id: 'x', project_id: P_OWN, user_id: OTHER, imported_at: '2026-09-02T00:00:00Z', file_name: 'FORGED.zip', linking_sites: [{ site: 'forged.example', linkingPages: 1 }], target_pages: [], latest_links: [] },
    ],
  }, hooks)
  const deps = (userId: string | null, db: FakeAdmin, now = '2026-10-02T09:00:00Z'): GscImportDeps => ({ session: async () => ({ userId }), admin: () => db as any, now: () => new Date(now) })
  const upload = (name: string, content: Uint8Array | string, type = 'text/csv') => {
    const form = new FormData(); form.set('file', new File([content as BlobPart], name, { type }))
    return new Request('http://x/api', { method: 'POST', body: form })
  }
  const uploadMany = (fs: { name: string; bytes: Uint8Array }[]) => {
    const form = new FormData(); for (const f of fs) form.append('file', new File([f.bytes as BlobPart], f.name, { type: 'text/csv' }))
    return new Request('http://x/api', { method: 'POST', body: form })
  }
  const EN_NAMES = 'Top linking sites.csv, Top linked pages - externally.csv, Latest links.csv'
  const db1 = mkDb()
  const r1 = await handleGscImportPost(P_OWN, uploadMany(csvsEn()), deps(OWNER, db1))
  const b1 = await r1.json() as any
  const rows1 = db1.tables.site_links_gsc_imports
  check('F1: the owner imports 3 CSVs in one request (200); the row is written for the owner\'s project with the project owner as user_id, the file names joined',
    r1.status === 200 && b1.ok && b1.snapshot.linkingSites.length === 3 && b1.snapshot.targetPages.length === 3 && b1.snapshot.latestLinks.length === 3 && rows1.some((r: any) => r.project_id === P_OWN && r.user_id === OWNER && r.file_name === EN_NAMES && r.imported_at === '2026-10-02T09:00:00.000Z'), b1)
  const before = JSON.stringify(mkDb().tables)
  const dbX = mkDb()
  const rX = await handleGscImportPost(P_OTHER, uploadMany(csvsEn()), deps(OWNER, dbX))
  check('F2: another owner\'s project is a 404 and nothing is written', rX.status === 404 && JSON.stringify(dbX.tables) === before)
  check('F3: no session is a 401; a malformed id is a 404 before any read',
    (await handleGscImportPost(P_OWN, uploadMany(csvsEn()), deps(null, mkDb()))).status === 401 && (await handleGscImportGet('../x', deps(OWNER, mkDb()))).status === 404 && (await handleGscImportGet(P_OWN, deps(null, mkDb()))).status === 401)
  const g1 = await (await handleGscImportGet(P_OWN, deps(OWNER, mkDb()))).json() as any
  check('F4: GET serves only a row of this project AND this owner (another tenant\'s and a forged row never leak)', g1.ok && g1.snapshot === null && !/OTHER-TENANT|other-secret|FORGED|forged/.test(JSON.stringify(g1)), g1)
  check('F5: GET for another owner\'s project is a 404', (await handleGscImportGet(P_OTHER, deps(OWNER, mkDb()))).status === 404)
  const r2 = await handleGscImportPost(P_OWN, upload('second.csv', EN.sites, 'text/csv'), deps(OWNER, db1, '2026-10-05T09:00:00Z'))
  const mine: any[] = db1.tables.site_links_gsc_imports.filter((r: any) => r.project_id === P_OWN && r.user_id === OWNER)
  check('F6: a re-import REPLACES the project\'s snapshot (one row, new date, new file, new lists)',
    r2.status === 200 && mine.length === 1 && mine[0].file_name === 'second.csv' && mine[0].imported_at === '2026-10-05T09:00:00.000Z' && mine[0].target_pages.length === 0 && mine[0].linking_sites.length === 3, mine)
  const g2 = await (await handleGscImportGet(P_OWN, deps(OWNER, db1))).json() as any
  check('F7: GET after the import returns the snapshot with the import date', g2.snapshot?.fileName === 'second.csv' && g2.snapshot.importedAt === '2026-10-05T09:00:00.000Z' && g2.snapshot.totals.linkingSites === 3, g2)

  const leakProject = await withMutant<any, number>('lib/site-links/gsc-import/http.ts', [[".eq('id', projectId).eq('user_id', userId).limit(1)", ".eq('id', projectId).limit(1)"], ['if (!project || project.user_id !== userId)', 'if (!project)']], async (m) => (await m.handleGscImportPost(P_OTHER, uploadMany(csvsEn()), deps(OWNER, mkDb()))).status)
  check('F-MUT1: project read without the owner filter lets another owner\'s project in → caught', leakProject === 200)
  const leakRead = await withMutant<any, string>('lib/site-links/gsc-import/http.ts', [[".eq('project_id', projectId).eq('user_id', who.userId).limit(1)", ".eq('project_id', projectId).limit(1)"]], async (m) => JSON.stringify(await (await m.handleGscImportGet(P_OWN, deps(OWNER, mkDb()))).json()))
  check('F-MUT2: snapshot read without the owner filter serves a forged row → caught', /FORGED/.test(leakRead))
  const forged = await withMutant<any, string>('lib/site-links/gsc-import/http.ts', [['{ project_id: projectId, user_id: who.userId, ...row }', `{ project_id: projectId, user_id: '${OTHER}', ...row }`]], async (m) => { const d = mkDb(); await m.handleGscImportPost(P_OWN, uploadMany(csvsEn()), deps(OWNER, d)); return JSON.stringify(d.tables.site_links_gsc_imports.filter((r: any) => r.file_name === EN_NAMES)) })
  check('F-MUT3: writing another user id is visible to the check (the written user id is the project owner) → caught', new RegExp(OTHER).test(forged))
  const httpSrc = strip(read('lib/site-links/gsc-import/http.ts'))
  const audit = (src: string) => {
    const problems: string[] = []
    const starts = [...src.matchAll(/\.from\((?:'([a-z_]+)'|GSC_IMPORT_TABLE)\)/g)]
    for (let i = 0; i < starts.length; i++) {
      const table = starts[i][1] ?? 'GSC_IMPORT_TABLE'
      const chain = src.slice(starts[i].index!, Math.min(starts[i + 1]?.index ?? src.length, starts[i].index! + 500))
      if (table === 'projects') { if (!/\.eq\('id', projectId\)\.eq\('user_id', userId\)/.test(chain)) problems.push('projects without the owner filter'); continue }
      if (!/\.eq\('project_id', projectId\)/.test(chain) && !/insert\(\{ project_id: projectId/.test(chain)) problems.push(`${table} without the project filter`)
      if (!/\.eq\('user_id', who\.userId\)/.test(chain) && !/insert\(\{ project_id: projectId, user_id: who\.userId/.test(chain)) problems.push(`${table} without the owner filter`)
    }
    return problems
  }
  check('F8: source audit: every query names the project and the owner', audit(httpSrc).length === 0 && /\.eq\('project_id', projectId\)\.eq\('user_id', who\.userId\)\.select/.test(httpSrc), audit(httpSrc))
  check('F8-MUT: the audit catches an owner-less read', audit(httpSrc.replace(".eq('project_id', projectId).eq('user_id', who.userId).limit(1)", ".eq('project_id', projectId).limit(1)")).length > 0)
  check('F9: the route authenticates itself (session via the server client) and uses nothing from the request but the project id and the file',
    /createClient/.test(strip(read('app/api/projects/[id]/site-links/gsc-import/route.ts'))) && !/searchParams|headers\.get/.test(httpSrc.replace(/request\.headers\.get\('content-length'\)/, '')))

  // ── G. no raw errors, graceful without the table ──────────────────────────
  console.log('\nG) friendly codes, graceful without the table')
  const tooBig = await handleGscImportPost(P_OWN, upload('big.csv', new Uint8Array(MAX_UPLOAD_BYTES + 1), 'text/csv'), deps(OWNER, mkDb()))
  check('G1: an upload over the size cap is a 413 "too_big" (read nowhere)', tooBig.status === 413 && (await tooBig.json() as any).code === 'too_big')
  const declared = await handleGscImportPost(P_OWN, new Request('http://x/api', { method: 'POST', headers: { 'content-length': String(MAX_UPLOAD_BYTES * 3), 'content-type': 'multipart/form-data; boundary=x' }, body: '--x--' }), deps(OWNER, mkDb()))
  check('G2: a declared body far over the cap is refused before it is read', declared.status === 413)
  const capMut = await withMutant<any, number>('lib/site-links/gsc-import/http.ts', [['if (u.size > MAX_UPLOAD_BYTES) return refuse(413, \'too_big\')', ''], ['if (declaredTotal > MAX_UPLOAD_BYTES) return refuse(413, \'too_big\')', ''], ['if (bytes.length > MAX_UPLOAD_BYTES || total > MAX_UPLOAD_BYTES) return refuse(413, \'too_big\')', '']], async (m) => (await m.handleGscImportPost(P_OWN, upload('big.csv', 'Site,Linking pages\n' + 'a.example.org,1\n'.repeat(300000)), deps(OWNER, mkDb()))).status)
  check('G2-MUT: without the size cap a 4.5 MB file is accepted → caught', capMut === 200)
  const garbage = await handleGscImportPost(P_OWN, upload('notes.csv', 'just some text\nnothing here\n', 'text/csv'), deps(OWNER, mkDb()))
  const garbageBody = JSON.stringify(await garbage.json())
  check('G3: a wrong file is a 422 "wrong_file" with only a code', garbage.status === 422 && garbageBody === '{"ok":false,"code":"wrong_file"}', garbageBody)
  const empty = await handleGscImportPost(P_OWN, upload('e.csv', 'Site,Linking pages,Target pages\n', 'text/csv'), deps(OWNER, mkDb()))
  check('G4: an empty export is "empty"', empty.status === 422 && (await empty.json() as any).code === 'empty')
  check('G5: no file in the form is "no_file"', (await handleGscImportPost(P_OWN, new Request('http://x/api', { method: 'POST', body: new FormData() }), deps(OWNER, mkDb()))).status === 400)
  const dbErr = await handleGscImportPost(P_OWN, uploadMany(csvsEn()), deps(OWNER, mkDb({ site_links_gsc_imports: { update: () => ({ code: 'XX000', message: 'secret db detail: relation foo' }) } })))
  const dbErrBody = JSON.stringify(await dbErr.json())
  check('G6: a database error is "internal" with no database text', dbErr.status === 500 && !/secret|relation|XX000/.test(dbErrBody) && dbErrBody === '{"ok":false,"code":"internal"}', dbErrBody)
  const noTable = { site_links_gsc_imports: { select: () => ({ code: 'PGRST205', message: 'Could not find the table' }), update: () => ({ code: 'PGRST205', message: 'Could not find the table' }) } }
  const gNo = await handleGscImportGet(P_OWN, deps(OWNER, mkDb(noTable)))
  const gNoBody = await gNo.json() as any
  check('G7: a database without the table answers GET 200 { available: false, snapshot: null } (not an error)', gNo.status === 200 && gNoBody.ok === true && gNoBody.available === false && gNoBody.snapshot === null, gNoBody)
  const pNo = await handleGscImportPost(P_OWN, uploadMany(csvsEn()), deps(OWNER, mkDb(noTable)))
  check('G8: ... and POST answers 503 "unavailable"', pNo.status === 503 && (await pNo.json() as any).code === 'unavailable')
  const noTableMut = await withMutant<any, number>('lib/site-links/gsc-import/http.ts', [["code === '42P01' || code === 'PGRST205'", 'false']], async (m) => (await m.handleGscImportGet(P_OWN, deps(OWNER, mkDb(noTable)))).status)
  check('G7-MUT: treating a missing table as an error → caught', noTableMut === 500)

  // ── H. the screen ─────────────────────────────────────────────────────────
  console.log('\nH) the screen')
  const rowsOf = <T,>(n: number, mk: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => mk(i))
  const snap: GscImportSnapshot = {
    importedAt: '2026-10-01T10:00:00.000Z', fileName: 'Top linking sites.csv, Top linked pages - externally.csv, Latest links.csv',
    linkingSites: rowsOf(60, (i) => ({ site: `site-${i + 1}.example.org`, linkingPages: 100 - i, targetPages: 3 })),
    targetPages: rowsOf(5, (i) => ({ page: `https://plumber.example/p${i}`, incomingLinks: 50 - i, linkingSites: 4 })),
    latestLinks: [{ linkingPage: 'https://blog.example.org/post', lastCrawled: '2026-09-28' }],
    totals: { linkingSites: 60, targetPages: 5, latestLinks: 1 },
  }
  const view = (locale: 'he' | 'en', props: any) => render(locale, createElement(ImportView, { copy: locale === 'he' ? heCopy : enCopy, locale: locale === 'he' ? 'he-IL' : 'en-US', ...props }))
  const shown = view('he', { available: true, snapshot: snap })
  const liCount = (html: string, id: string) => { const m = html.match(new RegExp(`data-gsc-import-list="${id}"[\\s\\S]*?</section>`)); return m ? (m[0].match(/<li /g) ?? []).length : -1 }
  check(`H1: a list of 60 rows shows ${DEFAULT_VISIBLE_ROWS} by default, with "הצג הכל (60)"; a list of 5 shows 5 and no button`,
    liCount(shown, 'sites') === 25 && liCount(shown, 'pages') === 5 && /הצג הכל \(60\)/.test(text(shown)) && !/הצג הכל \(5\)/.test(text(shown)), { sites: liCount(shown, 'sites') })
  check('H2: visibleRows: 25 by default, all of them on "show all"', visibleRows(rowsOf(60, (i) => i), false).length === 25 && visibleRows(rowsOf(60, (i) => i), true).length === 60)
  const visMut = await withMutant<any, number>('lib/site-links/gsc-import/snapshot.ts', [['export const DEFAULT_VISIBLE_ROWS = 25', 'export const DEFAULT_VISIBLE_ROWS = 1000']], (m) => m.visibleRows(rowsOf(60, (i) => i), false).length)
  check('H2-MUT: a default of 1000 rows → caught', visMut !== 25)
  const compSrc = strip(read('components/site-links/GscLinksImport.tsx'))
  check('H3: "show all" toggles with aria-expanded and goes through visibleRows (source)', /visibleRows\(rows, all\)/.test(compSrc) && /aria-expanded=\{all\}/.test(compSrc) && /setAll\(\(v\) => !v\)/.test(compSrc))
  const hText = text(shown)
  check('H4: Hebrew: the import date and "not auto-updated" are on the screen', hText.includes('עודכן לאחרונה מקובץ שייבאתם ב-1 באוקטובר 2026') && hText.includes('הרשימה לא מתעדכנת לבד. כדי לעדכן, ייבאו קובץ חדש.') && hText.includes('ייבוא קובץ חדש'), hText.slice(0, 400))
  const eText = text(view('en', { available: true, snapshot: snap }))
  check('H5: English: the same two facts', /Last updated from a file you imported on October 1, 2026/.test(eText) && eText.includes('The list does not update by itself. To update it, import a new file.'), eText.slice(0, 300))
  // The choose button's own `disabled` attribute (not the "disabled:" utility classes in its class list).
  const isDisabled = (html: string) => { const tag = (html.match(/<button[^>]*data-gsc-import="choose"[^>]*>/) ?? [''])[0]; return /\sdisabled(=|\s|>)/.test(tag) }
  const emptyHe = view('he', { available: true, snapshot: null })
  check('H6: with no snapshot: "ייבוא קובץ מ-Search Console", optional, three steps, a file input accepting .csv only, an enabled button, and a note that it does not update by itself',
    text(emptyHe).includes('ייבוא קובץ מ-Search Console') && text(emptyHe).includes('אופציונלי') && (emptyHe.match(/<li /g) ?? []).length === 3 && /accept="\.csv,text\/csv"/.test(emptyHe)
      && !isDisabled(emptyHe) && text(emptyHe).includes('לא מתעדכנת לבד'), text(emptyHe).slice(0, 300))
  const offHe = view('he', { available: false, snapshot: null })
  check('H7: without the table the import is shown switched off, with a quiet note, and no error', isDisabled(offHe) && text(offHe).includes('עוד לא זמין') && !/role="alert"/.test(offHe), offHe.slice(0, 200))
  const offMut = strip(read('components/site-links/GscLinksImport.tsx')).replace('disabled={!available} onClick', 'onClick')
  check('H7-MUT: the source guard for the switched-off button catches its removal', /disabled=\{!available\} onClick/.test(compSrc) && !/disabled=\{!available\} onClick/.test(offMut))
  const noteMut = await withMutant<any, boolean>('components/site-links/GscLinksImport.tsx', [['<span>{t.notAuto}</span>', '<span />']], async (m) => text(render('he', createElement(m.ImportView, { copy: heCopy, locale: 'he-IL', available: true, snapshot: snap }))).includes('הרשימה לא מתעדכנת לבד'))
  check('H8-MUT: removing the "does not update by itself" line from the screen → caught', noteMut === false)
  const dateMut = await withMutant<any, boolean>('components/site-links/GscLinksImport.tsx', [['{t.updatedFrom(formatDate(snapshot.importedAt, locale))}', '{t.snapshotBadge}']], async (m) => text(render('he', createElement(m.ImportView, { copy: heCopy, locale: 'he-IL', available: true, snapshot: snap }))).includes('עודכן לאחרונה מקובץ שייבאתם ב-'))
  check('H8-MUT2: removing the import date from the screen → caught', dateMut === false)
  const errHe = view('he', { available: true, snapshot: null, notice: { tone: 'bad', text: heCopy.gscLinks.import.errors.wrong_file } })
  check('H9: an error shows as an alert with the friendly sentence', /role="alert"/.test(errHe) && text(errHe).includes('זה לא נראה כמו קובץ הקישורים'))
  const onlyOwnApi = [...compSrc.matchAll(/\/api\/[^`'"\s]*/g)].every((m) => /^\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/site-links\/gsc-import$/.test(m[0]))
  check('H10: the component talks to its own route only', onlyOwnApi && !/\/api\/(?!projects)/.test(compSrc), [...compSrc.matchAll(/\/api\/[^`'"\s]*/g)].map((m) => m[0]))
  check('H11: the Search Console button stays; the import sits under it inside the same section',
    /<ExternalLink href=\{reportUrl\}/.test(strip(read('components/site-links/SearchConsoleLinks.tsx'))) && /<GscLinksImport projectId=\{projectId\} copy=\{copy\} \/>/.test(strip(read('components/site-links/SearchConsoleLinks.tsx'))))
  const g = dashboardHe.siteLinks.gscLinks.import, ge = dashboardEn.siteLinks.gscLinks.import
  check('H12: Hebrew copy is Hebrew, English copy has no Hebrew; three steps in each; the same keys',
    g.steps.length === 3 && ge.steps.length === 3 && !/[֐-׿]/.test(JSON.stringify(Object.values(ge).map((v: any) => (typeof v === 'function' ? v('x', 1) : v)))) && /[֐-׿]/.test(g.title)
      && JSON.stringify(Object.keys(g)) === JSON.stringify(Object.keys(ge)) && JSON.stringify(Object.keys(g.errors)) === JSON.stringify(Object.keys(ge.errors)))
  check('H13: no hand-made animation: only the shared Button/Notice motion (which the global prefers-reduced-motion rule covers)', !/animate-|transition-|@keyframes/.test(compSrc))

  // ── J. CSV only (wave 15) ─────────────────────────────────────────────────
  console.log('\nJ) CSV only: no zip, no Excel, nothing binary')
  const PARSE = 'lib/site-links/gsc-import/parse.ts'
  const parseSrc = strip(read(PARSE))
  const READER = /(xlsx|node:zlib|zlib)/.source
  const noArchiveReaders = (src: string) => !new RegExp(`from\\s+['"]${READER}['"]|import\\(\\s*['"]${READER}['"]\\s*\\)|require\\(\\s*['"]${READER}['"]\\s*\\)`).test(src)
    && !/inflateRaw|readZip|excelSheets|XLSX\./.test(src)
  check('J1: parse.ts and http.ts (comments stripped) import neither xlsx nor zlib, and have no zip or Excel reader', noArchiveReaders(parseSrc) && noArchiveReaders(strip(read('lib/site-links/gsc-import/http.ts'))))
  check('J1-MUT: the guard catches a zlib import, a dynamic xlsx import and a require of zlib',
    !noArchiveReaders(`import { inflateRawSync } from 'node:zlib'\n${parseSrc}`) && !noArchiveReaders(`${parseSrc}\nconst X = await import('xlsx')`) && !noArchiveReaders(`const z = require("zlib")\n${parseSrc}`))

  const pickerOk = (src: string) => { const tag = (src.match(/<input[\s\S]*?\/>/) ?? [''])[0]; return /accept="\.csv,text\/csv"/.test(tag) && !/zip|xlsx|\.xls|excel/i.test(tag) && /\smultiple[\s/>]/.test(tag) }
  check('J2: the file input accepts ".csv,text/csv" only (no zip/xlsx) and takes several files (source and render)', pickerOk(compSrc) && /accept="\.csv,text\/csv"/.test(emptyHe) && /<input[^>]*\smultiple=""/.test(emptyHe))
  check('J2-MUT: the guard catches zip/xlsx back in accept, and a missing `multiple`',
    !pickerOk(compSrc.replace('accept=".csv,text/csv"', 'accept=".zip,.csv,.xlsx"')) && !pickerOk(compSrc.replace('accept=".csv,text/csv"', 'accept=".csv,text/csv,.xlsx"')) && !pickerOk(compSrc.replace(/\n\s*multiple\n/, '\n')))

  // A real zip renamed .csv; and a "polyglot" stored zip whose entry is a readable CSV (the dangerous kind).
  const realZip = zip({ 'Top linking sites.csv': EN.sites, 'Latest links.csv': EN.latest })
  const polyglot = zip({ 'Top linking sites.csv': '\n' + EN.sites + '\n' }, { stored: true })
  check('J3: a real zip renamed .csv, and a stored zip whose entry is a readable CSV, are "wrong_file"',
    (await codeOf(one('links.csv', realZip))) === 'wrong_file' && (await codeOf(one('links.csv', polyglot))) === 'wrong_file')
  const mutZipIn = await withMutant<any, string>(PARSE, [['if (startsWithMagic(bytes)) return null', ''], ['if (bytes.includes(0)) return null', ''], ["new TextDecoder('utf-8', { fatal: true })", "new TextDecoder('utf-8')"]], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'links.csv', bytes: polyglot }]); return r.ok ? 'ok' : r.code })
  check('J3-MUT: without the binary checks the zip is read as data → caught', mutZipIn === 'ok', mutZipIn)

  const realXlsx = xlsx({ 'Top linking sites': [['Site', 'Linking pages', 'Target pages'], ['a.example.org', 5, 2]] })
  check('J4: an .xlsx (by name, or its bytes renamed .csv) is "wrong_file"; so is CSV text named .xlsx / .txt / .zip / .csv.exe',
    (await codeOf(one('links.xlsx', realXlsx))) === 'wrong_file' && (await codeOf(one('links.csv', realXlsx))) === 'wrong_file'
      && (await Promise.all(['links.xlsx', 'links.txt', 'links.zip', 'links.csv.exe', 'links'].map((n) => codeOf(one(n, bytes(EN.sites)))))).every((c) => c === 'wrong_file'))
  check('J4b: names are case-insensitive: "LINKS.CSV" is read', (await codeOf(one('LINKS.CSV', bytes(EN.sites)))) === 'ok')
  const mutName = await withMutant<any, string>(PARSE, [["if (!/\\.csv$/i.test(f.name.trim())) return { ok: false, code: 'wrong_file' }", '']], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'links.txt', bytes: bytes(EN.sites) }]); return r.ok ? 'ok' : r.code })
  check('J4-MUT: without the .csv name check a .txt is read → caught', mutName === 'ok', mutName)

  const withNul = bytes(EN.sites.replace('small.example.org', 'small.example.org\u0000'))
  const u16 = (t: string) => new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(t, 'utf16le')]))
  check('J5: a file with a NUL byte is "wrong_file" (UTF-8, and UTF-16 after its BOM); a clean UTF-16LE export is still read',
    (await codeOf(one('links.csv', withNul))) === 'wrong_file' && (await codeOf(one('links.csv', u16(EN.sites.replace('mid.co.il', 'mid\u0000.co.il'))))) === 'wrong_file'
      && (await okData('links.csv', u16(EN.sites)))?.linkingSites.length === 3)
  const mutNul = await withMutant<any, string>(PARSE, [['if (bytes.includes(0)) return null', '']], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'links.csv', bytes: withNul }]); return r.ok ? 'ok' : r.code })
  check('J5-MUT: without the NUL check → caught', mutNul === 'ok', mutNul)
  const mutNul16 = await withMutant<any, string>(PARSE, [["return t.includes('\\u0000') ? null : t", 'return t']], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'links.csv', bytes: u16(EN.sites.replace('mid.co.il', 'mid\u0000.co.il')) }]); return r.ok ? 'ok' : r.code })
  check('J5-MUT2: without the UTF-16 NUL check → caught', mutNul16 === 'ok', mutNul16)

  const ascii = ['PK', '%PDF-1.7', 'MZ', '\u007fELF', 'GIF89a']
  const magicCodes = await Promise.all(ascii.map((m) => codeOf(one('links.csv', bytes(`${m}\n${EN.sites}`)))))
  const binMagic = [[0xd0, 0xcf, 0x11, 0xe0], [0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff, 0xe0]]
  const binCodes = await Promise.all(binMagic.map((m) => codeOf(one('links.csv', new Uint8Array([...m, 0x0a, ...bytes(EN.sites)])))))
  check('J6: a file starting with a binary signature (zip, PDF, MZ, ELF, GIF, old .xls, PNG, JPEG) is "wrong_file", even with a CSV after it',
    [...magicCodes, ...binCodes].every((c) => c === 'wrong_file'), [...magicCodes, ...binCodes])
  const mutMagic = await withMutant<any, string[]>(PARSE, [['if (startsWithMagic(bytes)) return null', '']], async (m) => Promise.all(ascii.map(async (x) => { const r = await m.parseLinksExportFiles([{ name: 'links.csv', bytes: bytes(`${x}\n${EN.sites}`) }]); return r.ok ? 'ok' : r.code })))
  check('J6-MUT: without the signature check those files are read → caught', mutMagic.every((c) => c === 'ok'), mutMagic)

  const badUtf8 = new Uint8Array([...bytes('Site,Linking pages,Target pages\nsmall.example.org,3,1\nbad'), 0xc3, 0x28, ...bytes('.example.org,2,1\n')])
  check('J7: bytes that are not valid UTF-8 text are "wrong_file"', (await codeOf(one('links.csv', badUtf8))) === 'wrong_file')
  const mutUtf8 = await withMutant<any, string>(PARSE, [["new TextDecoder('utf-8', { fatal: true })", "new TextDecoder('utf-8')"]], async (m) => { const r = await m.parseLinksExportFiles([{ name: 'links.csv', bytes: badUtf8 }]); return r.ok ? 'ok' : r.code })
  check('J7-MUT: a lenient decoder → caught', mutUtf8 === 'ok', mutUtf8)

  const mixedBad = [...csvsEn(), { name: 'Chart.csv', bytes: realZip }]
  check('J8: ONE rejected file rejects the whole import ("wrong_file"), in the parser',
    (await codeOf(parseLinksExportFiles(mixedBad))) === 'wrong_file' && (await codeOf(parseLinksExportFiles([...csvsEn(), { name: 'notes.txt', bytes: bytes('hello') }]))) === 'wrong_file')
  const dbBad = mkDb(); const beforeBad = JSON.stringify(dbBad.tables)
  const rBad = await handleGscImportPost(P_OWN, uploadMany(mixedBad), deps(OWNER, dbBad))
  check('J8b: ... and over HTTP: 422 {"ok":false,"code":"wrong_file"}, nothing stored', rBad.status === 422 && JSON.stringify(await rBad.json()) === '{"ok":false,"code":"wrong_file"}' && JSON.stringify(dbBad.tables) === beforeBad)
  const mutOneBad = await withMutant<any, string>(PARSE, [["if (text === null) return { ok: false, code: 'wrong_file' }", 'if (text === null) continue']], async (m) => { const r = await m.parseLinksExportFiles(mixedBad); return r.ok ? 'ok' : r.code })
  check('J8-MUT: skipping the bad file instead of rejecting the import → caught', mutOneBad === 'ok', mutOneBad)

  const extra = filesOf({ 'Top linking text.csv': 'Linking text,Count\nbuy now,5\n', 'Chart.csv': 'Date,Links\n2026-09-01,5\n', 'Table.csv': 'a,b\n1,2\n' })
  const six = [...csvsEn(), ...extra]
  const dbSix = mkDb(); const beforeSix = JSON.stringify(dbSix.tables)
  const rSix = await handleGscImportPost(P_OWN, uploadMany(six), deps(OWNER, dbSix))
  const rFive = await handleGscImportPost(P_OWN, uploadMany(six.slice(0, MAX_IMPORT_FILES)), deps(OWNER, mkDb()))
  check(`J9: ${six.length} files are 422 "too_many_files" (nothing stored); ${MAX_IMPORT_FILES} files are fine`,
    MAX_IMPORT_FILES === 5 && rSix.status === 422 && (await rSix.json() as any).code === 'too_many_files' && JSON.stringify(dbSix.tables) === beforeSix && rFive.status === 200)
  const mutSix = await withMutant<any, number>('lib/site-links/gsc-import/http.ts', [["if (uploads.length > MAX_IMPORT_FILES) return refuse(422, 'too_many_files')", '']], async (m) => (await m.handleGscImportPost(P_OWN, uploadMany(six), deps(OWNER, mkDb()))).status)
  check('J9-MUT: without the file-count cap 6 files are imported → caught', mutSix === 200, mutSix)

  const half = Math.floor(MAX_UPLOAD_BYTES * 0.55)
  const pad = (headerLine: string, row: (i: number) => string) => { let out = headerLine; for (let i = 0; out.length < half; i++) out += row(i); return out }
  const bigA = pad('Site,Linking pages,Target pages\n', (i) => `s${i}.example.org,1,1\n`), bigB = pad('Target page,Incoming links,Linking sites\n', (i) => `https://p.example/${i},1,1\n`)
  const twoBig = filesOf({ 'Top linking sites.csv': bigA, 'Top linked pages.csv': bigB })
  const rTotal = await handleGscImportPost(P_OWN, uploadMany(twoBig), deps(OWNER, mkDb()))
  check('J10: two files each under 4MB but over 4MB together are 413 "too_big"', bigA.length < MAX_UPLOAD_BYTES && bigA.length + bigB.length > MAX_UPLOAD_BYTES && rTotal.status === 413 && (await rTotal.json() as any).code === 'too_big')
  const mutTotal = await withMutant<any, number>('lib/site-links/gsc-import/http.ts', [["if (declaredTotal > MAX_UPLOAD_BYTES) return refuse(413, 'too_big')", ''], ['|| total > MAX_UPLOAD_BYTES', '']], async (m) => (await m.handleGscImportPost(P_OWN, uploadMany(twoBig), deps(OWNER, mkDb()))).status)
  check('J10-MUT: without the total cap → caught', mutTotal === 200, mutTotal)

  // From an uploaded CSV to the screen: script URLs are never links, formulas are never formulas.
  const nasty = 'Target page,Incoming links,Linking sites\njavascript:alert(1),9,1\n"data:text/html,<script>alert(1)</script>",8,1\n"=HYPERLINK(""http://evil.example"",""x"")",7,1\n+cmd,6,1\n-2+3,5,1\n@SUM(A1),4,1\nhttps://plumber.example/ok,3,1\n'
  const parsedNasty = await okData('Top linked pages.csv', bytes(nasty))
  const { SnapshotLists } = require('../../../../components/site-links/GscLinksImport')
  const screen = (mod: any, sn: GscImportSnapshot) => render('he', createElement(mod, { snapshot: sn, copy: heCopy, locale: 'he-IL' }))
  const asSnap = (d: any): GscImportSnapshot => ({ importedAt: '2026-10-02T09:00:00.000Z', fileName: 'x.csv', ...d })
  const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1])
  const cells = (html: string) => [...html.matchAll(/<bdi[^>]*>([^<]*)<\/bdi>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&#x27;/g, '\''))
  const nastyHtml = parsedNasty ? screen(SnapshotLists, asSnap(parsedNasty)) : ''
  check('J11: an imported javascript: / data: cell is never an <a>; only the https page is a link (nofollow noopener noreferrer)',
    !!parsedNasty && JSON.stringify(hrefs(nastyHtml)) === '["https://plumber.example/ok"]' && /rel="nofollow noopener noreferrer"/.test(nastyHtml), hrefs(nastyHtml))
  check('J12: an imported cell starting with = + - @ is drawn as plain text without that character', !!parsedNasty && cells(nastyHtml).length === 7 && cells(nastyHtml).every((c) => !/^[=+\-@]/.test(c)), cells(nastyHtml))
  const rawForeign = asSnap({ linkingSites: [], latestLinks: [], targetPages: [{ page: 'javascript:alert(1)', incomingLinks: 1, linkingSites: 1 }, { page: '=HYPERLINK("http://evil.example")', incomingLinks: 1, linkingSites: 1 }], totals: { linkingSites: 0, targetPages: 2, latestLinks: 0 } })
  const mutLink = await withMutant<any, string[]>('components/site-links/GscLinksImport.tsx', [['const href = importedHref(text)', 'const href = text']], (m) => hrefs(screen(m.SnapshotLists, rawForeign)))
  check('J11-MUT: an href taken from the cell as-is puts javascript: in an <a> → caught', mutLink.some((h) => /^javascript:/i.test(h)), mutLink)
  const mutFormula = await withMutant<any, string[]>('components/site-links/GscLinksImport.tsx', [['const text = cleanCell(value, 2048)', 'const text = value']], (m) => cells(screen(m.SnapshotLists, rawForeign)))
  check('J12-MUT: drawing the cell without cleanCell shows "=HYPERLINK" → caught', mutFormula.some((c) => /^=/.test(c)), mutFormula)

  const copyText = (c: any) => JSON.stringify(Object.values(c).map((v: any) => (typeof v === 'function' ? v('x', 1) : v)))
  const noArchiveWords = (c: any) => !/zip|xlsx|\.xls|excel|אקסל/i.test(copyText(c))
  check('J13: the import copy (he + en) mentions CSV only: no zip / xlsx / Excel; the formats line and the wrong-file message say CSV',
    noArchiveWords(g) && noArchiveWords(ge) && g.formats === 'קובצי CSV בלבד, עד 4MB' && ge.formats === 'CSV files only, up to 4MB' && /CSV/.test(g.errors.wrong_file) && /CSV/.test(ge.errors.wrong_file)
      && /עד 5/.test(g.errors.too_many_files) && /up to 5/.test(ge.errors.too_many_files) && g.steps.some((x: string) => /כמה קבצים יחד/.test(x)) && ge.steps.some((x: string) => /several at once/.test(x)))
  check('J13-MUT: the guard catches "zip" or "Excel" back in the copy', !noArchiveWords({ ...g, formats: 'קובץ zip, csv או xlsx, עד 4MB' }) && !noArchiveWords({ ...ge, steps: ['Download the file (CSV or Excel).'] }))
  const compFull = strip(read('components/site-links/GscLinksImport.tsx'))
  check('J14: the screen sends every chosen file in ONE request (form.append per file) and checks count and total size first',
    /for \(const f of files\) form\.append\('file', f\)/.test(compFull) && /files\.length > MAX_IMPORT_FILES/.test(compFull) && /files\.reduce\(\(n, f\) => n \+ f\.size, 0\) > MAX_UPLOAD_BYTES/.test(compFull))
  check('J14-MUT: sending only the first file is caught by the same check', !/for \(const f of files\) form\.append\('file', f\)/.test(compFull.replace("for (const f of files) form.append('file', f)", "form.set('file', files[0])")))

  // ── K. no crawling ────────────────────────────────────────────────────────
  console.log('\nK) no crawling: noindex metadata on the signed-in area, X-Robots-Tag on the route')
  const LAYOUT = 'app/(dashboard)/layout.tsx'
  const robotsOk = (src: string) => /import type \{ Metadata \} from 'next'/.test(src)
    && /export const metadata: Metadata = \{\s*robots: \{\s*index: false,\s*follow: false,\s*nocache: true,\s*googleBot: \{\s*index: false,\s*follow: false\s*\}\s*,?\s*\}\s*,?\s*\}/.test(src)
  const layoutSrc = strip(read(LAYOUT))
  check('K1: app/(dashboard)/layout.tsx exports metadata.robots = noindex, nofollow, nocache, googleBot noindex/nofollow (comments stripped)', robotsOk(layoutSrc))
  check('K1-MUT: the guard catches index: true, follow: true, a missing nocache, a missing googleBot, and a commented-out export',
    !robotsOk(layoutSrc.replace('index: false', 'index: true')) && !robotsOk(layoutSrc.replace('follow: false', 'follow: true')) && !robotsOk(layoutSrc.replace('nocache: true, ', ''))
      && !robotsOk(layoutSrc.replace(/googleBot: \{[^}]*\} ?/, '')) && !robotsOk(strip(read(LAYOUT).replace('export const metadata', '// export const metadata'))))
  const walk = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((n) => { const rel = `${dir}/${n}`; return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : /\.(tsx?|jsx?)$/.test(n) ? [rel] : [] })
  const overrides = (files: { rel: string; src: string }[]) => files.filter((f) => f.rel !== LAYOUT && /\brobots\s*:/.test(f.src)).map((f) => f.rel)
  const dashFiles = walk('app/(dashboard)').map((rel) => ({ rel, src: strip(read(rel)) }))
  check('K2: no page or layout under app/(dashboard) sets its own robots (nothing overrides the noindex)', overrides(dashFiles).length === 0, overrides(dashFiles))
  check('K2-MUT: a page that sets robots: { index: true } is caught', overrides([...dashFiles, { rel: 'app/(dashboard)/x/page.tsx', src: "export const metadata = { robots: { index: true } }" }]).length === 1)

  const robotsHeader = (r: Response) => r.headers.get('x-robots-tag')
  const dbK = mkDb()
  const kPost = await handleGscImportPost(P_OWN, uploadMany(csvsEn()), deps(OWNER, dbK))
  const kGet = await handleGscImportGet(P_OWN, deps(OWNER, dbK))
  const kRefused = [await handleGscImportGet(P_OWN, deps(null, mkDb())), await handleGscImportPost(P_OWN, upload('x.txt', 'hello'), deps(OWNER, mkDb()))]
  check('K3: GET and POST answers (and the refusals) send X-Robots-Tag: noindex, nofollow, with Cache-Control: no-store',
    kPost.status === 200 && kGet.status === 200 && [kPost, kGet, ...kRefused].every((r) => robotsHeader(r) === 'noindex, nofollow' && r.headers.get('cache-control') === 'no-store'), [kPost, kGet, ...kRefused].map((r) => [r.status, robotsHeader(r)]))
  const mutRobots = await withMutant<any, (string | null)[]>('lib/site-links/gsc-import/http.ts', [[", 'x-robots-tag': 'noindex, nofollow'", '']], async (m) => { const d = mkDb(); return [robotsHeader(await m.handleGscImportPost(P_OWN, uploadMany(csvsEn()), deps(OWNER, d))), robotsHeader(await m.handleGscImportGet(P_OWN, deps(OWNER, d)))] })
  check('K3-MUT: without the header → caught', mutRobots.every((h) => h !== 'noindex, nofollow'), mutRobots)
  check('K4: the rendered links stay as they were: target _blank, rel="nofollow noopener noreferrer" (source)', /target="_blank"\s+rel="nofollow noopener noreferrer"/.test(compSrc))
  check('K4-MUT: dropping nofollow from the link is caught', !/target="_blank"\s+rel="nofollow noopener noreferrer"/.test(compSrc.replace('rel="nofollow noopener noreferrer"', 'rel="noopener noreferrer"')))

  // ── I. the migration ──────────────────────────────────────────────────────
  console.log('\nI) the migration')
  const mig = 'supabase/migrations/20261002000000_site_links_gsc_imports.sql'
  check('I1: the migration and its probe exist', existsSync(join(ROOT, mig)) && existsSync(join(ROOT, 'supabase/migrations/__qa__/site-links-gsc-imports.probe.sql')))
  const sql = read(mig)
  check('I2: additive and idempotent, RLS on, nothing granted to anon, owner policy', /CREATE TABLE IF NOT EXISTS public\.site_links_gsc_imports/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON TABLE public\.site_links_gsc_imports FROM PUBLIC, anon, authenticated/.test(sql)
    && !/GRANT[^;]*\banon\b[^;]*;/.test(sql.replace(/REVOKE[^;]*;/g, '')) && /user_id = auth\.uid\(\)/.test(sql) && !/DROP TABLE(?! IF EXISTS public\.site_links_gsc_imports;)/.test(sql.replace(/--.*$/gm, '')) && !/ALTER TABLE public\.(?!site_links_gsc_imports)/.test(sql.replace(/--.*$/gm, '')))
  check('I3: the code never applies a migration (no exec/apply in the import code)', !/apply_migration|execute_sql|CREATE TABLE/i.test(['lib/site-links/gsc-import/http.ts', 'lib/site-links/gsc-import/parse.ts', 'lib/site-links/gsc-import/snapshot.ts', 'components/site-links/GscLinksImport.tsx'].map((f) => strip(read(f))).join('\n')))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
void main()
export {}
