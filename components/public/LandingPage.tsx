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
import { ButtonLink, CONTAINER, CtaBand, Eyebrow, FaqList, IconSquircle, Section, SectionIntro } from './marketing'
import { HeroDemo, type HeroDemoCopy } from './landing/HeroDemo'
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
      <PublicNav locale={locale} />

      <main className="flex-1">
        {/* Hero Section: the promise, the free check, and the live demo */}
        <section className="relative overflow-hidden bg-canvas">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className={cn(styles.heroGrid, 'absolute inset-x-0 top-0 h-[760px]')} />
            <div className={styles.glowA} />
            <div className={styles.glowB} />
          </div>
          <div className={cn(CONTAINER, 'relative pt-24 pb-14 sm:pt-32 sm:pb-20')}>
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-5"><Eyebrow icon={Sparkles}>{copy.hero.eyebrow}</Eyebrow></div>
              <h1 className="text-title font-bold tracking-tight text-ink text-balance sm:text-display">
                {copy.hero.title}
                <span className="block text-action">{copy.hero.accent}</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-section font-normal text-body text-pretty">{copy.hero.subtitle}</p>
            </div>

            {/* Free site check: the hero's primary action, one field, no signup. */}
            <div className="mt-8 sm:mt-10">
              <FreeCheckHeroForm locale={locale} />
            </div>

            <div className="mt-5 flex flex-col items-center justify-center gap-x-3 gap-y-2 sm:flex-row">
              <span className="text-copy text-muted">{copy.hero.or}</span>
              <ButtonLink href={startHref} variant="secondary" arrow>
                {signedIn ? copy.hero.dashboard : copy.hero.signup}
              </ButtonLink>
            </div>

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-copy text-body">
              {copy.hero.trust.map((line) => (
                <li key={line} className="flex items-center gap-1.5">
                  <Check className="size-4 text-action" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>

            <div className="mx-auto mt-12 max-w-5xl lg:mt-14">
              <HeroDemo copy={copy.demo} rtl={rtl} />
            </div>
          </div>
        </section>

        {/* Where we check and where we publish */}
        <div className="border-y border-line bg-surface">
          <div className={cn(CONTAINER, 'flex flex-col items-center gap-3 py-6 lg:flex-row lg:justify-center lg:gap-6')}>
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
          <SectionIntro eyebrow={copy.outcomes.eyebrow} title={copy.outcomes.title} description={copy.outcomes.body} />
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

        {/* Why now: search moved into AI answers */}
        <section className={cn(styles.bandBloom, 'bg-contrast py-16 text-contrast-ink sm:py-20 lg:py-24')}>
          <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-10 lg:grid-cols-5 lg:gap-12')}>
            <Rise className="lg:col-span-2">
              <p className="mb-3 text-overline font-semibold uppercase tracking-wide text-rail-tagline">{copy.shift.eyebrow}</p>
              <h2 className="text-title font-bold tracking-tight text-balance text-contrast-ink">{copy.shift.title}</h2>
              <p className="mt-4 text-section font-normal text-pretty text-contrast-ink/75">{copy.shift.body}</p>
            </Rise>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
              <Rise className="h-full">
                <div className="h-full rounded-card border border-white/10 bg-white/5 p-5 sm:p-6">
                  <h3 className="mb-4 text-section font-semibold text-contrast-ink/80">{copy.shift.withoutTitle}</h3>
                  <ul className="space-y-3">
                    {copy.shift.without.map((line) => (
                      <li key={line} className="flex items-start gap-2.5 text-copy text-contrast-ink/70">
                        <X className="mt-1 size-4 shrink-0 text-contrast-ink/45" aria-hidden="true" />
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

        {/* How it works: a flowing line through four steps */}
        <Section id="how-it-works" className="scroll-mt-16 lg:scroll-mt-[4.5rem]">
          <SectionIntro eyebrow={copy.flow.eyebrow} title={copy.flow.title} description={copy.flow.body} />
          <Flow rtl={rtl} className="relative">
            {/* The line: across the nodes from lg, down the start edge below it */}
            <div aria-hidden="true" className="absolute inset-x-[12.5%] top-6 hidden h-0.5 rounded-pill bg-line lg:block">
              <div className={cn(styles.flowFill, 'h-full rounded-pill bg-action')} />
            </div>
            <div aria-hidden="true" className="absolute bottom-6 start-6 top-6 w-0.5 rounded-pill bg-line lg:hidden">
              <div className={cn(styles.flowFillV, 'h-full w-full rounded-pill bg-action')} />
            </div>
            <ol className="relative grid grid-cols-1 gap-8 lg:grid-cols-4 lg:gap-6">
              {copy.flow.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4 lg:flex-col lg:items-center lg:text-center">
                  <span
                    className={cn(styles.flowNode, 'relative flex size-12 shrink-0 items-center justify-center rounded-pill bg-action text-section font-bold tabular-nums text-action-ink shadow-[0_0_0_6px_var(--color-canvas)]')}
                    style={{ '--node-delay': `${250 + i * 400}ms` } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-1 lg:pt-0">
                    <span className="inline-flex h-6 items-center rounded-pill bg-action-soft px-2.5 text-caption font-semibold text-action">{step.tag}</span>
                    <h3 className="mt-2 text-section font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-copy text-body lg:mx-auto lg:max-w-60">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Flow>
          <div className="mt-12 flex justify-center">
            <ButtonLink href={checkHref} size="lg" arrow className={styles.cta}>{copy.flow.cta}</ButtonLink>
          </div>
        </Section>

        {/* What is inside: four rows, text and picture alternating */}
        <Section tone="surface">
          <SectionIntro eyebrow={f.eyebrow} title={f.title} description={f.body} />
          <div className="space-y-16 sm:space-y-20 lg:space-y-24">
            {featureRows.map(({ row, visual }, i) => (
              <div key={row.title} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
                <Rise className={cn(i % 2 === 1 && 'lg:order-2')}>
                  <div className="flex items-center gap-3">
                    <IconSquircle icon={FEATURE_ICONS[i] ?? Sparkles} />
                    <span className="text-overline font-semibold uppercase tracking-wide text-action">{row.overline}</span>
                  </div>
                  <h3 className="mt-4 text-title font-bold tracking-tight text-ink text-balance">{row.title}</h3>
                  <p className="mt-3 max-w-prose text-section font-normal text-body text-pretty">{row.body}</p>
                  <ul className="mt-5 space-y-2.5">
                    {row.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-copy text-body">
                        <Check className="mt-1 size-4 shrink-0 text-action" aria-hidden="true" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <ButtonLink href={`${prefix}${row.href}`} variant="ghost" arrow className="-ms-4">{f.more}</ButtonLink>
                  </div>
                </Rise>
                <Rise delay={120} className={cn(i % 2 === 1 && 'lg:order-1')}>{visual}</Rise>
              </div>
            ))}
          </div>
          <p className="mt-12 text-center text-caption text-muted">{f.note}</p>
        </Section>

        {/* Who it is for */}
        <Section>
          <SectionIntro eyebrow={copy.audience.eyebrow} title={copy.audience.title} description={copy.audience.body} />
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
            {copy.audience.items.map((item, i) => (
              <Rise key={item.title} delay={i * 80} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card transition-[border-color] duration-150 ease-snappy hover:border-line-strong sm:p-6">
                  <IconSquircle icon={AUDIENCE_ICONS[i] ?? Users} />
                  <h3 className="text-section font-semibold text-ink">{item.title}</h3>
                  <p className="flex-1 text-copy text-body">{item.desc}</p>
                  <p className="flex items-start gap-2 border-t border-line pt-3 text-copy font-semibold text-ink">
                    <TrendingUp className="mt-1 size-4 shrink-0 text-action" aria-hidden="true" />
                    {item.gain}
                  </p>
                </div>
              </Rise>
            ))}
          </div>
        </Section>

        {/* What the free check shows, before anyone signs up */}
        <Section tone="surface">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-14">
            <Rise>
              <p className="mb-3 text-overline font-semibold uppercase tracking-wide text-action">{copy.check.eyebrow}</p>
              <h2 className="text-title font-bold tracking-tight text-ink text-balance">{copy.check.title}</h2>
              <p className="mt-3 text-section font-normal text-body text-pretty">{copy.check.body}</p>
              <ul className="mt-5 space-y-2.5">
                {copy.check.items.map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-copy text-body">
                    <Check className="mt-1 size-4 shrink-0 text-action" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-col items-start gap-2">
                <ButtonLink href={checkHref} size="lg" arrow className={styles.cta}>{copy.check.cta}</ButtonLink>
                <span className="text-caption text-muted">{copy.check.note}</span>
              </div>
            </Rise>
            <Rise delay={120}>
              <div className="relative mx-3 sm:mx-5">
                <div aria-hidden="true" className={cn(styles.stage, 'absolute -inset-3 rounded-card sm:-inset-5')} />
                <div className="relative"><CheckPreview copy={copy.check.preview} /></div>
              </div>
            </Rise>
          </div>
        </Section>

        {/* Objections, answered */}
        <Section>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-14">
            <div className="lg:col-span-2">
              <SectionIntro eyebrow={copy.faq.eyebrow} title={copy.faq.title} description={copy.faq.body} align="start" className="mb-0 sm:mb-0 lg:sticky lg:top-28" />
            </div>
            <div className="lg:col-span-3">
              <FaqList items={copy.faq.items} />
            </div>
          </div>
        </Section>

        {/* The close */}
        <Section className="pt-0 sm:pt-0 lg:pt-0">
          <CtaBand
            title={copy.cta.title}
            body={copy.cta.body}
            footnote={
              <>
                {copy.cta.pricing}{' '}
                <a href={pricingHref} className="font-semibold text-contrast-ink underline decoration-white/30 underline-offset-4 hover:decoration-white/80">
                  {copy.cta.pricingLink}
                </a>
              </>
            }
          >
            <ButtonLink href={checkHref} size="lg" arrow className={styles.cta}>{copy.cta.check}</ButtonLink>
            <ButtonLink href={startHref} variant="inverse" size="lg">{signedIn ? copy.cta.dashboard : copy.cta.signup}</ButtonLink>
          </CtaBand>
        </Section>
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
