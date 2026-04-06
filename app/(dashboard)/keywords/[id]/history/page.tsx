'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrackingTarget, ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

export default function KeywordHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [target, setTarget] = useState<TrackingTarget & { projects?: { name: string; id: string } } | null>(null)
  const [results, setResults] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      const [{ data: targetData }, { data: resultsData }] = await Promise.all([
        supabase
          .from('tracking_targets')
          .select('*, projects(id, name)')
          .eq('id', id)
          .single(),
        supabase
          .from('scan_results')
          .select('*')
          .eq('tracking_target_id', id)
          .order('checked_at', { ascending: false })
          .limit(100),
      ])
      setTarget(targetData)
      setResults(resultsData || [])
      setLoading(false)
    }
    loadData()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        טוען...
      </div>
    )
  }

  if (!target) {
    return <div className="text-center py-20 text-slate-400">מילת מפתח לא נמצאה</div>
  }

  const foundResults = results.filter((r) => r.found && r.position !== null)
  const bestPosition = foundResults.length > 0 ? Math.min(...foundResults.map((r) => r.position!)) : null
  const worstPosition = foundResults.length > 0 ? Math.max(...foundResults.map((r) => r.position!)) : null
  const latestResult = results[0]
  const avgPosition = foundResults.length > 0
    ? Math.round(foundResults.reduce((sum, r) => sum + r.position!, 0) / foundResults.length)
    : null

  return (
    <div>
      <Header
        title={target.keyword}
        subtitle="היסטוריית דירוגים"
        actions={
          <div className="flex gap-2">
            {target.projects && (
              <Link href={`/projects/${target.projects.id}`}>
                <Button variant="outline" size="sm">← הפרויקט</Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Card>
          <div className="text-xs text-slate-500 mb-1">מנוע</div>
          <EngineBadge engine={target.engine_type} />
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">מיקום נוכחי</div>
          <div className="text-2xl font-bold text-slate-800">
            {latestResult?.found ? `#${latestResult.position}` : '—'}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">המיקום הטוב ביותר</div>
          <div className="text-2xl font-bold text-green-600">
            {bestPosition !== null ? `#${bestPosition}` : '—'}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">המיקום הגרוע ביותר</div>
          <div className="text-2xl font-bold text-red-500">
            {worstPosition !== null ? `#${worstPosition}` : '—'}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 mb-1">ממוצע</div>
          <div className="text-2xl font-bold text-slate-800">
            {avgPosition !== null ? `#${avgPosition}` : '—'}
          </div>
        </Card>
      </div>

      {/* History Table */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">
          היסטוריה ({results.length} בדיקות)
        </h2>
      </div>

      <Table>
        <TableHead>
          <tr>
            <Th>תאריך בדיקה</Th>
            <Th>מיקום</Th>
            <Th>מיקום קודם</Th>
            <Th>שינוי</Th>
            <Th>נמצא</Th>
            <Th>URL תוצאה</Th>
            <Th>כותרת</Th>
          </tr>
        </TableHead>
        <TableBody>
          {results.length === 0 && (
            <EmptyRow colSpan={7} message="אין היסטוריה עדיין. הפעל סריקה ראשונה." />
          )}
          {results.map((result) => (
            <TableRow key={result.id}>
              <Td>{formatDateTime(result.checked_at)}</Td>
              <Td>
                {result.found && result.position !== null ? (
                  <span className="font-bold text-slate-800">#{result.position}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
              <Td>
                {result.previous_position !== null ? (
                  <span className="text-slate-500">#{result.previous_position}</span>
                ) : '—'}
              </Td>
              <Td>
                <PositionChange change={result.change_value} />
              </Td>
              <Td>
                <Badge variant={result.found ? 'success' : 'neutral'}>
                  {result.found ? 'נמצא' : 'לא נמצא'}
                </Badge>
              </Td>
              <Td>
                {result.result_url ? (
                  <a
                    href={result.result_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline text-xs truncate max-w-48 block"
                  >
                    {result.result_url}
                  </a>
                ) : '—'}
              </Td>
              <Td>
                <span className="text-xs text-slate-600 truncate max-w-40 block">
                  {result.result_title || result.result_address || '—'}
                </span>
              </Td>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
