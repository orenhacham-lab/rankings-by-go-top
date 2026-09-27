'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { scrollToSection } from './anchors'

/**
 * "On this page", beside the cards on a wide screen: every section the screen
 * shows, the one being read marked as the owner scrolls.
 */
export default function SettingsIndex({ items, title }: { items: { id: string; label: string }[]; title: string }) {
  const [active, setActive] = useState<string | null>(null)
  const ids = items.map((i) => i.id).join(' ')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const order = ids.split(' ')
    const inView = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inView.add(e.target.id)
          else inView.delete(e.target.id)
        }
        const first = order.find((id) => inView.has(id))
        if (first) setActive(first)
      },
      // A section counts once its top has passed under the top bar, until it leaves the upper part of the screen.
      { rootMargin: '-72px 0px -55% 0px' },
    )
    for (const id of order) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])

  const position = active ? items.findIndex((i) => i.id === active) : -1
  return (
    <nav aria-label={title} className="rounded-card border border-line bg-surface/80 p-3 shadow-card backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 px-2 pb-2.5 pt-1">
        <p className="text-caption font-semibold text-ink">{title}</p>
        {position >= 0 && (
          <span aria-hidden className="text-caption tabular-nums text-muted">
            {position + 1}/{items.length}
          </span>
        )}
      </div>
      <ol className="space-y-0.5">
        {items.map((item, i) => {
          const on = active === item.id
          const passed = position > i
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  scrollToSection(item.id)
                }}
                aria-current={on ? 'location' : undefined}
                className={cn(
                  'group flex items-center gap-2.5 rounded-control px-2 py-1.5 text-copy transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
                  on ? 'bg-action-soft font-semibold text-action' : 'text-muted hover:bg-sunk hover:text-ink',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold tabular-nums transition-colors',
                    on ? 'bg-action text-action-ink' : passed ? 'bg-line-strong/70 text-ink' : 'bg-sunk text-muted group-hover:bg-line',
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
