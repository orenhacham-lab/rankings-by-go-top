'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { TrackingTarget, ScanResult } from '@/lib/supabase/types'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { EngineLabel, PositionChange } from '@/components/ui/StatusBadge'
import PositionChip from '@/components/ui/PositionChip'
import Sparkline from '@/components/ui/Sparkline'
import { useFirstEntrance } from '@/components/ui/motion'
import { formatCount } from '@/components/gsc/format'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import RowMenu, { type RowMenuItem } from '@/components/ui/RowMenu'
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog'
import TrackingTargetForm from './TrackingTargetForm'
import { toggleTrackingTargetActiveAction, deleteTrackingTargetAction } from '@/app/actions/tracking-targets'
import { formatDateTime } from '@/lib/utils'
import { displayUrl } from '@/lib/format/display-url'
import { Skeleton } from '@/components/ui/Skeleton'
import { sortTargetsByPosition } from '@/lib/sorting'
import { ArrowDown, ArrowUp, ArrowUpDown, FileSearch, History, KeyRound, PauseCircle, Pencil, PlayCircle, RefreshCw, Trash2 } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import TopCompetitorLine from '@/components/competitors/TopCompetitorLine'
import type { CompetitorView } from '@/components/competitors/useCompetitorComparison'
import { GscVolumeCell, type GscKeywordsView } from '@/components/gsc/GscKeywordFigures'

/** The table's columns: keyword, type, volume, position, change, last check, actions. */
const COLUMNS = 7

/** A sortable header: the label and its lucide arrow, keyboard-visible focus. */
const SORT_BUTTON = 'inline-flex items-center gap-1 rounded-control font-semibold transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20'

interface TrackingTargetsTableProps {
  targets: TrackingTarget[]
  latestResults?: Record<string, ScanResult>
  /** Each keyword's last checks, oldest first (null where it was not found): the trend line. */
  positionHistory?: Record<string, (number | null)[]>
  projectId: string
  projectCity?: string | null
  projectCountry?: string
  projectDomain?: string
  projectBusinessName?: string
  onScanTarget?: (targetId: string) => void
  scanningTargets?: Set<string>
  /** True while an automatic search-volume refresh is running for this project.
   *  A blank volume cell looks like a broken feature; "fetching" is the truth. */
  volumePending?: boolean
  /** True when the last automatic refresh could not produce a volume. The cell
   *  says so explicitly rather than showing a dash indistinguishable from
   *  "this keyword has no search volume". */
  volumeUnavailable?: boolean
  /** The keyword list is still loading, or could not be read. Reported HERE,
   *  on the thing that is missing, rather than by holding the whole page —
   *  the header, the tabs and the actions do not depend on it. */
  targetsLoading?: boolean
  targetsError?: boolean
  onRetryTargets?: () => void
  /** Lets the merchant retry a volume that came back empty or unavailable,
   *  without hunting for the toolbar button. */
  onRetryVolumes?: () => void
  projectDevice?: string | null
  onActionComplete?: () => void
  /** You vs. competitors: when given, a line under each position shows the
   *  best-placed competitor of the same check. */
  competitorView?: CompetitorView
  /** Search Console: when given, a line under each search volume shows the keyword's
   *  clicks and impressions from Google over the last 28 days. While Search Console
   *  is switched off on the server there is no line, and the cell is the volume alone. */
  gscKeywords?: GscKeywordsView
  /** The empty project's one action (the page's add-keyword button); row actions stay in the row menu. */
  emptyAction?: ReactNode
}

export default function TrackingTargetsTable({
  targets,
  latestResults = {},
  positionHistory = {},
  projectId,
  projectCity,
  projectCountry,
  projectDomain,
  projectBusinessName,
  onScanTarget,
  scanningTargets = new Set(),
  volumePending = false,
  volumeUnavailable = false,
  onRetryVolumes,
  targetsLoading = false,
  targetsError = false,
  onRetryTargets,
  projectDevice,
  onActionComplete,
  competitorView,
  gscKeywords,
  emptyAction,
}: TrackingTargetsTableProps) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const k = dict.projectDetail.table
  const kp = dict.keywordsPage

  const [editingTarget, setEditingTarget] = useState<TrackingTarget | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  type SortColumn = 'position' | 'keyword' | 'date' | 'volume'
  const [sortBy, setSortBy] = useState<SortColumn>('position')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(column)
    setSortDir(column === 'keyword' ? 'asc' : 'desc')
  }

  const sortedTargets = useMemo(() => {
    if (sortBy === 'position') {
      const sorted = sortTargetsByPosition(targets, latestResults)
      return sortDir === 'desc' ? sorted.reverse() : sorted
    }

    const copy = [...targets]
    copy.sort((a, b) => {
      const aResult = latestResults[a.id]
      const bResult = latestResults[b.id]
      const dir = sortDir === 'asc' ? 1 : -1

      if (sortBy === 'keyword') {
        return a.keyword.localeCompare(b.keyword, 'he') * dir
      }

      if (sortBy === 'date') {
        const aDate = aResult?.checked_at ? new Date(aResult.checked_at).getTime() : 0
        const bDate = bResult?.checked_at ? new Date(bResult.checked_at).getTime() : 0
        return (aDate - bDate) * dir
      }

      if (sortBy === 'volume') {
        const aVol = a.avg_monthly_searches ?? -1
        const bVol = b.avg_monthly_searches ?? -1
        return (aVol - bVol) * dir
      }
      return 0
    })
    return copy
  }, [targets, latestResults, sortBy, sortDir])

  // Lucide sort arrows (§6), never a glyph: which column, and which way.
  function sortLabel(column: SortColumn) {
    const Icon = sortBy !== column ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
    return <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${sortBy === column ? 'text-ink' : 'text-muted/70'}`} />
  }

  async function handleToggleActive(target: TrackingTarget) {
    setTogglingId(target.id)
    try {
      await toggleTrackingTargetActiveAction(target.id, target.is_active, projectId)
      onActionComplete?.()
    } finally {
      setTogglingId(null)
    }
  }

  // The rows rise in once, when the list first arrives; a sort or a refetch shows them at once.
  const rowsEnter = useFirstEntrance(!targetsLoading && targets.length > 0)

  const confirmTarget = confirmDeleteId ? targets.find((t) => t.id === confirmDeleteId) ?? null : null

  // A project with no keywords yet: one empty state and its one action, not an empty table.
  if (targets.length === 0 && !targetsLoading && !targetsError) {
    return (
      <Card padding={false}>
        <EmptyState
          icon={<KeyRound />}
          title={k.emptyState}
          action={emptyAction}
        />
      </Card>
    )
  }

  return (
    <>
      <Table>
        <TableHead>
          <tr className="max-sm:[&>th]:px-2.5">
            <Th>
              <button type="button" onClick={() => handleSort('keyword')} className={SORT_BUTTON}>{k.keyword}{sortLabel('keyword')}</button>
            </Th>
            {/* PRIORITY COLUMNS: a phone shows keyword, position (with its change
                under it) and actions; the rest return as the screen widens.
                SEVEN COLUMNS, NOT NINE (final review R19): "found" said again what the
                position already says ("not found" instead of a number), and "status"
                was a green "active" on every row. The one exception, a paused keyword,
                is a badge beside its name. */}
            <Th className="hidden md:table-cell">{k.scanType}</Th>
            <Th className="hidden sm:table-cell">
              <button type="button" onClick={() => handleSort('volume')} className={SORT_BUTTON}>{k.searchVolume}{sortLabel('volume')}</button>
            </Th>
            <Th>
              <button type="button" onClick={() => handleSort('position')} className={SORT_BUTTON}>{k.position}{sortLabel('position')}</button>
            </Th>
            <Th className="hidden sm:table-cell">{k.change}</Th>
            <Th className="hidden lg:table-cell">
              <button type="button" onClick={() => handleSort('date')} className={SORT_BUTTON}>{k.lastChecked}{sortLabel('date')}</button>
            </Th>
            <Th>{k.actions}</Th>
          </tr>
        </TableHead>
        <TableBody enter={rowsEnter}>
          {/* THREE DISTINCT ANSWERS, never one. "Still loading", "could not be
              read — try again" and "there are none yet" mean different things
              to a merchant, and collapsing them into an empty table is how a
              failure reads as an empty project. */}
          {targets.length === 0 && targetsLoading && (
            // The rows' own shape while they load, which the rows then replace.
            Array.from({ length: 5 }, (_, i) => (
              <tr key={`loading-${i}`} aria-hidden={i > 0 || undefined}>
                <td colSpan={COLUMNS} className="px-4 py-3.5">
                  {i === 0 && <span role="status" className="sr-only">{k.keywordsLoading}</span>}
                  <div className="flex items-center gap-6">
                    <Skeleton className="h-3.5 w-1/4" />
                    <Skeleton className="hidden h-3.5 w-16 sm:block" />
                    <Skeleton className="h-8 w-12" />
                    <Skeleton className="hidden h-6 w-20 md:block" />
                    <Skeleton className="ms-auto h-3.5 w-24" />
                  </div>
                </td>
              </tr>
            ))
          )}
          {targets.length === 0 && !targetsLoading && targetsError && (
            <tr>
              <td colSpan={COLUMNS} className="px-4 py-8 text-center text-copy text-muted">
                {k.keywordsLoadFailed}
                {onRetryTargets && (
                  <button
                    type="button"
                    onClick={onRetryTargets}
                    className="ms-2 underline decoration-dotted underline-offset-2 hover:text-ink"
                  >
                    {k.volumeRetry}
                  </button>
                )}
              </td>
            </tr>
          )}
          {sortedTargets.map((target) => {
            const result = latestResults[target.id]
            const history = positionHistory[target.id] ?? []
            const isScanning = scanningTargets.has(target.id)
            // One row, about 56px on a desktop (UX review P1-17): the position check
            // stays in view as an icon, everything else is the same actions behind "⋯".
            const menu: RowMenuItem[] = [
              { key: 'edit', label: k.edit, icon: <Pencil size={15} aria-hidden="true" />, onSelect: () => setEditingTarget(target) },
              {
                key: 'toggle', label: target.is_active ? k.deactivate : k.activate, disabled: togglingId === target.id,
                icon: target.is_active ? <PauseCircle size={15} aria-hidden="true" /> : <PlayCircle size={15} aria-hidden="true" />,
                onSelect: () => { void handleToggleActive(target) },
              },
              { key: 'history', label: k.history, icon: <History size={15} aria-hidden="true" />, href: `/keywords/${target.id}/history` },
            ]
            if (result && result.audit_request != null) {
              menu.push({ key: 'details', label: k.details, icon: <FileSearch size={15} aria-hidden="true" />, href: `/scans/${result.scan_id}/details?resultId=${result.id}` })
            }
            // Deleting stays for a deactivated keyword only, and still asks first.
            if (!target.is_active) {
              menu.push({ key: 'delete', label: k.delete, danger: true, icon: <Trash2 size={15} aria-hidden="true" />, onSelect: () => setConfirmDeleteId(target.id) })
            }
            return (
              <TableRow key={target.id} className="[&>td]:py-2 max-sm:[&>td]:px-2.5">
                <Td className="min-w-[7rem] sm:whitespace-nowrap">
                  <span className="font-semibold text-ink">{target.keyword}</span>
                  {!target.is_active && <Badge variant="neutral" className="ms-2 align-middle">{dict.common.inactive}</Badge>}
                  {target.notes && (
                    <p className="mt-0.5 max-w-56 truncate text-caption text-muted" title={target.notes}>{target.notes}</p>
                  )}
                </Td>
                <Td className="hidden whitespace-nowrap md:table-cell">
                  <EngineLabel engine={target.engine_type} device={projectDevice} />
                </Td>
                <Td className="hidden sm:table-cell">
                  <GscVolumeCell view={gscKeywords} targetId={target.id}>
                    {target.avg_monthly_searches !== null && target.avg_monthly_searches !== undefined ? (
                      <span className="text-copy tabular-nums text-body">
                        {target.avg_monthly_searches.toLocaleString(language === 'he' ? 'he-IL' : 'en-US')}
                      </span>
                    ) : volumePending ? (
                      // TRUTHFUL PENDING STATE. An em dash is indistinguishable
                      // from "this feature does not work"; a new keyword whose
                      // volume is on its way should say so.
                      <span className="inline-flex items-center gap-2 text-caption text-muted">
                        <Skeleton className="h-3.5 w-10" />
                        {k.volumePending}
                      </span>
                    ) : volumeUnavailable && onRetryVolumes ? (
                      <button
                        type="button"
                        onClick={onRetryVolumes}
                        className="text-start text-caption text-warn underline decoration-dotted underline-offset-2 hover:text-ink"
                        title={k.volumeRetry}
                      >
                        {k.volumeUnavailable} · {k.volumeRetry}
                      </button>
                    ) : onRetryVolumes ? (
                      <button
                        type="button"
                        onClick={onRetryVolumes}
                        className="text-copy text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
                        title={k.volumeRetry}
                        aria-label={k.volumeRetry}
                      >
                        —
                      </button>
                    ) : (
                      <span className="text-copy text-muted" title={k.notChecked}>
                        —
                      </span>
                    )}
                  </GscVolumeCell>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    {result ? (
                      <PositionChip position={result.position} found={result.found} notFoundLabel={k.notFound} />
                    ) : (
                      <span className="inline-flex h-8 items-center text-copy text-muted">—</span>
                    )}
                    {result && <span className="sm:hidden"><PositionChange change={result.change_value} /></span>}
                    {competitorView && <TopCompetitorLine view={competitorView} targetId={target.id} />}
                  </div>
                </Td>
                <Td className="hidden sm:table-cell">
                  {result ? (
                    <div className="flex items-center gap-3">
                      <Sparkline
                        values={history}
                        invert
                        label={kp.trendLabel(target.keyword, formatCount(history.length, language))}
                        className="hidden md:block"
                      />
                      <PositionChange change={result.change_value} />
                    </div>
                  ) : '—'}
                </Td>
                <Td className="hidden whitespace-nowrap lg:table-cell">
                  {result ? (
                    <div>
                      <span className="text-caption text-muted">{formatDateTime(result.checked_at, language)}</span>
                      {result.result_url && (
                        <a
                          href={result.result_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          dir="ltr"
                          title={result.result_url}
                          className="block max-w-48 truncate text-caption text-muted transition-colors hover:text-action hover:underline"
                        >
                          {displayUrl(result.result_url)}
                        </a>
                      )}
                    </div>
                  ) : '—'}
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    {onScanTarget && target.is_active && (
                      <button
                        type="button"
                        onClick={() => onScanTarget(target.id)}
                        disabled={isScanning}
                        aria-busy={isScanning || undefined}
                        aria-label={k.scanNow(target.keyword)}
                        title={k.scan}
                        className="grid size-8 place-items-center rounded-control text-action transition-[background-color,transform] duration-200 ease-snappy hover:bg-action-soft motion-safe:hover:rotate-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-wait disabled:opacity-60"
                      >
                        <RefreshCw size={16} strokeWidth={2} aria-hidden="true" className={isScanning ? 'animate-spin motion-reduce:animate-none' : undefined} />
                      </button>
                    )}
                    <RowMenu label={k.moreActions(target.keyword)} items={menu} />
                  </div>
                </Td>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <DeleteConfirmDialog
        open={confirmTarget !== null}
        name={confirmTarget?.keyword ?? ''}
        labels={{ title: k.deleteTitle, body: k.deleteBody, confirm: k.confirmDelete, cancel: k.cancel, deleting: k.deleting, error: k.deleteFailed }}
        onConfirm={async () => {
          if (!confirmTarget) return { ok: false }
          await deleteTrackingTargetAction(confirmTarget.id, projectId)
          return { ok: true }
        }}
        onClose={() => setConfirmDeleteId(null)}
        onDeleted={() => onActionComplete?.()}
      />

      {editingTarget && (
        <Modal
          open={!!editingTarget}
          onClose={() => setEditingTarget(null)}
          title={k.editKeywordTitle}
          size="md"
        >
          <TrackingTargetForm
            target={editingTarget}
            projectId={projectId}
            projectCity={projectCity}
            projectCountry={projectCountry}
            defaultDomain={projectDomain}
            defaultBusinessName={projectBusinessName}
            onSuccess={() => { setEditingTarget(null); onActionComplete?.() }}
            onCancel={() => setEditingTarget(null)}
          />
        </Modal>
      )}
    </>
  )
}
