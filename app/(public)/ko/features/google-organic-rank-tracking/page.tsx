import { Metadata } from 'next'
import { FileSpreadsheet, FileText, Globe, History, LineChart, Link2, MapPin, Smartphone, Target, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { RankVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingKo } from '@/lib/i18n/public/landing-ko'

export const metadata: Metadata = {
  title: 'Google 순위 측정 | Go Top SEO',
  description: '키워드, 지역, 언어, 기기별로 Google 순위를 측정하세요. 언제든 직접 실행하거나 매달 자동으로 실행되며, 변화 추이와 경쟁사 보고서가 함께 제공됩니다.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/features/google-organic-rank-tracking',
    languages: buildHreflangAlternates('/features/google-organic-rank-tracking', '/en/features/google-organic-rank-tracking', '/es/features/google-organic-rank-tracking'),
  },
}

export default function GoogleOrganicFeaturePage() {
  return <FeaturePage locale="ko" content={CONTENT} path="/features/google-organic-rank-tracking" />
}

const C = FEATURE_COMMON['ko']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google 순위',
    eyebrowIcon: TrendingUp,
    title: '내 업체가 Google에서 몇 위에 있는지,',
    accent: '그리고 공들인 일이 결실을 내는지 보입니다',
    subtitle: '중요한 키워드를 하나씩, 국가와 도시, 언어, 기기에 맞춰 측정합니다. 언제든 직접 실행하실 수 있고 매달 자동으로도 실행됩니다. 모든 변화가 기록에 남습니다.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <RankVisual copy={landingKo.features.rank.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '측정하는 이유',
      title: '측정하지 않는 것은 나아지지 않습니다',
      intro: '측정하지 않으면 새 글이나 사이트 수정, 대행사의 작업이 무엇을 바꿨는지 알 수 없습니다.',
      items: [
        { icon: LineChart, title: '움직임이 보입니다', body: '키워드마다 지난 측정과 비교해 올랐는지, 내렸는지, 그대로인지 보입니다.' },
        { icon: FileText, title: '콘텐츠와 결과가 이어집니다', body: '글을 발행한 뒤 어떤 페이지가 올랐는지, 다음에는 무엇을 쓸지 보실 수 있습니다.' },
        { icon: Target, title: '가까운 곳에 힘을 씁니다', body: '첫 페이지 바로 아래에 있는 키워드가 보통 가장 가까운 기회입니다. 측정은 그것이 어떤 키워드인지 알려 줍니다.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '어떻게 동작하나요',
      title: '한 번 설정하면 모든 변화가 보입니다',
      items: [
        { title: '키워드를 추가합니다', body: '중요한 키워드를 입력하시거나, 키워드 분석에서 한 번의 클릭으로 가져오시면 됩니다.' },
        { title: '지역과 기기를 고릅니다', body: '국가, 언어, 도시, 그리고 PC 또는 휴대폰입니다. 각각이 검색 결과를 바꿉니다.' },
        { title: '측정하고 움직임을 따라갑니다', body: '언제든 직접 측정하실 수 있고, 매달 자동 측정이 그 일을 알아서 합니다. 모든 결과가 기록에 남습니다.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '받게 되는 것',
      title: '내 업체가 Google에서 어디에 있는지 정확히 알게 됩니다',
      items: [
        { icon: Smartphone, title: 'PC와 휴대폰을 따로', body: '휴대폰과 PC의 검색 결과는 늘 같지 않습니다. 각각 따로 봅니다.' },
        { icon: Globe, title: '국가, 도시, 언어별로', body: '중요한 지역에서 검색하는 고객이 보는 것을 그대로 보실 수 있습니다.' },
        { icon: Link2, title: '앞자리에 있는 페이지', body: '키워드마다 내 사이트의 어떤 페이지가 결과에 나오는지 보입니다.' },
        { icon: History, title: '전체 기록', body: '측정은 모두 저장되므로 오늘의 상태만이 아니라 거기까지 온 길이 보입니다.' },
        { icon: MapPin, title: 'Google 지도도 같이', body: '같은 키워드를 Google 지도에서도 도시와 지역에 맞춰 측정합니다.' },
        { icon: FileSpreadsheet, title: 'PDF와 Excel 보고서', body: '순위와 변화, 기록을 담은 보고서를 원하는 사람에게 그대로 전달하실 수 있습니다.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: '자주 묻는 질문',
      title: '순위 측정에 대해 많이 물어보시는 것',
      items: [
        { q: '순위는 얼마나 자주 측정하나요?', a: '직접 측정을 실행할 때마다 측정하고, 설정해 두시면 매달 한 번 자동으로 측정합니다. 일간이나 주간 자동 측정은 지금 제공하지 않습니다.' },
        { q: '제가 Google에서 보는 순위와 플랫폼의 숫자가 다른 이유는 무엇인가요?', a: 'Google은 지역, 기기, 검색 이력에 따라 결과를 바꿉니다. 플랫폼은 고객님이 정한 고정된 조건에서 측정하므로, 그 숫자는 시간이 지나도 비교할 수 있습니다.' },
        { q: '키워드는 몇 개까지 측정할 수 있나요?', a: '요금제에 따라 다릅니다. 정확한 한도는 가격 페이지에 있습니다.' },
      ],
    },
  ],
  cta: {
    title: '지금 어디에 서 있는지 확인해 보세요',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
