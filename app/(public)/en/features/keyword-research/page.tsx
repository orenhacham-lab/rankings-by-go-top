import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Search, TrendingUp, Target, PieChart, Zap, Check } from 'lucide-react'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'Keyword Research | Rankings by Go Top',
  description: 'Discover keyword ideas with Google Ads data. Check search volume, competition, and CPC estimates. Add keywords directly to rank tracking and AI questions.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/keyword-research',
    languages: buildHreflangAlternates(
      '/features/keyword-research',
      '/en/features/keyword-research'
    ),
  },
}

export default function KeywordResearchFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-amber-50 via-white to-orange-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 text-sm font-medium border border-amber-200">
                <Search className="w-4 h-4" />
                Keyword Research
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              Discover Keywords with Google Ads Data
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              Research keyword ideas, check search volume and competition, then add them directly to rank tracking or AI visibility questions.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/en/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-amber-700 hover:to-orange-700 transition-all text-center"
              >
                Start Free Trial
              </Link>
              <Link
                href="/en/pricing"
                className="px-8 py-4 rounded-lg border-2 border-slate-300 text-slate-700 text-lg font-semibold hover:bg-slate-50 transition-all text-center"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-12 text-center">What You Can Do</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Search,
                  title: 'Keyword Ideas',
                  description: 'Find related keyword ideas based on your seed keyword using Google Ads API data.',
                },
                {
                  icon: TrendingUp,
                  title: 'Search Volume',
                  description: 'View estimated monthly search volume for each keyword to understand demand.',
                },
                {
                  icon: Target,
                  title: 'Competition Data',
                  description: 'Check competition levels (Low, Medium, High) and competitiveness index.',
                },
                {
                  icon: PieChart,
                  title: 'CPC Estimates',
                  description: 'See low and high top-of-page bid estimates to understand advertiser demand.',
                },
                {
                  icon: Zap,
                  title: 'Quick Add to Projects',
                  description: 'Add selected keywords directly to your projects for immediate rank tracking.',
                },
                {
                  icon: Check,
                  title: 'Generate AI Questions',
                  description: 'Turn keywords into natural language questions for AI visibility scanning.',
                },
              ].map((feature, i) => {
                const Icon = feature.icon
                return (
                  <div key={i} className="p-6 rounded-lg border border-slate-200 hover:border-amber-300 hover:shadow-lg transition-all">
                    <Icon className="w-8 h-8 text-amber-600 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                    <p className="text-slate-600">{feature.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-12 text-center">How It Works</h2>

            <div className="grid sm:grid-cols-3 gap-8">
              {[
                {
                  number: '1',
                  title: 'Search Keywords',
                  description: 'Enter a seed keyword and select your target country and language.',
                },
                {
                  number: '2',
                  title: 'Review Results',
                  description: 'Browse keyword ideas with search volume, competition, and CPC data.',
                },
                {
                  number: '3',
                  title: 'Take Action',
                  description: 'Add keywords to your project, or create AI questions from them.',
                },
              ].map((step) => (
                <div key={step.number} className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-amber-600 text-white font-bold text-lg">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Data Note */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-amber-50 border-t border-amber-200">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">About the Data</h3>
            <p className="text-slate-600 mb-3">
              Keyword research data comes from Google Ads API. Search volumes, competition levels, and CPC estimates are approximate and based on Google's aggregated data. Actual performance may vary by campaign, targeting, and other factors.
            </p>
            <p className="text-slate-600">
              Use this data as a starting point for your SEO and content strategy. Always validate with your own analytics and testing.
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">Ready to Accelerate Your Keyword Research?</h2>
            <p className="text-xl text-slate-600 mb-8">
              Start your free 7-day trial today. No credit card required.
            </p>
            <Link
              href="/en/signup"
              className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-amber-700 hover:to-orange-700 transition-all"
            >
              Start Free Trial
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
