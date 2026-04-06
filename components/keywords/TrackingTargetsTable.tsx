'use client'

import { useState } from 'react'
import { TrackingTarget, ScanResult } from '@/lib/supabase/types'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge, EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import TrackingTargetForm from './TrackingTargetForm'
import { toggleTrackingTargetActiveAction } from '@/app/actions/tracking-targets'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

interface TrackingTargetsTableProps {
  targets: TrackingTarget[]
  latestResults?: Record<string, ScanResult>
  projectId: string
  projectDomain?: string
  projectBusinessName?: string
  onScanTarget?: (targetId: string) => void
  scanningTargets?: Set<string>
}

export default function TrackingTargetsTable({
  targets,
  latestResults = {},
  projectId,
  projectDomain,
  projectBusinessName,
  onScanTarget,
  scanningTargets = new Set(),
}: TrackingTargetsTableProps) {
  const [editingTarget, setEditingTarget] = useState<TrackingTarget | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggleActive(target: TrackingTarget) {
    setTogglingId(target.id)
    try {
      await toggleTrackingTargetActiveAction(target.id, target.is_active, projectId)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      <Table>
        <TableHead>
          <tr>
            <Th>מילת מפתח</Th>
            <Th>מנוע</Th>
            <Th>מיקום נוכחי</Th>
            <Th>שינוי</Th>
            <Th>בדיקה אחרונה</Th>
            <Th>סטטוס</Th>
            <Th>פעולות</Th>
          </tr>
        </TableHead>
        <TableBody>
          {targets.length === 0 && (
            <EmptyRow colSpan={7} message="אין מילות מפתח עדיין. הוסף את הראשונה!" />
          )}
          {targets.map((target) => {
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
                  <EngineBadge engine={target.engine_type} />
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
