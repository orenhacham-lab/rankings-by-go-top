import { notFound } from 'next/navigation'
import { DocumentLocaleEffect } from '@/components/DocumentLocaleEffect'
import { frenchSiteEnabled } from '@/lib/i18n/french-site'
import { getSiteMetadata } from '@/lib/i18n/site-metadata'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

const SITE = getSiteMetadata('fr')

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
 * THE ONE GATE for the whole French tree, the same shape as the Spanish one.
 *
 * Every /fr page is a child of this layout, so one `notFound()` here is what
 * makes the flag's "off" mean absent rather than unlinked: no page renders, no
 * metadata is served, and a crawler that guesses the path gets a 404. The pages
 * themselves therefore carry no flag check of their own, which is the point — a
 * new French page cannot forget to be gated.
 *
 * There is no French twin of `lib/i18n/__qa__/spanish-public-site.qa.ts` yet,
 * so nothing holds this gate to the flag in both directions the way the Spanish
 * one is held. Until that suite exists, this `notFound()` is the whole guard.
 */
export default function FrenchLayout({ children }: { children: React.ReactNode }) {
  if (!frenchSiteEnabled()) notFound()

  return (
    <div dir="ltr" lang="fr" className="ltr-scope">
      {/* The SAME component the dashboard and the English tree use, so the
          three cannot disagree about the document's lang and dir. */}
      <DocumentLocaleEffect locale="fr" restoreOnUnmount />
      {children}
    </div>
  )
}
