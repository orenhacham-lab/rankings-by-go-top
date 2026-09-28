'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { scrollToSection } from './anchors'

/** Pixels from the top of the window: the sections' scroll margin (scroll-mt-20, 80px), where a click on the index lands them, with a little slack. */
export const READING_LINE = 96

/**
 * The section being read, from each section's distance to the top of the window
 * (in screen order): the last one whose top has passed READING_LINE; at the end of
 * the page, the last one; before the first has passed, the first. Pure, for the QA.
 */
export function activeSection(tops: readonly { id: string; top: number }[], atEnd: boolean): string | null {
  if (tops.length === 0) return null
  if (atEnd) return tops[tops.length - 1].id
  let current = tops[0].id
  for (const s of tops) if (s.top <= READING_LINE) current = s.id
  return current
}

/**
 * "On this page", beside the cards on a wide screen: every section the screen
 * shows, the one being read marked as the owner scrolls.
 */
export default function SettingsIndex({ items, title }: { items: { id: string; label: string }[]; title: string }) {
  const [active, setActive] = useState<string | null>(null)
  const ids = items.map((i) => i.id).join(' ')

  useEffect(() => {
    const order = ids.split(' ')
    let frame = 0
    // The section being read is the last one whose top has passed the reading line
    // (where a click on the index lands it: scroll-mt-20);
    // at the end of the page, the last section, even when it is too short to reach
    // the line. It used to be "the first section in the upper half", which kept the
    // previous, taller section marked while the next one was already being read
    // (UX review P1-19).
    const pick = () => {
      frame = 0
      const tops: { id: string; top: number }[] = []
      for (const id of order) {
        const el = document.getElementById(id)
        if (el) tops.push({ id, top: el.getBoundingClientRect().top })
      }
      const doc = document.documentElement
      const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 2
      setActive(activeSection(tops, atEnd))
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(pick) }
    pick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
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
