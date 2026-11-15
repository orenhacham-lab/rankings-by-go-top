/**
 * /features — the hub above the twelve feature pages, one component for all
 * eleven languages.
 *
 * WHY IT EXISTS. The address the menu is named after answered 404 while every
 * page beneath it existed and sat in the sitemap (measured 15.11.2026): a
 * visitor who typed it, or a crawler that climbed one level up from
 * /features/keyword-research, found nothing.
 *
 * WHERE ITS WORDS COME FROM. The heading, the three group titles and every
 * card's label and description are the nav menu's own strings
 * (`nav.features`, `nav.featureGroups`, `nav.featuresMenu`), so the hub cannot
 * drift from the menu that links to it; only the sentence under the heading and
 * the search description are its own (lib/i18n/public/features-index.ts). The
 * calls to action and the closing line are every feature page's
 * (FEATURE_COMMON), so this page promises exactly what they promise.
 */
import Link from 'next/link'
import { ArrowRight, ArrowLeft, Layers } from 'lucide-react'
import { PublicNav } from '@/components/PublicNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Footer } from '@/components/Footer'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { FEATURES_INDEX_COPY } from '@/lib/i18n/public/features-index'
import { FEATURE_GROUP_ORDER, featuresOfGroup } from '@/lib/marketing/feature-index'
import { marketingBreadcrumbSchema } from '@/lib/seo/page-schema'
import { jsonForScriptTag } from '@/lib/content/public-article-html'
import { ButtonLink, CtaBand, IconSquircle, PageHero, Section, SectionIntro } from './marketing'
import { Rise } from './landing/motion'

export function FeaturesIndexPage({ locale }: { locale: PublicLocale }) {
  const dict = getPublicDictionary(locale)
  const prefix = LOCALE_PREFIX[locale]
  const common = FEATURE_COMMON[locale]
  const copy = FEATURES_INDEX_COPY[locale]
  const fm = dict.nav.featuresMenu as unknown as Record<string, { label: string; description: string }>
  const title = dict.nav.features
  // The trail's arrow points the way the language reads.
  const Arrow = locale === 'he' ? ArrowLeft : ArrowRight

  return (
    <div className="min-h-screen bg-canvas">
      <PublicNav locale={locale} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonForScriptTag(marketingBreadcrumbSchema(locale, '/features', title)) }}
      />
      <main>
        <PageHero
          before={<Breadcrumbs locale={locale} items={[{ label: title, href: `${prefix}/features` }]} />}
          eyebrow={title}
          eyebrowIcon={Layers}
          title={title}
          subtitle={copy.subtitle}
          align="start"
        >
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <ButtonLink href={common.check.href}>{common.check.label}</ButtonLink>
            <ButtonLink href={common.trial.href} variant="secondary">{common.trial.label}</ButtonLink>
          </div>
        </PageHero>

        {FEATURE_GROUP_ORDER.map((group, gi) => (
          <Section key={group} tone={gi % 2 === 0 ? 'canvas' : 'surface'}>
            <SectionIntro align="start" title={dict.nav.featureGroups[group]} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {featuresOfGroup(group).map((f, i) => (
                <Rise key={f.slug} delay={i * 80} className="h-full">
                  <Link
                    href={`${prefix}/features/${f.slug}`}
                    data-feature-card={f.slug}
                    className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card transition-colors duration-150 ease-snappy hover:border-line-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 sm:p-6"
                  >
                    <IconSquircle icon={f.icon} />
                    <h3 className="text-section font-semibold text-ink">{fm[f.id].label}</h3>
                    <p className="text-copy text-body">{fm[f.id].description}</p>
                    <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1 pt-2 text-caption font-semibold text-action">
                      <Arrow className="size-4" />
                    </span>
                  </Link>
                </Rise>
              ))}
            </div>
          </Section>
        ))}

        <Section tone="canvas">
          <CtaBand title={title} body={common.closeBody}>
            <ButtonLink href={common.check.href} size="lg" arrow>{common.check.label}</ButtonLink>
            <ButtonLink href={common.trial.href} variant="inverse" size="lg">{common.trial.label}</ButtonLink>
          </CtaBand>
        </Section>
      </main>
      <Footer locale={locale} />
    </div>
  )
}
