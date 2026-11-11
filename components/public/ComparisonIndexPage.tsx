/**
 * The comparison index at `/compare`: one card per comparison, each carrying
 * the line that says when that tool is the right choice and the link to its
 * page.
 *
 * It is the feature-page template, like the comparison pages themselves, so it
 * shares their rhythm, their calls to action and their palette rather than
 * inventing a listing layout of its own. The order of the body follows the same
 * logic too: the honesty note first, then the six, then the free check.
 *
 * The cards are not a navigation menu with six product names in it. A reader
 * arrives here from one tool's name in a search box, so what each card has to
 * answer is "is this the one I am weighing?" — hence the name, one sentence of
 * what the tool is and when it wins, and only then the link.
 */
import { Scale } from 'lucide-react'
import Link from 'next/link'
import { FeaturePage, type FeaturePageContent } from '@/components/public/FeaturePage'
import { FEATURE_COMMON } from '@/lib/i18n/public/feature-common'
import { COMPARE_INDEX, COMPARISONS } from '@/lib/i18n/public/compare-index'
import { getLocaleHref, type PublicLocale } from '@/lib/i18n/locales'

export const COMPARE_INDEX_PATH = '/compare'

export function ComparisonIndexPage({ locale }: { locale: PublicLocale }) {
  const C = FEATURE_COMMON[locale]
  const copy = COMPARE_INDEX[locale]

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
      { kind: 'callout', icon: Scale, heading: 'h2', body: copy.note },
      {
        kind: 'cards',
        columns: 3,
        eyebrow: copy.list.eyebrow,
        title: copy.list.title,
        intro: copy.list.intro,
        items: COMPARISONS.map(({ slug, name }) => ({
          title: name,
          body: (
            <>
              <p>{copy.when[slug]}</p>
              <p>
                <Link
                  href={getLocaleHref(`${COMPARE_INDEX_PATH}/${slug}`, locale)}
                  className="font-semibold text-action underline"
                >
                  {copy.compareWith(name)}
                </Link>
              </p>
            </>
          ),
        })),
      },
    ],
    cta: { title: copy.close.title, body: C.closeBody, primary: C.check, secondary: C.trial },
    breadcrumbName: copy.eyebrow,
  }

  return <FeaturePage locale={locale} content={content} path={COMPARE_INDEX_PATH} />
}
