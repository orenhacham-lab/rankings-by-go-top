'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * A small trend line for a table row or a tile: the values in time order, oldest
 * first. Time runs toward the reading direction's end, as in the keyword history
 * chart: left to right in English, right to left in Hebrew (the svg is mirrored).
 * `invert` is for positions, where a smaller number is better, so "up" means
 * better. A missing value (a check where the site was not found) is skipped.
 *
 * The line draws itself once (.draw-line, 1100ms) and its soft area fades in; with
 * reduced motion it is simply there. The last point carries the only dot (§10).
 * Given fewer than two values there is no line to draw and it renders nothing.
 */
export default function Sparkline({
  values, invert = false, width = 88, height = 28, label, className,
}: {
  values: readonly (number | null | undefined)[]
  invert?: boolean
  width?: number
  height?: number
  /** What the line shows, for a screen reader ("position over the last 4 checks"). */
  label: string
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => typeof p.v === 'number' && Number.isFinite(p.v))
  if (pts.length < 2) return null
  const n = values.length
  const pad = 3
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const range = max - min
  const x = (i: number) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (width - pad * 2))
  const y = (v: number) => {
    if (range === 0) return height / 2
    const t = (v - min) / range
    return invert ? pad + t * (height - pad * 2) : height - pad - t * (height - pad * 2)
  }
  const line = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const first = pts[0]
  const last = pts[pts.length - 1]
  const area = `${line} L${x(last.i).toFixed(1)},${height} L${x(first.i).toFixed(1)},${height} Z`
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0 overflow-visible rtl:-scale-x-100', className)}
      data-sparkline=""
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-action)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-action)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} className="fade-in" />
      <path d={line} fill="none" stroke="var(--color-action)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw-line" />
      <circle cx={x(last.i)} cy={y(last.v)} r="5" fill="var(--color-action)" opacity="0.16" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2.5" fill="var(--color-action)" stroke="var(--color-surface)" strokeWidth="1" />
    </svg>
  )
}
