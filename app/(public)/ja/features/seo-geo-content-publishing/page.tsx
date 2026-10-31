import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingJa } from '@/lib/i18n/public/landing-ja'

export const metadata: Metadata = {
  title: 'SEOとGEOのコンテンツの作成、予約、公開 | Go Top SEO',
  description:
    'テーマを計画し、AIが書いた記事を一本まるごと受け取り、手直しして、公開を予約し、WordPressやShopifyに直接公開します。すべてが同じ場所で完結します。',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/seo-geo-content-publishing" />
}

const C = FEATURE_COMMON['ja']

const faqs = [
  {
    q: '公開前にすべての記事を読む必要がありますか',
    a: '必ず読む必要はありませんが、いつでも読めます。書かれるのはご承認いただいたテーマだけで、どの記事も公開前に品質の確認を通り、公開される前に読んで手直しして承認できます。',
  },
  {
    q: 'どのサイトに公開できますか',
    a: '直接の公開はWordPressとShopifyに対応しています。サイトを一度つなげば、承認した記事はそのままそこに公開されます。',
  },
  {
    q: '公開の予約はどう動きますか',
    a: '記事を承認したら、すぐに公開するか、日付と時刻を選びます。プラットフォームがその時刻に自動で公開します。',
  },
  {
    q: '記事には画像とSEOのタイトルが付きますか',
    a: 'はい。どの記事にもアイキャッチ画像と本文中の画像、メタタイトルとメタディスクリプションが付き、公開前にすべて手直しできます。',
  },
  {
    q: '記事の本数の上限はどう決まりますか',
    a: 'どのプランにも月あたりの記事の本数が含まれます。上限はアカウントに紐づき、毎月更新され、使わなかった分は翌月に繰り越されません。記事を作ると一本を使い、手直し、公開の予約、公開では消費しません。',
  },
  {
    q: '月の途中で使い切ったらどうなりますか',
    a: 'より多くの記事が含まれるプランに切り替えれば、同じ月のうちに続けられます。',
  },
  {
    q: '支払う前に試せますか',
    a: `はい。${TRIAL_CATALOG.days}日間の無料トライアルで、クレジットカードの登録は要りません。記事が一本含まれるので、公開までの流れを通して確認できます。`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'コンテンツの作成と公開',
    eyebrowIcon: FileText,
    title: '記事が書かれ、サイトに公開されます。',
    accent: 'コンテンツの担当者がいなくても',
    subtitle: 'テーマを計画して承認すると、画像、質問と回答の章、内部リンクを含む記事が一本まるごと届きます。必要なら手直しして、WordPressかShopifyに、すぐにでも指定した日付にでも公開します。',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingJa.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'コンテンツが止まる理由',
      title: 'コンテンツがいつも後回しになるのは、実は三つの仕事だからです',
      intro: 'テーマを見つけ、書き、公開する。どれも時間がかかるので、来月に送られます。ここでは、その三つが同じ場所で終わります。',
      items: [
        { icon: Search, title: '何について書くかを見つける', body: '人が何を検索しているか、競合がすでに何を押さえているか、自社のサイトに何が足りないかを調べます。' },
        { icon: PenLine, title: 'きちんと書く', body: '下書きを一本仕上げるのに数時間かかり、そのあとも直して読み返すことになります。' },
        { icon: Send, title: '公開する', body: '本文を移し、画像を上げ、SEOの項目を埋め、公開を押すのを忘れないようにします。' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '仕組み',
      title: 'テーマから公開済みの記事まで五つの手順',
      items: [
        { title: 'テーマを計画します', body: '事業と業種のキーワードから、テーマの案が用意されます。' },
        { title: '承認します', body: '今の時期に意味のあるテーマを選びます。書かれるのはそれだけです。' },
        { title: '記事を一本まるごと受け取ります', body: 'タイトル、本文、見出し、画像、質問と回答の章、内部リンクが入ります。' },
        { title: '読んで手直しします', body: '読んで、好きなだけ変えて、よければ承認します。' },
        { title: '予約するか公開します', body: 'すぐに、または選んだ日付と時刻に、WordPressかShopifyへ直接公開します。' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'どの記事にも入るもの',
      title: '素のテキストではなく、仕上がった記事です',
      items: [
        { icon: FileText, title: '記事一本まるごと', body: 'ご承認いただいたテーマが、要約でも構成案でもなく、記事一本になります。' },
        { icon: ImageIcon, title: '画像', body: 'アイキャッチ画像と本文中の画像が付きます。探して上げる必要はありません。' },
        { icon: ListChecks, title: '質問と回答、構造化データ', body: 'どの記事にも質問と回答の章が入ります。Go Topのプラグインを入れたWordPressのサイトでは、GoogleとAIエンジンが読み取れる構造化データも加わります。' },
        { icon: Link2, title: '内部リンク', body: 'サイト内のほかのページへのリンクの案が出て、どれを入れるかはご自身が決めます。' },
        { icon: FileCheck2, title: 'メタタイトルとメタディスクリプション', body: '検索に向けて書かれ、ほかの部分と同じように手直しできます。' },
        { icon: ShieldCheck, title: '公開前の品質の確認', body: 'どの記事も公開前に読み返されます。途中の状態で公開されることはありません。' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '直接の公開',
      title: '一度つなげば、コピーと貼り付けは要りません',
      intro: 'ご承認いただいた記事は、画像とSEOの項目ごと、サイトに直接公開されます。',
      items: [
        { icon: Globe, title: 'WordPress', body: 'WordPressのサイトをつないで、すぐに、または予約した日に記事を公開します。' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Shopifyの店舗をつないで、ブログの記事をプラットフォームから直接公開します。' },
      ],
    },
    { kind: 'faq', eyebrow: 'よくある質問', title: '作成と公開について尋ねられること', items: faqs },
  ],
  cta: {
    title: '次の記事は、今日書き始められます',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
