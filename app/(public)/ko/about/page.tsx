import { AboutPage, type AboutCopy } from '@/components/public/AboutPage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { ABOUT_BREADCRUMB } from '@/lib/i18n/public/pages/breadcrumb-labels'

export default function KoreanAboutPage() {
  return <AboutPage locale="ko" copy={COPY} />
}

/**
 * The same page as the Hebrew, English, Spanish, French, Italian, Japanese,
 * German, Dutch and Polish ones, in Korean.
 * Every claim here is one the others already make: the years of experience, who
 * builds the platform, and what it does. Nothing is added for the Korean
 * market, because nothing new is true of it yet — and nothing here presents the
 * company as a seller established in Korea, which is the one thing the legal
 * ruling of 12.11.2026 forbids on a Korean page.
 */
const COPY: AboutCopy = {
  breadcrumb: { label: ABOUT_BREADCRUMB['ko'], href: '/ko/about' },
  title: '검색 노출을 다룬 11년의 실무를',
  accent: '하나의 플랫폼에 담았습니다.',
  subtitle: '사이트에 글을 써서 발행하고, Google과 Google 지도의 순위를 측정하며, AI 서비스가 업체를 추천하는지 확인하는 플랫폼입니다. 자연 검색 방문자 확보와 광고를 11년 넘게 해 온 디지털 마케팅 대행사 Go Top이 만들었습니다.',
  who: {
    title: '이 플랫폼을 만드는 회사',
    paragraphs: [
      'Go Top SEO는 디지털 마케팅 대행사 Go Top이 만듭니다. 11년 넘게 이스라엘과 해외 기업의 자연 검색 노출, 온라인 광고, 웹사이트를 다뤄 왔습니다.',
      '이 플랫폼은 그 고객들과의 일상적인 작업에서 자라났습니다. 어떤 보고서가 실제로 무언가를 말해 주는지, 어떤 데이터가 결정에 도움이 되는지, 어디에서 시간이 새는지를 보았습니다. 그래서 콘텐츠를 쓰고, 발행하고, 측정하는 일이 한곳에서 일어나는 자리를 만들었습니다. Google과 AI 서비스 양쪽 모두에서입니다.',
    ],
  },
  founderEyebrow: '이 프로젝트를 이끄는 사람',
  gaps: {
    title: '무엇이 없었고, 그래서 무엇을 만들었는지',
    body: '검색에서 찾아지기 위해 필요한 모든 일이, 자연 검색이 어떻게 돌아가는지부터 배우지 않아도 한곳에서 일어나기를 바랐습니다.',
    missingLabel: '없던 것',
    builtLabel: '만든 것',
    rows: [
      {
        pain: { title: '순위를 직접 확인하는 데 시간이 너무 듭니다', description: '같은 키워드를 몇 번이고 검색하고, 결과 페이지를 계속 넘기며 직접 세다 보면 반나절이 사라집니다.' },
        answer: { title: 'Google과 Google 지도 순위', description: '키워드마다 자연 검색과 Google 지도의 순위를, 지역과 기기에 맞춰 측정하고 변화까지 함께 보여 드립니다.' },
      },
      {
        pain: { title: '데이터가 여러 도구에 흩어져 있습니다', description: 'Google 순위, Google 지도 순위, AI 서비스 노출이 서로 다른 세 곳에 있어 하나의 그림으로 모이지 않습니다.' },
        answer: { title: '모든 것을 한곳에', description: '키워드 분석, 순위, AI 노출, 글이 네 개의 도구에 따로 놓이지 않고 서로 이어져 있습니다.' },
      },
      {
        pain: { title: 'AI 서비스는 이미 검색의 일부입니다', description: '점점 더 많은 고객이 ChatGPT, Gemini, Google AI 모드에 묻습니다. 그 답변에 내 업체가 나오는지 알아야 합니다.' },
        answer: { title: 'AI 노출 측정', description: 'ChatGPT, Gemini, Google AI 모드의 답변에서 업체가 언급되는지, 출처로 제시되는지, 추천되는지 확인하실 수 있습니다.' },
      },
      {
        pain: { title: '중간에 멈추는 콘텐츠', description: '무엇을 쓸지 아는 것은 일의 절반입니다. 나머지는 쓰고, 발행하고, 측정하는 일입니다.' },
        answer: { title: '글 작성과 발행', description: '승인하신 주제에서 이미지, 질문과 답변 블록, 내부 링크를 갖춘 완성된 글이 나오고, WordPress나 Shopify에 발행됩니다.' },
      },
    ],
  },
  approach: {
    title: '일하는 방식',
    items: [
      {
        title: '투명함',
        description: '무엇을 측정하는지, 데이터가 어디에서 오는지, 그것이 무엇을 뜻하는지 말씀드립니다. 부풀린 숫자는 없습니다.',
      },
      {
        title: '뜻이 있는 데이터',
        description: '보기 좋은 숫자가 아니라, 사업적으로 의미가 통하는 이야기를 담은 보고서입니다.',
      },
      {
        title: '이해되는 화면',
        description: '콘텐츠, Google과 Google 지도 순위, AI 노출을 한 화면에서, 군더더기 없이 봅니다.',
      },
      {
        title: 'SEO와 GEO를 함께',
        description: 'Google을 위한 콘텐츠와 AI 서비스를 위한 콘텐츠, 그리고 둘 모두의 측정입니다.',
      },
    ],
  },
  choose: {
    title: 'Go Top SEO를 선택하는 이유',
    items: [
      {
        title: '돌려 말하지 않고 바로 답하는 한 사람',
        description: '매달 바뀌는 "담당자"는 없습니다. 고객님의 사업을 아는 같은 사람이 답합니다.',
      },
      {
        title: '완전한 투명함',
        description: '계정에서 무슨 일이 일어나는지, 무엇이 효과가 있었고 무엇이 없었는지, 다음에 무엇을 할지 언제든 보실 수 있습니다.',
      },
      {
        title: '전문 지식, 전문 용어는 없이',
        description: '어려운 말을 늘어놓지 않습니다. 측정하고 이해할 수 있는 결과로 이야기합니다.',
      },
      {
        title: '저희도 사업을 합니다',
        description: '압박, 넉넉하지 않은 예산, 결과를 보고 싶은 마음을 압니다. 저희도 같은 것을 지나고 있습니다.',
      },
    ],
  },
  cta: {
    title: '이 플랫폼이 고객님의 사이트에서 무엇을 바꾸는지 확인해 보세요',
    body: FEATURE_COMMON['ko'].closeBody,
    contact: '문의는 이곳으로 보내 주세요:',
    updated: '이 페이지는 2026년 9월에 마지막으로 업데이트되었습니다',
  },
}
