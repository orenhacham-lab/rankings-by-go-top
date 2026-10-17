'use client'

/**
 * One keyword's Google position at every check, oldest to newest (design contract
 * §10): the action colour at 2px with a dot on the latest check only, dashed
 * horizontal grid lines, muted caption ticks that never overlap, and a tooltip on
 * the surface. Position 1 is the top of the chart (the axis runs downward, as a
 * ranking does); checks where the site was not found are gaps, not zeros.
 * In Hebrew time runs right to left.
 */
import { useEffect, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from '@/components/ui/motion'
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

/** Below sm (a phone at 390) the chart is ~300px wide: fewer ticks on both axes. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return narrow
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
  const narrow = useNarrow()
  // By the tick's own value: once ticks are skipped (a phone), the formatter's index
  // counts the ticks shown, not the points, and would print another check's date.
  const labelOf = new Map(points.map((p) => [p.at, p.label]))
  // The position ticks, spread evenly from #1 to the lowest position and always ending on
  // both: recharts' own "nice" ticks put #13 a hair above #14 on a 1-14 axis.
  const worst = Math.max(1, ...points.map((p) => p.position ?? 1))
  const count = narrow ? 3 : 5
  const yTicks = [...new Set(Array.from({ length: count }, (_, i) => Math.round(1 + ((worst - 1) * i) / (count - 1))))]
  const tick = { fontSize: 12, fill: 'var(--color-muted)' }
  // The line draws itself once (1.1s) unless the merchant asked for less motion.
  const reduced = useReducedMotion()
  return (
    <figure data-position-chart="" role="img" aria-label={label} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id="position-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-action)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--color-action)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--color-line)" />
          {/* Time runs left to right in both languages and #1 is at the top, so a line that
              rises is a keyword that improved (mirrored for Hebrew, a climb read as a fall). */}
          <XAxis dataKey="at" tickFormatter={(at: string) => labelOf.get(at) ?? ''} tickLine={false} axisLine={false}
            interval="preserveStartEnd" minTickGap={narrow ? 56 : 24} tickMargin={8} tick={tick} padding={{ left: 16, right: 16 }} />
          {/* The date axis is padded at both ends, so the lowest position's tick (#14) keeps
              clear of the line's first point: at 390 they used to collide in the corner. No
              padding on this axis (the grid would draw a second dashed line at each edge); every
              position tick shows, so #1 is never dropped at the top edge. The ticks are set
              left to right: in Hebrew an inherited rtl flips text-anchor and "#14" ran into the plot. */}
          <YAxis reversed allowDecimals={false} domain={[1, 'dataMax']} orientation={isRTL ? 'right' : 'left'} tickLine={false}
            axisLine={false} width={40} ticks={yTicks} interval={0} tickFormatter={(v: number) => `#${v}`} tick={{ ...tick, direction: 'ltr' }} />
          <Tooltip cursor={{ stroke: 'var(--color-line-strong)', strokeDasharray: '4 4' }}
            content={<ChartTooltip positionAt={positionAt} notFound={notFound} />} />
          {/* A soft wash under the line, down to the lowest position. */}
          <Area type="monotone" dataKey="position" baseValue="dataMax" stroke="none" fill="url(#position-area)" connectNulls={false}
            isAnimationActive={!reduced} animationDuration={1100} animationEasing="ease-out" activeDot={false} tooltipType="none" />
          <Line
            type="monotone"
            dataKey="position"
            stroke="var(--color-action)"
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={!reduced}
            animationDuration={1100}
            animationEasing="ease-out"
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === last && p.cx !== undefined && p.cy !== undefined
                ? <circle key="last" cx={p.cx} cy={p.cy} r={3} fill="var(--color-action)" />
                : <g key={`p${p.index}`} />}
            activeDot={{ r: 4, fill: 'var(--color-action)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  )
}
