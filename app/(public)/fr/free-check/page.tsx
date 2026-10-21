import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Audit SEO et IA gratuit - Go Top SEO',
  description:
    "Un audit gratuit de votre site : nous le lisons vraiment, nous comprenons ce que fait votre activité et nous vous montrons ce qui vous freine dans Google et dans les réponses des IA. Sans carte bancaire et sans engagement.",
  openGraph: {
    title: 'Audit SEO et IA gratuit',
    description: "Un audit gratuit qui lit votre site et vous montre ce qui vous freine dans Google et dans les réponses des IA",
    url: 'https://www.gotopseo.com/fr/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/fr/free-check',
    languages: buildHreflangAlternates('/free-check', '/en/free-check', '/es/free-check'),
  },
}

/**
 * `?url=` lets the landing-page hero field hand the address over and start the
 * scan straight away, exactly as on the Hebrew, English and Spanish pages. It is passed
 * to the client as a plain string and is admitted server-side by the API's own
 * URL guard, never trusted here.
 *
 * The research before sign-up (preview only) renders the DASHBOARD's summary
 * components, whose French dictionary covers the chrome only, so that path
 * falls back to English for the summary itself; the short check below it is
 * fully French.
 * See the note in components/free-check/FreeCheckResearch.tsx.
 */
export default async function FrenchFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="fr" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="fr" initialUrl={initialUrl} /> : <FreeCheckExperience locale="fr" initialUrl={initialUrl} />}
      </main>
      <Footer locale="fr" />
    </div>
  )
}
