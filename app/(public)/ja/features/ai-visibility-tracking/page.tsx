import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingJa } from '@/lib/i18n/public/landing-ja'

export const metadata: Metadata = {
  title: 'AIでの可視性の計測 | Go Top SEO',
  description: 'ChatGPT、Gemini、Google AI Modeでの自社への言及を計測します。生成エンジンに向けた最適化、GEOを数字で確認できます。',
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="ja" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON['ja']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'AIエンジンでの可視性',
    eyebrowIcon: Sparkles,
    title: '顧客がChatGPTに尋ねたとき、',
    accent: '自社がおすすめされているかがわかります',
    subtitle: 'このプラットフォームは、顧客が尋ねるのと同じ質問をChatGPT、Gemini、Google AI Modeに投げかけ、その回答に誰が現れているかをお見せします。自社か、それとも競合かです。',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingJa.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '今これが大事な理由',
      title: 'Googleで検索しない顧客が出てきました。AIに尋ねています。',
      intro: '回答に現れた側がおすすめを受け取ります。そこにいない側は、会話の外に置かれます。',
      items: [
        { icon: MessagesSquare, title: '質問はチャットに移りました', body: '十件の検索結果をたどる代わりに、一つ質問をして、いくつかの名前が挙がった回答を受け取ります。その一つが自社であるべきです。' },
        { icon: Award, title: '信頼されるおすすめ', body: 'AIエンジンが企業の名前を挙げると、それは助言のように受け取られます。そこから来た顧客は、すでに気持ちが決まっています。' },
        { icon: Target, title: '競合はすでに現れているかもしれません', body: '確認しなければ、自分の業種で誰がおすすめされているかはわかりません。計測は、質問ごと、エンジンごとにそれを示します。' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '仕組み',
      title: '三つの手順で全体像がわかります',
      items: [
        { title: '質問を選びます', body: '事業のキーワードから質問の案が用意され、追加も削除もできます。たとえば「東京でエアコンを設置してくれる業者はどこですか」です。' },
        { title: '各エンジンに別々に尋ねます', body: '一つの質問を三つのエンジンにそれぞれ投げかけ、どの回答も読み取って確認します。' },
        { title: '誰が現れているかがわかります', body: '質問ごとに、自社が言及されているか、自社のサイトが出典として示されているか、そして自社の代わりに誰が挙がっているかがわかります。' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '受け取れるもの',
      title: '回答に入るために必要なものがそろっています',
      items: [
        { icon: Sparkles, title: 'エンジンごとの言及', body: '三つのエンジンをそれぞれ別に見ます。エンジンごとに答え方が違うからです。' },
        { icon: Link2, title: '出典としての引用', body: '名前が挙がるだけでなく、回答が自社のサイトを出典として示しているかどうかです。' },
        { icon: Users, title: '自社の代わりに挙がっている相手', body: '回答に現れる競合と、その競合がおすすめを受け取っている質問です。' },
        { icon: Lightbulb, title: '改善するところ', body: '回答に現れる可能性を高めるために、サイトに何を加え、何を変えるとよいかの案です。' },
        { icon: LineChart, title: '時間の推移', body: 'どの確認も記録に残るので、記事が公開されていくなかで可視性が伸びているかがわかります。' },
        { icon: FileSpreadsheet, title: 'PDFとExcelのレポート', body: 'エンジンごとの言及と引用をまとめたレポートを、取引先や社内にお渡しいただけます。' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: 'よくある質問',
      title: 'AIでの可視性について尋ねられること',
      items: [
        { q: 'SEOとGEOの違いは何ですか', a: 'SEOはGoogleの検索結果に現れることです。GEOはAIエンジンの回答に現れることです。このプラットフォームはその両方を計測し、書かれる記事も両方に向けて作られます。わかりやすい構成と、質問と回答の章があり、Go Topのプラグインを入れたWordPressのサイトでは構造化データも加わります。' },
        { q: '回答に必ず現れると保証されますか', a: 'いいえ。AIエンジンが何と答えるかは、誰も制御できません。できるのは、現在の位置を正確に計測し、自社の代わりに誰が現れているかをお見せし、可能性を高めるコンテンツを用意することです。' },
        { q: 'AIでの確認はどのように数えますか', a: '一つのエンジンへの一つの質問が、一回の確認です。同じ質問を三つのエンジンに尋ねると、三回になります。プランごとの上限は料金のページに記載しています。' },
      ],
    },
  ],
  cta: {
    title: 'ChatGPTが自社の業種について何と言っているかを確かめませんか',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
