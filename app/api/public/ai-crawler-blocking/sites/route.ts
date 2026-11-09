/**
 * GET /api/public/ai-crawler-blocking/sites — the measurement, domain by domain.
 *
 * WHY THIS EXISTS, in one editor's words. The 7 November aggregate at
 * `../ai-crawler-blocking` was offered to Abondance, the French SEO
 * publication, on 9 November 2026. Their editor turned it down for two stated
 * reasons, and both were right:
 *
 *   1. "Les données site par site ne sont pas publiées, seul le parseur l'est.
 *      Sans la liste des 528 sites et le verdict de chacun, ni nous ni nos
 *      lecteurs ne pouvons vérifier les pourcentages." A percentage nobody can
 *      recompute is not a measurement, it is a claim.
 *   2. Some publishers restrict OAI-SearchBot deliberately, while negotiating
 *      licensing with OpenAI. So a blocking rate cannot be presented as an
 *      error rate until the deliberate blocks are separated from the ones a
 *      site inherited from a blanket rule.
 *
 * This route answers both. Every requested domain is here with its Tranco rank,
 * whether its robots.txt could be read, and — when it could — the verdict for
 * each crawler together with the group that governed it and the exact deciding
 * line. `group: "*"` is a rule that lands on every bot alike; a group that names
 * the crawler is a rule someone wrote about that crawler. The findings count
 * those two separately, which is the distinction the editor asked for.
 *
 * THE SAMPLING BIAS IS IN THE PAYLOAD, not in prose beside it. 145 of the 700
 * hosts answered 403 to this measurement's client, and a host that refuses an
 * unknown automated client is plausibly a host that restricts AI crawlers too,
 * so the read subset probably under-states blocking. That sentence is a
 * `limitations` entry and a CSV column, for the same reason the sibling route's
 * caveat is: a spreadsheet that drops it is how a bounded figure becomes a
 * headline. Publishing every unreadable domain with its reason is what makes
 * the gap auditable instead of invisible.
 *
 * Safe to be public and unauthenticated for the same reasons as its siblings:
 * it reads no input, makes no outbound request, touches no database and serves
 * one constant.
 */
import SITES_MEASUREMENT from '@/lib/ai-crawlers/data/blocking-sites-2026-11-09.json'
import { AI_CRAWLER_DATASET_LICENSE } from '@/lib/ai-crawlers/dataset'
import { logRestrictedAttempt, restrictionForRequest } from '@/lib/sanctions/guard'

export const runtime = 'nodejs'

/** A dated measurement never changes, so cache it hard. */
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
} as const

const TOKENS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'Googlebot'] as const

type Verdict = { allowed: boolean; group: string | null; decidingLine: string }
type Site = {
  market: string
  trancoRank: number
  domain: string
  state: string
  verdicts: Record<string, Verdict> | null
}

const CSV_COLUMNS = [
  'market',
  'tranco_rank',
  'domain',
  'robots_state',
  ...TOKENS.flatMap((t) => [`${t}_allowed`, `${t}_group`, `${t}_deciding_line`]),
  'sampling_limitation',
] as const

/** RFC 4180: quote every field, and double any quote inside it. */
function csvField(value: string | number | boolean | null) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function csv() {
  // The bias note, not the "large sites" one: on a per-site table the question a
  // reader will have is why a row has no verdict.
  const limitation = SITES_MEASUREMENT.limitations[1]
  const rows = [CSV_COLUMNS.join(',')]
  for (const site of SITES_MEASUREMENT.sites as Site[]) {
    rows.push(
      [
        csvField(site.market),
        csvField(site.trancoRank),
        csvField(site.domain),
        csvField(site.state),
        ...TOKENS.flatMap((t) => {
          const v = site.verdicts?.[t]
          return [csvField(v ? v.allowed : null), csvField(v ? v.group : null), csvField(v ? v.decidingLine : null)]
        }),
        csvField(limitation),
      ].join(','),
    )
  }
  return rows.join('\r\n') + '\r\n'
}

export async function GET(request: Request) {
  const restricted = restrictionForRequest(request.headers)
  if (restricted) {
    logRestrictedAttempt('public-ai-crawler-blocking-sites', restricted)
    return new Response(null, { status: 451, headers: { ...CORS, 'cache-control': 'no-store' } })
  }

  const url = new URL(request.url)
  if (url.searchParams.get('format') === 'csv') {
    return new Response(csv(), {
      headers: {
        ...CORS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="ai-crawler-blocking-sites-${SITES_MEASUREMENT.measuredOn}.csv"`,
        'cache-control': CACHE,
        'x-license': AI_CRAWLER_DATASET_LICENSE.id,
      },
    })
  }

  // `?tld=.fr` serves one suffix's rows with that suffix's own findings, so a
  // publication writing for one country can cite its own figure rather than a
  // seven-market average. The editor asked for exactly this for France. The
  // parameter is `tld` and not `market` on purpose: `market` is this codebase's
  // billing word, a guard forbids any API route reading it from the client
  // (lib/billing/__qa__/w17-billing-market.qa.ts), and that guard is right —
  // a dataset's country suffix has no business sharing a name with a currency.
  const tld = url.searchParams.get('tld')
  let body: unknown = { ...SITES_MEASUREMENT, license: AI_CRAWLER_DATASET_LICENSE }
  if (tld) {
    const row = SITES_MEASUREMENT.findings.byMarket.find((m) => m.market === tld)
    if (!row) {
      return new Response(
        JSON.stringify(
          { error: 'unknown tld', tlds: SITES_MEASUREMENT.findings.byMarket.map((m) => m.market) },
          null,
          2,
        ) + '\n',
        { status: 404, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': CACHE } },
      )
    }
    const { sites, findings, ...rest } = SITES_MEASUREMENT
    body = {
      ...rest,
      license: AI_CRAWLER_DATASET_LICENSE,
      tld,
      findings: { tld: row, byCrawler: findings.byCrawler },
      sites: (sites as Site[]).filter((s) => s.market === tld),
    }
  }

  return new Response(JSON.stringify(body, null, 2) + '\n', {
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
