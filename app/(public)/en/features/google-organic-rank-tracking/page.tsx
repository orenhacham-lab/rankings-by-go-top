import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Google Organic Rank Tracking | Rankings by Go Top',
  description: 'Monitor your Google search rankings. Track positions by keyword, location, language, and device. Detailed analytics and competitor tracking.',
}

export default function GoogleOrganicFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1 pt-40">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              Google Organic Rank Tracking
            </h1>
            <p className="text-xl text-slate-600 mb-8">
              Monitor your rankings on Google search results. Get accurate position data for every keyword with competitive analysis.
            </p>
          </div>

          {/* Key Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Accurate Rank Tracking</h3>
              <p className="text-slate-600">
                Get precise ranking data for every keyword. We check pages 1-2 of Google search results for accurate positions.
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Geographic Filtering</h3>
              <p className="text-slate-600">
                Track rankings by country, city, and postal code. Perfect for local and national businesses.
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Multiple Languages & Devices</h3>
              <p className="text-slate-600">
                Check rankings in different languages and from different devices (desktop, mobile, tablet) for a complete picture.
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Competitive Analysis</h3>
              <p className="text-slate-600">
                Track competitor positions. Understand the gap and identify opportunities for improvement.
              </p>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-8 mb-12 border border-blue-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Why It Matters</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  High Google rankings = more organic traffic at no marketing cost
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  Continuous tracking helps you understand what works and what needs improvement
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  Easy competitor comparison - know if you're ahead or behind
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
