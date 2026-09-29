'use client'

/**
 * A keyword's search trend over the last twelve months (Google Ads Keyword Planner).
 *
 * The shared modal, three stat tiles (the monthly average, the peak month and the
 * quietest one), the direction as one badge, and a single-series line on the
 * design tokens (design contract §10): the action colour at 2px with a dot on the
 * latest month only, dashed horizontal grid lines, muted caption ticks that never
 * overlap, and month names from Intl in the screen's language. Every word comes
 * from the dictionary; an error is ours, never the provider's text.
 */
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Modal from '@/components/ui/Modal'
import StatTile from '@/components/ui/StatTile'
import Badge from '@/components/ui/Badge'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'

interface MonthlySearch {
  month: string
  year: number
  searches: number
}

type Trend = 'up' | 'down' | 'stable' | 'seasonal' | 'unknown'

/** What went wrong, as a code: the modal says it in its own words, never the provider's. */
export type TrendError = '' | 'reauth' | 'failed'

interface TrendModalProps {
  open: boolean
  onClose: () => void
  keyword: string
  language: 'he' | 'en'
  isRTL: boolean
  loading?: boolean
  error?: TrendError
  data?: {
    avgMonthlySearches: number | null
    monthlySearchVolumes: MonthlySearch[]
    trend: Trend
    peakMonth: MonthlySearch | null
    lowestMonth: MonthlySearch | null
  }
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

/** Google's "JANUARY" of 2026 in the screen's language, long ("ינואר" / "January"), with the year when asked. */
export function monthName(month: string, year: number, language: 'he' | 'en', withYear = false): string {
  const i = MONTHS.indexOf(String(month).toUpperCase())
  if (i < 0) return month
  const locale = language === 'he' ? 'he-IL' : 'en-US'
  return new Intl.DateTimeFormat(locale, withYear ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, i, 15)))
}

/** Up and down are the only directions that take a state colour (§1); the rest are information. */
const TREND_BADGE: Record<Trend, 'success' | 'danger' | 'info' | 'neutral'> = {
  up: 'success', down: 'danger', stable: 'info', seasonal: 'info', unknown: 'neutral',
}

interface Point { label: string; full: string; searches: number }

function ChartTooltip({ active, payload, searchesLabel, language }: {
  active?: boolean
  payload?: Array<{ payload: Point }>
  searchesLabel: string
  language: 'he' | 'en'
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-inset border border-line bg-surface px-3 py-2 text-caption shadow-pop">
      <p className="font-semibold text-ink">{p.full}</p>
      <p className="text-muted tabular-nums">{searchesLabel}: {formatCount(p.searches, language)}</p>
    </div>
  )
}

export default function TrendModal({ open, onClose, keyword, language, isRTL, loading = false, error, data }: TrendModalProps) {
  if (!open) return null
  const dict = getDashboardDictionary(language)
  const t = dict.keywordResearch.trend

  const trendLabel: Record<Trend, string> = {
    up: t.trendRising, down: t.trendDeclining, stable: t.trendStable, seasonal: t.trendSeasonal, unknown: t.trendUnknown,
  }
  const points: Point[] = (data?.monthlySearchVolumes ?? []).map((m) => ({
    label: monthName(m.month, m.year, language),
    full: monthName(m.month, m.year, language, true),
    searches: m.searches,
  }))
  const lastIndex = points.length - 1
  const n = (v: number) => formatCount(v, language)
  const tick = { fontSize: 12, fill: 'var(--color-muted)' }

  return (
    <Modal open={open} onClose={onClose} title={t.titleFor(keyword)} size="lg">
      <div data-trend-modal="" className={`space-y-5 ${isRTL ? 'rtl' : 'ltr'}`}>
        {loading && (
          <div role="status" aria-busy="true" className="space-y-4">
            <span className="sr-only">{t.loading}</span>
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
            </div>
            <Skeleton className="h-56 rounded-card" />
          </div>
        )}

        {!loading && error && (
          <Notice tone="bad">{error === 'reauth' ? dict.keywordResearch.states.errorReauth : t.error}</Notice>
        )}

        {!loading && !error && data && points.length === 0 && <Notice tone="info">{t.noData}</Notice>}

        {!loading && !error && data && points.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-muted">{t.trend}</span>
              <Badge variant={TREND_BADGE[data.trend] ?? 'neutral'}>{trendLabel[data.trend] ?? t.trendUnknown}</Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile label={t.monthlyAverage} value={data.avgMonthlySearches ? n(data.avgMonthlySearches) : '—'} source={t.searches} />
              {data.peakMonth && (
                <StatTile label={t.peakMonth} value={monthName(data.peakMonth.month, data.peakMonth.year, language)}
                  source={`${n(data.peakMonth.searches)} ${t.searches}`} />
              )}
              {data.lowestMonth && (
                <StatTile label={t.lowestMonth} value={monthName(data.lowestMonth.month, data.lowestMonth.year, language)}
                  source={`${n(data.lowestMonth.searches)} ${t.searches}`} />
              )}
            </div>

            <figure data-trend-chart="" className="h-60 w-full" role="img" aria-label={t.chartLabel(keyword)}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--color-line)" />
                  {/* Months run left to right in both languages, like the position charts: a
                      rising line is always more searches. */}
                  <XAxis dataKey="label" tickLine={false} axisLine={false}
                    interval="preserveStartEnd" minTickGap={20} tick={tick} />
                  <YAxis orientation={isRTL ? 'right' : 'left'} tickLine={false} axisLine={false} width={48}
                    tickFormatter={(v: number) => n(v)} tick={tick} />
                  <Tooltip cursor={{ stroke: 'var(--color-line-strong)', strokeDasharray: '4 4' }}
                    content={<ChartTooltip searchesLabel={t.searches} language={language} />} />
                  <Line
                    type="monotone"
                    dataKey="searches"
                    stroke="var(--color-action)"
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={(p: { cx?: number; cy?: number; index?: number }) =>
                      p.index === lastIndex && p.cx !== undefined && p.cy !== undefined
                        ? <circle key="last" cx={p.cx} cy={p.cy} r={3} fill="var(--color-action)" />
                        : <g key={`p${p.index}`} />}
                    activeDot={{ r: 4, fill: 'var(--color-action)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </figure>

            <Notice tone="info">{t.disclaimer}</Notice>
          </>
        )}
      </div>
    </Modal>
  )
}
