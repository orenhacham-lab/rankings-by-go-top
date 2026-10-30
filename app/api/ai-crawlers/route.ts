/**
 * POST /api/ai-crawlers — public and unauthenticated BY DESIGN.
 *
 * proxy.ts's matcher excludes `/api/*`, so nothing authenticates this for us,
 * and nothing should: the caller is a visitor who has not signed up, which is
 * the entire point of a linkable free asset. What stands in authentication's
 * place is the same set of controls the free site check uses, and each is load
 * bearing:
 *
 *   - lib/free-check/url-guard.ts admits the URL by syntax AND by every
 *     address it resolves to, so this cannot be turned into a probe of
 *     anything but a public website;
 *   - lib/free-check/site-fetch.ts re-admits every redirect hop and caps
 *     bytes, time and hops, so one won DNS race is still one capped GET;
 *   - lib/ai-crawlers/rate-limit.ts bounds how fast one client may ask;
 *   - lib/sanctions/guard.ts refuses restricted jurisdictions, as every public
 *     surface does;
 *   - errors are coarse codes. No status line, no DNS text, no resolved
 *     address reaches the caller — the page maps the code to its own
 *     translated sentence (a standing rule in CLAUDE.md).
 *
 * NOTHING IS STORED. No row, no ledger, no visitor record: the check spends no
 * money, so there is no budget to account for, and a tool people are asked to
 * trust with their domain is better for keeping nothing. The rate limit holds
 * its counters in memory and says so in its own file.
 *
 * The response is `no-store`: it is per-caller, it is about a file that can
 * change at any moment, and a shared cache would defeat the rate limit.
 */
import { NextResponse } from 'next/server'
import { runAiCrawlerCheck } from '@/lib/ai-crawlers/check'
import { takeToken } from '@/lib/ai-crawlers/rate-limit'
import { normalizeCheckPath } from '@/lib/ai-crawlers/robots'
import type { AiCrawlerErrorCode, AiCrawlerResponse } from '@/lib/ai-crawlers/types'
import { clientIpFrom, hashClient } from '@/lib/free-check/store'
import { normalizeCheckUrl } from '@/lib/free-check/url-guard'
import { logRestrictedAttempt, restrictionForRequest } from '@/lib/sanctions/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

function fail(code: AiCrawlerErrorCode, status: number) {
  return NextResponse.json({ ok: false, code } satisfies AiCrawlerResponse, { status, headers: NO_STORE })
}

export async function POST(request: Request) {
  const restricted = restrictionForRequest(request.headers)
  if (restricted) {
    logRestrictedAttempt('ai-crawlers', restricted)
    return fail('blocked_url', 451)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('invalid_url', 400)
  }
  const payload = (body ?? {}) as { url?: unknown; path?: unknown }
  if (typeof payload.url !== 'string') return fail('invalid_url', 400)

  const admitted = normalizeCheckUrl(payload.url)
  if (!admitted.ok) {
    // Only the two reasons a visitor can act on are distinguished; every other
    // rejection collapses into "that address is not valid".
    const code: AiCrawlerErrorCode =
      admitted.reason === 'host_reserved' || admitted.reason === 'port' ? 'blocked_url' : 'invalid_url'
    return fail(code, 400)
  }

  // The rate limit is taken AFTER admission so a stream of malformed input
  // cannot spend a legitimate visitor's allowance, and BEFORE the fetch, which
  // is the only expensive thing here.
  const gate = takeToken(hashClient(clientIpFrom(request.headers)))
  if (!gate.allowed) return fail('rate_limited', 429)

  const path = normalizeCheckPath(typeof payload.path === 'string' ? payload.path : undefined)

  let outcome
  try {
    outcome = await runAiCrawlerCheck(admitted.url, path)
  } catch (err) {
    // The message is logged for us and never returned.
    console.error('[ai-crawlers] check failed', {
      domain: admitted.url.hostname,
      message: err instanceof Error ? err.message : String(err),
    })
    return fail('internal', 500)
  }
  if (!outcome.ok) return fail(outcome.code, outcome.code === 'blocked_url' ? 400 : 502)

  return NextResponse.json({ ok: true, result: outcome.result } satisfies AiCrawlerResponse, { headers: NO_STORE })
}
