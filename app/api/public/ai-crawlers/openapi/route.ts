/**
 * GET /api/public/ai-crawlers/openapi — the machine-readable description of the
 * dataset endpoint one level up.
 *
 * It exists so a catalogue can list us. APIs.guru and the tooling built on its
 * collection index an API from an OpenAPI document at a stable URL; without one
 * the endpoint is something a person has to read about. The document itself is
 * built in lib/ai-crawlers/openapi.ts from the same constants the dataset route
 * serves, so the two cannot drift.
 *
 * Same posture as the dataset route: no input is read, nothing is fetched,
 * nothing is stored, the response is a constant, and so it is CORS-open and
 * cacheable rather than rate limited. The sanctions guard is kept for the same
 * reason the dataset route has it — one public surface, one rule.
 */
import { aiCrawlerOpenApiDocument } from '@/lib/ai-crawlers/openapi'
import { logRestrictedAttempt, restrictionForRequest } from '@/lib/sanctions/guard'

export const runtime = 'nodejs'

/** One hour in a browser, one day at the edge: the shape changes in months. */
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
} as const

export async function GET(request: Request) {
  const restricted = restrictionForRequest(request.headers)
  if (restricted) {
    logRestrictedAttempt('public-ai-crawler-openapi', restricted)
    return new Response(null, { status: 451, headers: { ...CORS, 'cache-control': 'no-store' } })
  }

  return new Response(JSON.stringify(aiCrawlerOpenApiDocument(), null, 2) + '\n', {
    headers: {
      ...CORS,
      // The registered type for an OpenAPI document. A catalogue that sniffs
      // the type rather than the body gets the right answer from it.
      'content-type': 'application/openapi+json; charset=utf-8',
      'cache-control': CACHE,
    },
  })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'access-control-max-age': '86400' } })
}
