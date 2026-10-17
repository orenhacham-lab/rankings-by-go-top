'use client'

/**
 * Follows a link to a section of the screen already open (lib/shell/section-link.ts):
 * the address takes the link's (the native History API, which the Next.js router
 * follows), and the section scrolls into view. Returns whether it handled the
 * click; a link to another screen is left to the router.
 */
import type { MouseEvent } from 'react'
import { samePageSection } from '@/lib/shell/section-link'

export function followSectionLink(e: MouseEvent<HTMLElement>, href: string): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  const id = samePageSection({ pathname: window.location.pathname }, href, window.location.origin)
  if (!id) return false
  const el = document.getElementById(id)
  if (!el) return false
  e.preventDefault()
  const next = new URL(href, window.location.href)
  if (next.href !== window.location.href) window.history.replaceState(null, '', `${next.pathname}${next.search}${next.hash}`)
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  return true
}
