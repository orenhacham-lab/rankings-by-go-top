'use client'

/**
 * The fix queue: every fix the merchant approved, newest first — what it wrote,
 * on which page, through which channel, and where it stands (pending, applied,
 * failed, cancelled, sent, manual update, reverted). Undo, remove and retry are
 * asked in the in-app confirm dialog, never the browser's.
 */
import { useCallback, useState } from 'react'
import { RotateCcw, Undo2, X } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { useToasts } from '@/components/ui/Toast'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { FixErrorCode, FixJobView, JobStatus } from '@/lib/site-fix/types'
import { postFix } from './useSiteFixes'

type Copy = DashboardDictionary['siteHealth']['autofix']
const FIRST = 5

const STATUS_BADGE: Record<JobStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  applied: 'success', sent: 'info', pending: 'neutral', manual: 'warning', failed: 'danger', cancelled: 'neutral', reverted: 'neutral',
}

const errorOf = (copy: Copy, code: string | null) => (code && code in copy.errors ? copy.errors[code as FixErrorCode] : null)

const pathLabel = (url: string) => { try { const p = decodeURI(new URL(url).pathname); return p.replace(/\/+$/, '') || '/' } catch { return url } }

export default function FixQueue({
  projectId, jobs, copy, toasts, when, onJob,
}: {
  projectId: string
  jobs: FixJobView[]
  copy: Copy
  toasts: ReturnType<typeof useToasts>
  when: (iso: string) => string
  onJob: (job: FixJobView | null) => void
}) {
  const { confirm, dialog } = useConfirm()
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const shown = all ? jobs : jobs.slice(0, FIRST)

  const act = useCallback(async (job: FixJobView, action: 'undo' | 'cancel' | 'retry') => {
    if (busy) return
    if (action !== 'retry') {
      const c = action === 'undo' ? copy.queue.confirmUndo : copy.queue.confirmCancel
      const ok = await confirm({ title: c.title, body: c.body, confirmLabel: c.confirm, tone: action === 'cancel' ? 'danger' : 'default' })
      if (!ok) return
    }
    setBusy(job.id)
    const r = await postFix<{ job: FixJobView | null }>('/api/site-health/fixes', { projectId, action, jobId: job.id })
    setBusy(null)
    if (!r.ok) { toasts.error(copy.errors[r.code]); return }
    onJob(r.job)
    if (action === 'undo') toasts.success(copy.queue.toast.undone)
    else if (action === 'cancel') toasts.success(copy.queue.toast.cancelled)
    else if (r.job) {
      const s = r.job.status
      if (s === 'applied' || s === 'sent' || s === 'manual') toasts.success(copy.queue.toast[s])
      else toasts.error(errorOf(copy, r.job.errorCode) ?? copy.queue.toast.failed)
    }
  }, [busy, confirm, copy, projectId, toasts, onJob])

  return (
    <section className="rounded-card border border-line bg-surface shadow-card" aria-labelledby="fix-queue-title" data-fix-queue={jobs.length}>
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:px-6">
        <h2 id="fix-queue-title" className="text-section font-semibold text-ink">{copy.queue.title}</h2>
        <p className="text-caption text-muted">{copy.queue.subtitle}</p>
      </div>
      {jobs.length === 0 ? (
        <p className="px-5 py-6 text-copy text-muted sm:px-6" data-fix-queue-empty="">{copy.queue.empty}</p>
      ) : (
        <ul className="divide-y divide-line" role="list">
          {shown.map((job) => {
            const err = job.status === 'failed' || job.status === 'manual' ? errorOf(copy, job.errorCode) : null
            return (
              <li key={job.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-start md:justify-between" data-fix-job={job.status} data-fix-type={job.type}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Badge variant={STATUS_BADGE[job.status]} dot>{copy.queue.status[job.status]}</Badge>
                    <span className="text-copy font-semibold text-ink">{copy.approve.title[job.type]}</span>
                  </div>
                  <p className="mt-1.5 truncate text-caption text-muted" title={job.pageUrl}>
                    <bdi dir="ltr">{pathLabel(job.pageUrl)}</bdi>
                    <span aria-hidden="true"> · </span>
                    {copy.queue.channel[job.channel]}
                    <span aria-hidden="true"> · </span>
                    {job.status === 'reverted' && job.revertedAt ? copy.queue.revertedAt(when(job.revertedAt)) : copy.queue.approvedAt(when(job.approvedAt))}
                  </p>
                  {job.after && (
                    <p className="mt-2 line-clamp-2 text-copy text-body">
                      <span className="font-medium text-muted">{copy.queue.after}: </span>
                      <span dir="auto">{job.after}</span>
                    </p>
                  )}
                  {err && <p className="mt-1.5 text-caption text-warn">{err}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {job.canRetry && (
                    <Button variant="secondary" size="sm" onClick={() => void act(job, 'retry')} loading={busy === job.id} disabled={!!busy} data-fix-retry="">
                      <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                      {copy.queue.retry}
                    </Button>
                  )}
                  {job.canUndo && (
                    <Button variant="secondary" size="sm" onClick={() => void act(job, 'undo')} loading={busy === job.id} disabled={!!busy} data-fix-undo="">
                      <Undo2 size={14} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
                      {copy.queue.undo}
                    </Button>
                  )}
                  {job.canCancel && (
                    <Button variant="ghost" size="sm" onClick={() => void act(job, 'cancel')} disabled={!!busy} data-fix-cancel="">
                      <X size={14} strokeWidth={2} aria-hidden="true" />
                      {copy.queue.cancel}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {jobs.length > FIRST && (
        <div className="border-t border-line px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="rounded-control text-caption font-semibold text-action hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            {all ? copy.queue.showLess : copy.queue.showAll(jobs.length)}
          </button>
        </div>
      )}
      {dialog}
    </section>
  )
}
