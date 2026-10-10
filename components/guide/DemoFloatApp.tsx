'use client'

/**
 * The in-app twin of the public site's floating "free demo" button (w11).
 *
 * Oren asked for the same offer inside the product, so a customer who is stuck
 * halfway through setup can ask for a walkthrough from the screen they are on
 * rather than hunting for a contact menu. It reuses components/public/DemoFloat
 * so the two can never drift in shape or motion, and it reuses the dashboard
 * ContactMenu's habit of naming the active project's site in the message, so the
 * conversation starts with the domain already on the table.
 *
 * It does NOT replace anything: the top-bar contact pill and the rail's support
 * row stay where they are. The dashboard has no other floating element, so this
 * owns the end corner at z-[59] on every size. Admins never see it, exactly as
 * they never see the contact pill or the rail's support row.
 *
 * The corner is not empty, though: the app's bottom bars end there too, and the
 * pill covered the summary's "Start" button (owner's report of 10 October 2026).
 * Every such bar carries `data-float-clear` and the pill rises above the one
 * under it (lib/shell/float-clearance.ts), by its own `bottom`, so the shared
 * DemoFloat and the public site's pill are untouched: same link, same words,
 * same place whenever nothing is under it.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { DemoFloat } from '@/components/public/DemoFloat'
import { whatsappHelpUrl } from '@/components/public/contact'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { FLOAT_CLEAR_ATTR, floatLift, type FloatBox } from '@/lib/shell/float-clearance'

/** How often the bars are looked for again: a bar can appear without a scroll (a save row on an edit). */
const RECHECK_MS = 400
/** The pill's resting `bottom` in the app (DemoFloat's `bottom-6`). */
const REST_BOTTOM = '1.5rem'

const boxOf = (r: DOMRect): FloatBox => ({ left: r.left, top: r.top, width: r.width, height: r.height })

/** Keeps the pill (the first child of `holder`) above every bar marked `data-float-clear`. */
function useFloatClearance(holder: RefObject<HTMLSpanElement | null>) {
  useEffect(() => {
    const pill = holder.current?.firstElementChild as HTMLElement | null
    if (!pill) return
    let lift = 0
    let frame = 0
    const place = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const now = pill.getBoundingClientRect()
        // Where the pill rests: its box now, less the lift it carries now.
        const rest: FloatBox = { ...boxOf(now), top: now.top + lift }
        const bars = Array.from(document.querySelectorAll<HTMLElement>(`[${FLOAT_CLEAR_ATTR}]`))
          .filter((el) => !el.hidden && el.getClientRects().length > 0)
          .map((el) => boxOf(el.getBoundingClientRect()))
        const next = floatLift(rest, bars)
        if (next === lift) return
        lift = next
        pill.style.bottom = next > 0 ? `calc(${REST_BOTTOM} + ${next}px)` : ''
      })
    }
    pill.style.transition = 'bottom 200ms var(--ease-snappy, ease-out), background-color 150ms, box-shadow 150ms'
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const timer = window.setInterval(place, RECHECK_MS)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      window.clearInterval(timer)
      pill.style.bottom = ''
      pill.style.transition = ''
    }
  }, [holder])
}

export default function DemoFloatApp() {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).contact
  const { activeProjectId, projects } = useActiveProject()
  const domain = projects.find((p) => p.id === activeProjectId)?.target_domain?.trim() ?? ''

  const holder = useRef<HTMLSpanElement>(null)
  useFloatClearance(holder)

  return (
    // `display: contents`: no box of its own, so the pill stays fixed to the screen.
    <span ref={holder} className="contents">
      <DemoFloat
        href={whatsappHelpUrl(t.demoMessage(domain))}
        label={t.demo}
        ariaLabel={t.demoAria}
        tone="app"
      />
    </span>
  )
}
