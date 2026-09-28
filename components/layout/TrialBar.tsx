'use client'

/**
 * The slim strip under the top bar for a website account in its free trial:
 * how many days are left, and a link to the billing screen. DISPLAY ONLY — who
 * sees it, and what it says, is decided on the server by lib/billing/trial-bar.ts;
 * this only draws that answer in the dashboard's language.
 *
 * The look is the UX review's (P1-1): a 40px strip in the rail's navy with the
 * day count in the warm trial badge and "Upgrade now" in the action colour, the
 * one filled button on it. In the last three days, on the last day and after
 * the trial ends, the strip turns the urgent dark red. The viewer can hide it
 * for 24 hours while days remain (a per-browser convenience, nothing is
 * saved anywhere else); an ended trial cannot be hidden.
 *
 * On the billing screen itself the link would lead to the page already open, so
 * there it is left out and only the sentence stays.
 */
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Hourglass, X } from 'lucide-react'
import type { TrialBarState } from '@/lib/billing/trial-bar'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { cn } from '@/lib/utils'

export const BILLING_HREF = '/billing'

/** Days left at or under which the strip turns urgent. */
export const URGENT_DAYS = 3

const HIDE_KEY = 'trial-bar-hidden-until'
const HIDE_EVENT = 'trial-bar-hidden'
const HIDE_MS = 24 * 60 * 60 * 1000

function subscribeHidden(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(HIDE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(HIDE_EVENT, onChange)
  }
}

function readHidden(): boolean {
  try {
    return Number(window.localStorage.getItem(HIDE_KEY) || 0) > Date.now()
  } catch {
    return false
  }
}

function hideForADay() {
  try {
    window.localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_MS))
  } catch {
    // Storage blocked: the bar simply stays.
  }
  window.dispatchEvent(new Event(HIDE_EVENT))
}

export default function TrialBar({ state }: { state: TrialBarState }) {
  const { language } = useDashboardLanguage()
  const pathname = usePathname()
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => false)
  if (state.kind === 'hidden') return null
  const canHide = state.kind !== 'expired'
  if (canHide && hidden) return null
  const t = getDashboardDictionary(language).trialBar
  const urgent = state.kind !== 'active' || state.daysLeft <= URGENT_DAYS
  const onBilling = pathname === BILLING_HREF || pathname?.startsWith(`${BILLING_HREF}/`)
  let sentence: React.ReactNode
  if (state.kind === 'active') {
    const [before, after] = t.daysLeft(state.daysLeft)
    sentence = (
      <>
        {before && <span>{before}</span>}{' '}
        <span data-trial-days="" className="inline-grid h-6 min-w-6 place-items-center rounded-pill bg-commit px-1.5 text-caption font-bold text-commit-ink tabular-nums">
          {state.daysLeft}
        </span>{' '}
        <span>{after}</span>
      </>
    )
  } else {
    sentence = <span>{state.kind === 'last_day' ? t.lastDay : t.expired}</span>
  }
  return (
    <div
      role="status"
      aria-label={t.label}
      data-trial-bar={state.kind}
      data-trial-urgent={urgent ? '' : undefined}
      className={cn(
        'motion-safe:animate-pop-in px-4 text-contrast-ink md:px-8',
        urgent ? 'bg-contrast-urgent' : 'bg-contrast',
      )}
    >
      {/* One line on a phone too, so the strip stays 40px instead of wrapping to two. */}
      <div className="mx-auto flex min-h-10 w-full max-w-[1280px] items-center justify-between gap-x-3 py-1.5 sm:gap-x-4">
        <p className="flex min-w-0 items-center gap-1.5 text-caption font-medium leading-5 sm:text-copy sm:leading-5">
          <Hourglass size={15} strokeWidth={2} aria-hidden className="me-0.5 shrink-0" />
          {sentence}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {!onBilling && (
            <Link
              href={BILLING_HREF}
              data-trial-upgrade
              className="inline-flex h-7 shrink-0 items-center rounded-control bg-action px-3 text-caption font-semibold text-action-ink transition-colors duration-150 hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-contrast-ink focus-visible:ring-offset-2 focus-visible:ring-offset-contrast"
            >
              {t.upgrade}
            </Link>
          )}
          {canHide && (
            <button
              type="button"
              onClick={hideForADay}
              aria-label={t.dismiss}
              title={t.dismiss}
              data-trial-hide
              className="grid size-7 place-items-center rounded-control text-contrast-ink/80 transition-colors hover:bg-contrast-ink/10 hover:text-contrast-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-contrast-ink"
            >
              <X size={15} strokeWidth={2} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
