'use client'

/**
 * The project's rank-check history, as a section of Keywords and of Reports.
 *
 * It was a tab of its own ("Scans"): a list of runs with a date and a count, and
 * nothing in it that Keywords and Reports did not already say better. The UX
 * review folded it away (decision 5), so this is the same history where it is
 * read: the latest check in the section's heading, the runs when it is opened,
 * and, per run, the keywords it checked, each with its position, its engine and
 * a link to that keyword's own history. /scans redirects to Keywords with this
 * section open (?history=1), so old links keep working.
 *
 * Reads are the current project's only: the runs by project_id, and a run's
 * keywords by the id of a run that came from that list (RLS applies as well).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { EngineType, Scan, ScanResult } from '@/lib/supabase/types'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { ScanStatusBadge, PositionChange } from '@/components/ui/StatusBadge'
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

/** How many runs the section lists: enough for a year of weekly checks. */
export const SCAN_HISTORY_LIMIT = 60

type Run = Pick<Scan, 'id' | 'status' | 'triggered_by' | 'total_targets' | 'completed_targets' | 'failed_targets' | 'started_at' | 'completed_at' | 'created_at'>
type Row = Pick<ScanResult, 'id' | 'tracking_target_id' | 'engine_type' | 'keyword' | 'found' | 'position' | 'change_value'>

/** When a run happened, for a person: when it finished, else when it started. */
function runTime(run: Run): string {
  return run.completed_at ?? run.started_at ?? run.created_at
}

export function EngineChip({ engine }: { engine: EngineType | string }) {
  const { uiLocale } = useDashboardLanguage()
  const c = getDashboardDictionary(uiLocale).common
  return engine === 'google_maps'
    ? <Badge variant="success">{c.engineGoogleMaps}</Badge>
    : <Badge variant="info">{c.engineGoogleSearch}</Badge>
}

export default function ScanHistory({
  projectId,
  defaultOpen = false,
  className,
}: {
  projectId: string | null
  /** Open on arrival (Keywords with ?history=1, where /scans leads). */
  defaultOpen?: boolean
  className?: string
}) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).scans
  const [open, setOpen] = useState(defaultOpen)
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void withDeadline(
      createClient()
        .from('scans')
        .select('id, status, triggered_by, total_targets, completed_targets, failed_targets, started_at, completed_at, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(SCAN_HISTORY_LIMIT)
    ).then((res) => {
      if (cancelled) return
      if (!res || res.error) { setError(true); return }
      setError(false)
      setRuns((res.data ?? []) as Run[])
    })
    return () => { cancelled = true }
  }, [projectId, attempt])

  if (!projectId) return null
  const latest = runs?.find((r) => r.status === 'completed') ?? runs?.[0] ?? null
  const bodyId = 'scan-history-body'

  return (
    <section
      id="scan-history"
      aria-labelledby="scan-history-title"
      data-scan-history={open ? 'open' : 'closed'}
      className={cn('scroll-mt-20 rounded-card border border-line bg-surface shadow-card', className)}
    >
      <h2 id="scan-history-title" className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-card px-5 py-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-control bg-action-soft text-action">
            <History size={18} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-section font-semibold text-ink">{t.title}</span>
            <span className="block text-caption text-muted">
              {latest ? t.lastCheck(formatDateTime(runTime(latest))) : runs ? t.table.emptyState : t.subtitle}
            </span>
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className={cn('shrink-0 text-muted transition-transform duration-200 ease-snappy', open && 'rotate-180')}
          />
        </button>
      </h2>

      <div id={bodyId} hidden={!open} className="border-t border-line px-5 pb-5 pt-4">
        {open && (
          error ? (
            <p className="text-copy text-muted">
              {t.loadError}{' '}
              <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>{t.retry}</Button>
            </p>
          ) : runs === null ? (
            <TableSkeleton label={t.loadingHistory} rows={4} />
          ) : runs.length === 0 ? (
            <p className="text-copy text-muted">{t.table.emptyState}</p>
          ) : (
            <>
              <ul className="divide-y divide-line overflow-hidden rounded-inset border border-line">
                {runs.map((run) => <RunRow key={run.id} run={run} />)}
              </ul>
              {runs.length >= SCAN_HISTORY_LIMIT && (
                <p className="mt-2 text-caption text-muted">{t.moreChecks(SCAN_HISTORY_LIMIT)}</p>
              )}
            </>
          )
        )}
      </div>
    </section>
  )
}

/** One run: when, how it started, how many keywords, and its keywords on demand. */
function RunRow({ run }: { run: Run }) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).scans
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const listId = `scan-run-${run.id}`

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void withDeadline(
      createClient()
        .from('scan_results')
        .select('id, tracking_target_id, engine_type, keyword, found, position, change_value')
        .eq('scan_id', run.id)
        .order('keyword', { ascending: true })
    ).then((res) => {
      if (cancelled) return
      if (!res || res.error) { setError(true); return }
      setError(false)
      setRows((res.data ?? []) as Row[])
    })
    return () => { cancelled = true }
  }, [open, run.id, attempt])

  return (
    <li data-scan-run={run.id}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="min-w-[9rem] text-copy font-medium text-ink tabular-nums" dir="ltr">{formatDateTime(runTime(run))}</span>
        <ScanStatusBadge status={run.status} />
        <Badge variant={run.triggered_by === 'scheduled' ? 'info' : 'neutral'}>
          {run.triggered_by === 'scheduled' ? t.trigger.automatic : t.trigger.manual}
        </Badge>
        <span className="text-caption text-muted tabular-nums">
          {t.table.results}: {run.completed_targets} / {run.total_targets}
          {run.failed_targets > 0 && <span className="ms-1 text-bad">{t.table.failedSuffix(run.failed_targets)}</span>}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="ms-auto inline-flex items-center gap-1 rounded-control px-2 py-1 text-caption font-semibold text-action hover:bg-action-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          {t.showKeywords}
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={cn('transition-transform duration-200 ease-snappy', open && 'rotate-180')} />
        </button>
      </div>
      <div id={listId} hidden={!open} className="bg-sunk/40 px-4 pb-3">
        {open && (
          error ? (
            <p className="py-2 text-caption text-muted">
              {t.keywordsLoadError}{' '}
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-medium text-action underline decoration-dotted underline-offset-2">{t.retry}</button>
            </p>
          ) : rows === null ? (
            <div role="status" aria-busy="true" className="space-y-2 py-2">
              <span className="sr-only">{t.loadingKeywords}</span>
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-2 text-caption text-muted">{t.noKeywords}</p>
          ) : (
            <table className="w-full text-copy tabular-nums">
              <thead>
                <tr className="text-caption text-muted">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t.table.keyword}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t.table.engine}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t.table.position}</th>
                  <th scope="col" className="py-2 text-start font-medium"><span className="sr-only">{t.table.actions}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} data-scan-keyword={row.keyword}>
                    <td className="py-2 pe-3 text-ink">{row.keyword}</td>
                    <td className="py-2 pe-3"><EngineChip engine={row.engine_type} /></td>
                    <td className="py-2 pe-3">
                      {row.found && row.position !== null ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-semibold text-ink">#{row.position}</span>
                          <PositionChange change={row.change_value} />
                        </span>
                      ) : (
                        <span className="text-muted">{t.table.notFound}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <span className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-caption font-medium">
                        <Link href={`/keywords/${encodeURIComponent(row.tracking_target_id)}/history`} className="text-action hover:underline">{t.keywordHistory}</Link>
                        <Link href={`/scans/${encodeURIComponent(run.id)}/details?resultId=${encodeURIComponent(row.id)}`} className="text-action hover:underline">{t.table.viewDetails}</Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </li>
  )
}
