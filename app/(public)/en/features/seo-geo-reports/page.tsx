import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FileText, BarChart2, TrendingUp, Share2, Clock, Zap, Award } from 'lucide-react'

export const metadata: Metadata = {
  title: 'SEO/GEO Reports | Rankings by Go Top',
  description: 'Professional PDF and Excel reports with rankings, trends, and competitive analysis. Client-ready reports in seconds.',
}

export default function SEOGeoReportsFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-green-50 via-white to-emerald-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 text-green-800 text-sm font-medium border border-green-200">
                <FileText className="w-4 h-4" />
                Professional Reports in Seconds
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              Reports Your Clients Will Actually Read
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              Every month with one click. Professional PDF and Excel reports that show exactly what you achieved and where you're heading.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/en/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-green-700 hover:to-emerald-700 transition-all text-center"
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

            {/* Visual Mockup */}
            <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 flex items-center gap-2">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
              </div>
              <div className="p-8">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-900">Monthly Report - May 2025</h3>
                    <div className="flex gap-2">
                      <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200">📄 PDF</button>
                      <button className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200">📊 Excel</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <div className="text-sm text-slate-600 mb-2">Rankings Up</div>
                      <div className="text-3xl font-bold text-blue-600">+12</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <div className="text-sm text-slate-600 mb-2">Keywords Tracking</div>
                      <div className="text-3xl font-bold text-green-600">847</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                      <div className="text-sm text-slate-600 mb-2">Top 3 Rankings</div>
                      <div className="text-3xl font-bold text-purple-600">18</div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                      <div className="text-sm text-slate-600 mb-2">Avg Position</div>
                      <div className="text-3xl font-bold text-orange-600">4.2</div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-6">
                    <h4 className="font-semibold text-slate-900 mb-3">Top Performing Pages</h4>
                    <div className="space-y-2">
                      {['Keywords in Top 3: 12', 'Pages in Top 10: 8', 'New Rankings: 6'].map((item, i) => (
                        <div key={i} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                          <span className="text-sm text-slate-700">{item}</span>
                          <div className="h-2 w-20 bg-green-400 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why It Matters */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">Why Reports Matter So Much</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              A good report says: "Here's what I did for you." That's the difference between good service and great service.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-green-200 bg-green-50 hover:shadow-lg transition-shadow">
                <Share2 className="w-10 h-10 text-green-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Demonstrate Value</h3>
                <p className="text-slate-700">
                  A clear report shows your client exactly what rankings changed and how you're improving their business.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-blue-200 bg-blue-50 hover:shadow-lg transition-shadow">
                <Clock className="w-10 h-10 text-blue-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Save Time</h3>
                <p className="text-slate-700">
                  Instead of explaining verbally, send a report. Your client reads it, understands, and moves to the next steps.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-lg transition-shadow">
                <Zap className="w-10 h-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Build Trust</h3>
                <p className="text-slate-700">
                  Monthly reports say: "I'm here, I'm working, I see results." This builds the kind of trust that keeps clients.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">How It Works</h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Configure Your Report</h3>
                  <p className="text-slate-700">
                    Choose which metrics to include: rankings, competitors, AI visibility, trends - full control.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">System Generates</h3>
                  <p className="text-slate-700">
                    We compile data, create charts, and fill the professional template automatically.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Download or Send</h3>
                  <p className="text-slate-700">
                    PDF or Excel in seconds. Send to client or save. That easy.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">What's Included in Reports</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <BarChart2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Rankings Summary & Trends</h3>
                  <p className="text-slate-700">Full analysis of your rankings. Up, down, or stable. Detailed breakdown of what changed.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <TrendingUp className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Charts & Graphs</h3>
                  <p className="text-slate-700">Month-over-month visuals. Easy to understand trends at a glance.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <FileText className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Complete Keyword List</h3>
                  <p className="text-slate-700">Every keyword: current ranking, previous ranking, change, URL, and score.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Award className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Competitor Analysis</h3>
                  <p className="text-slate-700">Where you stand vs competitors. Who's in the top 3? Where can you gain ground?</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Share2 className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Custom Branding</h3>
                  <p className="text-slate-700">Add your logo, choose colors, make it yours.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Clock className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Automated Monthly</h3>
                  <p className="text-slate-700">Set it and forget it. Get reports automatically every month.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-green-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">Who Needs These Reports</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-8 border-l-4 border-green-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Digital Agencies</h3>
                <p className="text-slate-700 mb-4">Multiple clients, all asking: "How is my SEO?" Automate with reports.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Automated client reports</li>
                  <li>✓ Proof of service value</li>
                  <li>✓ Client renewals & growth</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-emerald-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">In-House SEO Teams</h3>
                <p className="text-slate-700 mb-4">You track rankings yourself. Now show leadership the results monthly.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Executive reports</li>
                  <li>✓ Prove SEO investment value</li>
                  <li>✓ Plan future strategies</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-blue-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Content Teams</h3>
                <p className="text-slate-700 mb-4">Using Rankings by Go Top to track content performance? Share monthly wins.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Monthly team reports</li>
                  <li>✓ Clear targets for writers</li>
                  <li>✓ Content impact proof</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-purple-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Marketing Teams</h3>
                <p className="text-slate-700 mb-4">Need to show ROI from SEO? Reports make it clear and measurable.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ ROI clarity from SEO</li>
                  <li>✓ Compare to other channels</li>
                  <li>✓ Future planning data</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-green-600 to-emerald-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">Generate Your First Professional Report</h2>
            <p className="text-xl text-green-100 mb-8">
              One click. That's all it takes. See your first report in minutes.
            </p>
            <Link
              href="/en/signup"
              className="inline-block px-8 py-4 rounded-lg bg-white text-green-600 text-lg font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
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
