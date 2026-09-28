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
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchX } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function KeywordHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.keywordsPage.history
  const common = dict.common
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
      <div role="status" aria-busy="true" className="space-y-6">
        <span className="sr-only">{common.loading}</span>
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
        </div>
        <Skeleton className="h-72 rounded-card" />
      </div>
    )
  }

  if (!target) {
    return (
      <Card padding={false}>
        <EmptyState icon={<SearchX />} title={t.keywordNotFound} action={<Link href="/keywords"><Button variant="outline">{t.backToKeywords}</Button></Link>} />
      </Card>
    )
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
        subtitle={t.subtitle}
        actions={
          <div className="flex gap-2">
            {target.projects && (
              <Link href={`/keywords?projectId=${encodeURIComponent(target.projects.id)}`}>
                <Button variant="outline" size="sm">{t.backToKeywords}</Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Summary: the same tile as every other screen. */}
      <div className="list-enter mb-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
        <div className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
          <span className="text-caption font-medium text-muted">{t.engine}</span>
          <div className="mt-2"><EngineBadge engine={target.engine_type} /></div>
        </div>
        <StatTile label={t.currentPosition} value={latestResult?.found ? `#${latestResult.position}` : '—'} />
        <StatTile label={t.bestPosition} value={<span className="text-ok">{bestPosition !== null ? `#${bestPosition}` : '—'}</span>} />
        <StatTile label={t.worstPosition} value={<span className="text-bad">{worstPosition !== null ? `#${worstPosition}` : '—'}</span>} />
        <StatTile label={t.average} value={avgPosition !== null ? `#${avgPosition}` : '—'} />
      </div>

      {/* History Table */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-section font-semibold text-ink">
          {t.historyLabel} ({results.length} {t.checks})
        </h2>
      </div>

      <Table>
        <TableHead>
          <tr>
            <Th>{t.checkDate}</Th>
            <Th>{t.position}</Th>
            <Th>{t.previousPosition}</Th>
            <Th>{t.change}</Th>
            <Th>{t.found}</Th>
            <Th>{t.resultUrl}</Th>
            <Th>{t.resultTitle}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {results.length === 0 && (
            <EmptyRow colSpan={7} message={t.noHistoryYet} />
          )}
          {results.map((result) => (
            <TableRow key={result.id}>
              <Td>{formatDateTime(result.checked_at)}</Td>
              <Td>
                {result.found && result.position !== null ? (
                  <span className="font-semibold text-ink">#{result.position}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Td>
              <Td>
                {result.previous_position !== null ? (
                  <span className="text-muted">#{result.previous_position}</span>
                ) : '—'}
              </Td>
              <Td>
                <PositionChange change={result.change_value} />
              </Td>
              <Td>
                <Badge variant={result.found ? 'success' : 'neutral'}>
                  {result.found ? t.found : t.notFound}
                </Badge>
              </Td>
              <Td>
                {result.result_url ? (
                  <a
                    href={result.result_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="block max-w-48 truncate text-caption text-action hover:underline"
                  >
                    {result.result_url}
                  </a>
                ) : '—'}
              </Td>
              <Td>
                <span className="text-caption text-body truncate max-w-40 block">
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
