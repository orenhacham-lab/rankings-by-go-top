import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Search, TrendingUp, Globe, Smartphone, BarChart3, Clock } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Google Organic Rank Tracking | Rankings by Go Top',
  description: 'Monitor your Google search rankings by keyword, location, language, and device. Track trends, competitor analysis, and detailed reports in real-time.',
}

export default function GoogleOrganicFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium border border-blue-200">
                <Search className="w-4 h-4" />
                Google Rank Tracking
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              Monitor Your Google Rankings in Real-Time
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              Get accurate position data for every keyword. Track trends, analyze competitors, and generate detailed reports that prove ROI.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/en/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-indigo-700 transition-all text-center"
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
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-700">Keyword</div>
                    <div className="text-sm font-medium text-slate-700">Position</div>
                    <div className="text-sm font-medium text-slate-700">Change</div>
                    <div className="text-sm font-medium text-slate-700">URL</div>
                  </div>
                  <div className="border-t border-slate-200" />
                  {[
                    { keyword: 'digital marketing agency', pos: 3, change: '↑2', url: 'example.com' },
                    { keyword: 'SEO services', pos: 8, change: '↓1', url: 'example.com' },
                    { keyword: 'rank tracking software', pos: 1, change: '→', url: 'example.com' },
                    { keyword: 'local SEO tools', pos: 12, change: '↑5', url: 'example.com' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-900 font-medium">{item.keyword}</span>
                      <span className="text-slate-600">{item.pos}</span>
                      <span className={item.change.includes('↑') ? 'text-green-600' : item.change.includes('↓') ? 'text-red-600' : 'text-slate-600'}>
                        {item.change}
                      </span>
                      <span className="text-slate-600 text-xs">{item.url}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why It Matters */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">Why Rank Tracking Matters</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              High Google rankings drive organic traffic. Track daily to understand what works and optimize your SEO strategy.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-blue-200 bg-blue-50 hover:shadow-lg transition-shadow">
                <TrendingUp className="w-10 h-10 text-blue-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Track Trends in Real-Time</h3>
                <p className="text-slate-700">
                  See how your rankings change daily. Identify what SEO strategies are working and what needs adjustment.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-green-200 bg-green-50 hover:shadow-lg transition-shadow">
                <Globe className="w-10 h-10 text-green-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Competitive Analysis</h3>
                <p className="text-slate-700">
                  Know exactly where you stand against competitors. Identify gaps and opportunities to outrank them.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-lg transition-shadow">
                <BarChart3 className="w-10 h-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Professional Reports</h3>
                <p className="text-slate-700">
                  Generate reports that clearly show clients the value of your SEO work and justify continued investment.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">How It Works</h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Add Keywords</h3>
                  <p className="text-slate-700">
                    Add the keywords you want to track. Bulk import from CSV for quick setup.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Set Preferences</h3>
                  <p className="text-slate-700">
                    Choose country, city, language, and device. Get precise data for your target audience.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Get Results</h3>
                  <p className="text-slate-700">
                    Daily automatic tracking. View rankings, trends, and insights on a professional dashboard.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">What You Can Measure</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Smartphone className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Device-Specific Tracking</h3>
                  <p className="text-slate-700">Track rankings on desktop, mobile, and tablet. Rankings often vary by device.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Globe className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Geographic Tracking</h3>
                  <p className="text-slate-700">Track by country, city, and language. Each location can have different results.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <TrendingUp className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Trend Analysis</h3>
                  <p className="text-slate-700">See how rankings change over time with detailed graphs and historical data.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <BarChart3 className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Competitor Tracking</h3>
                  <p className="text-slate-700">Monitor competitor rankings. See where they rank and where you can gain ground.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Clock className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Daily Automatic Checks</h3>
                  <p className="text-slate-700">System checks rankings every day automatically. You just review the results.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Search className="w-6 h-6 text-pink-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Complete Data</h3>
                  <p className="text-slate-700">For each keyword, get the ranking URL, meta description, and more details.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">Who It's For</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-8 border-l-4 border-blue-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Small & Medium Businesses</h3>
                <p className="text-slate-700 mb-4">If you have a website and want customers to find you through Google, this is essential.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Simple, clear tracking</li>
                  <li>✓ Affordable for small teams</li>
                  <li>✓ Reports to share with clients</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-indigo-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Digital Agencies</h3>
                <p className="text-slate-700 mb-4">Your clients ask monthly: "How's our SEO performing?" Here's the answer.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Client presentation reports</li>
                  <li>✓ Track multiple projects simultaneously</li>
                  <li>✓ Proof of service value</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-green-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Marketing Managers</h3>
                <p className="text-slate-700 mb-4">Responsible for website performance? You need accurate rank data and reports.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Detailed performance analytics</li>
                  <li>✓ Problem identification</li>
                  <li>✓ Evidence of marketing impact</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-purple-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">SEO Professionals</h3>
                <p className="text-slate-700 mb-4">You need real-time rankings to prove your work is having impact.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Real-time results</li>
                  <li>✓ Evidence of SEO effectiveness</li>
                  <li>✓ Clear KPIs and goals</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">Start Tracking Your Rankings Today</h2>
            <p className="text-xl text-blue-100 mb-8">
              Free trial for 7 days, no credit card required. See exactly where your site ranks.
            </p>
            <Link
              href="/en/signup"
              className="inline-block px-8 py-4 rounded-lg bg-white text-blue-600 text-lg font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
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
