import { Check, Gift, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { ButtonLink, Callout, CtaBand, FaqList, IconSquircle, PageHero, Section, SectionIntro } from '@/components/public/marketing'
import { PLAN_CATALOG, TRIAL_CATALOG, type PlanCode } from '@/lib/plans/catalog'
import { planLimitLines, PLAN_AUDIENCE_LABEL, PLAN_AUDIENCE_DESCRIPTION } from '@/lib/plans/features'
import { cn } from '@/lib/utils'

const PLAN_ORDER: PlanCode[] = ['regular', 'advanced', 'premium', 'large_agency']

/** Card display NAMES. The audience label and description live in
 *  lib/plans/features.ts so they cannot drift from the catalog again —
 *  Advanced was still sold here as a multi-site plan after it became a
 *  one-project plan. */
const PLAN_NAME: Record<PlanCode, string> = {
  regular: 'Basic',
  advanced: 'Advanced',
  premium: 'Premium',
  large_agency: 'Agency',
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
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale="en" />

      <main className="flex-1">
        <PageHero
          compact
          eyebrow="Pricing Plans"
          title="Plans for every"
          accent="business size"
          subtitle="Transparent pricing, no surprises. Start with our free trial and scale as your needs grow."
        />

        <Section className="pt-10 sm:pt-12 lg:pt-14">
          {/* Free trial — only for visitors who are not signed in */}
          {!user && (
            <div className="mx-auto mb-12 flex max-w-4xl flex-col items-start gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:gap-5 sm:p-6">
              <IconSquircle icon={Gift} />
              <div className="min-w-0 flex-1">
                <h2 className="text-section font-semibold text-ink">Want to try the platform before choosing a plan?</h2>
                <p className="mt-1 text-copy text-body">
                  Start a free {TRIAL_CATALOG.days}-day trial — no credit card required.
                </p>
              </div>
              <ButtonLink href={"/en/signup"} variant="secondary" size="lg" className="w-full sm:w-auto">
                Start free trial
              </ButtonLink>
            </div>
          )}

          {/* ONE row of four cards on a large screen, two columns on a tablet, one
              on a phone. The audience distinction is carried by a small label on
              each card rather than by full-width stacked sections, which pushed
              Premium and Agency below the fold. Static text — no toggle, no URL
              parameter, no cookie, no client state. The recommended plan is the
              only card with the action border and the one primary button. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLAN_ORDER.map((code) => {
              const plan = PLAN_CATALOG[code]
              const highlighted = code === HIGHLIGHTED_PLAN

              // The five LIMIT lines come from the shared builder, so this card and
              // the dashboard's billing card cannot disagree with the server.
              const features = [
                ...planLimitLines(code, 'en'),
                'Google Organic and Google Maps tracking',
                'AI visibility tracking',
                'Article creation, scheduling and publishing to WordPress and Shopify',
                'PDF and Excel reports',
                'Personal support',
              ]

              return (
                <div
                  key={code}
                  className={cn(
                    'relative flex flex-col rounded-card border bg-surface p-6 shadow-card',
                    highlighted ? 'border-action ring-1 ring-action' : 'border-line',
                  )}
                >
                  {highlighted && (
                    <div className="absolute inset-x-0 -top-3 mx-auto flex h-6 w-fit items-center rounded-pill bg-action px-3 text-caption font-semibold text-action-ink shadow-control">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-5">
                    <p className="mb-1.5 text-caption font-semibold text-muted">
                      {PLAN_AUDIENCE_LABEL[code]['en']}
                    </p>
                    <h3 className="text-section font-bold text-ink">
                      {PLAN_NAME[code]}
                    </h3>
                    <p className="mt-1 text-copy text-body">
                      {PLAN_AUDIENCE_DESCRIPTION[code]['en']}
                    </p>
                  </div>

                  <div className="mb-6 flex items-baseline gap-1.5">
                    <span className="text-display font-bold tracking-tight tabular-nums text-ink">
                      {formatUSD(plan.priceUSD)}
                    </span>
                    <span className="text-copy text-muted">/month</span>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3 border-t border-line pt-5">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-copy text-body">
                        <Check className="mt-1 size-4 shrink-0 text-action" strokeWidth={2.5} aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <ButtonLink
                    href={user ? '/dashboard' : `/en/signup?plan=${code}`}
                    variant={highlighted ? 'primary' : 'secondary'}
                    size="lg"
                    className="w-full"
                  >
                    Start free trial
                  </ButtonLink>
                </div>
              )
            })}
          </div>

          {/* Usage clarification */}
          <div className="mx-auto mt-12 max-w-4xl">
            <Callout icon={Info}>
              <p>One AI check means running one query in one AI engine. Running the same query across multiple engines consumes one check per engine. Article allowances are shared across all projects in the account and reset each billing cycle.</p>
            </Callout>
          </div>

          {/* Comparison note */}
          <p className="mx-auto mt-6 max-w-3xl text-center text-copy text-muted">
            All plans include Google Organic, Google Maps and AI visibility tracking, plus article creation and publishing. Allowances vary by plan. Cancel anytime with no penalties.
          </p>
        </Section>

        {/* FAQ */}
        <Section tone="surface">
          <div className="mx-auto max-w-3xl">
            <SectionIntro eyebrow="Frequently Asked Questions" title="Have a question? We have answers" />
            <FaqList items={faqs} />
          </div>
        </Section>

        {/* CTA */}
        <Section>
          <CtaBand title="Ready to get started?" body={`Start your free ${TRIAL_CATALOG.days}-day trial and test the platform yourself`}>
            <ButtonLink href={user ? '/dashboard' : '/en/signup'} size="lg">
              {user ? 'Go to Dashboard' : 'Start Free Trial'}
            </ButtonLink>
          </CtaBand>
        </Section>
      </main>

      <Footer locale="en" />
    </div>
  )
}
