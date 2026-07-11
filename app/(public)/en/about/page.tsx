import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'

export default function EnglishAboutPage() {
  const values = [
    {
      title: 'Personal Service Without Compromise',
      description:
        'No "account manager" rotating every month. You work with the same professionals who know your business.',
    },
    {
      title: 'Full Transparency',
      description: 'You always know what is happening in your account, what worked, what did not, and how to improve.',
    },
    {
      title: 'Professionalism That Drives Results',
      description: 'We do not throw inflated jargon at you. We deliver real, measurable, understandable results.',
    },
    {
      title: 'We Run a Business Too',
      description: 'We understand pressure, budget constraints and the need to see results — because we live it as well.',
    },
  ]

  const problems = [
    {
      title: 'Manual rank tracking takes too much time',
      description:
        'Repeated keyword checks, multiple result screens, and manual calculations that weigh down the daily routine.',
    },
    {
      title: 'Reports scattered across multiple tools',
      description:
        'Data lives in Google Search, Google Maps, AI engines and other sources — without a single clear picture.',
    },
    {
      title: 'AI visibility becomes critical',
      description:
        'Customers increasingly ask ChatGPT, Gemini and Perplexity. You need to know whether your business shows up there.',
    },
    {
      title: 'Keyword research that connects to action',
      description:
        'Knowing what people search is not enough. You need to add keywords to tracking and turn them into AI questions quickly.',
    },
  ]

  const approach = [
    {
      title: 'Transparency',
      description: 'Data and methodology are visible, including how each metric is calculated and where it comes from.',
    },
    {
      title: 'Useful data',
      description: 'Reports that tell a clear business story — not just pretty numbers.',
    },
    {
      title: 'Simple interface',
      description:
        'One screen that shows Google rankings, Maps visibility, AI visibility and keyword research — without extra noise.',
    },
    {
      title: 'SEO and GEO combined',
      description: 'Integrated tracking of organic and geographic results alongside AI engine visibility.',
    },
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav locale="en" />

      {/* Hero Section */}
      <section className="relative pt-28 lg:pt-36 pb-12 lg:pb-16 overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15),_transparent_50%)]" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'About', href: '/en/about' }]} locale="en" />

          <div className="text-center mt-8">
            <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
              About
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                Rankings by Go Top
              </span>
            </h1>
            <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
              One platform for tracking Google rankings, AI visibility, keyword research and reports —
              built by Go Top, a digital agency with more than 11 years of experience in SEO and paid
              advertising.
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Who is behind */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h2 className="text-4xl font-extrabold text-slate-900">Who is behind the platform</h2>
                <div className="space-y-4 text-slate-700 leading-relaxed">
                  <p>
                    Rankings by Go Top is built by Go Top — a digital agency with more than 11 years of
                    experience in organic SEO, paid advertising and website building for businesses in
                    Israel and abroad.
                  </p>
                  <p>
                    The platform was born out of our day-to-day work: we saw which reports clients
                    actually understand, which data points help them decide, and where existing tools
                    get in the way. Connecting rank tracking, keyword research and AI visibility into
                    one workflow grew directly out of real client needs.
                  </p>
                </div>
              </div>

              <div className="relative bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 rounded-3xl p-12 flex items-center justify-center min-h-96 overflow-hidden shadow-xl">
                <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                  }}
                />
                <div className="relative text-center">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-md border border-white/30 mb-6 shadow-lg">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div className="text-6xl font-extrabold text-white mb-2 tracking-tight">11+</div>
                  <p className="text-white text-xl font-semibold">years of experience</p>
                  <p className="text-blue-100 text-sm mt-2">in SEO and digital marketing</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why we built it */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-6 text-center">
              Why we built the platform
            </h2>
            <p className="text-lg text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              We wanted to connect every tool you need to monitor a business&rsquo;s digital presence into
              one place — with a clean interface and data you can act on immediately.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {problems.map((problem) => (
                <div
                  key={problem.title}
                  className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-blue-300 transition-colors"
                >
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{problem.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{problem.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What we solve */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-6 text-center">
              What Rankings by Go Top solves
            </h2>
            <p className="text-lg text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              One dashboard that shows the full picture: organic rankings, Maps visibility, AI engine
              presence and keyword research. The data is connected, not scattered across four separate
              tools.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Google rank tracking</h3>
                <p className="text-slate-600 leading-relaxed">
                  Periodic checks of your rankings on pages 1-2 of Google organic, with trends and
                  comparisons over time.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Google Maps visibility</h3>
                <p className="text-slate-600 leading-relaxed">
                  Tracking business presence on Google Maps results, with precise geographic targeting.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-3">AI visibility tracking</h3>
                <p className="text-slate-600 leading-relaxed">
                  See whether your business is mentioned, cited or recommended in answers from ChatGPT,
                  Gemini, Perplexity and other AI engines.
                </p>
              </div>
              <div className="bg-white rounded-2xl p-8 border border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Keyword research that drives action</h3>
                <p className="text-slate-600 leading-relaxed">
                  Fetch keyword ideas, search volumes and competition from Google Ads — and add the
                  selected keywords directly to tracking or turn them into AI questions.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Our approach */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">Our approach</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {approach.map((item) => (
                <div
                  key={item.title}
                  className="bg-white rounded-2xl p-8 border border-slate-200"
                >
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why choose */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">
              Why choose Rankings by Go Top
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {values.map((value) => (
                <div
                  key={value.title}
                  className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200"
                >
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{value.title}</h3>
                  <p className="text-slate-700 leading-relaxed">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-600 to-blue-500">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6">Ready to get started?</h2>
            <p className="text-xl text-blue-100 mb-8">
              7-day free trial. No credit card, no commitment.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/en/signup"
                className="px-8 py-4 rounded-lg bg-white text-blue-600 font-semibold text-lg hover:bg-blue-50 transition-colors shadow-lg"
              >
                Start free trial
              </Link>
              <a
                href="mailto:oren@gotop.co.il"
                className="px-8 py-4 rounded-lg border-2 border-white text-white font-semibold text-lg hover:bg-white/10 transition-colors"
              >
                Contact our team
              </a>
            </div>

            <p className="text-blue-100 text-sm mt-12 pt-8 border-t border-white/20">
              This page was last updated in May 2026
            </p>
          </div>
        </section>
      </main>

      <Footer locale="en" />
    </div>
  )
}
