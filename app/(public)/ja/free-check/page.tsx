import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Analisi SEO e IA gratuita - Go Top SEO',
  description:
    'Un’analisi gratuita del vostro sito: lo leggiamo davvero, capiamo che cosa fa la vostra attività e vi mostriamo che cosa vi frena in Google e nelle risposte delle IA. Senza carta di credito e senza vincoli.',
  openGraph: {
    title: 'Analisi SEO e IA gratuita',
    description: 'Un’analisi gratuita che legge il vostro sito e vi mostra che cosa vi frena in Google e nelle risposte delle IA',
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
