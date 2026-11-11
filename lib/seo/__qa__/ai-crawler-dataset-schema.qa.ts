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
import {
  aiCrawlerBlockingDatasetSchema,
  aiCrawlerBlockingSitesDatasetSchema,
  aiCrawlerDatasetSchema,
  datasetVersionAsDate,
} from '../dataset'
import {
  BLOCKING_SITES_MEASURED_ON,
  BLOCKING_SITES_PATH,
  BLOCKING_SITES_READ,
  BLOCKING_SITES_VERSION,
  GPTBOT_DELIBERATE_PCT,
} from '../../ai-crawlers/blocking-sites'
import {
  BLOCKING_MEASUREMENT,
  BLOCKING_MEASUREMENT_VERSION,
} from '../../ai-crawlers/blocking-measurement'
import { aiCrawlerCopy } from '../../ai-crawlers/copy'
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

// ---- the measurement node ----
//
// A second Dataset, and the rules it has to obey are not the table's. It is a
// dated observation, so it carries the day it was taken; it is about large
// sites, so the sentence that says so must be inside the description a search
// result will quote; and it may only be declared at all because the page now
// renders the figures to a reader.

for (const locale of LOCALES) {
  const m = aiCrawlerBlockingDatasetSchema(locale) as Record<string, unknown>
  const label = `[${locale}] measurement`
  const copy = aiCrawlerCopy(locale)

  check(`${label} is a Dataset`, m['@type'] === 'Dataset')
  check(`${label} is a different node from the table`, m['@id'] === `${SITE_URL}/en/ai-crawlers#blocking-measurement`)
  check(`${label} url is this locale's page`, m.url === `${SITE_URL}${LOCALE_PREFIX[locale]}/ai-crawlers`)
  check(`${label} inLanguage matches the locale`, m.inLanguage === LOCALE_CONFIG[locale].lang)
  check(`${label} version is the measurement's own, not the table's`,
    m.version === BLOCKING_MEASUREMENT_VERSION && m.version !== String(AI_CRAWLER_DATASET_VERSION))
  check(`${label} temporalCoverage is the single day measured`, m.temporalCoverage === BLOCKING_MEASUREMENT.measuredOn)
  check(`${label} names its method rather than asserting one`, m.measurementTechnique === BLOCKING_MEASUREMENT.method.how)
  check(`${label} links the table it was matched against`, m.isBasedOn === `${SITE_URL}/en/ai-crawlers#dataset`)
  check(`${label} licence is the served licence URL`, m.license === AI_CRAWLER_DATASET_LICENSE.url)

  // THE CAVEAT IS THE POINT. A description that quotes the figures without the
  // sentence bounding them is the one failure this whole endpoint guards
  // against, and a description is exactly what gets quoted elsewhere.
  const description = m.description as string
  check(`${label} description is 50-5000 characters (is ${description?.length})`,
    typeof description === 'string' && description.length >= 50 && description.length <= 5000)
  check(`${label} description carries the page's own caveat verbatim`, description.includes(copy.measurement.caveat))
  check(`${label} description names the markets left out`, description.includes(copy.measurement.notSampled))

  const dist = m.distribution as { encodingFormat: string; contentUrl: string }[]
  check(`${label} has exactly two distributions`, Array.isArray(dist) && dist.length === 2)
  check(`${label} serves JSON from the measurement endpoint`,
    dist?.some((d) => d.encodingFormat === 'application/json' && d.contentUrl === `${SITE_URL}/api/public/ai-crawler-blocking`))
  check(`${label} serves CSV from the measurement endpoint`,
    dist?.some((d) => d.encodingFormat === 'text/csv' && d.contentUrl === `${SITE_URL}/api/public/ai-crawler-blocking?format=csv`))

  const raw = JSON.stringify(m)
  check(`${label} claims no rating`, !/aggregateRating|ratingValue/i.test(raw))
}

// ---- the per-site node ----
//
// A third Dataset, and the rule that matters most for it is the one the
// endpoint itself was built around: a percentage published without its read
// rate is a figure nobody can bound. So the read rate has to be inside the
// description, which is the part that travels into a search result.

for (const locale of LOCALES) {
  const s = aiCrawlerBlockingSitesDatasetSchema(locale) as Record<string, unknown>
  const label = `[${locale}] per-site`

  check(`${label} is a Dataset`, s['@type'] === 'Dataset')
  check(`${label} is its own node, not the measurement's`,
    s['@id'] === `${SITE_URL}/en/ai-crawlers#blocking-sites`)
  check(`${label} url is this locale's page`, s.url === `${SITE_URL}${LOCALE_PREFIX[locale]}/ai-crawlers`)
  check(`${label} inLanguage matches the locale`, s.inLanguage === LOCALE_CONFIG[locale].lang)
  check(`${label} carries its own version, not the other reading's`,
    s.version === BLOCKING_SITES_VERSION && String(s.version) !== String(BLOCKING_MEASUREMENT_VERSION))
  check(`${label} dateModified is the day it was read, as ISO-8601`,
    s.dateModified === BLOCKING_SITES_MEASURED_ON && /^\d{4}-\d{2}-\d{2}$/.test(s.dateModified as string))
  check(`${label} temporalCoverage is that single day`, s.temporalCoverage === BLOCKING_SITES_MEASURED_ON)
  check(`${label} states the unit it measures`, typeof s.variableMeasured === 'string' && (s.variableMeasured as string).length > 0)
  check(`${label} licence is the served licence URL`, s.license === AI_CRAWLER_DATASET_LICENSE.url)
  check(`${label} links the table the verdicts were matched against`, s.isBasedOn === `${SITE_URL}/en/ai-crawlers#dataset`)

  const description = s.description as string
  check(`${label} description is 50-5000 characters (is ${description?.length})`,
    typeof description === 'string' && description.length >= 50 && description.length <= 5000)
  // THE READ RATE TRAVELS WITH THE PERCENTAGES. Not a footnote on the page,
  // not a field further down the payload: in the sentence a search result
  // quotes, beside the figures it bounds.
  check(`${label} description states the n the percentages are of`,
    description.includes(String(BLOCKING_SITES_READ)))
  check(`${label} description carries the sample caveat verbatim`,
    description.includes(aiCrawlerCopy(locale).measurement.caveat))
  check(`${label} description states the deliberate share`,
    description.includes(String(GPTBOT_DELIBERATE_PCT)))
  // No placeholder may survive into the markup: `{read}` in a description is
  // a substitution that silently did not happen.
  check(`${label} description has no unsubstituted placeholder`, !/\{[a-z]+\}/.test(description))

  const dist = s.distribution as { encodingFormat: string; contentUrl: string }[]
  check(`${label} has exactly two distributions`, Array.isArray(dist) && dist.length === 2)
  check(`${label} serves JSON from the per-site endpoint`,
    dist?.some((d) => d.encodingFormat === 'application/json' && d.contentUrl === `${SITE_URL}${BLOCKING_SITES_PATH}`))
  check(`${label} serves CSV from the per-site endpoint`,
    dist?.some((d) => d.encodingFormat === 'text/csv' && d.contentUrl === `${SITE_URL}${BLOCKING_SITES_PATH}?format=csv`))
  check(`${label} claims no rating`, !/aggregateRating|ratingValue/i.test(JSON.stringify(s)))
}

// Markup for something a reader cannot see is cloaking. The node is only
// legitimate because the component renders the measurement, so the guard is on
/** The fragments the two nodes identify themselves by, read off the builders so
 *  that a renamed @id cannot leave the page's anchor behind. */
const FRAGMENTS = ['dataset', 'blocking-measurement'] as const

// the component: it must read the same constant the node reads.
{
  const component = stripComments(readFileSync(join(ROOT, 'components/ai-crawlers/AiCrawlerChecker.tsx'), 'utf8'))
  check('the component renders the measurement a reader can see', component.includes('<Measurement locale={locale} copy={copy} />'))
  check('it reads the per-market rows from the constant', component.includes('BLOCKING_BY_MARKET.map'))
  check('it reads the headline figure from the constant',
    component.includes('BLOCKING_MEASUREMENT.findings.ofGptbotBlockersAlsoBlockingTrafficCrawlerPct'))
  check('it renders the caveat beside the figure', component.includes('m.caveat'))
  // The per-site node is legitimate only because these three are on the page.
  check('the component states the deliberate share a reader can see',
    component.includes('GPTBOT_DELIBERATE_PCT'))
  check('it states the inherited share beside it', component.includes('OAI_SEARCHBOT_INHERITED_PCT'))
  check('it states the read rate those shares are of', component.includes('BLOCKING_SITES_READ'))
  check('it links the rows themselves', component.includes('BLOCKING_SITES_PATH'))
  // No figure is typed into the component, in any locale's shape.
  check('no percentage literal is typed into the component', !/\d+(\.\d+)?\s?%/.test(component))

  // Every fragment a node identifies itself by must exist on the page it names.
  // Both nodes are @id'd with a fragment, and a fragment with no element behind
  // it sends a reader who follows it to the top of the page instead of to the
  // thing the node is about. These are also the anchors an editorial mail uses
  // to deep-link the measurement rather than the whole page.
  for (const fragment of FRAGMENTS) {
    check(`the component carries an element with id="${fragment}"`,
      component.includes(`id="${fragment}"`))
  }
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
  check(`[${locale}] layout also emits the measurement node for its own locale`, src.includes(`aiCrawlerBlockingDatasetSchema('${locale}')`))
  check(`[${locale}] layout also emits the per-site node for its own locale`, src.includes(`aiCrawlerBlockingSitesDatasetSchema('${locale}')`))
  check(`[${locale}] layout emits three ld+json blocks, one per dataset`, src.split('application/ld+json').length - 1 === 3)
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


// ---- mutation controls for the measurement node ----

const realMeasurement = aiCrawlerBlockingDatasetSchema('en') as Record<string, unknown>

/** A description that drops the caveat must be caught. */
const withoutCaveat = {
  ...realMeasurement,
  description: aiCrawlerCopy('en').measurement.intro,
}
check(
  'MUT a description without the caveat fails the caveat check',
  !(withoutCaveat.description as string).includes(aiCrawlerCopy('en').measurement.caveat),
)

/** Reusing the table's @id would merge two different datasets into one. */
const mergedId = { ...realMeasurement, '@id': `${SITE_URL}/en/ai-crawlers#dataset` }
check('MUT the table @id on the measurement fails the separate-node check',
  mergedId['@id'] !== `${SITE_URL}/en/ai-crawlers#blocking-measurement`)

/** Inheriting the table's version would date the measurement wrongly. */
check('MUT the table version on the measurement fails the version check',
  String(AI_CRAWLER_DATASET_VERSION) !== String(BLOCKING_MEASUREMENT_VERSION))

/** A component with a typed-in figure must be caught, since it can then drift
 *  from the endpoint while every other guard still passes. */
check('MUT a typed-in percentage in the component is caught', /\d+(\.\d+)?\s?%/.test('also block 66.5% of'))

/** A per-site description that lost the read rate must be caught: it is the
 *  one sentence that keeps the percentages bounded wherever they are quoted. */
const sitesWithoutN = {
  ...(aiCrawlerBlockingSitesDatasetSchema('en') as Record<string, unknown>),
  description: 'Of the sites that block GPTBot, most wrote a rule that names it.',
}
check('MUT a per-site description without the n fails the read-rate check',
  !(sitesWithoutN.description as string).includes(String(BLOCKING_SITES_READ)))

/** An unsubstituted placeholder must be caught, since it reads as a template
 *  bug to a person and as a literal to a machine. */
check('MUT an unsubstituted placeholder in a description is caught',
  /\{[a-z]+\}/.test('covers {read} readable files'))

/** A layout that emits only one node must be caught. */
const oneNodeLayout = "const a = aiCrawlerDatasetSchema('en')"
check('MUT a layout that emits only the table is caught', !oneNodeLayout.includes('aiCrawlerBlockingDatasetSchema'))

/** A node whose fragment has no element behind it is what the anchor guard
 *  exists to catch, so a component without the id must fail it. */
const componentWithoutAnchor = '<section className="mt-12 rounded-card">'
check('MUT a measurement section with no id is caught',
  !componentWithoutAnchor.includes('id="blocking-measurement"'))

/** And the fragments the guard checks must be the ones the builders actually
 *  emit, or the guard is pinning anchors nobody links to. */
for (const fragment of FRAGMENTS) {
  check(`the ${fragment} fragment is one a node really uses`,
    datasetSrc.includes(`/en/ai-crawlers#${fragment}`))
}

console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1

export {}
