import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'SEO, 검색 순위, AI 노출에 관한 글 | Go Top SEO',
  description: 'Google 순위 측정, 자연 검색에서 방문자를 얻는 방법, ChatGPT와 Gemini, Google AI 모드에서의 노출에 관한 글과 가이드입니다.',
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
    title: 'SEO, 검색 순위, AI 노출에 관한 글 | Go Top SEO',
    description: '검색 순위 측정, 자연 검색 방문자, AI 노출에 관한 글과 가이드',
    url: 'https://www.gotopseo.com/ko/articles',
    type: 'website',
    locale: LOCALE_CONFIG['ko'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function ArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
