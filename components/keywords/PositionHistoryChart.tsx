'use client'

/**
 * One keyword's Google position at every check, oldest to newest (design contract
 * §10): the action colour at 2px with a dot on the latest check only, dashed
 * horizontal grid lines, muted caption ticks that never overlap, and a tooltip on
 * the surface. Position 1 is the top of the chart (the axis runs downward, as a
 * ranking does); checks where the site was not found are gaps, not zeros.
 * In Hebrew time runs right to left.
 */
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ScanResult } from '@/lib/supabase/types'

export interface PositionPoint { at: string; label: string; full: string; position: number | null }

/** The checks as chart points, oldest first, dated in the screen's language. */
export function positionPoints(results: Pick<ScanResult, 'checked_at' | 'found' | 'position'>[], language: 'he' | 'en'): PositionPoint[] {
  const locale = language === 'he' ? 'he-IL' : 'en-US'
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const long = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  return [...results]
    .sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime())
    .map((r) => {
      const d = new Date(r.checked_at)
      return { at: r.checked_at, label: short.format(d), full: long.format(d), position: r.found && r.position !== null ? r.position : null }
    })
}

function ChartTooltip({ active, payload, positionAt, notFound }: {
  active?: boolean
  payload?: Array<{ payload: PositionPoint }>
  positionAt: (p: string) => string
  notFound: string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-inset border border-line bg-surface px-3 py-2 text-caption shadow-pop">
      <p className="font-semibold text-ink">{p.full}</p>
      <p className="text-muted tabular-nums">{p.position !== null ? positionAt(`#${p.position}`) : notFound}</p>
    </div>
  )
}

export default function PositionHistoryChart({ points, isRTL, label, positionAt, notFound }: {
  points: PositionPoint[]
  isRTL: boolean
  /** The chart's accessible name. */
  label: string
  positionAt: (p: string) => string
  notFound: string
}) {
  let last = -1
  points.forEach((p, i) => { if (p.position !== null) last = i })
  const tick = { fontSize: 12, fill: 'var(--color-muted)' }
  return (
    <figure data-position-chart="" role="img" aria-label={label} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--color-line)" />
          <XAxis dataKey="at" tickFormatter={(_, i) => points[i]?.label ?? ''} reversed={isRTL} tickLine={false} axisLine={false}
            interval="preserveStartEnd" minTickGap={24} tick={tick} />
          <YAxis reversed allowDecimals={false} domain={[1, 'dataMax']} orientation={isRTL ? 'right' : 'left'} tickLine={false}
            axisLine={false} width={40} tickFormatter={(v: number) => `#${v}`} tick={tick} />
          <Tooltip cursor={{ stroke: 'var(--color-line-strong)', strokeDasharray: '4 4' }}
            content={<ChartTooltip positionAt={positionAt} notFound={notFound} />} />
          <Line
            type="monotone"
            dataKey="position"
            stroke="var(--color-action)"
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === last && p.cx !== undefined && p.cy !== undefined
                ? <circle key="last" cx={p.cx} cy={p.cy} r={3} fill="var(--color-action)" />
                : <g key={`p${p.index}`} />}
            activeDot={{ r: 4, fill: 'var(--color-action)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}
