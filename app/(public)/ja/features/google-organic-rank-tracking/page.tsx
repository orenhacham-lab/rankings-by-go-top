import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingJa } from '@/lib/i18n/public/landing-ja'

export const metadata: Metadata = {
  title: 'Googleでの検索順位の計測 | Go Top SEO',
  description: 'Googleでの検索順位を、キーワード、地域、言語、端末ごとに計測します。いつでも手動で、または月に一度自動で計測でき、推移と競合のレポートが付きます。',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/google-organic-rank-tracking" />
}

const C = FEATURE_COMMON['ja']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Googleでの検索順位',
    eyebrowIcon: TrendingUp,
    title: 'Googleで自社が何位にいるか、',
    accent: 'そして取り組みが実っているかがわかります',
    subtitle: '大事なキーワードを一つずつ、国別、市区町村別、言語別、端末別に計測します。いつでも手動で計測でき、月に一度自動で計測することもできます。変化はすべて履歴に残ります。',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingJa.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '計測する理由',
      title: '計測していないものは改善しません',
      intro: '計測がなければ、新しい記事、サイトの変更、代理店の作業が何かを変えたのかどうかはわかりません。',
      items: [
        { icon: LineChart, title: '推移が見えます', body: 'キーワードごとに、上がっているか、下がっているか、変わっていないかが、前回の計測との比較でわかります。' },
        { icon: FileText, title: 'コンテンツと成果がつながります', body: '記事を公開したあとにどのページが上がったか、そして次に何について書くとよいかがわかります。' },
        { icon: Target, title: '近いところに力を注げます', body: '1ページ目のすぐ下にあるキーワードは、多くの場合もっとも近い機会です。計測はそれがどれかを示します。' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '仕組み',
      title: '一度設定すれば、変化がすべて見えます',
      items: [
        { title: 'キーワードを追加します', body: '大事なキーワードを入力するか、キーワード調査からワンクリックで追加します。' },
        { title: '地域と端末を選びます', body: '国、言語、市区町村、パソコンかスマートフォンかを選びます。どれによっても検索結果が変わるからです。' },
        { title: '計測して推移を追います', body: 'いつでも手動で計測を始められ、月に一度の自動計測を任せることもできます。どの結果も履歴に残ります。' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '受け取れるもの',
      title: 'Googleでの自社の位置が正確にわかります',
      items: [
        { icon: Smartphone, title: 'パソコンとスマートフォンを別々に', body: 'スマートフォンとパソコンの検索結果は、いつも同じではありません。それぞれを別に確認します。' },
        { icon: Globe, title: '国別、市区町村別、言語別', body: '大事な地域から検索した顧客に何が見えているかがわかります。' },
        { icon: Link2, title: '上位に出ているページ', body: 'キーワードごとに、サイトのどのページが検索結果に出ているかです。' },
        { icon: History, title: '完全な履歴', body: 'どの計測も記録に残るので、今日の一枚だけでなく、たどってきた道筋が見えます。' },
        { icon: MapPin, title: 'Googleマップも', body: '同じキーワードをGoogleマップでも、市区町村や地域ごとに計測します。' },
        { icon: FileSpreadsheet, title: 'PDFとExcelのレポート', body: '順位、変化、履歴をまとめたレポートを、必要な相手にお渡しいただけます。' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'よくある質問',
      title: '検索順位の計測について尋ねられること',
      items: [
        { q: '順位はどのくらいの頻度で計測されますか', a: '手動で計測を始めたときに毎回計測され、月に一度の自動計測も設定できます。今のところ、毎日や毎週の自動計測はありません。' },
        { q: 'Googleで見える順位がプラットフォームの数字と違うのはなぜですか', a: 'Googleは地域、端末、検索履歴に応じて結果を変えます。このプラットフォームはご自身が決めた固定の条件で計測するので、時間をまたいで比べるには適した指標になります。' },
        { q: 'いくつのキーワードを計測できますか', a: 'ご契約のプランによります。正確な上限は料金のページに記載しています。' },
      ],
    },
  ],
  cta: {
    title: '今どこにいるかを確かめませんか',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
