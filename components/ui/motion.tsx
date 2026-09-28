'use client'

/**
 * The app's ONE motion helper. Every screen that moves uses these, so motion is
 * the same everywhere and switches off in one place for a merchant who asked
 * their system for less of it (prefers-reduced-motion).
 *
 *   useReducedMotion()  the OS setting, live
 *   useInView()         a ref, and whether the element has been on screen (once)
 *   <Reveal>            a block that rises 8px and fades in the first time it
 *                       scrolls into view (280ms, optional stagger)
 *
 * The motion itself is CSS (.reveal and .count-up in app/globals.css), defined
 * only under `prefers-reduced-motion: no-preference`: with reduced motion the
 * CSS does nothing and every block is simply there. Without IntersectionObserver
 * (an old browser, a server render) everything counts as in view at once, so a
 * block can never stay hidden.
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const REDUCED = '(prefers-reduced-motion: reduce)'

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener?.('change', onChange)
  return () => mq.removeEventListener?.('change', onChange)
}

/** Whether the merchant's system asks for reduced motion. False on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED).matches,
    () => false,
  )
}

/**
 * A callback ref and whether its element has entered the viewport. Once true it
 * stays true: nothing replays when the merchant scrolls back.
 */
export function useInView<T extends Element>({ rootMargin = '0px 0px -8% 0px', threshold = 0.15 }: { rootMargin?: string; threshold?: number } = {}): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null)
  const [seen, setSeen] = useState(false)
  const ref = useCallback((node: T | null) => setEl(node), [])
  useEffect(() => {
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') {
      // No observer (very old browser): count as seen on the next tick, so nothing stays hidden.
      const t = setTimeout(() => setSeen(true), 0)
      return () => clearTimeout(t)
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin, threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [el, seen, rootMargin, threshold])
  return [ref, seen]
}

/** Stagger steps are 40ms, and stop growing after the fifth, so nothing waits long. */
export const REVEAL_STEP_MS = 40
export const REVEAL_MAX_STEPS = 5
export function revealDelay(index: number): number {
  return Math.min(Math.max(0, Math.floor(index)), REVEAL_MAX_STEPS) * REVEAL_STEP_MS
}

/**
 * A block that enters once, the first time it is on screen. `index` staggers a
 * row of blocks (0, 1, 2…). Renders a div; `className` goes on it.
 */
export function Reveal({ children, index = 0, className, ...rest }: {
  children: ReactNode
  index?: number
  className?: string
} & Record<`data-${string}`, string | undefined>) {
  const [ref, seen] = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      {...rest}
      data-reveal={seen ? 'in' : 'wait'}
      className={cn('reveal', className)}
      style={{ '--reveal-delay': `${revealDelay(index)}ms` } as CSSProperties}
    >
      {children}
    </div>
  )
}
