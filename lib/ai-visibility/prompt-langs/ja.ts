/**
 * Japanese AI-visibility questions.
 *
 * Japanese is the first prompt language written WITHOUT WORD SPACES, and that
 * changes three things the other packs can take for granted:
 *
 *  1. A question ends in the full-width 「？」, not '?'. The shared quality gate
 *     in prompt-templates.ts accepts both, and it measures an unspaced
 *     language's length in characters rather than against the latin minimum —
 *     「おすすめの香水は？」 is a complete question in nine characters.
 *  2. `intentWords` is EMPTY on purpose. The shared keyword cleaner strips
 *     single words by splitting on whitespace, which in Japanese is the whole
 *     string or nothing. Everything that has to come off a keyword is listed in
 *     `intentPhrases`, which is removed by substring and so needs no spaces.
 *  3. `phrasingBuckets` and `familyPrefix` match at the END of the question,
 *     not the start: Japanese puts the topic first and the frame last, so the
 *     bucket that tells 「いくら」 from 「おすすめ」 is a suffix test.
 *
 * Register: です/ます throughout, the plain form a customer types into a chat
 * box, no keigo gymnastics and no katakana where a native word exists.
 */
import type { BusinessCategory, QueryDef } from '../prompt-templates'
import type { LangPack } from './index'

const BRAND_REVIEW = (score = 74): QueryDef => ({
  intent: 'brand', text: '{{business}}の評判は？', score, offering: 'generic',
})

const BANK: Record<BusinessCategory, QueryDef[]> = {
  perfume: [
    { intent: 'recommendation', text: '女性へのプレゼントにおすすめの香水は？', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: '男性へのプレゼントにおすすめの香水は？', score: 93, offering: 'primary', themeBoost: { audienceMen: 5 } },
    { intent: 'pre_purchase', text: '自分に合う香水の選び方は？', score: 87, offering: 'primary' },
    { intent: 'recommendation', text: '{{country}}でおすすめの香水専門店は？', score: 89, offering: 'primary' },
    { intent: 'comparison', text: 'オードパルファムとオードトワレの違いは？', score: 85, offering: 'primary' },
    { intent: 'pre_purchase', text: '正規品の香水をネットで買えるのはどこ？', score: 91, offering: 'primary', themeBoost: { online: 5 } },
    { intent: 'local', text: '買う価値のあるニッチ香水のブランドは？', score: 83, offering: 'local', themeBoost: { niche: 4 } },
    { intent: 'gift', text: 'プレゼントに向いている香水は？', score: 85, offering: 'secondary', themeBoost: { gift: 5 } },
    { intent: 'commercial', text: '香水を安く買えるのはどこ？', score: 81, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  sports_store: [
    { intent: 'recommendation', text: '{{country}}でおすすめのスポーツ用品店は？', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: '自分に合うランニングシューズの選び方は？', score: 89, offering: 'primary' },
    { intent: 'recommendation', text: '毎日のトレーニングにおすすめのスポーツウェアのブランドは？', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'ランニングシューズとジム用シューズの違いは？', score: 83, offering: 'primary' },
    { intent: 'commercial', text: 'スポーツ用品を安く買えるのはどこ？', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  gifts: [
    { intent: 'gift', text: '結婚祝いのプレゼントのおすすめは？', score: 89, offering: 'primary' },
    { intent: 'gift', text: '人とかぶらない誕生日プレゼントのアイデアは？', score: 87, offering: 'primary' },
    { intent: 'gift', text: '社員に渡す記念品のおすすめは？', score: 85, offering: 'primary' },
    { intent: 'recommendation', text: '{{country}}で珍しいギフトを買えるのはどこ？', score: 85, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  appliance_store: [
    { intent: 'recommendation', text: '{{country}}でおすすめの家電量販店は？', score: 89, offering: 'primary' },
    { intent: 'pre_purchase', text: '洗濯機の選び方は？', score: 85, offering: 'primary' },
    { intent: 'local', text: '家電はネットと店舗どちらが安い？', score: 83, offering: 'local', themeBoost: { online: 3, price: 3 } },
    BRAND_REVIEW(),
  ],

  agency: [
    { intent: 'recommendation', text: '{{country}}でおすすめのSEO会社は？', score: 93, offering: 'primary' },
    { intent: 'recommendation', text: '{{country}}でおすすめのデジタルマーケティング会社は？', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: 'デジタルマーケティング会社の選び方は？', score: 87, offering: 'primary' },
    { intent: 'comparison', text: 'SEOと広告運用はどちらに投資すべき？', score: 85, offering: 'primary' },
    { intent: 'commercial', text: '{{country}}でのSEO対策の費用はいくら？', score: 89, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  cleaning: [
    { intent: 'recommendation', text: '{{city}}でおすすめのオフィス清掃会社は？', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: '信頼できる清掃会社の選び方は？', score: 85, offering: 'primary' },
    { intent: 'commercial', text: 'オフィス清掃の月額費用はいくら？', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  ecommerce: [
    { intent: 'recommendation', text: '{{country}}でおすすめのネットショップは？', score: 87, offering: 'primary' },
    { intent: 'pre_purchase', text: 'ネットショップが信頼できるか見分ける方法は？', score: 83, offering: 'primary' },
    { intent: 'commercial', text: '{{country}}でネット通販が一番安いのはどこ？', score: 85, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  saas: [
    { intent: 'pre_purchase', text: '{{business}}は小規模な会社でも使える？', score: 92, offering: 'primary' },
    { intent: 'commercial', text: '{{business}}の料金はいくら？', score: 90, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'pre_purchase', text: '{{business}}のメリットとデメリットは？', score: 88, offering: 'primary' },
    { intent: 'informational', text: '{{business}}は料金に見合う価値がある？', score: 86, offering: 'primary', themeBoost: { price: 3 } },
    { intent: 'pre_purchase', text: '{{business}}の使い方は？', score: 84, offering: 'primary' },
    { intent: 'pre_purchase', text: '{{business}}はどんな人に向いている？', score: 82, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  product_brand: [
    { intent: 'informational', text: '{{business}}の製品のメリットとデメリットは？', score: 92, offering: 'primary' },
    { intent: 'local', text: '{{business}}の製品はどこで買える？', score: 90, offering: 'primary' },
    { intent: 'pre_purchase', text: '{{business}}の製品を買う前に確認すべき点は？', score: 88, offering: 'primary' },
    { intent: 'commercial', text: '{{business}}の製品が一番安いのはどこ？', score: 86, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: '{{business}}の製品は新品と整備済みどちらがいい？', score: 84, offering: 'primary' },
    { intent: 'recommendation', text: '今年おすすめの{{business}}の製品は？', score: 83, offering: 'primary' },
    { intent: 'brand', text: '{{business}}の製品の評判は？', score: 74, offering: 'generic' },
  ],

  florist: [
    { intent: 'local', text: '{{city}}で当日配達できる花屋は？', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: '{{city}}でおすすめの花屋は？', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  second_hand_fashion: [
    { intent: 'recommendation', text: 'レディースの古着を買えるのはどこ？', score: 94, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'レディース古着のおすすめショップは？', score: 93, offering: 'primary', themeBoost: { audienceWomen: 5 } },
    { intent: 'recommendation', text: 'レディースのヴィンテージ服が見つかるのはどこ？', score: 92, offering: 'primary', themeBoost: { audienceWomen: 4 } },
    { intent: 'pre_purchase', text: '古着の品質を見分ける方法は？', score: 91, offering: 'primary' },
    { intent: 'pre_purchase', text: '古着をネットで買っても大丈夫？', score: 89, offering: 'primary' },
    { intent: 'commercial', text: 'レディース古着を安く買えるのはどこ？', score: 90, offering: 'primary', themeBoost: { price: 5 } },
    { intent: 'commercial', text: '質のいい古着にいくらまで出す価値がある？', score: 88, offering: 'primary', themeBoost: { price: 4 } },
    { intent: 'informational', text: '古着でワードローブを組む方法は？', score: 87, offering: 'primary' },
    { intent: 'informational', text: 'ブランド古着が見つかるのはどこ？', score: 86, offering: 'primary' },
    { intent: 'local', text: '{{city}}の古着屋は？', score: 88, offering: 'local', requiresCity: true, themeBoost: { audienceWomen: 3 } },
    { intent: 'brand', text: '{{business}}は信頼できる古着屋？', score: 84, offering: 'secondary' },
  ],

  restaurant: [
    { intent: 'recommendation', text: '{{city}}でおすすめのレストランは？', score: 91, offering: 'primary', requiresCity: true },
    { intent: 'local', text: '{{city}}で記念日のディナーにおすすめの店は？', score: 85, offering: 'local', requiresCity: true },
    BRAND_REVIEW(),
  ],

  travel: [
    { intent: 'recommendation', text: '海外旅行の手配におすすめのサイトは？', score: 92, offering: 'primary' },
    { intent: 'pre_purchase', text: '個人手配で旅行を計画する方法は？', score: 90, offering: 'primary' },
    { intent: 'comparison', text: 'パッケージツアーと個人手配はどちらがいい？', score: 88, offering: 'primary' },
    { intent: 'informational', text: '海外航空券が安くなる時期はいつ？', score: 86, offering: 'primary' },
    { intent: 'commercial', text: '海外のパッケージツアーの費用はいくら？', score: 85, offering: 'secondary', themeBoost: { price: 4 } },
    BRAND_REVIEW(),
  ],

  healthcare: [
    { intent: 'recommendation', text: '{{city}}でおすすめの自由診療クリニックは？', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  legal: [
    { intent: 'recommendation', text: '{{country}}でおすすめの法律事務所は？', score: 89, offering: 'primary' },
    { intent: 'commercial', text: '{{country}}での弁護士相談の費用はいくら？', score: 83, offering: 'secondary', themeBoost: { price: 3 } },
    BRAND_REVIEW(),
  ],

  real_estate: [
    { intent: 'recommendation', text: '{{city}}でおすすめの不動産会社は？', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  fitness: [
    { intent: 'recommendation', text: '{{city}}でおすすめのジムは？', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  beauty: [
    { intent: 'recommendation', text: '{{city}}でおすすめの美容サロンは？', score: 89, offering: 'primary', requiresCity: true },
    BRAND_REVIEW(),
  ],

  education: [
    { intent: 'recommendation', text: '{{country}}でおすすめのITスクールは？', score: 87, offering: 'primary' },
    BRAND_REVIEW(),
  ],

  home_improvement_service: [
    { intent: 'recommendation', text: '{{city}}でキッチンのリフォームにおすすめの会社は？', score: 93, offering: 'primary', requiresCity: true },
    { intent: 'recommendation', text: '{{city}}で浴室のリフォームにおすすめの会社は？', score: 92, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: 'リフォーム会社に依頼する前に確認すべき点は？', score: 88, offering: 'primary' },
    { intent: 'recommendation', text: '{{city}}で全面リフォームにおすすめの会社は？', score: 90, offering: 'primary', requiresCity: true },
    { intent: 'commercial', text: '{{city}}で家をリフォームする費用はいくら？', score: 89, offering: 'secondary', requiresCity: true, themeBoost: { price: 4 } },
    { intent: 'transactional', text: '信頼できるリフォーム会社の選び方は？', score: 85, offering: 'primary' },
  ],

  local_service: [
    { intent: 'recommendation', text: '{{city}}でおすすめの業者は？', score: 87, offering: 'primary', requiresCity: true },
    { intent: 'pre_purchase', text: '業者に依頼するとき確認すべき点は？', score: 81, offering: 'primary' },
    { intent: 'commercial', text: '{{city}}で業者に依頼する費用はいくら？', score: 79, offering: 'secondary', requiresCity: true, themeBoost: { price: 3 } },
  ],

  generic: [
    { intent: 'recommendation', text: '{{business}}は何をしている会社？', score: 77, offering: 'primary' },
    BRAND_REVIEW(),
  ],
}

/**
 * Japanese needs no article, so `one` is the bare noun and the frames supply
 * the particle. `price` is the thing a price question asks about.
 */
const SERVICE_LABELS: LangPack['serviceLabels'] = {
  agency: { one: 'デジタルマーケティング会社', plural: 'デジタルマーケティング会社', price: 'サイトのSEO対策' },
  cleaning: { one: '清掃会社', plural: '清掃会社', price: 'オフィスの清掃' },
  home_improvement_service: { one: 'リフォーム会社', plural: 'リフォーム会社', price: '家のリフォーム' },
  local_service: { one: '地元の業者', plural: '地元の業者', price: '作業' },
  legal: { one: '法律事務所', plural: '法律事務所', price: '弁護士への相談' },
  real_estate: { one: '不動産会社', plural: '不動産会社' },
  healthcare: { one: '自由診療クリニック', plural: '自由診療クリニック', price: '自由診療' },
  education: { one: 'スクール', plural: 'スクール', price: '専門コース' },
  florist: { one: '花屋', plural: '花屋', price: '花の配達' },
  gifts: { one: 'ギフトショップ', plural: 'ギフトショップ' },
  perfume: { one: '香水専門店', plural: '香水専門店', price: '質のいい香水' },
  sports_store: { one: 'スポーツ用品店', plural: 'スポーツ用品店' },
  appliance_store: { one: '家電量販店', plural: '家電量販店' },
  second_hand_fashion: { one: '古着屋', plural: '古着屋' },
  restaurant: { one: 'レストラン', plural: 'レストラン' },
  travel: { one: '旅行手配サービス', plural: '旅行手配サービス', price: '旅行の手配' },
  fitness: { one: 'ジム', plural: 'ジム', price: 'ジムの月会費' },
  beauty: { one: '美容サロン', plural: '美容サロン', price: '美容施術' },
  ecommerce: { one: 'ネットショップ', plural: 'ネットショップ' },
  saas: { one: 'ソフトウェア', plural: 'ソフトウェア' },
}

export const JA_PACK: LangPack = {
  code: 'ja',

  intentLabel: {
    recommendation: 'おすすめ',
    comparison: '比較',
    commercial: '料金',
    pre_purchase: '購入前',
    transactional: '選択',
    local: '地域',
    brand: 'ブランド',
    informational: '情報',
    alternatives: '代替',
    gift: 'ギフト',
  },

  categoryLabel: {
    agency: 'マーケティング・SEO会社',
    ecommerce: 'ネットショップ',
    perfume: '香水専門店',
    sports_store: 'スポーツ用品店',
    gifts: 'ギフトショップ',
    appliance_store: '家電量販店',
    saas: 'SaaS製品',
    product_brand: '製品ブランド',
    local_service: '地域サービス',
    home_improvement_service: 'リフォーム・建築',
    cleaning: '清掃会社',
    florist: '花屋',
    restaurant: 'レストラン',
    healthcare: '医療サービス',
    legal: '法律事務所',
    real_estate: '不動産',
    fitness: 'フィットネス',
    beauty: '美容',
    education: '教育・研修',
    second_hand_fashion: 'レディース古着',
    travel: '旅行・観光',
    generic: '企業',
  },
  genericCategoryLabel: '企業',

  bank: BANK,

  countryNames: {
    IL: 'イスラエル',
    US: 'アメリカ',
    GB: 'イギリス',
    DE: 'ドイツ',
    FR: 'フランス',
    ES: 'スペイン',
    JP: '日本',
    KR: '韓国',
    TW: '台湾',
    SG: 'シンガポール',
  },

  placeholder: { business: 'この会社', city: 'お住まいの地域' },

  reason: {
    category: (v) => `事業カテゴリーに基づく判定：${v}`,
    intent: (v) => `検索意図：${v}`,
    location: (v) => `地域：${v}`,
    themes: {
      gift: 'キーワードにギフト目的を検出',
      online: 'キーワードにネット購入の意図を検出',
      price: '価格重視の傾向を検出',
      audienceMen: '対象を検出：男性',
      audienceWomen: '対象を検出：女性',
      audienceKids: '対象を検出：子ども',
      niche: '高級・ニッチブランドへの関心を検出',
    },
  },

  keywordFrames: {
    price: (kw) => `${kw}の費用はいくら？`,
    review: (kw) => `${kw}の評判は？`,
    prePurchase: (kw) => `${kw}を選ぶ前に確認すべき点は？`,
    recommendation: (kw) => `${kw}におすすめの業者は？`,
    local: (kw, city) => `${city}で${kw}におすすめの業者は？`,
  },

  genCopy: {
    insufficient: 'より精度の高い質問を作るために、事業のAIプロフィールを入力してください。',
    review: '確認',
    insufficientReason: '情報が不足',
    starter: '初期',
    default_: '既定',
    starterValue: '初期の質問です。プロフィールを入力するとより精度の高い提案になります',
  },

  /**
   * EMPTY on purpose — see the file header. Japanese has no word boundaries for
   * the shared single-word stripper to find, so everything it would remove is
   * listed in `intentPhrases` and removed by substring instead.
   */
  intentWords: new Set<string>(),
  intentPhrases: [
    '激安', '格安', '最安', '安い', 'おすすめ', 'おススメ', 'オススメ',
    '口コミ', '評判', 'レビュー', '比較', '人気', '価格', '料金', '費用', '相場',
    '通販', '購入', '買う', '注文', 'セール', '割引',
  ],

  serviceLabels: SERVICE_LABELS,

  intentQuestion: (intent, label, location) => {
    switch (intent) {
      case 'recommendation':
        return `${label.one}の選び方は？`
      case 'decision':
        return `${label.one}を選ぶ前に確認すべき点は？`
      case 'trust':
        return `信頼できる${label.one}を見分ける方法は？`
      case 'price':
        return label.price ? `${label.price}の費用はいくら？` : null
      case 'local':
        return location ? `${location}で${label.one}を探す方法は？` : null
      case 'comparison':
        return `${label.plural}を比較するポイントは？`
      case 'alternatives':
        return `${label.one}の代わりになる選択肢は？`
      default:
        return null
    }
  },

  safeCurated: {
    price: (isService) => (isService ? 'このサービスの費用はいくら？' : 'こうしたサービスの費用はいくら？'),
    choose: (label) => `${label}の選び方は？`,
    reviews: (name) => `${name}の評判は？`,
    local: (label, city) => `${city}でおすすめの${label}は？`,
  },

  nameQuestions: (name, label) =>
    label
      ? [
          { prompt: `${name}の評判は？`, intent: 'brand' as const },
          { prompt: `${name}は信頼できる？`, intent: 'pre_purchase' as const },
          { prompt: `${name}と他の${label.plural}の違いは？`, intent: 'comparison' as const },
        ]
      : [
          { prompt: `${name}の評判は？`, intent: 'brand' as const },
          { prompt: `${name}は利用者からどう言われている？`, intent: 'recommendation' as const },
        ],

  difference: (a, b) => `${a}と${b}の違いは？`,

  genericQuestions: [
    'この分野で信頼できる会社の選び方は？',
    '業者を選ぶ前に確認すべき点は？',
    '同じ分野の会社を比較するポイントは？',
    '業者に依頼する前に一番大事なことは？',
  ],

  commercialPattern: /(価格|料金|費用|いくら|相場|購入|買え|買う|注文|安い|激安|格安|割引|セール|月会費)/,
  locationPattern: /(近く|最寄り|周辺|地元|私の(?:街|地域))/,

  valueReason: {
    commercial: 'この質問をする人は購入に近い段階です。',
    competitive: 'ここでは競合のほうが多く表示されています。',
    local: '地域での表示を伸ばせる余地があります。',
    prePurchase: '購入意欲の高い検索です。',
    recommendation: '自然な流入で顧客を増やせる機会です。',
    frequent: 'AI検索でよく聞かれる質問です。',
    rare: 'この種の質問ではほとんど表示されていません。',
  },

  /**
   * Suffix tests, not prefix ones: the frame is at the END of a Japanese
   * question. Price comes first so 「費用はいくら？」 does not fall into the
   * recommendation bucket on the 「おすすめ」 of a longer question.
   */
  phrasingBuckets: [
    { bucket: 'ja_price', test: /(?:いくら|費用|料金|相場|価格)[?？]?$/ },
    { bucket: 'ja_pre_purchase', test: /(?:選び方|方法|確認すべき点|見分け方)は[?？]?$/ },
    { bucket: 'ja_comparison', test: /(?:違い|どちらがいい|比較するポイント)は[?？]?$/ },
    { bucket: 'ja_reviews', test: /(?:評判|口コミ|信頼できる)[^。]*[?？]?$/ },
    { bucket: 'ja_local', test: /(?:どこ|探す方法|買える)[?？]?$/ },
    { bucket: 'ja_recommendation_provider', test: /おすすめ/ },
  ],

  /**
   * Also a suffix: strip the frame off the end and what is left is the topic,
   * which is the family key the diversity cap needs.
   */
  familyPrefix: /(?:は(?:いくら|どこ|どう|何)[^。]*|の(?:費用|料金|相場|価格|選び方|違い|評判|口コミ|メリットとデメリット)(?:は)?|におすすめ(?:の)?[^。]*|でおすすめ(?:の)?[^。]*|を選ぶ前に確認すべき点は|を比較するポイントは)[?？]?$/u,

  priceFilter: {
    priceQuestion: /(いくら|費用|料金|値段)/,
    // The possessive の is what makes this "the price OF the company", which is
    // the nonsense question. 「業者に依頼する費用」 — the cost of hiring one —
    // is a real question and must not match.
    businessEntity: /(?:会社|ショップ|ブランド|お店|事務所)の(?:費用|料金|値段|価格)/,
  },

  filters: {
    doubledIntent: [
      /費用[^。]*いくら[^。]*(?:費用|料金)|料金[^。]*料金/,
      /評判[^。]*評判|口コミ[^。]*口コミ/,
      /おすすめ[^。]*おすすめ/,
      /比較[^。]*比較/,
      /(?:安い|激安|格安)[^。]*(?:安い|激安|格安)/,
    ],
    gift: /(?:プレゼント|ギフト|贈り物|お祝い)/,
    stackedModifiers: ['おすすめ', '人気', '安い', '格安', '高品質', 'セール', '割引'],
    unnatural: [
      /(?:その他の選択肢|他の代替案|他の業者)など/,
      /^誰が[^。]*におすすめ/,
    ],
    unnaturalForProducts: [
      /専門家に(?:依頼|相談)/,
      /おすすめの業者/,
    ],
  },
}
