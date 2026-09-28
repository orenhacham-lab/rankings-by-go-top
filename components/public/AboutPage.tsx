/**
 * The About page, one layout for both languages: app/(public)/about (Hebrew)
 * and app/(public)/en/about (English) each keep their own words in an
 * `AboutCopy` and hand them here. The metadata and the BreadcrumbList /
 * Organization structured data stay in each route's layout.tsx.
 *
 * The "11+ years" panel is the page's one navy surface besides the closing
 * band; every other block is a surface card on the alternating bands.
 */
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3, BookOpen, Clock, Eye, Handshake, Layers, LayoutDashboard, MapPin, Search, ShieldCheck, Sparkles,
  Store, Telescope, Target,
} from 'lucide-react'
import { Reveal } from '@/components/ui/motion'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import type { Locale } from '@/lib/i18n/locales'
import { ButtonLink, CtaBand, FeatureCard, PageHero, Section, SectionIntro } from './marketing'

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
  cta: { title: string; body: string; signup: string; signupHref: string; contact: string; updated: string }
}

// One icon per card, all in the same action squircle.
const WHY_ICONS: LucideIcon[] = [Clock, Layers, Sparkles, Telescope]
const SOLVES_ICONS: LucideIcon[] = [Search, MapPin, Sparkles, Telescope]
const APPROACH_ICONS: LucideIcon[] = [Eye, BarChart3, LayoutDashboard, Target]
const CHOOSE_ICONS: LucideIcon[] = [Handshake, ShieldCheck, BarChart3, Store]

function CardGrid({ items, icons }: { items: Item[]; icons: LucideIcon[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
      {items.map((item, i) => (
        <Reveal key={item.title} index={i} className="h-full">
          <FeatureCard icon={icons[i]} title={item.title}>
            <p>{item.description}</p>
          </FeatureCard>
        </Reveal>
      ))}
    </div>
  )
}

export function AboutPage({ locale, copy }: { locale: Locale; copy: AboutCopy }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale={locale} />

      <main className="flex-1">
        <PageHero
          before={<Breadcrumbs items={[copy.breadcrumb]} locale={locale} />}
          title={copy.title}
          accent={<span dir="ltr">{copy.accent}</span>}
          subtitle={copy.subtitle}
        />

        {/* Who is behind */}
        <Section tone="surface">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <h2 className="text-title font-bold tracking-tight text-ink text-balance">{copy.who.title}</h2>
              <div className="mt-5 space-y-4 text-section font-normal text-body text-pretty">
                {copy.who.paragraphs.map((p) => <p key={p}>{p}</p>)}
              </div>
            </div>

            <Reveal>
              <div className="relative overflow-hidden rounded-card bg-contrast px-8 py-12 text-center shadow-card sm:py-14">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_0%,rgb(255_255_255/0.08),transparent_70%)]"
                />
                <div className="relative">
                  <span className="mx-auto mb-6 flex size-14 items-center justify-center rounded-card bg-white/10 text-contrast-ink" aria-hidden="true">
                    <BookOpen className="size-7" />
                  </span>
                  <div className="text-display font-bold tracking-tight tabular-nums text-contrast-ink" dir="ltr">{copy.stat.value}</div>
                  <p className="mt-2 text-section font-semibold text-contrast-ink">{copy.stat.label}</p>
                  <p className="mt-1 text-copy text-contrast-ink/70">{copy.stat.sub}</p>
                </div>
              </div>
            </Reveal>
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
          <CtaBand title={copy.cta.title} body={copy.cta.body} footnote={copy.cta.updated}>
            <ButtonLink href={copy.cta.signupHref} size="lg">{copy.cta.signup}</ButtonLink>
            <ButtonLink href="mailto:oren@gotop.co.il" variant="inverse" size="lg">{copy.cta.contact}</ButtonLink>
          </CtaBand>
        </Section>
      </main>

      <Footer locale={locale} />
    </div>
  )
}
