import { ScanResult, TrackingTarget, Project, Client } from '@/lib/supabase/types'
import { getEngineDisplayLabel } from '@/lib/utils'
import { sortTargetsByPosition } from '@/lib/sorting'

interface ExportData {
  client: Client
  project: Project
  targets: TrackingTarget[]
  latestResults: Record<string, ScanResult>
}

function generateReportHTML(data: ExportData): string {
  const isHebrewProject = data.project.language?.startsWith('he') || data.project.country === 'IL'
  const now = new Date().toLocaleDateString('he-IL')

  const found = data.targets.filter((t) => data.latestResults[t.id]?.found).length
  const notFound = data.targets.length - found
  const total = data.targets.length
  const coverage = total > 0 ? `${Math.round((found / total) * 100)}%` : '0%'

  const sortedTargets = sortTargetsByPosition(data.targets, data.latestResults)
  const tableRows = sortedTargets.map((target) => {
    const result = data.latestResults[target.id]

    let changeStr = '—'
    if (result?.change_value != null) {
      changeStr = result.change_value > 0 ? `+${result.change_value}` : String(result.change_value)
    }

    const currentPosition = result?.position != null ? String(result.position) : '—'
    const previousPosition = result?.previous_position != null ? String(result.previous_position) : '—'
    const checkedAt = result?.checked_at ? new Date(result.checked_at).toLocaleDateString('he-IL') : '—'
    const urlDisplay = result?.result_url ? (result.result_url.length > 50 ? result.result_url.slice(0, 50) + '…' : result.result_url) : '—'
    const foundText = result ? (result.found ? 'כן' : 'לא') : '—'
    const engine = getEngineDisplayLabel(target.engine_type, data.project.device_type)
    const changeColor = changeStr.startsWith('+') ? '#16a34a' : changeStr.startsWith('-') ? '#dc2626' : '#000'

    return `
      <tr>
        <td class="keyword-cell"><span dir="ltr">${escapeHtml(target.keyword)}</span></td>
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
    <html dir="${isHebrewProject ? 'rtl' : 'ltr'}" lang="${isHebrewProject ? 'he' : 'en'}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>דוח דירוגים</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        html, body {
          width: 100%;
          height: 100%;
        }

        body {
          font-family: Arial, sans-serif;
          font-size: 10pt;
          direction: ${isHebrewProject ? 'rtl' : 'ltr'};
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

        .toolbar {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .toolbar button {
          padding: 8px 16px;
          background: #1E4ED8;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 10pt;
          font-weight: bold;
        }

        .toolbar button:hover {
          background: #1a3da8;
        }

        .summary-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin-bottom: 25px;
        }

        .stat-box {
          border: 1px solid #d1d5db;
          padding: 15px;
          text-align: center;
          border-radius: 4px;
          background: #f9fafb;
        }

        .stat-label {
          font-size: 9pt;
          color: #6b7280;
          margin-bottom: 8px;
          font-weight: bold;
        }

        .stat-value {
          font-size: 20pt;
          font-weight: bold;
          color: #1E4ED8;
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
          text-align: ${isHebrewProject ? 'right' : 'left'};
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
          text-align: ${isHebrewProject ? 'right' : 'left'};
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

          .toolbar {
            display: none;
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

        /* Hide print button in normal view */
        @media screen {
          .print-button {
            display: block;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>דוח דירוגים</h1>
        </div>

        <div class="project-info">
          <div class="project-details">
            <div class="project-name">${escapeHtml(data.project.name)}</div>
            <div class="project-meta">${escapeHtml(data.client.name)} | ${escapeHtml(data.project.target_domain)} | ${escapeHtml(now)}</div>
          </div>
        </div>

        <div class="toolbar no-print">
          <button class="print-button" onclick="window.print()" title="Save as PDF using browser print">💾 Save as PDF</button>
        </div>

        <div class="summary-stats">
          <div class="stat-box">
            <div class="stat-label">סה״כ ביטויים</div>
            <div class="stat-value">${total}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">נמצאו</div>
            <div class="stat-value">${found}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">לא נמצאו</div>
            <div class="stat-value">${notFound}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">כיסוי</div>
            <div class="stat-value">${coverage}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ביטוי</th>
              <th>מנוע</th>
              <th>מיקום</th>
              <th>מיקום קודם</th>
              <th>שינוי</th>
              <th>נמצא</th>
              <th>תאריך</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Go Top | הופק בתאריך ${escapeHtml(now)}
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

export { generateReportHTML }

export async function exportToPDF(data: ExportData): Promise<void> {
  const html = generateReportHTML(data)
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeName = data.project.name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 60)
  const timestamp = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `דוח_דירוגים_${safeName}_${timestamp}.html`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
