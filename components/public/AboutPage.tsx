/**
 * The About page, one layout for both languages: app/(public)/about (Hebrew)
 * and app/(public)/en/about (English) each keep their own words in an
 * `AboutCopy` and hand them here. The metadata and the BreadcrumbList /
 * Organization structured data stay in each route's layout.tsx.
 *
 * The rhythm (wave 8, UX decision D; D = navy, L = light, B = cobalt):
 *   1. hero (D)      the home hero's navy, centred, the free check then the trial;
 *   2. who (L)       text and the navy "11+ years" plate;
 *   3. gaps (D)      what was missing → what we built, four pain/answer rows;
 *   4. approach (L)  four principles in a strip, 01–04 numerals, hairlines;
 *   5. choose (B)    four short statements on the cobalt band, in white;
 *   6. close (D)     full bleed: the free check, the trial, and the three
 *                    contact channels (UX decision C) instead of a lone email.
 * No two adjacent bands share a tone, and no block is an icon-card grid. The
 * rise-in blocks and the CTA sweep are the landing page's, complete at rest.
 */
import { BookOpen, Check, Mail, Phone, X } from 'lucide-react'
import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import WhatsAppGlyph from '@/components/brand/WhatsAppGlyph'
import type { Locale } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { cn } from '@/lib/utils'
import { ButtonLink, CONTAINER, CONTAINER_WIDE, Section, SectionIntro, buttonClasses } from './marketing'
import { Rise } from './landing/motion'
import { contactChannels } from './contact'
import styles from './landing/landing.module.css'

type Item = { title: string; description: string }

export type AboutCopy = {
  breadcrumb: { label: string; href: string }
  title: string
  accent: string
  subtitle: string
  who: { title: string; paragraphs: string[] }
  stat: { value: string; label: string; sub: string }
  /** "What was missing, and what we built instead": four pain → answer rows. */
  gaps: { title: string; body: string; missingLabel: string; builtLabel: string; rows: { pain: Item; answer: Item }[] }
  approach: { title: string; items: Item[] }
  choose: { title: string; items: Item[] }
  cta: { title: string; body: string; contact: string; updated: string }
}

export function AboutPage({ locale, copy }: { locale: Locale; copy: AboutCopy }) {
  const c = FEATURE_COMMON[locale]
  const t = getPublicDictionary(locale).contact
  // The close's three buttons: WhatsApp, call, email (UX decision C).
  const contactButtons = contactChannels(t).map((ch) => ({
    ...ch,
    text: ch.id === 'whatsapp' ? t.whatsappLabel : ch.id === 'phone' ? t.call : t.emailLabel,
    title: ch.id === 'whatsapp' ? t.whatsappTitle : ch.id === 'phone' ? t.callAria : t.emailAria,
  }))

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicNav locale={locale} tone="inverse" />

      <main className="flex-1">
        {/* 1. Hero (navy, centred) */}
        <section className={cn(styles.heroDark, 'relative isolate overflow-hidden text-contrast-ink')} data-hero-tone="dark">
          <div aria-hidden="true" className={cn(styles.darkGrid, 'pointer-events-none absolute inset-0')} />
          <div className={cn(CONTAINER_WIDE, 'relative pt-24 pb-20 sm:pt-32 sm:pb-24 lg:pt-36 lg:pb-28')}>
            <div className="mb-10"><Breadcrumbs items={[copy.breadcrumb]} locale={locale} inverse /></div>
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="text-hero-page text-balance text-contrast-ink">
                {copy.title}
                <span className="block text-rail-tagline">{copy.accent}</span>
              </h1>
              <p className="mx-auto mt-6 max-w-[58ch] text-lead-mkt text-contrast-ink/80 text-pretty">{copy.subtitle}</p>
            </div>
            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={c.check.href} size="lg" arrow className={cn(styles.cta, 'h-12 px-7 focus-visible:ring-white/50')}>{c.check.label}</ButtonLink>
              <ButtonLink href={c.trial.href} variant="inverse" size="lg" className="h-12 px-7">{c.trial.label}</ButtonLink>
            </div>
          </div>
        </section>

        {/* 2. Who is behind (light) */}
        <Section tone="surface" className="border-t-0">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <h2 className="text-h2-mkt text-balance text-ink">{copy.who.title}</h2>
              <div className="mt-5 space-y-4 text-lead-mkt font-normal text-body text-pretty">
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

        {/* 3. What was missing, and what we built instead (navy) */}
        <section className={cn(styles.bandBloom, 'relative isolate overflow-hidden bg-contrast py-16 text-contrast-ink sm:py-20 lg:py-28')} data-about-gaps>
          <div aria-hidden="true" className={cn(styles.topLight, 'pointer-events-none absolute inset-x-8 top-0 h-px')} />
          <div className={CONTAINER}>
            <SectionIntro size="mkt" inverse title={copy.gaps.title} description={copy.gaps.body} />
            <div className="hidden grid-cols-2 gap-8 border-b border-white/10 pb-3 text-eyebrow md:grid" aria-hidden="true">
              <span className="text-contrast-ink/70">{copy.gaps.missingLabel}</span>
              <span className="text-rail-tagline">{copy.gaps.builtLabel}</span>
            </div>
            <ol className="divide-y divide-white/10">
              {copy.gaps.rows.map((row, i) => (
                <Rise key={row.pain.title} as="li" delay={i * 80} className="grid grid-cols-1 gap-4 py-7 md:grid-cols-2 md:gap-8">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill bg-white/10 text-contrast-ink/70" aria-hidden="true">
                      <X className="size-3.5" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0">
                      <span className="sr-only">{copy.gaps.missingLabel}: </span>
                      <h3 className="text-section font-semibold text-contrast-ink/70">{row.pain.title}</h3>
                      <p className="mt-1 text-copy text-contrast-ink/70">{row.pain.description}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill bg-action text-action-ink" aria-hidden="true">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    <div className="min-w-0">
                      <span className="sr-only">{copy.gaps.builtLabel}: </span>
                      <h3 className="text-section font-bold text-contrast-ink">{row.answer.title}</h3>
                      <p className="mt-1 text-copy text-contrast-ink/85">{row.answer.description}</p>
                    </div>
                  </div>
                </Rise>
              ))}
            </ol>
          </div>
        </section>

        {/* 4. Our approach (light): a strip of four principles */}
        <Section>
          <SectionIntro size="mkt" title={copy.approach.title} />
          <ol className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x" data-about-approach>
            {copy.approach.items.map((item, i) => (
              <Rise key={item.title} as="li" delay={i * 80} className="py-6 first:pt-0 sm:py-4 sm:pe-6 sm:first:pt-4 lg:px-6 lg:first:ps-0 lg:last:pe-0">
                <span className="block text-h2-mkt tabular-nums text-action" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-3 text-section font-bold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-copy text-body text-pretty">{item.description}</p>
              </Rise>
            ))}
          </ol>
        </Section>

        {/* 5. Why choose us (cobalt) */}
        <section className={cn(styles.bandBrand, 'py-16 text-action-ink sm:py-20 lg:py-28')} data-about-choose>
          <div className={CONTAINER}>
            <h2 className="max-w-3xl text-h2-mkt text-balance text-action-ink">{copy.choose.title}</h2>
            <ul className="mt-10 grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-2 lg:mt-14">
              {copy.choose.items.map((item, i) => (
                <Rise key={item.title} as="li" delay={i * 80} className="border-t border-white/30 pt-5">
                  <h3 className="text-title font-bold tracking-tight text-action-ink">{item.title}</h3>
                  <p className="mt-2 text-section font-normal text-action-ink text-pretty">{item.description}</p>
                </Rise>
              ))}
            </ul>
          </div>
        </section>

        {/* 6. The close (navy, full bleed): the free check, the trial, and the three contact channels */}
        <section className={cn(styles.bandBloom, 'relative isolate overflow-hidden border-b border-contrast-ink/10 bg-contrast py-20 text-center text-contrast-ink sm:py-24 lg:py-28')} data-final-cta>
          <div className={cn(CONTAINER, 'relative')}>
            <h2 className="mx-auto max-w-3xl text-h2-mkt text-balance text-contrast-ink">{copy.cta.title}</h2>
            <p className="mx-auto mt-4 max-w-[58ch] text-lead-mkt font-normal text-contrast-ink/80 text-pretty">{copy.cta.body}</p>
            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={c.check.href} size="lg" arrow className={cn(styles.cta, 'h-12 px-7 focus-visible:ring-white/50')}>{c.check.label}</ButtonLink>
              <ButtonLink href={c.trial.href} variant="inverse" size="lg" className="h-12 px-7">{c.trial.label}</ButtonLink>
            </div>
            <div className="mx-auto mt-12 max-w-xl border-t border-white/10 pt-8">
              <p className="text-copy text-contrast-ink/80">{copy.cta.contact}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3" data-about-contact>
                {contactButtons.map((b) => (
                  <a
                    key={b.id}
                    href={b.href}
                    {...(b.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    title={b.title}
                    className={buttonClasses('inverse', 'md')}
                    data-contact-channel={b.id}
                  >
                    {b.id === 'whatsapp' ? <WhatsAppGlyph size={16} /> : b.id === 'phone' ? <Phone className="size-4" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}
                    {b.text}
                  </a>
                ))}
              </div>
              <p className="mt-6 text-caption text-contrast-ink/65">{copy.cta.updated}</p>
            </div>
          </div>
        </section>
      </main>

      <Footer locale={locale} />
    </div>
  )
}
