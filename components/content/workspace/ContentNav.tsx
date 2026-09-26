'use client'

/**
 * The content workspace's tab bar — real links, one per screen.
 *
 * It replaces the useState tab bar inside the old ContentHub: a tab is now a route,
 * so it can be linked, bookmarked, opened in a new tab and restored by a refresh.
 * The two disabled "coming soon" placeholders that used to sit here are gone; a tab
 * a merchant cannot open told them nothing.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CONTENT_SCREENS, activeContentScreen, isContentScreenEnabled } from '@/lib/content/content-workspace-nav'
import { useContentWorkspace } from './ContentWorkspaceProvider'

export default function ContentNav() {
  const { t } = useContentWorkspace()
  const pathname = usePathname()
  const active = activeContentScreen(pathname ?? '')
  const env = {
    NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION: process.env.NEXT_PUBLIC_ENABLE_CONTENT_AUTOMATION,
    NEXT_PUBLIC_GSC_READ_ONLY_ENABLED: process.env.NEXT_PUBLIC_GSC_READ_ONLY_ENABLED,
  }
  const screens = CONTENT_SCREENS.filter((s) => isContentScreenEnabled(s, env))

  return (
    <nav className="flex items-center gap-1 mb-6 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
      {screens.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          aria-current={active === s.key ? 'page' : undefined}
          className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            active === s.key
              ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {t.screens[s.key]}
        </Link>
      ))}
    </nav>
  )
}
