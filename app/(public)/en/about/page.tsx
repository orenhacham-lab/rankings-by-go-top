import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PublicNav } from '@/components/PublicNav'

export default function EnglishAboutPage() {
  const values = [
    {
      icon: '👥',
      title: 'Personal Service Without Compromise',
      description: 'We don\'t have a "account manager" that changes every month. You work with professionals who know you.'
    },
    {
      icon: '🔍',
      title: 'Complete Transparency',
      description: 'You always know what\'s happening with your system, what worked, what didn\'t, and how we can improve.'
    },
    {
      icon: '📈',
      title: 'Professional Excellence Driving Results',
      description: 'We won\'t throw inflated jargon at you. We deliver real results.'
    },
    {
      icon: '💼',
      title: 'We\'re a Business Too',
      description: 'So we understand you. The pressure, the budget, and the drive to see results.'
    },
  ]

  const features = [
    {
      icon: '🔎',
      title: 'Search Ranking Tracking',
      description: 'Real-time monitoring of your rankings in Google organic search'
    },
    {
      icon: '🗺️',
      title: 'Google Maps Optimization',
      description: 'Detailed reports on your performance in location-based results'
    },
    {
      icon: '⚡',
      title: 'AI Visibility',
      description: 'Check if your business is mentioned in AI responses, whether your domain is cited, and which sources appear next to you'
    },
    {
      icon: '📊',
      title: 'Reports & Analysis',
      description: 'Reports that show what really matters — Google Organic, Google Maps and AI visibility'
    },
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav locale="en" />

      {/* Hero Section */}
      <section className="relative pt-28 lg:pt-36 pb-12 lg:pb-16 overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15),_transparent_50%)]" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'About', href: '/en/about' }]} />

          <div className="text-center mt-8">
            <h1 className="text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
              About<br />
              <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
                Rankings by Go Top
              </span>
            </h1>
            <p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
              More than 11 years of real digital experience. Now — a platform for tracking your Google rankings and AI visibility.
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* Story Section */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h2 className="text-4xl font-extrabold text-slate-900">The Go Top Story</h2>
                <div className="space-y-4 text-slate-700 leading-relaxed">
                  <p>
                    In a world full of AI, automation and big companies speaking loudly — at Go Top we're doing something different.
                  </p>
                  <p>
                    Something human, sharp, results-focused — and built on more than 11 years of real digital work. With focus on SEO for businesses, website building, and digital advertising.
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
                  <p className="text-white text-xl font-semibold">Years of Experience</p>
                  <p className="text-blue-100 text-sm mt-2">In the digital world</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Philosophy Section */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="relative bg-white rounded-3xl p-12 flex items-center justify-center min-h-96 overflow-hidden shadow-xl border border-slate-200 order-2 lg:order-1">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-[100px]" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-50 rounded-tr-[100px]" />

                <div className="relative grid grid-cols-2 gap-4 w-full max-w-xs">
                  <div className="aspect-square bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                  <div className="aspect-square bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-200">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="aspect-square bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-200">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div className="aspect-square bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-md border border-slate-200">
                  <p className="text-sm font-bold text-slate-900">Quality Over Quantity</p>
                </div>
              </div>

              <div className="space-y-6 order-1 lg:order-2">
                <h2 className="text-4xl font-extrabold text-slate-900">Our Philosophy</h2>
                <div className="space-y-4 text-slate-700 leading-relaxed">
                  <p>
                    We focus on quality, not quantity. We choose to work with businesses that fit us — and give them maximum attention, personal service and accurate support.
                  </p>
                  <p>
                    At Go Top we don't get excited about clicks and impressions. We get excited about your phone ringing. Because at the end of the day — that's what really matters.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why We Built It */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">Why We Built Rankings by Go Top</h2>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 lg:p-12 mb-8 border border-blue-200">
              <p className="text-lg text-slate-700 mb-6">
                While many businesses use generic ranking tracking tools, we kept hearing the same issue over and over:
              </p>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 text-2xl">❌</div>
                  <div>
                    <p className="font-semibold text-slate-900">Expensive and complex tools</p>
                    <p className="text-slate-600">That don't fit small businesses</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 text-2xl">❌</div>
                  <div>
                    <p className="font-semibold text-slate-900">Reports nobody understands</p>
                    <p className="text-slate-600">Data you don't use</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 text-2xl">❌</div>
                  <div>
                    <p className="font-semibold text-slate-900">Lack of real support</p>
                    <p className="text-slate-600">When you need it most</p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-lg text-slate-700 mb-8">
              That's why we built <strong>Rankings by Go Top</strong> — a rank tracking system focused on results, the way we focus on results.
            </p>

            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-8 lg:p-12 border border-indigo-200">
              <p className="text-lg text-slate-700 mb-4">
                Then, in recent years, search changed again. Customers no longer rely only on regular Google results. They ask ChatGPT, Gemini, Perplexity and other AI engines for direct recommendations.
              </p>
              <p className="text-lg text-slate-700">
                That's why Rankings by Go Top doesn't just track your position in Google — it also tracks how your business appears in AI responses. Because that's what really matters — being visible to anyone who searches for you, wherever they search.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">What We Track at Rankings by Go Top</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {features.map((feature) => (
                <div key={feature.title} className="bg-white rounded-2xl p-8 border border-slate-200 hover:border-blue-300 transition-colors">
                  <div className="text-5xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-slate-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-12 text-center">Why Choose Rankings by Go Top</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {values.map((value) => (
                <div key={value.title} className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200">
                  <div className="text-5xl mb-4">{value.icon}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{value.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-600 to-blue-500">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-6">Ready to get started?</h2>
            <p className="text-xl text-blue-100 mb-8">
              Start today for free and test the platform yourself
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/login"
                className="px-8 py-4 rounded-lg bg-white text-blue-600 font-semibold text-lg hover:bg-blue-50 transition-colors shadow-lg"
              >
                Start Free Trial
              </Link>
              <a
                href="mailto:oren@gotop.co.il"
                className="px-8 py-4 rounded-lg border-2 border-white text-white font-semibold text-lg hover:bg-white/10 transition-colors"
              >
                Contact Our Team
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
