'use client'

/**
 * One tab per kind, each with the TRUE total of the site ("מוצרים 912"), even
 * when the list below shows only the first rows of it. A tab list (arrow keys
 * move and select, one tab stop), scrolling inside itself on a phone rather
 * than widening the page.
 *
 * A kind the site has none of is not a tab: a service business was offered an empty
 * "מוצרים 0" tab (review P2-9). "All" and the tab on screen always stay. The row
 * scrolls with room at both ends, so the first tab is never clipped on a phone.
 */
import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { TABS, type ExistingContentTab, type TabCounts } from '@/lib/content/existing-content/model'

type Copy = ReturnType<typeof getDashboardDictionary>['existingContent']

/** The tabs worth showing: "all", every kind the site has, and the one on screen. */
export function visibleTabs(counts: TabCounts, value: ExistingContentTab): ExistingContentTab[] {
  return TABS.filter((t) => t === 'all' || t === value || counts[t] > 0)
}

export default function KindTabs({ x, counts, capped, value, onChange, num, panelId }: {
  x: Copy
  counts: TabCounts
  capped: boolean
  value: ExistingContentTab
  onChange: (t: ExistingContentTab) => void
  num: Intl.NumberFormat
  panelId: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const shown = visibleTabs(counts, value)
  const move = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'Home' ? -i : e.key === 'End' ? shown.length - 1 - i : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + shown.length) % shown.length
    refs.current[next]?.focus()
    onChange(shown[next])
  }
  return (
    <div data-kind-tabs-scroll="" className="-mx-4 overflow-x-auto px-4 [scroll-padding-inline:1rem] [scrollbar-width:none] sm:-mx-1 sm:px-1">
      <div role="tablist" aria-label={x.tabsLabel} className="flex min-w-max items-end gap-1 border-b border-line">
        {shown.map((t, i) => {
          const on = t === value
          return (
            <button
              key={t}
              ref={(el) => { refs.current[i] = el }}
              type="button"
              role="tab"
              id={`existing-tab-${t}`}
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              data-tab={t}
              onClick={() => onChange(t)}
              onKeyDown={(e) => move(e, i)}
              className={cn(
                'relative -mb-px inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-copy font-semibold transition-colors duration-150 ease-snappy',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 rounded-t-control',
                on ? 'border-action text-ink' : 'border-transparent text-muted hover:text-ink hover:border-line-strong',
              )}
            >
              <span>{x.tabs[t]}</span>
              <span
                data-tab-count=""
                className={cn('rounded-pill px-2 py-0.5 text-caption font-semibold tabular-nums', on ? 'bg-action-soft text-action' : 'bg-sunk text-muted')}
              >
                {num.format(counts[t])}{capped ? '+' : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
