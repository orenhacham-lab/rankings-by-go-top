import Link from 'next/link'
import { Compass } from 'lucide-react'
import StatusScreen from '@/components/layout/StatusScreen'
import { buttonClasses } from '@/components/ui/Button'
import { getRootRequestContext } from '@/lib/i18n/root-request'
import { documentLocaleAttributes } from '@/lib/i18n/document-locale'
import { errorPagesUi } from '@/lib/i18n/error-pages'

/**
 * The branded 404 (design contract §7), in the request's language: the same
 * resolution the root layout used for <html lang/dir>. A signed-in visitor is
 * sent back to the dashboard first; everyone else to the home page.
 */
export default async function NotFound() {
  const { isAuthenticated, locale } = await getRootRequestContext()
  const { dir } = documentLocaleAttributes(locale)
  const ui = errorPagesUi(locale)
  const t = ui.notFound
  return (
    <StatusScreen
      page
      dir={dir}
      logoAlt={ui.logoAlt}
      icon={Compass}
      overline={t.code}
      title={t.title}
      body={t.body}
      actions={isAuthenticated ? (
        <>
          <Link href={t.homeHref} className={buttonClasses({ variant: 'ghost' })}>{t.home}</Link>
          <Link href="/dashboard" className={buttonClasses()}>{t.dashboard}</Link>
        </>
      ) : (
        <Link href={t.homeHref} className={buttonClasses()}>{t.home}</Link>
      )}
    />
  )
}
