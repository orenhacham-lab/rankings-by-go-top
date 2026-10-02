'use client'

/**
 * The fix queue: every fix the merchant approved, newest first — what it wrote,
 * on which page, through which channel, and where it stands (pending, applied,
 * failed, cancelled, sent, manual update, reverted). Undo, remove and retry are
 * asked in the in-app confirm dialog, never the browser's.
 *
 * Fixes approved together ("Fix {n} safe items for me") are grouped as one batch, "Fix batch of
 * {date} ({n})", with "Undo the whole batch" for 14 days (every applied fix of it is undone through
 * the plugin, one by one; a page changed since is left alone). Each fix keeps its own undo.
 */
import { useCallback, useMemo, useState } from 'react'
import { Layers, RotateCcw, Undo2, X } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { useToasts } from '@/components/ui/Toast'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { FixErrorCode, FixJobView, JobStatus } from '@/lib/site-fix/types'
import { batchesOf } from '@/lib/site-fix/bulk'
import { postFix } from './useSiteFixes'

type Copy = DashboardDictionary['siteHealth']['autofix']
const FIRST = 5

const STATUS_BADGE: Record<JobStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  applied: 'success', sent: 'info', pending: 'neutral', manual: 'warning', failed: 'danger', cancelled: 'neutral', reverted: 'neutral',
}

const errorOf = (copy: Copy, code: string | null) => (code && code in copy.errors ? copy.errors[code as FixErrorCode] : null)

type Entry = { kind: 'job'; job: FixJobView } | { kind: 'batch'; id: string; approvedAt: string; jobs: FixJobView[]; canUndo: boolean }

/** The queue in its order, newest first, with a batch's fixes gathered where its newest one stands. */
export function queueEntries(jobs: readonly FixJobView[], now: number): Entry[] {
  const batches = new Map(batchesOf(jobs, now).map((b) => [b.id, b]))
  const seen = new Set<string>()
  const out: Entry[] = []
  for (const job of jobs) {
    const b = job.batchId ? batches.get(job.batchId) : undefined
    if (!b) { out.push({ kind: 'job', job }); continue }
    if (seen.has(b.id)) continue
    seen.add(b.id)
    out.push({ kind: 'batch', ...b })
  }
  return out
}

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
  const [now] = useState(() => Date.now())
  const entries = useMemo(() => queueEntries(jobs, now), [jobs, now])
  const shown = all ? entries : entries.slice(0, FIRST)

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

  const undoBatch = useCallback(async (batch: string) => {
    if (busy) return
    const c = copy.queue.confirmUndoBatch
    if (!(await confirm({ title: c.title, body: c.body, confirmLabel: c.confirm }))) return
    setBusy(batch)
    const r = await postFix<{ jobs: FixJobView[]; undone: number; failed: number }>('/api/site-health/fixes', { projectId, action: 'undo_batch', batch })
    setBusy(null)
    if (!r.ok) { toasts.error(copy.errors[r.code]); return }
    for (const j of r.jobs) onJob(j)
    const n = r.undone + r.failed
    const msg = copy.queue.batchUndone(r.undone, n)
    if (r.failed > 0) toasts.error(`${msg} ${copy.queue.batchSkipped(r.failed)}`)
    else toasts.success(msg)
  }, [busy, confirm, copy, projectId, toasts, onJob])

  const row = (job: FixJobView, nested = false) => {
    const err = job.status === 'failed' || job.status === 'manual' ? errorOf(copy, job.errorCode) : null
    return (
      <li key={job.id} className={nested ? 'flex flex-col gap-3 py-3 md:flex-row md:items-start md:justify-between' : 'flex flex-col gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-start md:justify-between'} data-fix-job={job.status} data-fix-type={job.type}>
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
  }

  return (
    <section id="fixes" className="scroll-mt-24 rounded-card border border-line bg-surface shadow-card" aria-labelledby="fix-queue-title" data-fix-queue={jobs.length}>
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:px-6">
        <h2 id="fix-queue-title" className="text-section font-semibold text-ink">{copy.queue.title}</h2>
        <p className="text-caption text-muted">{copy.queue.subtitle}</p>
      </div>
      {jobs.length === 0 ? (
        <p className="px-5 py-6 text-copy text-muted sm:px-6" data-fix-queue-empty="">{copy.queue.empty}</p>
      ) : (
        <ul className="divide-y divide-line" role="list">
          {shown.map((e) => (e.kind === 'job' ? row(e.job) : (
            <li key={e.id} className="px-5 py-4 sm:px-6" data-fix-batch={e.jobs.length}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-copy font-semibold text-ink">
                  <Layers size={16} strokeWidth={2} aria-hidden="true" className="text-action" />
                  {copy.queue.batch(when(e.approvedAt), e.jobs.length)}
                </p>
                {e.canUndo && (
                  <Button variant="secondary" size="sm" onClick={() => void undoBatch(e.id)} loading={busy === e.id} disabled={!!busy} data-fix-undo-batch="">
                    <Undo2 size={14} strokeWidth={2} aria-hidden="true" className="rtl:-scale-x-100" />
                    {copy.queue.undoBatch}
                  </Button>
                )}
              </div>
              <ul className="mt-2 divide-y divide-line border-s-0 ps-6" role="list">
                {e.jobs.map((j) => row(j, true))}
              </ul>
            </li>
          )))}
        </ul>
      )}
      {entries.length > FIRST && (
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
