/**
 * ONE LOG LINE IN TEN, SAYING WHO ASKED — because nothing else can.
 *
 * Measured 22 November 2026: the project's Fluid Active CPU follows its
 * FUNCTION INVOCATIONS day for day (about 6,500 to 11,500 invocations a day, at
 * roughly 65 ms of CPU each), while the cron that was the whole story on 17
 * November is now a rounding error: 24 real passes and 72 skipped calls a day.
 * The public pages answer `private, no-cache, no-store` (the root layout reads
 * the visitor's language from cookie and header), so every page view, a
 * crawler's included, is an invocation. And none of them writes a runtime log
 * line, so `get_runtime_logs` shows 1,100 lines a day from the cron and nothing
 * from the thousands of page requests that actually cost the CPU.
 *
 * Which of those requests are crawlers, which are people, and which paths they
 * hit is the one fact a cut has to be aimed with, and no tool in reach reports
 * it (Vercel's observability query answers 400 on every shape, and Web
 * Analytics is off, which would leave out every bot anyway). So the request
 * proxy says it, for one request in ten, and `get_runtime_logs` with
 * `group_by: requestPath` or a `class=gptbot` query reads it back.
 *
 * WHAT IT DOES NOT DO. It never changes a response, never throws, and logs only
 * the path (no query string, no cookie, no address) and a coarse class of
 * user-agent, never the user-agent itself. A crawler's identity is public in the
 * agent string it sends; a person's browser is reduced to the one word `browser`.
 *
 * It is a measurement, not a feature: once the answer is known and the cut is
 * made, delete it.
 */

/** One request in this many is logged. Ten keeps a busy day to a thousand lines. */
export const REQUEST_SAMPLE_ONE_IN = 10

export type RequestClass =
  | 'googlebot' | 'bingbot' | 'gptbot' | 'claudebot' | 'perplexitybot'
  | 'ahrefsbot' | 'semrushbot' | 'metabot' | 'other-bot' | 'browser' | 'none'

/**
 * Order matters: the first match wins, so the specific crawler names come
 * before the generic "bot" catch-all, and `Googlebot` is matched before
 * anything that merely contains "Mozilla".
 */
const NAMED: ReadonlyArray<readonly [RequestClass, RegExp]> = [
  ['googlebot', /googlebot|google-inspectiontool|googleother|adsbot-google|apis-google/i],
  ['bingbot', /bingbot|bingpreview|msnbot/i],
  ['gptbot', /gptbot|chatgpt-user|oai-searchbot|openai/i],
  ['claudebot', /claudebot|claude-web|claude-user|claude-searchbot|anthropic/i],
  ['perplexitybot', /perplexity/i],
  ['ahrefsbot', /ahrefs/i],
  ['semrushbot', /semrush/i],
  ['metabot', /facebookexternalhit|meta-externalagent|facebot/i],
]

/** Anything else that says it is a machine. */
const GENERIC_BOT = /bot|crawl|spider|slurp|scrape|fetch|monitor|headless|python-requests|curl\/|wget|go-http-client|axios|node-fetch|java\/|okhttp|libwww|httpclient/i

export function classifyUserAgent(userAgent: string | null | undefined): RequestClass {
  const ua = (userAgent ?? '').trim()
  if (!ua) return 'none'
  for (const [name, pattern] of NAMED) if (pattern.test(ua)) return name
  if (GENERIC_BOT.test(ua)) return 'other-bot'
  return 'browser'
}

/**
 * For the unnamed machines only: the product token that says who it is
 * (e.g. "Amazonbot", "Bytespider"), at most 24 characters, so the sample can
 * show WHICH generic bots drive the cost. Never the whole User-Agent.
 */
export function botToken(userAgent: string | null | undefined): string {
  const m = /([A-Za-z0-9_.-]*(?:bot|crawl|spider|slurp|scrape|fetch|monitor)[A-Za-z0-9_.-]*)/i.exec(userAgent ?? '')
  if (m) return m[1].slice(0, 24)
  // No product token: say which generic word made it a machine (headless,
  // python-requests, curl, ...), so "-" no longer hides the biggest group.
  const g = GENERIC_BOT.exec(userAgent ?? '')
  return g ? g[0].toLowerCase().slice(0, 24) : '-'
}

/** Product tokens that identify no one. */
const GENERIC_TOKENS: ReadonlySet<string> = new Set(['crawler', 'crawl', 'bot', 'spider', 'fetch', 'monitor', 'scrape', 'headless', 'curl/', 'wget', '-'])

/**
 * The anonymous scraper measured on 27 Nov 2026: about 60% of all requests,
 * a Chrome-looking Mozilla agent whose only machine marker is the bare word
 * "crawler" (no product name, no contact URL). Every named crawler (Googlebot,
 * Bingbot, GPTBot, ClaudeBot, PerplexityBot, ...) is classified before
 * `other-bot`, so it never reaches this test, and an unnamed bot with a real
 * product token (Amazonbot, Bytespider) has a token other than "crawler".
 */
export function isAnonymousCrawler(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? ''
  if (classifyUserAgent(ua) !== 'other-bot') return false
  return botToken(ua).toLowerCase() === 'crawler' && /^Mozilla\/5\.0/i.test(ua.trim()) && /Chrome\//.test(ua)
}

/** The line, or null when this request is not in the sample. Pure, so it can be tested without a request. */
export function requestSampleLine(
  input: { pathname: string; userAgent: string | null | undefined },
  random: number,
): string | null {
  if (!(random < 1 / REQUEST_SAMPLE_ONE_IN)) return null
  const cls = classifyUserAgent(input.userAgent)
  const token = cls === 'other-bot' ? botToken(input.userAgent) : ''
  // A bare generic word ("crawler", "bot", "fetch") names nobody, and on
  // 27 Nov 2026 one such agent was about 60% of all sampled requests. For that
  // case only, say the start of the agent string so it can be identified. A
  // machine's agent string is public by design; browsers never reach here.
  const hint = GENERIC_TOKENS.has(token.toLowerCase())
    ? ` ua=${(input.userAgent ?? '').replace(/^Mozilla\/5\.0\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 80)}`
    : ''
  const who = cls === 'other-bot' ? ` bot=${token}${hint}` : ''
  return `[req-sample] class=${cls}${who} oneIn=${REQUEST_SAMPLE_ONE_IN}`
}

/**
 * Called first thing by the request proxy. The path is NOT in the message:
 * every runtime log record already carries `requestPath`, so
 * `get_runtime_logs` `group_by: requestPath` over `[req-sample]` is the
 * breakdown, and the message stays two short words.
 */
export function logRequestSample(
  request: { nextUrl: { pathname: string }; headers: { get(name: string): string | null } },
  random: number = Math.random(),
): void {
  try {
    const line = requestSampleLine(
      { pathname: request.nextUrl.pathname, userAgent: request.headers.get('user-agent') },
      random,
    )
    if (line) console.log(line)
  } catch {
    // A measurement must never be the reason a page does not answer.
  }
}
