import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'Articoli su SEO, posizionamento e visibilità nelle IA | Go Top SEO',
  description: 'Articoli, guide e consigli sul monitoraggio della posizione in Google, sul posizionamento organico e sulla visibilità in ChatGPT, Gemini e Google AI Mode.',
  openGraph: {
    title: 'Articoli su SEO, posizionamento e visibilità nelle IA | Go Top SEO',
    description: 'Articoli e guide sul monitoraggio della posizione, sul posizionamento organico e sulla visibilità nelle IA',
    url: 'https://www.gotopseo.com/ja/articles',
    type: 'website',
    locale: LOCALE_CONFIG['ja'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
