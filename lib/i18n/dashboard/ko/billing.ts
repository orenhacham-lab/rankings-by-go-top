/**
 * Reports (Google rankings and AI visibility), the first-run onboarding tour,
 * the billing and plans screen (PayPal, Creem, Shopify billing, cancel
 * renewal), the trial bar, the "start here" checklist on the dashboard and the
 * long-running action messages, in KOREAN.
 *
 * Register as set out in chrome.ts.
 *
 * PRICES. Nothing here states an amount: every plan line comes from
 * PLAN_CATALOG through planLimitLines/trialLimitLines, so a Korean card can
 * never promise more than the server grants — and it can never show a currency
 * the account is not billed in. Outside Israel the plans are sold in US DOLLARS
 * plus tax; there has never been a won price and this file must not invent one.
 *
 * WHO SELLS. Card payments are sold by Creem (Armitage Labs OÜ) as merchant of
 * record: under cl. 3.2 of its Merchant Terms it executes the resale in its own
 * name, and cl. 3.7 obliges us to say so to the buyer BEFORE checkout. The
 * Korean disclosure below therefore names Creem as the seller of this purchase.
 *
 * WHAT IT MUST NOT SAY. Not one word to the buyer about who remits Korean VAT.
 * "Creem is the seller of record" is a fact from its contract; "Korean VAT is
 * handled" is a conclusion, and a conclusion is not published to a buyer. The
 * Polish block beside this one names the billing-address tax rule; the Korean
 * one deliberately does not.
 *
 * WITHDRAWAL. The Korean right is SEVEN days under 전자상거래법 art. 17, not the
 * fourteen days EU and UK consumer law gives, and cl. 3.4.8 leaves consumer
 * rights with us — so the sentence below is written to Korean law and the
 * 14-day wording is never carried over.
 */
import { planLimitLines, trialLimitLines, CHECKS_EXPLAINER } from '@/lib/plans/features'
import type { DashboardDictionary } from '../he'
import type { DeepPartial } from '../merge'

export const billingKo: DeepPartial<DashboardDictionary> = {
  reports: {
    title: '리포트',
    subtitle: 'Google 순위와 AI 답변 가시성을, 내려받아 전달하실 수 있는 리포트로 제공합니다',
    onDemandTitle: '필요할 때 만드는 리포트',
    onDemandBody: '리포트 종류를 고르시면 가장 최신 데이터로 불러옵니다. PDF로 내려받으시거나 Excel로 내보내실 수 있습니다.',
    googleReport: 'Google 순위 리포트',
    reportType: '리포트 종류',
    googleReportType: 'Google 순위 (자연 검색 및 지도)',
    aiReportType: 'AI 답변 가시성',
    loadingReportData: '리포트 데이터를 불러오는 중...',
    loading: '불러오는 중...',
    exportExcel: 'Excel로 내보내기',
    downloadReport: '리포트 내려받기',
    nothingToDownload: '지금 내려받을 것이 없습니다. 첫 측정 뒤에 리포트가 채워집니다.',
    generatedOn: '생성',
    excelExportWorkInProgress: 'AI 답변 가시성 리포트의 Excel 내보내기는 아직 제공되지 않습니다',
    loadAIReportFirst: 'AI 답변 가시성 리포트를 먼저 불러와 주십시오',
    loadGoogleReportFirst: 'Google 순위 리포트를 먼저 불러와 주십시오',
    downloadError: '리포트를 내려받는 중 오류가 발생했습니다',
    reportFilename: '리포트',
    rankingsLabel: '순위',
    google: {
      totalKeywords: '전체 키워드',
      found: '노출',
      notFound: '미노출',
      coverage: 'Google에서 노출',
      currentRankings: '현재 순위',
      keyword: '키워드',
      engine: '엔진',
      ranking: '순위',
      change: '변동',
      noKeywordsInReport: '리포트에 키워드가 없습니다',
      emptyTitle: '추적 중인 키워드가 생기면 이 리포트가 채워집니다',
      emptyBody: '추적할 키워드를 몇 개 추가해 주시면, 첫 측정 뒤에 순위와 변동이 여기에 표시됩니다.',
      emptyAction: '키워드 선택',
    },
    ai: {
      aiScans: 'AI 엔진 점검',
      aiQueries: 'AI 질문',
      mentions: '언급',
      mentionRate: '언급 비율',
      domainCited: '도메인이 출처로 인용됨',
      citationRate: '인용 비율',
      activeEngines: '사용 중인 엔진',
      overallVisibility: '전체 가시성',
      performanceByEngine: '엔진별 결과',
      scans: '점검',
      citations: '출처',
      aiQueryResults: 'AI 질문 결과',
      query: '질문',
      engine: '엔진',
      mentioned: '언급됨',
      domainCited2: '도메인이 출처로 인용됨',
      citations2: '출처',
      date: '날짜',
      yes: '예',
      no: '아니요',
      noResultsInReport: '리포트에 결과가 없습니다',
      emptyTitle: 'AI 엔진 첫 점검 뒤에 이 리포트가 채워집니다',
      emptyBody: 'AI 답변 가시성 점검을 실행하시면 엔진별 언급과 출처가 여기에 표시됩니다.',
      emptyAction: 'AI 답변 가시성 점검하기',
      showingResults: (showing: number, total: number) => `전체 ${total}건 중 ${showing}건 표시`,
      aiVisibilityReport: 'AI 답변 가시성 리포트',
    },
  },
  onboarding: {
    title: '환영합니다, 시작해 보겠습니다',
    subtitle: '첫 단계를 함께 지나가겠습니다',
    steps: {
      createProject: {
        title: '새 사이트 추가',
        description: '사이트마다 별도 프로젝트가 됩니다. 화면 위쪽의 목록에서 사이트를 전환하시거나 새로 만드실 수 있습니다.',
        action: '사이트 만들기',
      },
      keywordResearch: {
        title: '키워드 분석',
        description: '여기에서 키워드 아이디어를 찾고, 검색량과 그 추이를 보시고, 사이트에 바로 추가하실 수 있습니다.',
        action: '키워드 분석으로 이동',
      },
      generateReports: {
        title: '리포트',
        description: '여기에서 고객사에 드릴 SEO·GEO 리포트를 만드십니다. AI 답변 가시성, 순위, 경쟁사, 권장 사항이 담깁니다.',
        action: '리포트로 이동',
      },
    },
    buttons: {
      next: '다음',
      skip: '건너뛰기',
      done: '완료',
      skipAll: '전체 건너뛰기',
    },
  },
  billing: {
    title: '구독 플랜',
    subtitle: '필요한 플랜을 선택해 주십시오',
    trialActive: '무료 체험이 진행 중입니다.',
    validUntilPrefix: '유효 기간',
    onPlanPrefix: '현재 사용 중인 플랜',
    renewalPrefix: '갱신',
    recommended: '추천',
    currentPlan: '현재 플랜',
    perMonth: '월',
    trialName: '무료 체험',
    planLabels: {
      trial: '체험',
      regular: 'Basic',
      advanced: 'Advanced',
      premium: 'Premium',
      large_agency: 'Agency',
    },
    // Derived from PLAN_CATALOG, exactly as the Hebrew and English cards are, so
    // a Korean card cannot promise more than the server grants.
    features: {
      trial: trialLimitLines('ko'),
      regular: planLimitLines('regular', 'ko'),
      advanced: planLimitLines('advanced', 'ko'),
      premium: planLimitLines('premium', 'ko'),
      large_agency: planLimitLines('large_agency', 'ko'),
    },
    keywordCheckNote: `${CHECKS_EXPLAINER['ko']} 글 한도는 계정의 모든 사이트가 함께 사용하며, 모든 한도는 매월 갱신됩니다. 쓰지 않은 분량은 다음 달로 넘어가지 않습니다.`,
    trialNoChargeNotice: '결제 수단을 등록하지 않으셨고, 자동으로 결제되는 것도 없습니다.',
    marketPrompt: {
      currencyName: { ILS: '이스라엘 셰켈 (₪)', USD: '미국 달러 ($)' },
      byLocation: (currency: string) => `요금은 고객님의 위치에 따라 ${currency}(으)로 표시됩니다. 통화는 첫 결제 시 확정됩니다.`,
      locked: (currency: string) => `이 계정은 ${currency}(으)로 결제됩니다.`,
    },
    manage: {
      title: '구독 관리',
      description: '갱신을 해지하셔도 이미 결제된 기간이 끝날 때까지 플랜은 그대로 유지됩니다.',
      cancelButton: '갱신 해지',
      cancelling: '해지하고 있습니다...',
      confirmCancelTitle: '갱신을 해지하시겠습니까?',
      confirmCancel: '이미 결제된 기간이 끝날 때까지 이용하실 수 있고, 그 뒤에는 결제되지 않습니다.',
      confirmCancelAction: '갱신 해지',
      keepRenewal: '플랜 유지',
      cancelSuccess: '구독 갱신을 해지했습니다. 결제된 기간이 끝날 때까지 계속 이용하실 수 있습니다.',
      cancelError: '갱신을 해지하지 못했습니다. 잠시 뒤에 다시 시도하시거나 저희에게 알려 주시면 저희가 처리해 드립니다.',
      contactToCancel: '갱신을 해지하시려면 저희에게 알려 주십시오. 저희가 플랜을 종료해 드립니다. 다른 회사가 구독을 결제하고 있는 경우에는 해지가 이루어지는 곳을 알려 드리고, 고객님의 요청을 그곳으로 전달해 드립니다.',
      cancelAtMarketplace: (seller: string) => `이 플랜은 ${seller}에서 구매하셨고 결제도 그곳에서 이루어집니다. 갱신 해지는 ${seller} 계정에서 하시며, 결제된 기간이 끝날 때까지 계속 이용하실 수 있습니다. ${seller}에 연락이 닿지 않으시면 저희에게 알려 주십시오. 저희 쪽에서 플랜을 종료해 드립니다. 다만 결제 자체를 멈출 수 있는 곳은 ${seller}뿐입니다.`,
      marketplacePolicyLink: (seller: string) => `${seller} 약관 및 정책`,
      renewalAlreadyCancelled: '갱신이 해지됐습니다. 다음 날짜까지 계속 이용하실 수 있습니다:',
    },
    paypal: {
      loading: 'PayPal을 불러오는 중...',
      notConfigured: '지금은 PayPal 결제를 이용하실 수 없습니다. 잠시 뒤에 다시 시도하시거나 저희에게 알려 주시면 도와 드립니다.',
      sdkLoadFailed: 'PayPal을 불러오지 못했습니다. 인터넷 연결을 확인하신 뒤 페이지를 새로 고쳐 주십시오.',
      planUnavailable: '이 플랜은 지금 PayPal로 결제하실 수 없습니다. 저희에게 알려 주시면 도와 드립니다.',
      createSubscriptionError: 'PayPal에서 구독을 시작하지 못했습니다. 잠시 뒤에 다시 시도해 주십시오.',
      activateSubscriptionError: 'PayPal 결제는 승인됐지만 저희 쪽에서 플랜을 활성화하지 못했습니다. 저희에게 알려 주시면 바로잡아 드립니다.',
      activatedSuccess: '플랜이 활성화됐습니다. 이 화면이 곧 새로 고쳐집니다.',
      buttonError: 'PayPal에서 문제가 있었습니다. 잠시 뒤에 다시 시도하시거나 저희에게 알려 주시면 도와 드립니다.',
    },
    withdrawal: {
      label:
        '전자상거래법이 소비자에게 주는 7일의 청약철회 기간이 끝나기 전에 Go Top SEO가 서비스 제공을 즉시 시작하도록 요청하며, 서비스가 모두 제공된 뒤에는 그 권리가 소멸한다는 점을 안내받았음을 확인합니다.',
      requiredNote: '위 항목을 확인하시면 결제 수단이 표시됩니다. 그 전에는 어떤 금액도 청구되지 않습니다.',
      policyLabel: '청약철회권 전문은 해지 및 환불 정책에 있습니다',
    },
    creem: {
      payButton: '카드로 결제',
      starting: '안전한 결제 페이지를 열고 있습니다...',
      error: '결제 페이지를 열지 못했습니다. 잠시 뒤에 다시 시도하시거나 저희에게 알려 주시면 도와 드립니다.',
      changePlanNote: '다른 플랜으로 바꾸시려면 저희에게 알려 주십시오. 저희가 처리해 드립니다.',
      disclosure:
        '카드 결제는 Creem(Armitage Labs OÜ)을 통해 이루어지며, 이 구매의 판매자는 Creem입니다. 매매 계약은 Creem과 체결되고, 청구서도 Creem이 발행하며, 명세서에는 Creem 이름으로 표시됩니다. 서비스 자체는 저희가 제공합니다.',
      buyerTermsLabel: 'Creem 구매 약관',
      cancelNote: '이 플랜을 판매하고 결제하는 곳은 Creem이므로, 해지는 결제 시 Creem이 전달한 구독 정보를 바탕으로 Creem에서 이루어집니다. 더 편하시면 저희에게 알려 주시면 해지 요청을 Creem에 전달해 드립니다. 결제 자체를 멈출 수 있는 곳은 Creem뿐입니다. 어느 경우에도 결제된 기간이 끝날 때까지는 계속 이용하실 수 있습니다.',
    },
    shopify: {
      title: '결제는 Shopify를 통해 이루어집니다',
      description: '이 계정은 PayPal이 아니라 Shopify App Pricing으로 결제됩니다. 게시를 위해 쇼핑몰을 연결하셔도 이 점은 달라지지 않습니다.',
      manageButton: 'Shopify에서 플랜 관리',
      migrationPending: 'Shopify 결제 연결을 아직 마무리하고 있습니다. 잠시 걸릴 수 있으니 조금 뒤에 이 화면을 새로 고쳐 주십시오.',
      migrationNeedsAttention: 'Shopify 플랜은 활성화됐지만 이전 결제를 아직 정리하고 있습니다. 저절로 해결되지 않으면 저희에게 알려 주십시오.',
      storeConnectedTitle: '고객님의 쇼핑몰은 Shopify를 통해 결제됩니다',
      storeConnectedDescription: '이 계정에 Shopify 쇼핑몰이 연결돼 있어 결제가 PayPal이 아니라 Shopify를 통해 이루어집니다. 플랜은 Shopify 쇼핑몰 관리자 화면의 Go Top SEO 앱에서 선택하고 변경하십니다.',
      appStoreLink: 'Shopify App Store의 Go Top SEO',
      paidUntil: (date: string) => `플랜은 ${date}까지 결제되어 있으며 그날까지 유지됩니다.`,
      paidCurrentPeriod: '플랜은 현재 기간에 대해 결제되어 있으며 그 기간이 끝날 때까지 유지됩니다.',
      renewalOff: 'PayPal을 통한 갱신은 이루어지지 않습니다.',
      renewalStopping: 'PayPal 갱신을 해제하고 있습니다.',
      afterPaidPeriod: '그 뒤에도 계속 게시하시려면 Shopify 관리자 화면의 Go Top SEO 앱에서 플랜을 선택해 주십시오.',
    },
    unavailable: {
      title: '지금은 결제 상태를 확인할 수 없습니다',
      description: '이 계정의 결제를 어느 사업자가 담당하는지 확인하지 못해 플랜 변경을 잠시 멈췄습니다. 바뀐 것은 없습니다. 조금 뒤에 이 화면을 새로 고쳐 주십시오.',
    },
    admin: {
      title: '관리자 계정: 전체 권한',
      description: '이 계정은 시스템 전체 권한을 가지며 결제 플랜이 필요하지 않습니다.',
    },
  },
  trialBar: {
    // The bar prints [prefix, suffix] around the number. Korean puts the unit
    // after it, so the prefix is empty and the suffix carries the words.
    daysLeft: (): readonly [string, string] => ['무료 체험 기간이', '일 남았습니다'],
    lastDay: '오늘이 무료 체험 마지막 날입니다',
    expired: '무료 체험이 끝났습니다',
    upgrade: '지금 플랜 변경',
    dismiss: '24시간 동안 숨기기',
    label: '무료 체험',
  },
  dashboardStart: {
    title: '여기에서 시작합니다',
    subtitle: (domain: string) => `짧은 몇 단계만 거치면 이 대시보드가 ${domain}의 데이터로 채워집니다.`,
    progress: (done: number, total: number) => `${total}단계 중 ${done}단계 완료`,
    stepLabel: (n: number) => `${n}단계`,
    done: '완료',
    running: '진행 중',
    // The step the card's main button is for (owner's report, 10 October 2026).
    next: '다음 단계',
    // On every screen of a project whose site is not connected yet (components/layout/ConnectSiteBanner.tsx).
    connectBanner: {
      title: '사이트가 아직 연결되지 않았습니다',
      body: '이것이 첫 단계입니다. 사이트가 연결되기 전에도 분석과 작성은 할 수 있지만, 글을 그곳에 게시할 수는 없습니다. 연결은 한 번만 하시면 됩니다.',
    },
    steps: {
      scan: {
        title: '사이트 분석',
        body: '업체가 무엇을 누구에게 제공하는지 파악하고, 키워드와 경쟁사를 찾고, Google과 AI 답변에서 사이트를 가로막는 요소를 점검합니다. 몇 분 걸립니다.',
        runningBody: '분석이 진행되고 있습니다. 다른 일을 계속하셔도 되며, 분석이 끝나면 이 화면이 새로 고쳐집니다.',
        cta: '사이트 분석하기',
        retry: '다시 시도',
        doneLink: '분석 요약 보기',
      },
      keywords: {
        title: '키워드 선택',
        body: '고객님의 고객이 Google에서 검색하는 표현입니다. 키워드마다 사이트가 어디에 나오는지 측정해 드립니다.',
        cta: '키워드 분석 열기',
        doneLink: '내 키워드 보기',
      },
      connect: {
        title: '사이트 연결',
        body: 'WordPress, Wix, Shopify 또는 다른 사이트를 연결해 주시면 글이 클릭 한 번으로 게시됩니다.',
        cta: '사이트 연결하기',
        doneLink: '연결 설정',
      },
      article: {
        title: '첫 글',
        body: '제안된 주제 가운데 하나를 고르시면, 읽고 바로 게시하실 수 있는 완성된 글을 써 드립니다.',
        cta: '주제 선택',
        doneLink: '내 글 보기',
      },
    },
  },
  longActions: {
    reportPdf: {
      pending: 'PDF를 만들고 있습니다. 최대 1분 걸릴 수 있습니다.',
      done: '리포트가 준비되어 내려받았습니다.',
      failed: '리포트를 만들지 못했습니다. 잠시 뒤에 다시 시도해 주십시오.',
    },
  },
}

export {}
