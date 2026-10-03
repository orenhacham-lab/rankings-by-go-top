import { Newspaper } from 'lucide-react'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'
import { ButtonLink, PageHero, Section } from '@/components/public/marketing'
import { ArticlesPromo, type ArticlesPromoCopy } from '@/components/public/ArticlesPromo'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'SEO, Rank Tracking and AI Visibility Articles | Go Top SEO',
  description: 'Articles, guides and tips on Google rank tracking, SEO, and AI visibility monitoring across ChatGPT, Gemini, Perplexity and more.',
  openGraph: {
    title: 'SEO, Rank Tracking and AI Visibility Articles | Go Top SEO',
    description: 'Articles and guides on rank tracking, SEO and AI visibility',
    url: 'https://www.gotopseo.com/en/articles',
    type: 'website',
    locale: 'en_US',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles', '/es/articles'),
  },
}

export default function EnglishArticlesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="en" />
      <main className="flex-1">
        <PageHero
          compact
          before={<Breadcrumbs items={[{ label: 'Articles', href: '/en/articles' }]} locale="en" />}
          title="Articles"
          subtitle="Guides and insights on Google rank tracking, SEO and AI visibility"
        />

        <Section className="pt-10 sm:pt-12 lg:pt-14">
          {/* Coming soon state */}
          <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card sm:px-10">
            <div className="mb-1 flex size-12 items-center justify-center rounded-inset bg-action-soft text-action ring-8 ring-sunk/70" aria-hidden="true">
              <Newspaper className="size-5" />
            </div>
            <h2 className="text-title font-bold tracking-tight text-ink">English articles are coming soon</h2>
            <p className="max-w-2xl text-section font-normal text-body text-pretty">
              We&apos;re working on a library of English-language articles about rank tracking,
              SEO best practices, and AI visibility. In the meantime, you can start tracking
              your rankings today with our free 7-day trial.
            </p>
            <div className="mt-4 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
              <ButtonLink href="/en/signup" size="lg">Start Free Trial</ButtonLink>
              <ButtonLink href="/en/pricing" variant="secondary" size="lg">View Pricing</ButtonLink>
            </div>
          </div>

          {/* Software Promo Section */}
          <div className="mt-16 sm:mt-20">
            <ArticlesPromo copy={PROMO} />
          </div>
        </Section>
      </main>
      <Footer locale="en" />
    </div>
  )
}

const PROMO: ArticlesPromoCopy = {
  badge: 'Go Top SEO',
  title: ['Track Your Rankings', 'in Google, Whenever You Need'],
  body: 'Professional platform for tracking your Google organic and Google Maps rankings. Scan on demand whenever you need, or automatically once a month. Detailed reports, trend tracking and personal support.',
  signup: { label: 'Start Free Trial', href: '/en/signup' },
  pricing: { label: 'View Pricing', href: '/en/pricing' },
  stats: [
    { num: '1000+', label: 'Keywords' },
    { num: '2', label: 'Ranking Engines (Google + Maps)' },
    { num: 'AI', label: 'Visibility Tracking' },
    { num: '7 days', label: 'Free Trial' },
  ],
  features: [
    { title: 'Google Organic', desc: 'Track rankings on pages 1-2 of Google with accurate results' },
    { title: 'Google Maps', desc: 'Track your position by geographic location - city, zip, landmark' },
    { title: 'Professional Reports', desc: 'Export PDF and Excel reports with trends, comparisons and advanced analysis' },
  ],
}
