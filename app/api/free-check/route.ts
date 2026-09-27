/**
 * POST /api/free-check — the app's first PUBLIC, unauthenticated, paying route.
 *
 * proxy.ts's matcher excludes `/api/*`, so nothing authenticates this for us,
 * and by design nothing should: a visitor who has not signed up yet is exactly
 * the caller. What replaces authentication is the set of controls below, and
 * each of them is a deliberate part of the contract:
 *
 *   - lib/free-check/url-guard.ts admits the URL (syntax + resolved address),
 *     so the route cannot be used to reach anything but a public website;
 *   - lib/free-check/store.ts rate-limits per hashed client, replays a cached
 *     result per domain for 24h, and caps model spend per UTC day, failing
 *     CLOSED when its ledger cannot be read;
 *   - lib/free-check/site-fetch.ts caps bytes, time and redirect hops;
 *   - errors are coarse codes. No provider text, no hostnames from a failed
 *     resolution, no status details reach the caller — the client maps the code
 *     to merchant-safe copy.
 *
 * The response is never cached by an intermediary (no-store), because it is
 * per-visitor and because a shared cache would defeat the rate limit.
 */
import { NextResponse } from 'next/server'
import { issueClaimToken } from '@/lib/free-check/claim'
import { runFreeCheck } from '@/lib/free-check/run'
import { checkGate, clientIpFrom, hashClient, recordRun } from '@/lib/free-check/store'
import { domainKey, normalizeCheckUrl } from '@/lib/free-check/url-guard'
import type { FreeCheckErrorCode, FreeCheckResponse } from '@/lib/free-check/types'
import { LOCALES, type Locale } from '@/lib/i18n/locales'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

function fail(code: FreeCheckErrorCode, status: number) {
  return NextResponse.json({ ok: false, code } satisfies FreeCheckResponse, { status, headers: NO_STORE })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('invalid_url', 400)
  }
  const payload = (body ?? {}) as { url?: unknown; locale?: unknown }
  if (typeof payload.url !== 'string') return fail('invalid_url', 400)

  const locale: Locale = typeof payload.locale === 'string' && (LOCALES as string[]).includes(payload.locale) ? (payload.locale as Locale) : 'he'

  const admitted = normalizeCheckUrl(payload.url)
  if (!admitted.ok) {
    // Only the two reasons a merchant can act on are distinguished; the rest
    // collapse into "that address is not valid".
    const code: FreeCheckErrorCode = admitted.reason === 'host_reserved' || admitted.reason === 'port' ? 'blocked_url' : 'invalid_url'
    return fail(code, 400)
  }

  const domain = domainKey(admitted.url)
  const clientHash = hashClient(clientIpFrom(request.headers))

  let gate
  try {
    gate = await checkGate({ domain, locale, clientHash })
  } catch (err) {
    console.error('[free-check] gate failed', { message: err instanceof Error ? err.message : String(err) })
    return fail('internal', 500)
  }
  if (!gate.allowed) return fail(gate.reason, gate.reason === 'rate_limited' ? 429 : 500)
  if (gate.cached) {
    // A replayed scan still gets its OWN claim token: the row is shared, the
    // capability is not, so two visitors who scanned the same domain can each
    // seed their own account and neither can redeem the other's.
    const claimToken = gate.cachedCheckId ? await issueClaimToken(gate.cachedCheckId) : null
    return NextResponse.json(
      { ok: true, result: gate.cached, ...(claimToken ? { claimToken } : {}) } satisfies FreeCheckResponse,
      { headers: NO_STORE },
    )
  }

  let outcome
  try {
    outcome = await runFreeCheck(admitted.url, locale, { allowAi: gate.allowAi })
  } catch (err) {
    console.error('[free-check] run failed', { domain, message: err instanceof Error ? err.message : String(err) })
    return fail('internal', 500)
  }
  if (!outcome.ok) return fail(outcome.code, outcome.code === 'blocked_url' ? 400 : 502)

  // The ledger write is also the rate-limit and spend record, so it happens on
  // every completed run — but it must never turn a good result into an error.
  const checkId = await recordRun({ domain, locale, url: outcome.result.url, result: outcome.result, seed: outcome.seed, clientHash })
  const claimToken = checkId ? await issueClaimToken(checkId) : null

  return NextResponse.json(
    { ok: true, result: outcome.result, ...(claimToken ? { claimToken } : {}) } satisfies FreeCheckResponse,
    { headers: NO_STORE },
  )
}
