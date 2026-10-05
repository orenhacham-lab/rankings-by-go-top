/**
 * The one template behind the twelve feature pages (six features, Hebrew and
 * English). A page is its metadata plus a `FeaturePageContent`: the hero, an
 * ordered list of sections of a few known kinds, and the closing band. Every
 * page therefore shares one rhythm and one palette; before this each page had
 * its own gradient (purple, amber, emerald…), its own ✓ glyph lists and its
 * own card shape.
 *
 * Section bands alternate surface / canvas on their own, so a page's content
 * never has to think about backgrounds; a `cards` section marked
 * `tone: 'contrast'` becomes the navy band instead (the "why it matters" beat).
 *
 * It speaks the landing page's visual language: the drafting-grid hero with its
 * cobalt glows, the product picture on a navy stage with an honest
 * "illustration" caption, blocks that rise in below the fold, and the
 * call-to-action sweep. All of it is complete at rest (components/public/landing).
 */
import type { LucideIcon } from 'lucide-react'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import type { PublicLocale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'
import {
  ButtonLink, Callout, CheckList, CONTAINER, CtaBand, FaqList, FeatureCard, Section, SectionIntro, StepCard,
} from './marketing'
import { MarketingHero } from './landing/MarketingHero'
import { Rise } from './landing/motion'
import styles from './landing/landing.module.css'

type Cta = { label: string; href: string }

export type FeatureSection =
  | { kind: 'cards'; eyebrow?: string; title: string; intro?: string; columns?: 2 | 3; tone?: 'contrast'; items: { icon?: LucideIcon; title: string; body: React.ReactNode }[] }
  | { kind: 'steps'; eyebrow?: string; title: string; intro?: string; items: { title: string; body: React.ReactNode }[] }
  | { kind: 'audiences'; eyebrow?: string; title: string; intro?: string; items: { title: string; body: string; bullets: string[] }[] }
  | { kind: 'callout'; icon?: LucideIcon; title?: string; heading?: 'h2' | 'h3'; body: React.ReactNode }
  | { kind: 'faq'; eyebrow?: string; title: string; items: { q: string; a: string }[] }
  | { kind: 'custom'; node: React.ReactNode }

export type FeaturePageContent = {
  hero: {
    eyebrow: string
    eyebrowIcon: LucideIcon
    title: string
    /** The headline's second line, in solid action blue. */
    accent?: string
    subtitle: React.ReactNode
    /** Short, true reassurances under the subtitle. */
    trust?: string[]
    primary: Cta
    secondary?: Cta
    /** The product illustration under the hero, usually in a ProductFrame. */
    visual?: React.ReactNode
  }
  sections: FeatureSection[]
  cta: { title: string; body?: string; primary: Cta; secondary?: Cta }
}

/** Under every product picture: it is an illustration, and says so. */
const VISUAL_CAPTION: Record<PublicLocale, string> = {
  he: 'המחשה של המוצר. שמות ונתונים לדוגמה.',
  en: 'Product illustration. Names and figures are examples.',
  es: 'Ilustración del producto. Los nombres y las cifras son ejemplos.',
  'pt-BR': 'Ilustração do produto. Os nomes e os números são exemplos.',
}

const GRID_3 = 'grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3'
const GRID_2 = 'grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2'
const STEP_GRID: Record<number, string> = {
  4: 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4',
  5: 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5',
}

function SectionBody({ section }: { section: FeatureSection }) {
  switch (section.kind) {
    case 'cards': {
      const cols = section.columns ?? (section.items.length % 3 === 0 ? 3 : 2)
      if (section.tone === 'contrast') {
        return (
          <>
            <SectionIntro eyebrow={section.eyebrow} title={section.title} description={section.intro} inverse />
            <div className={cn(cols === 3 ? 'grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3' : GRID_2)}>
              {section.items.map((item, i) => {
                const Icon = item.icon
                return (
                  <Rise key={item.title} delay={i * 100} className="h-full">
                    <div className="flex h-full flex-col gap-4 rounded-card border border-white/10 bg-white/5 p-6 sm:p-7">
                      {Icon && (
                        <span className="flex size-10 items-center justify-center rounded-inset bg-white/10 text-rail-tagline" aria-hidden="true">
                          <Icon className="size-5" />
                        </span>
                      )}
                      <h3 className="text-section font-semibold text-contrast-ink">{item.title}</h3>
                      <div className="space-y-3 text-copy text-contrast-ink/75">
                        {typeof item.body === 'string' ? <p>{item.body}</p> : item.body}
                      </div>
                    </div>
                  </Rise>
                )
              })}
            </div>
          </>
        )
      }
      return (
        <>
          <SectionIntro eyebrow={section.eyebrow} title={section.title} description={section.intro} />
          <div className={cn(cols === 3 ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3' : GRID_2)}>
            {section.items.map((item, i) => (
              <Rise key={item.title} delay={i * 80} className="h-full">
                <FeatureCard icon={item.icon} title={item.title}>
                  {typeof item.body === 'string' ? <p>{item.body}</p> : item.body}
                </FeatureCard>
              </Rise>
            ))}
          </div>
        </>
      )
    }
    case 'steps':
      return (
        <>
          <SectionIntro eyebrow={section.eyebrow} title={section.title} description={section.intro} />
          <div className={STEP_GRID[section.items.length] ?? GRID_3}>
            {section.items.map((item, i) => (
              <Rise key={item.title} delay={i * 80} className="h-full">
                <StepCard n={i + 1} title={item.title}>
                  {typeof item.body === 'string' ? <p>{item.body}</p> : item.body}
                </StepCard>
              </Rise>
            ))}
          </div>
        </>
      )
    case 'audiences':
      return (
        <>
          <SectionIntro eyebrow={section.eyebrow} title={section.title} description={section.intro} />
          <div className={GRID_2}>
            {section.items.map((item, i) => (
              <Rise key={item.title} delay={i * 80} className="h-full">
                <FeatureCard title={item.title}>
                  <p>{item.body}</p>
                  <CheckList items={item.bullets} className="border-t border-line pt-4" />
                </FeatureCard>
              </Rise>
            ))}
          </div>
        </>
      )
    case 'callout':
      return (
        <div className="mx-auto max-w-3xl">
          <Callout icon={section.icon} title={section.title} as={section.heading}>{section.body}</Callout>
        </div>
      )
    case 'faq':
      return (
        <div className="mx-auto max-w-3xl">
          <SectionIntro eyebrow={section.eyebrow} title={section.title} />
          <FaqList items={section.items} />
        </div>
      )
    case 'custom':
      return <>{section.node}</>
  }
}

export function FeaturePage({ locale, content }: { locale: PublicLocale; content: FeaturePageContent }) {
  const { hero, sections, cta } = content
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale={locale} />

      <main className="flex-1">
        <MarketingHero
          eyebrow={hero.eyebrow}
          eyebrowIcon={hero.eyebrowIcon}
          title={hero.title}
          accent={hero.accent}
          subtitle={hero.subtitle}
          trust={hero.trust}
        >
          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href={hero.primary.href} size="lg" arrow className={styles.cta}>{hero.primary.label}</ButtonLink>
            {hero.secondary && <ButtonLink href={hero.secondary.href} variant="secondary" size="lg">{hero.secondary.label}</ButtonLink>}
          </div>
          {hero.visual && (
            <figure className="mx-auto mt-12 max-w-4xl lg:mt-14">
              <div className={cn(styles.stage, 'relative overflow-hidden rounded-card p-3 shadow-pop sm:p-6 lg:p-8')}>
                <div aria-hidden="true" className={cn(styles.stageGrid, 'pointer-events-none absolute inset-0')} />
                <div className="relative">{hero.visual}</div>
              </div>
              <figcaption className="mt-3 text-center text-caption text-muted">{VISUAL_CAPTION[locale]}</figcaption>
            </figure>
          )}
        </MarketingHero>

        {sections.map((section, i) => section.kind === 'cards' && section.tone === 'contrast' ? (
          <section key={i} className={cn(styles.bandBloom, 'bg-contrast py-16 text-contrast-ink sm:py-20 lg:py-24')}>
            <div className={CONTAINER}><SectionBody section={section} /></div>
          </section>
        ) : (
          <Section key={i} tone={i % 2 === 0 ? 'surface' : 'canvas'} className={section.kind === 'callout' ? 'py-10 sm:py-12 lg:py-14' : undefined}>
            <SectionBody section={section} />
          </Section>
        ))}

        <Section tone={sections.length % 2 === 0 ? 'surface' : 'canvas'}>
          <CtaBand title={cta.title} body={cta.body}>
            <ButtonLink href={cta.primary.href} size="lg" arrow className={styles.cta}>{cta.primary.label}</ButtonLink>
            {cta.secondary && <ButtonLink href={cta.secondary.href} variant="inverse" size="lg">{cta.secondary.label}</ButtonLink>}
          </CtaBand>
        </Section>
      </main>

      <Footer locale={locale} />
    </div>
  )
}
