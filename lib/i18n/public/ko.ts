/**
 * The Korean public site's shared words: navigation, footer, the About page,
 * the articles index, the cookie notice, the contact menu and the accessibility
 * menu. Same shape as `he`, `en`, `es`, `pt-BR`, `fr`, `it`, `ja`, `de`, `nl`
 * and `pl`, which is what the public-dictionary QA proves — a key present in
 * Hebrew and missing here is a failure, not a silent fall back to another
 * language.
 *
 * REGISTER. 해요체 is too soft for a business product and 하십시오체 too stiff
 * for an interface, so the prose is 합니다체 ("측정합니다", "확인할 수 있습니다")
 * and the labels are bare noun phrases ('요금', '문의'), which is how Korean
 * interfaces label controls. No 당신: Korean drops the second person where
 * English and Hebrew insist on it, and "고객님" belongs in a support reply, not
 * on every line of a marketing page.
 *
 * Established Korean SEO vocabulary, not calques: 검색 순위 for rankings,
 * 자연 검색 for organic search, 키워드, 검색량, 백링크, 내부 링크,
 * 구조화된 데이터, Google 비즈니스 프로필 (Google's own Korean name for it),
 * 대체 텍스트 for alt text, 메타 설명 for the meta description. "AI visibility"
 * is AI 가시성 and the engines are AI 엔진.
 *
 * TYPOGRAPHY, and it is the opposite of the Japanese file's. Korean DOES put
 * spaces between words, so the ASCII space and the ASCII period and comma are
 * correct here and the full-width 。、「」 of the Japanese dictionary would be
 * wrong. A latin word or product name keeps its own letters, with an ordinary
 * space around it. What Korean does share with Japanese is invisible here and
 * lives in `lib/text/segment.ts`: its spaces fall at the eojeol (phrase)
 * boundary, so particles ride along on the word they follow and a keyword is
 * segmented rather than split on whitespace.
 *
 * WHAT THIS LOCALE MAY NOT SAY. Korea's withdrawal right is seven days, not the
 * fourteen the European documents state, and until the legal thread closes the
 * VAT question the Korean tree markets and offers the trial without completing a
 * paid purchase (`lib/i18n/korean-site.ts`). Nothing in this file promises a
 * purchase, and the refund wording stays on the legal pages where the Korean
 * figure is stated once.
 */
import type { PublicDictionary } from './he'

export const ko = {
  nav: {
    home: '홈',
    pricing: '요금',
    features: '기능',
    articles: '블로그',
    freeCheck: '무료 진단',
    about: '회사 소개',
    contact: '문의',
    login: '로그인',
    startFree: '무료로 시작',
    toDashboard: '대시보드',
    menu: '메뉴',
    closeMenu: '메뉴 닫기',
    homeAria: 'Go Top SEO - 홈',
    primaryAria: '주요 메뉴',
    featuresMenu: {
      contentPublishing: {
        label: '콘텐츠 작성, 예약, 발행',
        description: 'SEO와 GEO 콘텐츠를 작성하고 예약하고 발행하면서, 순위와 가시성 변화를 한곳에서 함께 측정합니다.',
      },
      googleOrganic: {
        label: 'Google 검색 순위 측정',
        description: 'Google 검색 결과에서의 순위를 키워드별로, 지역과 언어와 기기별로, 1페이지와 2페이지까지 측정합니다.',
      },
      googleMaps: {
        label: 'Google 지도 순위 측정',
        description: 'Google 지도에서의 노출을 확인합니다. 시군구와 지역, 검색어별 순위를 정확한 좌표 기준으로 측정합니다.',
      },
      aiVisibility: {
        label: 'AI 가시성 측정',
        description: 'ChatGPT, Gemini, Perplexity, Google AI의 답변에서 우리 업체가 인용되는지 확인합니다.',
      },
      reports: {
        label: 'SEO와 GEO 리포트',
        description: '순위와 추이, 가시성 데이터를 담은 실무용 리포트를 PDF와 Excel로 내보내 고객사에 전달할 수 있습니다.',
      },
      keywordResearch: {
        label: '키워드 리서치',
        description: '측정에 추가하기 전에 키워드 아이디어와 검색량, 경쟁 정도를 먼저 확인합니다',
      },
      siteFixes: {
        label: '사이트 수정',
        description: '사이트를 진단하고 제목, 메타 설명, 이미지 대체 텍스트, 링크를 수정합니다. WordPress에서는 승인 후 클릭 한 번으로 적용됩니다.',
      },
      mapsPosts: {
        label: 'Google 지도 게시물',
        description: '사진과 버튼이 있는 게시물을 Google 비즈니스 프로필에 바로 또는 예약해 올리고, 리뷰에도 답변합니다. 손볼 수 있는 초안이 준비됩니다.',
      },
      links: {
        label: '사이트로 향하는 링크',
        description: '사이트 안의 페이지를 잇는 내부 링크, 어디에서도 연결되지 않은 고립 페이지, 그리고 등록할 가치가 있는 무료 디렉터리입니다.',
      },
      competitors: {
        label: '우리와 경쟁사',
        description: 'Google에서 어느 경쟁사가 몇 개의 키워드로 상위에 있는지, 그리고 AI 엔진이 우리 대신 누구를 인용하는지 보여줍니다.',
      },
      searchConsole: {
        label: 'Search Console 데이터',
        description: 'Google에서의 클릭수, 노출수, 평균 게재순위를 이전 기간과 비교해 확인합니다.',
      },
    },
    featureGroups: {
      measure: '측정하기',
      act: '작업하기',
      prove: '성과 보여주기',
    },
    solutions: '이런 분들께',
    solutionsMenu: {
      businesses: {
        label: '사업자',
        description: '작성하고 발행하고 측정합니다. 외주를 관리할 필요 없는 하나의 시스템입니다.',
      },
      agencies: {
        label: '대행사와 제작사',
        description: '고객사의 모든 사이트를 한곳에서 관리하고, 그대로 보낼 수 있는 PDF 리포트를 만듭니다.',
      },
      shopify: {
        label: 'Shopify 스토어',
        description: 'Shopify App Store에 있는 저희 앱입니다.',
      },
      wordpress: {
        label: 'WordPress 사이트',
        description: '글이 사이트에 바로 발행되고, 수정은 클릭 한 번으로 적용됩니다.',
      },
    },
  },
  footer: {
    tagline: 'SEO와 GEO 콘텐츠 플랫폼입니다. 콘텐츠를 작성하고 예약하고 발행하며, Google에서의 가시성과 ChatGPT, Gemini, 그 밖의 AI 엔진 답변에서의 가시성을 측정합니다.',
    pages: '페이지',
    home: '홈',
    pricing: '요금',
    articles: '블로그',
    about: '회사 소개',
    affiliates: '파트너 프로그램',
    compare: '전체 비교',
    aiCrawlers: 'AI 크롤러 진단',
    sitemap: '사이트맵',
    legal: '약관과 정책',
    privacy: '개인정보처리방침',
    terms: '이용약관',
    refundPolicy: '해지와 환불 정책',
    affiliateTerms: '파트너 프로그램 약관',
    accessibility: '접근성',
    contact: '문의',
    copyright: '© 2026 Go Top SEO. All rights reserved.',
    agencyAria: 'Go Top - 디지털 마케팅 회사',
    credit: 'GO TOP의 제품입니다',
  },
  about: {
    breadcrumb: '회사 소개',
    heroTitle1: 'Go Top SEO',
    heroTitle2: '소개',
    heroSubtitle: '디지털 분야에서 11년이 넘는 실무 경험이 있습니다. 그리고 지금은 Google 검색 순위와 AI 가시성을 추적하는 플랫폼을 만들고 있습니다.',
    storyTitle: 'Go Top이 지나온 길',
    storyPara1: '인공지능과 자동화가 넘쳐나고 큰 회사들이 추상적인 말로 이야기하는 시대에, Go Top은 다른 길을 택했습니다.',
    storyPara2: '사람의 손이 닿아 있고, 정확하고, 성과로 향하는 쪽입니다. 디지털 분야에서의 11년이 넘는 실무, 특히 기업의 자연 검색 유입과 사이트 제작, 온라인 광고 경험 위에 만들어졌습니다.',
    yearsLabel: '년의 경험',
    yearsSublabel: '디지털 분야에서',
    philosophyTitle: '우리의 생각',
    philosophyPara1: '양이 아니라 질만 봅니다. 생각이 맞는 기업과만 일하고, 그 기업에 최대한의 주의와 직접적인 연락, 꼼꼼한 대응을 씁니다.',
    philosophyPara2: 'Go Top은 클릭수나 노출수에 마음이 움직이지 않습니다. 마음이 움직이는 순간은 전화가 울리기 시작할 때입니다. 결국 진짜 의미가 있는 것은 그것이기 때문입니다.',
    qualityBadge: '양보다 질',
    whyTitle: 'Go Top SEO를 만든 이유',
    whyIntro: '많은 기업이 일반적인 순위 측정 도구를 쓰지만, 같은 문제가 계속 들려왔습니다.',
    whyProblem1Title: '비싸고 쓰기 어려운 도구',
    whyProblem1Desc: '작은 사업자를 생각해서 만든 것이 아닙니다',
    whyProblem2Title: '아무도 읽어내지 못하는 리포트',
    whyProblem2Desc: '결국 쓰이지 않는 데이터만 쌓입니다',
    whyProblem3Title: '진짜로 함께 가는 사람이 없음',
    whyProblem3Desc: '도움이 가장 필요한 순간에 하필',
    whyConclusion1Prefix: '그래서 만든 것이',
    whyConclusion1Suffix: '입니다. 우리와 똑같이 성과로 향하는 순위 측정 플랫폼입니다.',
    whyAiPara1: '그리고 최근 몇 년 사이, 검색 자체가 또 한 번 바뀌었습니다. 고객은 더 이상 익숙한 Google 검색 결과에만 의존하지 않습니다. ChatGPT와 Gemini, Perplexity, 그 밖의 AI 엔진에 묻고 추천을 바로 받습니다.',
    whyAiPara2: '그래서 Go Top SEO는 Google 검색 순위만 추적하지 않습니다. AI의 답변 안에서 우리 업체가 어떻게 등장하는지도 함께 추적합니다. 진짜 의미가 있는 것은 거기이기 때문입니다. 찾고 있는 사람의 눈에, 그 사람이 찾는 모든 곳에서 남는 일입니다.',
    featuresTitle: 'Go Top SEO가 측정하는 것',
    feature1Title: '검색 순위 측정',
    feature1Desc: 'Google 자연 검색에서의 순위를 시간의 흐름과 함께 기록합니다',
    feature2Title: 'Google 지도 측정',
    feature2Desc: '지역 검색 결과에 대한 상세한 리포트입니다',
    feature3Title: 'AI 가시성',
    feature3Desc: 'AI가 우리를 인용하는지, 도메인을 인용하는지, 그 옆에 어떤 출처가 함께 놓이는지 확인합니다',
    feature4Title: '리포트와 분석',
    feature4Desc: '진짜 의미 있는 것을 보여주는 리포트입니다. Google 자연 검색, Google 지도, 그리고 AI 가시성입니다',
    valuesTitle: 'Go Top SEO를 고르는 이유',
    value1Title: '담당자가 직접, 타협 없이',
    value1Desc: '담당자가 매달 바뀌지 않습니다. 그 사업을 파악한 전문가가 맡습니다.',
    value2Title: '완전한 투명성',
    value2Desc: '내 계정에서 무슨 일이 일어나는지, 무엇이 통하고 무엇이 통하지 않았는지, 어떻게 개선할지 언제든 알 수 있습니다.',
    value3Title: '성과로 이어지는 전문성',
    value3Desc: 'Go Top은 유행어를 늘어놓지 않습니다. 실제 성과를 전합니다.',
    value4Title: '우리도 하나의 회사입니다',
    value4Desc: '그래서 압박과 예산, 그리고 성과를 보고 싶은 마음을 이해합니다.',
    finalCtaTitle: '한번 시작해 보시겠습니까',
    finalCtaSubtitle: '지금 무료로 시작해서 이 플랫폼이 무엇을 하는지 직접 확인해 보십시오',
    finalCtaStartFree: '무료 체험 시작',
    finalCtaContact: '담당자와 상담',
    lastUpdated: '이 페이지의 마지막 업데이트는 2026년 4월입니다',
  },
  articles: {
    breadcrumb: '블로그',
    title: '블로그',
    subtitle: '자연 검색 유입과 디지털 마케팅, 기술에 대한 글과 조언',
    loading: '불러오는 중…',
    noImage: '이미지 없음',
    readMore: '글 읽기 >>',
    promoBadge: 'Go Top SEO',
    promoTitle1: 'Google 검색 순위를',
    promoTitle2: '시간의 흐름과 함께',
    promoDesc: 'Google 자연 검색과 Google 지도에서의 검색 순위를 측정하는 실무용 플랫폼입니다. 상세한 리포트와 추이 기록, 담당자와의 직접 소통이 함께 갑니다.',
    promoCtaStart: '무료 체험 시작',
    promoCtaPricing: '요금 보기',
    stat1: '키워드',
    stat2: '순위를 가져오는 곳',
    stat3: 'SEO를 위한 설계',
    stat4: '무료 체험',
    statValueKeywords: '1000+',
    statValueTracking: '2',
    statValueHebrew: '100%',
    statValueTrial: '7일',
    promoFeature1Title: 'Google 자연 검색',
    promoFeature1Desc: 'Google 1페이지와 2페이지의 순위를 정확한 결과로 측정합니다',
    promoFeature2Title: 'Google 지도',
    promoFeature2Desc: '정확한 지점별 측정입니다. 시군구와 우편번호, 위경도를 지원합니다',
    promoFeature3Title: '실무용 리포트',
    promoFeature3Desc: '추이와 비교, 상세 분석을 담은 리포트를 PDF와 Excel로 내보냅니다',
  },
  breadcrumbs: {
    home: '홈',
    aria: '현재 위치',
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
    de: 'Deutsch',
    nl: 'Nederlands',
    pl: 'Polski',
    ko: '한국어',
    aria: '사이트 언어 변경',
  },
  cookie: {
    aria: '개인정보처리방침',
    title: '개인정보를 소중히 다룹니다',
    body: '사이트가 동작하는 데 필요한 쿠키를 사용합니다. 분석과 마케팅 쿠키는 동의를 받기 전에는 불러오지 않습니다. 자세한 내용은 다음을 보십시오',
    short: '선택 쿠키는 동의를 받은 경우에만 불러옵니다. 다음을 보십시오',
    privacy: '개인정보처리방침',
    accept: '측정 동의',
    marketingStep: '마케팅 쿠키는 미국으로 정보를 전송하므로 쿠키 설정에서 한 단계가 더 필요합니다.',
    rejectAll: '모두 거부',
    customize: '항목별로 설정',
    save: '선택 저장',
    back: '뒤로',
    settings: '쿠키 설정',
    settingsTitle: '쿠키 선택',
    settingsIntro: '항목별로 동의하거나 거부할 수 있습니다. 선택은 언제든 바꿀 수 있습니다.',
    always: '항상 사용',
    withdrawHint: '동의의 변경과 철회는 각 페이지 아래의 "쿠키 설정" 링크에서 언제든 할 수 있습니다. 내 기기에 저장하고 읽는 조건은 브라우저 설정에서 직접 정할 수도 있습니다. 다만 브라우저에서 차단하는 것만으로는 저희에 대한 동의 철회를 대신하지 못합니다.',
    gpcTitle: '자동으로 동의를 거부했습니다',
    gpcBody: '브라우저가 Global Privacy Control 신호를 보내고 있어 분석과 마케팅 쿠키를 불러오지 않았습니다. 이 선택은 기록했습니다.',
    categories: {
      necessary: {
        title: '필수',
        desc: '계정 로그인, 화면 언어, 보안, 부정 사용 방지에 씁니다. 이것이 없으면 서비스가 동작하지 않으므로 동의의 대상이 아닙니다.',
      },
      analytics: {
        title: '분석',
        desc: '사이트를 몇 명이 방문했고 어느 페이지를 읽었으며 어디에서 오류가 났는지 파악합니다. 사이트 개선에만 쓰고 광고에는 쓰지 않습니다.',
      },
      marketing: {
        title: '마케팅',
        desc: '저희 광고의 성과 측정과 Google과 Meta 네트워크에서의 관련 광고 노출에 씁니다. 거부해도 서비스 내용은 달라지지 않습니다.',
        descJvzoo: '마켓플레이스 판매 페이지에서는 JVZoo를 통해 방문하신 경우 소개해 준 파트너에게 구매를 연결하기 위해서도 씁니다.',
        risk: '마케팅 쿠키는 고객님의 IP 주소와 브라우저 식별자를 미국의 Meta에도 전송합니다. Meta에 대해서는 Meta 자신의 데이터 처리 조건에 담긴 표준 계약 조항에 의지합니다.',
        riskJvzoo: '마켓플레이스 판매 페이지에서는 같은 정보를 미국의 JVZoo에도 전송합니다. JVZoo와는 그런 조항이 없으므로, 여기에서의 고객님 동의가 그 이전의 유일한 근거입니다. 미국에는 유럽연합의 적정성 결정이 없고, 고객님의 정보는 고객님에게 적용되는 법에 따라 받는 보호를 받지 못하며, 그곳의 공공기관이 접근할 수 있는 경우가 있고, 동등한 구제 수단이 없을 수 있습니다. 이 동의는 언제든 철회하실 수 있습니다.',
      },
    },
  },
  contact: {
    region: '문의',
    whatsappAria: 'WhatsApp으로 문의',
    whatsappTitle: 'WhatsApp으로 보내기',
    whatsapp: 'WhatsApp',
    callAria: '전화하기',
    call: '전화하기',
    whatsappLabel: 'WhatsApp',
    whatsappMessage: '안녕하세요. 상담하고 싶은 것이 있습니다',
    phoneLabel: '전화하기',
    emailLabel: '이메일',
    emailAria: '이메일 보내기',
    // The floating "free demo" button (w11), on the public site and in the app.
    demo: '무료 데모',
    demoAria: 'WhatsApp으로 무료 데모 요청',
    demoMessage: '안녕하세요. Go Top SEO 무료 데모를 받고 싶습니다',
  },
  a11y: {
    open: '접근성 메뉴 열기',
    title: '접근성 메뉴',
    close: '접근성 메뉴 닫기',
    noAlt: '(대체 텍스트 없음)',
    statement: '접근성 방침',
    reset: '접근성 설정 해제와 초기화',
    fontUp: '글자 크게',
    fontDown: '글자 작게',
    readableFont: '읽기 쉬운 서체',
    persistentDesc: '이미지 설명 표시',
    showDescriptions: '포인터를 올렸을 때 이미지 설명 표시',
    highlightLinks: '링크 강조',
    highlightHeadings: '제목 강조',
    invertColors: '색 반전',
    blackYellow: '검정과 노랑',
    highContrast: '고대비',
    sepia: '세피아',
    grayscale: '회색조',
    stopAnimations: '애니메이션 정지',
    keyboardNav: '키보드 조작',
    blackCursor: '검은 커서',
    bigCursor: '큰 커서',
    zoomOut: '축소',
    zoomIn: '확대',
  },
}

/** The dictionary must carry every key the Hebrew one defines; nothing less. */
const _koHasEveryKey: PublicDictionary = ko as unknown as PublicDictionary
void _koHasEveryKey
