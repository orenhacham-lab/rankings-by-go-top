import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { FreeCheckResearch } from '@/components/free-check/FreeCheckResearch'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'בדיקת SEO ו-AI חינם לאתר - Go Top SEO',
  description:
    'בדיקה חינמית לאתר: אנחנו קוראים את האתר באמת, מבינים במה העסק עוסק, ומראים מה מעכב אתכם בגוגל ובמנועי AI. בלי התחייבות ובלי כרטיס אשראי.',
  openGraph: {
    title: 'בדיקת SEO ו-AI חינם לאתר',
    description: 'בדיקה חינמית שקוראת את האתר שלכם ומראה מה מעכב אתכם בגוגל ובמנועי AI',
    url: 'https://www.gotopseo.com/free-check',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/free-check',
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
export default async function FreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''
  const research = presignupResearchOn(process.env)

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav />
      <main className="flex-1 pt-16 lg:pt-[4.5rem]">
        {research ? <FreeCheckResearch locale="he" initialUrl={initialUrl} /> : <FreeCheckExperience locale="he" initialUrl={initialUrl} />}
      </main>
      <Footer />
    </div>
  )
}
