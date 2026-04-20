'use client'

import { useMemo, useState } from 'react'
import { TrackingTarget, ScanResult } from '@/lib/supabase/types'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge, EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import TrackingTargetForm from './TrackingTargetForm'
import { toggleTrackingTargetActiveAction, deleteTrackingTargetAction } from '@/app/actions/tracking-targets'
import { formatDateTime } from '@/lib/utils'
import { sortTargetsByPosition } from '@/lib/sorting'
import Link from 'next/link'

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
  projectDevice?: string | null
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
  projectDevice,
}: TrackingTargetsTableProps) {
  const [editingTarget, setEditingTarget] = useState<TrackingTarget | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'position' | 'keyword' | 'date' | 'found'>('position')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(column: 'position' | 'keyword' | 'date' | 'found') {
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

      const aFound = aResult?.found ? 1 : 0
      const bFound = bResult?.found ? 1 : 0
      return (aFound - bFound) * dir
    })
    return copy
  }, [targets, latestResults, sortBy, sortDir])

  function sortLabel(column: 'position' | 'keyword' | 'date' | 'found') {
    if (sortBy !== column) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  async function handleToggleActive(target: TrackingTarget) {
    setTogglingId(target.id)
    try {
      await toggleTrackingTargetActiveAction(target.id, target.is_active, projectId)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(targetId: string) {
    setDeletingId(targetId)
    try {
      await deleteTrackingTargetAction(targetId, projectId)
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <>
      <Table>
        <TableHead>
          <tr>
            <Th>
              <button type="button" onClick={() => handleSort('keyword')} className="font-semibold">מילת מפתח{sortLabel('keyword')}</button>
            </Th>
            <Th>סוג סריקה</Th>
            <Th>
              <button type="button" onClick={() => handleSort('position')} className="font-semibold">מיקום נוכחי{sortLabel('position')}</button>
            </Th>
            <Th>שינוי</Th>
            <Th>
              <button type="button" onClick={() => handleSort('date')} className="font-semibold">בדיקה אחרונה{sortLabel('date')}</button>
            </Th>
            <Th>
              <button type="button" onClick={() => handleSort('found')} className="font-semibold">נמצא{sortLabel('found')}</button>
            </Th>
            <Th>סטטוס</Th>
            <Th>פעולות</Th>
          </tr>
        </TableHead>
        <TableBody>
          {targets.length === 0 && (
            <EmptyRow colSpan={8} message="אין מילות מפתח עדיין. הוסף את הראשונה!" />
          )}
          {sortedTargets.map((target) => {
            const result = latestResults[target.id]
            const isScanning = scanningTargets.has(target.id)
            return (
              <TableRow key={target.id}>
                <Td>
                  <div>
                    <span className="font-medium text-slate-800">{target.keyword}</span>
                    {target.notes && (
                      <p className="text-xs text-slate-400 mt-0.5">{target.notes}</p>
                    )}
                  </div>
                </Td>
                <Td>
                  <EngineBadge engine={target.engine_type} device={projectDevice} />
                </Td>
                <Td>
                  {result ? (
                    result.found ? (
                      <span className="font-bold text-slate-800 text-base">
                        #{result.position}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-sm">לא נמצא</span>
                    )
                  ) : (
                    <span className="text-slate-300 text-sm">—</span>
                  )}
                </Td>
                <Td>
                  {result ? (
                    <PositionChange change={result.change_value} />
                  ) : '—'}
                </Td>
                <Td>
                  {result ? (
                    <div>
                      <span className="text-xs text-slate-500">{formatDateTime(result.checked_at)}</span>
                      {result.result_url && (
                        <a
                          href={result.result_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-blue-500 hover:underline truncate max-w-40 mt-0.5"
                        >
                          {result.result_url}
                        </a>
                      )}
                    </div>
                  ) : '—'}
                </Td>
                <Td>
                  <Badge variant={result?.found ? 'success' : 'neutral'}>
                    {result ? (result.found ? 'כן' : 'לא') : '—'}
                  </Badge>
                </Td>
                <Td>
                  <ActiveBadge active={target.is_active} />
                </Td>
                <Td>
                  <div className="flex gap-1.5 flex-wrap">
                    {onScanTarget && target.is_active && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={isScanning}
                        onClick={() => onScanTarget(target.id)}
                      >
                        סרוק
                      </Button>
                    )}
                    {result && result.audit_request != null && (
                      <Link href={`/scans/${result.scan_id}/details`}>
                        <Button size="sm" variant="ghost">
                          פרטים
                        </Button>
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingTarget(target)}
                    >
                      עריכה
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={togglingId === target.id}
                      onClick={() => handleToggleActive(target)}
                    >
                      {target.is_active ? 'השבת' : 'הפעל'}
                    </Button>
                    <Link href={`/keywords/${target.id}/history`}>
                      <Button size="sm" variant="ghost">
                        היסטוריה
                      </Button>
                    </Link>
                    {!target.is_active && (
                      confirmDeleteId === target.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={deletingId === target.id}
                            onClick={() => handleDelete(target.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            אשר מחיקה
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            ביטול
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(target.id)}
                          className="text-red-500 hover:text-red-600"
                        >
                          מחק
                        </Button>
                      )
                    )}
                  </div>
                </Td>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {editingTarget && (
        <Modal
          open={!!editingTarget}
          onClose={() => setEditingTarget(null)}
          title="עריכת מילת מפתח"
          size="md"
        >
          <TrackingTargetForm
            target={editingTarget}
            projectId={projectId}
            projectCity={projectCity}
            projectCountry={projectCountry}
            defaultDomain={projectDomain}
            defaultBusinessName={projectBusinessName}
            onSuccess={() => setEditingTarget(null)}
            onCancel={() => setEditingTarget(null)}
          />
        </Modal>
      )}
    </>
  )
}
