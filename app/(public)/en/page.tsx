import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

export default async function EnglishHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-white">
      <PublicNav locale="en" />

      {/* Hero Section */}
      <section className="relative pt-28 lg:pt-36 pb-20 lg:pb-28 overflow-hidden">
        {/* Background gradient + grid */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15),_transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgb(226 232 240) 1px, transparent 1px), linear-gradient(to bottom, rgb(226 232 240) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 60% 50% at 50% 30%, black, transparent)',
          }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs lg:text-sm font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            SEO & GEO automation for businesses and agencies
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
            Create, schedule and publish
            <br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-purple-500 bg-clip-text text-transparent">
              search-ready content — then track your visibility
            </span>
          </h1>

          <p className="text-lg lg:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed mb-10">
            Go Top brings your SEO workflow into one platform: plan relevant topics, create and
            review AI-assisted articles, schedule or publish them directly to your website, and
            monitor your visibility across Google Search, Google Maps and leading AI engines.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Link
              href={user ? '/dashboard' : '/en/signup'}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-base shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              {user ? 'Go to Dashboard' : 'Start Your Free 7-Day Trial'}
            </Link>
            <Link
              href="#workflow"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-base shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
            >
              See How It Works
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              No credit card required
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              WordPress and Shopify publishing
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Direct support
            </div>
          </div>

          {/* Hero Visual: Content pipeline mockup */}
          <div className="mt-16 lg:mt-20 relative max-w-5xl mx-auto">
            <div className="absolute -inset-x-4 -inset-y-4 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-2xl blur-2xl" />
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="ml-3 px-3 py-1 rounded-md bg-white border border-slate-200 text-xs text-slate-500 font-mono">
                  gotopseo.com/content
                </div>
              </div>
              {/* Mock content pipeline */}
              <div className="p-6 lg:p-8 bg-gradient-to-br from-slate-50 to-white">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
                  {[
                    { label: 'Topics planned', value: '18', color: 'text-slate-900' },
                    { label: 'Articles in review', value: '5', color: 'text-blue-600' },
                    { label: 'Scheduled', value: '9', color: 'text-indigo-600' },
                    { label: 'Published this month', value: '14', color: 'text-green-600' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white rounded-lg border border-slate-200 p-3 lg:p-4">
                      <div className="text-xs text-slate-500 mb-1">{stat.label}</div>
                      <div className={`text-xl lg:text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Content Board</span>
                    <span className="text-xs text-slate-500">Latest 4 articles</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[
                      { title: 'SEO guide for small businesses', status: 'Published', color: 'text-green-600 bg-green-50' },
                      { title: 'How to choose a marketing agency', status: 'Scheduled', color: 'text-blue-600 bg-blue-50' },
                      { title: 'GEO trends for next year', status: 'In review', color: 'text-amber-600 bg-amber-50' },
                      { title: 'A guide to AI visibility', status: 'Draft', color: 'text-slate-500 bg-slate-100' },
                    ].map((row) => (
                      <div key={row.title} className="px-4 py-3 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{row.title}</span>
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${row.color}`}>
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">Why Go Top</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Content used to need five different tools. Now it needs one
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              A writing tool for drafts, a spreadsheet for planning, a separate rank tracker,
              and a manual login to the CMS to publish — every handoff costs time, and things
              slip through the cracks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8">
              <h3 className="text-lg font-bold text-slate-900 mb-5">Without Go Top</h3>
              <ul className="space-y-4">
                {[
                  'A separate writing tool for drafting content',
                  'A spreadsheet to plan topics and track status',
                  'A separate tool to check Google rankings',
                  'Manual logins to the CMS to publish each piece',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-slate-600">
                    <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl">
              <h3 className="text-lg font-bold mb-5">With Go Top</h3>
              <ul className="space-y-4">
                {[
                  'Plan, create and edit articles in one place',
                  'Schedule and publish straight to WordPress or Shopify',
                  'Track Google rankings and AI visibility alongside your content',
                  'One clear view of your entire SEO workflow',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-200 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Primary content workflow — core positioning */}
      <section id="workflow" className="scroll-mt-28 lg:scroll-mt-36 py-20 lg:py-28 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.25),_transparent_50%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-300 text-sm font-semibold mb-3">From idea to published</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Your content workflow, end to end
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Four steps that turn a topic idea into a published article that supports your SEO
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                num: '1',
                title: 'Plan relevant topics',
                desc: 'Get SEO and GEO topic suggestions for your business, grounded in keywords and the questions people actually ask.',
              },
              {
                num: '2',
                title: 'Generate complete articles',
                desc: 'Produce a full, publish-ready article for each topic you choose — no more starting from a blank page.',
              },
              {
                num: '3',
                title: 'Review and edit',
                desc: 'Go through every article, edit it to match your voice and facts, and approve it before it goes live.',
              },
              {
                num: '4',
                title: 'Schedule or publish',
                desc: 'Publish now or schedule for later — straight to your connected WordPress or Shopify site.',
              },
            ].map((step, idx, arr) => (
              <div key={step.num} className="relative">
                <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-6 h-full">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-bold flex items-center justify-center mb-4">
                    {step.num}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{step.desc}</p>
                </div>
                {idx < arr.length - 1 && (
                  <svg
                    className="hidden lg:block absolute top-1/2 -translate-y-1/2 -right-4 w-8 h-8 text-blue-400/60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supporting capabilities */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">Supporting capabilities</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Everything measured, so you know it&apos;s working
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Alongside planning, creating and publishing content, Go Top tracks how you&apos;re doing and gives you the full picture
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                ),
                title: 'Google Organic rank tracking',
                desc: 'Track your rankings over time, keyword by keyword, and see how the content you publish affects them.',
                color: 'from-blue-500 to-blue-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
                title: 'Google Maps visibility',
                desc: 'Track your Google Maps position by city, zip code or landmark.',
                color: 'from-emerald-500 to-emerald-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                ),
                title: 'AI visibility',
                desc: 'See whether your business is mentioned in answers from ChatGPT, Gemini, Perplexity, Copilot, Grok and Google AI.',
                color: 'from-rose-500 to-rose-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: 'Keyword research',
                desc: 'Discover relevant keywords with search volume and competition data, and turn them into new content topics.',
                color: 'from-amber-500 to-orange-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
                title: 'PDF and Excel reports',
                desc: 'Export clear reports to PDF or Excel with one click, for internal use or to share with clients.',
                color: 'from-purple-500 to-purple-600',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                ),
                title: 'Trend and competitor signals',
                desc: 'Get indicators of trends over time and competitor activity, alongside the tracking on your own site.',
                color: 'from-orange-500 to-orange-600',
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="group relative bg-white rounded-2xl border border-slate-200 p-6 hover:border-slate-300 hover:shadow-lg transition-all"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feat.color} text-white flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform`}>
                  {feat.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{feat.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Account-level 3-step journey */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">Getting Started</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Getting started is simple
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Three steps from connecting your site to content that&apos;s planned, published and measured
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                num: '01',
                title: 'Connect a site and create a project',
                desc: 'Create an account, connect your WordPress or Shopify site, and set up a project for your business or a client.',
              },
              {
                num: '02',
                title: 'Select topics and create content',
                desc: 'Choose and approve suggested topics, generate articles, and review them before they go out.',
              },
              {
                num: '03',
                title: 'Schedule publication and monitor visibility',
                desc: 'Schedule publishing to your connected site, and track your Google rankings and AI visibility over time.',
              },
            ].map((step) => (
              <div key={step.num} className="relative">
                <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm h-full">
                  <div className="text-5xl font-extrabold bg-gradient-to-br from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                    {step.num}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">Who it&apos;s for</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Built for anyone responsible for a website&apos;s SEO
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: 'Small businesses',
                desc: 'One simple system instead of juggling several tools — no in-house marketing team required.',
              },
              {
                title: 'SEO freelancers',
                desc: 'Plan, write and publish content for clients faster, and see the results in the same place.',
              },
              {
                title: 'Digital agencies',
                desc: 'Manage several client sites at once, from topic planning to clear reports for every client.',
              },
              {
                title: 'Marketing teams',
                desc: 'Keep a steady publishing cadence and a shared view of performance, without chasing spreadsheets.',
              },
            ].map((aud) => (
              <div key={aud.title} className="bg-slate-50 rounded-2xl border border-slate-200 p-6 hover:border-slate-300 hover:shadow-lg transition-all">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{aud.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{aud.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why subscribe */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14 lg:mb-16">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">Why subscribe</div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              What you get with the subscription
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: 'Save time',
                desc: 'Fewer tool switches and less manual work across planning, writing and publishing content.',
              },
              {
                title: 'A consistent publishing schedule',
                desc: 'Schedule ahead so you keep a steady publishing cadence, without chasing deadlines.',
              },
              {
                title: 'Content and visibility in one system',
                desc: 'From your first topic to tracking your rankings — all under one roof.',
              },
              {
                title: "A clear view of what's working",
                desc: "Understand which articles and topics are supporting your visibility, and where there's still work to do.",
              },
              {
                title: 'Manage multiple client sites',
                desc: 'Run several projects and client sites from one dashboard, without switching accounts.',
              },
            ].map((why) => (
              <div key={why.title} className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{why.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{why.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Plans for every business size
          </h2>
          <p className="text-slate-600 max-w-xl mx-auto mb-8">
            From a small business just getting started with content to an agency managing several clients — there&apos;s a plan that fits.
          </p>
          <Link
            href="/en/pricing"
            className="inline-block px-8 py-4 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-base shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 px-8 py-14 lg:px-16 lg:py-20 text-center shadow-2xl">
            {/* Decorative circles */}
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-4 tracking-tight">
                Plan, write and publish your next article today
              </h2>
              <p className="text-lg lg:text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
                Start your free 7-day trial. No commitment, no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href={user ? '/dashboard' : '/en/signup'}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white text-blue-700 font-semibold text-base shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
                >
                  {user ? 'Go to Dashboard' : 'Start Your Free 7-Day Trial'}
                </Link>
                <Link
                  href="/en/pricing"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white font-semibold text-base hover:bg-white/20 transition-all"
                >
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer locale="en" />
    </div>
  )
}
