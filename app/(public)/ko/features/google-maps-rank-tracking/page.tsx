import { Metadata } from 'next'
import { FileSpreadsheet, History, MapPin, Navigation, Phone, Search, Store, Users } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { MapsVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: 'Google 지도 순위 측정 | Go Top SEO',
  description: 'Google 지도에서의 노출을 측정하세요. 도시와 지역마다 순위를 확인합니다. 근처 검색에서 고객을 얻는 일은 여기에서 시작됩니다.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/features/google-maps-rank-tracking',
    languages: buildHreflangAlternates('/features/google-maps-rank-tracking', '/en/features/google-maps-rank-tracking', '/es/features/google-maps-rank-tracking'),
  },
}

export default function GoogleMapsFeaturePage() {
  return <FeaturePage locale="ko" content={CONTENT} path="/features/google-maps-rank-tracking" />
}

const C = FEATURE_COMMON['ko']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: 'Google 지도',
    eyebrowIcon: MapPin,
    title: '근처에서 누군가 내 업체 같은 곳을 찾을 때,',
    accent: '지도에서 어디에 있는지 보입니다',
    subtitle: 'Google 지도에서의 순위를 키워드마다, 지역마다 측정합니다. 도시 단위로도, 지도의 특정 지점에서도 측정할 수 있습니다. 누가 더 위에 있는지, 순위가 시간에 따라 어떻게 움직였는지 보입니다.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    /* The example is the KOREAN market, not a translated American, Japanese,
       German, Dutch or Polish one: the same example world as the Korean keyword
       page (서울, 에어컨 설치 and the neighbours). The numbers are the example
       values the English, Spanish and French pages already show, so no new
       rating and no new review count is invented. */
    visual: (
      <MapsVisual
        positionLabel="내 순위"
        position="3"
        positionSub="서울, '에어컨 설치'"
        changeLabel="이번 달"
        change="2"
        changeSub="계단 상승"
        reviewsLabel="리뷰"
        rows={[
          { rank: 1, name: '강남 냉난방기술', stars: 4.8, reviews: 212 },
          { rank: 2, name: '한강 공조설비', stars: 4.6, reviews: 174 },
          { rank: 3, name: '내 업체', stars: 4.7, reviews: 131, highlight: true },
          { rank: 4, name: '서울 에어컨포인트', stars: 4.4, reviews: 98 },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '지도가 중요한 이유',
      title: '근처 검색에서는 지도가 가게의 쇼윈도입니다',
      intro: '근처에서 서비스를 찾는 사람에게 Google은 먼저 지도 위의 업체 몇 곳을 보여 줍니다. 고객이 누구에게 전화할지는 거기에서 갈립니다.',
      items: [
        { icon: Phone, title: '전화는 거기에서 옵니다', body: '지도 결과에서는 한 번만 누르면 전화를 걸고, 길을 찾고, 사이트를 열 수 있습니다.' },
        { icon: Users, title: '자리는 적고 경쟁자는 많습니다', body: '앞자리는 몇 곳만 차지합니다. 그 안에 내 업체가 있는지 알아야 합니다.' },
        { icon: MapPin, title: '지역마다 다른 경기입니다', body: '한 도시에서는 1위인데 옆 도시에서는 아예 나오지 않을 수 있습니다. 지역별 측정이 그것을 보여 줍니다.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '어떻게 동작하나요',
      title: '세 단계로 지도 위의 그림이 분명해집니다',
      items: [
        { title: '업체를 입력합니다', body: '업체 이름과 영업하시는 지역을 입력해 주세요.' },
        { title: '키워드와 지역을 고릅니다', body: '예를 들어 서울의 "에어컨 설치"이거나, 지도의 특정 지점에서입니다.' },
        { title: '움직임을 따라갑니다', body: '언제든 직접 측정하실 수 있고, 매달 한 번 자동으로 측정할 수도 있습니다. 모든 변화가 기록에 남습니다.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '받게 되는 것',
      title: '추정치가 아니라 지도 위의 내 순위',
      items: [
        { icon: MapPin, title: '도시와 지역별로', body: '키워드마다, 고객이 있는 지역에서 측정합니다.' },
        { icon: Navigation, title: '지도의 특정 지점', body: '알려 주신 좌표에서 측정하므로, 그곳의 고객이 보는 것을 그대로 보실 수 있습니다.' },
        { icon: Store, title: '누가 더 위에 있는지', body: '결과에서 내 위에 나오는 업체와 그들의 Google 평점입니다.' },
        { icon: History, title: '순위 기록', body: '지난 측정 이후 순위가 어떻게 바뀌었는지 보입니다.' },
        { icon: Search, title: '일반 검색도 같이', body: '같은 키워드를 Google 일반 검색 결과에서도 측정합니다.' },
        { icon: FileSpreadsheet, title: 'PDF와 Excel 보고서', body: 'Google 지도 순위도 보고서에 담겨, 원하는 사람에게 그대로 전달하실 수 있습니다.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: '자주 묻는 질문',
      title: 'Google 지도 측정에 대해 많이 물어보시는 것',
      items: [
        { q: 'Google 비즈니스 프로필이 있어야 하나요?', a: 'Google 지도에 나오려면 Google 비즈니스 프로필 등록이 필요합니다. 측정은 그 등록이 어디에서 나오고 어디에서 나오지 않는지 보여 줍니다.' },
        { q: '순위는 얼마나 자주 측정하나요?', a: '직접 측정을 실행할 때마다 측정하고, 설정해 두시면 매달 한 번 자동으로 측정합니다. 일간이나 주간 자동 측정은 지금 제공하지 않습니다.' },
        { q: 'Google 지도의 키워드는 별도의 확인으로 계산되나요?', a: '네. Google 확인 한 번은 한 지역의 키워드 하나입니다. 같은 키워드를 일반 검색과 Google 지도에서 측정하시면 두 번이 됩니다.' },
      ],
    },
  ],
  cta: {
    title: '내 지역에서 누가 전화를 받고 있는지 확인해 보세요',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
