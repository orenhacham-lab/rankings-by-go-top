import * as XLSX from 'xlsx'
import { ScanResult, TrackingTarget, Project, Client } from '@/lib/supabase/types'
import { getDeviceLabel, getSearchTypeLabel } from '@/lib/utils'
import { sortTargetsByPosition } from '@/lib/sorting'
import { ExportLanguage, getExportLabels, normalizeExportLanguage } from './i18n'
import { getEstimatedCtrByPosition, getEstimatedOrganicClicks } from './traffic-estimate'

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
    L.searchVolume,
    L.engineSearch,
    L.position,
    L.previousPosition,
    L.change,
    L.found,
    L.estimatedCtr,
    L.estimatedOrganicClicks,
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

    const positionForTraffic = result?.found ? result.position : null
    const estimatedCtrValue = getEstimatedCtrByPosition(positionForTraffic)
    const estimatedClicksValue = getEstimatedOrganicClicks(target.avg_monthly_searches, positionForTraffic)

    return [
      target.keyword,
      target.avg_monthly_searches ?? null,
      getSearchTypeLabel(target.engine_type, data.project.device_type),
      result?.found ? result.position ?? '' : '',
      result?.previous_position ?? '',
      changeDisplay,
      result ? (result.found ? L.yes : L.no) : '',
      estimatedCtrValue,
      estimatedClicksValue,
      result?.checked_at ? new Date(result.checked_at).toLocaleDateString(dateLocale) : '',
      result?.result_url ?? '',
      result?.result_title || result?.result_address || '',
      target.notes ?? '',
    ]
  })

  const wsRankings = XLSX.utils.aoa_to_sheet([rankingHeaders, ...rankingRows])
  wsRankings['!cols'] = [
    { wch: 32 }, { wch: 12 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 9 },
    { wch: 8 },  { wch: 13 }, { wch: 20 }, { wch: 15 }, { wch: 52 }, { wch: 42 }, { wch: 32 },
  ]
  // Apply number format to search volume column (column B, rows 2+)
  for (let i = 2; i <= rankingRows.length + 1; i++) {
    const cellRef = XLSX.utils.encode_col(1) + String(i)
    if (wsRankings[cellRef]) {
      wsRankings[cellRef].z = '#,##0'
    }
  }
  // Apply percent format to estimated CTR column (column H, rows 2+)
  for (let i = 2; i <= rankingRows.length + 1; i++) {
    const cellRef = XLSX.utils.encode_col(7) + String(i)
    if (wsRankings[cellRef]) {
      wsRankings[cellRef].z = '0.00%'
    }
  }
  // Apply number format to estimated clicks column (column I, rows 2+)
  for (let i = 2; i <= rankingRows.length + 1; i++) {
    const cellRef = XLSX.utils.encode_col(8) + String(i)
    if (wsRankings[cellRef]) {
      wsRankings[cellRef].z = '#,##0'
    }
  }
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

interface AIEngineBreakdown {
  scans: number
  mentions: number
  cited: number
}

interface AIExportSummary {
  totalScans: number
  totalResults: number
  mentionedCount: number
  citedCount: number
  totalCitations: number
  mentionRate: number
  citationRate: number
  engineBreakdown: Record<string, AIEngineBreakdown>
}

interface AIExportResult {
  prompt_text?: string | null
  promptText?: string | null
  engine: string
  mentioned: boolean
  target_cited: boolean
  citation_count: number
  created_at: string
  response_text?: string | null
  citations?: Array<{ url?: string | null } | string> | null
}

interface AIExportData {
  client: Client
  project: Project
  summary: AIExportSummary
  results: AIExportResult[]
  language?: ExportLanguage
}

const ENGINE_DISPLAY: Record<string, string> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
  copilot: 'Copilot',
  grok: 'Grok',
  google_ai_mode: 'Google AI',
}

function formatEngine(engine: string): string {
  return ENGINE_DISPLAY[engine] || engine
}

function extractCitations(result: AIExportResult): string {
  if (!result.citations || !Array.isArray(result.citations)) return ''
  const urls: string[] = []
  for (const c of result.citations) {
    if (typeof c === 'string') urls.push(c)
    else if (c && typeof c === 'object' && c.url) urls.push(c.url)
  }
  return urls.slice(0, 5).join('\n')
}

export function exportAIVisibilityToExcel(data: AIExportData): void {
  const language = normalizeExportLanguage(data.language)
  const L = getExportLabels(language)
  const isRtl = language === 'he'
  const dateLocale = isRtl ? 'he-IL' : 'en-US'
  const generatedAt = new Date().toLocaleDateString(dateLocale)

  const wb = XLSX.utils.book_new()

  const activeEngines = Object.keys(data.summary.engineBreakdown).filter(
    (e) => data.summary.engineBreakdown[e].scans > 0,
  )
  const overallVisibility = data.summary.totalResults > 0
    ? Math.round(((data.summary.mentionedCount + data.summary.citedCount) / (data.summary.totalResults * 2)) * 100)
    : 0

  // ── Sheet 1: Summary ──────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    [L.aiVisibilityReport],
    [],
    [L.project, data.project.name],
    [L.client, data.client?.name || ''],
    [L.domain, data.project.target_domain],
    [L.generationDate, generatedAt],
    [],
    [L.summaryLine],
    [L.aiScans, data.summary.totalScans],
    [L.aiQueries, data.summary.totalResults],
    [L.mentions, data.summary.mentionedCount],
    [L.mentionRate, `${Math.round(data.summary.mentionRate)}%`],
    [L.domainCited, data.summary.citedCount],
    [L.totalCitations, data.summary.totalCitations],
    [L.citationRate, `${Math.round(data.summary.citationRate)}%`],
    [language === 'he' ? 'מנועים פעילים' : 'Active engines', activeEngines.length],
    [L.overallVisibility, `${overallVisibility}%`],
  ]

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 45 }]
  applySheetDefaults(wsSummary, 0, isRtl)
  XLSX.utils.book_append_sheet(wb, wsSummary, L.sheetSummary)

  // ── Sheet 2: Engine Performance ──────────────────────────────────
  const engineHeaders = [
    L.engine,
    L.engineScans,
    L.engineMentions,
    L.engineCitations,
    L.mentionRate,
    L.citationRate,
  ]

  const engineRows = activeEngines.map((engine) => {
    const b = data.summary.engineBreakdown[engine]
    const mRate = b.scans > 0 ? `${Math.round((b.mentions / b.scans) * 100)}%` : '0%'
    const cRate = b.scans > 0 ? `${Math.round((b.cited / b.scans) * 100)}%` : '0%'
    return [formatEngine(engine), b.scans, b.mentions, b.cited, mRate, cRate]
  })

  const wsEngines = XLSX.utils.aoa_to_sheet([engineHeaders, ...engineRows])
  wsEngines['!cols'] = [
    { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
  ]
  applySheetDefaults(wsEngines, 1, isRtl)
  XLSX.utils.book_append_sheet(wb, wsEngines, L.performanceByEngine)

  // ── Sheet 3: AI Query Results ────────────────────────────────────
  const resultHeaders = [
    L.query,
    L.engine,
    L.mentioned,
    L.domainCited,
    L.citations,
    L.date,
    language === 'he' ? 'תגובה' : 'Response',
    language === 'he' ? 'מקורות (URL)' : 'Source URLs',
  ]

  const resultRows = data.results.map((r) => [
    r.prompt_text || r.promptText || '',
    formatEngine(r.engine),
    r.mentioned ? L.yes : L.no,
    r.target_cited ? L.yes : L.no,
    r.citation_count || 0,
    r.created_at ? new Date(r.created_at).toLocaleDateString(dateLocale) : '',
    r.response_text || '',
    extractCitations(r),
  ])

  const wsResults = XLSX.utils.aoa_to_sheet([resultHeaders, ...resultRows])
  wsResults['!cols'] = [
    { wch: 48 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 60 }, { wch: 60 },
  ]
  applySheetDefaults(wsResults, 1, isRtl)
  XLSX.utils.book_append_sheet(wb, wsResults, L.aiQueryResults)

  // ── Download ──────────────────────────────────────────────────────
  const filename = `ai-visibility-report-${safeFilename(data.project.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
