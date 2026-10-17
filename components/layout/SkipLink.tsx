'use client'

import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { MAIN_CONTENT_ID } from './main-content'

/**
 * "Skip to content": the first thing a keyboard reaches on every dashboard
 * screen, invisible until it has focus. Without it the first Tab went to the
 * logo, then through every sidebar entry, before the screen itself.
 */
export default function SkipLink() {
  const { uiLocale } = useDashboardLanguage()
  const label = getDashboardDictionary(uiLocale).sidebar.skipToContent
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-action focus:px-4 focus:py-2 focus:text-copy focus:font-semibold focus:text-action-ink focus:shadow-pop focus:outline-none focus:ring-2 focus:ring-action focus:ring-offset-2 focus:ring-offset-canvas"
    >
      {label}
    </a>
  )
}
