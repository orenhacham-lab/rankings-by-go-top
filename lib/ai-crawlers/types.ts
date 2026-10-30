/**
 * The wire contract between /api/ai-crawlers and the page that calls it.
 *
 * Errors are COARSE CODES, never provider text. The route never puts a status
 * line, a DNS message or a hostname from a failed resolution into the
 * response; the client maps the code to its own translated sentence. That is
 * the standing rule in CLAUDE.md, and here it is also the thing that keeps a
 * public, unauthenticated endpoint from being an oracle about our network.
 */
import type { CrawlerPurpose } from './agents'

export type AiCrawlerErrorCode =
  | 'invalid_url'
  | 'blocked_url'
  | 'unreachable'
  | 'rate_limited'
  | 'internal'

/** What the fetch of /robots.txt found. */
export type RobotsState =
  /** A robots.txt was served. */
  | 'found'
  /** The site answered 404/410: there is no robots.txt, so nothing is blocked. */
  | 'absent'
  /** It answered, but with a status we cannot read a policy from (403, 5xx). */
  | 'unreadable'

export type CrawlerVerdict = {
  token: string
  operator: string
  purpose: CrawlerPurpose
  classicSearch: boolean
  /** False when the operator has not committed to honouring robots.txt. */
  respectsRobots: boolean
  allowed: boolean
  /** Which group decided: the crawler's own, the `*` fallback, or neither. */
  source: 'agent' | 'wildcard' | 'none'
  /** The deciding line, verbatim, so the reader can find it in their file. */
  rule: { kind: 'allow' | 'disallow'; pattern: string; line: number } | null
}

export type AiCrawlerResult = {
  /** The site as we fetched it, after redirects. Never the raw input. */
  domain: string
  /** The path the verdicts are about. '/' unless the visitor asked for one. */
  path: string
  robots: RobotsState
  /** Bytes of robots.txt, so the page can say "we read a 412-byte file". */
  bytes: number
  /** `Sitemap:` lines found, capped. Useful, and cheap to surface. */
  sitemaps: string[]
  verdicts: CrawlerVerdict[]
  /** Counts, so the headline does not have to be computed twice. */
  summary: { allowed: number; blocked: number }
}

export type AiCrawlerResponse =
  | { ok: true; result: AiCrawlerResult }
  | { ok: false; code: AiCrawlerErrorCode }
