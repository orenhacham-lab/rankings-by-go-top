import { Metadata } from 'next'
import Link from 'next/link'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import {
  FileText,
  Wand2,
  Edit3,
  CalendarClock,
  Send,
  Users,
  CheckCircle2,
  Image as ImageIcon,
  Link2,
  Search,
  Brain,
} from 'lucide-react'
import { buildHreflangAlternates } from '@/lib/seo/hreflang'

export const metadata: Metadata = {
  title: 'SEO/GEO Content Creation, Scheduling & Publishing | Rankings by Go Top',
  description:
    'Plan topics, get a complete AI-generated article draft, edit it, schedule it, and publish straight to WordPress or Shopify — all from one place.',
  alternates: {
    canonical: 'https://www.gotopseo.com/en/features/seo-geo-content-publishing',
    languages: buildHreflangAlternates(
      '/features/seo-geo-content-publishing',
      '/en/features/seo-geo-content-publishing'
    ),
  },
}

export default function SeoGeoContentPublishingFeaturePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <PublicNav locale="en" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-emerald-50 via-white to-teal-50 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-800 text-sm font-medium border border-emerald-200">
                <FileText className="w-4 h-4" />
                Content Creation & Publishing
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 text-center mb-6 leading-tight">
              SEO/GEO Content Creation, Scheduling & Publishing
            </h1>

            {/* Subheading */}
            <p className="text-xl text-slate-600 text-center mb-12 max-w-2xl mx-auto">
              From topic to published article, without bouncing between a separate research tool, a writing tool, and a publishing tool. It all happens in one place — and every draft is yours to review before it goes anywhere.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/en/signup"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-emerald-700 hover:to-teal-700 transition-all text-center"
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

        {/* Why It Matters */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">Why content usually turns into a chore</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              Publishing a single article typically means jumping between several disconnected tools — which is exactly why regular content is the first thing to slip.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-lg border border-emerald-200 bg-emerald-50 hover:shadow-lg transition-shadow">
                <Search className="w-10 h-10 text-emerald-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Topic research, on its own</h3>
                <p className="text-slate-700">
                  Figuring out what's worth writing about, checking what competitors already cover, and making sure it actually matters to your business.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-teal-200 bg-teal-50 hover:shadow-lg transition-shadow">
                <Edit3 className="w-10 h-10 text-teal-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Writing and editing, somewhere else</h3>
                <p className="text-slate-700">
                  A solid first draft takes real time to write, and then still needs another pass to edit, tighten, and make sure it says what you meant.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-cyan-200 bg-cyan-50 hover:shadow-lg transition-shadow">
                <Send className="w-10 h-10 text-cyan-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">Publishing, manually, in a third tool</h3>
                <p className="text-slate-700">
                  Then comes copying it into your site, adding an image, filling in SEO fields, and remembering when it's even supposed to go live.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-emerald-50 to-teal-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">How it works</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              Five steps, from planning a topic to an article live on your site.
            </p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
              {[
                {
                  number: '1',
                  title: 'Plan a topic',
                  description: 'The system helps you plan relevant topics for your business, based on your keywords and niche.',
                },
                {
                  number: '2',
                  title: 'Approve it',
                  description: 'Look through the suggested topics and pick the ones that fit what you need right now.',
                },
                {
                  number: '3',
                  title: 'Get an AI-generated draft',
                  description: 'From the approved topic, the system writes a complete article — title, body, subheadings, and SEO fields.',
                },
                {
                  number: '4',
                  title: 'Review and edit',
                  description: 'Every article starts as a draft. Read it, edit whatever you need to, and approve it only once it reads the way you want.',
                },
                {
                  number: '5',
                  title: 'Schedule or publish',
                  description: 'Set a future date and time, or publish right away — straight to WordPress or Shopify.',
                },
              ].map((step) => (
                <div key={step.number} className="relative">
                  <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-emerald-600 text-white font-bold text-lg">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">What's included in every article</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              Every draft comes with everything needed to publish a complete article — not just raw text.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Wand2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">A complete article draft</h3>
                  <p className="text-slate-700">From the topic you approved, the AI writes a full article — not just an outline or a summary.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Edit3 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Free editing before publishing</h3>
                  <p className="text-slate-700">Change anything in the draft — title, body, structure — until it reads exactly how you want.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Search className="w-6 h-6 text-cyan-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">SEO title and description</h3>
                  <p className="text-slate-700">Every article comes with a meta title and meta description already written — and you can edit those too.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <ImageIcon className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">A featured image for every article</h3>
                  <p className="text-slate-700">Each article includes a featured image, so you're not hunting one down or uploading it separately.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <Link2 className="w-6 h-6 text-teal-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Suggested internal links</h3>
                  <p className="text-slate-700">The system can suggest relevant internal links from your own site, and you decide which ones actually go in the article.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <CalendarClock className="w-6 h-6 text-cyan-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-slate-900 mb-2">Publish scheduling</h3>
                  <p className="text-slate-700">Set when an approved article should go live, and let the system publish it at the time you picked.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Publishing Destinations */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-50">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Direct publishing to WordPress and Shopify</h2>
            <p className="text-xl text-slate-600 mb-12 max-w-2xl mx-auto">
              Connect your WordPress site or Shopify store, and an approved article goes straight there — no copy-pasting, no extra publishing tool.
            </p>

            <div className="grid sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
              <div className="p-8 rounded-lg border border-slate-200 bg-white hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-2">WordPress</h3>
                <p className="text-slate-600">Connect your WordPress site and publish articles directly to it, including SEO fields and the featured image.</p>
              </div>
              <div className="p-8 rounded-lg border border-slate-200 bg-white hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Shopify</h3>
                <p className="text-slate-600">Connect your Shopify store and publish blog articles directly from the system.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Article Allowance */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-emerald-50 border-t border-emerald-200">
          <div className="max-w-3xl mx-auto">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">How your account's article allowance works</h3>
            <p className="text-slate-600 mb-3 leading-relaxed">
              Every subscription plan includes a set number of AI-generated articles per billing period. The exact number is shown on the pricing page, but the important part is this: the allowance belongs to the account, not to any single project.
            </p>
            <p className="text-slate-600 leading-relaxed">
              That means every article your account gets each billing period is shared across all the projects and sites managed under it — you decide how many go to each site.
            </p>
          </div>
        </section>

        {/* SEO & GEO */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-bold text-slate-900 text-center mb-4">How this supports both SEO and GEO</h2>
            <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
              Consistent, well-planned content is the foundation for both ranking on Google and showing up in AI-generated answers — two different goals worth building for at once.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="p-8 rounded-lg border border-emerald-200 bg-emerald-50">
                <Search className="w-10 h-10 text-emerald-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">SEO — traditional Google search</h3>
                <p className="text-slate-700">
                  Articles with clear structure, meta titles and descriptions, and content that actually answers what people are searching for — all of that helps Google understand and rank your pages. We can't promise a specific ranking, but consistent, well-structured content is the baseline for improving one.
                </p>
              </div>

              <div className="p-8 rounded-lg border border-teal-200 bg-teal-50">
                <Brain className="w-10 h-10 text-teal-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-3">GEO — showing up in AI answers</h3>
                <p className="text-slate-700">
                  More people ask ChatGPT, Gemini, and other AI tools questions directly. Clear, consistent, relevant content increases the chance your articles get used as a source — with no guarantee any specific question will surface a mention.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Agencies */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-emerald-50">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-lg p-8 md:p-12 border-l-4 border-emerald-600 max-w-3xl mx-auto">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-8 h-8 text-emerald-600" />
                <h2 className="text-2xl font-bold text-slate-900">For agencies: splitting the shared allowance across clients</h2>
              </div>
              <p className="text-slate-700 leading-relaxed mb-3">
                Because the article allowance sits at the account level and is shared across every project, an agency running several client sites from one account decides for itself, each month, how many of the available articles go to which client.
              </p>
              <p className="text-slate-700 leading-relaxed">
                There's no need for a separate subscription per client — just prioritize whichever projects need content this month, and adjust the split again next month as priorities change.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 lg:py-24 bg-gradient-to-br from-slate-50 to-emerald-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block text-emerald-600 text-sm font-semibold mb-3">FAQ</div>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
                Questions about content creation and publishing
              </h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq) => (
                <details
                  key={faq.q}
                  className="group bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:border-slate-300"
                >
                  <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none">
                    <h3 className="font-semibold text-slate-900 text-base">{faq.q}</h3>
                    <CheckCircle2 className="shrink-0 w-5 h-5 text-slate-300 group-open:text-emerald-600 transition-colors" />
                  </summary>
                  <div className="px-6 pb-5 text-slate-600 leading-relaxed text-sm">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-6">Ready to stop juggling separate content tools?</h2>
            <p className="text-xl text-slate-600 mb-8">
              Start your free 7-day trial today. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/en/signup"
                className="inline-block px-8 py-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl hover:from-emerald-700 hover:to-teal-700 transition-all"
              >
                Start Free Trial
              </Link>
              <Link
                href="/en/pricing"
                className="inline-block px-8 py-4 rounded-lg border-2 border-slate-300 text-slate-700 text-lg font-semibold hover:bg-slate-50 transition-all"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer locale="en" />
    </div>
  )
}

const faqs = [
  {
    q: 'How does the article allowance work, and when does it reset?',
    a: 'Every subscription plan includes a set number of AI-generated articles per billing period. The allowance is shared across all projects on the account, resets at the start of each new billing period, and unused articles do not roll over.',
  },
  {
    q: 'What happens if I run out of articles partway through the period?',
    a: 'Once you reach your current plan\'s article limit, you can upgrade to a plan with a larger allowance to keep generating articles within the same billing period.',
  },
  {
    q: 'Do I have to edit the article before it publishes?',
    a: 'No, but you always have the chance to. Every generated article is a draft — you can read it, edit any part of it, and only then approve it for publishing or scheduling.',
  },
  {
    q: 'Which platforms can I publish to?',
    a: 'Direct publishing is supported for WordPress and Shopify. Connect your project to one of them, and approved articles publish straight there.',
  },
  {
    q: 'How does publish scheduling work?',
    a: 'Once you approve an article, you can publish it immediately or set a future date and time. The system publishes it automatically at the time you chose.',
  },
  {
    q: 'How do we split the allowance across multiple client sites?',
    a: 'The allowance lives at the account level and is shared across every project on it. An agency managing several client sites decides for itself, month to month, how many of the available articles go to each project.',
  },
  {
    q: 'Do articles come with a featured image and SEO titles automatically?',
    a: 'Yes — every generated article includes a featured image along with an SEO-ready meta title and description, and you can edit all of them before publishing.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes, there\'s a free 7-day trial with no credit card required, which includes generating a sample article so you can see the workflow for yourself.',
  },
]
