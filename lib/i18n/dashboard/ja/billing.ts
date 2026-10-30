/**
 * Reports (Google rankings and AI visibility), the first-run onboarding tour,
 * the billing and plans screen (PayPal, Shopify billing, cancel renewal), the
 * trial bar, the "start here" checklist on the dashboard and the long-running
 * action messages, in JAPANESE.
 *
 * Register as set out in chrome.ts.
 *
 * PRICES. Nothing here states an amount: every plan line comes from
 * PLAN_CATALOG through planLimitLines/trialLimitLines, so a Japanese card can
 * never promise more than the server grants — and it can never show a currency
 * the account is not billed in. Abroad the plans are sold in US DOLLARS plus
 * tax; there has never been a yen price, and this file must not invent one.
 * Card payments are sold by Creem as merchant of record: Creem issues the
 * invoice and applies the tax on the billing address, which is what the Creem
 * disclosure below says. It deliberately does NOT call that invoice a
 * 適格請求書 under Japan's インボイス制度: whether Creem's invoice carries a
 * registration number is a question for Creem, and until it answers, claiming
 * one would be a claim about a Japanese buyer's input-tax credit that we cannot
 * stand behind.
 *
 * TRIAL BAR. `daysLeft` returns the pair the component puts a number between,
 * so the Japanese pair reads 「無料トライアルは残り」+ n +「日」 rather than being
 * forced into the Latin word order.
 */
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '@/lib/plans/features'
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const billingJa: DeepPartial<DashboardDictionary> = {
  reports: {
    title: 'レポート',
    subtitle: 'Google での検索順位とAIの回答での可視性を、ダウンロードして共有できるレポートにまとめます',
    onDemandTitle: '必要なときに作るレポート',
    onDemandBody: 'レポートの種類を選ぶと、最新のデータで作成されます。PDF でダウンロードするか、Excel に書き出せます。',
    googleReport: 'Google の検索順位レポート',
    reportType: 'レポートの種類',
    googleReportType: 'Google の検索順位（自然検索とマップ）',
    aiReportType: 'AIでの可視性',
    loadingReportData: 'レポートのデータを読み込んでいます...',
    loading: '読み込み中...',
    exportExcel: 'Excel に書き出す',
    downloadReport: 'レポートをダウンロード',
    nothingToDownload: '今はダウンロードできるものがありません。最初の計測のあとにレポートが埋まります。',
    generatedOn: '作成日',
    excelExportWorkInProgress: 'AIでの可視性レポートの Excel 書き出しはまだご利用いただけません',
    loadAIReportFirst: 'まずAIでの可視性レポートを読み込んでください',
    loadGoogleReportFirst: 'まず Google の検索順位レポートを読み込んでください',
    downloadError: 'レポートのダウンロード中にエラーが発生しました',
    reportFilename: 'レポート',
    rankingsLabel: '検索順位',
    google: {
      totalKeywords: 'キーワードの合計',
      found: '見つかった',
      notFound: '見つからなかった',
      coverage: 'Google で見つかった割合',
      currentRankings: '現在の検索順位',
      keyword: 'キーワード',
      engine: 'エンジン',
      ranking: '順位',
      change: '変化',
      noKeywordsInReport: 'レポートにキーワードがありません',
      emptyTitle: 'キーワードを計測し始めると、このレポートが埋まります',
      emptyBody: 'キーワードを計測対象にすると、最初の計測のあとに、その順位と変化がここに表示されます。',
      emptyAction: 'キーワードを選ぶ',
    },
    ai: {
      aiScans: 'AIでの確認',
      aiQueries: 'AIへの質問',
      mentions: '言及',
      mentionRate: '言及率',
      domainCited: '出典として示されたドメイン',
      citationRate: '出典として示された割合',
      activeEngines: '対象のエンジン',
      overallVisibility: '全体の可視性',
      performanceByEngine: 'エンジンごとの結果',
      scans: '確認',
      citations: '出典',
      aiQueryResults: 'AIへの質問の結果',
      query: '質問',
      engine: 'エンジン',
      mentioned: '言及あり',
      domainCited2: '出典として示されたドメイン',
      citations2: '出典',
      date: '日付',
      yes: 'はい',
      no: 'いいえ',
      noResultsInReport: 'レポートに結果がありません',
      emptyTitle: '最初のAIでの確認のあとに、このレポートが埋まります',
      emptyBody: 'AIでの可視性の確認を実行すると、エンジンごとの言及と出典がここに表示されます。',
      emptyAction: 'AIでの可視性を確認',
      showingResults: (showing: number, total: number) => `${total} 件のうち ${showing} 件を表示しています`,
      aiVisibilityReport: 'AIでの可視性レポート',
    },
  },
  onboarding: {
    title: 'ようこそ。さっそく始めましょう',
    subtitle: '最初のステップを一緒に見ていきます',
    steps: {
      createProject: {
        title: '新しいサイトの追加',
        description: 'サイトごとに独立したプロジェクトです。画面上部の切り替えから、サイトを切り替えたり、新しく作成したりできます。',
        action: 'サイトを作成',
      },
      keywordResearch: {
        title: 'キーワード調査',
        description: 'キーワードの案を見つけ、検索ボリュームと推移を確認し、そのままサイトに追加できます。',
        action: 'キーワード調査へ移動',
      },
      generateReports: {
        title: 'レポート',
        description: 'AIでの可視性、検索順位、競合、おすすめの対応をまとめた、取引先に見せられる SEO と GEO のレポートを作成できます。',
        action: 'レポートへ移動',
      },
    },
    buttons: {
      next: '次へ',
      skip: 'スキップ',
      done: '完了',
      skipAll: 'すべてスキップ',
    },
  },
  billing: {
    title: 'ご契約プラン',
    subtitle: '必要なプランをお選びください',
    trialActive: '無料トライアル期間中です。',
    validUntilPrefix: '有効期限',
    onPlanPrefix: '現在のプラン',
    renewalPrefix: '更新日',
    recommended: 'おすすめ',
    currentPlan: '現在のプラン',
    perMonth: '月あたり',
    trialName: '無料トライアル',
    planLabels: {
      trial: 'トライアル',
      regular: 'Basic',
      advanced: 'Advanced',
      premium: 'Premium',
      large_agency: 'Agency',
    },
    // Derived from PLAN_CATALOG, exactly as the Hebrew and English cards are, so
    // a Japanese card cannot promise more than the server grants.
    features: {
      trial: trialLimitLines('ja'),
      regular: planLimitLines('regular', 'ja'),
      advanced: planLimitLines('advanced', 'ja'),
      premium: planLimitLines('premium', 'ja'),
      large_agency: planLimitLines('large_agency', 'ja'),
    },
    keywordCheckNote: `${CHECKS_EXPLAINER['ja']} 記事の上限はアカウント内のすべてのサイトで共有され、どの上限も毎月更新されます。使わなかった分は翌月に繰り越されません。`,
    trialNoChargeNotice: 'お支払い方法は登録されておらず、自動で請求されることはありません。',
    marketPrompt: {
      currencyName: { ILS: 'イスラエル・シェケル（₪）', USD: '米ドル（$）' },
      byLocation: (currency: string) => `価格は所在地にもとづき ${currency} で表示されます。通貨は最初のお支払いで確定します。`,
      locked: (currency: string) => `このアカウントは ${currency} で請求されます。`,
    },
    manage: {
      title: 'ご契約の管理',
      description: '更新を停止したあとも、すでにお支払いいただいた請求期間の終わりまでプランは有効です。',
      cancelButton: '更新の停止',
      cancelling: '停止しています...',
      confirmCancelTitle: '更新を停止しますか',
      confirmCancel: 'すでにお支払いいただいた請求期間の終わりまでご利用いただけ、そのあとの請求はありません。',
      confirmCancelAction: '更新の停止',
      keepRenewal: 'プランを続ける',
      cancelSuccess: 'ご契約の更新を停止しました。請求期間の終わりまでご利用いただけます。',
      cancelError: '更新を停止できませんでした。少ししてからもう一度お試しいただくか、ご連絡いただければ当社で停止します。',
      contactToCancel: '更新の停止をご希望の場合はご連絡ください。プランを終了します。ご契約が他社から請求されている場合は、どこで停止するかをお伝えし、ご依頼を先方にお伝えします。',
      cancelAtMarketplace: (seller: string) => `このプランは ${seller} で購入され、請求も ${seller} が行っています。更新の停止は ${seller} のアカウントから行い、お支払い済みの期間の終わりまでご利用いただけます。${seller} に連絡が取れない場合はご連絡ください。当社側でプランを終了します。実際の請求を止められるのは ${seller} だけです。`,
      marketplacePolicyLink: (seller: string) => `${seller} の規約とポリシー`,
      renewalAlreadyCancelled: '更新は停止されています。次の日付までご利用いただけます：',
    },
    paypal: {
      loading: 'PayPal を読み込んでいます...',
      notConfigured: '今は PayPal でのお支払いをご利用いただけません。のちほどお試しいただくか、ご連絡ください。',
      sdkLoadFailed: 'PayPal を読み込めませんでした。インターネット接続をご確認のうえ、ページを更新してください。',
      planUnavailable: '今はこのプランを PayPal でお支払いいただけません。ご連絡いただければ対応します。',
      createSubscriptionError: 'PayPal でご契約を開始できませんでした。少ししてからもう一度お試しください。',
      activateSubscriptionError: 'PayPal はお支払いを承認しましたが、当社側でプランを有効にできませんでした。ご連絡いただければ対応します。',
      activatedSuccess: 'プランが有効になりました。このページはまもなく更新されます。',
      buttonError: 'PayPal で問題が起きました。少ししてからもう一度お試しいただくか、ご連絡ください。',
    },
    creem: {
      payButton: 'カードでお支払い',
      starting: '安全なお支払いページを開いています...',
      error: 'お支払いページを開けませんでした。少ししてからもう一度お試しいただくか、ご連絡ください。',
      changePlanNote: '別のプランへの変更はご連絡ください。当社で手続きします。',
      disclosure:
        'カードでのお支払いは Creem（Armitage Labs OÜ）が販売者（merchant of record）として扱います。請求書は Creem が発行し、ご請求先の住所にもとづいて税を加算し、ご利用明細には Creem の名称で記載されます。サービス自体の提供は当社が行います。',
      buyerTermsLabel: 'Creem の購入規約',
      cancelNote: 'このプランを販売し請求しているのは Creem です。そのため解約は Creem で行い、お支払い時に Creem から届いたご契約の情報をお使いください。そのほうが分かりにくい場合はご連絡ください。当社から Creem に解約のご依頼をお伝えします。実際の請求を止められるのは Creem だけです。いずれの場合も、お支払い済みの期間の終わりまでご利用いただけます。',
    },
    shopify: {
      title: '請求は Shopify が行っています',
      description: 'このアカウントは PayPal ではなく Shopify App Pricing から請求されています。公開のためにストアを連携しても、それ自体は変わりません。',
      manageButton: 'Shopify でプランを管理',
      migrationPending: '請求の Shopify への切り替えを完了しているところです。少し時間がかかることがあります。しばらくしてからこのページを更新してください。',
      migrationNeedsAttention: 'Shopify のプランは有効ですが、以前の請求の締めがまだ残っています。自然に解消しない場合はご連絡ください。',
      storeConnectedTitle: 'ストアは Shopify から請求されています',
      storeConnectedDescription: 'このアカウントには Shopify ストアが連携されているため、PayPal ではなく Shopify 経由のお支払いになります。プランの選択と変更は、Shopify ストア管理画面の Go Top SEO アプリから行います。',
      appStoreLink: 'Shopify アプリストアの Go Top SEO',
      paidUntil: (date: string) => `このプランはサイト側で ${date} までお支払い済みで、その日まで有効です。`,
      paidCurrentPeriod: 'このプランはサイト側で今の期間分をお支払い済みで、この期間の終わりまで有効です。',
      renewalOff: 'PayPal では更新されません。',
      renewalStopping: 'PayPal での更新を停止しているところです。',
      afterPaidPeriod: 'そのあとも公開を続けるには、Shopify 管理画面の Go Top SEO アプリでプランをお選びください。',
    },
    unavailable: {
      title: '請求の状態を今は確認できません',
      description: 'このアカウントの請求をどの事業者が扱っているかを確認できなかったため、プランの変更を一時的に止めています。何も変更されていません。しばらくしてからこのページを更新してください。',
    },
    admin: {
      title: '管理者アカウント：すべての機能を利用できます',
      description: 'このアカウントはシステムのすべてを利用でき、請求プランは必要ありません。',
    },
  },
  trialBar: {
    // Japanese has no plural agreement and no 1-vs-many wording here, so the day
    // count is not read: 「無料トライアルは残り 3 日」 and 「残り 1 日」 are the same
    // sentence. The parameter is dropped rather than ignored, which a zero-argument
    // function may do against this signature.
    daysLeft: (): readonly [string, string] => ['無料トライアルは残り', '日'],
    lastDay: '本日が無料トライアルの最終日です',
    expired: '無料トライアルは終了しました',
    upgrade: '今すぐプランを変更',
    dismiss: '24時間は表示しない',
    label: '無料トライアル',
  },
  dashboardStart: {
    title: 'ここから始めます',
    subtitle: (domain: string) => `短いステップをいくつか進めると、このダッシュボードが ${domain} のデータで埋まります。`,
    progress: (done: number, total: number) => `${total} 件のうち ${done} 件が完了`,
    stepLabel: (n: number) => `ステップ ${n}`,
    done: '完了',
    running: '実行中',
    // The step the card's main button is for (owner's report, 10 October 2026).
    next: '次のステップ',
    // On every screen of a project whose site is not connected yet (components/layout/ConnectSiteBanner.tsx).
    connectBanner: {
      title: 'サイトがまだ連携されていません',
      body: 'これが最初のステップです。連携するまでは調査と執筆はできますが、記事をサイトに公開することはできません。連携は一度だけです。',
    },
    steps: {
      scan: {
        title: 'サイトを分析',
        body: '何を誰に提供しているのかを把握し、キーワードと競合を調べ、Google とAIの回答でサイトの足かせになっているものを確認します。数分かかります。',
        runningBody: '分析を実行しています。別の作業を続けていただけます。分析が終わりしだい、このダッシュボードが更新されます。',
        cta: 'サイトを分析',
        retry: 'もう一度試す',
        doneLink: '分析のまとめを見る',
      },
      keywords: {
        title: 'キーワードを選ぶ',
        body: 'お客様の顧客が Google で検索する語句です。それぞれについて、サイトがどこに出ているかを計測します。',
        cta: 'キーワード調査を開く',
        doneLink: 'キーワードを見る',
      },
      connect: {
        title: 'サイトを連携',
        body: 'WordPress、Wix、Shopify、またはそのほかのサイトを連携すると、記事をワンクリックで公開できます。',
        cta: 'サイトを連携',
        doneLink: '連携の設定',
      },
      article: {
        title: '最初の記事を作成',
        body: 'ご提案の中からテーマを選ぶと、確認してそのまま公開できる記事を一本作成します。',
        cta: 'テーマを選ぶ',
        doneLink: '記事を見る',
      },
    },
  },
  longActions: {
    reportPdf: {
      pending: 'PDF を作成しています。1分ほどかかることがあります。',
      done: 'レポートが出来上がり、ダウンロードされました。',
      failed: 'レポートを作成できませんでした。少ししてからもう一度お試しください。',
    },
  },
}

export {}
