import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ScanResult, TrackingTarget, Project, Client } from '@/lib/supabase/types'
import { getDeviceLabel, getSearchTypeLabel } from '@/lib/utils'
import { NOTO_SANS_HEBREW_BASE64 } from './fonts/notoSansHebrewBase64'

interface ExportData {
  client: Client
  project: Project
  targets: TrackingTarget[]
  latestResults: Record<string, ScanResult>
}

export function exportToPDF(data: ExportData): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.addFileToVFS('DejaVuSans.ttf', NOTO_SANS_HEBREW_BASE64)
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal')
  doc.setFont('DejaVuSans', 'normal')
  doc.setR2L(true)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const now = new Date().toLocaleDateString('he-IL')

  const found = Object.values(data.latestResults).filter((r) => r.found).length
  const total = data.targets.length
  const notFound = total - found
  const coverage = total > 0 ? `${Math.round((found / total) * 100)}%` : '0%'
  const primaryEngine = data.targets[0]?.engine_type || 'google_search'

  doc.setFillColor(29, 78, 216)
  doc.rect(0, 0, pageWidth, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text('דוח דירוגים מקצועי', pageWidth - 14, 14, { align: 'right' })
  doc.setFontSize(9)
  doc.text('Rankings by Go Top', 14, 14)

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(13)
  doc.text(data.project.name, pageWidth - 14, 33, { align: 'right' })
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(`${data.client.name} | ${data.project.target_domain} | ${now}`, pageWidth - 14, 40, { align: 'right' })

  doc.setTextColor(51, 65, 85)
  doc.text(`engine: ${getSearchTypeLabel(primaryEngine, data.project.device_type)}`, pageWidth - 14, 47, { align: 'right' })
  doc.text(`device: ${getDeviceLabel(data.project.device_type)} | gl: ${data.project.country.toLowerCase()} | hl: ${data.project.language} | location: ${data.project.city || '—'}`, pageWidth - 14, 53, { align: 'right' })

  const boxes = [
    { label: 'סה"כ ביטויים', value: String(total) },
    { label: 'נמצאו', value: String(found) },
    { label: 'לא נמצאו', value: String(notFound) },
    { label: 'כיסוי', value: coverage },
  ]

  const boxW = 60
  boxes.forEach((box, i) => {
    const x = pageWidth - 14 - (i + 1) * boxW - i * 4
    doc.setFillColor(241, 245, 249)
    doc.roundedRect(x, 58, boxW, 16, 2, 2, 'F')
    doc.setTextColor(71, 85, 105)
    doc.setFontSize(8)
    doc.text(box.label, x + boxW - 4, 63, { align: 'right' })
    doc.setTextColor(29, 78, 216)
    doc.setFontSize(13)
    doc.text(box.value, x + boxW - 4, 71, { align: 'right' })
  })

  const tableHead = [['סוג סריקה', 'מילת מפתח', 'מיקום', 'מיקום קודם', 'שינוי', 'נמצא', 'תאריך', 'URL תוצאה']]

  const tableBody = data.targets.map((target) => {
    const result = data.latestResults[target.id]
    const change = result?.change_value
    const changeLabel = change == null ? '—' : change > 0 ? `+${change}` : String(change)
    return [
      getSearchTypeLabel(target.engine_type, data.project.device_type),
      target.keyword,
      result?.found ? `#${result.position}` : '—',
      result?.previous_position != null ? `#${result.previous_position}` : '—',
      changeLabel,
      result ? (result.found ? 'כן' : 'לא') : '—',
      result?.checked_at ? new Date(result.checked_at).toLocaleDateString('he-IL') : '—',
      result?.result_url || '—',
    ]
  })

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: 78,
    theme: 'grid',
    styles: {
      font: 'DejaVuSans',
      fontSize: 8,
      halign: 'right',
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      font: 'DejaVuSans',
      halign: 'right',
    },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 38 },
      2: { cellWidth: 16 },
      3: { cellWidth: 18 },
      4: { cellWidth: 15 },
      5: { cellWidth: 13 },
      6: { cellWidth: 18 },
      7: { cellWidth: 'auto' },
    },
    willDrawCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 4) {
        const val = hookData.cell.text[0] ?? ''
        if (val.startsWith('+')) hookData.cell.styles.textColor = [22, 163, 74]
        if (val.startsWith('-')) hookData.cell.styles.textColor = [220, 38, 38]
      }
    },
  })

  const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('DejaVuSans', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text(`עמוד ${i} מתוך ${pageCount} | הופק בתאריך ${now}`, pageWidth - 14, pageHeight - 4, { align: 'right' })
  }

  const safeName = data.project.name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 60)
  doc.save(`rankings_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
