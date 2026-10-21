/**
 * A "Go Top SEO vs X" page: the feature-page template, filled from one
 * language's `ComparisonCopy`.
 *
 * The order of the body is deliberate and is not a per-page decision:
 *
 *   1. the fairness note — this is a comparison, not an advert;
 *   2. what the other product is better at, BEFORE anything about us;
 *   3. the dated table, each claim about them carrying their own page;
 *   4. what we are better at;
 *   5. questions, then the free check.
 *
 * Putting their strengths first is what makes the rest of the page worth
 * reading. A visitor who typed the other product's name into a search box
 * already likes it; a page that opens by running it down tells them only that
 * we are not a reliable narrator, and they leave before the table.
 *
 * The calls to action come from FEATURE_COMMON, so a comparison page leads and
 * closes with the free check and then the trial, exactly like every other page
 * on the public site.
 */
import { Check, Scale } from 'lucide-react'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { ComparisonTable } from '@/components/public/ComparisonTable'
import { SectionIntro } from '@/components/public/marketing'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { COMPARE_COMMON } from '@/lib/i18n/public/compare-common'
import type { ComparisonCopy } from '@/lib/i18n/public/compare/types'
import type { PublicLocale } from '@/lib/i18n/locales'

export function ComparisonPage({
  locale,
  copy,
  path,
}: {
  locale: PublicLocale
  copy: ComparisonCopy
  /** The page's path after the language prefix, e.g. `/compare/semrush`. */
  path: string
}) {
  const C = FEATURE_COMMON[locale]
  const shared = COMPARE_COMMON[locale]

  const content: FeaturePageContent = {
    hero: {
      eyebrow: copy.eyebrow,
      eyebrowIcon: Scale,
      title: copy.hero.title,
      accent: copy.hero.accent,
      subtitle: copy.hero.subtitle,
      trust: C.trust,
      primary: C.check,
      secondary: C.trial,
    },
    sections: [
      { kind: 'callout', icon: Scale, heading: 'h2', body: shared.fairness(copy.competitor) },
      {
        kind: 'cards',
        tone: 'contrast',
        eyebrow: copy.theirStrengths.eyebrow,
        title: copy.theirStrengths.title,
        intro: copy.theirStrengths.intro,
        items: copy.theirStrengths.items,
      },
      {
        kind: 'custom',
        // No <Section> of its own: FeaturePage already bands every section,
        // and a second one here would double the padding and the border.
        node: (
          <>
            <SectionIntro eyebrow={copy.table.eyebrow} title={copy.table.title} />
            <ComparisonTable
              locale={locale}
              competitor={copy.competitor}
              rows={copy.table.rows}
              checkedOn={copy.table.checkedOn}
              sources={copy.table.sources}
            />
          </>
        ),
      },
      {
        kind: 'cards',
        eyebrow: copy.ourStrengths.eyebrow,
        title: copy.ourStrengths.title,
        intro: copy.ourStrengths.intro,
        items: copy.ourStrengths.items.map((item) => ({ icon: Check, ...item })),
      },
      { kind: 'faq', eyebrow: copy.faq.eyebrow, title: copy.faq.title, items: copy.faq.items },
    ],
    cta: { title: copy.close.title, body: C.closeBody, primary: C.check, secondary: C.trial },
    breadcrumbName: copy.eyebrow,
  }

  return <FeaturePage locale={locale} content={content} path={path} />
}
