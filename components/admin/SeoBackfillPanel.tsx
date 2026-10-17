'use client'

/**
 * Admin: fill in the SEO title and meta description that articles already on WordPress are
 * missing (POST /api/admin/seo-backfill). "Check" is the dry run and writes nothing; "Fill in"
 * asks for confirmation first and sends `apply: true`. One page of up to 25 articles per click;
 * "next page" continues where the last one stopped. Lives on the admin logs screen.
 */
import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import { NoticeBox } from '@/components/ui/Notice'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { ArticleReport } from '@/lib/content/seo-backfill'

interface Page { mode: 'dry_run' | 'apply'; total: number; offset: number; nextOffset: number | null; reports: ArticleReport[] }

const OUTCOME: Record<ArticleReport['title'], { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  not_needed: { label: 'קיים', variant: 'neutral' },
  would_write: { label: 'ייכתב', variant: 'info' },
  written: { label: 'נכתב', variant: 'success' },
  kept_existing: { label: 'נשמר הקיים', variant: 'neutral' },
  failed: { label: 'נכשל', variant: 'danger' },
  skipped: { label: 'דילוג', variant: 'warning' },
}

export default function SeoBackfillPanel() {
  const [projects, setProjects] = useState<{ id: string; name: string; articles: number }[]>([])
  const [projectId, setProjectId] = useState('')
  const [page, setPage] = useState<Page | null>(null)
  const [busy, setBusy] = useState<null | 'dry_run' | 'apply'>(null)
  const [error, setError] = useState(false)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    fetch('/api/admin/seo-backfill').then((r) => r.json()).then((d) => setProjects(Array.isArray(d.projects) ? d.projects : [])).catch(() => setError(true))
  }, [])

  const run = useCallback(async (apply: boolean, offset: number) => {
    if (!projectId) return
    if (apply && !(await confirm({
      title: 'למלא כותרת ותיאור SEO באתר?',
      body: 'ייכתבו רק שדות שחסרים בעמוד החי. ערך קיים לא יוחלף. הפעולה כותבת לאתר של הלקוח.',
      confirmLabel: 'כן, למלא',
      tone: 'danger',
    }))) return
    setBusy(apply ? 'apply' : 'dry_run')
    setError(false)
    try {
      const res = await fetch('/api/admin/seo-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apply ? { projectId, offset, apply: true } : { projectId, offset }),
      })
      if (!res.ok) throw new Error('failed')
      setPage((await res.json()) as Page)
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }, [projectId, confirm])

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="text-lead font-semibold text-ink">השלמת כותרת ותיאור SEO למאמרים שפורסמו</h2>
          <p className="mt-1 text-caption text-muted">בדיקה לא כותבת כלום. מילוי כותב רק שדות שחסרים בעמוד החי, עד 25 מאמרים בכל לחיצה.</p>
        </div>
        <Select
          label="פרויקט"
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); setPage(null) }}
          options={[{ value: '', label: 'בחירת פרויקט' }, ...projects.map((p) => ({ value: p.id, label: `${p.name} (${p.articles})` }))]}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!projectId || busy !== null} loading={busy === 'dry_run'} onClick={() => run(false, 0)} data-backfill-dry-run>
            בדיקה (בלי לכתוב)
          </Button>
          <Button variant="danger" disabled={!projectId || busy !== null || page?.mode !== 'dry_run'} loading={busy === 'apply'} onClick={() => run(true, page?.offset ?? 0)} data-backfill-apply>
            מילוי השדות החסרים
          </Button>
          {page?.nextOffset != null && (
            <Button variant="ghost" disabled={busy !== null} onClick={() => run(false, page.nextOffset!)}>העמוד הבא</Button>
          )}
        </div>
        {error && <NoticeBox tone="bad" language="he">הפעולה לא הצליחה. כדאי לנסות שוב בעוד רגע.</NoticeBox>}
        {page && (
          <div className="space-y-2">
            <p className="text-caption text-muted">
              {page.mode === 'apply' ? 'מילוי' : 'בדיקה'} · מאמרים {page.offset + 1}–{page.offset + page.reports.length} מתוך {page.total}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-caption">
                <thead>
                  <tr className="text-start text-muted">
                    <th className="p-2 text-start">מאמר</th>
                    <th className="p-2 text-start">חיבור</th>
                    <th className="p-2 text-start">כותרת</th>
                    <th className="p-2 text-start">תיאור</th>
                    <th className="p-2 text-start">הערה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {page.reports.map((r) => (
                    <tr key={r.id}>
                      <td className="max-w-[18rem] truncate p-2" dir="ltr"><a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">{r.url}</a></td>
                      <td className="p-2">{r.channel}{r.seoPluginHint ? ` / ${r.seoPluginHint}` : ''}</td>
                      <td className="p-2"><Badge variant={OUTCOME[r.title].variant}>{OUTCOME[r.title].label}</Badge></td>
                      <td className="p-2"><Badge variant={OUTCOME[r.description].variant}>{OUTCOME[r.description].label}</Badge></td>
                      <td className="p-2" dir="ltr">{[r.skip, r.detail, r.persisted?.status].filter(Boolean).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {dialog}
    </Card>
  )
}
