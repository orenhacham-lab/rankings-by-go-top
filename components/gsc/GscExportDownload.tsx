'use client'

/**
 * The download under "Your Google Search performance": the same 28 days of
 * Search Console figures as a file, in Excel or CSV.
 *
 * It appears only once there are figures to download, which is also what the
 * server answers: with nothing synced yet /api/gsc/export refuses with `no_sync`,
 * so hiding the control is a courtesy and never the enforcement.
 *
 * The file is fetched and handed to the browser as a blob rather than opened as a
 * link, so a refusal shows the sentence below instead of navigating the customer
 * to a page of JSON. The note is the same one the file itself carries: this is
 * Google's own average over the window, not our rank check, and the two numbers
 * need not agree.
 */
import { useState } from 'react'
import { Download } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Format = 'xlsx' | 'csv'

/** The browser's own name for the file when the server's header is unreadable. */
function fallbackName(format: Format): string {
  return `search-console-28d.${format}`
}

function headerFileName(header: string | null): string | null {
  const match = /filename="([^"]+)"/.exec(header ?? '')
  return match ? match[1] : null
}

export default function GscExportDownload({ projectId, windowDays = 28, className }: { projectId: string | null | undefined; windowDays?: number; className?: string }) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).gscWidgets.exportReport
  const [busy, setBusy] = useState<Format | null>(null)
  const [failed, setFailed] = useState(false)

  async function download(format: Format) {
    if (!projectId || busy) return
    setBusy(format)
    setFailed(false)
    try {
      const url = `/api/gsc/export?projectId=${encodeURIComponent(projectId)}&window=${encodeURIComponent(String(windowDays))}&format=${format}&language=${encodeURIComponent(uiLocale)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('refused')
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = headerFileName(res.headers.get('content-disposition')) ?? fallbackName(format)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  if (!projectId) return null

  return (
    <div data-gsc-export="performance" className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => download('xlsx')} loading={busy === 'xlsx'} disabled={busy !== null} data-gsc-export-format="xlsx">
          <Download size={15} strokeWidth={2} aria-hidden="true" />
          {`${t.label} · ${t.excel}`}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => download('csv')} loading={busy === 'csv'} disabled={busy !== null} data-gsc-export-format="csv">
          {t.csv}
        </Button>
        {busy !== null && <span className="text-overline text-muted">{t.working}</span>}
      </div>
      <p className="mt-2 text-overline text-muted">{t.about}</p>
      <p className="text-overline text-muted">{t.note}</p>
      {failed && <p className="mt-1 text-overline text-bad" data-gsc-export-error>{t.failed}</p>}
    </div>
  )
}
