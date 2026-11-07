import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Gratis SEO- en AI-analyse - Go Top SEO',
  description:
    'Een gratis analyse van uw website. Wij lezen de website echt, leggen vast wat het bedrijf doet en laten u zien wat in de zoekresultaten van Google en in de antwoorden van de AI in de weg staat. Zonder betaalkaart en zonder verplichting.',
  openGraph: {
    title: 'Gratis SEO- en AI-analyse',
    description: 'Een gratis analyse die uw website leest en u laat zien wat in de zoekresultaten van Google en in de antwoorden van de AI in de weg staat',
    url: 'https://www.gotopseo.com/nl/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/nl/free-check',
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
 * components. The Dutch dashboard dictionary answers every path the German one
 * answers, so that screen is Dutch throughout, as is the short check below it.
 * See the note in components/free-check/FreeCheckResearch.tsx.
 */
export default async function DutchFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="nl" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="nl" initialUrl={initialUrl} /> : <FreeCheckExperience locale="nl" initialUrl={initialUrl} />}
      </main>
      <Footer locale="nl" />
    </div>
  )
}
