import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'

interface Plan {
  name: string
  price: string
  priceSuffix?: string
  description: string
  features: string[]
  cta: string
  highlighted?: boolean
  badge?: string
}

const plans: Plan[] = [
  {
    name: 'Trial',
    price: '₪0',
    priceSuffix: 'Free for 7 days',
    description: 'Perfect to test the system before making a decision',
    features: [
      'One project',
      'Up to 30 keywords',
      'Up to 30 keyword checks during the trial',
      'Up to 3 AI scans during the trial',
      'Basic support',
    ],
    cta: 'Start Free Trial',
  },
  {
    name: 'Regular',
    price: '₪79',
    priceSuffix: '/ month',
    description: 'For small businesses wanting to track multiple projects',
    features: [
      'Up to 3 projects',
      'Up to 50 keywords per project',
      'Up to 50 keyword checks per month per project',
      'Up to 10 AI scans per month per project',
      'PDF & Excel reports',
      'Google Organic, Google Maps & AI visibility',
      'Email support',
    ],
    cta: 'Choose Plan',
  },
  {
    name: 'Advanced',
    price: '₪199',
    priceSuffix: '/ month',
    description: 'The most popular plan for growing businesses',
    features: [
      'Up to 10 projects',
      'Up to 50 keywords per project',
      'Up to 100 keyword checks per month per project',
      'Up to 10 AI scans per month per project',
      'PDF & Excel reports',
      'Google Organic, Google Maps & AI visibility',
      'Advanced trend tracking',
      'Priority support',
    ],
    cta: 'Choose Plan',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Premium',
    price: '₪349',
    priceSuffix: '/ month',
    description: 'For agencies and large businesses with advanced needs',
    features: [
      'Up to 25 projects',
      'Up to 100 keywords per project',
      'Up to 200 keyword checks per month per project',
      'Up to 20 AI scans per month per project',
      'PDF & Excel reports',
      'Google Organic, Google Maps & AI visibility',
      'Advanced trend tracking',
      'VIP priority support',
      'Personal onboarding',
    ],
    cta: 'Choose Plan',
  },
]

const faqs = [
  {
    q: 'How does the free trial work?',
    a: 'You get 7 days of free trial with the Trial plan, no credit card required. You can test all the system\'s capabilities before making a decision. The Trial plan includes up to 3 AI scans.',
  },
  {
    q: 'What is AI visibility tracking?',
    a: 'AI visibility tracking checks if your business appears in AI engine responses (ChatGPT, Gemini, Perplexity, Copilot, Grok, Google AI), which searches mention it, if your domain is cited, and which sources appear in results. It\'s essential to understand your visibility in the AI world.',
  },
  {
    q: 'Can I upgrade or downgrade my plan?',
    a: 'Yes! You can switch between plans anytime. Upgrades take effect immediately, and downgrades apply at the start of your next billing cycle.',
  },
  {
    q: 'How many AI scans do I get with each plan?',
    a: 'Trial plan: up to 3 AI scans. Regular plan: up to 10 AI scans per project. Advanced plan: up to 10 AI scans per project. Premium plan: up to 20 AI scans per project.',
  },
  {
    q: 'What is a "keyword check"?',
    a: 'A keyword check means checking one keyword in either Google Organic or Google Maps. For example, 10 keywords in Google Organic only = 10 checks; the same 10 keywords in both Organic and Maps = 20 checks. Every plan includes a monthly keyword-check allowance per project.',
  },
  {
    q: 'What does a "scan" of keywords include?',
    a: 'One scan checks the position of all your keywords in Google Organic and Google Maps, and generates a complete report with rankings, trends and changes. Each individual position lookup counts as one keyword check. An AI scan checks visibility in different AI engine responses.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Cancellation is simple and immediate. You can cancel your subscription anytime from your dashboard, with no penalties or cancellation fees.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. All data is encrypted, stored on secure servers and never shared with third parties. Your privacy is important to us.',
  },
  {
    q: 'What\'s the difference between Google Organic and Google Maps?',
    a: 'Google Organic checks your position in regular Google search results. Google Maps checks your position in location-based results — especially important for local businesses.',
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

      {/* Pricing Cards */}
      <section className="pb-20 lg:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl ${
                  plan.highlighted
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-2xl shadow-blue-600/30 scale-100 lg:scale-105 z-10'
                    : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                } p-6 lg:p-7 flex flex-col`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold shadow-md">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-5">
                  <h3 className={`text-xl font-bold mb-1 ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-sm ${plan.highlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                    {plan.description}
                  </p>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-4xl lg:text-5xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                      {plan.price}
                    </span>
                    {plan.priceSuffix && (
                      <span className={`text-sm ${plan.highlighted ? 'text-blue-100' : 'text-slate-500'}`}>
                        {plan.priceSuffix}
                      </span>
                    )}
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <span
                        className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                          plan.highlighted ? 'bg-white/20' : 'bg-blue-50'
                        }`}
                      >
                        <svg
                          className={`w-3 h-3 ${plan.highlighted ? 'text-white' : 'text-blue-600'}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      <span className={plan.highlighted ? 'text-blue-50' : 'text-slate-700'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={user ? '/dashboard' : '/en/signup'}
                  className={`block w-full px-5 py-3 rounded-xl text-center font-semibold text-sm transition-all ${
                    plan.highlighted
                      ? 'bg-white text-blue-700 hover:bg-blue-50 shadow-lg'
                      : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* Comparison note */}
          <p className="text-center text-sm text-slate-500 mt-12">
            All plans include full access to Google Organic, Google Maps and AI visibility tracking. AI scans vary by plan. Cancel anytime with no penalties.
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
                Start your free 7-day trial and test the platform yourself
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
