import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'キーワード調査 | Go Top SEO',
  description: 'Google Adsのデータでキーワードの案を見つけます。検索ボリューム、競合性、推定クリック単価がわかります。検索順位の計測に追加することも、AI向けの質問に変えることもできます。',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON['ja']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'キーワード調査',
    eyebrowIcon: Search,
    title: '顧客が本当に検索していることを、',
    accent: '記事にします',
    subtitle: 'Google Adsのデータによるキーワードの案です。月間の検索ボリューム、競合性、推定クリック単価がわかります。合うものを計測に追加したり、ワンクリックでAI向けの質問に変えたりできます。',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: (
      <KeywordIdeasVisual
        seed="エアコン取り付け"
        headers={['キーワード', '月間検索数', '競合性']}
        rows={[
          { keyword: '業務用エアコン 取り付け', volume: '1,900', competition: '中', level: 'medium', added: true },
          { keyword: 'エアコン 取り付け 費用', volume: '1,300', competition: '低', level: 'low' },
          { keyword: '天井埋め込み エアコン', volume: '590', competition: '高', level: 'high' },
          { keyword: 'エアコン修理 世田谷', volume: '320', competition: '低', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: 'ここから始める理由',
      title: '誰も検索していないキーワードの名記事は、誰も連れてきません',
      intro: '一語も書き始める前に、人が何を検索しているか、どのくらいの頻度で検索しているか、競うのがどれだけ難しいかがわかります。',
      items: [
        { icon: TrendingUp, title: '実際の需要', body: 'キーワードごとの月間検索ボリュームの推定値です。Googleのデータによります。' },
        { icon: Target, title: '勝てるところ', body: 'キーワードごとの競合性です。本当に上位を取れるものを選べます。' },
        { icon: Coins, title: 'クリック一回の価値', body: '広告主がクリックに払っている金額です。そのキーワードが事業にとってどれだけの価値があるかの手がかりになります。' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '仕組み',
      title: '思いつきから作業の一覧へ',
      items: [
        { title: 'キーワードかサイトから始めます', body: 'キーワードか、サイトのアドレスを入力し、国と言語を選びます。' },
        { title: '数字つきの案を受け取ります', body: '近いキーワードの一覧が、検索ボリューム、競合性、推定クリック単価とともに出ます。' },
        { title: 'そのまま使い始めます', body: 'キーワードを検索順位の計測に追加するか、AIでの可視性の計測のための質問に変えます。' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: 'できること',
      title: '合うキーワードを選ぶために必要なものがそろっています',
      items: [
        { icon: Lightbulb, title: 'キーワードかサイトからの案', body: '一つのキーワードから、またはサイトのアドレスから、近いキーワードを出します。' },
        { icon: TrendingUp, title: '検索ボリューム', body: 'キーワードごとに、月に何回検索されているかのGoogleの推定値です。' },
        { icon: Target, title: '競合性', body: 'キーワードごとに、低い、中くらい、高いのいずれかです。' },
        { icon: Coins, title: '推定クリック単価', body: '検索広告でページ上部に出すための入札額の範囲です。' },
        { icon: Plus, title: 'ワンクリックで計測に', body: '選んだキーワードが、そのプロジェクトの検索順位の計測にそのまま入ります。' },
        { icon: Sparkles, title: 'AIでの計測のための質問', body: 'キーワードを自然な言葉の質問に変え、AIエンジンが自社をおすすめするかを確認できます。' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: 'データについて',
      body: (
        <>
          <p>データはGoogle AdsのAPIから取得しています。検索ボリューム、競合性、クリック単価はGoogleの推定値で、業種、季節、地域によって変わります。</p>
          <p>テーマを選ぶための出発点としては十分です。実際の成果は、検索順位の計測で測ります。</p>
        </>
      ),
    },
  ],
  cta: {
    title: '手間をかける価値のあるキーワードを見つけませんか',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
