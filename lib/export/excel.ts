import * as XLSX from 'xlsx'
import { ScanResult, TrackingTarget, Project, Client } from '@/lib/supabase/types'
import { getDeviceLabel, getSearchTypeLabel } from '@/lib/utils'
import { sortTargetsByPosition } from '@/lib/sorting'
import { ExportLanguage, getExportLabels, normalizeExportLanguage } from './i18n'

interface ExportData {
  client: Client
  project: Project
  targets: TrackingTarget[]
  latestResults: Record<string, ScanResult>
  allHistory: ScanResult[]
  language?: ExportLanguage
}

/** Strip characters that are invalid in filenames on Windows/Mac */
function safeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 80)
}

/** Apply RTL view for Hebrew exports, freeze header row */
function applySheetDefaults(ws: XLSX.WorkSheet, frozenRows = 1, isRtl = true): void {
  ws['!freeze'] = { xSplit: 0, ySplit: frozenRows }

  if (isRtl) {
    ws['!views'] = [{ rightToLeft: true }]
  }
}

export function exportToExcel(data: ExportData): void {
  const language = normalizeExportLanguage(data.language)
  const L = getExportLabels(language)
  const isRtl = language === 'he'
  const dateLocale = isRtl ? 'he-IL' : 'en-US'

  const wb = XLSX.utils.book_new()

  const foundCount = Object.values(data.latestResults).filter((r) => r.found).length
  const totalCount = data.targets.length
  const notFoundCount = totalCount - foundCount
  const coverage = totalCount > 0 ? `${Math.round((foundCount / totalCount) * 100)}%` : '0%'
  const generatedAt = new Date().toLocaleDateString(dateLocale)
  const primaryEngine = data.targets[0]?.engine_type || 'google_search'

  // ── Sheet 1: Summary ──────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    [L.excelTitle],
    [],
    [L.client, data.client.name],
    [L.project, data.project.name],
    [L.domain, data.project.target_domain],
    [L.generationDate, generatedAt],
    ['engine', getSearchTypeLabel(primaryEngine, data.project.device_type)],
    ['device', getDeviceLabel(data.project.device_type)],
    ['gl', data.project.country.toLowerCase()],
    ['hl', data.project.language],
    ['location', data.project.city || '—'],
    [],
    [L.summaryLine],
    [L.totalKeywords, totalCount],
    [L.keywordsFound, foundCount],
    [L.keywordsNotFound, notFoundCount],
    [L.coverage, coverage],
  ]

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 45 }]
  applySheetDefaults(wsSummary, 0, isRtl)
  XLSX.utils.book_append_sheet(wb, wsSummary, L.sheetSummary)

  // ── Sheet 2: Current Rankings ────────────────────────────────────
  const rankingHeaders = [
    L.keyword,
    L.engineSearch,
    L.position,
    L.previousPosition,
    L.change,
    L.found,
    L.checkDate,
    L.resultUrl,
    L.titleOrAddress,
    L.notes,
  ]

  const sortedTargets = sortTargetsByPosition(data.targets, data.latestResults)
  const rankingRows = sortedTargets.map((target) => {
    const result = data.latestResults[target.id]

    let changeDisplay = ''
    if (result?.change_value != null) {
      changeDisplay = result.change_value > 0
        ? `+${result.change_value}`
        : String(result.change_value)
    }

    return [
      target.keyword,
      getSearchTypeLabel(target.engine_type, data.project.device_type),
      result?.found ? result.position ?? '' : '',
      result?.previous_position ?? '',
      changeDisplay,
      result ? (result.found ? L.yes : L.no) : '',
      result?.checked_at ? new Date(result.checked_at).toLocaleDateString(dateLocale) : '',
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
  applySheetDefaults(wsRankings, 1, isRtl)
  XLSX.utils.book_append_sheet(wb, wsRankings, L.sheetCurrentRankings)

  // ── Sheet 3: Full History ─────────────────────────────────────────
  const historyHeaders = [
    L.keyword, L.engine, L.position, L.previousPosition, L.change,
    L.found, L.date, 'URL', L.titleOrAddress,
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
      getSearchTypeLabel(result.engine_type, data.project.device_type),
      result.found ? result.position ?? '' : '',
      result.previous_position ?? '',
      changeDisplay,
      result.found ? L.yes : L.no,
      new Date(result.checked_at).toLocaleDateString(dateLocale),
      result.result_url ?? '',
      result.result_title || result.result_address || '',
    ]
  })

  const wsHistory = XLSX.utils.aoa_to_sheet([historyHeaders, ...historyRows])
  wsHistory['!cols'] = [
    { wch: 32 }, { wch: 16 }, { wch: 10 }, { wch: 13 }, { wch: 9 },
    { wch: 8 },  { wch: 15 }, { wch: 52 }, { wch: 42 },
  ]
  applySheetDefaults(wsHistory, 1, isRtl)
  XLSX.utils.book_append_sheet(wb, wsHistory, L.sheetFullHistory)

  // ── Download ──────────────────────────────────────────────────────
  const filename = `rankings_${safeFilename(data.project.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
