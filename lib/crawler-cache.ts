/**
 * A CDN-CACHEABLE COPY OF THE PUBLIC PAGES, FOR CRAWLERS ONLY.
 *
 * Measured 23 November 2026 (lib/observability/request-sample.ts): about 2,500
 * page requests a day reach this project's functions, about 69% of them from
 * crawlers, and each one renders a 150-215 KB page that answers
 * `private, no-cache, no-store` (the root layout reads the visitor's cookie and
 * country). Nothing in that is reusable between visitors, so nothing was cached.
 *
 * A crawler is the one visitor for whom it IS reusable: it sends no cookie, it
 * does not log in, and the page it is shown is the same for every crawler that
 * asks for the same URL. So a request that is provably a crawler, on a public
 * marketing path, is answered with a Vercel-CDN-only cache lifetime. A person
 * is never touched.
 *
 * THE DANGER THIS FILE EXISTS TO CONTAIN: a cached crawler copy must never be
 * served to a person (it would carry a crawler's consent defaults and market).
 * Two things prevent it, and both are guarded by lib/__qa__/crawler-cache.qa.ts:
 *   1. the crawler's request is REWRITTEN to carry `?__crawler=1`, so its cache
 *      key differs from the URL a person asks for (a person is never rewritten);
 *   2. the lifetime is set only on the crawler's response.
 *
 * WHAT IT NEVER DOES: block anyone. Every crawler, AI ones included, still gets
 * the page. Anything with a cookie, a query string, a non-GET method, an RSC or
 * prefetch header, or a path outside the public allowlist is left exactly as it
 * was.
 */

import { classifyUserAgent, type RequestClass } from '@/lib/observability/request-sample'
import { PUBLIC_LOCALES } from '@/lib/i18n/locales'

/** The query parameter that gives a crawler its own cache key. */
export const CRAWLER_PARAM = '__crawler'

/** One hour fresh, a day stale-while-revalidate. A deploy replaces the cache anyway. */
export const CRAWLER_CDN_CACHE = 's-maxage=3600, stale-while-revalidate=86400'

/** Header Vercel's CDN reads (and strips) in preference to Cache-Control. */
export const CRAWLER_CACHE_HEADER = 'Vercel-CDN-Cache-Control'

const NAMED_CRAWLERS: ReadonlySet<RequestClass> = new Set([
  'googlebot', 'bingbot', 'gptbot', 'claudebot', 'perplexitybot', 'ahrefsbot', 'semrushbot', 'metabot',
])

/** An unnamed agent counts only if it SAYS it is a crawler. `curl`, `python-requests` and monitors do not. */
const SELF_DECLARED_CRAWLER = /bot|crawl|spider/i

/** Public marketing sections. Everything else (dashboard, auth, billing, /r/ affiliate clicks, the free check) is out. */
const PUBLIC_SECTIONS = [
  'features', 'solutions', 'pricing', 'compare', 'articles', 'blog',
  'privacy', 'terms', 'accessibility', 'affiliates', 'affiliate-terms', 'ai-crawlers',
]

export function isPublicMarketingPath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length > 0 && (PUBLIC_LOCALES as readonly string[]).includes(parts[0])) parts.shift()
  if (parts.length === 0) return true // the home page, with or without a locale
  return PUBLIC_SECTIONS.includes(parts[0])
}

/**
 * STAGE 1 OF 2. Until the CDN has been seen to key a crawler's copy apart from a
 * person's on the REAL deployment (a preview cannot be probed with a crawler
 * agent from here), the feature answers for ONE URL that no person ever visits.
 * Stage 2 sets this to null in a second, one-line change once that is proven.
 */
export const ROLLOUT_PATHS: readonly string[] | null = ['/en/articles/zz-crawler-canary']

export interface CrawlerCacheInput {
  method: string
  pathname: string
  search: string
  userAgent: string | null | undefined
  /** Request headers by lower-case name. */
  header(name: string): string | null
}

export function isCacheableCrawlerRequest(
  input: CrawlerCacheInput,
  rolloutPaths: readonly string[] | null = ROLLOUT_PATHS,
): boolean {
  if (rolloutPaths && !rolloutPaths.includes(input.pathname)) return false
  if (input.method !== 'GET') return false
  if (input.search) return false
  if (input.header('cookie')) return false
  if (input.header('rsc') || input.header('next-router-prefetch') || input.header('next-router-state-tree')) return false
  if (!isPublicMarketingPath(input.pathname)) return false
  const cls = classifyUserAgent(input.userAgent)
  if (NAMED_CRAWLERS.has(cls)) return true
  return cls === 'other-bot' && SELF_DECLARED_CRAWLER.test(input.userAgent ?? '')
}
