import { ScanResult, TrackingTarget, Project, Client } from '@/lib/supabase/types'
import { getEngineDisplayLabel } from '@/lib/utils'
import { sortTargetsByPosition } from '@/lib/sorting'
import { ExportLanguage, getExportLabels, normalizeExportLanguage } from './i18n'
import { getEstimatedOrganicClicks } from './traffic-estimate'

interface ExportData {
  client: Client
  project: Project
  targets: TrackingTarget[]
  latestResults: Record<string, ScanResult>
  language?: ExportLanguage
}

interface AIExportData {
  client: Client
  project: Project
  summary: {
    totalScans: number
    totalResults: number
    mentionedCount: number
    citedCount: number
    totalCitations: number
    mentionRate: number
    citationRate: number
    engineBreakdown: Record<string, { scans: number; mentions: number; cited: number }>
  }
  results: Array<{
    id: string
    engine: string
    promptText: string
    mentioned: boolean
    target_cited: boolean
    citation_count: number
    created_at: string
  }>
  language?: ExportLanguage
}

function generateReportHTML(data: ExportData): string {
  const language = normalizeExportLanguage(data.language)
  const L = getExportLabels(language)
  const isRtl = language === 'he'
  const dateLocale = isRtl ? 'he-IL' : 'en-US'
  const now = new Date().toLocaleDateString(dateLocale)

  const found = data.targets.filter((t) => data.latestResults[t.id]?.found).length
  const notFound = data.targets.length - found
  const total = data.targets.length
  const coverage = total > 0 ? `${Math.round((found / total) * 100)}%` : '0%'

  const estimatedTrafficTotal = data.targets.reduce((sum, target) => {
    const result = data.latestResults[target.id]
    const position = result?.found ? result.position : null
    return sum + getEstimatedOrganicClicks(target.avg_monthly_searches, position)
  }, 0)
  const estimatedTrafficFormatted = estimatedTrafficTotal.toLocaleString(isRtl ? 'he-IL' : 'en-US')

  const sortedTargets = sortTargetsByPosition(data.targets, data.latestResults)
  const tableRows = sortedTargets.map((target) => {
    const result = data.latestResults[target.id]
    if (!result) return ''

    let changeStr = '—'
    if (result?.change_value != null) {
      changeStr = result.change_value > 0 ? `+${result.change_value}` : String(result.change_value)
    }

    const currentPosition = result?.position != null ? String(result.position) : '—'
    const previousPosition = result?.previous_position != null ? String(result.previous_position) : '—'
    const checkedAt = result?.checked_at ? new Date(result.checked_at).toLocaleDateString(dateLocale) : '—'
    const urlDisplay = result?.result_url ? (result.result_url.length > 50 ? result.result_url.slice(0, 50) + '…' : result.result_url) : '—'
    const foundText = result ? (result.found ? L.yes : L.no) : '—'
    const engine = getEngineDisplayLabel(target.engine_type, data.project.device_type)
    const changeColor = changeStr.startsWith('+') ? '#16a34a' : changeStr.startsWith('-') ? '#dc2626' : '#000'
    const searchVolume = target.avg_monthly_searches ? target.avg_monthly_searches.toLocaleString() : ''
    const searchVolumeHtml = searchVolume ? `<div class="search-volume">${escapeHtml(L.searchVolume)}: ${escapeHtml(searchVolume)}</div>` : ''

    return `
      <tr>
        <td class="keyword-cell"><span dir="ltr">${escapeHtml(target.keyword)}</span>${searchVolumeHtml}</td>
        <td>${escapeHtml(engine)}</td>
        <td>${escapeHtml(currentPosition)}</td>
        <td>${escapeHtml(previousPosition)}</td>
        <td style="color: ${changeColor}; font-weight: ${changeStr !== '—' ? 'bold' : 'normal'}">${escapeHtml(changeStr)}</td>
        <td>${escapeHtml(foundText)}</td>
        <td>${escapeHtml(checkedAt)}</td>
        <td class="url-cell"><a href="${escapeHtml(result?.result_url || '#')}" target="_blank">${escapeHtml(urlDisplay)}</a></td>
      </tr>
    `
  }).join('')

  return `
    <!DOCTYPE html>
    <html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${isRtl ? 'he' : 'en'}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(L.rankingReport)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        html, body {
          width: 100%;
          height: 100%;
        }

        body {
          font-family: Arial, sans-serif;
          font-size: 10pt;
          direction: ${isRtl ? 'rtl' : 'ltr'};
          line-height: 1.5;
          color: #1f2937;
          padding: 20px;
          background: #f9fafb;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .header {
          background: #1E4ED8;
          color: white;
          padding: 20px;
          text-align: center;
          margin: -30px -30px 20px -30px;
          border-radius: 8px 8px 0 0;
        }

        .header h1 {
          font-size: 24pt;
          margin-bottom: 5px;
        }

        .project-info {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #e5e7eb;
          gap: 20px;
        }

        .project-details {
          flex: 1;
        }

        .project-name {
          font-size: 16pt;
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 5px;
        }

        .project-meta {
          font-size: 9pt;
          color: #6b7280;
        }

        .summary-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 10px;
        }

        .stat-box {
          border: 1px solid #d1d5db;
          padding: 10px;
          text-align: center;
          border-radius: 4px;
          background: #f9fafb;
        }

        .stat-label {
          font-size: 8pt;
          color: #6b7280;
          margin-bottom: 6px;
          font-weight: bold;
        }

        .stat-value {
          font-size: 16pt;
          font-weight: bold;
          color: #1E4ED8;
        }

        .traffic-kpi {
          border: 1px solid #d1d5db;
          padding: 12px 16px;
          border-radius: 4px;
          background: #f9fafb;
          margin-bottom: 25px;
          display: flex;
          align-items: baseline;
          gap: 12px;
          flex-wrap: wrap;
        }

        .traffic-kpi-label {
          font-size: 9pt;
          color: #6b7280;
          font-weight: bold;
        }

        .traffic-kpi-value {
          font-size: 16pt;
          font-weight: bold;
          color: #1E4ED8;
        }

        .traffic-kpi-unit {
          font-size: 9pt;
          color: #6b7280;
        }

        .traffic-kpi-caption {
          font-size: 8pt;
          color: #9ca3af;
          flex-basis: 100%;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
          table-layout: fixed;
          word-break: break-word;
        }

        th {
          background: #1E4ED8;
          color: white;
          padding: 10px;
          text-align: ${isRtl ? 'right' : 'left'};
          font-weight: bold;
          font-size: 9pt;
          border: 1px solid #1E4ED8;
        }

        td {
          padding: 10px;
          border: 1px solid #e5e7eb;
          font-size: 9pt;
          overflow-wrap: break-word;
          white-space: normal;
          text-align: ${isRtl ? 'right' : 'left'};
        }

        tr:nth-child(even) {
          background: #f9fafb;
        }

        tr:hover {
          background: #f0f4ff;
        }

        .keyword-cell {
          font-weight: bold;
          width: 15%;
        }

        .search-volume {
          font-size: 11px;
          color: #64748b;
          margin-top: 4px;
          line-height: 1.2;
          font-weight: normal;
        }

        .url-cell {
          width: 25%;
        }

        .url-cell a {
          color: #1E4ED8;
          text-decoration: none;
          direction: ltr;
          unicode-bidi: embed;
          word-break: break-all;
        }

        .url-cell a:hover {
          text-decoration: underline;
        }

        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 8pt;
          color: #9ca3af;
        }

        /* Print Styling */
        @page {
          size: A4;
          margin: 10mm;
        }

        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
          }

          .container {
            max-width: 100%;
            margin: 0;
            padding: 0;
            border-radius: 0;
            box-shadow: none;
          }

          .header {
            margin: 0;
            border-radius: 0;
          }

          .no-print {
            display: none;
          }

          table {
            page-break-inside: avoid;
          }

          tr {
            page-break-inside: avoid;
          }

          th, td {
            border: 1px solid #d1d5db;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${escapeHtml(L.rankingReport)}</h1>
        </div>

        <div class="project-info">
          <div class="project-details">
            <div class="project-name">${escapeHtml(data.project.name)}</div>
            <div class="project-meta">${escapeHtml(data.client.name)} | ${escapeHtml(data.project.target_domain)} | ${escapeHtml(now)}</div>
          </div>
        </div>

        <div class="summary-stats">
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.totalKeywords)}</div>
            <div class="stat-value">${total}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.foundPlural)}</div>
            <div class="stat-value">${found}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.notFoundPlural)}</div>
            <div class="stat-value">${notFound}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.coverage)}</div>
            <div class="stat-value">${coverage}</div>
          </div>
        </div>

        <div class="traffic-kpi">
          <span class="traffic-kpi-label">${escapeHtml(L.estimatedOrganicTraffic)}:</span>
          <span class="traffic-kpi-value">${escapeHtml(estimatedTrafficFormatted)}</span>
          <span class="traffic-kpi-unit">${escapeHtml(L.estimatedTrafficUnit)}</span>
          <span class="traffic-kpi-caption">${escapeHtml(L.estimatedTrafficCaption)}</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>${escapeHtml(L.keywordCol)}</th>
              <th>${escapeHtml(L.engine)}</th>
              <th>${escapeHtml(L.position)}</th>
              <th>${escapeHtml(L.previousPosition)}</th>
              <th>${escapeHtml(L.change)}</th>
              <th>${escapeHtml(L.found)}</th>
              <th>${escapeHtml(L.date)}</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Go Top | ${escapeHtml(L.generatedOn)} ${escapeHtml(now)}
        </div>
      </div>
    </body>
    </html>
  `
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

function generateAIReportHTML(data: AIExportData): string {
  const language = normalizeExportLanguage(data.language)
  const L = getExportLabels(language)
  const isRtl = language === 'he'
  const dateLocale = isRtl ? 'he-IL' : 'en-US'
  const now = new Date().toLocaleDateString(dateLocale)

  const engineLabels: Record<string, string> = {
    chatgpt: 'ChatGPT',
    perplexity: 'Perplexity',
    gemini: 'Gemini',
    copilot: 'Copilot',
    grok: 'Grok',
    google_ai_mode: 'Google AI',
  }

  const engineOrder = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode']
  const enginesInReport = engineOrder.filter((e) => data.summary.engineBreakdown[e])

  const engineBreakdownHTML = enginesInReport.map((engine) => {
    const breakdown = data.summary.engineBreakdown[engine]
    if (!breakdown || breakdown.scans === 0) return ''
    const mentionRate = Math.round((breakdown.mentions / breakdown.scans) * 100)
    const citationRate = Math.round((breakdown.cited / breakdown.scans) * 100)
    return `
      <div style="margin-bottom: 15px; padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 11pt;">${escapeHtml(engineLabels[engine] || engine)}</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 9pt;">
          <div>
            <div style="color: #6b7280; margin-bottom: 2px;">${escapeHtml(L.engineScans)}</div>
            <div style="font-weight: bold; font-size: 12pt;">${breakdown.scans}</div>
          </div>
          <div>
            <div style="color: #6b7280; margin-bottom: 2px;">${escapeHtml(L.engineMentions)}</div>
            <div style="font-weight: bold; font-size: 12pt; color: #16a34a;">${breakdown.mentions} (${mentionRate}%)</div>
          </div>
          <div>
            <div style="color: #6b7280; margin-bottom: 2px;">${escapeHtml(L.engineCitations)}</div>
            <div style="font-weight: bold; font-size: 12pt; color: #0891b2;">${breakdown.cited} (${citationRate}%)</div>
          </div>
        </div>
      </div>
    `
  }).join('')

  const tableRows = data.results.slice(0, 100).map((result) => {
    const date = result.created_at ? new Date(result.created_at).toLocaleDateString(dateLocale) : '—'
    return `
      <tr>
        <td class="prompt-cell">${escapeHtml(result.promptText)}</td>
        <td>${escapeHtml(engineLabels[result.engine] || result.engine)}</td>
        <td>${result.mentioned ? L.yes : L.no}</td>
        <td>${result.target_cited ? L.yes : L.no}</td>
        <td>${result.citation_count}</td>
        <td>${escapeHtml(date)}</td>
      </tr>
    `
  }).join('')

  return `
    <!DOCTYPE html>
    <html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${isRtl ? 'he' : 'en'}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(L.aiVisibilityReport)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        html, body {
          width: 100%;
          height: 100%;
        }

        body {
          font-family: Arial, sans-serif;
          font-size: 10pt;
          direction: ${isRtl ? 'rtl' : 'ltr'};
          line-height: 1.5;
          color: #1f2937;
          padding: 20px;
          background: #f9fafb;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .header {
          background: linear-gradient(135deg, #4f46e5 0%, #2563eb 100%);
          color: white;
          padding: 20px;
          text-align: center;
          margin: -30px -30px 20px -30px;
          border-radius: 8px 8px 0 0;
        }

        .header h1 {
          font-size: 24pt;
          margin-bottom: 5px;
        }

        .project-info {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #e5e7eb;
          gap: 20px;
        }

        .project-details {
          flex: 1;
        }

        .project-name {
          font-size: 16pt;
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 5px;
        }

        .project-meta {
          font-size: 9pt;
          color: #6b7280;
        }

        .summary-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-bottom: 25px;
        }

        .stat-box {
          border: 1px solid #d1d5db;
          padding: 10px;
          text-align: center;
          border-radius: 4px;
          background: #f9fafb;
        }

        .stat-label {
          font-size: 8pt;
          color: #6b7280;
          margin-bottom: 6px;
          font-weight: bold;
        }

        .stat-value {
          font-size: 16pt;
          font-weight: bold;
          color: #4f46e5;
        }

        .section-title {
          font-size: 13pt;
          font-weight: bold;
          color: #1f2937;
          margin-top: 25px;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #4f46e5;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
          table-layout: fixed;
          word-break: break-word;
        }

        th {
          background: #4f46e5;
          color: white;
          padding: 10px;
          text-align: ${isRtl ? 'right' : 'left'};
          font-weight: bold;
          font-size: 9pt;
          border: 1px solid #4f46e5;
        }

        td {
          padding: 10px;
          border: 1px solid #e5e7eb;
          font-size: 9pt;
          overflow-wrap: break-word;
          white-space: normal;
          text-align: ${isRtl ? 'right' : 'left'};
        }

        tr:nth-child(even) {
          background: #f9fafb;
        }

        tr:hover {
          background: #f0f4ff;
        }

        .prompt-cell {
          font-weight: bold;
          width: 35%;
        }

        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 8pt;
          color: #9ca3af;
        }

        /* Print Styling */
        @page {
          size: A4;
          margin: 10mm;
        }

        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
          }

          .container {
            max-width: 100%;
            margin: 0;
            padding: 0;
            border-radius: 0;
            box-shadow: none;
          }

          .header {
            margin: 0;
            border-radius: 0;
          }

          table {
            page-break-inside: avoid;
          }

          tr {
            page-break-inside: avoid;
          }

          th, td {
            border: 1px solid #d1d5db;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${escapeHtml(L.aiVisibilityReport)}</h1>
        </div>

        <div class="project-info">
          <div class="project-details">
            <div class="project-name">${escapeHtml(data.project.name)}</div>
            <div class="project-meta">${escapeHtml(data.client.name)} | ${escapeHtml(data.project.target_domain)} | ${escapeHtml(now)}</div>
          </div>
        </div>

        <div class="summary-stats">
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.aiQueries)}</div>
            <div class="stat-value">${data.summary.totalResults}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.aiScans)}</div>
            <div class="stat-value">${data.summary.totalScans}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.mentions)}</div>
            <div class="stat-value" style="color: #16a34a;">${data.summary.mentionedCount}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.mentionRate)}</div>
            <div class="stat-value">${Math.round(data.summary.mentionRate)}%</div>
          </div>
        </div>

        <div class="summary-stats">
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.domainCited)}</div>
            <div class="stat-value" style="color: #0891b2;">${data.summary.citedCount}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.citationRate)}</div>
            <div class="stat-value">${Math.round(data.summary.citationRate)}%</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.totalCitations)}</div>
            <div class="stat-value" style="color: #0891b2;">${data.summary.totalCitations}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(L.overallVisibility)}</div>
            <div class="stat-value">${data.summary.totalResults > 0 ? Math.round(((data.summary.mentionedCount + data.summary.citedCount) / (data.summary.totalResults * 2)) * 100) : 0}%</div>
          </div>
        </div>

        <div class="section-title">${escapeHtml(L.performanceByEngine)}</div>
        <div>${engineBreakdownHTML}</div>

        <div class="section-title">${escapeHtml(L.aiQueryResults)} (${data.results.length})</div>
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(L.query)}</th>
              <th>${escapeHtml(L.engine)}</th>
              <th>${escapeHtml(L.mentioned)}</th>
              <th>${escapeHtml(L.domainCited)}</th>
              <th>${escapeHtml(L.citations)}</th>
              <th>${escapeHtml(L.date)}</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Go Top | ${escapeHtml(L.generatedOn)} ${escapeHtml(now)}
        </div>
      </div>
    </body>
    </html>
  `
}

export { generateReportHTML, generateAIReportHTML }

export async function exportToPDF(data: ExportData): Promise<void> {
  const language = normalizeExportLanguage(data.language)
  const L = getExportLabels(language)
  const html = generateReportHTML(data)
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = data.project.name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 60)
  const timestamp = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `${L.rankingsFilename}_${safeName}_${timestamp}.html`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
