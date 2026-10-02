'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useInView } from './motion'

/**
 * A KPI that counts up from 0 to its value (600ms, once), starting the first
 * time it is ON SCREEN (useInView, components/ui/motion.tsx). It used to start
 * on render, so a figure further down the dashboard had finished counting before
 * anyone scrolled to it. Until then the count waits at its first frame
 * (data-count="wait" pauses the animation in app/globals.css).
 *
 * CSS only for the drawing (.count-up): the formatted value is rendered as usual
 * and held transparent while ::after draws an animated integer over it, so
 * screen readers, copy and print always get the real figure, and a refetch that
 * changes the value does not replay the count (the animation has already ended).
 *
 * Only whole numbers from 1 to 999 count; anything else (a fraction, a figure
 * formatted with a thousands separator the counter cannot draw, a zero with
 * nothing to count) renders as it is. With reduced motion nothing is drawn over
 * the value.
 */
export default function CountUp({ value, children }: { value: number; children: ReactNode }) {
  if (!Number.isInteger(value) || value < 1 || value > 999) return <>{children}</>
  return <Counting value={value}>{children}</Counting>
}

function Counting({ value, children }: { value: number; children: ReactNode }) {
  const [ref, seen] = useInView<HTMLSpanElement>({ threshold: 0.6, rootMargin: '0px' })
  return (
    <span ref={ref} className="count-up" data-count-up={value} data-count={seen ? 'run' : 'wait'} style={{ '--count-to': value } as CSSProperties}>
      <span className="count-up-value">{children}</span>
    </span>
  )
}
