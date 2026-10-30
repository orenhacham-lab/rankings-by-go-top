/**
 * The Japanese home page's words (app/(public)/ja/page.tsx renders them through
 * components/public/LandingPage.tsx).
 *
 * Plain polite です・ます, the register a Japanese business audience reads on a
 * product site. The Italian page's courtesy form ("il Suo sito") has no
 * Japanese equivalent that survives the transfer, so the second person is
 * usually left out of the sentence altogether, which is what Japanese does
 * anyway; where it is unavoidable it is ご自身 or お客様, never a pronoun.
 *
 * The demo's example business is in Tokyo rather than in Milan: the Japanese
 * site opens in Japan, and a demo full of Italian cities reads as a translated
 * page rather than a Japanese one. Its names and figures are illustrative and
 * the caption under the demo says so, the same promise the other locales make.
 * The demo domains are example-*.jp rather than plausible real ones, so a
 * screenshot cannot be read as naming an actual customer.
 *
 * `href` values stay unprefixed: components/public/LandingPage.tsx renders them
 * as `${prefix}${row.href}`, so writing '/ja/features/...' here would ship
 * '/ja/ja/features/...'. That is the bug the Spanish launch hit.
 *
 * Every claim is one the product keeps: no invented customers, totals, logos or
 * press, no percentage or ranking promise — in Japan that last one is also what
 * 景品表示法 requires of a performance claim. Prices come from the plan
 * catalogue, so the page cannot drift from it, and they are quoted in USD: the
 * Japanese page never names yen, because Japan's own local price is not set.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. Japan's own price is not set yet, so the Japanese
 * page shows the USD price every market outside Israel is billed in today,
 * grouped the Japanese way (which is the same grouping as English).
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('ja-JP')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingJa: LandingCopy = {
  hero: {
    eyebrow: 'GoogleとAIエンジンでの集客を自動化する、一つのシステム',
    title: '次のお客様は、すでに検索しています。',
    accent: '見つけてもらえる状態をつくります。',
    subtitle:
      'Go Top SEOは、顧客が検索している内容に答える記事を作成して公開し、そのうえで、Google、Googleマップ、ChatGPT、Geminiで自社がどこに出ているかをお見せします。コンテンツの専任者は不要で、推測も不要です。',
    signup: `${TRIAL_DAYS}日間の無料トライアル`,
    trialNote: 'クレジットカードは不要で、継続の縛りもありません。いつでも解約できます。',
    checkLead: 'アカウント作成はまだ早いという方へ。登録なしで、サイトを無料診断します：',
    dashboard: 'ダッシュボード',
    trust: ['WordPressとShopifyに公開', '担当者による人のサポート'],
    climbChip: 'Googleで3位',
    published: '記事をサイトに公開しました',
  },
  demo: {
    label: 'プラットフォームの実際の画面',
    caption: '製品のデモです。会社名と数値は例示です。',
    tabs: ['Googleでの上昇', '新しい記事', 'AIに推薦される'],
    describe: [
      'キーワードの画面です。ある検索語がGoogleの18位から3位に上がり、ほかに3語も上昇しています。',
      '記事の画面です。新しい記事が作成され、品質チェックを通過し、サイトへの予約公開を待っています。',
      'AIでの可視性の画面です。ChatGPTの回答がこの会社を推薦しており、引用しているエンジンも並んでいます。',
    ],
    address: 'app.gotopseo.com',
    rail: ['ダッシュボード', 'キーワード', 'コンテンツ戦略', '記事', 'AIでの可視性', 'レポート'],
    rank: {
      heading: 'キーワード',
      keyword: 'エアコン取り付け 東京',
      positionLabel: 'Googleでの順位',
      period: '直近8週間',
      from: 18,
      to: 3,
      columns: ['キーワード', '順位', '変動'],
      rows: [
        { keyword: '業務用エアコン 価格', from: 24, to: 7 },
        { keyword: 'エアコン修理 世田谷', from: 31, to: 9 },
        { keyword: 'エアコンクリーニング', from: 15, to: 5 },
      ],
      mapsLabel: 'Googleマップ、東京',
      mapsValue: '2位',
      toast: 'Googleで15順位上がりました',
    },
    article: {
      heading: '新しい記事',
      title: '業務用エアコンの取り付け費用はいくらか、契約前に確認したいこと',
      subheading: '価格を決めるのは何か',
      checksTitle: '品質チェック',
      checks: ['よくある質問', '構造化データ', '内部リンク', 'アイキャッチ画像', '検索にもとづく見出し'],
      draft: '作成中',
      scheduled: '予約済み',
      when: '火 9:00',
      toast: 'WordPressへ公開',
    },
    ai: {
      heading: 'AIでの可視性',
      question: '東京でエアコンの取り付けが上手な業者はどこですか',
      intro: 'この分野で評価の高い事業者をいくつかご紹介します。',
      items: [
        { name: '青山エアコンサービス', desc: '有資格の施工担当、工事保証つき、当日中に返答。', you: true },
        { name: 'クリマポイント', desc: 'クリーニングと保守の料金が明快。' },
        { name: '東京コンフォート設備', desc: 'ダクト式の設備が得意。' },
      ],
      youTag: 'ご自身の会社',
      mentionedIn: '引用元：',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPTが推薦しています',
    },
  },
  worksWith: {
    label: '当社が計測し、公開する先：',
    names: ['Google', 'Googleマップ', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify'],
  },
  outcomes: {
    eyebrow: '得られるもの',
    title: '本業に専念している間に、Go Top SEOが行うこと',
    body: '覚えることが増える道具ではありません。作業そのものを行い、そのうえで成果をお見せするシステムです。',
    items: [
      {
        title: '訪問数ではなく、顧客につながるコンテンツ',
        desc: '顧客が検索し、尋ねている内容を見つけ出し、その題材について記事を一本ずつ仕上げ、一定の頻度でサイトに公開します。お選びいただくのは題材だけです。',
        chips: ['自動で公開', '画像つき', 'よくある質問', '内部リンク'],
      },
      {
        title: 'ChatGPTとGeminiの回答の中での位置',
        desc: '検索する代わりにAIに尋ねる人が増えています。AIが自社を推薦しているか、代わりに誰を推薦しているか、何を改善するとよいかがわかります。',
        chips: ['AIエンジン6種', '競合との比較つき'],
      },
      {
        title: '効いているものがはっきり見えます',
        desc: 'Googleとマップでの順位、AIでの引用、公開した記事が一つの画面にまとまります。表計算も、推測も要りません。',
        chips: ['PDFとExcelのレポート', '全履歴'],
      },
    ],
    stats: [
      { value: 6, label: '計測するAIエンジン', detail: 'ChatGPT、Gemini、Perplexity、Copilot、Grok、Google AI' },
      { value: 3, label: '一つのレポートに収まる経路', detail: 'Google、Googleマップ、AIの回答' },
      { value: 2, label: '公開先のプラットフォーム', detail: 'WordPressとShopify、コピー＆ペーストは不要' },
      { value: TRIAL_DAYS, label: '日間の無料トライアル', detail: 'クレジットカードは不要' },
    ],
  },
  shift: {
    eyebrow: '検索が変わりました',
    title: '顧客はもうGoogleだけを通りません。AIに尋ね、おすすめを3件受け取ります。',
    body: 'サイトがその問いに答えていなければ、Googleでも、ChatGPTの回答でも、そのおすすめは競合に渡ります。そして自社がどう見えているかを把握している会社はほとんどありません。これまで、その二つを同時に見せる道具がなかったからです。',
    withoutTitle: 'Go Top SEOがない場合',
    without: [
      '誰かに時間ができたときだけ、2か月に1本の記事',
      '何を書くべきか、どの検索語に価値があるかがわからない',
      '順位は手作業で確認するか、まったく確認していない',
      'ChatGPTが自社を推薦しているのか競合を推薦しているのかがわからない',
    ],
    withTitle: 'Go Top SEOがある場合',
    with: [
      '公開の時期をご自身で決められる、安定したコンテンツの予定表',
      '顧客が実際に検索している内容から選ばれた題材',
      'GoogleとGoogleマップでの順位の自動計測',
      'ChatGPT、Gemini、Google AIが自社について何を述べているかの自動確認と、必要に応じてほかの3エンジン',
    ],
  },
  flow: {
    eyebrow: '仕組み',
    title: 'サイトのアドレスから、成果の出るコンテンツまで、4つの手順',
    body: '何を書くかはご自身が決めます。あとはプラットフォームが行います。',
    steps: [
      { tag: '無料、登録不要', title: 'サイトの診断', desc: 'アドレスを入力するだけです。1分以内に、その事業が何をしているか、顧客は誰か、そしてGoogleとAIに対してサイトの足を引っぱっているものは何かを把握します。' },
      { tag: 'ご承認のうえで', title: '計画が届きます', desc: '検索語、顧客が尋ねている質問、そしてすぐ書ける記事の一覧です。何を入れるかはご自身がお選びになります。' },
      { tag: '自動', title: '記事が作成され、公開されます', desc: 'どの記事にも画像とよくある質問のセクションが付き、ご予約の日にサイトへ公開されます。Go Topの拡張機能を入れたWordPressのサイトでは、構造化データも追加されます。' },
      { tag: '透明', title: '成果を追えます', desc: 'Googleとマップでの順位、AIでの引用、そしてどなたにでもお送りいただけるレポートです。' },
    ],
    cta: '無料診断から始める',
  },
  features: {
    eyebrow: '含まれるもの',
    title: '順位を上げるために必要なものが、一つの場所に',
    body: '4つの機能が連携します。どの記事も計測され、どの計測も次の記事を指し示すためです。',
    more: '詳しく見る',
    note: '画面内の名称と数値は例示です。',
    content: {
      overline: 'コンテンツと公開',
      title: 'ブログを埋めるためではなく、見つけてもらうための記事',
      body: 'どの記事も実際の検索をもとに組み立てます。人が尋ねている言葉からとった見出し、よくある質問のセクション、売上につながるページへの内部リンク、そしてGo Topの拡張機能を入れたWordPressのサイトでは、GoogleとAIエンジンが読み取る構造化データです。ご自身でお読みになり、必要なら手直しいただければ、プラットフォームが公開します。',
      points: ['アイキャッチ画像と本文中の画像', '公開前の品質チェック', 'WordPressとShopifyへの予約公開と直接公開'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: '今週のサイトの予定',
        days: ['日', '月', '火', '水', '木', '金', '土'],
        items: [
          { day: 0, title: '部屋に合うエアコンの選び方', status: 'published', label: '公開済み' },
          { day: 2, title: '業務用エアコンの取り付け費用はいくらか', status: 'scheduled', label: '予約済み' },
          { day: 4, title: 'エアコンクリーニングはどのくらいの頻度で必要か', status: 'writing', label: '作成中' },
        ],
        destinationLabel: '公開先',
        destinations: ['WordPress', 'Shopify'],
      },
    },
    ai: {
      overline: 'AIでの可視性',
      title: 'ChatGPTが自社を推薦したときと、競合を選んだときがわかります',
      body: '顧客が尋ねる質問をAIエンジンに投げ、その回答に誰が出てくるかを確認します。どの質問で自社が選ばれ、どこでおすすめが競合に渡っているか、そしてサイトの何を改善するとよいかがわかります。',
      points: ['ChatGPT、Gemini、Perplexity、Copilot、Grok、Google AI', '競合と並べて比較', '回答に入るために何を変えるかの指針'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: '回答に出てくるのは誰か',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: '東京でエアコンを取り付けている業者はどこですか', hits: [true, true, true, false, true, false] },
          { question: 'エアコンクリーニングの費用はいくらですか', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: '引用のシェア',
        you: { label: 'ご自身の会社', value: 58 },
        rival: { label: '主な競合', value: 42 },
      },
    },
    rank: {
      overline: 'Googleでの順位',
      title: 'GoogleとGoogleマップでの上昇を、すべて確認できます',
      body: '重要な検索語を、通常の検索と、市区町村や地域ごとのマップの両方で計測します。履歴が残るので、記事が働いているかどうかがわかります。',
      points: ['Googleの自然検索を、国、言語、端末ごとに', 'Googleマップを市区町村または地域ごとに', '検索ボリュームと競合性つきのキーワード調査'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: '計測中のキーワード',
        columns: ['キーワード', '順位', '変動'],
        rows: [
          { keyword: 'エアコン取り付け 東京', pos: 3, up: 15 },
          { keyword: '業務用エアコン 価格', pos: 7, up: 17 },
          { keyword: 'エアコン修理 世田谷', pos: 9, up: 22 },
          { keyword: 'エアコンクリーニング', pos: 5, up: 10 },
        ],
        maps: { label: 'Googleマップ', area: '東京', value: '20件中2位' },
      },
    },
    reports: {
      overline: 'レポート',
      title: '取引先や経営層に送るレポートを、ワンクリックで',
      body: '順位、推移、AIでの可視性をPDFとExcelに書き出せます。制作会社や代理店は、複数の取引先のサイトを一つのアカウントで、それぞれ別のプロジェクトとして運用できます。',
      points: ['PDFとExcelをワンクリックで', '複数のサイトを一つのアカウントで', 'すべてのデータが一つの場所に、レポートの手組みは不要'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: '成果レポート',
        period: '9月',
        stats: [
          { label: '1ページ目のキーワード', value: '14', up: true },
          { label: 'AIでの引用', value: '9', up: true },
          { label: '公開した記事', value: '8' },
          { label: '平均掲載順位', value: '6.2', up: true },
        ],
        clientsLabel: 'プロジェクト：',
        clients: ['example-aircon.jp', 'example-studio.jp', '+3'],
      },
    },
  },
  audience: {
    eyebrow: 'ご利用の方',
    title: 'サイトから顧客を得たいすべての方へ',
    body: 'SEOの知識は要りません。必要なのは、自分が何を売っているかを知っていることです。',
    items: [
      {
        title: '事業者の方',
        desc: '自然検索を学ぶことも、ライターを雇うこともなく、Googleからの問い合わせを増やせます。題材をご承認いただくだけで、あとは自動で進みます。',
        gain: '手が離せないときも働くサイト',
      },
      {
        title: 'フリーランス・制作会社',
        desc: '複数の取引先を一つのアカウントで運用し、コンテンツを早く作り、取引先ごとにわかりやすいレポートをお渡しできます。',
        gain: '同じ作業時間で、より多くの取引先',
      },
      {
        title: 'マーケティング担当の方',
        desc: '一定の頻度で公開が続き、そのコンテンツがGoogleとAIで何をしているかが一つの場所にまとまります。',
        gain: '「効いているのか」に明確な答え',
      },
    ],
  },
  check: {
    eyebrow: 'サイトの無料診断',
    title: 'まだ決めかねている方へ。当社に見えているものをお見せします',
    body: '診断は実際にサイトを読み取り、1分以内に最初の調査のまとめを返します。',
    items: [
      'その事業について読み取れた内容と、顧客像',
      '自社のとなりに並んでいる競合',
      'Googleに対してサイトの足を引っぱっている点と、サイト自体から集めた根拠',
      'AIの回答への対応がどこまで進んでいるか',
      '当社が作成する記事の一覧',
    ],
    cta: 'サイトを診断する',
    note: '無料、登録不要、クレジットカードも不要です。',
    preview: {
      domain: 'example-aircon.jp',
      heading: '最初の調査のまとめ',
      scoreLabel: 'AIへの対応',
      score: '3/4',
      findings: ['画像に代替テキストがありません', 'よくある質問のセクションがありません', 'メタディスクリプションの長さが適切ではありません'],
      lockedLabel: 'ほかの指摘と競合は、無料アカウントでご覧いただけます',
    },
  },
  faq: {
    eyebrow: 'よくある質問',
    title: '始める前によく聞かれること',
    body: '答えが見つからない場合は、WhatsAppでご連絡ください。',
    items: [
      {
        q: 'SEOの知識がまったくありません。それでも使えますか',
        a: 'はい。プラットフォームが検索語を選び、題材を提案し、記事を書きます。残るのは、自社に合うものを判断してご承認いただくことだけです。',
      },
      {
        q: '自分が見ないまま、サイトに何かが公開されることはありますか',
        a: 'ご承認いただいた題材だけが執筆に進み、どの記事も公開前に品質チェックを通ります。どの記事もお読みになって修正できますし、公開日もご自身が決めます。',
      },
      {
        q: 'ChatGPTで自分で全部書けばよいのではないですか',
        a: 'それも可能です。ただしその場合は、題材を選び、検索語を確かめ、よくある質問と構造化データを組み立て、ページ同士をつなぎ、サイトへ入稿し、効いたかどうかを確認するところまで、すべてご自身で行うことになります。Go Top SEOはその一連の流れを担い、GoogleとAIでの結果まで計測します。',
      },
      {
        q: 'どのようなサイトで使えますか',
        a: '直接公開に対応しているのはWordPressとShopifyです。順位の計測、AIでの可視性、キーワード調査は、どのサイトでもご利用いただけます。',
      },
      {
        q: `${TRIAL_DAYS}日間のトライアルが終わるとどうなりますか`,
        a: 'プランをお選びいただければ、中断したところからそのまま続きます。お選びにならない場合、請求は発生しません。クレジットカードを一度もお伺いしていないためです。',
      },
      {
        q: '解約できますか',
        a: 'はい。いつでもダッシュボードから直接解約できます。違約金も解約手数料もありません。',
      },
    ],
  },
  cta: {
    title: '次のお客様は、今日検索しています。見つけてもらえる状態をつくりましょう。',
    body: `サイトの無料診断から、あるいは${TRIAL_DAYS}日間のトライアルから。最初の記事は今日から作成できます。`,
    check: 'サイトを無料で診断する',
    signup: '無料トライアルを始める',
    dashboard: 'ダッシュボード',
    pricing: `プランは月額${FROM_USD}米ドルから。`,
    pricingLink: 'すべてのプランと料金を見る',
  },
}
