import { Metadata } from 'next'
import { ArrowUpDown, ChartColumn, Clock, Eye, FileSpreadsheet, Handshake, History, Sparkles, TrendingUp } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ReportsVisual } from '@/components/public/landing/visuals'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { landingKo } from '@/lib/i18n/public/landing-ko'

export const metadata: Metadata = {
  title: 'SEO·GEO 보고서 | Go Top SEO',
  description: '순위와 변화, 경쟁사까지 담은 실무용 PDF·Excel 보고서입니다. 몇 초면 만들어져 고객에게 바로 보낼 수 있습니다.',
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/features/seo-geo-reports',
    languages: buildHreflangAlternates('/features/seo-geo-reports', '/en/features/seo-geo-reports', '/es/features/seo-geo-reports'),
  },
}

export default function SEOGeoReportsFeaturePage() {
  return <FeaturePage locale="ko" content={CONTENT} path="/features/seo-geo-reports" />
}

const C = FEATURE_COMMON['ko']

const CONTENT: FeaturePageContent = {
  hero: {
    eyebrow: '보고서',
    eyebrowIcon: ChartColumn,
    title: '무엇이 바뀌었는지 보여 주는 보고서 하나,',
    accent: '클릭 한 번으로',
    subtitle: 'Google과 Google 지도 순위, AI 서비스 노출을 하나의 PDF 또는 Excel 보고서에 모읍니다. 그대로 고객에게, 사내에, 또는 고객님 자신을 위해 쓰실 수 있습니다.',
    trust: C.trust,
    primary: C.check,
    secondary: C.trial,
    visual: <ReportsVisual copy={landingKo.features.reports.visual} />,
  },
  sections: [
    {
      kind: 'cards',
      tone: 'contrast',
      eyebrow: '보고서가 필요한 이유',
      title: '잘한 일은 보여야 합니다',
      intro: '이해되는 보고서는 설명하는 수고를 덜어 주고, 사이트가 올라가고 있다는 것을 보여 줍니다.',
      items: [
        { icon: Eye, title: '전체 그림', body: 'Google, Google 지도, AI가 한곳에 모입니다. 여러 도구의 화면을 이어 붙일 필요가 없습니다.' },
        { icon: Clock, title: '손으로 모을 것이 없습니다', body: '데이터는 이미 플랫폼에 있습니다. 보고서는 그 데이터에서 클릭 한 번으로 만들어집니다.' },
        { icon: Handshake, title: '고객의 신뢰', body: '대행사와 서비스 제공자에게는, 정해진 때에 나오는 보고서가 무엇이 바뀌었고 왜 계속할 만한지 고객에게 보여 줍니다.' },
      ],
    },
    {
      kind: 'steps',
      eyebrow: '어떻게 동작하나요',
      title: '데이터에서 보고서까지 세 단계',
      items: [
        { title: '프로젝트를 고릅니다', body: '사이트마다 프로젝트가 하나이고, 프로젝트마다 자기 보고서가 있습니다.' },
        { title: '내보냅니다', body: '전달용 PDF로, 또는 데이터를 더 다루실 Excel로 내보내시면 됩니다.' },
        { title: '보냅니다', body: '고객에게, 사내에, 또는 파트너에게, 미리 준비할 것 없이 그대로 보내시면 됩니다.' },
      ],
    },
    {
      kind: 'cards',
      eyebrow: '보고서에 담기는 것',
      title: '뜻이 있는 것만, 뜻이 없는 것은 빼고',
      items: [
        { icon: TrendingUp, title: '순위와 변화', body: '키워드마다 오늘의 순위, 지난 순위, 그 차이입니다.' },
        { icon: ArrowUpDown, title: '앞자리에 있는 페이지', body: '키워드마다 내 사이트의 어떤 페이지가 나오는지입니다.' },
        { icon: ChartColumn, title: '예상 유입', body: '검색량과 오늘의 순위를 바탕으로 한 Google 방문 추정치입니다.' },
        { icon: Sparkles, title: 'AI 노출', body: 'AI 서비스별로 내 사이트에 대한 언급과 출처 인용입니다.' },
        { icon: History, title: '전체 기록', body: 'Excel 파일에는 마지막 측정만이 아니라 지금까지의 모든 측정이 들어 있습니다.' },
        { icon: FileSpreadsheet, title: 'PDF와 Excel', body: '전달용으로 보기 좋게 구성한 PDF와, 숫자를 더 다루고 싶을 때 쓰는 Excel 파일입니다.' },
      ],
    },
    {
      kind: 'faq',
      eyebrow: '자주 묻는 질문',
      title: '보고서에 대해 많이 물어보시는 것',
      items: [
        // Checked against lib/export/i18n.ts and lib/gsc/export/labels.ts: both
        // now carry a complete Korean block, so the export really does come out
        // in Korean. Keep this answer and those two files in step.
        { q: '보고서는 어떤 언어로 나오나요?', a: '보고서는 대시보드의 언어로 나옵니다. 한국어가 그 가운데 하나이며, 히브리어, 영어, 스페인어, 포르투갈어, 프랑스어, 이탈리아어, 일본어, 독일어, 네덜란드어, 폴란드어도 있습니다.' },
        { q: '고객마다 따로 보고서를 만들 수 있나요?', a: '네. 사이트마다 프로젝트가 하나이고, 프로젝트마다 자기 보고서가 있습니다. 요금제에 프로젝트가 몇 개인지는 가격 페이지에 있습니다.' },
        { q: '보고서는 모든 요금제에 있나요?', a: '네. PDF와 Excel 보고서는 모든 요금제에 포함됩니다.' },
      ],
    },
  ],
  cta: {
    title: '첫 보고서까지는 며칠이면 됩니다',
    body: C.closeBody,
    primary: C.check,
    secondary: C.trial,
  },
}
