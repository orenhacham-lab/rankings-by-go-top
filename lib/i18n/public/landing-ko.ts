/**
 * The Korean home page's words (app/(public)/ko/page.tsx renders them through
 * components/public/LandingPage.tsx).
 *
 * 합니다체 throughout, which is the register a Korean business audience reads on
 * a product site; 해요체 would read as a consumer app and 하십시오체 as a notice
 * from a bank. The second person is left out of the sentence wherever Korean
 * leaves it out, which is nearly everywhere — no 당신, and 고객님 only where a
 * person is actually being addressed.
 *
 * The demo's example business is in Seoul rather than in Tokyo or Milan: the
 * Korean site opens in Korea, and a demo full of Japanese districts reads as a
 * translated page rather than a Korean one. Its names and figures are
 * illustrative and the caption under the demo says so, the same promise the
 * other locales make. The demo domains are example-*.kr rather than plausible
 * real ones, so a screenshot cannot be read as naming an actual customer.
 *
 * `href` values stay unprefixed: components/public/LandingPage.tsx renders them
 * as `${prefix}${row.href}`, so writing '/ko/features/...' here would ship
 * '/ko/ko/features/...'. That is the bug the Spanish launch hit.
 *
 * WHAT THE KOREAN PAGE MAY NOT PROMISE, and it is more than the other locales.
 * Naver is 64-67% of Korean search and we do not measure it, so nothing here
 * says "검색" in a way that implies every Korean search engine: the engines are
 * named, Google and Google 지도 and the AI answers, and the measured demand this
 * locale is built against (`seo google`, the homepage-building cluster) is in
 * those words. A Korean reader who wants Naver rank tracking must be able to
 * tell from this page that we do not do it yet, rather than find out after
 * paying. Beyond that, the usual: no invented customers, totals, logos or press,
 * and no percentage or ranking promise — in Korea 표시광고법 reaches a
 * performance claim the way Japan's 景品表示法 does.
 *
 * Prices come from the plan catalogue and are quoted in USD. The Korean page
 * never names won, because Korea's own local price is not set, and because the
 * paid checkout itself waits on the VAT question in
 * `lib/i18n/korean-site.ts` — the trial takes no card, which is what this page
 * leads with.
 */
import type { LandingCopy } from '@/components/public/LandingPage'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'

/**
 * The lowest monthly price. Korea's own price is not set yet, so the Korean page
 * shows the USD price every market outside Israel is billed in today, grouped
 * the Korean way (which is the same grouping as English).
 */
const FROM_USD = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.priceUSD)).toLocaleString('ko-KR')
const TRIAL_DAYS = TRIAL_CATALOG.days

export const landingKo: LandingCopy = {
  hero: {
    eyebrow: 'Google과 AI 엔진에서의 유입을 자동화하는 하나의 시스템',
    title: '다음 고객은 이미 검색하고 있습니다.',
    accent: '찾아낼 수 있게 만들어 드립니다.',
    subtitle:
      'Go Top SEO는 고객이 검색하는 내용에 답하는 글을 만들어 발행하고, 그다음 Google과 Google 지도, ChatGPT, Gemini에서 내 업체가 어디에 나오는지 보여 줍니다. 콘텐츠 전담 인력도, 추측도 필요하지 않습니다.',
    signup: `${TRIAL_DAYS}일 무료 체험`,
    trialNote: '카드를 등록하지 않고, 약정도 없습니다. 언제든 해지할 수 있습니다.',
    checkLead: '계정을 만들기엔 이르다고 느끼신다면, 가입 없이 사이트를 무료로 진단해 드립니다:',
    dashboard: '대시보드',
    trust: ['WordPress, Shopify, Wix에 발행', '담당자가 직접 돕는 지원'],
    climbChip: 'Google 3위',
    published: '글을 사이트에 발행했습니다',
  },
  demo: {
    label: '플랫폼의 실제 화면',
    caption: '제품 데모입니다. 업체명과 수치는 예로 든 것입니다.',
    tabs: ['Google 순위 상승', '새 글', 'AI가 추천'],
    describe: [
      '키워드 화면입니다. 어떤 검색어가 Google 18위에서 3위로 올라갔고, 다른 세 개도 올라갔습니다.',
      '글 화면입니다. 새 글이 작성되어 품질 검사를 통과하고 사이트 발행 예약을 기다리고 있습니다.',
      'AI 가시성 화면입니다. ChatGPT의 답변이 이 업체를 추천하고 있고, 인용한 엔진들이 함께 보입니다.',
    ],
    address: 'app.gotopseo.com',
    rail: ['대시보드', '키워드', '콘텐츠 전략', '글', 'AI 가시성', '리포트'],
    rank: {
      heading: '키워드',
      keyword: '에어컨 설치 서울',
      positionLabel: 'Google 순위',
      period: '최근 8주',
      from: 18,
      to: 3,
      columns: ['키워드', '순위', '변동'],
      rows: [
        { keyword: '시스템 에어컨 설치 비용', from: 24, to: 7 },
        { keyword: '에어컨 수리 강남', from: 31, to: 9 },
        { keyword: '에어컨 청소 업체', from: 15, to: 5 },
      ],
      mapsLabel: 'Google 지도, 서울',
      mapsValue: '2위',
      toast: 'Google에서 15위 올랐습니다',
    },
    article: {
      heading: '새 글',
      title: '시스템 에어컨 설치 비용은 얼마인지, 계약 전에 확인할 것들',
      subheading: '가격을 정하는 것은 무엇인가',
      checksTitle: '품질 검사',
      checks: ['자주 묻는 질문', '구조화된 데이터', '내부 링크', '대표 이미지', '검색을 바탕으로 한 제목'],
      draft: '작성 중',
      scheduled: '예약됨',
      when: '화 09:00',
      toast: 'WordPress에 발행',
    },
    ai: {
      heading: 'AI 가시성',
      question: '서울에서 에어컨 설치를 잘하는 업체는 어디인가요',
      intro: '이 분야에서 평이 좋은 업체 몇 곳을 소개합니다.',
      items: [
        { name: '청담냉공조', desc: '자격을 갖춘 시공 기사, 시공 보증, 당일 회신.', you: true },
        { name: '클리마포인트', desc: '청소와 유지관리 비용이 명확합니다.' },
        { name: '서울컴포트설비', desc: '덕트형 설비에 강합니다.' },
      ],
      youTag: '내 업체',
      mentionedIn: '인용한 곳:',
      engines: [
        { name: 'ChatGPT', on: true },
        { name: 'Gemini', on: true },
        { name: 'Perplexity', on: true },
        { name: 'Copilot', on: false },
        { name: 'Grok', on: true },
        { name: 'Google AI', on: false },
      ],
      toast: 'ChatGPT가 추천하고 있습니다',
    },
  },
  worksWith: {
    label: '저희가 측정하고 발행하는 곳:',
    names: ['Google', 'Google 지도', 'ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'WordPress', 'Shopify', 'Wix'],
  },
  outcomes: {
    eyebrow: '얻게 되는 것',
    title: '본업에 집중하는 동안 Go Top SEO가 하는 일',
    body: '새로 배워야 하는 도구가 아닙니다. 작업을 직접 해내고, 그 성과까지 보여 주는 시스템입니다.',
    items: [
      {
        title: '방문수가 아니라 고객으로 이어지는 콘텐츠',
        desc: '고객이 검색하고 묻는 내용을 찾아내 그 주제로 글을 한 편씩 완성하고, 정해진 주기로 사이트에 발행합니다. 고르실 것은 주제뿐입니다.',
        chips: ['자동 발행', '이미지 포함', '자주 묻는 질문', '내부 링크'],
      },
      {
        title: 'ChatGPT와 Gemini 답변 속에서의 자리',
        desc: '검색 대신 AI에 묻는 사람이 늘고 있습니다. AI가 내 업체를 추천하는지, 대신 누구를 추천하는지, 무엇을 고치면 되는지 알 수 있습니다.',
        chips: ['AI 엔진 6종', '경쟁사 비교 포함'],
      },
      {
        title: '무엇이 통하는지 분명히 보입니다',
        desc: 'Google과 지도에서의 순위, AI 인용, 발행한 글이 한 화면에 모입니다. 스프레드시트도 추측도 필요 없습니다.',
        chips: ['PDF와 Excel 리포트', '전체 기록'],
      },
    ],
    stats: [
      { value: 6, label: '측정하는 AI 엔진', detail: 'ChatGPT, Gemini, Perplexity, Copilot, Grok, Google AI' },
      { value: 3, label: '하나의 리포트에 담기는 경로', detail: 'Google, Google 지도, AI 답변' },
      { value: 3, label: '발행하는 플랫폼', detail: 'WordPress, Shopify, Wix. 복사해 붙일 일이 없습니다' },
      { value: TRIAL_DAYS, label: '일 무료 체험', detail: '카드 등록 없음' },
    ],
  },
  shift: {
    eyebrow: '검색이 달라졌습니다',
    title: '고객은 더 이상 Google만 거치지 않습니다. AI에 묻고 추천 세 곳을 받습니다.',
    body: '사이트가 그 질문에 답하고 있지 않으면, Google에서도 ChatGPT의 답변에서도 그 추천은 경쟁사에게 갑니다. 그리고 자기 업체가 거기서 어떻게 보이는지 아는 회사는 거의 없습니다. 지금까지 그 둘을 한 번에 보여 주는 도구가 없었기 때문입니다.',
    withoutTitle: 'Go Top SEO가 없을 때',
    without: [
      '누군가 시간이 날 때만, 두 달에 글 한 편',
      '무엇을 써야 하는지, 어느 검색어가 값어치가 있는지 모름',
      '순위는 손으로 확인하거나 아예 확인하지 않음',
      'ChatGPT가 우리를 추천하는지 경쟁사를 추천하는지 모름',
    ],
    withTitle: 'Go Top SEO가 있을 때',
    with: [
      '발행 시점을 직접 정하는, 끊기지 않는 콘텐츠 일정',
      '고객이 실제로 검색하는 내용에서 고른 주제',
      'Google과 Google 지도 순위 자동 측정',
      'ChatGPT와 Gemini, Google AI가 우리를 두고 무엇이라 말하는지 자동 확인, 필요하면 나머지 세 엔진까지',
    ],
  },
  flow: {
    eyebrow: '어떻게 되는지',
    title: '사이트 주소에서 성과가 나는 콘텐츠까지, 네 단계',
    body: '무엇을 쓸지는 직접 정하십니다. 나머지는 플랫폼이 합니다.',
    steps: [
      { tag: '무료, 가입 불필요', title: '사이트 진단', desc: '주소만 입력하십시오. 1분 안에 이 사업이 무엇을 하는지, 고객은 누구인지, 그리고 Google과 AI를 상대로 사이트의 발목을 잡는 것이 무엇인지 파악합니다.' },
      { tag: '승인하신 뒤에', title: '계획이 도착합니다', desc: '검색어와 고객이 묻는 질문, 그리고 바로 쓸 수 있는 글 목록입니다. 무엇을 넣을지는 직접 고르십니다.' },
      { tag: '자동', title: '글이 작성되고 발행됩니다', desc: '모든 글에 이미지와 자주 묻는 질문이 붙고, 예약하신 날에 사이트에 발행됩니다. Go Top 플러그인을 설치한 WordPress 사이트에서는 구조화된 데이터까지 들어갑니다.' },
      { tag: '투명하게', title: '성과를 따라갑니다', desc: 'Google과 지도에서의 순위, AI 인용, 그리고 누구에게든 그대로 보낼 수 있는 리포트입니다.' },
    ],
    cta: '무료 진단으로 시작',
  },
  features: {
    eyebrow: '포함된 것',
    title: '순위를 올리는 데 필요한 것이 한곳에',
    body: '네 가지 기능이 맞물립니다. 모든 글이 측정되고, 모든 측정이 다음 글을 가리키기 때문입니다.',
    more: '자세히 보기',
    note: '화면 속 이름과 수치는 예로 든 것입니다.',
    content: {
      overline: '콘텐츠와 발행',
      title: '블로그를 채우기 위한 글이 아니라, 찾아지기 위한 글',
      body: '모든 글을 실제 검색을 바탕으로 짭니다. 사람들이 쓰는 말에서 가져온 제목, 자주 묻는 질문, 매출로 이어지는 페이지로 향하는 내부 링크, 그리고 Go Top 플러그인을 설치한 WordPress 사이트에서는 Google과 AI 엔진이 읽는 구조화된 데이터입니다. 직접 읽고 필요하면 손보신 뒤, 발행은 플랫폼이 합니다.',
      points: ['대표 이미지와 본문 이미지', '발행 전 품질 검사', 'WordPress, Shopify, Wix로 예약 발행과 바로 발행'],
      href: '/features/seo-geo-content-publishing',
      visual: {
        heading: '이번 주 사이트 일정',
        days: ['일', '월', '화', '수', '목', '금', '토'],
        items: [
          { day: 0, title: '방에 맞는 에어컨 고르는 법', status: 'published', label: '발행됨' },
          { day: 2, title: '시스템 에어컨 설치 비용은 얼마인가', status: 'scheduled', label: '예약됨' },
          { day: 4, title: '에어컨 청소는 얼마나 자주 해야 하는가', status: 'writing', label: '작성 중' },
        ],
        destinationLabel: '발행 대상',
        destinations: ['WordPress', 'Shopify', 'Wix'],
      },
    },
    ai: {
      overline: 'AI 가시성',
      title: 'ChatGPT가 우리를 추천한 순간과 경쟁사를 고른 순간이 보입니다',
      body: '고객이 묻는 질문을 AI 엔진에 넣고, 그 답변에 누가 나오는지 확인합니다. 어느 질문에서 우리가 선택되고 어디에서 추천이 경쟁사로 넘어가는지, 그리고 사이트에서 무엇을 고치면 되는지 알 수 있습니다.',
      points: ['ChatGPT, Gemini, Perplexity, Copilot, Grok, Google AI', '경쟁사와 나란히 비교', '답변에 들어가기 위해 무엇을 바꿀지에 대한 지침'],
      href: '/features/ai-visibility-tracking',
      visual: {
        heading: '답변에 나오는 것은 누구인가',
        engines: ['ChatGPT', 'Gemini', 'Perplexity', 'Copilot', 'Grok', 'Google AI'],
        rows: [
          { question: '서울에서 에어컨을 설치하는 업체는 어디인가요', hits: [true, true, true, false, true, false] },
          { question: '에어컨 청소 비용은 얼마인가요', hits: [true, false, true, false, false, true] },
        ],
        shareTitle: '인용 점유율',
        you: { label: '내 업체', value: 58 },
        rival: { label: '주요 경쟁사', value: 42 },
      },
    },
    rank: {
      overline: 'Google 순위',
      title: 'Google과 Google 지도에서의 상승을 모두 확인할 수 있습니다',
      body: '중요한 검색어를 일반 검색과, 시군구나 지역별 지도에서 함께 측정합니다. 기록이 남으므로 글이 일하고 있는지 알 수 있습니다.',
      points: ['Google 자연 검색을 국가, 언어, 기기별로', 'Google 지도를 시군구 또는 지역별로', '검색량과 경쟁 정도가 함께 나오는 키워드 리서치'],
      href: '/features/google-organic-rank-tracking',
      visual: {
        heading: '측정 중인 키워드',
        columns: ['키워드', '순위', '변동'],
        rows: [
          { keyword: '에어컨 설치 서울', pos: 3, up: 15 },
          { keyword: '시스템 에어컨 설치 비용', pos: 7, up: 17 },
          { keyword: '에어컨 수리 강남', pos: 9, up: 22 },
          { keyword: '에어컨 청소 업체', pos: 5, up: 10 },
        ],
        maps: { label: 'Google 지도', area: '서울', value: '20곳 중 2위' },
      },
    },
    reports: {
      overline: '리포트',
      title: '고객사나 경영진에게 보낼 리포트를 클릭 한 번으로',
      body: '순위와 추이, AI 가시성을 PDF와 Excel로 내보냅니다. 대행사와 제작사는 여러 고객사의 사이트를 하나의 계정에서, 각각 다른 프로젝트로 운영할 수 있습니다.',
      points: ['PDF와 Excel을 클릭 한 번으로', '여러 사이트를 하나의 계정에서', '모든 데이터가 한곳에, 리포트를 손으로 짤 일이 없습니다'],
      href: '/features/seo-geo-reports',
      visual: {
        heading: '성과 리포트',
        period: '9월',
        stats: [
          { label: '첫 페이지 키워드', value: '14', up: true },
          { label: 'AI 인용', value: '9', up: true },
          { label: '발행한 글', value: '8' },
          { label: '평균 게재순위', value: '6.2', up: true },
        ],
        clientsLabel: '프로젝트:',
        clients: ['example-aircon.kr', 'example-studio.kr', '+3'],
      },
    },
  },
  audience: {
    eyebrow: '이런 분들께',
    title: '사이트에서 고객을 얻고 싶은 모든 분께',
    body: 'SEO 지식은 필요하지 않습니다. 필요한 것은 자기가 무엇을 파는지 아는 것입니다.',
    items: [
      {
        title: '사업자',
        desc: '자연 검색을 공부하거나 작가를 고용하지 않고도 Google에서 들어오는 문의를 늘릴 수 있습니다. 주제만 승인하시면 나머지는 자동으로 진행됩니다.',
        gain: '손을 못 뗄 때도 일하는 사이트',
      },
      {
        title: '프리랜서와 제작사',
        desc: '여러 고객사를 하나의 계정에서 운영하고, 콘텐츠를 더 빨리 만들고, 고객사마다 알아보기 쉬운 리포트를 전달할 수 있습니다.',
        gain: '같은 작업 시간에 더 많은 고객사',
      },
      {
        title: '마케팅 담당자',
        desc: '정해진 주기로 발행이 이어지고, 그 콘텐츠가 Google과 AI에서 무엇을 하고 있는지가 한곳에 모입니다.',
        gain: '"통하고 있나"에 대한 분명한 답',
      },
    ],
  },
  check: {
    eyebrow: '사이트 무료 진단',
    title: '아직 정하지 못하셨다면, 저희에게 보이는 것을 먼저 보여 드립니다',
    body: '진단은 사이트를 실제로 읽어 1분 안에 첫 조사 요약을 돌려 드립니다.',
    items: [
      '이 사업에 대해 읽어낸 내용과 고객의 모습',
      '우리 옆에 나란히 서 있는 경쟁사',
      'Google을 상대로 사이트의 발목을 잡는 지점과, 사이트 자체에서 모은 근거',
      'AI 답변에 대한 준비가 어디까지 되어 있는지',
      '저희가 만들 글의 목록',
    ],
    cta: '사이트 진단하기',
    note: '무료이고, 가입도 카드 등록도 필요하지 않습니다.',
    preview: {
      domain: 'example-aircon.kr',
      heading: '첫 조사 요약',
      scoreLabel: 'AI 대응',
      score: '3/4',
      findings: ['이미지에 대체 텍스트가 없습니다', '자주 묻는 질문이 없습니다', '메타 설명의 길이가 적절하지 않습니다'],
      lockedLabel: '나머지 지적 사항과 경쟁사는 무료 계정에서 보실 수 있습니다',
    },
  },
  faq: {
    eyebrow: '자주 묻는 질문',
    title: '시작하기 전에 많이 듣는 질문',
    body: '답을 찾지 못하셨다면 WhatsApp으로 연락해 주십시오.',
    items: [
      {
        q: 'SEO를 전혀 모릅니다. 그래도 쓸 수 있습니까',
        a: '네. 플랫폼이 검색어를 고르고 주제를 제안하고 글을 씁니다. 남는 일은 우리 사업에 맞는지 판단해 승인하는 것뿐입니다.',
      },
      {
        q: '내가 보지 않은 글이 사이트에 발행되는 일이 있습니까',
        a: '승인하신 주제만 작성으로 넘어가고, 모든 글은 발행 전에 품질 검사를 거칩니다. 모든 글을 읽고 고칠 수 있으며, 발행일도 직접 정하십니다.',
      },
      {
        q: 'ChatGPT로 직접 다 쓰면 되지 않습니까',
        a: '그렇게 하실 수도 있습니다. 다만 그때는 주제를 고르고 검색어를 확인하고 자주 묻는 질문과 구조화된 데이터를 짜고 페이지끼리 연결하고 사이트에 올리고 통했는지 확인하는 일까지 모두 직접 하셔야 합니다. Go Top SEO는 그 흐름을 맡고, Google과 AI에서의 결과까지 측정합니다.',
      },
      {
        q: '어떤 사이트에서 쓸 수 있습니까',
        a: '바로 발행이 되는 곳은 WordPress와 Shopify, Wix입니다. 순위 측정과 AI 가시성, 키워드 리서치는 어떤 사이트에서나 쓸 수 있습니다.',
      },
      {
        q: 'Naver 순위도 측정합니까',
        a: '아직 하지 않습니다. 지금 측정하는 곳은 Google 자연 검색과 Google 지도, 그리고 ChatGPT와 Gemini를 포함한 AI 엔진 여섯 곳입니다. Naver가 한국 검색에서 큰 자리를 차지한다는 점은 알고 있으며, 없는 기능을 있다고 말하지 않기 위해 여기에 분명히 적어 둡니다.',
      },
      {
        q: `${TRIAL_DAYS}일 체험이 끝나면 어떻게 됩니까`,
        a: '플랜을 고르시면 멈춘 자리에서 그대로 이어집니다. 고르지 않으시면 청구되는 것은 없습니다. 카드를 한 번도 받지 않았기 때문입니다.',
      },
      {
        q: '해지할 수 있습니까',
        a: '네. 언제든 대시보드에서 바로 해지할 수 있습니다. 위약금도 해지 수수료도 없습니다.',
      },
    ],
  },
  cta: {
    title: '다음 고객은 오늘 검색하고 있습니다. 찾아낼 수 있게 만들어 둡시다.',
    body: `사이트 무료 진단으로 시작하셔도 되고, ${TRIAL_DAYS}일 체험으로 시작하셔도 됩니다. 첫 글은 오늘부터 만들 수 있습니다.`,
    check: '사이트 무료 진단',
    signup: '무료 체험 시작',
    dashboard: '대시보드',
    pricing: `플랜은 월 ${FROM_USD}달러부터입니다.`,
    pricingLink: '전체 플랜과 요금 보기',
  },
}
