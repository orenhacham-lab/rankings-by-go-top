import { Metadata } from 'next'
import { Coins, Info, Lightbulb, Plus, Sparkles, Target, TrendingUp, Search } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { KeywordIdeasVisual } from '@/components/public/feature-visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'

export const metadata: Metadata = {
  title: '키워드 분석 | Go Top SEO',
  description: 'Google Ads 데이터에서 나오는 키워드 아이디어입니다. 검색량, 경쟁 정도, 예상 클릭당 비용이 함께 표시됩니다. 어떤 키워드든 순위 측정에 넣거나 AI에 물을 질문으로 바꿀 수 있습니다.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/features/keyword-research',
    languages: buildHreflangAlternates('/features/keyword-research', '/en/features/keyword-research', '/es/features/keyword-research'),
  },
}

export default function KeywordResearchFeaturePage() {
  return <FeaturePage locale="ko" content={CONTENT} path="/features/keyword-research" />
}

const C = FEATURE_COMMON['ko']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: '키워드 분석',
    eyebrowIcon: Search,
    title: '고객이 실제로 검색하는 말이',
    accent: '한 편의 글이 됩니다',
    subtitle: 'Google Ads 데이터에서 나오는 키워드 아이디어입니다. 월 검색량, 경쟁 정도, 예상 클릭당 비용이 함께 표시됩니다. 맞는 키워드는 바로 측정에 넣거나, 한 번의 클릭으로 AI에 물을 질문으로 바꿀 수 있습니다.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    /* The example world is KOREAN, not a translated Polish one: 에어컨 설치 in
       서울. The figures are the example values the English, Spanish, French,
       Dutch and Polish pages already show, so no new number about any real
       market is invented. */
    visual: (
      <KeywordIdeasVisual
        seed="에어컨 설치"
        headers={['키워드', '월 검색량', '경쟁 정도']}
        rows={[
          { keyword: '에어컨 설치 업체', volume: '1,900', competition: '보통', level: 'medium', added: true },
          { keyword: '에어컨 설치 비용', volume: '1,300', competition: '낮음', level: 'low' },
          { keyword: '시스템 에어컨', volume: '590', competition: '높음', level: 'high' },
          { keyword: '서울 에어컨 수리', volume: '320', competition: '낮음', level: 'low', added: true },
        ]}
      />
    ),
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '여기에서 시작하는 이유',
      title: '아무도 검색하지 않는 키워드로 쓴 최고의 글은 아무도 데려오지 않습니다',
      intro: '첫 문장을 쓰기 전에, 사람들이 무엇을 얼마나 자주 검색하는지, 그리고 그 자리에 들어가는 일이 얼마나 어려운지 보실 수 있습니다.',
      items: [
        { icon: TrendingUp, title: '실제 수요', body: 'Google 데이터를 기준으로 한 키워드별 예상 월 검색량입니다.' },
        { icon: Target, title: '이길 수 있는 곳', body: '키워드별 경쟁 정도입니다. 앞자리가 실제로 닿을 만한 키워드를 고르실 수 있습니다.' },
        { icon: Coins, title: '클릭 한 번의 가치', body: '광고주가 클릭당 얼마를 내는지입니다. 그 키워드가 사업에 얼마만큼 값이 있는지 알려 주는 단서입니다.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '어떻게 동작하나요',
      title: '아이디어에서 할 일 목록까지',
      items: [
        { title: '키워드나 사이트로 시작합니다', body: '키워드나 사이트 주소를 입력하고 국가와 언어를 선택하시면 됩니다.' },
        { title: '숫자와 함께 아이디어를 받습니다', body: '관련 키워드 목록이 나오고, 각 키워드마다 검색량, 경쟁 정도, 예상 클릭당 비용이 붙습니다.' },
        { title: '바로 다음 일을 이어 갑니다', body: '키워드를 순위 측정에 넣거나, AI 노출 측정에 쓸 질문으로 바꾸시면 됩니다.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '할 수 있는 일',
      title: '맞는 키워드를 고르는 데 필요한 모든 것',
      items: [
        { icon: Lightbulb, title: '키워드나 사이트에서 아이디어', body: '키워드 하나나 사이트 주소 하나에서 관련 키워드가 나옵니다.' },
        { icon: TrendingUp, title: '검색량', body: '키워드마다 한 달에 얼마나 검색되는지에 대한 Google의 추정치입니다.' },
        { icon: Target, title: '경쟁 정도', body: '키워드마다 낮음, 보통, 높음으로 표시됩니다.' },
        { icon: Coins, title: '예상 클릭당 비용', body: '광고가 페이지 상단에 올라가는 입찰가 범위입니다.' },
        { icon: Plus, title: '한 번의 클릭으로 측정에', body: '고른 키워드가 그 프로젝트의 순위 측정에 바로 들어갑니다.' },
        { icon: Sparkles, title: 'AI 측정용 질문', body: '키워드가 일상적인 말로 된 질문이 되어, AI 서비스가 업체를 추천하는지 확인하실 수 있습니다.' },
      ],
    },
    {
      kind: 'callout',
      icon: Info,
      title: '데이터에 대하여',
      body: (
        <>
          <p>데이터는 Google Ads API에서 옵니다. 검색량, 경쟁 정도, 클릭당 비용은 Google의 추정치이며 업종과 계절, 지역에 따라 달라집니다.</p>
          <p>주제를 고르는 출발점으로는 이것으로 충분합니다. 실제 결과는 순위 측정으로 확인합니다.</p>
        </>
      ),
    },
  ],
  cta: {
    title: '공들일 가치가 있는 키워드를 찾아보세요',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
