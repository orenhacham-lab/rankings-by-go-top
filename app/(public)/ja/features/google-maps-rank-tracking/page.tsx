import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Googleマップでの検索順位の計測 | Go Top SEO',
  description: 'Googleマップでのローカルな露出を計測します。市区町村ごと、地域ごとの順位を確認できます。ローカル検索での集客はここから始まります。',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/google-maps-rank-tracking" />
}

const C = FEATURE_COMMON['ja']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Googleマップ',
    eyebrowIcon: MapPin,
    title: '近くで自社のような会社を探している人がいるとき、',
    accent: '地図上のどこにいるかがわかります',
    subtitle: 'Googleマップでの順位を、キーワードごと、地域ごとに計測します。市区町村単位でも、地図上の正確な地点からでも計測できます。自社より上にいる相手と、順位が時間とともにどう動いたかがわかります。',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    // The example is the Japanese market, not a translated American or Italian
    // one: the same demo world as the Japanese landing page (Tokyo, air
    // conditioning, 青山エアコンサービス and its neighbours). The figures are the
    // sample ones the English, Spanish and French pages already show, so no new
    // rating or review count is invented here.
    visual: (
      <MapsVisual
        positionLabel="自社の順位"
        position="3"
        positionSub="東京、「エアコン取り付け」"
        changeLabel="今月"
        change="2"
        changeSub="順位上昇"
        reviewsLabel="件の口コミ"
        rows={[
          { rank: 1, name: '青山エアコンサービス', stars: 4.8, reviews: 212 },
          { rank: 2, name: '東京コンフォート設備', stars: 4.6, reviews: 174 },
          { rank: 3, name: 'ご自身の会社', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: 'クリマポイント', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '地図が大事な理由',
      title: 'ローカル検索では、地図が店先です',
      intro: '近くでサービスを探すとき、Googleはまず地図の上にいくつかの会社を見せます。どこに電話するかは、そこで決まります。',
      items: [
        { icon: Phone, title: 'そこから電話が来ます', body: '地図の検索結果では、ひと操作で電話をかけ、経路を調べ、サイトを開きます。' },
        { icon: Users, title: '枠は少なく、競合は多い', body: '上位の枠を占めるのは数社だけです。その中に自社がいるかを知る必要があります。' },
        { icon: MapPin, title: '地域ごとに別の勝負です', body: 'ある市では1位でも、隣の市では出ていないことがあります。地域ごとの計測はそれを示します。' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '仕組み',
      title: '三つの手順で地図の状況がはっきりします',
      items: [
        { title: '自社を登録します', body: '自社と、対応している地域を登録します。' },
        { title: 'キーワードと地域を選びます', body: 'たとえば東京での「エアコン取り付け」、あるいは地図上の正確な地点からです。' },
        { title: '推移を追います', body: 'いつでも手動で計測でき、月に一度自動で計測することもできます。変化はすべて履歴に残ります。' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '受け取れるもの',
      title: '推測ではなく、地図上の自社の位置です',
      items: [
        { icon: MapPin, title: '市区町村別、地域別', body: '顧客がいる地域で、キーワードごとに確認します。' },
        { icon: Navigation, title: '地図上の正確な地点', body: '指定した座標から確認するので、ちょうどそこにいる顧客に何が見えているかがわかります。' },
        { icon: Store, title: '自社より上にいる相手', body: '検索結果で自社より上に出ている会社と、そのGoogleでの評価です。' },
        { icon: History, title: '順位の履歴', body: '前回の計測から順位がどう変わったかがわかります。' },
        { icon: Search, title: '通常の検索も', body: '同じキーワードをGoogleの通常の検索結果でも計測します。' },
        { icon: FileSpreadsheet, title: 'PDFとExcelのレポート', body: 'Googleマップでの順位もレポートに入り、必要な相手にお渡しいただけます。' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'よくある質問',
      title: 'Googleマップでの計測について尋ねられること',
      items: [
        { q: 'Googleビジネスプロフィールは必要ですか', a: 'Googleマップに表示されるには、Googleビジネスプロフィールの登録が必要です。計測では、その登録情報がどこに出ているか、あるいは出ていないかがわかります。' },
        { q: '順位はどのくらいの頻度で計測されますか', a: '手動で計測を始めたときに毎回計測され、月に一度の自動計測も設定できます。今のところ、毎日や毎週の自動計測はありません。' },
        { q: 'Googleマップのキーワードは別の一回として数えますか', a: 'はい。Googleでの一回の確認は、一つの地域での一つのキーワードです。同じキーワードを通常の検索とGoogleマップで計測すると、二回になります。' },
      ],
    },
  ],
  cta: {
    title: '自分の地域で電話を受けているのは誰かを確かめませんか',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
