/**
 * The frame every Spanish legal route renders. The four routes exist as four
 * files because Next decides metadata per route, and each one is three lines:
 * the metadata and the page both come from here, so the four cannot drift
 * apart in title shape, breadcrumb or footnote.
 *
 * The body is Markdown under content/legal/es/, read at build time. The legal
 * thread owns that text; this file only renders it.
 */
import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'
import { LegalMarkdown } from '@/components/public/LegalMarkdown'
import { readLegalDocument, type LegalSlug } from '@/lib/legal/markdown'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

/** The breadcrumb and footer say the same thing, so both read one dictionary. */
const CRUMB_KEY: Record<LegalSlug, 'terms' | 'privacy' | 'refundPolicy' | 'accessibility' | 'affiliateTerms'> = {
  terms: 'terms',
  privacy: 'privacy',
  'refund-policy': 'refundPolicy',
  accessibility: 'accessibility',
  'affiliate-terms': 'affiliateTerms',
}

/** The date, written the way a Spanish reader expects it. */
function spanishDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10))
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

export function spanishLegalMetadata(slug: LegalSlug) {
  const { frontMatter } = readLegalDocument(slug)
  return {
    title: frontMatter.title,
    description: frontMatter.description,
    // The whole legal tree is noindex, exactly as the Hebrew and English pages
    // are, and the Spanish site is preview-only on top of that.
    robots: 'noindex, nofollow',
    openGraph: {
      title: frontMatter.title,
      description: frontMatter.description,
      url: `https://www.gotopseo.com/es/${slug}`,
      locale: 'es_ES',
    },
  }
}

export function SpanishLegalPage({ slug }: { slug: LegalSlug }) {
  const { frontMatter, blocks } = readLegalDocument(slug)
  const dict = getPublicDictionary('es')
  const label = dict.footer[CRUMB_KEY[slug]]
  // The front-matter title carries the site name for the browser tab; the page
  // heading is the document's own name.
  const heading = frontMatter.title.split('|')[0].trim()

  return (
    <LegalDoc
      locale="es"
      breadcrumbs={[{ label, href: `/es/${slug}` }]}
      title={heading}
      subtitle={frontMatter.description}
    >
      <LegalMarkdown blocks={blocks} />
      <section>
        <p className={LEGAL_FOOTNOTE}>
          Última actualización: {spanishDate(frontMatter.lastUpdated)}
        </p>
      </section>
    </LegalDoc>
  )
}
