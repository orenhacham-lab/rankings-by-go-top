import type { CSSProperties, ReactNode } from 'react'

/**
 * A KPI that counts up from 0 to its value when it first renders (600ms, once).
 * CSS only (.count-up in globals.css): the formatted value is rendered as usual
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
  return (
    <span className="count-up" data-count-up={value} style={{ '--count-to': value } as CSSProperties}>
      <span className="count-up-value">{children}</span>
    </span>
  )
}
