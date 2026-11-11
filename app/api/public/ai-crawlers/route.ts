/**
 * GET /api/public/ai-crawlers — the AI crawler dataset, given away.
 *
 * Public and unauthenticated BY DESIGN, and unlike /api/ai-crawlers it is also
 * SAFE to be: this route reads no input, makes no outbound request, touches no
 * database and spends nothing. It serves one constant from
 * lib/ai-crawlers/dataset.ts. There is therefore nothing to rate limit — the
 * response is identical for every caller, so it is marked cacheable and a
 * second request costs the CDN, not us. (That is the opposite of
 * /api/ai-crawlers, which is `no-store` precisely because it fetches a site on
 * the caller's behalf.)
 *
 * WHY IT EXISTS. The reference table behind the free AI-crawler check is worth
 * more to us outside the page than inside it: a dataset someone else's site,
 * script or CI job consumes is a reason for them to credit us, and CC BY 4.0
 * asks for exactly that and nothing else. No key, no sign-up, no quota, and
 * `access-control-allow-origin: *` so it can be fetched straight from a
 * browser page that is not ours.
 *
 * WHAT A CONSUMER GETS. `?format=csv` for a spreadsheet, JSON otherwise.
 * `candidates` is served as its own array, never mixed into `crawlers`, so
 * "the operator documents this token" and "we have seen this token" cannot be
 * confused by anyone reading the file rather than the prose.
 *
 * TWO THINGS DELIBERATELY NOT HERE. No visitor is recorded, because nothing
 * about serving a constant needs one. And no link back to us is required of a
 * consumer beyond the attribution the licence already states.
 */
import {
  AI_CRAWLER_CANDIDATES,
  AI_CRAWLER_DATASET,
  AI_CRAWLER_DATASET_LICENSE,
  AI_CRAWLER_DATASET_VERSION,
} from '@/lib/ai-crawlers/dataset'
import { logRestrictedAttempt, restrictionForRequest } from '@/lib/sanctions/guard'

export const runtime = 'nodejs'

/** One hour in a browser, one day at the edge: the data changes in weeks. */
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
} as const

const NOTES = [
  "Every row's token spelling, purpose and robots.txt behaviour comes from the operator's own documentation, linked in `docs`, read on the date in `verified`. Nothing is inferred from a log file.",
  'purpose is the field that changes the decision: `train` is a corpus for a future model, `answer` is a fetch made while a person waits for an answer that can cite and link you, `search` builds an index, `ads` checks an advert landing page, `preview` builds a link preview, and `agent` is a browser driven by an assistant on one person’s behalf, which is a visitor rather than a crawler.',
  'crawls: false marks a robots.txt control token that fetches nothing by itself. Disallowing it changes how already-crawled content may be used; both Google and Apple document that it does not remove you from their search results.',
  'respectsRobots: false marks an agent whose own operator documents that robots.txt may be ignored. For those, a robots.txt verdict states the request a site is making, not an outcome.',
  'candidates are tokens seen in the wild that no operator page documents. They are listed separately on purpose. A link to such a page is the correction this dataset most wants.',
]

function json() {
  return {
    version: AI_CRAWLER_DATASET_VERSION,
    license: AI_CRAWLER_DATASET_LICENSE,
    source: 'https://www.gotopseo.com/en/ai-crawlers',
    notes: NOTES,
    crawlers: AI_CRAWLER_DATASET,
    candidates: AI_CRAWLER_CANDIDATES,
  }
}

const CSV_COLUMNS = ['token', 'operator', 'purpose', 'crawls', 'respects_robots', 'classic_search', 'docs', 'verified', 'note'] as const

/** RFC 4180: quote every field, and double any quote inside it. */
function csvField(value: string | boolean | undefined) {
  const text = value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function csv() {
  const rows = [CSV_COLUMNS.join(',')]
  for (const c of AI_CRAWLER_DATASET) {
    rows.push(
      [
        csvField(c.token),
        csvField(c.operator),
        csvField(c.purpose),
        csvField(c.crawls),
        csvField(c.respectsRobots),
        csvField(c.classicSearch ?? false),
        csvField(c.docs),
        csvField(c.verified),
        csvField(c.note),
      ].join(','),
    )
  }
  return rows.join('\r\n') + '\r\n'
}

export async function GET(request: Request) {
  const restricted = restrictionForRequest(request.headers)
  if (restricted) {
    logRestrictedAttempt('public-ai-crawler-dataset', restricted)
    return new Response(null, { status: 451, headers: { ...CORS, 'cache-control': 'no-store' } })
  }

  const format = new URL(request.url).searchParams.get('format')

  if (format === 'csv') {
    return new Response(csv(), {
      headers: {
        ...CORS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="ai-crawlers-${AI_CRAWLER_DATASET_VERSION}.csv"`,
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
