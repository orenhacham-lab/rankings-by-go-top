/**
 * The Japanese public site's shared words: navigation, footer, the About page,
 * the articles index, the cookie notice, the contact menu and the accessibility
 * menu. Same shape as `he`, `en`, `es`, `pt-BR`, `fr` and `it`, which is what
 * the public-dictionary QA proves — a key present in Hebrew and missing here is
 * a failure, not a silent fall back to another language.
 *
 * Japanese in plain polite です・ます throughout, which is the register a
 * Japanese business audience reads on a product site. Not 謙譲語: the heavy
 * humble forms of a sales letter ("弊社にお申し付けください") read as a
 * translation of someone else's manners, and the Italian dictionary's courtesy
 * form has no Japanese equivalent that would survive the transfer. Buttons and
 * menu labels are noun phrases (「料金」「お問い合わせ」), the way Japanese
 * interfaces label them, rather than imperatives.
 *
 * Established Japanese SEO vocabulary, not calques: 検索順位 for rankings,
 * 自然検索 for organic, キーワード, 検索ボリューム, 被リンク, 内部リンク,
 * 構造化データ, Googleビジネスプロフィール (Google's own Japanese name for it),
 * 代替テキスト for alt text, メタディスクリプション. "AI visibility" is
 * AIでの可視性 and the engines are AIエンジン.
 *
 * TYPOGRAPHY. Full-width punctuation (。、「」：) inside Japanese sentences, and
 * NO space between a Japanese word and the next — a space there reads as a
 * typo. A latin word or product name keeps its own letters and needs no space
 * around it either. Where a list separates two Japanese items, the full-width
 * 、 does it; the ASCII comma belongs only inside latin text.
 */
import type { PublicDictionary } from './he'

export const ja = {
  nav: {
    home: 'ホーム',
    pricing: '料金',
    features: '機能',
    articles: '記事',
    freeCheck: '無料診断',
    about: '会社情報',
    contact: 'お問い合わせ',
    login: 'ログイン',
    startFree: '無料で試す',
    toDashboard: 'ダッシュボード',
    menu: 'メニュー',
    closeMenu: 'メニューを閉じる',
    homeAria: 'Go Top SEO - ホーム',
    primaryAria: 'メインナビゲーション',
    featuresMenu: {
      contentPublishing: {
        label: 'コンテンツの作成、予約、公開',
        description: 'SEOとGEOのコンテンツの作成、公開予約、公開を、順位と可視性の計測とあわせて、プラットフォームから直接行えます。',
      },
      googleOrganic: {
        label: 'Googleでの検索順位の計測',
        description: 'Googleの検索結果での順位を計測します。キーワードごとに、地域、言語、端末別に、1ページ目と2ページ目を対象とします。',
      },
      googleMaps: {
        label: 'Googleマップでの検索順位の計測',
        description: 'Googleマップでの露出を確認します。市区町村、地域、検索語ごとの順位を、正確な地点指定で計測します。',
      },
      aiVisibility: {
        label: 'AIでの可視性の計測',
        description: 'ChatGPT、Gemini、Perplexity、Google AIの回答で、自社が引用されているかを確認します。',
      },
      reports: {
        label: 'SEOとGEOのレポート',
        description: '順位、推移、可視性のデータを含む業務用のレポートを、PDFとExcelで取引先にお渡しいただけます。',
      },
      keywordResearch: {
        label: 'キーワード調査',
        description: '計測に追加する前に、キーワードの案、検索ボリューム、競合性を確認できます',
      },
      siteFixes: {
        label: 'サイトの修正',
        description: 'サイトを診断し、タイトル、メタディスクリプション、画像の代替テキスト、リンクを修正します。WordPressでは、ご承認後にワンクリックで適用されます。',
      },
      mapsPosts: {
        label: 'Googleマップへの投稿',
        description: '写真とボタン付きの投稿をGoogleビジネスプロフィールに、すぐにまたは予約して公開し、口コミにも返信できます。手直しできる下書きが用意されます。',
      },
      links: {
        label: 'サイトへのリンク',
        description: 'サイト内のページをつなぐ内部リンク、どこからもリンクされていない孤立ページ、そして掲載する価値のある無料のディレクトリです。',
      },
      competitors: {
        label: '自社と競合',
        description: 'Googleでいくつのキーワードでそれぞれの競合が上位にいるか、そして自社の代わりにAIエンジンが誰を引用しているかがわかります。',
      },
      searchConsole: {
        label: 'Search Consoleのデータ',
        description: 'Googleでのクリック数、表示回数、平均掲載順位を、前の期間との比較つきで確認できます。',
      },
    },
    featureGroups: {
      measure: '計測する',
      act: '作業する',
      prove: '成果を見せる',
    },
    solutions: 'ご利用の方へ',
    solutionsMenu: {
      businesses: {
        label: '事業者の方',
        description: '書いて、公開して、計測します。業者の管理が不要な一つのシステムです。',
      },
      agencies: {
        label: '制作会社・代理店',
        description: '取引先のすべてのサイトを一つの場所で管理し、取引先に送れるPDFレポートを出力できます。',
      },
      shopify: {
        label: 'Shopifyの店舗',
        description: 'Shopify App Storeの当社アプリです。',
      },
      wordpress: {
        label: 'WordPressのサイト',
        description: '記事がサイトに直接公開され、修正はワンクリックで適用されます。',
      },
    },
  },
  footer: {
    tagline: 'SEOとGEOのコンテンツのプラットフォームです。コンテンツの作成、公開予約、公開を行い、Googleでの可視性と、ChatGPT、Gemini、そのほかのAIエンジンの回答での可視性を計測します。',
    pages: 'ページ',
    home: 'ホーム',
    pricing: '料金',
    articles: '記事',
    about: '会社情報',
    affiliates: 'アフィリエイトプログラム',
    sitemap: 'サイトマップ',
    legal: '法的事項',
    privacy: 'プライバシーポリシー',
    terms: '利用規約',
    refundPolicy: '解約・返金ポリシー',
    affiliateTerms: 'パートナープログラム契約',
    accessibility: 'アクセシビリティ',
    contact: 'お問い合わせ',
    copyright: '© 2026 Go Top SEO. All rights reserved.',
    agencyAria: 'Go Top - デジタルマーケティング会社',
    credit: 'GO TOPの製品です',
  },
  about: {
    breadcrumb: '会社情報',
    heroTitle1: 'Go Top SEO',
    heroTitle2: 'とは',
    heroSubtitle: 'デジタル領域で11年以上の実務経験があります。そして現在は、Googleでの検索順位とAIでの可視性を追うためのプラットフォームを提供しています。',
    storyTitle: 'Go Topのこれまで',
    storyPara1: '人工知能と自動化があふれ、大企業が抽象的な言葉で語る時代に、Go Topは別の道を選びました。',
    storyPara2: '人の手が入っていて、正確で、成果に向かうもの。デジタル領域での11年以上の実務、とりわけ企業の自然検索での集客、サイト制作、オンライン広告の経験の上に作られています。',
    yearsLabel: '年の経験',
    yearsSublabel: 'デジタル領域で',
    philosophyTitle: '私たちの考え方',
    philosophyPara1: '量ではなく、質だけを見ています。考え方の合う企業とだけ仕事をし、その企業に最大限の注意、直接の連絡、丁寧な対応を向けます。',
    philosophyPara2: 'Go Topでは、クリック数や表示回数に心を動かされることはありません。心を動かされるのは、電話が鳴り始めたときです。結局のところ、本当に意味があるのはそれだからです。',
    qualityBadge: '量よりも質',
    whyTitle: 'Go Top SEOを作った理由',
    whyIntro: '多くの企業が汎用の順位計測ツールを使っていますが、同じ問題が繰り返し聞こえてきました。',
    whyProblem1Title: '高価で、使い方が難しいツール',
    whyProblem1Desc: '小規模な事業者を想定して作られていません',
    whyProblem2Title: '誰も読み解けないレポート',
    whyProblem2Desc: '結局使われないデータばかりです',
    whyProblem3Title: '本当の意味での伴走がない',
    whyProblem3Desc: '助けが最も必要なときに限って',
    whyConclusion1Prefix: 'そこで作ったのが',
    whyConclusion1Suffix: 'です。私たちと同じように、成果に向かう順位計測のプラットフォームです。',
    whyAiPara1: 'そしてここ数年、検索そのものがさらに変わりました。顧客はもう、見慣れたGoogleの検索結果だけに頼りません。ChatGPT、Gemini、Perplexity、そのほかのAIエンジンに尋ね、直接おすすめを受け取っています。',
    whyAiPara2: 'だからGo Top SEOは、Googleでの検索順位だけを追うのではありません。AIの回答の中で自社がどのように現れているかも追います。本当に意味があるのはそこだからです。探している人の目に、その人が探しているすべての場所で留まることです。',
    featuresTitle: 'Go Top SEOが計測するもの',
    feature1Title: '検索での順位の計測',
    feature1Desc: 'Googleの自然検索での順位を、時間の推移とともに記録します',
    feature2Title: 'Googleマップでの計測',
    feature2Desc: 'ローカル検索での結果についての詳細なレポートです',
    feature3Title: 'AIでの可視性',
    feature3Desc: 'AIが自社を引用しているか、ドメインを引用しているか、そのとなりにどの出典が並んでいるかを確認します',
    feature4Title: 'レポートと分析',
    feature4Desc: '本当に意味のあるものを示すレポートです。Googleの自然検索、Googleマップ、そしてAIでの可視性です',
    valuesTitle: 'Go Top SEOを選ぶ理由',
    value1Title: '担当者が直接、妥協なく対応します',
    value1Desc: '毎月担当者が変わることはありません。その事業を把握している専門家が担当します。',
    value2Title: '完全な透明性',
    value2Desc: 'ご自身のアカウントで何が起きていて、何が効いて何が効かなかったか、どう改善するかが、いつでもわかります。',
    value3Title: '成果につながる専門性',
    value3Desc: 'Go Topでは流行りの言葉を並べません。実際の成果をお届けします。',
    value4Title: '私たちも一つの会社です',
    value4Desc: 'だからこそ、重圧、予算、そして成果を見たい気持ちが理解できます。',
    finalCtaTitle: '始めてみませんか',
    finalCtaSubtitle: 'すぐに無料で始めて、このプラットフォームが何をするかをご自身でご確認ください',
    finalCtaStartFree: '無料トライアルを始める',
    finalCtaContact: '担当者に相談する',
    lastUpdated: 'このページの最終更新は2026年4月です',
  },
  articles: {
    breadcrumb: '記事',
    title: '記事',
    subtitle: '自然検索での集客、デジタルマーケティング、技術についての記事とアドバイス',
    loading: '読み込み中…',
    noImage: '画像なし',
    readMore: '記事を読む >>',
    promoBadge: 'Go Top SEO',
    promoTitle1: 'Googleでの検索順位を',
    promoTitle2: '時間の流れとともに',
    promoDesc: 'Googleの自然検索とGoogleマップでの検索順位を計測する業務用のプラットフォームです。詳細なレポート、推移の記録、担当者との直接のやり取りが付きます。',
    promoCtaStart: '無料トライアルを始める',
    promoCtaPricing: '料金を見る',
    stat1: 'キーワード',
    stat2: '順位の取得先',
    stat3: 'SEOのための設計',
    stat4: '無料トライアル',
    statValueKeywords: '1000+',
    statValueTracking: '2',
    statValueHebrew: '100%',
    statValueTrial: '7日間',
    promoFeature1Title: 'Googleの自然検索',
    promoFeature1Desc: 'Googleの1ページ目と2ページ目の順位を、正確な結果で計測します',
    promoFeature2Title: 'Googleマップ',
    promoFeature2Desc: '正確な地点ごとの計測です。市区町村、郵便番号、緯度経度に対応します',
    promoFeature3Title: '業務用のレポート',
    promoFeature3Desc: '推移、比較、詳細な分析を含むレポートをPDFとExcelで書き出せます',
  },
  breadcrumbs: {
    home: 'ホーム',
    aria: 'パンくずリスト',
  },
  languageSwitcher: {
    // Each language names ITSELF, in its own script: a reader looking for their
    // language scans for the word they would recognize, not for its translation.
    he: 'עברית',
    en: 'English',
    es: 'Español',
    'pt-BR': 'Português (Brasil)',
    fr: 'Français',
    it: 'Italiano',
    ja: '日本語',
    aria: 'サイトの言語を切り替える',
  },
  cookie: {
    aria: 'プライバシーポリシー',
    title: 'プライバシーを大切にしています',
    body: 'サイトの動作に必要なクッキーを使用しています。計測およびマーケティングのクッキーは、同意をいただく前には読み込みません。詳しくは次をご覧ください',
    short: '任意のクッキーは、同意をいただいた場合にのみ読み込みます。次をご覧ください',
    privacy: 'プライバシーポリシー',
    accept: 'すべて同意する',
    rejectAll: 'すべて拒否する',
    customize: '個別に設定する',
    save: '選択を保存する',
    back: '戻る',
    settings: 'クッキーの設定',
    settingsTitle: 'クッキーの選択',
    settingsIntro: '区分ごとに同意または拒否を選べます。選択はいつでも変更できます。',
    always: '常に有効',
    withdrawHint: '同意の変更や撤回は、各ページの下部にある「クッキーの設定」のリンクからいつでも行えます。',
    gpcTitle: '自動的に同意を拒否しました',
    gpcBody: 'ブラウザがGlobal Privacy Controlの信号を送信しているため、計測およびマーケティングのクッキーは読み込んでいません。この選択は記録しました。',
    categories: {
      necessary: {
        title: '必須',
        desc: 'アカウントへのログイン、画面の言語、セキュリティ、不正利用の防止に使います。これがないとサービスが動かないため、同意の対象ではありません。',
      },
      analytics: {
        title: '計測',
        desc: 'サイトを何人が訪れ、どのページを読み、どこで不具合が起きたかを把握します。サイトの改善のために使い、広告には使いません。',
      },
      marketing: {
        title: 'マーケティング',
        desc: '当社の広告の成果の計測、GoogleとMetaのネットワークでの関連する広告の表示、そしてJVZooのマーケットプレイス経由でご来訪いただいた場合に、ご紹介者であるアフィリエイトへ購入を紐づけるために使います。拒否してもサービスの内容は変わりません。',
      },
    },
  },
  contact: {
    region: 'お問い合わせ',
    whatsappAria: 'WhatsAppでお問い合わせ',
    whatsappTitle: 'WhatsAppで送る',
    whatsapp: 'WhatsApp',
    callAria: '電話する',
    call: '電話する',
    whatsappLabel: 'WhatsApp',
    whatsappMessage: 'こんにちは。相談したいことがあります',
    phoneLabel: '電話する',
    emailLabel: 'メール',
    emailAria: 'メールを送る',
    // The floating "free demo" button (w11), on the public site and in the app.
    demo: '無料デモ',
    demoAria: 'WhatsAppで無料デモを依頼する',
    demoMessage: 'こんにちは。Go Top SEOの無料デモを希望します',
  },
  a11y: {
    open: 'アクセシビリティメニューを開く',
    title: 'アクセシビリティメニュー',
    close: 'アクセシビリティメニューを閉じる',
    noAlt: '（代替テキストなし）',
    statement: 'アクセシビリティに関する方針',
    reset: 'アクセシビリティ設定を解除・初期化',
    fontUp: '文字を大きく',
    fontDown: '文字を小さく',
    readableFont: '読みやすい書体',
    persistentDesc: '画像の説明文を表示',
    showDescriptions: 'ポインターを重ねたときに画像の説明文を表示',
    highlightLinks: 'リンクを強調',
    highlightHeadings: '見出しを強調',
    invertColors: '色を反転',
    blackYellow: '黒と黄色',
    highContrast: '高コントラスト',
    sepia: 'セピア',
    grayscale: 'グレースケール',
    stopAnimations: 'アニメーションを停止',
    keyboardNav: 'キーボード操作',
    blackCursor: '黒いカーソル',
    bigCursor: '大きいカーソル',
    zoomOut: '縮小',
    zoomIn: '拡大',
  },
}

/** The dictionary must carry every key the Hebrew one defines; nothing less. */
const _jaHasEveryKey: PublicDictionary = ja as unknown as PublicDictionary
void _jaHasEveryKey
