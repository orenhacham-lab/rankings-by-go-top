'use client'

/**
 * The slim strip under the top bar for a website account in its free trial:
 * how many days are left, and a link to the billing screen. DISPLAY ONLY — who
 * sees it, and what it says, is decided on the server by lib/billing/trial-bar.ts;
 * this only draws that answer in the dashboard's language.
 *
 * On the billing screen itself the link would lead to the page already open, so
 * there it is left out and only the sentence stays.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Hourglass } from 'lucide-react'
import type { TrialBarState } from '@/lib/billing/trial-bar'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { cn } from '@/lib/utils'

export const BILLING_HREF = '/billing'

export default function TrialBar({ state }: { state: TrialBarState }) {
  const { language } = useDashboardLanguage()
  const pathname = usePathname()
  if (state.kind === 'hidden') return null
  const t = getDashboardDictionary(language).trialBar
  const urgent = state.kind !== 'active'
  const text = state.kind === 'active' ? t.daysLeft(state.daysLeft) : state.kind === 'last_day' ? t.lastDay : t.expired
  const onBilling = pathname === BILLING_HREF || pathname?.startsWith(`${BILLING_HREF}/`)
  return (
    <div
      role="status"
      aria-label={t.label}
      data-trial-bar={state.kind}
      className={cn(
        'motion-safe:animate-pop-in border-b px-4 md:px-8',
        urgent ? 'border-warn/20 bg-warn-soft text-warn' : 'border-info/15 bg-info-soft text-info',
      )}
    >
      {/* One line on a phone too: the sentence shrinks to the caption size and the
          link to a compact pill, so the strip stays 40px instead of wrapping to two. */}
      <div className="mx-auto flex min-h-10 w-full max-w-[1280px] items-center justify-between gap-x-3 py-1.5 sm:gap-x-4">
        <p className="flex min-w-0 items-center gap-2 text-caption font-medium sm:text-copy">
          <Hourglass size={15} strokeWidth={2} aria-hidden className="shrink-0" />
          <span>{text}</span>
        </p>
        {!onBilling && (
          <Link
            href={BILLING_HREF}
            data-trial-upgrade
            className="inline-flex h-7 shrink-0 items-center rounded-control bg-commit px-2.5 text-caption sm:h-8 sm:px-3 font-semibold text-commit-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_0_0_1px_rgb(120_70_0/0.14)] transition-colors duration-150 hover:bg-commit-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            {t.upgrade}
          </Link>
        )}
      </div>
    </div>
  )
}
