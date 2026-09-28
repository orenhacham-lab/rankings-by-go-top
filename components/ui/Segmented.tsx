'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one segmented control (design contract §5): a sunk pill holding a few
 * mutually exclusive choices, the chosen one lifted onto the surface. It
 * replaces radio groups, filter-chip rows and the black "all" chip.
 *
 *   <Segmented ariaLabel={t.filter} value={filter} onChange={setFilter}
 *     options={[{ value: 'all', label: t.all }, { value: 'up', label: t.up, count: 4 }]} />
 *
 * Semantics are a radiogroup: one tab stop (the chosen item), arrow keys move
 * and choose, following the reading direction (in Hebrew ArrowLeft is "next").
 */
export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: LucideIcon
  count?: number
  disabled?: boolean
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  /** Stretch to the container's width, items sharing it equally (mobile toolbars). */
  fill?: boolean
}

export const SEGMENTED_TRACK_CLASSES = 'inline-flex items-center gap-0.5 rounded-pill bg-sunk p-1'
export const SEGMENTED_ITEM_CLASSES =
  'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-pill px-3 text-caption font-semibold text-muted ' +
  'transition-[background-color,color,box-shadow] duration-150 ease-snappy hover:text-ink ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-control'

export default function Segmented<T extends string>({ options, value, onChange, ariaLabel, className, fill }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
  // One tab stop: the chosen item, or the first enabled one when none is chosen.
  const chosen = options.findIndex((o) => o.value === value)
  const tabStop = chosen >= 0 ? chosen : enabled[0]

  function move(e: KeyboardEvent<HTMLButtonElement>, from: number) {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const keys: Record<string, number | 'first' | 'last'> = {
      ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last',
    }
    const step = keys[e.key]
    if (step === undefined || !enabled.length) return
    e.preventDefault()
    const at = enabled.indexOf(from)
    const next = step === 'first' ? enabled[0]
      : step === 'last' ? enabled[enabled.length - 1]
      : enabled[(at + step + enabled.length) % enabled.length]
    refs.current[next]?.focus()
    onChange(options[next].value)
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn(SEGMENTED_TRACK_CLASSES, fill && 'flex w-full', className)}>
      {options.map((o, i) => {
        const on = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={o.disabled}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={cn(SEGMENTED_ITEM_CLASSES, fill && 'flex-1')}
          >
            {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
            <span>{o.label}</span>
            {typeof o.count === 'number' && (
              <span className={cn('tabular-nums', on ? 'text-muted' : 'text-muted/80')}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
