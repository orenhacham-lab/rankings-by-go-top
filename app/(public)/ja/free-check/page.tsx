import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'SEOとAIの無料診断 - Go Top SEO',
  description:
    'サイトの無料診断です。サイトを実際に読み取り、その事業が何をしているかを把握して、Googleの検索結果とAIの回答で何が妨げになっているかをお見せします。クレジットカードの登録も、継続の縛りもありません。',
  openGraph: {
    title: 'SEOとAIの無料診断',
    description: 'サイトを読み取り、Googleの検索結果とAIの回答で何が妨げになっているかをお見せする無料の診断です',
    url: 'https://www.gotopseo.com/ja/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/ja/free-check',
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
 * components, whose Japanese dictionary covers the chrome only, so that path
 * falls back to English for the summary itself; the short check below it is
 * fully Japanese.
 * See the note in components/free-check/FreeCheckResearch.tsx.
 */
export default async function JapaneseFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="ja" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="ja" initialUrl={initialUrl} /> : <FreeCheckExperience locale="ja" initialUrl={initialUrl} />}
      </main>
      <Footer locale="ja" />
    </div>
  )
}
