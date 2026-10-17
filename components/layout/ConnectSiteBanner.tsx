'use client'

/**
 * "Your site isn't connected yet", with the one button that connects it.
 *
 * On every screen of a project whose site is not connected (lib/shell/connect-banner.ts
 * decides where), from the same read as the notifications and the dashboard's
 * "waiting for you" card (useWaiting, one shared request): a read that failed or has
 * not answered shows nothing, never a guess. The button opens the settings' platform
 * section (#platform), where no tour starts first (lib/guide/tours.ts autoTour).
 *
 * The card is the app's neutral surface, like every card; only its icon and its
 * leading edge carry the action colour, so it reads as the next step, not as an alarm.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight, Plug } from 'lucide-react'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { connectBannerOnPath, showConnectBanner } from '@/lib/shell/connect-banner'
import { useWaiting } from '@/components/nudges/useWaiting'
import { linkButtonClass } from '@/components/dashboard/ui'
import { cn } from '@/lib/utils'

export default function ConnectSiteBanner({ where = 'shell', className }: {
  /** `shell`: the app's frame, on the screens connectBannerOnPath names. `dashboard`: placed by the dashboard itself. */
  where?: 'shell' | 'dashboard'
  className?: string
}) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).dashboardStart
  const { activeProjectId } = useActiveProject()
  const pathname = usePathname() ?? ''
  const onScreen = where === 'dashboard' || connectBannerOnPath(pathname)
  const { waiting } = useWaiting(onScreen ? activeProjectId : null, pathname)
  if (!onScreen || !activeProjectId || !showConnectBanner(waiting?.siteConnected)) return null
  const Arrow = language === 'he' ? ArrowLeft : ArrowRight

  return (
    <section
      aria-labelledby="connect-site-banner-title"
      data-connect-cta={where}
      className={cn(
        'relative mb-5 flex flex-col gap-4 overflow-hidden rounded-card border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:gap-5 sm:p-5',
        'before:absolute before:inset-y-0 before:start-0 before:w-1 before:bg-action',
        className,
      )}
    >
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-control bg-action-soft text-action ring-1 ring-action/10">
        <Plug size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="connect-site-banner-title" className="text-section font-semibold text-ink text-balance">{t.connectBanner.title}</h2>
        <p className="mt-0.5 max-w-3xl text-copy text-muted text-pretty">{t.connectBanner.body}</p>
      </div>
      <Link href={platformSetupHref(activeProjectId)} className={cn(linkButtonClass('primary'), 'h-10 shrink-0 self-start px-5 sm:self-center')} data-connect-cta-button="">
        <Plug size={15} aria-hidden="true" />
        {t.steps.connect.cta}
        <Arrow size={15} aria-hidden="true" />
      </Link>
    </section>
  )
}
