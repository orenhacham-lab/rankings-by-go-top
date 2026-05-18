import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Google Maps Rank Tracking | Rankings by Go Top',
  description: 'Monitor your local visibility in Google Maps. Track positions by city and region. Compete effectively in local search.',
}

export default function GoogleMapsFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1 pt-40">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              Google Maps Rank Tracking
            </h1>
            <p className="text-xl text-slate-600 mb-8">
              Monitor your local visibility in Google Maps. Track positions by city and region. Compete in the local market.
            </p>
          </div>

          {/* Key Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Accurate Local Tracking</h3>
              <p className="text-slate-600">
                Check your position in Google Maps by city and region. Get accurate data on your local search visibility.
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Precise Geographic Targeting</h3>
              <p className="text-slate-600">
                Track rankings by GPS coordinates, postal code, or neighborhood. Perfect for businesses with multiple locations.
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Local Search Terms</h3>
              <p className="text-slate-600">
                Track local search terms like "plumber in New York" or "dental clinic in Los Angeles".
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Local Competitor Analysis</h3>
              <p className="text-slate-600">
                Track your local competitors' rankings for every search term.
              </p>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-8 mb-12 border border-amber-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Why It Matters</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  Google Maps is the first place customers search for local businesses
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  High Google Maps ranking = more calls, inquiries, and store visits
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  For local businesses - Google Maps is more important than traditional SEO
                </span>
              </li>
            </ul>
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <Link
              href="/en/signup"
              className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold shadow-md hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              Start Free Trial
            </Link>
          </div>
        </section>
      </main>

      <Footer locale="en" />
    </div>
  )
}
