import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'AI Visibility Tracking | Rankings by Go Top',
  description: 'Discover if your business appears in ChatGPT, Gemini, and Perplexity answers. Monitor your AI visibility.',
}

export default function AIVisibilityFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1 pt-40">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-4">
              AI Visibility Tracking
            </h1>
            <p className="text-xl text-slate-600 mb-8">
              Discover if your business appears in AI answers. Monitor your visibility across ChatGPT, Gemini, Perplexity, and Google AI.
            </p>
          </div>

          {/* Key Features */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">ChatGPT & Gemini</h3>
              <p className="text-slate-600">
                Check if your business is mentioned in ChatGPT answers from OpenAI and Gemini from Google.
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Perplexity & More</h3>
              <p className="text-slate-600">
                Track your visibility in Perplexity and other AI tools.
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Citation Tracking</h3>
              <p className="text-slate-600">
                See which sources (webpages) receive citations in AI answers.
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Timeline Tracking</h3>
              <p className="text-slate-600">
                Monitor changes in your AI visibility over time.
              </p>
            </div>
          </div>

          {/* Benefits Section */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-8 mb-12 border border-purple-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Why It Matters</h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  AI is changing how people search - users rely on AI for information and validation
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  Mentions in AI answers = credibility and higher demand for your business
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">✓</span>
                <span className="text-slate-700">
                  In the coming years - AI visibility will be a key part of digital marketing
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
