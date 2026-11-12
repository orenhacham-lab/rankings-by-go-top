/**
 * The CHROME in KOREAN: the rail, the workspace switcher, the contact menu, the
 * shared words every screen reuses, the "waiting for you" rows and the home
 * screen.
 *
 * Split into parts for the same reason as the Polish and Dutch trees beside it:
 * one 400 KB module is the hardest file in the repository to edit. Each part
 * here owns WHOLE sections of the dictionary and ko/index.ts is the only place
 * that assembles them, so a key cannot appear in two parts without the guard
 * saying so.
 *
 * REGISTER (the whole ko tree follows it): 합니다체 — the formal 합니다/습니다
 * ending, with 고객님 where English says "your". Never 해요체 and never the bare
 * 해체. Korean has no polite pronoun to swap in the way Dutch has "u": the
 * politeness lives in the verb ending and in honorific suffixes (-시-), so a
 * sentence is rebuilt around it rather than having one word replaced.
 *
 * BUTTONS ARE THE EXCEPTION, as in the Polish file: a Korean interface prints a
 * bare noun or a short -기 form on a control — 저장, 취소, 사이트 연결하기 — and
 * the full 합니다체 there ("저장하시기 바랍니다") reads like a letter, not a
 * button. So controls take the short form and prose keeps 합니다체.
 *
 * TYPOGRAPHY: Korean uses ASCII spaces, period and comma, never the full-width
 * forms the ja tree uses, and 띄어쓰기 (spacing between words) is part of the
 * spelling, not decoration. A particle attaches to the word before it with no
 * space (사이트를, 구글에서). Figures use the Latin digits and a comma every
 * three places (1,200); the won sign is not used here because this product
 * charges in USD outside Israel.
 *
 * GLOSSARY. 사이트, not 프로젝트, because the English copy itself says a project
 * is one site. 글 for an article, in every part of this tree: 아티클 is a loan the
 * language does not need here and 기사 reads as a news report, while 글 is what a
 * Korean site calls the piece of writing on its own blog. 키워드 for keywords and 키워드 분석 for keyword research, 검색 순위
 * for rankings, 백링크 for backlinks, 내부 링크 for internal links, 콘텐츠 for
 * content, 플러그인 for a plug-in, 대시보드 for the dashboard. Google's own
 * product names stay in Google's words: Google Search Console, Google 지도,
 * Google 비즈니스 프로필, SEO. The brand stays "Go Top SEO".
 *
 * NO PLURAL. Korean has no grammatical plural, so a count reads the same at one
 * and at many and there is no plural helper beside this file: what changes is
 * the counter (개, 건, 회), chosen by what is counted, never by the number.
 */
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const chromeKo: DeepPartial<DashboardDictionary> = {
  sidebar: {
    logoAlt: 'Go Top SEO 로고',
    groupMain: '전체',
    groupResearch: '분석과 콘텐츠',
    groupMonitoring: '추적과 리포트',
    groupAccount: '계정',
    dashboard: '대시보드',
    clients: '고객사',
    projects: '사이트',
    keywords: '키워드',
    keywordResearch: '키워드 분석',
    siteLinks: '링크',
    mapsPosts: 'Google 지도 게시물',
    aiVisibility: 'AI 가시성',
    projectSettings: '사이트 설정',
    reports: '리포트',
    siteHealth: '사이트 상태',
    affiliate: '파트너 프로그램',
    billing: '결제',
    system: '시스템',
    articleManagement: '사이트의 글',
    blogPlan: '글 대기열',
    connectionStatus: '연결 상태',
    errorLogs: '오류 기록',
    support: 'WhatsApp 지원',
    supportAria: 'WhatsApp 지원 (새 창에서 열립니다)',
    accessibility: '접근성 안내',
    accessibilityAria: '접근성 안내 (새 창에서 열립니다)',
    logout: '로그아웃',
    navLabel: '주요 메뉴',
    skipToContent: '본문으로 건너뛰기',
    openMenu: '메뉴 열기',
    closeMenu: '메뉴 닫기',
    themeLabel: '화면',
    languageLabel: '언어',
  },
  workspace: {
    label: '사이트:',
    unnamed: '이름 없음',
    loading: '사이트를 불러오고 있습니다…',
    loadError: '사이트를 불러오지 못했습니다. 다시 시도',
    searchPlaceholder: '사이트 검색…',
    noMatches: '그 이름의 사이트가 없습니다',
    create: '새 사이트',
    createFirst: '첫 사이트를 만들어 주십시오',
    manage: '사이트 관리',
    projectsLoadError: '지금은 사이트가 불러와지지 않습니다. 일시적인 문제입니다.',
    retry: '다시 시도',
    loadingProject: '사이트를 불러오고 있습니다…',
    noProjectTitle: '아직 사이트가 없습니다',
    noProjectBody: '사이트마다 자체 대시보드, 자체 키워드, 자체 설정을 갖습니다. 하나를 만드시면 모든 화면이 그 사이트의 데이터를 보여 줍니다.',
    noProjectCta: '사이트 만들기',
    projectLoadError: '이 사이트를 불러오지 못했습니다',
    projectMissing: '이 사이트를 찾을 수 없습니다. 위에서 다른 사이트를 선택해 주십시오.',
    createLimitReached: (used: number, limit: number) =>
      limit === 0 ? '현재 플랜에는 사이트가 포함되어 있지 않습니다.' : `플랜의 사이트를 모두 쓰고 계십니다 (${limit}개 중 ${used}개).`,
    createLimitCount: (used: number, limit: number) => `${used}/${limit}`,
    upgrade: '플랜 변경',
    listLabel: '고객님의 사이트',
  },
  contact: {
    label: '문의',
    menuLabel: '문의',
    whatsapp: 'WhatsApp',
    whatsappMessage: (domain: string) => (domain ? `안녕하세요, ${domain} 관련해 도움이 필요합니다` : '안녕하세요, 도움이 필요합니다'),
    phone: (number: string) => `전화: ${number}`,
    email: (address: string) => `${address}(으)로 메일 보내기`,
    opensNewTab: '(새 탭에서 열립니다)',
    // The floating "free demo" button (w11).
    demo: '무료 데모',
    demoAria: 'WhatsApp으로 무료 데모 요청하기',
    demoMessage: (domain: string) => (domain ? `안녕하세요, ${domain}에 대한 Go Top SEO 무료 데모를 받고 싶습니다` : '안녕하세요, Go Top SEO 무료 데모를 받고 싶습니다'),
  },
  common: {
    close: '닫기',
    menu: '메뉴',
    logout: '로그아웃',
    loading: '불러오는 중...',
    save: '저장',
    cancel: '취소',
    edit: '수정',
    delete: '삭제',
    activate: '켜기',
    deactivate: '끄기',
    active: '사용 중',
    inactive: '사용 안 함',
    actions: '작업',
    status: '상태',
    saveError: '저장하지 못했습니다',
    back: '뒤로',
    notFound: '찾을 수 없습니다',
    notAvailable: '해당 없음.',
    lightMode: '밝은 화면',
    darkMode: '어두운 화면',
    switchToDarkMode: '어두운 화면으로 전환',
    switchToLightMode: '밝은 화면으로 전환',
    // Google's own product names, left as Google writes them.
    engineGoogleSearch: 'Google Organic',
    engineGoogleMaps: 'Google 지도',
    searchTypeGoogleDesktop: 'Google Organic · 데스크톱',
    searchTypeGoogleMobile: 'Google Organic · 모바일',
    deviceDesktop: '데스크톱',
    deviceMobile: '모바일',
    deviceDefault: '기본값',
  },
  uiKit: {
    noticeMore: '외 {n}건',
  },
  connectionStatus: {
    loadFailed: '지금은 이 연결을 확인할 수 없습니다. 연결이 끊겼다는 뜻은 아닙니다.',
    retry: '다시 시도',
  },
  waitingCard: {
    title: '승인을 기다리는 항목',
    connection: '사이트 연결이 끊겼습니다. 글과 수정을 게시할 수 없습니다',
    connectionAction: '다시 연결',
    site: '사이트를 연결해 주십시오. 첫 글까지 남은 것은 이것뿐입니다',
    siteAction: '사이트 연결하기',
    gsc: 'Google Search Console을 연결하시면 검색어, 클릭 수, 게재순위 같은 Google의 실제 데이터를 여기에서 보실 수 있습니다',
    gscAction: 'Search Console 연결하기',
    articles: (n: number) => `글 ${n}개가 완성되어 승인을 기다리고 있습니다`,
    articlesAction: '글 보기',
    topics: (n: number) => `새 주제 ${n}개가 승인을 기다리고 있습니다`,
    topicsAction: '주제 보기',
    queueDry: (date: string) => `승인하지 않으시면 ${date}부터 대기열이 비어 있습니다`,
    fixes: (n: number) => `사이트에 적용할 안전한 수정 ${n}건이 준비됐습니다`,
    fixesAction: '수정 보기',
  },
  topBarActions: {
    settings: '사이트 설정',
    notifications: '알림',
    notificationsCount: (n: number) => (n === 0 ? '알림: 대기 중인 항목 없음' : `알림: ${n}건 대기 중`),
    title: '승인을 기다리는 항목',
    empty: '지금 대기 중인 항목이 없습니다',
    emptyBody: '승인을 기다리는 글과 주제, 이미 준비된 안전한 수정, 끊어진 사이트 연결이 여기에 표시됩니다. 아직 연결하지 않으신 사이트나 Search Console도 연결될 때까지 여기에 남아 있습니다.',
  },
  railWaiting: {
    aria: (n: number) => `${n}건 대기 중`,
  },
  home: {
    title: '대시보드',
    subtitle: '지난 방문 이후',
    keywords: '키워드',
    keywordsSource: '이 사이트에서 추적 중',
    scansPerformed: '측정 횟수',
    scansSource: '사이트를 만든 뒤부터',
    latestScans: '최근 측정',
    viewAll: '전체 보기',
    noScans: '아직 측정 없음',
    notStarted: '아직 시작하지 않음',
    quickLinks: '바로 가기',
    researchSub: '해 볼 만한 새 키워드를 찾습니다',
    keywordsSub: '순위와 변동',
    excelAndPdf: 'Excel과 PDF',
    settingsSub: '연결과 업체 정보',
    majorImprovements: '가장 많이 오른 키워드',
    noRecentImprovements: '최근 상승 없음',
    majorDrops: '가장 많이 내려간 키워드',
    noRecentDrops: '최근 하락 없음',
    targets: '목표',
    loading: '대시보드를 불러오는 중...',
    loadError: '이 사이트의 데이터를 불러오지 못했습니다.',
  },
}
