import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { PLAN_CATALOG, TRIAL_CATALOG, type PlanCode } from '@/lib/plans/catalog'

const PLAN_ORDER: PlanCode[] = ['regular', 'advanced', 'premium', 'large_agency']

const PLAN_UI: Record<PlanCode, { name: string; description: string }> = {
  regular: { name: 'Basic', description: 'One project, a perfect starting point' },
  advanced: { name: 'Advanced', description: 'For growing businesses with multiple sites' },
  premium: { name: 'Premium', description: 'For businesses and agencies with advanced needs' },
  large_agency: { name: 'Agency', description: 'For agencies with many clients' },
}

/** Highlighted / "most popular" plan — a UI choice, currently pinned to Advanced. */
const HIGHLIGHTED_PLAN: PlanCode = 'advanced'

function formatUSD(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}

const faqs = [
  {
    q: 'How does the article allowance work?',
    a: 'Your article allowance is shared across all projects in your account and resets every billing period. Unused articles don\'t roll over to the next period.',
  },
  {
    q: 'How is an "AI check" counted?',
    a: 'One AI check means running one query in one AI engine. If you check the same query across multiple AI engines (for example ChatGPT and Gemini), each engine counts as a separate check.',
  },
  {
    q: 'How is a "Google check" counted?',
    a: 'One Google check means checking one keyword in one destination — either Google Organic or Google Maps. Checking the same keyword in both counts as two checks.',
  },
  {
    q: 'What\'s the difference between manual and automatic scans?',
    a: 'You can run a manual scan whenever you like, and you can also turn on an automatic monthly scan that runs on its own each billing period. There\'s currently no daily or weekly automatic option — only manual and automatic monthly.',
  },
  {
    q: 'What happens when I create a new article?',
    a: 'Creating a new article uses one credit from your article allowance. Editing, scheduling, or publishing an existing article doesn\'t use an additional credit.',
  },
  {
    q: 'Can I schedule and publish articles automatically?',
    a: 'Yes. You can schedule an article for future publishing or publish it directly to a connected WordPress or Shopify site.',
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: 'Yes, you can switch between plans at any time. The change takes effect and the new limits apply from that point forward.',
  },
  {
    q: 'How does the free trial work?',
    a: `You get ${TRIAL_CATALOG.days} days of free trial, no credit card required, with 1 project, up to ${TRIAL_CATALOG.maxKeywordsPerProject} keywords, up to ${TRIAL_CATALOG.maxGoogleChecksLifetime} Google checks and up to ${TRIAL_CATALOG.maxAIChecksLifetime} AI checks for the whole trial period, plus one AI-generated article so you can try the full workflow.`,
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Cancellation is simple and immediate. You can cancel your subscription anytime from your dashboard, with no penalties or cancellation fees.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. All data is encrypted, stored on secure servers and never shared with third parties. Your privacy is important to us.',
  },
]

export default async function EnglishPricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-white">
      <PublicNav locale="en" />

      {/* Hero */}
      <section className="relative pt-28 lg:pt-36 pb-12 lg:pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15),_transparent_50%)]" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block text-blue-600 text-sm font-semibold mb-3">Pricing Plans</div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
            Plans for every
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400 bg-clip-text text-transparent">
              business size
            </span>
          </h1>
          <p className="text-lg lg:text-xl text-slate-600 leading-relaxed">
            Transparent pricing, no surprises. Start with our free trial and scale as your needs grow.
          </p>
        </div>
      </section>

      {/* Free Trial CTA */}
      {!user && (
        <section className="pb-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
              <div className="flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">
                  Want to try the platform before choosing a plan?
                </h3>
                <p className="text-sm text-slate-600">
                  Start a free {TRIAL_CATALOG.days}-day trial — no credit card required.
                </p>
              </div>
              <Link
                href="/en/signup"
                className="inline-block whitespace-nowrap px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm shadow-md hover:bg-blue-700 transition-colors"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Pricing Cards */}
      <section className="pb-12 lg:pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLAN_ORDER.map((code) => {
              const plan = PLAN_CATALOG[code]
              const ui = PLAN_UI[code]
              const highlighted = code === HIGHLIGHTED_PLAN

              const features = [
                `Up to ${plan.maxProjects} project${plan.maxProjects === 1 ? '' : 's'}`,
                `Up to ${plan.maxKeywordsPerProject} keywords per project`,
                `Up to ${plan.maxGoogleChecksPerPeriodPerProject} Google checks per billing period per project`,
                `Up to ${plan.maxAIChecksPerPeriodPerProject} AI checks per billing period per project`,
                `${plan.maxArticlesPerPeriodAccountWide} articles per billing period, shared across all projects in your account`,
                'Google Organic and Google Maps tracking',
                'AI visibility tracking',
                'Article creation, scheduling and publishing to WordPress and Shopify',
                'PDF and Excel reports',
                'Personal support',
              ]

              return (
                <div
                  key={code}
                  className={`relative rounded-2xl ${
                    highlighted
                      ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl shadow-blue-600/30 scale-100 lg:scale-105 z-10'
                      : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                  } p-6 lg:p-7 flex flex-col`}
                >
                  {highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold shadow-md">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-5">
                    <h3 className={`text-xl font-bold mb-1 ${highlighted ? 'text-white' : 'text-slate-900'}`}>
                      {ui.name}
                    </h3>
                    <p className={`text-sm ${highlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                      {ui.description}
                    </p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl lg:text-5xl font-extrabold ${highlighted ? 'text-white' : 'text-slate-900'}`}>
                        {formatUSD(plan.priceUSD)}
                      </span>
                      <span className={`text-sm ${highlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                        /month
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                            highlighted ? 'bg-white/20' : 'bg-blue-50'
                          }`}
                        >
                          <svg
                            className={`w-3 h-3 ${highlighted ? 'text-white' : 'text-blue-600'}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span className={highlighted ? 'text-blue-50' : 'text-slate-700'}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={user ? '/dashboard' : `/en/signup?plan=${code}`}
                    className={`block w-full px-5 py-3 rounded-xl text-center font-semibold text-sm transition-all ${
                      highlighted
                        ? 'bg-white text-blue-700 hover:bg-blue-50 shadow-lg'
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md'
                    }`}
                  >
                    Start free trial
                  </Link>
                </div>
              )
            })}
          </div>

          {/* Usage clarification */}
          <div className="mt-10 max-w-4xl mx-auto rounded-2xl border border-blue-100 bg-blue-50/60 px-6 py-5 text-center text-sm text-slate-600 leading-relaxed">
            One AI check means running one query in one AI engine. Running the same query across multiple engines consumes one check per engine. Article allowances are shared across all projects in the account and reset each billing cycle.
          </div>

          {/* Comparison note */}
          <p className="text-center text-sm text-slate-500 mt-8">
            All plans include Google Organic, Google Maps and AI visibility tracking, plus article creation and publishing. Allowances vary by plan. Cancel anytime with no penalties.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 lg:py-24 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-block text-blue-600 text-sm font-semibold mb-3">Frequently Asked Questions</div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">
              Have a question? We have answers
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
                  <svg
                    className="shrink-0 w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-6 pb-5 text-slate-600 leading-relaxed text-sm">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-blue-400 px-8 py-12 lg:px-16 lg:py-16 text-center shadow-2xl">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              <h2 className="text-3xl lg:text-4xl font-extrabold text-white mb-4 tracking-tight">
                Ready to get started?
              </h2>
              <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
                Start your free {TRIAL_CATALOG.days}-day trial and test the platform yourself
              </p>
              <Link
                href={user ? '/dashboard' : '/en/signup'}
                className="inline-block px-8 py-4 rounded-xl bg-white text-blue-700 font-semibold text-base shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all"
              >
                {user ? 'Go to Dashboard' : 'Start Free Trial'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer locale="en" />
    </div>
  )
}
