'use client'

/**
 * A small line of one figure across syncs, for a tile.
 *
 * One series, so no legend: the tile's label names it. A 2px line, the latest point
 * marked with a dot ringed in the surface colour, no axes. Pointing at the line shows
 * the nearest sync's date and value; the same values are listed for screen readers,
 * so the tooltip never holds information that is not available otherwise.
 *
 * Time runs left to right in both languages. `lowerIsBetter` turns the scale over, so
 * for a position "up" is better, as on every ranking chart.
 */
import { useState } from 'react'

const W = 100
const H = 40
const PAD = 5

export interface SparkPoint { label: string; value: number }

export default function GscSparkline({
  points, ariaLabel, format, lowerIsBetter = false, pending,
}: {
  points: SparkPoint[]
  ariaLabel: string
  format: (n: number) => string
  lowerIsBetter?: boolean
  /** Said in place of the line until there are two syncs to draw between. */
  pending: string
}) {
  const [hover, setHover] = useState<number | null>(null)

  if (points.length < 2) {
    return <p className="flex h-10 items-center text-overline text-muted">{pending}</p>
  }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const xy = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const share = span === 0 ? 0.5 : (p.value - min) / span
    const y = PAD + (lowerIsBetter ? share : 1 - share) * (H - PAD * 2)
    return { x, y }
  })
  const d = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const last = xy[xy.length - 1]
  const shown = hover === null ? null : { ...xy[hover], point: points[hover] }

  return (
    <div>
      <div
        dir="ltr"
        role="img"
        aria-label={ariaLabel}
        className="relative h-10 w-full"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          if (box.width <= 0) return
          const i = Math.round(((e.clientX - box.left) / box.width) * (points.length - 1))
          setHover(Math.min(points.length - 1, Math.max(0, i)))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <path d={d} fill="none" className="stroke-action" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {shown && <line x1={shown.x} x2={shown.x} y1={0} y2={H} className="stroke-line-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        <Dot x={last.x} y={last.y} />
        {shown && (
          <>
            <Dot x={shown.x} y={shown.y} />
            <span
              className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-control border border-line bg-surface px-2 py-1 text-overline text-ink shadow-card"
              style={{ left: `${Math.min(85, Math.max(15, shown.x))}%` }}
            >
              {shown.point.label}: <span className="font-semibold tabular-nums">{format(shown.point.value)}</span>
            </span>
          </>
        )}
      </div>
      <ul className="sr-only">
        {points.map((p, i) => <li key={i}>{p.label}: {format(p.value)}</li>)}
      </ul>
    </div>
  )
}

function Dot({ x, y }: { x: number; y: number }) {
  return (
    <span
      className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-action ring-2 ring-surface"
      style={{ left: `${x}%`, top: `${(y / H) * 100}%` }}
      aria-hidden="true"
    />
  )
}
