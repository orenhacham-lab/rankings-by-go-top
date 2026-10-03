'use client'

/**
 * The landing page's scroll motion: blocks that rise into view, figures that
 * count up, and the "how it works" line that fills step by step.
 *
 * Unlike ui/motion's <Reveal>, which the server renders hidden until a script
 * reveals it, everything here is rendered FINISHED by the server. After
 * hydration the client decides, per element, whether to animate it:
 *   - reduced motion asked for      -> leave it as it is;
 *   - already on screen at load     -> leave it as it is (no flash, no replay);
 *   - below the fold                -> park it in its starting pose, and play
 *                                      it once the first time it scrolls in.
 * So a block is only ever hidden while it is off screen, by a script that is
 * running, and a failed script, a crawler or a print sees the whole page.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useReducedMotion } from '@/components/ui/motion'
import { cn } from '@/lib/utils'
import styles from './landing.module.css'

type Entrance = 'static' | 'wait' | 'in'

/**
 * The entrance state machine shared by Rise, Counter and Flow. `static` is the
 * server's (finished) state, and the state for anything that should not move.
 */
function useEntrance<T extends Element>(threshold = 0.2): [React.RefObject<T | null>, Entrance] {
  const ref = useRef<T | null>(null)
  const reduced = useReducedMotion()
  const [state, setState] = useState<Entrance>('static')
  useEffect(() => {
    // Reduced motion asked for: back to the finished state. The hook's first run
    // happens with the server's answer (motion allowed), so a block below the
    // fold may already have been parked in 'wait' by the time the real setting
    // arrives; staying there left every counter reading 0 for good.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reduced) { setState('static'); return }
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.92) return // visible at load: leave it be
    // Parking it is the one synchronous state change, and it has to happen
    // before the next paint or the block would flash in and out.
    setState('wait')
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setState('in')
        io.disconnect()
      }
    }, { threshold, rootMargin: '0px 0px -6% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [reduced, threshold])
  return [ref, state]
}

/** A block that rises 18px and fades in the first time it scrolls into view. */
export function Rise({ children, className, delay = 0, as: As = 'div' }: {
  children: ReactNode
  className?: string
  /** Stagger in ms (capped at 400 so nothing waits long). */
  delay?: number
  as?: 'div' | 'li'
}) {
  const [ref, state] = useEntrance<HTMLDivElement>(0.15)
  return (
    <As
      ref={ref as React.RefObject<never>}
      data-rise={state}
      className={cn(styles.rise, className)}
      style={{ '--rise-delay': `${Math.min(delay, 400)}ms` } as CSSProperties}
    >
      {children}
    </As>
  )
}

/**
 * A whole number that counts up from 0 once it scrolls into view (1.2s, ease
 * out). The server renders the real value; the screen reader always reads it.
 */
export function Counter({ value, className }: { value: number; className?: string }) {
  const [ref, state] = useEntrance<HTMLSpanElement>(0.6)
  const [shown, setShown] = useState<number>(value)
  const reduced = useReducedMotion()
  useEffect(() => {
    // With reduced motion the figure is simply its value, whatever the entrance state says.
    if (reduced) { setShown(value); return } // eslint-disable-line react-hooks/set-state-in-effect
    if (state === 'wait') { setShown(0); return }
    if (state !== 'in') { setShown(value); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1200)
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state, value, reduced])
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  )
}

/**
 * The frame of the "how it works" flow: it only carries the entrance state
 * (data-flow) that the line and the step nodes inside read in CSS.
 */
export function Flow({ children, className, rtl }: { children: ReactNode; className?: string; rtl: boolean }) {
  const [ref, state] = useEntrance<HTMLDivElement>(0.3)
  return (
    <div
      ref={ref}
      data-flow={state}
      className={className}
      style={{ '--flow-origin': rtl ? 'right' : 'left' } as CSSProperties}
    >
      {children}
    </div>
  )
}
