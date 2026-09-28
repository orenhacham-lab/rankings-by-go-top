/**
 * The home page, one layout for both languages: app/page.tsx (Hebrew) and
 * app/(public)/en/page.tsx (English) each hold their own words in a
 * `LandingCopy` and hand them here, so the two cannot drift apart in design
 * while each keeps copy written for its readers.
 *
 * The hero's primary action is the free check (one field, no signup), so the
 * sign-up link beside it is the secondary button; the navy workflow band and
 * the closing band are the page's two dark surfaces.
 */
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, Briefcase, Building2, CalendarClock, ChartColumn, Check, Clock, Layers, MapPin, Search, Sparkles,
  Store, Telescope, TrendingUp, UserRound, Users,
} from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { Reveal } from '@/components/ui/motion'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckHeroForm } from '@/components/free-check/FreeCheckHeroForm'
import type { Locale } from '@/lib/i18n/locales'
import {
  ButtonLink, CheckList, CrossList, CtaBand, FeatureCard, IconSquircle, PageHero, ProductFrame, Section, SectionIntro, StepCard,
} from './marketing'

type Item = { title: string; desc: string }

export type LandingCopy = {
  hero: {
    eyebrow: string
    title: string
    accent: string
    subtitle: string
    signup: string
    dashboard: string
    howItWorks: string
    trust: string[]
  }
  mock: {
    address: string
    stats: { label: string; value: string }[]
    boardTitle: string
    boardMeta: string
    rows: { title: string; status: string; tone: 'success' | 'info' | 'warning' | 'neutral' }[]
  }
  problem: { eyebrow: string; title: string; body: string; withoutTitle: string; without: string[]; withTitle: string; with: string[] }
  workflow: { eyebrow: string; title: string; body: string; steps: Item[] }
  capabilities: { eyebrow: string; title: string; body: string; items: Item[] }
  journey: { eyebrow: string; title: string; body: string; steps: Item[] }
  audience: { eyebrow: string; title: string; items: Item[] }
  why: { eyebrow: string; title: string; items: Item[] }
  pricing: { title: string; body: string; cta: string }
  cta: { title: string; body: string; signup: string; dashboard: string; pricing: string }
}

// One icon per card, all in the same action squircle (no multicolour tiles).
const CAPABILITY_ICONS: LucideIcon[] = [Search, MapPin, Sparkles, Telescope, BarChart3, TrendingUp]
const AUDIENCE_ICONS: LucideIcon[] = [Store, UserRound, Building2, Users]
const WHY_ICONS: LucideIcon[] = [Clock, CalendarClock, Layers, ChartColumn, Briefcase]

export function LandingPage({
  locale, copy, signedIn, signupHref, pricingHref,
}: {
  locale: Locale
  copy: LandingCopy
  signedIn: boolean
  signupHref: string
  pricingHref: string
}) {
  const startHref = signedIn ? '/dashboard' : signupHref
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale={locale} />

      <main className="flex-1">
        {/* Hero */}
        <PageHero eyebrow={copy.hero.eyebrow} title={copy.hero.title} accent={copy.hero.accent} subtitle={copy.hero.subtitle}>
          {/* Free site check — the hero's primary action: one field, no signup. */}
          <FreeCheckHeroForm locale={locale} />

          <div className="mt-6 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
            <ButtonLink href={startHref} variant="secondary" size="lg">
              {signedIn ? copy.hero.dashboard : copy.hero.signup}
            </ButtonLink>
            <ButtonLink href="#workflow" variant="ghost" size="lg">
              {copy.hero.howItWorks}
            </ButtonLink>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-copy text-body">
            {copy.hero.trust.map((line) => (
              <li key={line} className="flex items-center gap-1.5">
                <Check className="size-4 text-action" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>

          {/* Hero visual: the content board, drawn with the app's own pieces */}
          <div className="mx-auto mt-14 max-w-5xl lg:mt-16">
            <ProductFrame address={copy.mock.address}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {copy.mock.stats.map((stat) => (
                  <div key={stat.label} className="rounded-inset border border-line bg-surface p-3 sm:p-4">
                    <div className="text-caption text-muted">{stat.label}</div>
                    <div className="mt-1 text-metric font-bold tabular-nums text-ink">{stat.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 overflow-hidden rounded-inset border border-line">
                <div className="flex items-center justify-between border-b border-line bg-sunk px-4 py-2.5">
                  <span className="text-copy font-semibold text-ink">{copy.mock.boardTitle}</span>
                  <span className="text-caption text-muted">{copy.mock.boardMeta}</span>
                </div>
                <ul className="divide-y divide-line bg-surface">
                  {copy.mock.rows.map((row) => (
                    <li key={row.title} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="min-w-0 truncate text-copy font-medium text-ink">{row.title}</span>
                      <Badge variant={row.tone} dot>{row.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </ProductFrame>
          </div>
        </PageHero>

        {/* Problem / Solution */}
        <Section tone="surface">
          <SectionIntro eyebrow={copy.problem.eyebrow} title={copy.problem.title} description={copy.problem.body} />
          <Reveal className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
            <div className="rounded-card border border-line bg-sunk p-6 sm:p-8">
              <h3 className="mb-5 text-section font-semibold text-ink">{copy.problem.withoutTitle}</h3>
              <CrossList items={copy.problem.without} />
            </div>
            <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
              <h3 className="mb-5 text-section font-semibold text-ink">{copy.problem.withTitle}</h3>
              <CheckList items={copy.problem.with} />
            </div>
          </Reveal>
        </Section>

        {/* Primary content workflow — core positioning */}
        <Section tone="contrast" id="workflow" className="scroll-mt-16 lg:scroll-mt-[4.5rem]">
          <SectionIntro eyebrow={copy.workflow.eyebrow} title={copy.workflow.title} description={copy.workflow.body} inverse />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {copy.workflow.steps.map((step, i) => (
              <Reveal key={step.title} index={i} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-card border border-white/10 bg-white/5 p-5 sm:p-6">
                  <span className="flex size-10 items-center justify-center rounded-inset bg-white/10 text-section font-bold tabular-nums text-contrast-ink" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className="text-section font-semibold text-contrast-ink">{step.title}</h3>
                  <p className="text-copy text-contrast-ink/75">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* Supporting capabilities */}
        <Section>
          <SectionIntro eyebrow={copy.capabilities.eyebrow} title={copy.capabilities.title} description={copy.capabilities.body} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {copy.capabilities.items.map((feat, i) => (
              <Reveal key={feat.title} index={i} className="h-full">
                <FeatureCard icon={CAPABILITY_ICONS[i] ?? Sparkles} title={feat.title}>
                  <p>{feat.desc}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* Account-level 3-step journey */}
        <Section tone="surface">
          <SectionIntro eyebrow={copy.journey.eyebrow} title={copy.journey.title} description={copy.journey.body} />
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
            {copy.journey.steps.map((step, i) => (
              <Reveal key={step.title} index={i} className="h-full">
                <StepCard n={String(i + 1).padStart(2, '0')} title={step.title}>
                  <p>{step.desc}</p>
                </StepCard>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* Audience */}
        <Section>
          <SectionIntro eyebrow={copy.audience.eyebrow} title={copy.audience.title} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {copy.audience.items.map((aud, i) => (
              <Reveal key={aud.title} index={i} className="h-full">
                <FeatureCard icon={AUDIENCE_ICONS[i] ?? Users} title={aud.title}>
                  <p>{aud.desc}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* Why subscribe: five reasons as two rows, the first a wide lead card
            (2 + 1 over 3 from lg, 2 + 2 + 2 on a tablet), so no card is left alone on a row. */}
        <Section tone="surface">
          <SectionIntro eyebrow={copy.why.eyebrow} title={copy.why.title} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" data-why-grid>
            {copy.why.items.map((why, i) => (
              <Reveal key={why.title} index={i} className={i === 0 ? 'h-full sm:col-span-2' : 'h-full'}>
                {i === 0 ? (
                  <LeadCard icon={WHY_ICONS[0] ?? Check} title={why.title}>{why.desc}</LeadCard>
                ) : (
                  <FeatureCard icon={WHY_ICONS[i] ?? Check} title={why.title}>
                    <p>{why.desc}</p>
                  </FeatureCard>
                )}
              </Reveal>
            ))}
          </div>
        </Section>

        {/* Pricing preview */}
        <Section className="pb-0 sm:pb-0 lg:pb-0">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-title font-bold tracking-tight text-ink text-balance">{copy.pricing.title}</h2>
            <p className="mt-3 text-section font-normal text-body text-pretty">{copy.pricing.body}</p>
            <div className="mt-8">
              <ButtonLink href={pricingHref} variant="secondary" size="lg">{copy.pricing.cta}</ButtonLink>
            </div>
          </div>
        </Section>

        {/* CTA */}
        <Section>
          <CtaBand title={copy.cta.title} body={copy.cta.body}>
            <ButtonLink href={startHref} size="lg">{signedIn ? copy.cta.dashboard : copy.cta.signup}</ButtonLink>
            <ButtonLink href={pricingHref} variant="inverse" size="lg">{copy.cta.pricing}</ButtonLink>
          </CtaBand>
        </Section>
      </main>

      <Footer locale={locale} />
    </div>
  )
}

/**
 * The lead card of a row that would otherwise leave one card alone: the same
 * surface as a FeatureCard, laid out wide (icon beside the words) so the extra
 * width reads as emphasis rather than empty space.
 */
function LeadCard({ icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:gap-5 sm:p-8">
      <IconSquircle icon={icon} />
      <div className="min-w-0 space-y-2">
        <h3 className="text-section font-semibold text-ink sm:text-title sm:font-bold sm:tracking-tight">{title}</h3>
        <p className="max-w-prose text-copy text-body sm:text-section sm:font-normal">{children}</p>
      </div>
    </div>
  )
}
