'use client'

/**
 * The research tab's section bar: one pill per section of a long screen, sticky at the
 * top while it scrolls, the section in view marked. A click scrolls to the section
 * (smoothly, unless the owner asked the system for less motion) and moves focus there,
 * so a keyboard user lands where a mouse user does.
 */
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export type NavSection = { id: string; label: string }

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function SectionNav({ sections, label }: { sections: readonly NavSection[]; label: string }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null)
  const ids = sections.map((s) => s.id).join(' ')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const els = ids.split(' ').map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    if (els.length === 0) return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting)
      const first = els.find((el) => seen.get(el.id))
      if (first) setActive(first.id)
    }, { rootMargin: '-20% 0px -60% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [ids])

  const go = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: true })
    setActive(id)
  }

  return (
    <nav aria-label={label} data-research-nav="" className="sticky top-2 z-20 mb-6 flex justify-center">
      <ul className="flex max-w-full gap-1 overflow-x-auto rounded-pill border border-line bg-surface/95 p-1 shadow-card backdrop-blur [scrollbar-width:none]">
        {sections.map((s) => {
          const on = s.id === active
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={on ? 'true' : undefined}
                onClick={(e) => { e.preventDefault(); go(s.id) }}
                className={cn(
                  'inline-flex h-8 items-center rounded-pill px-3.5 text-caption font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
                  on ? 'bg-ink text-canvas' : 'text-muted hover:bg-sunk hover:text-ink',
                )}
              >
                {s.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
