/**
 * GET /api/public/ai-crawler-blocking — the 07.11.2026 measurement, given away.
 *
 * Public and unauthenticated by design, and safe to be, for the same reasons as
 * its sibling `/api/public/ai-crawlers`: it reads no input, makes no outbound
 * request, touches no database and serves one constant. Identical for every
 * caller, therefore cacheable, therefore a second request costs the CDN.
 *
 * WHY IT EXISTS. Every editorial mail we send about this finding offers to send
 * the per-market detail. A URL is better than an offer: it can be cited in a
 * sentence, linked from a chart, and read by whoever is actually writing the
 * piece at the time they are writing it. The one inbound do-follow link this
 * programme has earned in German pointed at the dataset endpoint rather than at
 * the product page, which is the whole argument for publishing the numbers.
 *
 * THE LIMITATION TRAVELS IN THE PAYLOAD, not in prose beside it, and the CSV
 * carries it too — as a `limitation` column repeated on every row, which is
 * ugly and deliberate. A spreadsheet that drops the caveat is exactly how
 * "two thirds of sites" becomes a claim about small businesses.
 */
import {
  BLOCKING_MEASUREMENT,
  BLOCKING_MEASUREMENT_VERSION,
} from '@/lib/ai-crawlers/blocking-measurement'
import { AI_CRAWLER_DATASET_LICENSE } from '@/lib/ai-crawlers/dataset'
import { logRestrictedAttempt, restrictionForRequest } from '@/lib/sanctions/guard'

export const runtime = 'nodejs'

/** One hour in a browser, one day at the edge: a dated measurement does not change at all. */
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
} as const

function json() {
  return {
    version: BLOCKING_MEASUREMENT_VERSION,
    license: AI_CRAWLER_DATASET_LICENSE,
    source: 'https://www.gotopseo.com/en/ai-crawlers',
    dataset: 'https://www.gotopseo.com/api/public/ai-crawlers',
    ...BLOCKING_MEASUREMENT,
  }
}

const CSV_COLUMNS = ['market', 'blocks_traffic_crawler_pct', 'n_robots_read', 'measured_on', 'limitation'] as const

/** RFC 4180: quote every field, and double any quote inside it. */
function csvField(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function csv() {
  const limitation = BLOCKING_MEASUREMENT.limitations[0]
  const rows = [CSV_COLUMNS.join(',')]
  for (const m of BLOCKING_MEASUREMENT.findings.byMarket) {
    rows.push(
      [
        csvField(m.market),
        csvField(m.blocksTrafficCrawlerPct),
        csvField(BLOCKING_MEASUREMENT.method.robotsFilesRead),
        csvField(BLOCKING_MEASUREMENT.measuredOn),
        csvField(limitation),
      ].join(','),
    )
  }
  return rows.join('\r\n') + '\r\n'
}

export async function GET(request: Request) {
  const restricted = restrictionForRequest(request.headers)
  if (restricted) {
    logRestrictedAttempt('public-ai-crawler-blocking', restricted)
    return new Response(null, { status: 451, headers: { ...CORS, 'cache-control': 'no-store' } })
  }

  const format = new URL(request.url).searchParams.get('format')

  if (format === 'csv') {
    return new Response(csv(), {
      headers: {
        ...CORS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="ai-crawler-blocking-${BLOCKING_MEASUREMENT_VERSION}.csv"`,
        'cache-control': CACHE,
        'x-license': AI_CRAWLER_DATASET_LICENSE.id,
      },
    })
  }

  return new Response(JSON.stringify(json(), null, 2) + '\n', {
    headers: {
      ...CORS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': CACHE,
      'x-license': AI_CRAWLER_DATASET_LICENSE.id,
    },
  })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'access-control-max-age': '86400' } })
}
