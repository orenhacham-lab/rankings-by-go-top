'use client'

/**
 * "My progress" in Google Search: clicks, impressions and average position over the
 * last 28 days, each with its trend across syncs and its change against the previous
 * 28 days.
 *
 * The figures are the authoritative property totals of each sync, never sums of query
 * rows. The change compares with the previous, non-overlapping 28 days (weekly syncs
 * overlap by three weeks), so it only appears once such a window has been synced.
 *
 * Before Search Console can give the figures, the section is ONE card under its title:
 * the sentence that says what it will show (clicks, impressions and position over 28
 * days) and the one step that is missing. It used to add three tiles that each said
 * "waiting for Search Console" with their own source line, so the Reports screen
 * repeated the same placeholder four times (UX review P1-8). While loading and after a
 * failed read the three tiles stay, so the layout does not jump when the figures
 * arrive. With Search Console switched off on the server there is no step to offer,
 * and no section.
 */
import { MousePointerClick, Eye, ListOrdered } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import ChangeArrow, { ChangeSign } from '@/components/ui/ChangeArrow'
import SectionHeading from '@/components/ui/SectionHeading'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { isGscSetupState } from '@/lib/gsc/widget-state'
import { performanceDelta, previousPeriod, type PerformanceMetric, type TrendPoint } from '@/lib/gsc/tab-metrics'
import { useGscMetrics, useGscStatus } from './gsc-data'
import GscSetupPrompt, { GscLoadError } from './GscSetupPrompt'
import GscSparkline from './GscSparkline'
import { formatCount, formatDay, formatPercent, formatPosition } from './format'

function pickPoints(body: Record<string, unknown>): TrendPoint[] {
  return Array.isArray(body.points) ? (body.points as TrendPoint[]) : []
}

export default function GscPerformance({ projectId, className }: { projectId: string | null | undefined; className?: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  const p = t.performance
  const status = useGscStatus(projectId)
  const trend = useGscMetrics(projectId, status.view, 'trend', pickPoints)
  const summary = status.view.state === 'ready' ? status.view.summary : null
  // A sync that predates the property totals has no totals to show: one more sync.
  const state = status.view.state === 'ready' && !summary ? 'never_synced' : status.view.state
  if (state === 'disabled') return null
  const points = trend.data.state === 'ready' ? trend.data.data : []
  const previous = previousPeriod(points)
  const retry = () => { status.reload(); trend.reload() }

  const tiles: { metric: PerformanceMetric; label: string; icon: React.ReactNode; value: number | null; series: (number | null)[]; format: (n: number) => string }[] = [
    { metric: 'clicks', label: p.clicks, icon: <MousePointerClick size={16} strokeWidth={2} aria-hidden="true" />, value: summary?.clicks ?? null, series: points.map((x) => x.clicks), format: (n) => formatCount(n, language) },
    { metric: 'impressions', label: p.impressions, icon: <Eye size={16} strokeWidth={2} aria-hidden="true" />, value: summary?.impressions ?? null, series: points.map((x) => x.impressions), format: (n) => formatCount(n, language) },
    { metric: 'position', label: p.position, icon: <ListOrdered size={16} strokeWidth={2} aria-hidden="true" />, value: summary?.avgPosition ?? null, series: points.map((x) => x.position), format: (n) => formatPosition(n, language) },
  ]

  return (
    <section data-gsc-widget="performance" data-gsc-state={state} className={className}>
      <SectionHeading title={p.title} description={state === 'ready' ? p.about : undefined} />
      {isGscSetupState(state) ? (
        <Card>
          <GscSetupPrompt state={state} about={p.about} projectId={projectId} layout="inline" />
        </Card>
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiles.map((tile) => {
          const prev = previous ? (tile.metric === 'clicks' ? previous.clicks : tile.metric === 'impressions' ? previous.impressions : previous.position) : null
          const delta = state === 'ready' ? performanceDelta(tile.metric, tile.value, prev) : null
          const spark = points.flatMap((x, i) => (tile.series[i] === null ? [] : [{ label: formatDay(x.endDate, language), value: tile.series[i] as number }]))
          return (
            <div key={tile.metric} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5" data-gsc-tile={tile.metric}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption font-medium text-muted">{tile.label}</span>
                <span className="shrink-0 text-muted">{tile.icon}</span>
              </div>
              {state === 'ready' ? (
                <>
                  <span className="text-metric font-bold text-ink tabular-nums">{tile.value === null ? '—' : tile.format(tile.value)}</span>
                  <span className="h-4 text-overline text-muted">
                    {delta && (
                      <>
                        <span data-gsc-delta={delta.direction} className={cn('inline-flex items-center gap-0.5 font-semibold tabular-nums', delta.direction === 'up' && 'text-ok', delta.direction === 'down' && 'text-bad')}>
                          <ChangeArrow direction={delta.direction} />
                          <ChangeSign direction={delta.direction} />
                          {delta.percent ? formatPercent(delta.size, language) : formatPosition(delta.size, language)}
                        </span>{' '}
                        {p.vsPrevious}
                      </>
                    )}
                  </span>
                  {trend.data.state === 'ready' ? (
                    <GscSparkline
                      points={spark}
                      ariaLabel={p.trendOf(tile.label)}
                      format={tile.format}
                      lowerIsBetter={tile.metric === 'position'}
                      pending={p.trendPending}
                    />
                  ) : (
                    <span className="h-10" aria-hidden="true" />
                  )}
                </>
              ) : state === 'loading' ? (
                <span className="my-1.5 h-6 w-24 rounded-control bg-sunk" aria-hidden="true" />
              ) : (
                <span className="text-copy text-muted">{state === 'error' ? '—' : t.emptyTile}</span>
              )}
              <span className="text-overline text-muted">{t.source28}</span>
            </div>
          )
        })}
      </div>
      )}
      {(state === 'error' || (state === 'ready' && trend.data.state === 'error')) && <GscLoadError className="mt-3" onRetry={retry} />}
    </section>
  )
}
