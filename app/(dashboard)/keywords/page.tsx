'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrackingTarget, ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge, EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import { formatDateTime, getEngineDisplayLabel } from '@/lib/utils'
import Link from 'next/link'
import Button from '@/components/ui/Button'

export default function KeywordsPage() {
  const [targets, setTargets] = useState<(TrackingTarget & { projects?: { name: string; id: string; clients?: { name: string } } })[]>([])
  const [latestResults, setLatestResults] = useState<Record<string, ScanResult>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [engineFilter, setEngineFilter] = useState('')
  const [positionSort, setPositionSort] = useState<'none' | 'asc' | 'desc'>('none')

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      const { data: targetsData } = await supabase
        .from('tracking_targets')
        .select('*, projects(id, name, device_type, clients(name))')
        .order('created_at', { ascending: false })

      setTargets(targetsData || [])

      if (targetsData && targetsData.length > 0) {
        const ids = targetsData.map((t) => t.id)
        const { data: resultsData } = await supabase
          .from('scan_results')
          .select('*')
          .in('tracking_target_id', ids)
          .order('checked_at', { ascending: false })

        const latest: Record<string, ScanResult> = {}
        for (const result of resultsData || []) {
          if (!latest[result.tracking_target_id]) {
            latest[result.tracking_target_id] = result
          }
        }
        setLatestResults(latest)
      }

      setLoading(false)
    }
    loadData()
  }, [])

  const filtered = targets.filter((t) => {
    const matchSearch =
      !search ||
      t.keyword.toLowerCase().includes(search.toLowerCase()) ||
      (t.projects?.name || '').toLowerCase().includes(search.toLowerCase())
    const matchEngine = !engineFilter || t.engine_type === engineFilter
    return matchSearch && matchEngine
  })

  const sorted = [...filtered].sort((a, b) => {
    if (positionSort === 'none') return 0

    const aResult = latestResults[a.id]
    const bResult = latestResults[b.id]

    const aPos = aResult?.found && aResult.position !== null ? aResult.position : Number.POSITIVE_INFINITY
    const bPos = bResult?.found && bResult.position !== null ? bResult.position : Number.POSITIVE_INFINITY

    return positionSort === 'asc' ? aPos - bPos : bPos - aPos
  })

  function togglePositionSort() {
    setPositionSort((prev) => {
      if (prev === 'none') return 'asc'
      if (prev === 'asc') return 'desc'
      return 'none'
    })
  }

  return (
    <div>
      <Header
        title="מילות מפתח"
        subtitle={`סה"כ ${targets.length} מילות מפתח`}
      />

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="חיפוש מילת מפתח, פרויקט..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={engineFilter}
          onChange={(e) => setEngineFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">כל המנועים</option>
          <option value="google_search">גוגל חיפוש</option>
          <option value="google_maps">גוגל מפות</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען...
        </div>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>מילת מפתח</Th>
              <Th>פרויקט</Th>
              <Th>לקוח</Th>
              <Th>מנוע</Th>
              <Th>
                <button
                  type="button"
                  onClick={togglePositionSort}
                  className="inline-flex items-center gap-1 hover:text-blue-700 transition-colors"
                  title="מיין לפי מיקום"
                >
                  מיקום
                  <span className="text-xs">
                    {positionSort === 'asc' ? '▲' : positionSort === 'desc' ? '▼' : '↕'}
                  </span>
                </button>
              </Th>
              <Th>שינוי</Th>
              <Th>בדיקה אחרונה</Th>
              <Th>סטטוס</Th>
              <Th>פעולות</Th>
            </tr>
          </TableHead>
          <TableBody>
            {sorted.length === 0 && (
              <EmptyRow colSpan={9} message="לא נמצאו מילות מפתח" />
            )}
            {sorted.map((target) => {
              const result = latestResults[target.id]
              return (
                <TableRow key={target.id}>
                  <Td>
                    <span className="font-medium">{target.keyword}</span>
                  </Td>
                  <Td>
                    {target.projects ? (
                      <Link href={`/projects/${target.projects.id}`} className="text-blue-600 hover:underline text-sm">
                        {target.projects.name}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td>
                    <span className="text-slate-500 text-sm">
                      {(target.projects as { clients?: { name: string } })?.clients?.name || '—'}
                    </span>
                  </Td>
                  <Td>
                    <EngineBadge
                      engine={target.engine_type}
                      label={getEngineDisplayLabel(
                        target.engine_type,
                        (target.projects as { device_type?: 'desktop' | 'mobile' | null } | undefined)?.device_type
                      )}
                    />
                  </Td>
                  <Td>
                    {result?.error_message ? (
                      <span className="text-amber-600 text-sm" title={result.error_message}>שגיאת סריקה</span>
                    ) : result?.found ? (
                      <span className="font-bold">#{result.position}</span>
                    ) : result ? (
                      <span className="text-slate-400 text-sm">לא נמצא</span>
                    ) : '—'}
                  </Td>
                  <Td>
                    {result ? <PositionChange change={result.change_value} /> : '—'}
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">
                      {result ? formatDateTime(result.checked_at) : '—'}
                    </span>
                  </Td>
                  <Td>
                    <ActiveBadge active={target.is_active} />
                  </Td>
                  <Td>
                    <Link href={`/keywords/${target.id}/history`}>
                      <Button size="sm" variant="ghost">היסטוריה</Button>
                    </Link>
                  </Td>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
