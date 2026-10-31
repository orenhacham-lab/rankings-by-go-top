import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'SEO、検索順位、AIでの可視性についての記事 | Go Top SEO',
  description: 'Googleでの検索順位の計測、自然検索での集客、そしてChatGPT、Gemini、Google AI Modeでの可視性についての記事、ガイド、アドバイスです。',
  openGraph: {
    title: 'SEO、検索順位、AIでの可視性についての記事 | Go Top SEO',
    description: '検索順位の計測、自然検索での集客、AIでの可視性についての記事とガイドです',
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
