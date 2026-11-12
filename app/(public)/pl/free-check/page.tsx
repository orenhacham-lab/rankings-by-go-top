import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'

export const metadata = {
  title: 'Darmowa analiza SEO i AI - Go Top SEO',
  description:
    'Darmowa analiza Państwa witryny. Naprawdę ją czytamy, zapisujemy, czym zajmuje się firma, i pokazujemy, co stoi na drodze w wynikach Google i w odpowiedziach AI. Bez karty i bez zobowiązań.',
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
    title: 'Darmowa analiza SEO i AI',
    description: 'Darmowa analiza, która czyta Państwa witrynę i pokazuje, co stoi na drodze w wynikach Google i w odpowiedziach AI',
    url: 'https://www.gotopseo.com/pl/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pl/free-check',
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
 * components. The Polish dashboard dictionary answers every path the Dutch one
 * answers, so that screen is Polish throughout, as is the short check below it.
 * See the note in components/free-check/FreeCheckResearch.tsx.
 */
export default async function PolishFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="pl" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="pl" initialUrl={initialUrl} /> : <FreeCheckExperience locale="pl" initialUrl={initialUrl} />}
      </main>
      <Footer locale="pl" />
    </div>
  )
}
