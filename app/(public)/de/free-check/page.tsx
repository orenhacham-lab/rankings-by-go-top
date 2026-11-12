import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'
import { SOCIAL_PREVIEW_IMAGE } from '@/lib/seo/social-preview'

export const metadata = {
  title: 'Kostenlose SEO- und KI-Prüfung - Go Top SEO',
  description:
    'Eine kostenlose Prüfung Ihrer Website. Wir lesen die Website wirklich, erfassen, was das Unternehmen tut, und zeigen Ihnen, was in den Suchergebnissen von Google und in den Antworten der KI im Weg steht. Ohne Zahlungskarte und ohne Bindung.',
  openGraph: {
    images: [SOCIAL_PREVIEW_IMAGE],
    title: 'Kostenlose SEO- und KI-Prüfung',
    description: 'Eine kostenlose Prüfung, die Ihre Website liest und Ihnen zeigt, was in den Suchergebnissen von Google und in den Antworten der KI im Weg steht',
    url: 'https://www.gotopseo.com/de/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/de/free-check',
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
 * components, whose German dictionary covers the chrome only, so that path
 * falls back to English for the summary itself; the short check below it is
 * fully German.
 * See the note in components/free-check/FreeCheckResearch.tsx.
 */
export default async function GermanFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="de" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="de" initialUrl={initialUrl} /> : <FreeCheckExperience locale="de" initialUrl={initialUrl} />}
      </main>
      <Footer locale="de" />
    </div>
  )
}
