/**
 * The home page, one layout for both languages: app/page.tsx (Hebrew) and
 * app/(public)/en/page.tsx (English) each hold their own words in a
 * `LandingCopy` and hand them here, so the two cannot drift apart in design
 * while each keeps copy written for its readers.
 *
 * The page sells in this order: the promise and the free check (the hero's
 * primary action, one field, no signup), a live demo of what the customer gets,
 * the outcomes, why now (search moved into AI answers), how it works, what is
 * inside, who it is for, what the free check shows, the objections, and the
 * close. Every claim is one the product keeps; the demo's names and figures are
 * illustrative and say so.
 *
 * Motion (components/public/landing/*) is complete at rest: the server renders
 * everything finished, and the client only animates what is below the fold, or
 * the demo after its first scene, with prefers-reduced-motion respected.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Building2, Check, ChartColumn, FileText, LineChart, MessageSquareText, Search, Sparkles, Store, TrendingUp, Users, X,
} from 'lucide-react'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { FreeCheckHeroForm } from '@/components/free-check/FreeCheckHeroForm'
import type { Locale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'
import { ButtonLink, CONTAINER, CONTAINER_WIDE, Eyebrow, FaqList, IconSquircle, Section, SectionIntro } from './marketing'
import { HeroDemo, type HeroDemoCopy } from './landing/HeroDemo'
import { HeroSignals } from './landing/HeroSignals'
import { CtaClimb, FlowClimb, HeroClimb } from './landing/RankClimb'
import { Counter, Flow, Rise } from './landing/motion'
import {
  AiVisual, CheckPreview, ContentVisual, RankVisual, ReportsVisual,
  type AiVisualCopy, type CheckPreviewCopy, type ContentVisualCopy, type RankVisualCopy, type ReportVisualCopy,
} from './landing/visuals'
import styles from './landing/landing.module.css'

type Item = { title: string; desc: string }
type FeatureRowCopy = { overline: string; title: string; body: string; points: string[]; href: string }

export type LandingCopy = {
  hero: {
    eyebrow: string
    title: string
    accent: string
    subtitle: string
    /** The words before the secondary action, e.g. "or". */
    or: string
    signup: string
    dashboard: string
    trust: string[]
    /** The chip at the end of the rank climb, e.g. "#3 on Google". */
    climbChip: string
    /** The signal stack's third card: an article went live on the site. */
    published: string
  }
  demo: HeroDemoCopy
  /** The strip under the hero: where we check and where we publish. */
  worksWith: { label: string; names: string[] }
  outcomes: {
    eyebrow: string
    title: string
    body: string
    /** Three outcomes: content that brings customers, AI answers, a clear picture. */
    items: (Item & { chips: string[] })[]
    /** Four figures, each one the product keeps (no invented customers or totals). */
    stats: { value: number; label: string; detail: string }[]
  }
  shift: { eyebrow: string; title: string; body: string; withoutTitle: string; without: string[]; withTitle: string; with: string[] }
  flow: { eyebrow: string; title: string; body: string; steps: (Item & { tag: string })[]; cta: string }
  features: {
    eyebrow: string
    title: string
    body: string
    more: string
    note: string
    content: FeatureRowCopy & { visual: ContentVisualCopy }
    ai: FeatureRowCopy & { visual: AiVisualCopy }
    rank: FeatureRowCopy & { visual: RankVisualCopy }
    reports: FeatureRowCopy & { visual: ReportVisualCopy }
  }
  audience: { eyebrow: string; title: string; body: string; items: (Item & { gain: string })[] }
  check: { eyebrow: string; title: string; body: string; items: string[]; cta: string; note: string; preview: CheckPreviewCopy }
  faq: { eyebrow: string; title: string; body: string; items: { q: string; a: string }[] }
  cta: { title: string; body: string; check: string; signup: string; dashboard: string; pricing: string; pricingLink: string }
}

const OUTCOME_ICONS: LucideIcon[] = [FileText, MessageSquareText, LineChart]
const AUDIENCE_ICONS: LucideIcon[] = [Store, Users, Building2]
const FEATURE_ICONS: LucideIcon[] = [FileText, Sparkles, Search, ChartColumn]

export function LandingPage({
  locale, copy, signedIn, signupHref, pricingHref,
}: {
  locale: Locale
  copy: LandingCopy
  signedIn: boolean
  signupHref: string
  pricingHref: string
}) {
  const rtl = locale === 'he'
  const prefix = locale === 'en' ? '/en' : ''
  const checkHref = `${prefix}/free-check`
  const startHref = signedIn ? '/dashboard' : signupHref
  const f = copy.features
  const featureRows: { row: FeatureRowCopy; visual: React.ReactNode }[] = [
    { row: f.content, visual: <ContentVisual copy={f.content.visual} /> },
    { row: f.ai, visual: <AiVisual copy={f.ai.visual} /> },
    { row: f.rank, visual: <RankVisual copy={f.rank.visual} /> },
    { row: f.reports, visual: <ReportsVisual copy={f.reports.visual} /> },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale={locale} tone="inverse" />

      <main className="flex-1">
        {/* Hero (navy): the promise and the free check at the start, the signal stack at the end, the rank climb behind */}
        <section className={cn(styles.heroDark, 'relative isolate overflow-hidden text-contrast-ink')} data-hero-tone="dark">
          <div aria-hidden="true" className={cn(styles.darkGrid, 'pointer-events-none absolute inset-0')} />
          <HeroClimb chip={copy.hero.climbChip} />
          <div className={cn(CONTAINER_WIDE, 'relative pt-28 pb-24 sm:pt-32 sm:pb-32 lg:pt-36 lg:pb-[13rem]')}>
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
              <div className="lg:col-span-7">
                <div className="mb-6"><Eyebrow icon={Sparkles} inverse>{copy.hero.eyebrow}</Eyebrow></div>
                <h1 className="text-hero text-contrast-ink">
                  {copy.hero.title}
                  <span className="block text-rail-tagline">{copy.hero.accent}</span>
                </h1>
                <p className="mt-6 max-w-[58ch] text-lead-mkt text-contrast-ink/80 text-pretty">{copy.hero.subtitle}</p>

                {/* Free site check: the hero's primary action, one field, no signup. */}
                <div className="mt-9">
                  <FreeCheckHeroForm locale={locale} tone="inverse" />
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2">
                  <span className="text-copy text-contrast-ink/75">{copy.hero.or}</span>
                  <ButtonLink href={startHref} variant="ghost-inverse" arrow className="-ms-2 underline decoration-white/30 underline-offset-4 hover:decoration-white/80">
                    {signedIn ? copy.hero.dashboard : copy.hero.signup}
                  </ButtonLink>
                </div>

                <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-copy text-contrast-ink/85">
                  {copy.hero.trust.map((line) => (
                    <li key={line} className="flex items-center gap-1.5">
                      <Check className="size-4 text-rail-tagline" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hidden lg:col-span-5 lg:block">
                <HeroSignals demo={copy.demo} published={copy.hero.published} />
              </div>
            </div>
          </div>
        </section>

        {/* The live demo overlaps the hero, over the works-with strip (surface) */}
        <div className="relative border-b border-line bg-surface">
          <div className={cn(CONTAINER, 'relative z-10 -mt-12 lg:-mt-[7.5rem]')}>
            <div className="mx-auto max-w-5xl">
              <HeroDemo copy={copy.demo} rtl={rtl} />
            </div>
          </div>
          {/* Where we check and where we publish */}
          <div className={cn(CONTAINER, 'flex flex-col items-center gap-3 py-8 lg:flex-row lg:justify-center lg:gap-6')}>
            <span className="shrink-0 text-caption font-semibold text-muted">{copy.worksWith.label}</span>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {copy.worksWith.names.map((name) => (
                <li key={name} dir="ltr" className="text-section font-semibold tracking-tight text-muted">{name}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Outcomes: what the customer gets, as a bento with the figures */}
        <Section>
          <SectionIntro size="mkt" eyebrow={copy.outcomes.eyebrow} title={copy.outcomes.title} description={copy.outcomes.body} />
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-5" data-outcomes-grid>
            {copy.outcomes.items.map((item, i) => (
              <Rise key={item.title} delay={i * 80} className={i === 0 ? 'h-full lg:col-span-3' : 'h-full lg:col-span-2'}>
                <OutcomeCard icon={OUTCOME_ICONS[i] ?? Sparkles} item={item} wide={i === 0} />
              </Rise>
            ))}
            <Rise delay={160} className="h-full lg:col-span-3">
              <div className={cn(styles.stage, 'grid h-full grid-cols-2 overflow-hidden rounded-card shadow-card')}>
                {copy.outcomes.stats.map((stat) => (
                  <div key={stat.label} className="p-5 sm:p-6">
                    <div className="text-display font-bold tracking-tight text-contrast-ink">
                      <Counter value={stat.value} />
                    </div>
                    <div className="mt-1 text-copy font-semibold text-contrast-ink">{stat.label}</div>
                    <div className="mt-1 text-caption text-contrast-ink/70">{stat.detail}</div>
                  </div>
                ))}
              </div>
            </Rise>
          </div>
        </Section>

        {/* Why now: search moved into AI answers (navy) */}
        <section className={cn(styles.bandBloom, 'bg-contrast py-16 text-contrast-ink sm:py-20 lg:py-28')}>
          <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-10 lg:grid-cols-5 lg:gap-12')}>
            <Rise className="lg:col-span-2">
              <p className="mb-3 text-eyebrow text-rail-tagline ltr:uppercase ltr:tracking-wide">{copy.shift.eyebrow}</p>
              <h2 className="text-h2-mkt text-balance text-contrast-ink">{copy.shift.title}</h2>
              <p className="mt-4 text-lead-mkt font-normal text-pretty text-contrast-ink/80">{copy.shift.body}</p>
            </Rise>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
              <Rise className="h-full">
                <div className="h-full rounded-card border border-white/10 bg-white/5 p-5 sm:p-6">
                  <h3 className="mb-4 text-section font-semibold text-contrast-ink/80">{copy.shift.withoutTitle}</h3>
                  <ul className="space-y-3">
                    {copy.shift.without.map((line) => (
                      <li key={line} className="flex items-start gap-2.5 text-copy text-contrast-ink/75">
                        <X className="mt-1 size-4 shrink-0 text-contrast-ink/50" aria-hidden="true" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Rise>
              <Rise delay={120} className="h-full">
                <div className="h-full rounded-card border border-line bg-surface p-5 shadow-pop sm:p-6">
                  <h3 className="mb-4 text-section font-semibold text-ink">{copy.shift.withTitle}</h3>
                  <ul className="space-y-3">
                    {copy.shift.with.map((line) => (
                      <li key={line} className="flex items-start gap-2.5 text-copy text-body">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill bg-action text-action-ink" aria-hidden="true">
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Rise>
            </div>
          </div>
        </section>

        {/* How it works: the rank climb is the connector through four steps */}
        <Section id="how-it-works" className="scroll-mt-16 lg:scroll-mt-[4.5rem]">
          <SectionIntro size="mkt" eyebrow={copy.flow.eyebrow} title={copy.flow.title} description={copy.flow.body} />
          <Flow rtl={rtl} className="relative">
            <FlowClimb chip={copy.hero.climbChip} />
            <ol className="relative grid grid-cols-1 gap-10 sm:grid-cols-2 lg:mt-6 lg:grid-cols-4 lg:gap-8" data-flow-steps>
              {copy.flow.steps.map((step, i) => (
                <li key={step.title} className="flex gap-5 lg:flex-col lg:gap-3 lg:text-center">
                  <span className="w-16 shrink-0 text-numeral tabular-nums text-action lg:w-auto" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 lg:flex lg:flex-col lg:items-center">
                    <span className="inline-flex h-6 items-center rounded-pill bg-action-soft px-2.5 text-caption font-semibold text-action">{step.tag}</span>
                    <h3 className="mt-2.5 text-section font-bold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-copy text-body lg:max-w-60">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Flow>
          <div className="mt-14 flex justify-center">
            <ButtonLink href={checkHref} size="lg" arrow className={styles.cta}>{copy.flow.cta}</ButtonLink>
          </div>
        </Section>

        {/* What is inside (navy): four rows, text and picture alternating */}
        <section className="relative isolate overflow-hidden bg-contrast py-16 text-contrast-ink sm:py-20 lg:py-28" data-features-tone="dark">
          <div aria-hidden="true" className={cn(styles.darkGrid, 'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]')} />
          <div aria-hidden="true" className={cn(styles.topLight, 'pointer-events-none absolute inset-x-8 top-0 h-px')} />
          <div className={CONTAINER}>
            <SectionIntro size="mkt" inverse eyebrow={f.eyebrow} title={f.title} description={f.body} />
            <div className="space-y-16 sm:space-y-20 lg:space-y-28">
              {featureRows.map(({ row, visual }, i) => (
                <div key={row.title} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
                  <Rise className={cn(i % 2 === 1 && 'lg:order-2')}>
                    <div className="flex items-center gap-3">
                      <IconSquircle icon={FEATURE_ICONS[i] ?? Sparkles} className="bg-white/10 text-rail-tagline" />
                      <span className="text-eyebrow text-rail-tagline ltr:uppercase ltr:tracking-wide">{row.overline}</span>
                    </div>
                    <h3 className="mt-4 text-h2-mkt text-balance text-contrast-ink">{row.title}</h3>
                    <p className="mt-4 max-w-prose text-section font-normal text-contrast-ink/80 text-pretty">{row.body}</p>
                    <ul className="mt-5 space-y-2.5">
                      {row.points.map((p) => (
                        <li key={p} className="flex items-start gap-2.5 text-copy text-contrast-ink/75">
                          <Check className="mt-1 size-4 shrink-0 text-rail-tagline" aria-hidden="true" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6">
                      <ButtonLink href={`${prefix}${row.href}`} variant="ghost-inverse" arrow className="-ms-4">{f.more}</ButtonLink>
                    </div>
                  </Rise>
                  <Rise delay={120} className={cn(i % 2 === 1 && 'lg:order-1')}>{visual}</Rise>
                </div>
              ))}
            </div>
            <p className="mt-14 text-center text-caption text-contrast-ink/65">{f.note}</p>
          </div>
        </section>

        {/* Who it is for: one row of three columns, hairlines between, no boxes */}
        <Section tone="surface">
          <SectionIntro size="mkt" eyebrow={copy.audience.eyebrow} title={copy.audience.title} description={copy.audience.body} />
          <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0" data-audience-row>
            {copy.audience.items.map((item, i) => (
              <Rise key={item.title} delay={i * 80} className="flex h-full flex-col gap-3 py-8 first:pt-0 last:pb-0 md:px-8 md:py-2 md:first:ps-0 md:last:pe-0">
                <IconSquircle icon={AUDIENCE_ICONS[i] ?? Users} />
                <h3 className="text-title font-bold tracking-tight text-ink">{item.title}</h3>
                <p className="flex-1 text-section font-normal text-body text-pretty">{item.desc}</p>
                <p className="flex items-start gap-2 pt-2 text-section font-semibold text-action">
                  <TrendingUp className="mt-1 size-4 shrink-0" aria-hidden="true" />
                  {item.gain}
                </p>
              </Rise>
            ))}
          </div>
        </Section>

        {/* What the free check shows, before anyone signs up (the cobalt band) */}
        <section className={cn(styles.bandBrand, 'relative overflow-hidden py-16 text-action-ink sm:py-20 lg:py-28')} data-check-tone="brand">
          <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16')}>
            <Rise>
              <p className="mb-3 text-eyebrow text-action-ink ltr:uppercase ltr:tracking-wide">{copy.check.eyebrow}</p>
              <h2 className="text-h2-mkt text-balance text-action-ink">{copy.check.title}</h2>
              <p className="mt-4 text-lead-mkt font-normal text-action-ink text-pretty">{copy.check.body}</p>
              <ul className="mt-6 space-y-3">
                {copy.check.items.map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-section font-normal text-action-ink">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill bg-surface text-action" aria-hidden="true">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col items-start gap-2.5">
                <ButtonLink href={checkHref} variant="light" size="lg" arrow className={cn(styles.cta, 'h-12 px-7')}>{copy.check.cta}</ButtonLink>
                <span className="text-caption text-action-ink">{copy.check.note}</span>
              </div>
            </Rise>
            <Rise delay={120}>
              <div className="relative mx-auto max-w-md rotate-1 lg:max-w-none">
                <div className="shadow-pop"><CheckPreview copy={copy.check.preview} /></div>
              </div>
            </Rise>
          </div>
        </section>

        {/* Objections, answered */}
        <Section>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-14">
            <div className="lg:col-span-2">
              <SectionIntro size="mkt" eyebrow={copy.faq.eyebrow} title={copy.faq.title} description={copy.faq.body} align="start" className="mb-0 sm:mb-0 lg:sticky lg:top-28" />
            </div>
            <div className="lg:col-span-3">
              <FaqList items={copy.faq.items} />
            </div>
          </div>
        </Section>

        {/* The close (navy, full bleed), running into the navy footer */}
        <section className={cn(styles.bandBloom, 'relative isolate overflow-hidden border-b border-contrast-ink/10 bg-contrast py-20 text-center text-contrast-ink sm:py-24 lg:py-32')} data-final-cta>
          <CtaClimb />
          <div className={cn(CONTAINER, 'relative')}>
            <h2 className="mx-auto max-w-3xl text-h2-mkt text-balance text-contrast-ink">{copy.cta.title}</h2>
            <p className="mx-auto mt-4 max-w-[58ch] text-lead-mkt font-normal text-contrast-ink/80 text-pretty">{copy.cta.body}</p>
            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={checkHref} size="lg" arrow className={cn(styles.cta, 'h-12 px-7 focus-visible:ring-white/50')}>{copy.cta.check}</ButtonLink>
              <ButtonLink href={startHref} variant="inverse" size="lg" className="h-12 px-7">{signedIn ? copy.cta.dashboard : copy.cta.signup}</ButtonLink>
            </div>
            <p className="mx-auto mt-10 max-w-xl text-copy text-contrast-ink/75">
              {copy.cta.pricing}{' '}
              <a href={pricingHref} className="rounded-control font-semibold text-contrast-ink underline decoration-white/30 underline-offset-4 hover:decoration-white/80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40">
                {copy.cta.pricingLink}
              </a>
            </p>
          </div>
        </section>
      </main>

      <Footer locale={locale} />
    </div>
  )
}

function OutcomeCard({ icon, item, wide }: { icon: LucideIcon; item: Item & { chips: string[] }; wide: boolean }) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-7">
      <IconSquircle icon={icon} />
      <div className="space-y-2">
        <h3 className={cn('font-bold tracking-tight text-ink text-balance', wide ? 'text-title' : 'text-section')}>{item.title}</h3>
        <p className="max-w-prose text-copy text-body">{item.desc}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {item.chips.map((chip, i) => (
          <span
            key={chip}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-pill px-3 text-caption font-semibold',
              i === 0 ? 'bg-ok-soft text-ok' : 'border border-line bg-canvas text-body',
            )}
          >
            {i === 0 && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
            {chip}
          </span>
        ))}
      </div>
    </div>
  )
}
