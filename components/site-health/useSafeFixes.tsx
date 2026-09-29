'use client'

/**
 * "Fix {n} safe items for me" (UX decision F), for a WordPress site with the Go Top plugin connected.
 *
 * The count comes from this screen's own scan report and the fix queue (lib/site-fix/bulk.ts
 * `bulkCandidates`: Google titles, Google descriptions and image alt text only; never the home page;
 * never a page with a fix pending or applied in the last 30 days; at most 25 pages). On click every
 * candidate is previewed through the plugin exactly like a single fix, and a suggestion goes into
 * the batch only when it passes `bulkValueProblem` (never the current text, titles 30–60 characters,
 * descriptions 120–155). One confirmation lists every change; then the fixes are approved one after
 * another with the same batch id (the server checks every rule again and refuses anything else with
 * `not_bulk_safe`), each row turning "fixed" as its job applies. The batch can be undone as a whole
 * from the fix queue for 14 days, and each fix keeps its own undo.
 */
import { useCallback, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { useToasts } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Finding, FindingPage } from '@/lib/site-health/types'
import { bulkCandidates, bulkValueProblem, type BulkRow } from '@/lib/site-fix/bulk'
import type { FixJobView, FixPayload } from '@/lib/site-fix/types'
import { postFix } from './useSiteFixes'

type Copy = DashboardDictionary['siteHealth']['autofix']
type BulkType = 'seo_title' | 'meta_description' | 'image_alt'

export interface ReadyFix {
  row: BulkRow & { type: BulkType }
  fix: FixPayload
  before: string | null
  after: string
  expected: string | null
  via: string | null
}

export type SafePhase =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'running'; done: number; n: number }
  | { kind: 'done'; ok: number; n: number; failed: number }

type PreviewAnswer = {
  type: string
  before?: string
  after?: string
  images?: { src: string; after: string }[]
  expected?: string | null
  via?: string
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const pathLabel = (url: string) => { try { const p = decodeURI(new URL(url).pathname); return p.replace(/\/+$/, '') || '/' } catch { return url } }

/** A preview turned into the exact fix the batch would send, or null when it is not safe. */
export function readyFrom(row: BulkRow, p: PreviewAnswer): ReadyFix | null {
  const via = p.via === 'seo_plugin' || p.via === 'wp_title' ? p.via : null
  const expected = typeof p.expected === 'string' ? p.expected : null
  if ((row.type === 'seo_title' || row.type === 'meta_description') && p.type === row.type && typeof p.after === 'string') {
    const value = squash(p.after)
    const fix: FixPayload = { type: row.type, value }
    const before = typeof p.before === 'string' ? p.before : ''
    if (!value || bulkValueProblem(fix, before)) return null
    return { row: row as ReadyFix['row'], fix, before, after: value, expected, via }
  }
  if (row.type === 'image_alt' && p.type === 'image_alt' && Array.isArray(p.images)) {
    const images = p.images.map((i) => ({ src: i.src, alt: squash(i.after ?? '') })).filter((i) => i.src && i.alt)
    const fix: FixPayload = { type: 'image_alt', images }
    if (bulkValueProblem(fix, null)) return null
    return { row: row as ReadyFix['row'], fix, before: null, after: images.map((i) => i.alt).join(' · '), expected, via }
  }
  return null
}

function BulkChanges({ list, copy }: { list: ReadyFix[]; copy: Copy }) {
  const [open, setOpen] = useState(false)
  const b = copy.bulk
  return (
    <div className="space-y-3" data-bulk-changes={list.length}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-control text-copy font-semibold text-action hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        data-bulk-show-all=""
      >
        {open ? b.hideAll : b.showAll}
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cn('transition-transform duration-200 ease-snappy motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="max-h-72 divide-y divide-line overflow-auto rounded-inset border border-line" role="list">
          {list.map((r) => (
            <li key={`${r.row.type}|${r.row.url}`} className="px-3 py-2.5 text-caption" data-bulk-row={r.row.type}>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <bdi dir="ltr" className="font-medium text-ink">{pathLabel(r.row.url)}</bdi>
                <span aria-hidden="true" className="text-muted">·</span>
                <span className="text-muted">
                  {b.field[r.row.type]}
                  {r.fix.type === 'image_alt' ? ` (${b.images(r.fix.images.length)})` : ''}
                </span>
              </p>
              {/* Before and after on their own lines: each keeps its own direction, nothing runs together. */}
              <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt className="text-muted">{copy.approve.before}</dt>
                <dd dir="auto" className={cn('min-w-0 text-body', !r.before && 'italic text-muted')}>{r.before || copy.approve.empty}</dd>
                <dt className="text-muted">{copy.approve.after}</dt>
                <dd dir="auto" className="min-w-0 font-medium text-ink">{r.after}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-muted">{b.excluded}</p>
    </div>
  )
}

export function useSafeFixes({
  projectId, enabled, findings, jobs, fixable, copy, toasts, onJob, onFinished,
}: {
  projectId: string
  /** The plugin is connected and writes all three safe types now. */
  enabled: boolean
  findings: readonly Finding[]
  jobs: readonly FixJobView[]
  /** The screen's own answer: this page can be fixed now and no job holds it. */
  fixable: (finding: Finding, page: FindingPage) => boolean
  copy: Copy
  toasts: ReturnType<typeof useToasts>
  onJob: (job: FixJobView) => void
  onFinished: () => Promise<void> | void
}) {
  const { confirm, dialog } = useConfirm()
  const [phase, setPhase] = useState<SafePhase>({ kind: 'idle' })
  const [now] = useState(() => Date.now())

  const candidates = useMemo(() => {
    if (!enabled) return []
    const byId = new Map(findings.map((f) => [f.id, f]))
    return bulkCandidates(findings, {
      fixable: (id, url) => {
        const f = byId.get(id as Finding['id'])
        const page = f?.pages.find((p) => p.url === url)
        return !!f && !!page && fixable(f, page)
      },
      jobs,
      now,
    })
  }, [enabled, findings, jobs, fixable, now])

  const start = useCallback(async () => {
    if (phase.kind === 'preparing' || phase.kind === 'running' || candidates.length === 0) return
    setPhase({ kind: 'preparing' })
    // Every candidate is read again through the plugin, three at a time.
    const ready: (ReadyFix | null)[] = new Array(candidates.length).fill(null)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, async () => {
      while (next < candidates.length) {
        const i = next++
        const row = candidates[i]
        const r = await postFix<PreviewAnswer>('/api/site-health/fixes', { projectId, action: 'preview', type: row.type, kind: row.kind, url: row.url })
        if (r.ok && (r as unknown as { channel?: string }).channel === 'plugin') ready[i] = readyFrom(row, r as unknown as PreviewAnswer)
      }
    }))
    const list = ready.filter((x): x is ReadyFix => !!x)
    if (list.length === 0) {
      setPhase({ kind: 'idle' })
      toasts.success(copy.bulk.nothingReady)
      return
    }
    const count = (t: BulkType) => list.filter((x) => x.row.type === t).length
    const ok = await confirm({
      title: copy.bulk.confirmTitle(list.length),
      body: copy.bulk.confirmBody(count('seo_title'), count('meta_description'), count('image_alt')),
      details: <BulkChanges list={list} copy={copy} />,
      confirmLabel: copy.bulk.confirm(list.length),
      cancelLabel: copy.bulk.cancel,
      size: 'lg',
    })
    if (!ok) { setPhase({ kind: 'idle' }); return }

    const batch = crypto.randomUUID()
    let applied = 0
    setPhase({ kind: 'running', done: 0, n: list.length })
    for (let i = 0; i < list.length; i++) {
      const r = list[i]
      const answer = await postFix<{ job: FixJobView }>('/api/site-health/fixes', {
        projectId, action: 'approve', approved: true, kind: r.row.kind, pageUrl: r.row.url, fix: r.fix,
        expected: r.expected, via: r.via, before: r.before, bulk: { batch },
      })
      if (answer.ok) {
        onJob(answer.job)
        if (answer.job.status === 'applied') applied++
      }
      setPhase({ kind: 'running', done: i + 1, n: list.length })
    }
    const failed = list.length - applied
    setPhase({ kind: 'done', ok: applied, n: list.length, failed })
    const summary = copy.bulk.summary(applied, list.length)
    if (failed > 0) toasts.error(`${summary} ${copy.bulk.failed(failed)}`)
    else toasts.success(summary)
    await onFinished()
  }, [phase.kind, candidates, projectId, confirm, copy, toasts, onJob, onFinished])

  return { count: candidates.length, phase, start, dialog }
}
