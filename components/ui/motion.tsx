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
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
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

/* ── Wave 7: the motion layer's React side ───────────────────────────────── */

/**
 * A figure that counts up from 0 to its value (900ms, ease-out), once, the first
 * time it is on screen. Unlike the CSS `.count-up` (whole numbers 1-999 only) it
 * takes any finite number and draws it through `format`, so "34,880", "₪11.65" and
 * "8.4" all count in their own format.
 *
 * The real, formatted value is in the DOM the whole time (held transparent while
 * the count draws over it, so it also reserves the final width): screen readers,
 * copy and print always get the true figure. A later change of value (a refetch)
 * shows the new figure at once; nothing replays. With reduced motion, or for a
 * zero, it is simply the value.
 */
export function AnimatedNumber({ value, format, duration = 900, className }: {
  value: number
  format: (n: number) => string
  duration?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [inViewRef, seen] = useInView<HTMLSpanElement>({ threshold: 0.3, rootMargin: '0px' })
  const el = useRef<HTMLSpanElement | null>(null)
  const ref = useCallback((node: HTMLSpanElement | null) => { el.current = node; inViewRef(node) }, [inViewRef])
  // null: show the value itself. A number: the frame being drawn.
  const [frame, setFrame] = useState<number | null>(null)
  const [phase, setPhase] = useState<'idle' | 'wait' | 'run' | 'done'>('idle')
  const target = Number.isFinite(value) ? value : 0

  // Before paint, hold the figure at 0 until it is seen (no flash of the final value).
  useIsoLayoutEffect(() => {
    if (phase !== 'idle') return
    if (reduced || target === 0) { setPhase('done'); return }
    setPhase('wait')
    setFrame(0)
  }, [phase, reduced, target])

  // Seen: start counting, once the block it sits in has finished entering (a figure
  // that counted while its card was still fading in would be seen already done). A
  // separate effect from the frames below, so that changing the phase does not cancel
  // the frame loop it starts.
  useEffect(() => {
    if (phase !== 'wait' || !seen) return
    let live = true
    const start = () => { if (live) setPhase('run') }
    void settled(el.current, ENTRANCE_WAIT_MS).then(start)
    return () => { live = false }
  }, [phase, seen])

  useEffect(() => {
    if (phase !== 'run') return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      // A frame's timestamp can precede `start` by a hair: clamp, or the first frame is below 0.
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      const eased = 1 - Math.pow(1 - t, 4)
      if (t < 1) {
        setFrame(target * eased)
        raf = requestAnimationFrame(tick)
      } else {
        setFrame(null)
        setPhase('done')
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // `target` is read once, when the count starts: a later value is shown as it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, duration])

  const counting = frame !== null && phase !== 'done'
  return (
    <span ref={ref} className={cn('relative inline-block tabular-nums', className)} data-animated-number={phase}>
      <span style={counting ? { color: 'transparent' } : undefined}>{format(value)}</span>
      {counting && (
        <span aria-hidden="true" className="absolute inset-y-0 start-0 whitespace-nowrap">{format(frame)}</span>
      )}
    </span>
  )
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** The longest a count waits for its block's entrance (page-in, stagger-in, fade-in). */
const ENTRANCE_WAIT_MS = 900

/**
 * Resolves when the CSS entrances running on `node` or any block around it have
 * finished (or after `cap` ms, whichever is first; at once when there are none or
 * the browser cannot say). Looping animations (a hero's drifting glow) are ignored.
 */
function settled(node: Element | null, cap: number): Promise<void> {
  if (!node || typeof document === 'undefined' || typeof document.getAnimations !== 'function') return Promise.resolve()
  const entering = document.getAnimations().filter((a) => {
    const target = (a.effect as KeyframeEffect | null)?.target
    if (!target || !(target instanceof Element) || !target.contains(node)) return false
    const timing = a.effect?.getComputedTiming()
    return a.playState === 'running' && timing?.iterations !== Infinity
  })
  if (entering.length === 0) return Promise.resolve()
  return Promise.race([
    Promise.all(entering.map((a) => a.finished.catch(() => undefined))).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, cap)),
  ])
}

/**
 * True for the first render(s) after `ready` first turns true, then false for good
 * (after `ms`). Drives an entrance that must play once, on the first data only: a
 * table's rows (.rows-enter) enter when the list first arrives, and a sort, a
 * filter or a refetch afterwards shows the rows at once.
 */
export function useFirstEntrance(ready: boolean, ms = 900): boolean {
  const [state, setState] = useState<'before' | 'on' | 'off'>('before')
  // The first data: on, in the same render (React's "adjust state while rendering").
  if (state === 'before' && ready) setState('on')
  useEffect(() => {
    if (state !== 'on') return
    const t = setTimeout(() => setState('off'), ms)
    return () => clearTimeout(t)
  }, [state, ms])
  return state === 'on' || (state === 'before' && ready)
}

/**
 * A sliding "thumb" behind the chosen item of a group (a segmented control, chips,
 * a section bar): one absolutely placed element that moves to the chosen item's box
 * on a soft spring (320ms). Placed from the DOM in a layout effect, so the first
 * placement jumps instead of sliding in from a corner; the container gets
 * data-thumb="on" once it is placed, which lets the items drop their own fill.
 *
 *   const { containerRef, thumbRef } = useSlidingThumb('[aria-checked="true"]', [value])
 */
export function useSlidingThumb<C extends HTMLElement = HTMLDivElement>(selector: string, deps: readonly unknown[]) {
  const containerRef = useRef<C>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const place = useCallback(() => {
    const box = containerRef.current
    const thumb = thumbRef.current
    if (!box || !thumb) return
    const on = box.querySelector<HTMLElement>(selector)
    if (!on || on.offsetWidth === 0) { box.dataset.thumb = 'off'; return }
    thumb.style.width = `${on.offsetWidth}px`
    thumb.style.height = `${on.offsetHeight}px`
    thumb.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`
    box.dataset.thumb = 'on'
  }, [selector])
  useIsoLayoutEffect(() => {
    place()
    const thumb = thumbRef.current
    const frame = requestAnimationFrame(() => { if (thumb) thumb.dataset.slide = 'on' })
    return () => cancelAnimationFrame(frame)
  }, [place, ...deps])
  useEffect(() => {
    const box = containerRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => place())
    ro.observe(box)
    return () => ro.disconnect()
  }, [place])
  return { containerRef, thumbRef }
}

/** The thumb's own classes: absolutely placed at the container's top-left, sliding once placed. */
export const THUMB_CLASSES =
  'pointer-events-none absolute left-0 top-0 hidden group-data-[thumb=on]/thumb:block ' +
  'data-[slide=on]:transition-[transform,width,height] data-[slide=on]:duration-300 data-[slide=on]:ease-spring motion-reduce:transition-none'

/**
 * Skeleton to content, as a crossfade: while `loading` the skeleton is the block;
 * when the content arrives it fades in (320ms) while the skeleton, laid over it,
 * fades out and is then removed. With reduced motion the content simply replaces it.
 */
export function Crossfade({ loading, skeleton, children, className }: {
  loading: boolean
  skeleton: ReactNode
  children: ReactNode
  className?: string
}) {
  const [leaving, setLeaving] = useState(false)
  const [wasLoading, setWasLoading] = useState(loading)
  if (wasLoading !== loading) {
    setWasLoading(loading)
    if (!loading) setLeaving(true)
  }
  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(false), 340)
    return () => clearTimeout(t)
  }, [leaving])
  if (loading) return <div className={className}>{skeleton}</div>
  return (
    <div className={cn('relative', className)}>
      <div className={leaving ? 'fade-in' : undefined}>{children}</div>
      {leaving && <div aria-hidden="true" className="fade-out absolute inset-x-0 top-0">{skeleton}</div>}
    </div>
  )
}
