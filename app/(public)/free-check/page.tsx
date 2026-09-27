import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckExperience } from '@/components/free-check/FreeCheckExperience'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'בדיקת SEO ו-AI חינם לאתר - Rankings by Go Top',
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
 */
export default async function FreeCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const initialUrl = typeof sp.url === 'string' ? sp.url.slice(0, 300) : ''

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <PublicNav />
      <main className="pt-24">
        <FreeCheckExperience locale="he" initialUrl={initialUrl} />
      </main>
      <Footer />
    </div>
  )
}
