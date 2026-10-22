import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'Articles SEO, suivi de position et visibilité dans les IA | Go Top SEO',
  description: "Articles, guides et conseils sur le suivi de position dans Google, le référencement naturel et la visibilité dans ChatGPT, Gemini et Google AI.",
  openGraph: {
    title: 'Articles SEO, suivi de position et visibilité dans les IA | Go Top SEO',
    description: 'Articles et guides sur le suivi de position, le référencement naturel et la visibilité dans les IA',
    url: 'https://www.gotopseo.com/fr/articles',
    type: 'website',
    locale: LOCALE_CONFIG['fr'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
