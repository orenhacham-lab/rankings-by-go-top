'use client'

/**
 * The guided tour — the app's ONE tour system.
 *
 * It used to be a three-step tour that ran only for an account without projects,
 * from the dashboard, once. It is now the runner for every tour: the full tour and
 * each screen's short tour (lib/guide/tours.ts), started from the Guide pill in the
 * top bar (components/guide/GuideMenu.tsx), which also decides when one starts on
 * its own and remembers, per user, which were seen.
 *
 * Each step is a spotlight on one element of the page and a 320px bubble: a short
 * title, one line, Next / Skip. It is a modal dialog:
 *   - keyboard: Arrow keys move (the arrow that points FORWARD in the reading
 *     direction is "next": ← in Hebrew, → in English), Enter activates the
 *     focused button, Escape closes, Tab stays inside the bubble;
 *   - focus goes to the bubble's main button on every step and back to where it
 *     was when the tour ends;
 *   - on a phone the bubble is a sheet across the bottom (or the top, when the
 *     target is down there). A sidebar entry, which the phone keeps inside its
 *     closed menu, is shown by OPENING the menu (lib/shell/nav-drawer.ts) and
 *     spotlighting the entry there; the menu closes again when the tour moves
 *     off the sidebar or ends. A step never points at nothing: a target that
 *     still cannot be seen is skipped.
 * A step whose target is not on the page is skipped, so a screen switched off in
 * this build is never described.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { TourStep } from '@/lib/guide/tours'
import { BUBBLE_WIDTH, placeBubble, type Box, type Placement } from '@/lib/guide/placement'
import { cn } from '@/lib/utils'
import { navIsDrawer, requestNavDrawer } from '@/lib/shell/nav-drawer'

export interface TourRun {
  /** A new id is a fresh runner, even for the same steps. */
  id: number
  steps: readonly TourStep[]
}

export type TourEnd = 'completed' | 'dismissed'

/** How long a step whose target renders late (after its data) is waited for. */
const LAZY_WAIT_MS = 2500
/** How long a sidebar entry is waited for once the phone's menu was asked to open. */
const DRAWER_WAIT_MS = 1200
/**
 * How long a step inside a TAB is waited for once its tab was opened.
 *
 * A tab's panel is not in the document until the tab is open, so a step
 * pointing inside one was simply skipped: the tour named a screen's title and
 * then went quiet about everything the screen's tabs hold. A step may now name
 * the control that reveals its target (`activate`), which the runner clicks
 * once and then waits for, the same shape as the phone's menu above.
 */
const ACTIVATE_WAIT_MS = 1500
const POLL_MS = 150
const SPOT_PAD = 6
const DIM = 'color-mix(in srgb, var(--color-contrast) 58%, transparent)'

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  return getComputedStyle(el).visibility !== 'hidden'
}

/** The first VISIBLE match, and whether the selector matches anything at all. */
function findTarget(selector: string): { el: HTMLElement | null; exists: boolean } {
  let all: HTMLElement[] = []
  try { all = Array.from(document.querySelectorAll<HTMLElement>(selector)) } catch { all = [] }
  return { el: all.find(isVisible) ?? null, exists: all.length > 0 }
}

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height })
const sameBox = (a: Box | null, b: Box | null) =>
  !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The step on screen: its index, and the element it points at. */
interface Shown { index: number; target: HTMLElement }

export function DashboardOnboardingTour({ run, onEnd }: { run: TourRun | null; onEnd: (how: TourEnd) => void }) {
  // A new run is a fresh runner (keyed by its id): it starts at its first step
  // with nothing left over from the previous tour.
  return run ? <TourRunner key={run.id} run={run} onEnd={onEnd} /> : null
}

function TourRunner({ run, onEnd }: { run: TourRun; onEnd: (how: TourEnd) => void }) {
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale).guide
  const t = dict.tour
  const dir = language === 'he' ? 'rtl' : 'ltr'
  const steps = run.steps

  // The step being looked for. The bubble keeps showing the previous step until
  // this one's target is found, so moving between steps never flashes.
  const [index, setIndex] = useState(0)
  // Steps that are not on this page. A step that renders later (lazy) is only
  // known to be missing once it has been waited for.
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set(
    steps.flatMap((s, i) => (!s.lazy && !s.activate && !findTarget(s.target).exists ? [i] : [])),
  ))
  const [shown, setShown] = useState<Shown | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [bubbleHeight, setBubbleHeight] = useState(200)
  // Where focus was when the tour started: it goes back there at the end.
  const [returnFocus] = useState(() => document.activeElement as HTMLElement | null)
  const moveDir = useRef<1 | -1>(1)
  // Whether this tour opened the phone's menu, so it closes it again.
  const drawerOpened = useRef(false)
  const closeDrawer = useCallback(() => {
    if (!drawerOpened.current) return
    drawerOpened.current = false
    requestNavDrawer(false, { restoreFocus: false })
  }, [])
  useEffect(() => closeDrawer, [closeDrawer])
  const bubbleRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  const end = useCallback((how: TourEnd) => {
    onEnd(how)
    // Focus returns to where it was (the Guide pill, usually), once the dialog is gone.
    requestAnimationFrame(() => {
      if (returnFocus && returnFocus !== document.body && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true })
      else document.querySelector<HTMLElement>('[data-tour="guide"]')?.focus({ preventScroll: true })
    })
  }, [onEnd, returnFocus])

  const go = useCallback((delta: 1 | -1) => {
    moveDir.current = delta
    setIndex((i) => Math.max(0, i + delta))
  }, [])

  // Find the step's target: skip the step when it is not on the page, wait a
  // little for one that renders after its data.
  useEffect(() => {
    if (index >= steps.length) { end('completed'); return }
    const current = steps[index]
    let cancelled = false
    const started = Date.now()
    let askedDrawer = 0
    let activated = 0
    const attempt = () => {
      if (cancelled) return
      const found = findTarget(current.target)
      // A step inside a tab (or behind a switch): click the control that reveals
      // it, ONCE, then wait for the panel the same way a lazy step is waited
      // for. Clicking a control the reader can see and could click themselves
      // is the whole of it — the tour never submits a form or saves anything.
      if (!found.el && current.activate && !activated) {
        const control = findTarget(current.activate).el
        if (control) { activated = Date.now(); control.click() }
      }
      if (!found.el && activated && Date.now() - activated < ACTIVATE_WAIT_MS) {
        timer = window.setTimeout(attempt, POLL_MS)
        return
      }
      // A sidebar entry on a phone: in the closed menu. Open the menu and wait for it.
      if (!found.el && found.exists && current.navEntry && navIsDrawer()) {
        if (!askedDrawer) {
          askedDrawer = Date.now()
          drawerOpened.current = true
          requestNavDrawer(true, { restoreFocus: false })
        }
        if (Date.now() - askedDrawer < DRAWER_WAIT_MS) { timer = window.setTimeout(attempt, POLL_MS); return }
      }
      if (found.el) {
        // Off the sidebar now: the menu the tour opened closes.
        if (!current.navEntry) closeDrawer()
        setBox(toBox(found.el.getBoundingClientRect()))
        setShown({ index, target: found.el })
        setSkipped((s) => (s.has(index) ? new Set([...s].filter((i) => i !== index)) : s))
        return
      }
      if (current.lazy && Date.now() - started < LAZY_WAIT_MS) { timer = window.setTimeout(attempt, POLL_MS); return }
      setSkipped((s) => new Set(s).add(index))
      // Skipping backwards past the first step turns round.
      if (index + moveDir.current < 0) moveDir.current = 1
      setIndex(index + moveDir.current)
    }
    let timer = window.setTimeout(attempt, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [index, steps, end, closeDrawer])

  // Bring the target into view, then follow it while the page scrolls or resizes.
  const target = shown?.target ?? null
  useEffect(() => {
    if (target) {
      const r = target.getBoundingClientRect()
      if (r.top < 64 || r.bottom > window.innerHeight - 16) {
        target.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
      }
    }
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setViewport((v) => (v.width === window.innerWidth && v.height === window.innerHeight ? v : { width: window.innerWidth, height: window.innerHeight }))
        if (!target) return
        const next = toBox(target.getBoundingClientRect())
        setBox((prev) => (sameBox(prev, next) ? prev : next))
      })
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    // The page can still move under a step (data arriving above the target).
    const settle = window.setInterval(measure, 400)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.clearInterval(settle)
    }
  }, [target])

  // The bubble's own height, for placing it above a target or as a sheet.
  const hasBubble = shown !== null
  useEffect(() => {
    const el = bubbleRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBubbleHeight(el.offsetHeight || 200))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasBubble])

  // Focus the main button once per step. Not on every re-placement: that would
  // pull focus off Back or Skip while the page scrolls.
  const shownIndex = shown?.index ?? null
  useEffect(() => {
    if (shownIndex !== null) primaryRef.current?.focus({ preventScroll: true })
  }, [shownIndex])

  // Keys work wherever focus is while the tour is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); end('dismissed'); return }
      const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
      const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
      if (e.key === forward) { e.preventDefault(); go(1); return }
      if (e.key === backward) { e.preventDefault(); go(-1); return }
      if (e.key === 'Tab' && bubbleRef.current) {
        const focusables = Array.from(bubbleRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'))
        if (focusables.length === 0) return
        const first = focusables[0], last = focusables[focusables.length - 1]
        const active = document.activeElement
        const inside = active instanceof Node && bubbleRef.current.contains(active)
        if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [dir, go, end])

  const step = shown ? steps[shown.index] : null
  // The text: the step's own, or the variant the element it found asks for.
  const variant = shown?.target.dataset.tourVariant
  const copyKey = (step && variant && step.variants?.[variant]) || step?.key
  // Until the first step is found, the page is held and dimmed, with no bubble yet.
  const placement: Placement | null =
    !shown ? null
      : box ? placeBubble(box, bubbleHeight, viewport, dir, !!shown.target.closest('aside'))
          : null

  const at = shown?.index ?? 0
  const total = steps.length - skipped.size
  let position = 1
  for (let i = 0; i < at; i++) if (!skipped.has(i)) position++
  let isLast = true
  for (let i = at + 1; i < steps.length; i++) if (!skipped.has(i)) { isLast = false; break }
  const titleId = `tour-title-${run.id}`
  const bodyId = `tour-body-${run.id}`

  const bubbleStyle: React.CSSProperties =
    !placement ? { visibility: 'hidden', left: 0, top: 0, width: BUBBLE_WIDTH }
      : placement.mode === 'anchored' ? { left: placement.left, top: placement.top, width: placement.width }
        : placement.mode === 'center' ? { left: '50%', top: '50%', width: BUBBLE_WIDTH, transform: 'translate(-50%, -50%)' }
          : {}

  const spotlight = shown && box ? (
    <div
      aria-hidden="true"
      data-tour-spotlight=""
      className="pointer-events-none fixed z-[91] rounded-inset motion-safe:transition-[left,top,width,height] motion-safe:duration-200 motion-safe:ease-snappy"
      style={{
        left: box.left - SPOT_PAD, top: box.top - SPOT_PAD,
        width: box.width + SPOT_PAD * 2, height: box.height + SPOT_PAD * 2,
        boxShadow: `0 0 0 200vmax ${DIM}`,
        // An outline, not a ring: a ring is a box-shadow, and this box-shadow is the dimming.
        outline: '2px solid var(--color-action)', outlineOffset: 0,
      }}
    />
  ) : (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[91]" style={{ backgroundColor: DIM }} />
  )

  return createPortal(
    <>
      {/* Holds the page still while the tour is open; a click outside does not end it. */}
      <div aria-hidden="true" className="fixed inset-0 z-[90]" />
      {spotlight}
      {step && (
        <div
          ref={bubbleRef}
          dir={dir}
          lang={language}
          role="dialog"
          aria-modal="true"
          aria-roledescription={t.label}
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          data-tour-bubble={copyKey}
          className={cn(
            'fixed z-[92] rounded-card border border-line bg-surface p-4 text-start shadow-pop motion-safe:animate-pop-in',
            placement?.mode === 'sheet' && 'inset-x-4',
            placement?.mode === 'sheet' && (placement.edge === 'top' ? 'top-4' : 'bottom-4'),
          )}
          style={bubbleStyle}
        >
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="text-caption font-semibold text-action">{t.stepOf(position, total)}</span>
            <button
              type="button"
              onClick={() => end('dismissed')}
              aria-label={t.close}
              className="-me-1.5 inline-flex size-7 items-center justify-center rounded-control text-muted transition-colors hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
          <h2 id={titleId} className="text-section font-semibold text-ink text-balance">{dict.steps[copyKey ?? step.key].title}</h2>
          <p id={bodyId} className="mt-1 text-copy text-body text-pretty">{dict.steps[copyKey ?? step.key].body}</p>

          <div className="mt-3 flex items-center gap-1" aria-hidden="true">
            {steps.map((_, i) => skipped.has(i) ? null : (
              <span
                key={i}
                className={cn('h-1.5 rounded-pill transition-[width,background-color] duration-200',
                  i === at ? 'w-4 bg-action' : i < at ? 'w-1.5 bg-action/40' : 'w-1.5 bg-line-strong')}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            {isLast ? <span /> : (
              <button
                type="button"
                onClick={() => end('dismissed')}
                className="rounded-control px-2 py-1.5 text-copy font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
              >
                {t.skip}
              </button>
            )}
            <div className="flex items-center gap-2">
              {position > 1 && (
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="rounded-control border border-line px-3 py-1.5 text-copy font-medium text-body transition-colors hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
                >
                  {t.back}
                </button>
              )}
              <button
                ref={primaryRef}
                type="button"
                onClick={() => (isLast ? end('completed') : go(1))}
                className="inline-flex items-center gap-1 rounded-control bg-action px-3.5 py-1.5 text-copy font-semibold text-action-ink transition-colors hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-safe:active:scale-[.98]"
              >
                {isLast ? t.done : t.next}
                {!isLast && <ChevronLeft size={15} strokeWidth={2.2} className="ltr:rotate-180" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <p className="sr-only">{t.keysHint}</p>
        </div>
      )}
    </>,
    document.body,
  )
}
