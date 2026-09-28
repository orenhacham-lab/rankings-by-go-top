'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrackingTarget, ScanResult } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import BackLink from '@/components/ui/BackLink'
import PositionHistoryChart, { positionPoints } from '@/components/keywords/PositionHistoryChart'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchX } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { displayUrl } from '@/lib/format/display-url'
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
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
        </div>
        <Skeleton className="h-72 rounded-card" />
      </div>
    )
  }

  if (!target) {
    return (
      <Card padding={false}>
        <EmptyState icon={<SearchX />} title={t.keywordNotFound} action={<BackLink href="/keywords" className="ms-0">{t.backToKeywords}</BackLink>} />
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

  const backHref = target.projects ? `/keywords?projectId=${encodeURIComponent(target.projects.id)}` : '/keywords'
  const points = positionPoints(results, language)
  const chartable = points.filter((p) => p.position !== null).length >= 2

  return (
    <div>
      <div className="mb-3"><BackLink href={backHref}>{t.backToKeywords}</BackLink></div>
      {/* The engine is a fact about the keyword, not a figure: it sits under the title,
          so the figures are four tiles (two full rows on a phone, one row on a desktop). */}
      <Header title={target.keyword} subtitle={t.subtitle}>
        <p data-history-engine="" className="flex items-center gap-2 text-caption text-muted">
          <span>{t.engine}</span>
          <EngineBadge engine={target.engine_type} />
        </p>
      </Header>

      {/* Summary: the same tile as every other screen, plain figures (ok/bad are for up/down only). */}
      <div data-history-tiles="" className="list-enter mb-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <StatTile label={t.currentPosition} value={latestResult?.found ? `#${latestResult.position}` : '—'} />
        <StatTile label={t.bestPosition} value={bestPosition !== null ? `#${bestPosition}` : '—'} />
        <StatTile label={t.worstPosition} value={worstPosition !== null ? `#${worstPosition}` : '—'} />
        <StatTile label={t.average} value={avgPosition !== null ? `#${avgPosition}` : '—'} />
      </div>

      {/* The position over time (§10), before the rows it is drawn from. */}
      <Card className="mb-8">
        <h2 className="mb-4 text-section font-semibold text-ink">{t.chartTitle}</h2>
        {chartable ? (
          <PositionHistoryChart points={points} isRTL={language === 'he'} label={t.chartLabel(target.keyword)} positionAt={t.positionAt} notFound={t.notFound} />
        ) : (
          <p className="text-copy text-muted">{t.chartEmpty}</p>
        )}
      </Card>

      {/* History Table */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-section font-semibold text-ink">
          {t.historyLabel} <span className="text-caption font-normal text-muted tabular-nums">({results.length} {t.checks})</span>
        </h2>
      </div>

      {/* Below sm the table keeps the date and the position (its change under it); the
          previous position, the change, the page and its title return as the screen
          widens, so nothing is cut inside a sideways-scrolling card at 390. "Found" is
          no column: a check that did not find the site says so in the position cell. */}
      <Table>
        <TableHead>
          <tr className="max-sm:[&>th]:px-3">
            <Th>{t.checkDate}</Th>
            <Th>{t.position}</Th>
            <Th className="hidden sm:table-cell">{t.previousPosition}</Th>
            <Th className="hidden sm:table-cell">{t.change}</Th>
            <Th className="hidden md:table-cell">{t.resultUrl}</Th>
            <Th className="hidden lg:table-cell">{t.resultTitle}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {results.length === 0 && (
            <EmptyRow colSpan={6} message={t.noHistoryYet} />
          )}
          {results.map((result) => (
            <TableRow key={result.id} className="max-sm:[&>td]:px-3">
              <Td className="whitespace-nowrap">{formatDateTime(result.checked_at, language)}</Td>
              <Td>
                <div className="flex flex-col items-start gap-0.5">
                  {result.found && result.position !== null ? (
                    <span className="font-semibold text-ink tabular-nums">#{result.position}</span>
                  ) : (
                    <span className="text-caption text-muted">{t.notFound}</span>
                  )}
                  <span className="sm:hidden"><PositionChange change={result.change_value} /></span>
                </div>
              </Td>
              <Td className="hidden sm:table-cell">
                {result.previous_position !== null ? (
                  <span className="text-muted tabular-nums">#{result.previous_position}</span>
                ) : '—'}
              </Td>
              <Td className="hidden sm:table-cell">
                <PositionChange change={result.change_value} />
              </Td>
              <Td className="hidden md:table-cell">
                {result.result_url ? (
                  <a
                    href={result.result_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    title={result.result_url}
                    className="block max-w-64 truncate text-caption text-muted transition-colors hover:text-action hover:underline"
                  >
                    {displayUrl(result.result_url)}
                  </a>
                ) : '—'}
              </Td>
              <Td className="hidden lg:table-cell">
                <span className="block max-w-40 truncate text-caption text-body">
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
