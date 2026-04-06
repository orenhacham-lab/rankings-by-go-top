import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ScanResult, TrackingTarget, Project, Client } from '@/lib/supabase/types'
import { getEngineLabel } from '@/lib/utils'

interface ExportData {
  client: Client
  project: Project
  targets: TrackingTarget[]
  latestResults: Record<string, ScanResult>
}

/**
 * NOTE ON HEBREW IN PDF:
 * jsPDF's built-in fonts (Helvetica, Times, Courier) do not include Hebrew
 * Unicode glyphs. Hebrew keywords and names will appear as boxes in some
 * PDF viewers. All UI labels (column headers, section titles) use English
 * for reliable rendering. The data columns (keyword, URL, title) display
 * the raw values — these render correctly in Chrome's built-in PDF viewer
 * and Adobe Acrobat but may not in older viewers.
 *
 * To add full Hebrew support: embed a Hebrew TTF font via jsPDF.addFont().
 */

export function exportToPDF(data: ExportData): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const now = new Date().toLocaleDateString('he-IL')

  const found = Object.values(data.latestResults).filter((r) => r.found).length
  const notFound = Object.values(data.latestResults).filter((r) => !r.found).length
  const total = data.targets.length
  const coverage = total > 0 ? `${Math.round((found / total) * 100)}%` : '0%'

  // ── Header bar ────────────────────────────────────────────────────
  doc.setFillColor(29, 78, 216)
  doc.rect(0, 0, pageWidth, 22, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('Rankings by Go Top', pageWidth - 14, 14, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('SEO Ranking Report', 14, 14)

  // ── Project / client info ─────────────────────────────────────────
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  // Safe: project name may contain Hebrew — renders in Chrome PDF viewer
  doc.text(data.project.name, pageWidth - 14, 33, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  const subtitle = `${data.client.name}  |  ${data.project.target_domain}  |  ${now}`
  doc.text(subtitle, pageWidth - 14, 40, { align: 'right' })

  // ── Summary stat boxes ────────────────────────────────────────────
  const boxes = [
    { label: 'Keywords', value: String(total) },
    { label: 'Found', value: String(found) },
    { label: 'Not Found', value: String(notFound) },
    { label: 'Coverage', value: coverage },
  ]

  const boxW = 54
  const boxH = 16
  const boxStartX = 14
  const boxY = 46
  const boxGap = 4

  boxes.forEach((box, i) => {
    const x = boxStartX + i * (boxW + boxGap)

    doc.setFillColor(241, 245, 249)
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(x, boxY, boxW, boxH, 2, 2, 'FD')

    doc.setTextColor(71, 85, 105)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(box.label, x + boxW / 2, boxY + 5.5, { align: 'center' })

    doc.setTextColor(29, 78, 216)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(box.value, x + boxW / 2, boxY + 13, { align: 'center' })
  })

  // ── Rankings table ────────────────────────────────────────────────
  const tableHead = [
    ['Keyword', 'Engine', 'Position', 'Prev.', 'Change', 'Found', 'Date', 'Result URL'],
  ]

  const tableBody = data.targets.map((target) => {
    const result = data.latestResults[target.id]

    let changeStr = '—'
    if (result?.change_value != null) {
      changeStr = result.change_value > 0
        ? `+${result.change_value}`
        : String(result.change_value)
    }

    const urlRaw = result?.result_url ?? ''
    const urlDisplay = urlRaw.length > 50 ? urlRaw.slice(0, 50) + '…' : urlRaw

    return [
      target.keyword,
      getEngineLabel(target.engine_type),
      result?.found ? `#${result.position}` : '—',
      result?.previous_position != null ? `#${result.previous_position}` : '—',
      changeStr,
      result ? (result.found ? 'Yes' : 'No') : '—',
      result?.checked_at ? new Date(result.checked_at).toLocaleDateString('he-IL') : '—',
      urlDisplay || '—',
    ]
  })

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: 68,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 22 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 20 },
      7: { cellWidth: 'auto' },
    },
    // Use willDrawCell to color the change column BEFORE text is drawn (no double-render)
    willDrawCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 4) {
        const val = hookData.cell.text[0] ?? ''
        if (val.startsWith('+')) {
          hookData.cell.styles.textColor = [22, 163, 74]
          hookData.cell.styles.fontStyle = 'bold'
        } else if (val.startsWith('-')) {
          hookData.cell.styles.textColor = [220, 38, 38]
          hookData.cell.styles.fontStyle = 'bold'
        }
      }
    },
  })

  // ── Footer on every page ──────────────────────────────────────────
  const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } })
    .internal.getNumberOfPages()

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)

    // Thin separator line above footer
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(14, pageHeight - 9, pageWidth - 14, pageHeight - 9)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text(
      `Rankings by Go Top  |  Generated ${now}  |  Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 4,
      { align: 'center' }
    )
  }

  // ── Save ──────────────────────────────────────────────────────────
  const safeName = data.project.name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, '_').slice(0, 60)
  const filename = `rankings_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
