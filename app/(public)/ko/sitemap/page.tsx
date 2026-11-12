import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: '사이트맵 | Go Top SEO',
  description: 'Go Top SEO 사이트맵입니다. 모든 페이지를 한곳에 모았습니다.',
  openGraph: {
    title: '사이트맵 | Go Top SEO',
    description: 'Go Top SEO 사이트맵',
    url: 'https://www.gotopseo.com/ko/sitemap',
    locale: LOCALE_CONFIG['ko'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/sitemap',
    // The eleven maps are one page in eleven languages. Without this block the
    // page inherits the root layout's alternates, which name the ten HOME
    // pages as this page's translations and (in Hebrew) canonicalise the map
    // to the home page — measured 11.11.2026 on all ten of the then-live trees.
    languages: buildHreflangAlternates('/sitemap', '/en/sitemap', '/es/sitemap'),
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function KoreanSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: '페이지',
      links: [
        { label: '홈', href: '/ko' },
        { label: '가격', href: '/ko/pricing' },
        { label: '회사 소개', href: '/ko/about' },
        { label: '글', href: '/ko/articles' },
        { label: '무료 분석', href: '/ko/free-check' },
        { label: '내 사이트는 어떤 AI 크롤러를 막고 있나요?', href: '/ko/ai-crawlers' },
        { label: '파트너 프로그램', href: '/ko/affiliates' },
      ],
    },
    {
      title: '계정',
      links: [
        { label: '로그인', href: authHref('login', 'ko') },
        { label: '무료 체험 시작', href: authHref('signup', 'ko') },
      ],
    },
    {
      title: '기능',
      links: [
        { label: '콘텐츠 작성과 발행', href: '/ko/features/seo-geo-content-publishing' },
        { label: 'Google 순위 측정', href: '/ko/features/google-organic-rank-tracking' },
        { label: 'Google 지도 순위 측정', href: '/ko/features/google-maps-rank-tracking' },
        { label: 'AI 노출 측정', href: '/ko/features/ai-visibility-tracking' },
        { label: 'SEO·GEO 보고서', href: '/ko/features/seo-geo-reports' },
        { label: '키워드 분석', href: '/ko/features/keyword-research' },
        { label: '사이트 수정', href: '/ko/features/site-health-fixes' },
        { label: '사이트 링크', href: '/ko/features/site-links' },
        { label: 'Google 지도 게시물', href: '/ko/features/google-maps-posts' },
        { label: '구글 비즈니스 프로필', href: '/ko/features/google-business-profile' },
        { label: '내 업체와 경쟁사', href: '/ko/features/competitor-tracking' },
        { label: 'Search Console 데이터', href: '/ko/features/search-console' },
      ],
    },
    {
      title: '어떤 분께',
      links: [
        { label: '기업', href: '/ko/solutions/businesses' },
        { label: '대행사와 서비스 제공자', href: '/ko/solutions/agencies' },
        { label: 'WordPress 사이트', href: '/ko/solutions/wordpress' },
        { label: 'Shopify 스토어', href: '/ko/solutions/shopify' },
      ],
    },
    {
      title: '다른 도구와 비교',
      links: [
        { label: '비교 전체 보기', href: '/ko/compare' },
        { label: 'Go Top SEO와 Semrush', href: '/ko/compare/semrush' },
        { label: 'Go Top SEO와 Yoast', href: '/ko/compare/yoast' },
        { label: 'Go Top SEO와 Rank Math', href: '/ko/compare/rankmath' },
        { label: 'Go Top SEO와 Surfer', href: '/ko/compare/surfer' },
        { label: 'Go Top SEO와 Writesonic', href: '/ko/compare/writesonic' },
        { label: 'Go Top SEO와 BrightLocal', href: '/ko/compare/brightlocal' },
        { label: 'Go Top SEO와 Booster SEO', href: '/ko/compare/booster' },
      ],
    },
    {
      title: '법적 정보',
      links: [
        { label: '개인정보처리방침', href: '/ko/privacy' },
        { label: '이용약관', href: '/ko/terms' },
        { label: '해지 및 환불 정책', href: '/ko/refund-policy' },
        { label: '접근성', href: '/ko/accessibility' },
        { label: '파트너 프로그램 약관', href: '/ko/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="ko" breadcrumbs={[{ label: '사이트맵', href: '/ko/sitemap' }]}>
      <LegalHeader title="사이트맵" subtitle="Go Top SEO의 모든 페이지와 영역을 한곳에" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        저희에 대한 더 자세한 내용은{' '}
        <Link href="/ko/about" className={`${LEGAL_LINK} mx-1`}>
          회사 소개
        </Link>
        에 있습니다. 문의는{' '}
        <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>
          이메일
        </a>
        로 답해 드립니다
      </p>
    </LegalFrame>
  )
}
