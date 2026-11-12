import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: '무료 SEO·AI 분석 - Go Top SEO',
  description:
    '사이트를 무료로 분석해 드립니다. 실제로 사이트를 읽고, 어떤 업체인지 정리하고, Google 검색 결과와 AI 답변에서 무엇이 가로막고 있는지 보여 드립니다. 카드도 약정도 없습니다.',
  openGraph: {
    title: '무료 SEO·AI 분석',
    description: '사이트를 읽고 Google 검색 결과와 AI 답변에서 무엇이 가로막고 있는지 보여 주는 무료 분석',
    url: 'https://www.gotopseo.com/ko/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ko/free-check',
    languages: buildHreflangAlternates('/free-check', '/en/free-check', '/es/free-check'),
  },
}

/**
 * `?url=` lets the landing-page hero field hand the address over and start the
 * scan straight away, exactly as on the Hebrew, English, Spanish and French
 * pages. It is passed to the client as a plain string and is admitted
 * server-side by the API's own URL guard, never trusted here.
 *
 * The research before sign-up (preview only) renders the DASHBOARD's summary
 * components. The Korean dashboard dictionary answers every path the Dutch one
 * answers, so that screen is Korean throughout, as is the short check below it.
 * See the note in components/free-check/FreeCheckResearch.tsx.
 */
export default async function KoreanFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="ko" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="ko" initialUrl={initialUrl} /> : <FreeCheckExperience locale="ko" initialUrl={initialUrl} />}
      </main>
      <Footer locale="ko" />
    </div>
  )
}
