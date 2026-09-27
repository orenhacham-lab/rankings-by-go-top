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

  return (
    <nav aria-label={title}>
      <p className="mb-3 text-caption font-semibold text-muted">{title}</p>
      <ul className="border-s border-line">
        {items.map((item) => {
          const on = active === item.id
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
                  '-ms-px block border-s-2 py-1.5 ps-4 text-copy transition-colors duration-150',
                  on ? 'border-action font-medium text-ink' : 'border-transparent text-muted hover:border-line-strong hover:text-body',
                )}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
