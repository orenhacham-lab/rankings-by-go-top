/**
 * The About page, one layout for both languages: app/(public)/about (Hebrew)
 * and app/(public)/en/about (English) each keep their own words in an
 * `AboutCopy` and hand them here. The metadata and the BreadcrumbList /
 * Organization structured data stay in each route's layout.tsx.
 *
 * The "11+ years" panel is the page's one navy surface besides the closing
 * band; every other block is a surface card on the alternating bands. The
 * hero, the rise-in blocks and the CTA sweep are the landing page's
 * (components/public/landing), complete at rest; the calls to action are the
 * free site check first, then the trial (lib/i18n/public/feature-common.ts).
 */
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, BookOpen, Clock, Eye, FileText, Handshake, Layers, LayoutDashboard, Search, ShieldCheck, Sparkles,
  Store, Telescope, Target, TrendingUp,
} from 'lucide-react'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import type { Locale } from '@/lib/i18n/locales'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { cn } from '@/lib/utils'
import { ButtonLink, CtaBand, FeatureCard, Section, SectionIntro } from './marketing'
import { MarketingHero } from './landing/MarketingHero'
import { Rise } from './landing/motion'
import styles from './landing/landing.module.css'

type Item = { title: string; description: string }

export type AboutCopy = {
  breadcrumb: { label: string; href: string }
  title: string
  accent: string
  subtitle: string
  who: { title: string; paragraphs: string[] }
  stat: { value: string; label: string; sub: string }
  why: { title: string; body: string; items: Item[] }
  solves: { title: string; body: string; items: Item[] }
  approach: { title: string; items: Item[] }
  choose: { title: string; items: Item[] }
  cta: { title: string; body: string; contact: string; updated: string }
}

// One icon per card, all in the same action squircle.
const WHY_ICONS: LucideIcon[] = [Clock, Layers, Sparkles, Telescope]
const SOLVES_ICONS: LucideIcon[] = [FileText, TrendingUp, Sparkles, Search]
const APPROACH_ICONS: LucideIcon[] = [Eye, BarChart3, LayoutDashboard, Target]
const CHOOSE_ICONS: LucideIcon[] = [Handshake, ShieldCheck, BarChart3, Store]

function CardGrid({ items, icons }: { items: Item[]; icons: LucideIcon[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
      {items.map((item, i) => (
        <Rise key={item.title} delay={i * 80} className="h-full">
          <FeatureCard icon={icons[i]} title={item.title}>
            <p>{item.description}</p>
          </FeatureCard>
        </Rise>
      ))}
    </div>
  )
}

export function AboutPage({ locale, copy }: { locale: Locale; copy: AboutCopy }) {
  const c = FEATURE_COMMON[locale]
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale={locale} />

      <main className="flex-1">
        <MarketingHero
          before={<Breadcrumbs items={[copy.breadcrumb]} locale={locale} />}
          title={copy.title}
          accent={<span dir="ltr">{copy.accent}</span>}
          subtitle={copy.subtitle}
        >
          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href={c.check.href} size="lg" arrow className={styles.cta}>{c.check.label}</ButtonLink>
            <ButtonLink href={c.trial.href} variant="secondary" size="lg">{c.trial.label}</ButtonLink>
          </div>
        </MarketingHero>

        {/* Who is behind */}
        <Section tone="surface">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <h2 className="text-title font-bold tracking-tight text-ink text-balance">{copy.who.title}</h2>
              <div className="mt-5 space-y-4 text-section font-normal text-body text-pretty">
                {copy.who.paragraphs.map((p) => <p key={p}>{p}</p>)}
              </div>
            </div>

            <Rise>
              <div className={cn(styles.stage, 'relative overflow-hidden rounded-card px-8 py-12 text-center shadow-pop sm:py-14')}>
                <div aria-hidden="true" className={cn(styles.stageGrid, 'pointer-events-none absolute inset-0')} />
                <div className="relative">
                  <span className="mx-auto mb-6 flex size-14 items-center justify-center rounded-card bg-white/10 text-contrast-ink" aria-hidden="true">
                    <BookOpen className="size-7" />
                  </span>
                  <div className="text-display font-bold tracking-tight tabular-nums text-contrast-ink" dir="ltr">{copy.stat.value}</div>
                  <p className="mt-2 text-section font-semibold text-contrast-ink">{copy.stat.label}</p>
                  <p className="mt-1 text-copy text-contrast-ink/70">{copy.stat.sub}</p>
                </div>
              </div>
            </Rise>
          </div>
        </Section>

        {/* Why we built it */}
        <Section>
          <SectionIntro title={copy.why.title} description={copy.why.body} />
          <CardGrid items={copy.why.items} icons={WHY_ICONS} />
        </Section>

        {/* What we solve */}
        <Section tone="surface">
          <SectionIntro title={copy.solves.title} description={copy.solves.body} />
          <CardGrid items={copy.solves.items} icons={SOLVES_ICONS} />
        </Section>

        {/* Our approach */}
        <Section>
          <SectionIntro title={copy.approach.title} />
          <CardGrid items={copy.approach.items} icons={APPROACH_ICONS} />
        </Section>

        {/* Why choose */}
        <Section tone="surface">
          <SectionIntro title={copy.choose.title} />
          <CardGrid items={copy.choose.items} icons={CHOOSE_ICONS} />
        </Section>

        {/* CTA */}
        <Section>
          <CtaBand
            title={copy.cta.title}
            body={copy.cta.body}
            footnote={
              <>
                {copy.cta.contact}{' '}
                <a href="mailto:oren@gotop.co.il" dir="ltr" className="font-semibold text-contrast-ink underline decoration-white/30 underline-offset-4 hover:decoration-white/80">oren@gotop.co.il</a>
                <span className="mt-2 block">{copy.cta.updated}</span>
              </>
            }
          >
            <ButtonLink href={c.check.href} size="lg" arrow className={styles.cta}>{c.check.label}</ButtonLink>
            <ButtonLink href={c.trial.href} variant="inverse" size="lg">{c.trial.label}</ButtonLink>
          </CtaBand>
        </Section>
      </main>

      <Footer locale={locale} />
    </div>
  )
}
