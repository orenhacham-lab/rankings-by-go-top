import { Metadata } from 'next'
import { FileCheck2, FileText, Globe, Image as ImageIcon, Link2, ListChecks, PenLine, Search, Send, ShieldCheck, ShoppingBag } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ContentVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { TRIAL_CATALOG } from '@/lib/plans/catalog'
import { landingKo } from '@/lib/i18n/public/landing-ko'

export const metadata: Metadata = {
  title: 'SEO·GEO 콘텐츠 작성, 예약, 발행 | Go Top SEO',
  description:
    '주제를 계획하고, AI가 쓴 완성된 글을 받고, 다듬고, 발행을 예약하고, WordPress나 Shopify에 바로 발행합니다. 모두 한곳에서 이루어집니다.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates('/features/seo-geo-content-publishing', '/en/features/seo-geo-content-publishing', '/es/features/seo-geo-content-publishing'),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return <FeaturePage locale="ko" content={CONTENT} path="/features/seo-geo-content-publishing" />
}

const C = FEATURE_COMMON['ko']

const faqs = [
  {
    q: '발행 전에 모든 글을 읽어야 하나요?',
    a: '읽지 않으셔도 되지만, 언제든 읽으실 수 있습니다. 승인하신 주제에 대해서만 쓰고, 모든 글은 발행 전에 품질 점검을 거치며, 글이 나가기 전에 읽고 고쳐서 내보내실 수 있습니다.',
  },
  {
    q: '어떤 사이트에 발행할 수 있나요?',
    a: '바로 발행은 WordPress와 Shopify에서 동작합니다. 사이트를 한 번 연결하면 승인된 글이 그곳에 올라갑니다.',
  },
  {
    q: '예약 발행은 어떻게 동작하나요?',
    a: '글을 승인하신 뒤 바로 발행하거나, 날짜와 시각을 고르시면 됩니다. 그때 플랫폼이 알아서 발행합니다.',
  },
  {
    q: '글에 이미지와 검색용 제목도 들어가나요?',
    a: '네. 모든 글에 대표 이미지와 본문 이미지, 메타 제목과 메타 설명이 들어가며, 발행 전에 모두 고치실 수 있습니다.',
  },
  {
    q: '글 수는 어떻게 제한되나요?',
    a: '요금제마다 월 글 수가 정해져 있습니다. 한도는 계정 단위이고 매달 새로 채워지며, 쓰지 않은 분량은 다음 달로 넘어가지 않습니다. 글을 만들면 하나를 사용하고, 고치거나 예약하거나 발행하는 데에는 아무것도 사용되지 않습니다.',
  },
  {
    q: '달 중간에 다 써 버리면 어떻게 되나요?',
    a: '글이 더 많은 요금제로 바꾸시면 같은 달에 바로 이어 가실 수 있습니다.',
  },
  {
    q: '결제 전에 사용해 볼 수 있나요?',
    a: `네. 무료 체험은 ${TRIAL_CATALOG.days}일이고 카드가 필요하지 않습니다. 발행까지 전 과정을 한 번 지나 보실 수 있도록 글 한 편이 포함되어 있습니다.`,
  },
]

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: '콘텐츠 작성과 발행',
    eyebrowIcon: FileText,
    title: '글이 만들어져 사이트에 발행됩니다,',
    accent: '콘텐츠 담당자가 없어도',
    subtitle: '주제를 계획해 승인하시면, 이미지와 질문·답변 블록, 내부 링크를 갖춘 완성된 글이 나옵니다. 원하시면 다듬어서 WordPress나 Shopify에 바로 발행하거나, 고른 날짜에 발행하실 수 있습니다.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ContentVisual copy={landingKo.features.content.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '콘텐츠가 밀리는 이유',
      title: '콘텐츠는 늘 뒤로 밀립니다. 사실은 세 가지 일이기 때문입니다',
      intro: '주제를 찾고, 쓰고, 발행합니다. 각각이 시간을 먹으니 다음 달로 넘어갑니다. 여기에서는 그 세 가지가 한곳에서 만납니다.',
      items: [
        { icon: Search, title: '무엇을 쓸지 찾기', body: '사람들이 무엇을 검색하는지, 경쟁사가 이미 차지한 것은 무엇인지, 내 사이트에 무엇이 없는지 확인하는 일입니다.' },
        { icon: PenLine, title: '제대로 쓰기', body: '초고에 몇 시간이 들고, 그 뒤에도 고치고 읽는 일이 남습니다.' },
        { icon: Send, title: '발행하기', body: '본문을 옮기고, 이미지를 올리고, 검색용 항목을 채우고, 발행 버튼을 잊지 않고 누르는 일입니다.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '어떻게 동작하나요',
      title: '주제에서 발행된 글까지 다섯 단계',
      items: [
        { title: '주제를 계획합니다', body: '업체 정보와 업종 키워드에서 주제 제안이 나옵니다.' },
        { title: '승인합니다', body: '지금 의미가 있는 주제를 고르시면 됩니다. 그 주제에 대해서만 씁니다.' },
        { title: '완성된 글을 받습니다', body: '제목, 본문, 소제목, 이미지, 질문·답변 블록, 내부 링크까지 갖춘 글입니다.' },
        { title: '읽고 다듬습니다', body: '읽어 보시고 원하는 만큼 고치신 뒤, 괜찮으면 승인하시면 됩니다.' },
        { title: '예약하거나 발행합니다', body: '바로, 또는 고른 날짜와 시각에 WordPress나 Shopify에 바로 발행합니다.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '모든 글에 들어가는 것',
      title: '흩어진 문장이 아니라 완성된 글',
      items: [
        { icon: FileText, title: '완성된 글', body: '승인하신 주제에서 요약이나 뼈대가 아니라 한 편의 글이 나옵니다.' },
        { icon: ImageIcon, title: '이미지', body: '대표 이미지와 본문 이미지입니다. 따로 찾거나 올리실 필요가 없습니다.' },
        { icon: ListChecks, title: '질문과 답변, 구조화 데이터', body: '모든 글에 질문·답변 블록이 들어갑니다. Go Top 플러그인을 쓰는 WordPress 사이트에서는 Google과 AI 서비스가 읽을 수 있는 구조화 데이터까지 더해집니다.' },
        { icon: Link2, title: '내부 링크', body: '내 사이트의 다른 페이지로 가는 링크를 제안하고, 어떤 것을 넣을지는 고객님이 정하십니다.' },
        { icon: FileCheck2, title: '메타 제목과 메타 설명', body: '검색을 염두에 두고 쓰이며, 다른 모든 것처럼 쉽게 고치실 수 있습니다.' },
        { icon: ShieldCheck, title: '발행 전 품질 점검', body: '모든 글을 발행 전에 읽습니다. 절반만 된 결과물은 나가지 않습니다.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '바로 발행',
      title: '한 번 연결하면 복사·붙여넣기는 끝입니다',
      intro: '승인하신 글이 이미지와 검색용 항목까지 함께, 사이트에 바로 올라갑니다.',
      items: [
        { icon: Globe, title: 'WordPress', body: 'WordPress 사이트를 연결하시고 글을 바로, 또는 예약한 날짜에 발행하시면 됩니다.' },
        { icon: ShoppingBag, title: 'Shopify', body: 'Shopify 스토어를 연결하시고 블로그 글을 플랫폼에서 바로 발행하시면 됩니다.' },
      ],
    },
    { kind: 'faq', eyebrow: '자주 묻는 질문', title: '작성과 발행에 대해 많이 물어보시는 것', items: faqs },
  ],
  cta: {
    title: '다음 글은 오늘 만들어질 수 있습니다',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
