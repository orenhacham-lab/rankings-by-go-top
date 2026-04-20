import { ScanResult, TrackingTarget, Project, Client } from '@/lib/supabase/types'
import { getEngineDisplayLabel, getDeviceLabel } from '@/lib/utils'

interface ExportData {
  client: Client
  project: Project
  targets: TrackingTarget[]
  latestResults: Record<string, ScanResult>
}

function generateReportHTML(data: ExportData): string {
  const isHebrewProject = data.project.language === 'he' || data.project.language?.startsWith('he')
  const now = new Date().toLocaleDateString('he-IL')

  const found = data.targets.filter((t) => data.latestResults[t.id]?.found).length
  const notFound = data.targets.length - found
  const total = data.targets.length
  const coverage = total > 0 ? `${Math.round((found / total) * 100)}%` : '0%'

  const tableRows = data.targets.map((target) => {
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
        <td style="text-align: ${isHebrewProject ? 'right' : 'left'}">${escapeHtml(target.keyword)}</td>
        <td style="text-align: center">${escapeHtml(engine)}</td>
        <td style="text-align: center">${escapeHtml(currentPosition)}</td>
        <td style="text-align: center">${escapeHtml(previousPosition)}</td>
        <td style="text-align: center; color: ${changeColor}; font-weight: ${changeStr !== '—' ? 'bold' : 'normal'}">${escapeHtml(changeStr)}</td>
        <td style="text-align: center">${escapeHtml(foundText)}</td>
        <td style="text-align: center">${escapeHtml(checkedAt)}</td>
        <td style="text-align: ${isHebrewProject ? 'right' : 'left'}"><a href="${escapeHtml(result?.result_url || '#')}">${escapeHtml(urlDisplay)}</a></td>
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
        * { margin: 0; padding: 0; }
        body {
          font-family: Arial, sans-serif;
          font-size: 10pt;
          direction: ${isHebrewProject ? 'rtl' : 'ltr'};
          line-height: 1.5;
          color: #1f2937;
        }
        .header {
          background: #1E4ED8;
          color: white;
          padding: 20px;
          text-align: center;
          margin-bottom: 20px;
        }
        .header h1 {
          font-size: 24pt;
          margin-bottom: 10px;
        }
        .project-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding: 0 0;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 10px;
        }
        .project-name {
          font-size: 16pt;
          font-weight: bold;
          color: #1f2937;
        }
        .project-meta {
          font-size: 9pt;
          color: #6b7280;
        }
        .summary-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 20px;
        }
        .stat-box {
          border: 1px solid #d1d5db;
          padding: 12px;
          text-align: center;
          border-radius: 4px;
          background: #f9fafb;
        }
        .stat-label {
          font-size: 8pt;
          color: #6b7280;
          margin-bottom: 5px;
        }
        .stat-value {
          font-size: 18pt;
          font-weight: bold;
          color: #1E4ED8;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background: #1E4ED8;
          color: white;
          padding: 8px;
          text-align: ${isHebrewProject ? 'right' : 'left'};
          font-weight: bold;
          font-size: 9pt;
        }
        td {
          padding: 8px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 8.5pt;
        }
        tr:nth-child(even) {
          background: #f9fafb;
        }
        a {
          color: #1E4ED8;
          text-decoration: none;
        }
        .footer {
          margin-top: 30px;
          padding-top: 15px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 8pt;
          color: #9ca3af;
        }
        @media print {
          body { margin: 0; padding: 0; }
          .header { margin: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>דוח דירוגים</h1>
      </div>

      <div class="project-info">
        <div>
          <div class="project-name">${escapeHtml(data.project.name)}</div>
          <div class="project-meta">${escapeHtml(data.client.name)} | ${escapeHtml(data.project.target_domain)} | ${escapeHtml(now)}</div>
        </div>
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

export async function exportToPDF(data: ExportData): Promise<void> {
  const html = generateReportHTML(data)

  try {
    const response = await fetch('/api/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, projectName: data.project.name }),
    })

    if (!response.ok) throw new Error('PDF generation failed')

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = data.project.name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 60)
    const filename = `דוח_דירוגים_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('PDF export error:', error)
    throw error
  }
}
