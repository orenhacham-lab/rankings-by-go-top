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
    url: 'https://www.gotopseo.com/de/sitemap',
    locale: LOCALE_CONFIG['de'].ogLocale,
  },
}

type SitemapSection = { title: string; description?: string; links: Array<{ label: string; href: string }> }

export default function GermanSitemapPage() {
  const sections: SitemapSection[] = [
    {
      title: 'ページ',
      links: [
        { label: 'ホーム', href: '/de' },
        { label: '料金', href: '/de/pricing' },
        { label: '会社情報', href: '/de/about' },
        { label: '記事', href: '/de/articles' },
      ],
    },
    {
      title: 'アカウント',
      links: [
        { label: 'ログイン', href: authHref('login', 'de') },
        { label: '無料トライアルを始める', href: authHref('signup', 'de') },
      ],
    },
    {
      title: '機能',
      links: [
        { label: 'コンテンツの作成と公開', href: '/de/features/seo-geo-content-publishing' },
        { label: 'Googleでの検索順位の計測', href: '/de/features/google-organic-rank-tracking' },
        { label: 'Googleマップでの検索順位の計測', href: '/de/features/google-maps-rank-tracking' },
        { label: 'AIでの可視性の計測', href: '/de/features/ai-visibility-tracking' },
        { label: 'SEOとGEOのレポート', href: '/de/features/seo-geo-reports' },
        { label: 'キーワード調査', href: '/de/features/keyword-research' },
        { label: 'サイトの修正', href: '/de/features/site-health-fixes' },
        { label: 'サイトへのリンク', href: '/de/features/site-links' },
        { label: 'Googleマップへの投稿', href: '/de/features/google-maps-posts' },
        { label: '自社と競合', href: '/de/features/competitor-tracking' },
        { label: 'Search Consoleのデータ', href: '/de/features/search-console' },
      ],
    },
    {
      title: 'ご利用の方へ',
      links: [
        { label: '事業者の方', href: '/de/solutions/businesses' },
        { label: '制作会社・代理店', href: '/de/solutions/agencies' },
        { label: 'WordPressのサイト', href: '/de/solutions/wordpress' },
        { label: 'Shopifyの店舗', href: '/de/solutions/shopify' },
      ],
    },
    {
      title: '他のツールとの比較',
      links: [
        { label: 'Go Top SEOとSemrushの比較', href: '/de/compare/semrush' },
        { label: 'Go Top SEOとYoastの比較', href: '/de/compare/yoast' },
        { label: 'Go Top SEOとRank Mathの比較', href: '/de/compare/rankmath' },
      ],
    },
    {
      title: '法的事項',
      links: [
        { label: 'プライバシーポリシー', href: '/de/privacy' },
        { label: '利用規約', href: '/de/terms' },
        { label: '解約・返金ポリシー', href: '/de/refund-policy' },
        { label: 'アクセシビリティ', href: '/de/accessibility' },
        { label: 'パートナープログラム契約', href: '/de/affiliate-terms' },
      ],
    },
  ]

  return (
    <LegalFrame locale="de" breadcrumbs={[{ label: 'サイトマップ', href: '/de/sitemap' }]}>
      <LegalHeader title="サイトマップ" subtitle="Go Top SEOのすべてのページと項目をここにまとめています" />

      <SitemapGroups groups={sections} />

      <p className={`mt-10 ${LEGAL_FOOTNOTE}`}>
        詳しくは{' '}
        <Link href="/de/about" className={`${LEGAL_LINK} mx-1`}>
          会社情報のページ
        </Link>
        をご覧ください。ご質問は{' '}
        <a href="mailto:oren@gotop.co.il" className={LEGAL_LINK}>
          メールでどうぞ
        </a>
      </p>
    </LegalFrame>
  )
}
