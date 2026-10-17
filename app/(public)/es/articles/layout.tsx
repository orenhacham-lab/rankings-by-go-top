import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'Artículos sobre SEO, posiciones y visibilidad en IA | Go Top SEO',
  description: 'Artículos, guías y consejos sobre el seguimiento de posiciones en Google, SEO y visibilidad en ChatGPT, Gemini, Perplexity y otros motores de IA.',
  openGraph: {
    title: 'Artículos sobre SEO, posiciones y visibilidad en IA | Go Top SEO',
    description: 'Artículos y guías sobre seguimiento de posiciones, SEO y visibilidad en IA',
    url: 'https://www.gotopseo.com/es/articles',
    type: 'website',
    locale: LOCALE_CONFIG['es'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/es/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
