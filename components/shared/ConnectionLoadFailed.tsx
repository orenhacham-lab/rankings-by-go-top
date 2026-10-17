'use client'

/**
 * What a connection card shows when its status could not be READ: a failed read,
 * said as one, with a retry. Never "not connected" (lib/connection-status/known.ts):
 * the connection may be perfectly fine, and telling a connected merchant to
 * connect again is the bug this replaces.
 */
import Notice from '@/components/ui/Notice'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

export default function ConnectionLoadFailed({ onRetry, className }: { onRetry: () => void; className?: string }) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).connectionStatus
  return (
    <Notice tone="warn" className={className} action={{ label: t.retry, onClick: onRetry }}>
      <span data-connection-load-failed="">{t.loadFailed}</span>
    </Notice>
  )
}
