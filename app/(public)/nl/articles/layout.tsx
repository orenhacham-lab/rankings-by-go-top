import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'Artikelen over SEO, posities en zichtbaarheid in AI | Go Top SEO',
  description: 'Artikelen, handleidingen en aanwijzingen over het meten van posities in Google, het organisch binnenhalen van bezoekers en de zichtbaarheid in ChatGPT, Gemini en Google AI Mode.',
  openGraph: {
    title: 'Artikelen over SEO, posities en zichtbaarheid in AI | Go Top SEO',
    description: 'Artikelen en handleidingen over het meten van posities, het organisch binnenhalen van bezoekers en de zichtbaarheid in AI',
    url: 'https://www.gotopseo.com/nl/articles',
    type: 'website',
    locale: LOCALE_CONFIG['nl'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
