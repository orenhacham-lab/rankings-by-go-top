/**
 * The pricing page's sections around the plan grid, shared by
 * app/(public)/pricing/page.tsx (Hebrew) and app/(public)/en/pricing/page.tsx
 * (English). Each page keeps its own plan grid (the guards in lib/plans/__qa__
 * read it there) and hands its words here as a `PricingCopy`, from
 * lib/i18n/public/pricing-he.ts and pricing-en.ts.
 *
 * Order after the grid: a nudge to the free check for the undecided, what every
 * plan includes, why it pays, how usage is counted, the questions, the close.
 * Every sentence is one the product keeps: the plans differ only in volume (the
 * catalog has no per-plan feature switch), usage units are the ones the server
 * counts, and no customer, number or quote is invented.
 *
 * Motion is the landing page's: complete at rest, and only blocks below the
 * fold rise in, with prefers-reduced-motion respected.
 */
import type { LucideIcon } from 'lucide-react'
import {
  ChartColumn, FileText, Layers, LifeBuoy, LineChart, MapPin, Search, ShieldCheck, Sparkles, Unlock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ButtonLink, CONTAINER, CtaBand, FaqList, IconSquircle, Section, SectionIntro } from '../marketing'
import { Rise } from '../landing/motion'
import styles from '../landing/landing.module.css'

type Item = { title: string; desc: string }

export type PricingCopy = {
  hero: { eyebrow: string; title: string; accent: string; subtitle: string; trust: string[] }
  plans: {
    perMonth: string
    popular: string
    cta: string
    dashboard: string
    /** Under each card's button, for visitors who are not signed in. */
    noCard: string
    everyPlanLabel: string
    everyPlan: string[]
  }
  unsure: { text: string; cta: string }
  included: { eyebrow: string; title: string; body: string; items: Item[] }
  value: { eyebrow: string; title: string; body: string; items: Item[] }
  usage: { eyebrow: string; title: string; body: string; items: Item[]; note: string }
  faq: {
    eyebrow: string
    title: string
    body: string
    items: { q: string; a: string; link?: { label: string; href: string } }[]
  }
  cta: { title: string; body: string; check: string; trial: string; dashboard: string }
}

/** Icons for `included.items`, in order. */
const INCLUDED_ICONS: LucideIcon[] = [FileText, MapPin, Sparkles, Search, ChartColumn, LifeBuoy]
/** Icons for `value.items`, in order. */
const VALUE_ICONS: LucideIcon[] = [Layers, LineChart, Unlock]
/** Icons for `usage.items`, in order. */
const USAGE_ICONS: LucideIcon[] = [FileText, Search, Sparkles]

/** Right under the grid: the undecided visitor goes to the free check, not away. */
export function PricingUnsure({ copy, checkHref }: { copy: PricingCopy; checkHref: string }) {
  return (
    <div className="mx-auto mt-10 flex max-w-4xl flex-col items-center justify-center gap-3 text-center sm:flex-row sm:gap-4">
      <p className="text-section font-normal text-body">{copy.unsure.text}</p>
      <ButtonLink href={checkHref} variant="secondary" arrow>{copy.unsure.cta}</ButtonLink>
    </div>
  )
}

export function PricingIncluded({ copy }: { copy: PricingCopy }) {
  const c = copy.included
  return (
    <Section tone="surface">
      <SectionIntro eyebrow={c.eyebrow} title={c.title} description={c.body} />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" data-included-grid>
        {c.items.map((item, i) => (
          <Rise as="li" key={item.title} delay={(i % 3) * 80} className="h-full">
            <div className="flex h-full gap-4 rounded-card border border-line bg-canvas p-5 transition-[border-color,box-shadow] duration-200 ease-snappy hover:border-line-strong hover:shadow-card sm:p-6">
              <IconSquircle icon={INCLUDED_ICONS[i] ?? Sparkles} />
              <div className="min-w-0 space-y-1.5">
                <h3 className="text-section font-semibold text-ink">{item.title}</h3>
                <p className="text-copy text-body">{item.desc}</p>
              </div>
            </div>
          </Rise>
        ))}
      </ul>
    </Section>
  )
}

/** The navy "why it pays" band: what the subscription replaces, in words only. */
export function PricingValue({ copy }: { copy: PricingCopy }) {
  const c = copy.value
  return (
    <section className={cn(styles.bandBloom, 'bg-contrast py-16 text-contrast-ink sm:py-20 lg:py-24')}>
      <div className={CONTAINER}>
        <SectionIntro eyebrow={c.eyebrow} title={c.title} description={c.body} inverse />
        <ul className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
          {c.items.map((item, i) => {
            const Icon = VALUE_ICONS[i] ?? Sparkles
            return (
              <Rise as="li" key={item.title} delay={i * 100} className="h-full">
                <div className="flex h-full flex-col gap-4 rounded-card border border-white/10 bg-white/5 p-6 sm:p-7">
                  <span className="flex size-10 items-center justify-center rounded-inset bg-white/10 text-rail-tagline" aria-hidden="true">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="text-section font-semibold text-contrast-ink">{item.title}</h3>
                  <p className="text-copy text-contrast-ink/75">{item.desc}</p>
                </div>
              </Rise>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/** How usage is counted: the three units the server meters, stated once, plainly. */
export function PricingUsage({ copy }: { copy: PricingCopy }) {
  const c = copy.usage
  return (
    <Section>
      <SectionIntro eyebrow={c.eyebrow} title={c.title} description={c.body} />
      <ul className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3">
        {c.items.map((item, i) => {
          const Icon = USAGE_ICONS[i] ?? Sparkles
          return (
            <Rise as="li" key={item.title} delay={i * 80} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
                <div className="flex items-center gap-3">
                  <IconSquircle icon={Icon} />
                  <h3 className="text-section font-semibold text-ink">{item.title}</h3>
                </div>
                <p className="text-copy text-body">{item.desc}</p>
              </div>
            </Rise>
          )
        })}
      </ul>
      <p className="mx-auto mt-6 max-w-3xl text-center text-copy text-muted">{c.note}</p>
    </Section>
  )
}

export function PricingFaq({ copy }: { copy: PricingCopy }) {
  const c = copy.faq
  return (
    <Section tone="surface">
      <div className="mx-auto max-w-3xl">
        <SectionIntro eyebrow={c.eyebrow} title={c.title} description={c.body} />
        <FaqList
          items={c.items.map((item) => ({
            q: item.q,
            a: item.link ? (
              <>
                {item.a}{' '}
                <a href={item.link.href} className="inline-flex items-center gap-1 font-semibold text-action underline decoration-action/30 underline-offset-4 hover:decoration-action">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  {item.link.label}
                </a>
              </>
            ) : item.a,
          }))}
        />
      </div>
    </Section>
  )
}

/** The close: the free check first, the trial second. */
export function PricingClose({
  copy, checkHref, startHref, signedIn,
}: { copy: PricingCopy; checkHref: string; startHref: string; signedIn: boolean }) {
  return (
    <Section>
      <CtaBand title={copy.cta.title} body={copy.cta.body}>
        <ButtonLink href={checkHref} size="lg" arrow className={styles.cta}>{copy.cta.check}</ButtonLink>
        <ButtonLink href={startHref} variant="inverse" size="lg">{signedIn ? copy.cta.dashboard : copy.cta.trial}</ButtonLink>
      </CtaBand>
    </Section>
  )
}
