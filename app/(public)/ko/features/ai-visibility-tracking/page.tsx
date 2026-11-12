import { Metadata } from 'next'
import { Award, FileSpreadsheet, Lightbulb, LineChart, Link2, MessagesSquare, Sparkles, Target, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { AiVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingKo } from '@/lib/i18n/public/landing-ko'

export const metadata: Metadata = {
  title: 'AI 노출 측정 | Go Top SEO',
  description: 'ChatGPT, Gemini, Google AI 모드에서 내 업체가 얼마나 자주 언급되는지 측정하세요. 생성형 엔진 최적화(GEO)를 숫자로 보여 드립니다.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/features/ai-visibility-tracking',
    languages: buildHreflangAlternates('/features/ai-visibility-tracking', '/en/features/ai-visibility-tracking', '/es/features/ai-visibility-tracking'),
  },
}

export default function AIVisibilityFeaturePage() {
  return <FeaturePage locale="ko" content={CONTENT} path="/features/ai-visibility-tracking" />
}

const C = FEATURE_COMMON['ko']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'AI 서비스 노출',
    eyebrowIcon: Sparkles,
    title: '고객이 ChatGPT에 물을 때,',
    accent: '내 업체가 추천되는지 보입니다',
    subtitle: '고객이 던지는 것과 같은 질문을 ChatGPT, Gemini, Google AI 모드에 보내고, 그 답변에 누가 있는지 보여 드립니다. 내 업체인지, 경쟁사인지입니다.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <AiVisual copy={landingKo.features.ai.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '지금 이것이 중요한 이유',
      title: '이미 Google에서 검색하지 않는 고객이 있습니다. AI에 묻습니다.',
      intro: '답변에 있는 쪽이 추천을 받습니다. 거기에 나오지 않는 쪽은 대화 밖에 남습니다.',
      items: [
        { icon: MessagesSquare, title: '질문이 채팅으로 옮겨 갔습니다', body: '검색 결과 열 개를 훑는 대신 질문 하나를 던지고, 이름 몇 개가 담긴 답변 하나를 받습니다. 그 가운데 하나가 고객님의 업체여야 합니다.' },
        { icon: Award, title: '믿게 되는 추천', body: 'AI 서비스가 업체 이름을 말하면 그것은 조언처럼 받아들여집니다. 그렇게 찾아오는 사람은 이미 선택을 끝낸 상태입니다.' },
        { icon: Target, title: '경쟁사는 이미 거기 있을 수 있습니다', body: '측정하지 않으면 내 업종에서 누가 추천되는지 알 수 없습니다. 측정하면 질문마다, 서비스마다 그것이 보입니다.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '어떻게 동작하나요',
      title: '세 단계로 그림이 완성됩니다',
      items: [
        { title: '질문을 고릅니다', body: '업체의 키워드에서 질문 제안이 나오고, 거기에 더하거나 지우실 수 있습니다. 예를 들어 "서울에서 에어컨 설치 어디에 맡기나요?" 같은 질문입니다.' },
        { title: '서비스마다 따로 묻습니다', body: '질문 하나를 세 서비스에 각각 보내고, 각 답변을 읽어 확인합니다.' },
        { title: '누가 거기 있는지 보입니다', body: '질문마다 내 업체가 언급되는지, 내 사이트가 출처로 제시되는지, 대신 누가 언급되었는지 보실 수 있습니다.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '받게 되는 것',
      title: '답변에 들어가기 위해 필요한 모든 것',
      items: [
        { icon: Sparkles, title: '서비스별 언급', body: '세 서비스는 각각 답하는 방식이 달라서 따로 봅니다.' },
        { icon: Link2, title: '출처로서의 언급', body: '이름이 나왔는지만이 아니라, 답변이 내 사이트를 출처로 제시했는지까지 봅니다.' },
        { icon: Users, title: '내 대신 언급된 곳', body: '답변에 등장하는 경쟁사와, 그들이 추천을 받는 질문입니다.' },
        { icon: Lightbulb, title: '개선할 수 있는 것', body: '답변에 들어갈 가능성을 높이기 위해 사이트에서 무엇을 채우고 바꿀지에 대한 제안입니다.' },
        { icon: LineChart, title: '시간에 따른 변화', body: '확인 결과가 모두 저장되므로, 글을 발행하면서 노출이 늘어나는지 보실 수 있습니다.' },
        { icon: FileSpreadsheet, title: 'PDF와 Excel 보고서', body: '서비스별 언급과 출처 인용을 담은 보고서로, 고객이나 사내에 그대로 전달하실 수 있습니다.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: '자주 묻는 질문',
      title: 'AI 노출에 대해 많이 물어보시는 것',
      items: [
        { q: 'SEO와 GEO는 무엇이 다른가요?', a: 'SEO는 Google 검색 결과에 나오는 일이고, GEO는 AI 서비스의 답변에 나오는 일입니다. 플랫폼은 둘 모두를 측정하며, 쓰는 글도 둘 모두를 염두에 두고 만듭니다. 명확한 구성과 질문·답변 블록을 갖추고, Go Top 플러그인을 쓰는 WordPress 사이트에서는 구조화 데이터까지 더합니다.' },
        { q: '답변에 나오도록 보장해 주시나요?', a: '아니요. AI 서비스가 무엇을 답할지는 누구도 통제할 수 없습니다. 저희가 할 수 있는 일은 오늘의 상황을 정확히 측정하고, 내 자리에 누가 있는지 보여 드리며, 가능성을 높이는 콘텐츠를 준비하는 것입니다.' },
        { q: 'AI 확인은 어떻게 계산되나요?', a: '한 서비스에 보내는 질문 하나가 한 번의 확인입니다. 같은 질문을 세 서비스에 모두 보내면 세 번이 됩니다. 요금제별 한도는 가격 페이지에 있습니다.' },
      ],
    },
  ],
  cta: {
    title: 'ChatGPT가 내 업종에 대해 무엇을 말하는지 확인해 보세요',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
