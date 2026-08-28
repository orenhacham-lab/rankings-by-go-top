import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Brain, MessageSquare, Zap, TrendingUp, Link2, BarChart3 } from 'lucide-react'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'AI Visibility Tracking | Rankings by Go Top',
  description: 'Track your business mentions in ChatGPT, Gemini, Perplexity, and Google AI. Monitor GEO - Generative Engine Optimization.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/ai-visibility-tracking',
    languages: buildHreflangAlternates(
      '/features/ai-visibility-tracking',
      '/en/features/ai-visibility-tracking'
    ),
  },
}

export default function AIVisibilityFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-purple-50 via-white to-indigo-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 text-purple-800 text-sm font-medium border border-purple-200">
                <Brain className="w-4 h-4" />
                GEO - Generative Engine Optimization
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              Monitor Your Business in AI Answers
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              More people use ChatGPT, Gemini, and Perplexity to find information. If you're mentioned there, you'll get discovered. Track your AI visibility now.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/en/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-purple-700 hover:to-indigo-700 transition-all text-center"
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
                  <h3 className="font-bold text-slate-900 mb-4">AI Mentions for: "best home loan options"</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200">
                      <div className="w-10 h-10 rounded-lg bg-purple-200 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-purple-700" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">ChatGPT (OpenAI)</div>
                        <div className="text-sm text-slate-600">✓ Mentioned as trusted lender</div>
                      </div>
                      <span className="text-lg font-bold text-green-600">✓</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200">
                      <div className="w-10 h-10 rounded-lg bg-blue-200 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-blue-700" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">Gemini (Google)</div>
                        <div className="text-sm text-slate-600">✓ Direct quote from your website</div>
                      </div>
                      <span className="text-lg font-bold text-green-600">✓</span>
                    </div>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
                      <div className="w-10 h-10 rounded-lg bg-gray-300 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-gray-700" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">Perplexity</div>
                        <div className="text-sm text-slate-600">✗ Not mentioned in answer</div>
                      </div>
                      <span className="text-lg font-bold text-red-600">✗</span>
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
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">Why AI Visibility Will Matter</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              In a few years, GEO will be as important as SEO. Start measuring it now.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-purple-200 bg-purple-50 hover:shadow-lg transition-shadow">
                <Brain className="w-10 h-10 text-purple-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">New Search Paradigm</h3>
                <p className="text-slate-700">
                  Google is no longer the only search engine. AI tools are becoming the primary research method for many users.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-indigo-200 bg-indigo-50 hover:shadow-lg transition-shadow">
                <Link2 className="w-10 h-10 text-indigo-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Mentions = Credibility</h3>
                <p className="text-slate-700">
                  Appearing in AI answers is like getting a recommendation from the AI itself. It builds trust and authority.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-pink-200 bg-pink-50 hover:shadow-lg transition-shadow">
                <TrendingUp className="w-10 h-10 text-pink-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Competitors Are Already There</h3>
                <p className="text-slate-700">
                  Your competitors are already appearing in AI answers. Don't get left behind.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-purple-50 to-indigo-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">How Tracking Works</h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center text-lg font-bold">1</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Choose Questions</h3>
                  <p className="text-slate-700">
                    Select the questions customers might ask AI about your business or industry.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center text-lg font-bold">2</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">System Queries AI</h3>
                  <p className="text-slate-700">
                    We ask ChatGPT, Gemini, Perplexity, and more. Each AI tool is queried separately.
                  </p>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center text-lg font-bold">3</div>
                <div className="bg-white rounded-lg p-8 border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Get Clear Results</h3>
                  <p className="text-slate-700">
                    See where you're mentioned, how you're cited, and track changes over time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">What You Can Track</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Brain className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">All Major AI Engines</h3>
                  <p className="text-slate-700">ChatGPT, Gemini, Perplexity, Google AI, and more - each tracked separately.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <MessageSquare className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Citation Tracking</h3>
                  <p className="text-slate-700">See exactly how your site is cited in AI answers. Summary? Link? Attribution?</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Link2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Source Page Tracking</h3>
                  <p className="text-slate-700">See which pages from your website receive AI citations for optimization.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Zap className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Trends Over Time</h3>
                  <p className="text-slate-700">See how AI mentions change week to week and month to month.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <BarChart3 className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Professional Reports</h3>
                  <p className="text-slate-700">PDF and Excel reports showing your AI visibility clearly.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <TrendingUp className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Competitive Tracking</h3>
                  <p className="text-slate-700">Monitor where competitors appear in AI answers. Know your competitive landscape.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Who It's For */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-purple-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-16">Who It's Critical For</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg p-8 border-l-4 border-purple-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Content Creators & Writers</h3>
                <p className="text-slate-700 mb-4">If you write blogs or content, being cited in AI is now a key metric of success.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Know which articles are cited</li>
                  <li>✓ Optimize for AI mentions</li>
                  <li>✓ Prove content impact</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-indigo-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Digital Agencies & SEO</h3>
                <p className="text-slate-700 mb-4">Clients will soon ask: "Where are we in AI answers?" Be ready with the answer.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ New service to offer clients</li>
                  <li>✓ Forward-thinking positioning</li>
                  <li>✓ Competitive advantage</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-pink-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Podcasters & Media</h3>
                <p className="text-slate-700 mb-4">If you create media or podcasts, AI visibility is a new distribution channel.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Track AI mentions</li>
                  <li>✓ Prove audience reach</li>
                  <li>✓ Partnership opportunities</li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-8 border-l-4 border-orange-600">
                <h3 className="text-xl font-bold text-slate-900 mb-3">Marketing & Product Managers</h3>
                <p className="text-slate-700 mb-4">A new KPI for success. Track visibility as AI transforms how people search.</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>✓ Modern success metrics</li>
                  <li>✓ Competitive benchmarking</li>
                  <li>✓ Executive reports</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-purple-600 to-indigo-600">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">Stay Ahead with AI Visibility Tracking</h2>
            <p className="text-xl text-purple-100 mb-8">
              Get ahead of the curve. Start measuring AI visibility today.
            </p>
            <Link
              href="/en/signup"
              className="inline-block px-8 py-4 rounded-lg bg-white text-purple-600 text-lg font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
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
