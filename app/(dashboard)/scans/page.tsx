'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Scan } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ScanStatusBadge } from '@/components/ui/StatusBadge'
import Badge from '@/components/ui/Badge'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

export default function ScansPage() {
  const [scans, setScans] = useState<(Scan & { projects?: { name: string; id: string; clients?: { name: string } } })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('scans')
        .select('*, projects(id, name, clients(name))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      setScans(data || [])
      setLoading(false)
    }
    loadData()
  }, [])

  return (
    <div>
      <Header title="סריקות" subtitle="היסטוריית סריקות מלאה" />

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען...
        </div>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>פרויקט</Th>
              <Th>לקוח</Th>
              <Th>סטטוס</Th>
              <Th>הפעלה</Th>
              <Th>תוצאות</Th>
              <Th>התחיל</Th>
              <Th>הסתיים</Th>
            </tr>
          </TableHead>
          <TableBody>
            {scans.length === 0 && (
              <EmptyRow colSpan={7} message="אין סריקות עדיין" />
            )}
            {scans.map((scan) => (
              <TableRow key={scan.id}>
                <Td>
                  {scan.projects ? (
                    <Link href={`/projects/${scan.projects.id}`} className="text-blue-600 hover:underline font-medium">
                      {scan.projects.name}
                    </Link>
                  ) : '—'}
                </Td>
                <Td>
                  <span className="text-slate-500 text-sm">
                    {(scan.projects as { clients?: { name: string } })?.clients?.name || '—'}
                  </span>
                </Td>
                <Td>
                  <ScanStatusBadge status={scan.status} />
                </Td>
                <Td>
                  <Badge variant={scan.triggered_by === 'scheduled' ? 'info' : 'neutral'}>
                    {scan.triggered_by === 'scheduled' ? 'אוטומטי' : 'ידני'}
                  </Badge>
                </Td>
                <Td>
                  <span className="text-sm">
                    <span className="text-green-600 font-medium">{scan.completed_targets}</span>
                    {' / '}
                    <span className="text-slate-600">{scan.total_targets}</span>
                    {scan.failed_targets > 0 && (
                      <span className="text-red-500 mr-1"> ({scan.failed_targets} נכשלו)</span>
                    )}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs text-slate-500">
                    {scan.started_at ? formatDateTime(scan.started_at) : '—'}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs text-slate-500">
                    {scan.completed_at ? formatDateTime(scan.completed_at) : '—'}
                  </span>
                </Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
