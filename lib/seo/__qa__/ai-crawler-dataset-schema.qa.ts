/**
 * The AI-crawler page publishes its table as a schema.org Dataset, on every
 * locale that has the page, and the node says only things that are true: the
 * licence the API serves, the version the rows are stamped with, and the two
 * download formats the endpoint actually answers.
 *
 * Run: npx tsx lib/seo/__qa__/ai-crawler-dataset-schema.qa.ts
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { aiCrawlerDatasetSchema, datasetVersionAsDate } from '../dataset'
import { ORGANIZATION_ID, SITE_URL } from '../organization'
import { AI_CRAWLER_DATASET_LICENSE, AI_CRAWLER_DATASET_VERSION } from '../../ai-crawlers/dataset'
import { LOCALE_CONFIG, LOCALE_PREFIX, type PublicLocale } from '../../i18n/locales'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const ROOT = join(__dirname, '..', '..', '..')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** Every locale that has an /ai-crawlers page. A new locale adds one here and one layout. */
const LOCALES: PublicLocale[] = ['he', 'en', 'es', 'fr', 'it', 'ja', 'pt-BR', 'de', 'nl', 'pl']

// ---- the node itself ----

for (const locale of LOCALES) {
  const s = aiCrawlerDatasetSchema(locale) as Record<string, unknown>
  const label = `[${locale}]`

  check(`${label} is a Dataset`, s['@type'] === 'Dataset')
  // One dataset in seven languages, not seven datasets: the @id must not vary.
  check(`${label} @id is the shared English node`, s['@id'] === `${SITE_URL}/en/ai-crawlers#dataset`)
  check(`${label} url is this locale's page`, s.url === `${SITE_URL}${LOCALE_PREFIX[locale]}/ai-crawlers`)
  check(`${label} inLanguage matches the locale`, s.inLanguage === LOCALE_CONFIG[locale].lang)

  // Google requires name and description, and description must be 50-5000 chars.
  const name = s.name as string
  const description = s.description as string
  check(`${label} has a name`, typeof name === 'string' && name.trim().length > 0)
  check(
    `${label} description is 50-5000 characters (is ${description?.length})`,
    typeof description === 'string' && description.length >= 50 && description.length <= 5000,
  )

  // The licence is the one the API serves, never a literal written twice.
  check(`${label} licence is the served licence URL`, s.license === AI_CRAWLER_DATASET_LICENSE.url)
  check(`${label} version is the dataset version`, s.version === AI_CRAWLER_DATASET_VERSION)
  check(
    `${label} dateModified is that version as ISO-8601`,
    s.dateModified === datasetVersionAsDate(AI_CRAWLER_DATASET_VERSION) &&
      /^\d{4}-\d{2}-\d{2}$/.test(s.dateModified as string),
  )

  // The data really is keyless and free, which is what the field claims.
  check(`${label} isAccessibleForFree is true`, s.isAccessibleForFree === true)

  // Credit accrues to the product's own entity, not to a bare string.
  check(`${label} creator points at the Organization node`, JSON.stringify(s.creator) === JSON.stringify({ '@id': ORGANIZATION_ID }))
  check(`${label} publisher points at the Organization node`, JSON.stringify(s.publisher) === JSON.stringify({ '@id': ORGANIZATION_ID }))

  // Exactly the two formats the endpoint answers.
  const dist = s.distribution as { encodingFormat: string; contentUrl: string }[]
  check(`${label} has exactly two distributions`, Array.isArray(dist) && dist.length === 2)
  check(
    `${label} serves JSON from the public endpoint`,
    dist?.some((d) => d.encodingFormat === 'application/json' && d.contentUrl === `${SITE_URL}/api/public/ai-crawlers`),
  )
  check(
    `${label} serves CSV from the public endpoint`,
    dist?.some((d) => d.encodingFormat === 'text/csv' && d.contentUrl === `${SITE_URL}/api/public/ai-crawlers?format=csv`),
  )

  // Nothing invented: no rating, no price, no fabricated citation count.
  const raw = JSON.stringify(s)
  check(`${label} claims no rating`, !/aggregateRating|ratingValue/i.test(raw))
  check(`${label} claims no review`, !/"Review"/.test(raw))
}

// ---- the markup is actually emitted ----

// A helper no page calls is markup that does not exist. Every locale with an
// /ai-crawlers page must have a layout that emits this node in a script tag.
for (const locale of LOCALES) {
  const dir = join(ROOT, 'app/(public)', LOCALE_PREFIX[locale].replace(/^\//, ''), 'ai-crawlers')
  const layoutPath = join(dir, 'layout.tsx')
  check(`[${locale}] the page exists`, existsSync(join(dir, 'page.tsx')))
  check(`[${locale}] a layout exists to carry the JSON-LD`, existsSync(layoutPath))
  if (!existsSync(layoutPath)) continue
  const src = stripComments(readFileSync(layoutPath, 'utf8'))
  check(`[${locale}] layout calls aiCrawlerDatasetSchema for its own locale`, src.includes(`aiCrawlerDatasetSchema('${locale}')`))
  check(`[${locale}] layout emits application/ld+json`, src.includes('application/ld+json'))
  check(`[${locale}] layout renders its children`, src.includes('{children}'))
}

// The licence URL is read from the dataset module, never retyped in lib/seo.
const datasetSrc = stripComments(readFileSync(join(ROOT, 'lib/seo/dataset.ts'), 'utf8'))
check(
  'the licence URL is not hard-coded in lib/seo/dataset.ts',
  !datasetSrc.includes('creativecommons.org/licenses'),
)

// ---- mutation controls ----
//
// Each guard above is only worth its line if it fails when the thing it guards
// is broken. These break the node on purpose and show the same predicate
// rejecting it, so a guard that has quietly stopped looking is visible here.

const real = aiCrawlerDatasetSchema('en') as Record<string, unknown>

/** The description bound: a two-word description must be rejected. */
const shortDescription = { ...real, description: 'AI crawlers' }
check(
  'MUT a description under 50 characters fails the description bound',
  !((shortDescription.description as string).length >= 50),
)

/** The licence tie: a licence that is not the served one must be rejected. */
const wrongLicence = { ...real, license: 'https://opensource.org/licenses/MIT' }
check('MUT a licence other than the served one fails the licence check', wrongLicence.license !== AI_CRAWLER_DATASET_LICENSE.url)

/** The shared @id: a per-locale @id must be rejected, or the table counts ten times. */
const perLocaleId = { ...real, '@id': `${SITE_URL}/es/ai-crawlers#dataset` }
check('MUT a per-locale @id fails the shared-node check', perLocaleId['@id'] !== `${SITE_URL}/en/ai-crawlers#dataset`)

/** The date format: the dotted version string must be rejected where ISO-8601 is required. */
check(
  'MUT the dotted version as dateModified fails the ISO-8601 check',
  !/^\d{4}-\d{2}-\d{2}$/.test(AI_CRAWLER_DATASET_VERSION),
)

/** The honesty check: a rating written into the node must be caught. */
const withRating = { ...real, aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9' } }
check('MUT an aggregateRating in the node fails the no-rating check', /aggregateRating|ratingValue/i.test(JSON.stringify(withRating)))

/** The emitted-markup check: a layout that drops the script tag must be caught. */
const layoutWithoutScript = 'export default function X({ children }) { return <>{children}</> }'
check('MUT a layout with no script tag fails the emitted-markup check', !layoutWithoutScript.includes('application/ld+json'))

console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1

export {}
