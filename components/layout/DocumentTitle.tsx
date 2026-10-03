'use client'

/**
 * Names the browser tab after the screen that is open, in the dashboard's
 * language (lib/shell/page-title.ts). The dashboard's screens are client pages
 * that cannot export metadata, and the layout above them is kept between
 * screens, so the title is set here, on every change of screen or language, and
 * kept there while the document's own metadata is still streaming in.
 */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { navItemKeys, adminNavItems } from '@/components/layout/Sidebar'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { pageTitle, type TitledRoute } from '@/lib/shell/page-title'

export function dashboardTitleRoutes(dict: ReturnType<typeof getDashboardDictionary>): TitledRoute[] {
  const label = (item: (typeof navItemKeys)[number]) =>
    item.screenKey ? dict.contentHub.screens[item.screenKey] : dict.sidebar[item.labelKey]
  return [
    ...[...navItemKeys, ...adminNavItems].map((item) => ({ href: item.href, label: label(item) })),
    // Screens without a sidebar entry of their own.
    { href: '/projects', label: dict.sidebar.projects },
    { href: '/clients', label: dict.sidebar.clients },
  ]
}

export default function DocumentTitle() {
  const pathname = usePathname() ?? ''
  const { uiLocale } = useDashboardLanguage()
  const title = pageTitle(pathname, dashboardTitleRoutes(getDashboardDictionary(uiLocale)))
  useEffect(() => {
    const apply = () => { if (document.title !== title) document.title = title }
    apply()
    // On a full page load the root layout's metadata <title> streams in AFTER this
    // effect and would put the site's title back: whenever the head changes, the
    // screen's title is applied again (only when it differs, so this never loops).
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [title])
  return null
}
