/**
 * The bytes of the Search Console report's workbook.
 *
 * Its own module, and deliberately not lib/export/excel.ts: that file is the
 * live rank report's and runs in the browser (XLSX.writeFile triggers the
 * download). This one runs on the server and returns bytes, because the report
 * is read from the database by an API route. Nothing here is imported by the
 * rank report, so that report cannot change because of this one.
 *
 * A sheet name is capped at 31 characters by the file format itself and may not
 * carry : \ / ? * [ ] — a name that breaks either rule makes the whole workbook
 * unopenable, so the names are sanitised rather than trusted.
 */
import * as XLSX from 'xlsx'
import type { ExportSheet } from './sheets'

/** Excel's own limit; a longer name is rejected by the writer. */
export const MAX_SHEET_NAME = 31

export function safeSheetName(name: string, fallback: string): string {
  const cleaned = String(name ?? '').replace(/[:\\/?*[\]]/g, ' ').trim()
  const base = cleaned || fallback
  return base.slice(0, MAX_SHEET_NAME)
}

/** Rows in, workbook bytes out. Pure apart from the writer itself. */
export function sheetsToXlsx(sheets: ExportSheet[]): Uint8Array {
  const wb = XLSX.utils.book_new()
  sheets.forEach((sheet, i) => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows as unknown[][])
    const widths = (sheet.rows[0] ?? []).map((_, col) => ({
      wch: Math.min(60, Math.max(12, ...sheet.rows.slice(0, 200).map((r) => String(r[col] ?? '').length + 2))),
    }))
    if (widths.length > 0) ws['!cols'] = widths
    ws['!freeze'] = { xSplit: '0', ySplit: '1' }
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheet.name, `Sheet${i + 1}`))
  })
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new Uint8Array(out)
}
