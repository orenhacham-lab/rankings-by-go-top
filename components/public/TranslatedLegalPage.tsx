/**
 * The frame every translated legal route renders — Spanish today, Brazilian
 * Portuguese next. The routes exist as one file each because Next decides
 * metadata per route, and each one is three lines: the metadata and the page both
 * come from here, so they cannot drift apart in title shape, breadcrumb or
 * footnote, and a new language is a route tree rather than a second renderer.
 *
 * The body is Markdown under content/legal/<language>/. The legal thread owns
 * that text; this file only renders it.
 */
import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'
import { LegalMarkdown } from '@/components/public/LegalMarkdown'
import { readLegalDocument, type LegalLanguage, type LegalSlug } from '@/lib/legal/markdown'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { LOCALE_CONFIG, LOCALE_PREFIX, INTL_LOCALE } from '@/lib/i18n/locales'

/** The breadcrumb and footer say the same thing, so both read one dictionary. */
const CRUMB_KEY: Record<LegalSlug, 'terms' | 'privacy' | 'refundPolicy' | 'accessibility'> = {
  terms: 'terms',
  privacy: 'privacy',
  'refund-policy': 'refundPolicy',
  accessibility: 'accessibility',
}

/** "Last updated", in the language's own words and its own date order. */
const UPDATED_LABEL: Record<LegalLanguage, string> = {
  es: 'Última actualización',
  'pt-BR': 'Última atualização',
}

function localeDate(iso: string, language: LegalLanguage): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10))
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(INTL_LOCALE[language], { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

export function translatedLegalMetadata(slug: LegalSlug, language: LegalLanguage) {
  const { frontMatter } = readLegalDocument(slug, language)
  const url = `https://www.gotopseo.com${LOCALE_PREFIX[language]}/${slug}`
  return {
    title: frontMatter.title,
    description: frontMatter.description,
    // The whole legal tree is noindex, exactly as the Hebrew and English pages
    // are, and a language still behind its flag is unreachable on top of that.
    robots: 'noindex, nofollow',
    openGraph: {
      title: frontMatter.title,
      description: frontMatter.description,
      url,
      locale: LOCALE_CONFIG[language].ogLocale,
    },
  }
}

export function TranslatedLegalPage({ slug, language }: { slug: LegalSlug; language: LegalLanguage }) {
  const { frontMatter, blocks } = readLegalDocument(slug, language)
  const dict = getPublicDictionary(language)
  const label = dict.footer[CRUMB_KEY[slug]]
  // The front-matter title carries the site name for the browser tab; the page
  // heading is the document's own name.
  const heading = frontMatter.title.split('|')[0].trim()

  return (
    <LegalDoc
      locale={language}
      breadcrumbs={[{ label, href: `${LOCALE_PREFIX[language]}/${slug}` }]}
      title={heading}
      subtitle={frontMatter.description}
    >
      <LegalMarkdown blocks={blocks} />
      <section>
        <p className={LEGAL_FOOTNOTE}>
          {UPDATED_LABEL[language]}: {localeDate(frontMatter.lastUpdated, language)}
        </p>
      </section>
    </LegalDoc>
  )
}
