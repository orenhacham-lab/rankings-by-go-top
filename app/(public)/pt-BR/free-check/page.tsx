import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Análise gratuita de SEO e de IA - Go Top SEO',
  description:
    'Uma análise gratuita do seu site: nós o lemos de verdade, entendemos o que o negócio faz e mostramos o que está travando você no Google e nas respostas da IA. Sem cartão e sem compromisso.',
  openGraph: {
    title: 'Análise gratuita de SEO e de IA',
    description: 'Uma análise gratuita que lê o seu site e mostra o que trava você no Google e nas respostas da IA',
    url: 'https://www.gotopseo.com/pt-BR/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/pt-BR/free-check',
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
 * components, whose Portuguese dictionary covers the chrome only, so that path
 * falls back to English for the summary itself; the short check below it is
 * fully Portuguese.
 * See the note in components/free-check/FreeCheckResearch.tsx.
 */
export default async function PortugueseFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="pt-BR" />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="pt-BR" initialUrl={initialUrl} /> : <FreeCheckExperience locale="pt-BR" initialUrl={initialUrl} />}
      </main>
      <Footer locale="pt-BR" />
    </div>
  )
}
