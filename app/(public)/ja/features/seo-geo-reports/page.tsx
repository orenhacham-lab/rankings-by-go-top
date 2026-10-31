import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingJa } from '@/lib/i18n/public/landing-ja'

export const metadata: Metadata = {
  title: 'SEOとGEOのレポート | Go Top SEO',
  description: '順位、推移、競合の分析を収めた業務用のPDFとExcelのレポートです。数秒で取引先に送れる形で用意されます。',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/seo-geo-reports" />
}

const C = FEATURE_COMMON['ja']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'レポート',
    eyebrowIcon: ChartColumn,
    title: '何が変わったかを示すレポートが、',
    accent: 'ワンクリックで',
    subtitle: 'GoogleとGoogleマップでの順位、そしてAIエンジンでの可視性を、PDFまたはExcelのレポートにまとめます。取引先、社内、ご自身のいずれにもそのまま送れます。',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingJa.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'レポートが必要な理由',
      title: 'よい仕事は、見える形にする必要があります',
      intro: 'わかりやすいレポートがあれば、説明の手間が要らず、サイトが前に進んでいることが伝わります。',
      items: [
        { icon: Eye, title: '全体像', body: 'Google、Googleマップ、AIが同じ場所にまとまります。複数のツールの画面を貼り合わせる必要はありません。' },
        { icon: Clock, title: '手で組み立てるものはありません', body: 'データはすでにプラットフォームの中にあります。レポートはそのデータからワンクリックで作られます。' },
        { icon: Handshake, title: '取引先の信頼', body: '制作会社や代理店の方へ。定期的なレポートは、何が変わったか、なぜ続ける価値があるかを取引先に示します。' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '仕組み',
      title: 'データからレポートまで三つの手順',
      items: [
        { title: 'プロジェクトを選びます', body: 'サイトごとに一つのプロジェクトがあり、それぞれに自分のレポートがあります。' },
        { title: '書き出します', body: '送るためのPDFか、データを加工するためのExcelです。' },
        { title: '送ります', body: '取引先、社内、共同経営者のいずれにも、体裁を整える作業なしで送れます。' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'レポートに入るもの',
      title: '意味のあるものだけを、意味のないものは入れずに',
      items: [
        { icon: TrendingUp, title: '順位と変化', body: 'キーワードごとに、今日の順位、前回の順位、その差です。' },
        { icon: ArrowUpDown, title: '上位に出ているページ', body: 'キーワードごとに、サイトのどのページが出ているかです。' },
        { icon: ChartColumn, title: '推定の流入', body: '検索ボリュームと現在の順位から見た、Googleからの訪問の推定値です。' },
        { icon: Sparkles, title: 'AIでの可視性', body: 'サイトへの言及と引用を、AIエンジンごとに示します。' },
        { icon: History, title: '完全な履歴', body: 'Excelのファイルには、直近の一回だけでなく、これまでのすべての計測が入ります。' },
        { icon: FileSpreadsheet, title: 'PDFとExcel', body: '送るための整ったPDFと、数字を加工したい方のためのExcelです。' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'よくある質問',
      title: 'レポートについて尋ねられること',
      items: [
        // Checked against lib/export/i18n.ts and lib/gsc/export/labels.ts: both
        // now carry a complete Japanese block, so the export really does come out
        // in Japanese. Keep this answer and those two files in step.
        { q: 'レポートはどの言語で出ますか', a: 'レポートはダッシュボードの言語で出ます。日本語もその一つで、ほかにヘブライ語、英語、スペイン語、ポルトガル語、フランス語、イタリア語があります。' },
        { q: '取引先ごとに別のレポートを作れますか', a: 'はい。サイトごとに一つのプロジェクトがあり、プロジェクトごとに自分のレポートがあります。プランごとのプロジェクト数は料金のページに記載しています。' },
        { q: 'レポートはどのプランにも含まれますか', a: 'はい。PDFとExcelのレポートは、どのプランにも含まれます。' },
      ],
    },
  ],
  cta: {
    title: '最初のレポートまで、あと数日です',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
