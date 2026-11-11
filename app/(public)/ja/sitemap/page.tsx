import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import Link from 'next/link'
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalFrame, LegalHeader, SitemapGroups } from '@/components/public/LegalDoc'
import { authHref } from '@/lib/i18n/auth-href'
import { LOCALE_CONFIG } from '@/lib/i18n/locales'

export const metadata = {
  title: 'サイトマップ | Go Top SEO',
  description: 'Go Top SEOのサイトマップです。すべてのページを一つの場所にまとめています。',
  openGraph: {
    title: 'サイトマップ | Go Top SEO',
    description: 'Go Top SEOのサイトマップ',
    url: 'https://www.gotopseo.com/ja/sitemap',
    locale: LOCALE_CONFIG['ja'].ogLocale,
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/sitemap',
    // The ten maps are one page in ten languages. Without this block the
    // page inherits the root layout's alternates, which name the ten HOME
    // pages as this page's translations and (in Hebrew) canonicalise the map
    // to the home page — measured 11.11.2026 on all ten.
    languages: buildHreflangAlternates('/sitemap', '/en/sitemap', '/es/sitemap'),
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function JapaneseSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'ページ',
      links: [
        { label: 'ホーム', href: '/ja' },
        { label: '料金', href: '/ja/pricing' },
        { label: '会社情報', href: '/ja/about' },
        { label: '記事', href: '/ja/articles' },
        { label: '無料診断', href: '/ja/free-check' },
        { label: 'サイトはどのAIクローラーを拒否していますか', href: '/ja/ai-crawlers' },
        { label: 'アフィリエイトプログラム', href: '/ja/affiliates' },
      ],
    },
    {
      title: 'アカウント',
      links: [
        { label: 'ログイン', href: authHref('login', 'ja') },
        { label: '無料トライアルを始める', href: authHref('signup', 'ja') },
      ],
    },
    {
      title: '機能',
      links: [
        { label: 'コンテンツの作成と公開', href: '/ja/features/seo-geo-content-publishing' },
        { label: 'Googleでの検索順位の計測', href: '/ja/features/google-organic-rank-tracking' },
        { label: 'Googleマップでの検索順位の計測', href: '/ja/features/google-maps-rank-tracking' },
        { label: 'AIでの可視性の計測', href: '/ja/features/ai-visibility-tracking' },
        { label: 'SEOとGEOのレポート', href: '/ja/features/seo-geo-reports' },
        { label: 'キーワード調査', href: '/ja/features/keyword-research' },
        { label: 'サイトの修正', href: '/ja/features/site-health-fixes' },
        { label: 'サイトへのリンク', href: '/ja/features/site-links' },
        { label: 'Googleマップへの投稿', href: '/ja/features/google-maps-posts' },
        { label: '自社と競合', href: '/ja/features/competitor-tracking' },
        { label: 'Search Consoleのデータ', href: '/ja/features/search-console' },
      ],
    },
    {
      title: 'ご利用の方へ',
      links: [
        { label: '事業者の方', href: '/ja/solutions/businesses' },
        { label: '制作会社・代理店', href: '/ja/solutions/agencies' },
        { label: 'WordPressのサイト', href: '/ja/solutions/wordpress' },
        { label: 'Shopifyの店舗', href: '/ja/solutions/shopify' },
      ],
    },
    {
      title: '他のツールとの比較',
      links: [
        { label: 'すべての比較', href: '/ja/compare' },
        { label: 'Go Top SEO と Semrush の比較', href: '/ja/compare/semrush' },
        { label: 'Go Top SEO と Yoast の比較', href: '/ja/compare/yoast' },
        { label: 'Go Top SEO と Rank Math の比較', href: '/ja/compare/rankmath' },
        { label: 'Go Top SEO と Surfer の比較', href: '/ja/compare/surfer' },
        { label: 'Go Top SEO と Writesonic の比較', href: '/ja/compare/writesonic' },
        { label: 'Go Top SEO と BrightLocal の比較', href: '/ja/compare/brightlocal' },
        { label: 'Go Top SEO と Booster SEO の比較', href: '/ja/compare/booster' },
      ],
    },
    {
      title: '法的事項',
      links: [
        { label: 'プライバシーポリシー', href: '/ja/privacy' },
        { label: '利用規約', href: '/ja/terms' },
        { label: '解約・返金ポリシー', href: '/ja/refund-policy' },
        { label: 'アクセシビリティ', href: '/ja/accessibility' },
        { label: 'パートナープログラム契約', href: '/ja/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="ja" breadcrumbs={[{ label: 'サイトマップ', href: '/ja/sitemap' }]}>
      <LegalHeader title="サイトマップ" subtitle="Go Top SEOのすべてのページと項目をここにまとめています" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        詳しくは{' '}
        <Link href="/ja/about" className={`${LEGAL_LINK} mx-1`}>
          会社情報のページ
        </Link>
        をご覧ください。ご質問は{' '}
        <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>
          メールでどうぞ
        </a>
      </p>
    </LegalFrame>
  )
}
