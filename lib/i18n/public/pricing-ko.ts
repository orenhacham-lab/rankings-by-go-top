/**
 * The Korean pricing page's words around the plan grid
 * (app/(public)/ko/pricing/page.tsx renders them through
 * components/public/pricing/PricingSections.tsx).
 *
 * Every figure is read from the plan and trial catalogs, so the page cannot
 * drift from what the server enforces. No customer, total, quote or logo is
 * claimed, and no percentage or ranking promise. The badge says what it is, a
 * recommendation, not a sales figure.
 *
 * THE PRICE ITSELF is not in this file. The grid reads it from the visitor's
 * billing market (lib/billing/server-market.ts), which is decided by country
 * and not by the page's language: a visitor in Korea sees the same dollar price
 * every market outside Israel is billed in today, because no Korean local price
 * is set. Nothing here promises a currency, and the Korean page never names won
 * — Creem charges dollars, and a won figure would be a price we do not take.
 * 전자상거래법 art. 13 asks the price shown to a consumer to be the one actually
 * payable, so inventing one would be a legal problem and not only an untidy
 * page.
 *
 * THE TAX SENTENCE IS THE ONE THE LEGAL THREAD REQUIRED, and it is the reason
 * this file is not merely a translation of its Polish twin. Creem Merchant
 * Terms cl. 3.7 obliges us to tell the buyer, in words and before checkout,
 * that the sale is concluded with Creem as the seller; that same sentence is
 * what keeps our own position lawful, because a page with a price and a buy
 * button and no such sentence reads as our own Korean shop, which is what pulls
 * the 전자상거래법 disclosure duties onto us. So the note names Creem as the
 * seller of record, says the listed figure is before tax, and says the exact
 * amount including tax appears before the buyer is bound.
 *
 * WHAT IT MUST NEVER SAY: a sentence to the buyer about who remits Korean VAT.
 * "Creem is the seller" is a fact from their contract and belongs here; "Korean
 * VAT is handled" is the legal thread's conclusion, and a conclusion is not
 * published to a buyer.
 */
import type { PricingCopy } from '@/components/public/pricing/PricingSections'
import { PLAN_CATALOG, TRIAL_CATALOG } from '@/lib/plans/catalog'
import { CHECKS_EXPLAINER } from '@/lib/plans/features'

const DAYS = TRIAL_CATALOG.days
const BASIC_ARTICLES = PLAN_CATALOG.regular.maxArticlesPerPeriodAccountWide
const ADVANCED_ARTICLES = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

export const pricingKo: PricingCopy = {
  hero: {
    eyebrow: '가격',
    title: '검색에서 찾아지기 위해 필요한 모든 것을',
    accent: '월 하나의 가격으로',
    subtitle: '글을 써서 사이트에 발행하고, Google과 Google 지도의 순위를 확인하며, ChatGPT와 Gemini가 무엇을 추천하는지 살펴봅니다. 필요에 맞는 요금제를 고르시고, 무료 체험으로 시작하시면 됩니다.',
    trust: [`${DAYS}일 무료`, '신용카드 없이', '대시보드에서 언제든 해지'],
  },
  plans: {
    perMonth: '/월',
    popular: '저희 추천',
    cta: `${DAYS}일 무료로 사용해 보기`,
    dashboard: '내 대시보드',
    noCard: '신용카드 없이',
    checksNote: CHECKS_EXPLAINER.ko,
    taxNote: {
      ILS: '가격에는 이스라엘 부가가치세가 포함되어 있습니다. 추가 비용 없이 이 금액을 결제하시면 됩니다.',
      USD: '카드로 결제하실 때 판매자는 Creem이며, Creem이 merchant of record로서 자신의 이름으로 판매 거래를 체결합니다. 세금은 청구지 주소를 기준으로 계산되고 결제 전에 최종 금액이 표시됩니다. 여기 표시된 가격에는 그 세금이 포함되어 있지 않으며, 세금을 포함한 정확한 금액은 계약이 성립되기 전에 확인하실 수 있습니다.',
    },
    /* 전자상거래법 제21조 제1항 제1호 forbids inducing a consumer by withholding a
       material fact, and it binds any business carrying on electronic commerce,
       not only a mail-order seller, so it bites BEFORE any contract. Shown only
       to a visitor placed in Korea, on every language's page, because the duty
       follows the consumer and not the page. lib/billing/korea-sale.ts. */
    koreaTrialOnly: `현재 한국에서는 무료 체험만 제공하며, 유료 구독 결제는 제공하지 않습니다. 체험은 ${DAYS}일 후 자동으로 종료되고, 카드 정보를 받지 않으므로 요금이 청구되지 않습니다.`,
    everyPlanLabel: '모든 요금제 공통',
    everyPlan: [
      'WordPress, Shopify, Wix에 예약 자동 발행',
      'Google과 Google 지도 순위 확인',
      'ChatGPT, Gemini 등 AI 엔진 6곳이 업체를 언급하는지 확인',
      '사이트 상태 점수와 필요한 수정 목록',
      '바로 보낼 수 있는 PDF, Excel 리포트',
      '사람이 직접 답하는 지원',
    ],
  },
  unsure: {
    text: '아직 확신이 들지 않으십니까? 무료 사이트 진단으로 시작해 보십시오.',
    cta: '내 사이트 분석하기',
  },
  included: {
    eyebrow: '모든 요금제 공통',
    title: '추가 옵션은 없습니다. 첫날부터 전부 가격에 들어 있습니다.',
    body: '요금제의 차이는 규모뿐입니다. 사이트 수, 월 글 수, 월 확인 횟수입니다. 기능은 모든 요금제가 같습니다.',
    items: [
      {
        title: '글 작성과 발행',
        desc: '승인하신 주제로 이미지, 질문과 답변 블록, 내부 링크를 갖춘 글 한 편을 쓰고, 일정에 맞춰 사이트에 발행합니다.',
      },
      {
        title: 'Google과 Google 지도 순위 확인',
        desc: '중요한 검색어마다 업체가 몇 위에 있는지, 일반 검색 결과와 지도에서 각각 확인하고 그 변화를 함께 봅니다.',
      },
      {
        title: 'AI 가시성',
        desc: 'ChatGPT, Gemini, Perplexity, Copilot, Grok, Google AI가 이 업체를 언급하는지, 대신 누구를 언급하는지 확인합니다.',
      },
      {
        title: '키워드 분석',
        desc: '고객이 무엇을 검색하고 무엇을 묻는지 찾아, 어디에서 시작하면 좋을지 제안합니다.',
      },
      {
        title: '바로 보낼 수 있는 리포트',
        desc: '순위, 진행 상황, AI 답변 가시성을 한 번의 클릭으로 PDF나 Excel 리포트 하나에 담아, 고객이나 경영진에게 바로 보낼 수 있습니다.',
      },
      {
        title: '사람이 직접 답하는 지원',
        desc: 'WhatsApp과 이메일로 실제 사람이 답합니다.',
      },
    ],
  },
  value: {
    eyebrow: '왜 이득인가',
    title: '세 곳에 맡기는 대신 하나의 구독으로',
    body: '보통은 주제를 고르고 글을 쓰는 사람, 그것을 사이트에 올리는 사람, 효과가 있었는지 확인하는 도구가 각각 필요합니다. 여기에서는 그 모든 일이 한곳에서 일어납니다.',
    items: [
      {
        title: '측정만 하지 않고 일을 해냅니다',
        desc: '누군가 움직여 주기를 기다리는 또 하나의 리포트가 아닙니다. 승인하신 주제에 한해서만, 직접 글을 쓰고 발행합니다.',
      },
      {
        title: '무엇에 비용을 내는지 그대로 보입니다',
        desc: '발행된 글, 순위 변화, AI 답변 속 언급이 하나의 대시보드에 모이고, 그대로 전달할 수 있는 리포트로도 나옵니다.',
      },
      {
        title: '약정 없이',
        desc: `신용카드 없이 ${DAYS}일 체험, 월 단위 결제, 대시보드에서 언제든 해지할 수 있습니다.`,
      },
    ],
  },
  usage: {
    eyebrow: '사용량 계산 방식',
    title: '깐깐한 약관은 없습니다',
    body: '단위는 세 가지뿐이고, 각 한도는 매달 새로 채워집니다.',
    items: [
      {
        title: '글',
        desc: '새 글을 만들 때 한도에서 하나를 사용합니다. 기존 글을 편집하거나 예약하거나 발행하는 데에는 아무것도 사용되지 않습니다.',
      },
      {
        title: 'Google 순위 확인',
        desc: '키워드 하나가 한 곳에서 몇 위인지 확인합니다. Google 또는 Google 지도입니다. 같은 키워드를 양쪽에서 확인하면 두 번으로 계산됩니다.',
      },
      {
        title: 'AI 답변 가시성 확인',
        desc: 'AI 엔진 하나에 질문 하나를 보내고 업체가 언급되는지 확인합니다. 같은 질문을 ChatGPT와 Gemini에 보내면 두 번으로 계산됩니다.',
      },
    ],
    note: '글 한도는 계정 단위입니다. 여러 사이트를 쓰는 요금제에서는 모든 사이트가 같은 한도를 함께 사용합니다.',
  },
  faq: {
    eyebrow: '자주 묻는 질문',
    title: '요금제를 고르기 전에 많이 물어보시는 것',
    body: '찾으시는 답이 없다면 WhatsApp으로 연락해 주시기 바랍니다.',
    items: [
      {
        q: '어느 요금제가 맞습니까?',
        a: `Basic과 Advanced는 사이트 한 개를 위한 요금제이고, 둘의 핵심 차이는 월 글 수입니다. ${BASIC_ARTICLES}개와 ${ADVANCED_ARTICLES}개입니다. Premium은 사이트가 둘 이상일 때, Agency는 고객사 사이트를 운영할 때 쓰는 요금제입니다. 작게 시작해 언제든 바꾸실 수 있습니다.`,
      },
      {
        q: '무료 체험에는 무엇이 들어 있습니까?',
        a: `신용카드 없이 ${DAYS}일입니다. 사이트 한 개, 키워드 최대 ${TRIAL_CATALOG.maxKeywordsPerProject}개, Google 순위 확인 최대 ${TRIAL_CATALOG.maxGoogleChecksLifetime}회, AI 답변 가시성 확인 최대 ${TRIAL_CATALOG.maxAIChecksLifetime}회, 그리고 처음부터 발행까지 전 과정을 보실 수 있도록 글 한 편이 포함됩니다.`,
      },
      {
        q: `체험 ${DAYS}일이 끝나면 어떻게 됩니까?`,
        a: '요금제를 고르시고 멈춘 곳에서 이어 가시면 됩니다. 아무 요금제도 고르지 않으시면 결제되는 것은 없습니다. 카드를 받은 적이 없기 때문입니다.',
      },
      {
        q: '요금제를 바꾸거나 해지할 수 있습니까?',
        a: '네. 요금제는 언제든 바꾸실 수 있고 새 한도는 그 시점부터 적용됩니다. 해지는 대시보드에서 하시며, 위약금이나 해지 비용은 없습니다.',
      },
      {
        q: '쓰지 않은 글은 어떻게 됩니까?',
        a: '한도는 매달 새로 채워지며, 쓰지 않은 글은 다음 달로 넘어가지 않습니다.',
      },
      {
        q: '확인은 자동으로 실행됩니까?',
        a: '수동 확인은 언제든 실행하실 수 있고, 매달 저절로 실행되는 월간 자동 확인을 켜 두실 수도 있습니다. 일간이나 주간 자동 확인은 지금 제공하지 않습니다.',
      },
      {
        q: '글을 예약해서 자동으로 발행할 수 있습니까?',
        a: '네. 글을 앞날로 예약하시거나 연결된 사이트에 바로 발행하실 수 있습니다. WordPress, Shopify, Wix입니다.',
      },
      {
        q: '저희 데이터는 어떻게 보호됩니까?',
        a: '모든 통신은 암호화되고(SSL/TLS), 비밀번호는 암호화된 형태로 보관되며, 각 계정은 자신의 데이터만 볼 수 있습니다. 데이터는 플랫폼이 돌아가는 데 필요한 서비스 제공자에게만, 개인정보처리방침에 따라 전달됩니다. 호스팅, 결제, 검색 데이터입니다.',
        // The privacy policy exists in this language (content/legal/ko, rendered
        // by app/(public)/ko/privacy), so the link stays inside the language the
        // reader chose. The French page learned this the hard way: its link
        // pointed at /en/privacy for months, which handed the reader an English
        // document — the one thing the site's language rule forbids.
        link: { label: '개인정보처리방침 읽기', href: '/ko/privacy' },
      },
    ],
  },
  cta: {
    title: '플랫폼이 사이트에서 무엇을 찾아내는지 먼저 보시겠습니까?',
    body: `무료 분석은 사이트를 읽고 첫 요약을 드립니다. 가입은 필요하지 않습니다. 아니면 ${DAYS}일 체험을 시작해 전부 사용해 보셔도 됩니다.`,
    check: '내 사이트 무료로 분석하기',
    trial: '무료로 사용해 보기',
    dashboard: '내 대시보드',
  },
}
