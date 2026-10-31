/**
 * The CHROME in JAPANESE: the rail, the workspace switcher, the contact menu,
 * the shared words every screen reuses, the "waiting for you" rows and the home
 * screen.
 *
 * Split out of one 400 KB file on purpose — the Spanish dictionary is a single
 * module and it is the hardest file in the repository to edit. Each part here
 * names whole sections of the dictionary, and ja/index.ts is the only place
 * that assembles them, so nothing is merged twice and a key cannot appear in
 * two parts without the compiler saying so.
 *
 * REGISTER (the whole ja tree follows it): plain polite です・ます throughout,
 * the register a Japanese business tool is written in. NOT 謙譲語: no
 * 〜させていただきます, no いたします chains, no 弊社. The reader is addressed as
 * お客様 only where an owner must be named, and is otherwise left implicit, the
 * way Japanese does it — 「サイトを選びます」 rather than 「あなたのサイトを選んでください」.
 * Buttons and menu entries are NOUN PHRASES, never sentences: 保存, キャンセル,
 * 記事の確認. A 〜してください imperative is kept for the few places where the
 * screen really is asking.
 *
 * TYPOGRAPHY. Full-width punctuation — 。、「」：・ — and NO space between
 * Japanese words. A space appears only around Latin script and numerals where
 * Japanese typesetting expects one.
 *
 * GLOSSARY (fixed across the whole ja tree): 検索順位 for rank, 順位の計測 for
 * rank tracking, 自然検索 for organic search, キーワード for keyword,
 * 検索ボリューム for search volume, 被リンク for backlink, 内部リンク for internal
 * link, 孤立ページ for orphan page, 構造化データ for structured data, 代替テキスト
 * for alt text, メタディスクリプション for meta description, AIでの可視性 for AI
 * visibility, AIエンジン for an AI engine, サイトの診断 for site health,
 * レポート for report, ダッシュボード for dashboard. "Site", never "project":
 * the English copy itself says a project is one site, and a Japanese owner
 * reads サイト. The brand stays "Go Top SEO", and Google's own product names
 * stay in Google's words: Google Search Console, Googleマップ,
 * Googleビジネスプロフィール, SEO.
 *
 * COUNTERS. Japanese counts with a counter word, so 記事 takes 本, a pending
 * item takes 件 and a site takes サイト. Japanese has no plural, so the n === 1
 * and n > 1 branches of a count function read the same — the signature is kept
 * so the dictionary answers the same shape every language answers.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const chromeJa: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Go Top SEO のロゴ',
    groupMain: '基本',
    groupResearch: '調査とコンテンツ',
    groupMonitoring: '計測とレポート',
    groupAccount: 'アカウント',
    dashboard: 'ダッシュボード',
    clients: 'クライアント',
    projects: 'サイト',
    keywords: 'キーワード',
    keywordResearch: 'キーワード調査',
    siteLinks: 'リンク',
    mapsPosts: 'Googleマップへの投稿',
    aiVisibility: 'AIでの可視性',
    projectSettings: 'サイトの設定',
    reports: 'レポート',
    siteHealth: 'サイトの診断',
    affiliate: 'パートナープログラム',
    billing: 'お支払い',
    system: 'システム',
    articleManagement: 'サイトの記事',
    blogPlan: '記事のキュー',
    connectionStatus: '連携の状態',
    errorLogs: 'エラーログ',
    support: 'WhatsAppサポート',
    supportAria: 'WhatsAppサポート（新しいウィンドウで開きます）',
    accessibility: 'アクセシビリティ方針',
    accessibilityAria: '当社のアクセシビリティ方針（新しいウィンドウで開きます）',
    logout: 'ログアウト',
    navLabel: 'メインナビゲーション',
    skipToContent: '本文へ移動',
    openMenu: 'メニューを開く',
    closeMenu: 'メニューを閉じる',
    themeLabel: 'テーマ',
    languageLabel: '言語',
  },
  workspace: {
    label: 'サイト：',
    unnamed: '名称未設定',
    loading: 'サイトを読み込んでいます…',
    loadError: 'サイトを読み込めませんでした。もう一度お試しください',
    searchPlaceholder: 'サイトを検索…',
    noMatches: 'その名前のサイトはありません',
    create: '新しいサイト',
    createFirst: '最初のサイトを作成',
    manage: 'サイトの管理',
    projectsLoadError: '今はサイトを読み込めません。一時的なものです。',
    retry: 'もう一度試す',
    loadingProject: 'サイトを読み込んでいます…',
    noProjectTitle: 'サイトがまだありません',
    noProjectBody: 'サイトごとに専用のダッシュボード、キーワード、設定があります。サイトを一つ作成すると、すべての画面がそのサイトのデータを表示します。',
    noProjectCta: 'サイトを作成',
    projectLoadError: 'このサイトを読み込めませんでした',
    projectMissing: 'このサイトが見つかりません。上の切り替えから別のサイトを選んでください。',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? '現在のプランにはサイトが含まれていません。' : `プランのサイト数をすべて使用しています（${limit} サイトのうち ${used} サイト）。`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: 'プランの変更',
    listLabel: 'サイト一覧',
  },
  contact: {
    label: 'お問い合わせ',
    menuLabel: '連絡先',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `こんにちは。${domain} について助けが必要です` : 'こんにちは。助けが必要です'),
    phone: (number: string) => `${number} に電話`,
    email: (address: string) => `${address} にメール`,
    opensNewTab: '（新しいタブで開きます）',
    // The floating "free demo" button (w11).
    demo: '無料デモ',
    demoAria: 'WhatsApp で無料デモを依頼',
    demoMessage: (domain: string) => (domain ? `こんにちは。${domain} について Go Top SEO の無料デモを希望します` : 'こんにちは。Go Top SEO の無料デモを希望します'),
  },
  common: {
    close: '閉じる',
    menu: 'メニュー',
    logout: 'ログアウト',
    loading: '読み込み中...',
    save: '保存',
    cancel: 'キャンセル',
    edit: '編集',
    delete: '削除',
    activate: '有効にする',
    deactivate: '無効にする',
    active: '有効',
    inactive: '無効',
    actions: '操作',
    status: '状態',
    saveError: '保存できませんでした',
    back: '戻る',
    notFound: '見つかりません',
    notAvailable: 'ありません。',
    lightMode: 'ライトテーマ',
    darkMode: 'ダークテーマ',
    switchToDarkMode: 'ダークテーマに切り替える',
    switchToLightMode: 'ライトテーマに切り替える',
    // Google's own product names, left as Google writes them.
    engineGoogleSearch: 'Google 自然検索',
    engineGoogleMaps: 'Googleマップ',
    searchTypeGoogleDesktop: 'Google 自然検索・パソコン',
    searchTypeGoogleMobile: 'Google 自然検索・スマートフォン',
    deviceDesktop: 'パソコン',
    deviceMobile: 'スマートフォン',
    deviceDefault: '既定',
  },
  uiKit: {
    noticeMore: 'ほかに {n} 件',
  },
  connectionStatus: {
    loadFailed: '今はこの連携を確認できません。連携が切れたという意味ではありません。',
    retry: 'もう一度試す',
  },
  waitingCard: {
    title: '確認をお待ちしています',
    connection: 'サイトとの連携が切れています。記事も修正も公開できません',
    connectionAction: '再連携',
    site: 'サイトを連携してください。最初の記事を公開するために足りないのはこれだけです',
    siteAction: 'サイトを連携',
    gsc: 'Google Search Console を連携すると、検索、クリック、順位といった Google の実データがここに表示されます',
    gscAction: 'Search Console を連携',
    articles: (n: number) => `${n} 本の記事が公開前の承認をお待ちしています`,
    articlesAction: '記事の確認',
    topics: (n: number) => `${n} 件の新しいテーマが承認をお待ちしています`,
    topicsAction: 'テーマの確認',
    queueDry: (date: string) => `承認がないと、${date} からキューが空になります`,
    fixes: (n: number) => `${n} 件の安全な修正がサイトに用意できています`,
    fixesAction: '修正の確認',
  },
  topBarActions: {
    settings: 'サイトの設定',
    notifications: 'お知らせ',
    notificationsCount: (n: number) => (n === 0 ? 'お知らせ：待っているものはありません' : `お知らせ：${n} 件が待っています`),
    title: '確認をお待ちしています',
    empty: '今は待っているものはありません',
    emptyBody: '承認をお待ちしている記事とテーマ、すでに用意できている安全な修正、そしてサイトとの連携が切れたことがここに表示されます。まだ連携していないサイトや Search Console も、連携が済むまでここに表示されます。',
  },
  railWaiting: {
    aria: (n: number) => `${n} 件が待っています`,
  },
  home: {
    title: 'ダッシュボード',
    subtitle: '前回の訪問から',
    keywords: 'キーワード',
    keywordsSource: 'このサイトで計測中',
    scansPerformed: '実施した計測',
    scansSource: 'サイトの作成から',
    latestScans: '最近の計測',
    viewAll: 'すべて表示',
    noScans: '計測はまだありません',
    notStarted: 'まだ開始していません',
    quickLinks: 'ショートカット',
    researchSub: '狙える新しいキーワードを見つける',
    keywordsSub: '検索順位とその変化',
    excelAndPdf: 'Excel と PDF',
    settingsSub: '連携と事業の情報',
    majorImprovements: '主な上昇',
    noRecentImprovements: '最近の上昇はありません',
    majorDrops: '主な下降',
    noRecentDrops: '最近の下降はありません',
    targets: '対象',
    loading: 'ダッシュボードを読み込んでいます...',
    loadError: 'このサイトのデータを読み込めませんでした。',
  },
}
