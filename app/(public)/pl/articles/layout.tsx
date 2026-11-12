import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'

export const metadata = {
  title: 'Artykuły o SEO, pozycjach i widoczności w AI | Go Top SEO',
  description: 'Artykuły, poradniki i wskazówki o mierzeniu pozycji w Google, o pozyskiwaniu odwiedzających z wyników organicznych i o widoczności w ChatGPT, Gemini i Google AI Mode.',
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
    title: 'Artykuły o SEO, pozycjach i widoczności w AI | Go Top SEO',
    description: 'Artykuły i poradniki o mierzeniu pozycji, o pozyskiwaniu odwiedzających z wyników organicznych i o widoczności w AI',
    url: 'https://www.gotopseo.com/pl/articles',
    type: 'website',
    locale: LOCALE_CONFIG['pl'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
