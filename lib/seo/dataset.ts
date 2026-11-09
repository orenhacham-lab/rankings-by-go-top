/**
 * The AI-crawler reference table, declared as a Dataset.
 *
 * We already give the table away at /api/public/ai-crawlers under CC BY 4.0,
 * and the page at /ai-crawlers renders every row before anyone types. What was
 * missing is the one thing that makes a dataset FINDABLE as a dataset: Google
 * Dataset Search, and every engine that reads schema.org, index a dataset only
 * from `@type: Dataset` markup on the page that publishes it. We emitted none,
 * so to a crawler the page was a tool with a table on it, not a dataset with a
 * licence, a version and two download formats.
 *
 * Everything here is built from what the page and the endpoint already state:
 * the visible meta description, the licence constant the API serves, and the
 * dataset version the rows are stamped with. Nothing is written for crawlers
 * that a reader cannot see — markup for some user agents only is cloaking, and
 * we never build it.
 *
 * `isAccessibleForFree` is a claim about the DATA, not about the product: the
 * JSON and the CSV need no key, no sign-up and no quota, which is exactly what
 * the field means.
 */
import { AI_CRAWLER_DATASET_LICENSE, AI_CRAWLER_DATASET_VERSION } from '@/lib/ai-crawlers/dataset'
import {
  BLOCKING_MEASUREMENT,
  BLOCKING_MEASUREMENT_VERSION,
} from '@/lib/ai-crawlers/blocking-measurement'
import { aiCrawlerCopy } from '@/lib/ai-crawlers/copy'
import { LOCALE_CONFIG, LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'
import { ORGANIZATION_ID, SITE_URL } from './organization'

/** `2026.11.01` is how a consumer caches on it; ISO-8601 is how schema.org reads it. */
export function datasetVersionAsDate(version: string) {
  return version.replace(/\./g, '-')
}

/**
 * One Dataset node for the /ai-crawlers page in a given language.
 *
 * `@id` is the same on every locale and points at the ENGLISH page, because
 * the seven pages publish one dataset in seven languages, not seven datasets.
 * An engine that resolved each locale to its own Dataset would count the table
 * seven times and credit none of them properly.
 */
export function aiCrawlerDatasetSchema(locale: PublicLocale) {
  const copy = aiCrawlerCopy(locale)
  const pageUrl = `${SITE_URL}${LOCALE_PREFIX[locale]}/ai-crawlers`
  const endpoint = `${SITE_URL}/api/public/ai-crawlers`

  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${SITE_URL}/en/ai-crawlers#dataset`,
    name: copy.reference.datasetName,
    // schema.org wants 50–5000 characters, and the page's own meta description
    // is the sentence a reader is shown, so it is the sentence a crawler gets.
    description: copy.meta.description,
    url: pageUrl,
    inLanguage: LOCALE_CONFIG[locale].lang,
    license: AI_CRAWLER_DATASET_LICENSE.url,
    isAccessibleForFree: true,
    version: AI_CRAWLER_DATASET_VERSION,
    dateModified: datasetVersionAsDate(AI_CRAWLER_DATASET_VERSION),
    creator: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    // The two formats the endpoint actually serves, and nothing else. A
    // distribution pointing at a format we do not serve is the one claim a
    // crawler can cheaply disprove.
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: endpoint,
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/csv',
        contentUrl: `${endpoint}?format=csv`,
      },
    ],
  }
}

/**
 * The 07.11.2026 robots.txt measurement, declared as a second Dataset.
 *
 * WHY A SEPARATE NODE. It is a different dataset from the reference table: a
 * dated observation with an n and a method, not a table of tokens kept current.
 * Folding it into the table's node would make one of them wrong — either the
 * table would carry a measurement date, or the measurement would inherit the
 * table's version and look like something that changes.
 *
 * WHY IT MAY BE DECLARED AT ALL. Markup for crawlers that a reader cannot see
 * is cloaking, and we never build it. This node exists only because the
 * measurement now renders on the page: the headline, the per-market table and
 * the caveat are all visible to a visitor, and the node says what they say.
 *
 * THE CAVEAT IS IN THE DESCRIPTION, not left behind on the page. A Dataset
 * description is what a search result and an AI answer quote, so the sentence
 * that bounds the figures travels with them into whatever shows them next.
 */
export function aiCrawlerBlockingDatasetSchema(locale: PublicLocale) {
  const copy = aiCrawlerCopy(locale)
  const pageUrl = `${SITE_URL}${LOCALE_PREFIX[locale]}/ai-crawlers`
  const endpoint = `${SITE_URL}/api/public/ai-crawler-blocking`

  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${SITE_URL}/en/ai-crawlers#blocking-measurement`,
    name: copy.measurement.title,
    description: [copy.measurement.intro, copy.measurement.caveat, copy.measurement.notSampled].join(' '),
    url: pageUrl,
    inLanguage: LOCALE_CONFIG[locale].lang,
    license: AI_CRAWLER_DATASET_LICENSE.url,
    isAccessibleForFree: true,
    version: BLOCKING_MEASUREMENT_VERSION,
    dateModified: datasetVersionAsDate(BLOCKING_MEASUREMENT_VERSION),
    // A single day, because that is what was observed. A range would claim a
    // continuity the measurement does not have.
    temporalCoverage: BLOCKING_MEASUREMENT.measuredOn,
    measurementTechnique: BLOCKING_MEASUREMENT.method.how,
    // The tokens the verdicts were matched against, so the two datasets are
    // linked rather than each standing alone.
    isBasedOn: `${SITE_URL}/en/ai-crawlers#dataset`,
    creator: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: endpoint,
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/csv',
        contentUrl: `${endpoint}?format=csv`,
      },
    ],
  }
}
