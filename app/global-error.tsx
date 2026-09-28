'use client'

import './globals.css'
import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import StatusScreen from '@/components/layout/StatusScreen'
import Button, { buttonClasses } from '@/components/ui/Button'
import { LANGUAGE_COOKIE, readCookie, resolveRequestLocale } from '@/lib/i18n/request-locale'
import { documentLocaleAttributes } from '@/lib/i18n/document-locale'
import { errorPagesUi } from '@/lib/i18n/error-pages'
import type { Locale } from '@/lib/i18n/locales'

// The document never changes language while this page is up: nothing to subscribe to.
const noSubscription = () => () => {}

/** The same contract the server uses, from what the browser can see: route, ?lang, cookie, languages. */
function browserLocale(): Locale {
  return resolveRequestLocale({
    pathname: window.location.pathname,
    langParam: new URLSearchParams(window.location.search).get('lang'),
    cookieValue: readCookie(document.cookie, LANGUAGE_COOKIE),
    acceptLanguage: navigator.languages?.join(',') ?? navigator.language,
  })
}

/**
 * The root layout itself failed (design contract §7). This page replaces it,
 * so it draws its own <html>/<body> and imports the global styles. The error's
 * text is never shown; the language follows the same request contract.
 */
export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string }
  retry?: () => void
  reset?: () => void
}) {
  const locale = useSyncExternalStore(noSubscription, browserLocale, () => 'he' as Locale)
  const { lang, dir } = documentLocaleAttributes(locale)
  const ui = errorPagesUi(locale)
  const t = ui.globalError

  useEffect(() => {
    console.error('[global-error]', error.digest ?? '', error)
  }, [error])

  return (
    <html lang={lang} dir={dir}>
      <body className="min-h-full bg-canvas text-body antialiased">
        <title>{t.title}</title>
        <StatusScreen
          page
          dir={dir}
          logoAlt={ui.logoAlt}
          icon={TriangleAlert}
          title={t.title}
          body={t.body}
          actions={
            <>
              <Link href={t.homeHref} className={buttonClasses({ variant: 'ghost' })}>{t.home}</Link>
              <Button type="button" onClick={() => (retry ?? reset)?.()}>{t.retry}</Button>
            </>
          }
        />
      </body>
    </html>
  )
}
