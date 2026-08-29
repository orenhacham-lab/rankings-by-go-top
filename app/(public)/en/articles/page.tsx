import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata = {
  title: 'SEO, Rank Tracking and AI Visibility Articles | Rankings by Go Top',
  description: 'Articles, guides and tips on Google rank tracking, SEO, and AI visibility monitoring across ChatGPT, Gemini, Perplexity and more.',
  openGraph: {
    title: 'SEO, Rank Tracking and AI Visibility Articles | Rankings by Go Top',
    description: 'Articles and guides on rank tracking, SEO and AI visibility',
    url: 'https://www.gotopseo.com/en/articles',
    type: 'website',
    locale: 'en_US',
  },
  alternates: {
    canonical: 'https://www.gotopseo.com/en/articles',
    languages: buildHreflangAlternates('/articles', '/en/articles'),
  },
}

export default function EnglishArticlesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav locale="en" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto pt-28 pb-12 px-4">
          <Breadcrumbs items={[{ label: 'Articles', href: '/en/articles' }]} locale="en" />
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Articles</h1>
            <p className="text-slate-600">
              Guides and insights on Google rank tracking, SEO and AI visibility
            </p>
          </div>

          {/* Coming soon state */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">English articles are coming soon</h2>
            <p className="text-slate-600 max-w-2xl mx-auto mb-6">
              We&apos;re working on a library of English-language articles about rank tracking,
              SEO best practices, and AI visibility. In the meantime, you can start tracking
              your rankings today with our free 7-day trial.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/en/signup"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all"
              >
                Start Free Trial
              </Link>
              <Link
                href="/en/pricing"
                className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-sm hover:border-slate-300 transition-all"
              >
                View Pricing
              </Link>
            </div>
          </div>

          {/* Software Promo Section */}
          <div className="space-y-8">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 p-8 lg:p-12 shadow-2xl">
              <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                <div className="text-white">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-white text-xs font-semibold mb-4">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    Rankings by Go Top
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-extrabold mb-4 leading-tight">
                    Track Your Rankings<br />in Google, Whenever You Need
                  </h3>
                  <p className="text-blue-100 text-lg mb-6 leading-relaxed">
                    Professional platform for tracking your Google organic and Google Maps rankings.
                    Scan on demand whenever you need, or automatically once a month. Detailed reports, trend tracking and personal support.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/en/signup"
                      className="px-6 py-3 rounded-xl bg-white text-blue-600 font-semibold text-base shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
                    >
                      Start Free Trial
                    </Link>
                    <Link
                      href="/en/pricing"
                      className="px-6 py-3 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white font-semibold text-base hover:bg-white/20 transition-all"
                    >
                      View Pricing
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { num: '1000+', label: 'Keywords' },
                    { num: '2', label: 'Ranking Engines (Google + Maps)' },
                    { num: 'AI', label: 'Visibility Tracking' },
                    { num: '7 days', label: 'Free Trial' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white/10 backdrop-blur rounded-2xl p-4 lg:p-6 border border-white/20">
                      <div className="text-2xl lg:text-3xl font-extrabold text-white mb-1">{stat.num}</div>
                      <div className="text-sm text-blue-100">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: 'Google Organic',
                  desc: 'Track rankings on pages 1-2 of Google with accurate results',
                  icon: (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  ),
                },
                {
                  title: 'Google Maps',
                  desc: 'Track your position by geographic location - city, zip, landmark',
                  icon: (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  ),
                },
                {
                  title: 'Professional Reports',
                  desc: 'Export PDF and Excel reports with trends, comparisons and advanced analysis',
                  icon: (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  ),
                },
              ].map((feat) => (
                <div key={feat.title} className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center mb-4 shadow-md">
                    {feat.icon}
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">{feat.title}</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Footer locale="en" />
    </div>
  )
}
