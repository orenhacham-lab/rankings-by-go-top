import { notFound } from 'next/navigation'
import { DocumentLocaleEffect } from '@/components/DocumentLocaleEffect'
import { polishSiteEnabled } from '@/lib/i18n/polish-site'
import { getSiteMetadata } from '@/lib/i18n/site-metadata'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'

const SITE = getSiteMetadata('pl')

export const metadata = {
  title: SITE.title,
  description: SITE.description,
  keywords: SITE.keywords,
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
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
 * THE ONE GATE for the whole Polish tree, the same shape as the French one.
 *
 * Every /pl page is a child of this layout, so one `notFound()` here is what
 * makes the flag's "off" mean absent rather than unlinked: no page renders, no
 * metadata is served, and a crawler that guesses the path gets a 404. The pages
 * themselves therefore carry no flag check of their own, which is the point — a
 * new Polish page cannot forget to be gated.
 */
export default function PolishLayout({ children }: { children: React.ReactNode }) {
  if (!polishSiteEnabled()) notFound()

  return (
    <div dir="ltr" lang="pl" className="ltr-scope">
      {/* The SAME component the dashboard and the English tree use, so the
          three cannot disagree about the document's lang and dir. */}
      <DocumentLocaleEffect locale="pl" restoreOnUnmount />
      {children}
    </div>
  )
}
