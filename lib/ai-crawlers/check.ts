/**
 * One run of the AI crawler check: fetch /robots.txt, then decide every agent.
 *
 * The fetch is the ONLY outbound call the whole asset makes, and it is made
 * through lib/free-check/site-fetch.ts, which already carries the properties a
 * public unauthenticated fetcher needs (every hop re-admitted, byte and time
 * caps, no forwarded credentials). Reusing it rather than writing a second
 * fetcher is deliberate: a second one is a second place for the SSRF rules to
 * drift out of agreement with the first.
 */
import { fetchSiteText } from '@/lib/free-check/site-fetch'
import { assertPublicHost } from '@/lib/free-check/url-guard'
import { AI_CRAWLERS } from './agents'
import { isAllowed, parseRobots } from './robots'
import type { AiCrawlerErrorCode, AiCrawlerResult, CrawlerVerdict, RobotsState } from './types'

/** At most this many `Sitemap:` lines are echoed back. */
const MAX_SITEMAPS = 10

type Deps = {
  fetchImpl?: typeof fetch
  resolver?: Parameters<typeof assertPublicHost>[1]
}

export type CheckOutcome = { ok: true; result: AiCrawlerResult } | { ok: false; code: AiCrawlerErrorCode }

/**
 * Decide every agent against an already-fetched robots.txt body.
 *
 * Split out from the fetch so the QA suite can pin the whole decision table
 * against fixture files with no network at all.
 */
export function verdictsFor(robotsText: string, path: string): CrawlerVerdict[] {
  const parsed = parseRobots(robotsText)
  return AI_CRAWLERS.map((crawler) => {
    const verdict = isAllowed(parsed, crawler.token, path)
    return {
      token: crawler.token,
      operator: crawler.operator,
      purpose: crawler.purpose,
      classicSearch: crawler.classicSearch === true,
      respectsRobots: crawler.respectsRobots,
      allowed: verdict.allowed,
      source: verdict.source,
      rule: verdict.decidedBy
        ? { kind: verdict.decidedBy.kind, pattern: verdict.decidedBy.pattern, line: verdict.decidedBy.line }
        : null,
    }
  })
}

/** Everything is allowed: the answer when a site serves no robots.txt at all. */
function openVerdicts(path: string): CrawlerVerdict[] {
  return verdictsFor('', path)
}

export async function runAiCrawlerCheck(site: URL, path: string, deps: Deps = {}): Promise<CheckOutcome> {
  const robotsUrl = new URL('/robots.txt', site)
  const fetched = await fetchSiteText(robotsUrl, deps)

  if (!fetched.ok) {
    // 'blocked' means an admission layer refused a hop; everything else is the
    // site being unreachable from here. Neither reason is elaborated on.
    return { ok: false, code: fetched.reason === 'blocked' ? 'blocked_url' : 'unreachable' }
  }

  let state: RobotsState
  let text = ''
  if (fetched.status === 404 || fetched.status === 410) {
    // No robots.txt is a real, complete answer — and the friendliest one:
    // nothing is blocked. It is not an error and must not be shown as one.
    state = 'absent'
  } else if (fetched.status >= 200 && fetched.status < 300) {
    state = 'found'
    text = fetched.text
  } else {
    // 403, 5xx, or anything else: the file exists in some sense but we cannot
    // read a policy out of it, so we say that rather than guessing "open".
    state = 'unreadable'
  }

  const parsed = parseRobots(text)
  // A 200 that returns a site's HTML 404 page rather than a text file is
  // common. It has no `User-agent:` line, so it parses as "no rules", which is
  // the same answer as absent and is reported as absent rather than as a file
  // we read and found empty.
  if (state === 'found' && parsed.empty) state = 'absent'

  const verdicts = state === 'found' ? verdictsFor(text, path) : openVerdicts(path)
  const allowed = verdicts.filter((v) => v.allowed).length

  return {
    ok: true,
    result: {
      domain: site.hostname,
      path,
      robots: state,
      bytes: state === 'found' ? text.length : 0,
      sitemaps: parsed.sitemaps.slice(0, MAX_SITEMAPS).map((s) => s.slice(0, 300)),
      verdicts,
      summary: { allowed, blocked: verdicts.length - allowed },
    },
  }
}
