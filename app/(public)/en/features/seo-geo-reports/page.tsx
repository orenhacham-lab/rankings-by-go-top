import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'SEO/GEO Reports | Rankings by Go Top',
  description: 'Generate professional PDF and Excel reports. Reports with rankings, trends, and AI visibility data.',
}

export default function SEOGeoReportsFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1 pt-40">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              Professional SEO/GEO Reports
            </h1>
            <p className="text-xl text-slate-600 mb-8">
              Generate professional PDF and Excel reports. Reports with rankings, trends, and competitive analysis. Client-ready reports in one click.
            </p>
          </div>

          {/* Key Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">PDF & Excel Reports</h3>
              <p className="text-slate-600">
                Generate beautifully designed reports in minutes. Ready-made templates that you can export with one click.
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Charts & Graphs</h3>
              <p className="text-slate-600">
                View rankings as charts and see monthly trends. Present data visually for easy understanding.
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Period Comparison</h3>
              <p className="text-slate-600">
                Compare rankings between different months. See improvements or declines in positions.
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Competitor Details</h3>
              <p className="text-slate-600">
                Show your clients who the competitors are and where you stand against them on every keyword.
              </p>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-8 mb-12 border border-green-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Why It Matters</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  Professional reports are a great way to show clients the value of your service
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  Monthly reports = opportunity to discuss results and plan next steps with clients
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  PDF reports = something tangible to print or email to clients
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
