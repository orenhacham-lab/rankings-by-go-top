'use client'

/**
 * The scans of the current project.
 *
 * This list used to hold every scan in the account, with a project column and a
 * client column to tell them apart. The top bar names the project now, so the
 * list is that project's scans and those two columns went with the mixing.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Project, Scan } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import WorkspaceGate from '@/components/layout/WorkspaceGate'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ScanStatusBadge } from '@/components/ui/StatusBadge'
import Badge from '@/components/ui/Badge'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import { formatDateTime } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ScansPage() {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).scans

  return (
    <div>
      <Header title={t.title} subtitle={t.subtitle} />
      <WorkspaceGate>
        {(project) => <ProjectScans key={project.id} project={project} />}
      </WorkspaceGate>
    </div>
  )
}

function ProjectScans({ project }: { project: Project }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.scans
  const [scans, setScans] = useState<Scan[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void withDeadline(
      createClient()
        .from('scans')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(100)
    ).then((res) => {
      if (cancelled) return
      if (!res || res.error) { setStatus('error'); return }
      setScans((res.data ?? []) as Scan[])
      setStatus('ready')
    })
    return () => { cancelled = true }
  }, [project.id, attempt])

  if (status === 'error') {
    return (
      <Card>
        <EmptyState
          title={t.loadError}
          action={<Button onClick={() => { setStatus('loading'); setAttempt((n) => n + 1) }}>{dict.workspace.retry}</Button>}
        />
      </Card>
    )
  }

  if (status === 'loading') {
    return (
      <Card className="py-16 text-center">
        <p className="text-sm text-muted">{t.loading}</p>
      </Card>
    )
  }

  return (
    <Table>
      <TableHead>
        <tr>
          <Th>{t.table.status}</Th>
          <Th>{t.table.trigger}</Th>
          <Th>{t.table.results}</Th>
          <Th>{t.table.started}</Th>
          <Th>{t.table.finished}</Th>
          <Th>{t.table.actions}</Th>
        </tr>
      </TableHead>
      <TableBody>
        {scans.length === 0 && <EmptyRow colSpan={6} message={t.table.emptyState} />}
        {scans.map((scan) => (
          <TableRow key={scan.id}>
            <Td>
              <ScanStatusBadge status={scan.status} />
            </Td>
            <Td>
              <Badge variant={scan.triggered_by === 'scheduled' ? 'info' : 'neutral'}>
                {scan.triggered_by === 'scheduled' ? t.trigger.automatic : t.trigger.manual}
              </Badge>
            </Td>
            <Td>
              <span className="text-sm tabular-nums">
                <span className="font-medium text-ok">{scan.completed_targets}</span>
                {' / '}
                <span className="text-body">{scan.total_targets}</span>
                {scan.failed_targets > 0 && (
                  <span className="ms-1 text-bad"> {t.table.failedSuffix(scan.failed_targets)}</span>
                )}
              </span>
            </Td>
            <Td>
              <span className="text-xs text-muted tabular-nums">
                {scan.started_at ? formatDateTime(scan.started_at) : t.table.notYet}
              </span>
            </Td>
            <Td>
              <span className="text-xs text-muted tabular-nums">
                {scan.completed_at ? formatDateTime(scan.completed_at) : t.table.notYet}
              </span>
            </Td>
            <Td>
              <Link href={`/scans/${encodeURIComponent(scan.id)}/details`} className="text-sm font-medium text-action hover:underline">
                {t.table.viewDetails}
              </Link>
            </Td>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
