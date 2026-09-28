'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import StatusScreen from '@/components/layout/StatusScreen'
import Button, { buttonClasses } from '@/components/ui/Button'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { errorPagesUi } from '@/lib/i18n/error-pages'

/**
 * A screen of the dashboard that threw (design contract §7). The shell (rail,
 * top bar) stays; the screen's place shows one card in the dashboard language
 * with "try again" and a way back. The error's own text is never shown — only
 * its digest, an opaque id that matches the server log, for support.
 */
export default function DashboardError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string }
  retry?: () => void
  reset?: () => void
}) {
  const { language } = useDashboardLanguage()
  const t = errorPagesUi(language).screenError

  useEffect(() => {
    console.error('[dashboard-error]', error.digest ?? '', error)
  }, [error])

  return (
    <StatusScreen
      dir={language === 'en' ? 'ltr' : 'rtl'}
      icon={TriangleAlert}
      title={t.title}
      body={t.body}
      actions={
        <>
          <Link href="/dashboard" className={buttonClasses({ variant: 'ghost' })}>{t.dashboard}</Link>
          <Button type="button" onClick={() => (retry ?? reset)?.()}>{t.retry}</Button>
        </>
      }
      footnote={error.digest ? <>{t.reference} <span dir="ltr" className="tabular-nums">{error.digest}</span></> : undefined}
    />
  )
}
