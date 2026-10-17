import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'SEO, Rank Tracking and AI Visibility Articles | Go Top SEO',
  description: 'Articles, guides and tips on Google rank tracking, SEO, and AI visibility monitoring across ChatGPT, Gemini, Perplexity and more.',
  openGraph: {
    title: 'SEO, Rank Tracking and AI Visibility Articles | Go Top SEO',
    description: 'Articles and guides on rank tracking, SEO and AI visibility',
    url: 'https://www.gotopseo.com/en/articles',
    type: 'website',
    locale: LOCALE_CONFIG['en'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
