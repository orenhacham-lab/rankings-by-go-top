import * as XLSX from 'xlsx'
import { ScanResult, TrackingTarget, Project, Client } from '@/lib/supabase/types'
import { getEngineLabel } from '@/lib/utils'

interface ExportData {
  client: Client
  project: Project
  targets: TrackingTarget[]
  latestResults: Record<string, ScanResult>
  allHistory: ScanResult[]
}

/** Strip characters that are invalid in filenames on Windows/Mac */
function safeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 80)
}

/** Apply RTL view, freeze header row, and autofit columns to a sheet */
function applySheetDefaults(ws: XLSX.WorkSheet, frozenRows = 1): void {
  // RTL direction for Hebrew content
  ws['!views'] = [{ rightToLeft: true }]
  // Freeze the header row
  ws['!freeze'] = { xSplit: 0, ySplit: frozenRows }
}

export function exportToExcel(data: ExportData): void {
  const wb = XLSX.utils.book_new()

  const foundCount = Object.values(data.latestResults).filter((r) => r.found).length
  const totalCount = data.targets.length
  const notFoundCount = totalCount - foundCount
  const coverage = totalCount > 0 ? `${Math.round((foundCount / totalCount) * 100)}%` : '0%'
  const generatedAt = new Date().toLocaleDateString('he-IL')

  // ── Sheet 1: Summary ──────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    ['Rankings by Go Top — דוח דירוגים'],
    [],
    ['לקוח', data.client.name],
    ['פרויקט', data.project.name],
    ['דומיין', data.project.target_domain],
    ['תאריך הפקה', generatedAt],
    [],
    ['— סיכום —'],
    ['סה"כ ביטויים', totalCount],
    ['ביטויים שנמצאו', foundCount],
    ['ביטויים שלא נמצאו', notFoundCount],
    ['כיסוי', coverage],
  ]

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 45 }]
  applySheetDefaults(wsSummary, 0)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום')

  // ── Sheet 2: Current Rankings ────────────────────────────────────
  const rankingHeaders = [
    'מילת מפתח',
    'מנוע חיפוש',
    'מיקום נוכחי',
    'מיקום קודם',
    'שינוי',
    'נמצא',
    'תאריך בדיקה',
    'URL תוצאה',
    'כותרת / כתובת',
    'הערות',
  ]

  const rankingRows = data.targets.map((target) => {
    const result = data.latestResults[target.id]

    let changeDisplay = ''
    if (result?.change_value != null) {
      changeDisplay = result.change_value > 0
        ? `+${result.change_value}`
        : String(result.change_value)
    }

    return [
      target.keyword,
      getEngineLabel(target.engine_type),
      result?.found ? result.position ?? '' : '',
      result?.previous_position ?? '',
      changeDisplay,
      result ? (result.found ? 'כן' : 'לא') : '',
      result?.checked_at ? new Date(result.checked_at).toLocaleDateString('he-IL') : '',
      result?.result_url ?? '',
      result?.result_title || result?.result_address || '',
      target.notes ?? '',
    ]
  })

  const wsRankings = XLSX.utils.aoa_to_sheet([rankingHeaders, ...rankingRows])
  wsRankings['!cols'] = [
    { wch: 32 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 9 },
    { wch: 8 },  { wch: 15 }, { wch: 52 }, { wch: 42 }, { wch: 32 },
  ]
  applySheetDefaults(wsRankings, 1)
  XLSX.utils.book_append_sheet(wb, wsRankings, 'דירוגים נוכחיים')

  // ── Sheet 3: Full History ─────────────────────────────────────────
  const historyHeaders = [
    'מילת מפתח', 'מנוע', 'מיקום', 'מיקום קודם', 'שינוי',
    'נמצא', 'תאריך', 'URL', 'כותרת / כתובת',
  ]

  const historyRows = data.allHistory.map((result) => {
    const target = data.targets.find((t) => t.id === result.tracking_target_id)

    let changeDisplay = ''
    if (result.change_value != null) {
      changeDisplay = result.change_value > 0
        ? `+${result.change_value}`
        : String(result.change_value)
    }

    return [
      target?.keyword ?? result.keyword,
      getEngineLabel(result.engine_type),
      result.found ? result.position ?? '' : '',
      result.previous_position ?? '',
      changeDisplay,
      result.found ? 'כן' : 'לא',
      new Date(result.checked_at).toLocaleDateString('he-IL'),
      result.result_url ?? '',
      result.result_title || result.result_address || '',
    ]
  })

  const wsHistory = XLSX.utils.aoa_to_sheet([historyHeaders, ...historyRows])
  wsHistory['!cols'] = [
    { wch: 32 }, { wch: 16 }, { wch: 10 }, { wch: 13 }, { wch: 9 },
    { wch: 8 },  { wch: 15 }, { wch: 52 }, { wch: 42 },
  ]
  applySheetDefaults(wsHistory, 1)
  XLSX.utils.book_append_sheet(wb, wsHistory, 'היסטוריה מלאה')

  // ── Download ──────────────────────────────────────────────────────
  const filename = `rankings_${safeFilename(data.project.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
