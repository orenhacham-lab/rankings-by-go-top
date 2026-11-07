import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'Artikel über SEO, Positionen und Sichtbarkeit in der KI | Go Top SEO',
  description: 'Artikel, Anleitungen und Hinweise zur Messung der Positionen bei Google, zur organischen Gewinnung von Besuchern und zur Sichtbarkeit in ChatGPT, Gemini und Google AI Mode.',
  openGraph: {
    title: 'Artikel über SEO, Positionen und Sichtbarkeit in der KI | Go Top SEO',
    description: 'Artikel und Anleitungen zur Messung der Positionen, zur organischen Gewinnung von Besuchern und zur Sichtbarkeit in der KI',
    url: 'https://www.gotopseo.com/de/articles',
    type: 'website',
    locale: LOCALE_CONFIG['de'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/de/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
