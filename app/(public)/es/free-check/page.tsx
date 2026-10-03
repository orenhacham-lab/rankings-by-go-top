import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Comprobación SEO y de IA gratuita - Go Top SEO',
  description:
    'Una comprobación gratuita de tu web: la leemos de verdad, entendemos a qué se dedica el negocio y te mostramos qué te está frenando en Google y en las respuestas de la IA. Sin tarjeta y sin compromiso.',
  openGraph: {
    title: 'Comprobación SEO y de IA gratuita',
    description: 'Una comprobación gratuita que lee tu web y muestra qué te frena en Google y en las respuestas de la IA',
    url: 'https://www.gotopseo.com/es/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/es/free-check',
    languages: buildHreflangAlternates('/free-check', '/en/free-check', '/es/free-check'),
  },
}

/**
 * `?url=` lets the landing-page hero field hand the address over and start the
 * scan straight away, exactly as on the Hebrew and English pages. It is passed
 * to the client as a plain string and is admitted server-side by the API's own
 * URL guard, never trusted here.
 *
 * The research before sign-up (preview only) renders the DASHBOARD's summary
 * components, which have no Spanish dictionary yet, so that path falls back to
 * English for the summary itself; the short check below it is fully Spanish.
 * See the note in components/free-check/FreeCheckResearch.tsx.
 */
export default async function SpanishFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="es" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="es" initialUrl={initialUrl} /> : <FreeCheckExperience locale="es" initialUrl={initialUrl} />}
      </main>
      <Footer locale="es" />
    </div>
  )
}
