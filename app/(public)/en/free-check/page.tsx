import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'Free SEO & AI site check - Rankings by Go Top',
  description:
    'A free site check: we really read your site, work out what the business does, and show what is holding you back in Google and in AI answers. No card, no commitment.',
  openGraph: {
    title: 'Free SEO & AI site check',
    description: 'A free check that reads your site and shows what holds you back in Google and AI answers',
    url: 'https://www.gotopseo.com/en/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/free-check',
    languages: buildHreflangAlternates('/free-check', '/en/free-check'),
  },
}

/**
 * `?url=` lets the landing-page hero field hand the address over and start the
 * scan straight away. It is passed to the client as a plain string and is
 * admitted server-side by the API's own URL guard, never trusted here.
 *
 * With the research before sign-up on (ENABLE_SEED_SCAN and
 * ENABLE_PRESIGNUP_RESEARCH, preview only) the same address runs the whole
 * research instead (components/free-check/FreeCheckResearch.tsx). Off, as in
 * Production, this page is exactly the short check.
 */
export default async function EnglishFreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <PublicNav locale="en" />
      <main className="pt-24">
        {research ? <FreeCheckResearch locale="en" initialUrl={initialUrl} /> : <FreeCheckExperience locale="en" initialUrl={initialUrl} />}
      </main>
      <Footer />
    </div>
  )
}
