'use client'

import { useMemo, useState } from 'react'
import { TrackingTarget, ScanResult } from '@/lib/supabase/types'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge, EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import RowMenu, { type RowMenuItem } from '@/components/ui/RowMenu'
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog'
import TrackingTargetForm from './TrackingTargetForm'
import { toggleTrackingTargetActiveAction, deleteTrackingTargetAction } from '@/app/actions/tracking-targets'
import { formatDateTime } from '@/lib/utils'
import { sortTargetsByPosition } from '@/lib/sorting'
import { FileSearch, History, PauseCircle, Pencil, PlayCircle, RefreshCw, Trash2 } from 'lucide-react'
import TopCompetitorLine from '@/components/competitors/TopCompetitorLine'
import type { CompetitorView } from '@/components/competitors/useCompetitorComparison'
import { GscVolumeCell, type GscKeywordsView } from '@/components/gsc/GscKeywordFigures'

interface TrackingTargetsTableProps {
  targets: TrackingTarget[]
  latestResults?: Record<string, ScanResult>
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
}

export default function TrackingTargetsTable({
  targets,
  latestResults = {},
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
}: TrackingTargetsTableProps) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const k = dict.projectDetail.table

  const [editingTarget, setEditingTarget] = useState<TrackingTarget | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  type SortColumn = 'position' | 'keyword' | 'date' | 'found' | 'volume'
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

      const aFound = aResult?.found ? 1 : 0
      const bFound = bResult?.found ? 1 : 0
      return (aFound - bFound) * dir
    })
    return copy
  }, [targets, latestResults, sortBy, sortDir])

  function sortLabel(column: SortColumn) {
    if (sortBy !== column) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
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

  const confirmTarget = confirmDeleteId ? targets.find((t) => t.id === confirmDeleteId) ?? null : null

  return (
    <>
      <Table>
        <TableHead>
          <tr>
            <Th>
              <button type="button" onClick={() => handleSort('keyword')} className="font-semibold">{k.keyword}{sortLabel('keyword')}</button>
            </Th>
            <Th>{k.scanType}</Th>
            <Th>
              <button type="button" onClick={() => handleSort('volume')} className="font-semibold">{k.searchVolume}{sortLabel('volume')}</button>
            </Th>
            <Th>
              <button type="button" onClick={() => handleSort('position')} className="font-semibold">{k.position}{sortLabel('position')}</button>
            </Th>
            <Th>{k.change}</Th>
            <Th>
              <button type="button" onClick={() => handleSort('date')} className="font-semibold">{k.lastChecked}{sortLabel('date')}</button>
            </Th>
            <Th>
              <button type="button" onClick={() => handleSort('found')} className="font-semibold">{k.found}{sortLabel('found')}</button>
            </Th>
            <Th>{k.status}</Th>
            <Th>{k.actions}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {/* THREE DISTINCT ANSWERS, never one. "Still loading", "could not be
              read — try again" and "there are none yet" mean different things
              to a merchant, and collapsing them into an empty table is how a
              failure reads as an empty project. */}
          {targets.length === 0 && targetsLoading && (
            <EmptyRow colSpan={9} message={k.keywordsLoading} />
          )}
          {targets.length === 0 && !targetsLoading && targetsError && (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted">
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
          {targets.length === 0 && !targetsLoading && !targetsError && (
            <EmptyRow colSpan={9} message={k.emptyState} />
          )}
          {sortedTargets.map((target) => {
            const result = latestResults[target.id]
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
              <TableRow key={target.id} className="[&>td]:py-2">
                <Td className="whitespace-nowrap">
                  <span className="font-medium text-ink">{target.keyword}</span>
                  {target.notes && (
                    <p className="mt-0.5 max-w-56 truncate text-caption text-muted" title={target.notes}>{target.notes}</p>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  <EngineBadge engine={target.engine_type} device={projectDevice} />
                </Td>
                <Td>
                  <GscVolumeCell view={gscKeywords} targetId={target.id}>
                    {target.avg_monthly_searches !== null && target.avg_monthly_searches !== undefined ? (
                      <span className="text-sm tabular-nums text-body">
                        {target.avg_monthly_searches.toLocaleString(language === 'he' ? 'he-IL' : 'en-US')}
                      </span>
                    ) : volumePending ? (
                      // TRUTHFUL PENDING STATE. An em dash is indistinguishable
                      // from "this feature does not work"; a new keyword whose
                      // volume is on its way should say so.
                      <span className="text-sm text-muted animate-pulse motion-reduce:animate-none">
                        {k.volumePending}
                      </span>
                    ) : volumeUnavailable && onRetryVolumes ? (
                      <button
                        type="button"
                        onClick={onRetryVolumes}
                        className="text-start text-xs text-warn underline decoration-dotted underline-offset-2 hover:text-ink"
                        title={k.volumeRetry}
                      >
                        {k.volumeUnavailable} · {k.volumeRetry}
                      </button>
                    ) : onRetryVolumes ? (
                      <button
                        type="button"
                        onClick={onRetryVolumes}
                        className="text-sm text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
                        title={k.volumeRetry}
                        aria-label={k.volumeRetry}
                      >
                        —
                      </button>
                    ) : (
                      <span className="text-sm text-muted" title={k.notChecked}>
                        —
                      </span>
                    )}
                  </GscVolumeCell>
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-0.5">
                    {result ? (
                      result.found ? (
                        <span className="text-base font-bold leading-5 text-ink">
                          #{result.position}
                        </span>
                      ) : (
                        <span className="text-sm text-muted">{k.notFound}</span>
                      )
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                    {competitorView && <TopCompetitorLine view={competitorView} targetId={target.id} />}
                  </div>
                </Td>
                <Td>
                  {result ? (
                    <PositionChange change={result.change_value} />
                  ) : '—'}
                </Td>
                <Td className="whitespace-nowrap">
                  {result ? (
                    <div>
                      <span className="text-xs text-muted">{formatDateTime(result.checked_at, language)}</span>
                      {result.result_url && (
                        <a
                          href={result.result_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          dir="ltr"
                          className="block max-w-40 truncate text-xs text-action hover:underline"
                        >
                          {result.result_url}
                        </a>
                      )}
                    </div>
                  ) : '—'}
                </Td>
                <Td>
                  <Badge variant={result?.found ? 'success' : 'neutral'}>
                    {result ? (result.found ? k.yesFound : k.noNotFound) : '—'}
                  </Badge>
                </Td>
                <Td>
                  <ActiveBadge active={target.is_active} />
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
                        className="grid size-8 place-items-center rounded-control text-action transition-colors hover:bg-action-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-wait disabled:opacity-60"
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
