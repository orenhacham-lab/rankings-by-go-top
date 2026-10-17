import { notFound } from 'next/navigation'
import { DocumentLocaleEffect } from '@/components/DocumentLocaleEffect'
import { spanishSiteEnabled } from '@/lib/i18n/spanish-site'
import { getSiteMetadata } from '@/lib/i18n/site-metadata'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

const SITE = getSiteMetadata('es')

export const metadata = {
  title: SITE.title,
  description: SITE.description,
  keywords: SITE.keywords,
  openGraph: {
    title: SITE.ogTitle,
    description: SITE.ogDescription,
    locale: SITE.ogLocale,
    type: 'website',
  },
  alternates: {
    languages: buildHreflangAlternates('/', '/en', '/es'),
  },
}

/**
 * THE ONE GATE for the whole Spanish tree.
 *
 * Every /es page is a child of this layout, so one `notFound()` here is what
 * makes the flag's "off" mean absent rather than unlinked: no page renders, no
 * metadata is served, and a crawler that guesses the path gets a 404. The
 * pages themselves therefore carry no flag check of their own, which is the
 * point — a new Spanish page cannot forget to be gated.
 *
 * `lib/i18n/__qa__/spanish-public-site.qa.ts` holds this to the flag in both
 * directions, with a mutation control.
 */
export default function SpanishLayout({ children }: { children: React.ReactNode }) {
  if (!spanishSiteEnabled()) notFound()

  return (
    <div dir="ltr" lang="es" className="ltr-scope">
      {/* The SAME component the dashboard and the English tree use, so the
          three cannot disagree about the document's lang and dir. */}
      <DocumentLocaleEffect locale="es" restoreOnUnmount />
      {children}
    </div>
  )
}
