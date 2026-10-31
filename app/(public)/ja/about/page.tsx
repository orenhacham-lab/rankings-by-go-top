import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export default function JapaneseAboutPage() {
  return <AboutPage locale="ja" copy={COPY} />
}

/**
 * The same page as the Hebrew, English, Spanish and French ones, in Japanese.
 * Every claim here is one the others already make: the years of experience, who
 * builds the platform, and what it does. Nothing is added for the Japanese
 * market, because nothing new is true of it yet.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: ABOUT_BREADCRUMB['ja'], href: '/ja/about' },
  title: 'SEOの11年の実務を、',
  accent: 'ひとつのプラットフォームにまとめました。',
  subtitle: 'サイトに記事を書いて公開し、GoogleとGoogleマップでの検索順位を計測し、AIエンジンが自社をおすすめしているかを確認する、ひとつのプラットフォームです。自然検索での集客と広告運用で11年以上の実務があるデジタルマーケティング会社、Go Topが作っています。',
  who: {
    title: 'このプラットフォームを作っている会社',
    paragraphs: [
      'Go Top SEOは、Go Topが作っています。イスラエルと海外の企業に向けて、自然検索での集客、オンライン広告、サイト制作を11年以上続けてきたデジタルマーケティング会社です。',
      'このプラットフォームは、取引先との日々の仕事から生まれました。どのレポートなら本当に伝わるのか、どのデータが判断の助けになるのか、どこで時間が失われているのかを見てきました。そこで、コンテンツを書き、公開し、Googleでも、AIエンジンでも計測する場所を、一つにまとめました。',
    ],
  },
  founderEyebrow: 'このプロジェクトを進めている人',
  gaps: {
    title: '足りなかったもの、そして代わりに作ったもの',
    body: '自然検索の仕組みを学ばなくても、見つけてもらうために必要なことを同じ場所ですべて行えるようにしたい、と考えました。',
    missingLabel: '足りなかったもの',
    builtLabel: '作ったもの',
    rows: [
      {
        pain: { title: '順位を手で確認するには時間がかかりすぎます', description: '同じキーワードを何度も確認し、いくつもの検索結果の画面を開き、手で計算する作業が、一日の時間を奪います。' },
        answer: { title: 'GoogleとGoogleマップでの検索順位', description: '自然検索とGoogleマップでの順位を、キーワードごとに、地域別、端末別に計測し、変化の履歴を残します。' },
      },
      {
        pain: { title: 'データが複数のツールに散らばっています', description: 'Googleでの順位、Googleマップでの順位、AIエンジンでの可視性がそれぞれ別の場所にあり、全体像が一つにまとまりません。' },
        answer: { title: 'すべてが同じ場所に', description: 'キーワード調査、検索順位、AIでの可視性、そして記事が互いにつながっていて、四つの別のツールに分かれていません。' },
      },
      {
        pain: { title: 'AIエンジンはすでに検索の一部です', description: 'ChatGPT、Gemini、Google AI Modeに質問する顧客が増えています。その回答に自社が現れているかを知る必要があります。' },
        answer: { title: 'AIでの可視性の計測', description: 'ChatGPT、Gemini、Google AI Modeの回答で、自社が言及されているか、出典として示されているか、おすすめされているかを確認できます。' },
      },
      {
        pain: { title: '途中で止まってしまうコンテンツ', description: '何について書くかを知ることは、仕事の半分です。残りは、書いて、公開して、計測することです。' },
        answer: { title: '記事の作成と公開', description: 'ご承認いただいたテーマについて、画像、質問と回答の章、内部リンクを含む記事を仕上げ、WordPressまたはShopifyに公開します。' },
      },
    ],
  },
  approach: {
    title: '私たちの仕事の進め方',
    items: [
      {
        title: '透明性',
        description: '何を計測しているか、データがどこから来ているか、それが何を意味するかをお伝えします。水増しした指標はありません。',
      },
      {
        title: '役に立つデータ',
        description: '見栄えのよい数字ではなく、事業として筋の通った話を伝えるレポートです。',
      },
      {
        title: 'わかりやすい画面',
        description: 'コンテンツ、GoogleとGoogleマップでの順位、AIでの可視性を一つの画面にまとめ、余計なものを置きません。',
      },
      {
        title: 'SEOとGEOを一緒に',
        description: 'Googleに向けたコンテンツとAIエンジンに向けたコンテンツ、そしてその両方の計測です。',
      },
    ],
  },
  choose: {
    title: 'Go Top SEOを選ぶ理由',
    items: [
      {
        title: '担当者が直接、妥協なく対応します',
        description: '毎月変わる「アカウントマネージャー」はいません。その事業を把握している同じ担当者が対応します。',
      },
      {
        title: '完全な透明性',
        description: 'ご自身のアカウントで何が起きているか、何が効いて何が効かなかったか、次にどう進めるかが、いつでもわかります。',
      },
      {
        title: '専門用語を使わない専門性',
        description: '難しい言葉は並べません。計測できて理解できる成果について話します。',
      },
      {
        title: '私たちも一つの会社です',
        description: '重圧、限られた予算、成果を見たい気持ちが理解できます。私たちもそれを経験しているからです。',
      },
    ],
  },
  cta: {
    title: 'このプラットフォームでサイトがどう変わるかを見てみませんか',
    body: FEATURE_COMMON['ja'].closeBody,
    contact: 'ご質問はこちらへ：',
    updated: 'このページの最終更新は2026年9月です',
  },
}
