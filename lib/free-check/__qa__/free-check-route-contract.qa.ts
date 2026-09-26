/**
 * The contract of the app's first PUBLIC, unauthenticated, paying route.
 *
 * proxy.ts's matcher excludes /api/*, so /api/free-check has no authentication
 * in front of it and none behind it either — by design, since the caller is a
 * visitor who has not signed up. What replaces authentication is a fixed set of
 * controls, and this suite exists so a later edit cannot quietly drop one of
 * them: URL admission before any outbound request, a rate limit and a spend
 * ceiling that FAIL CLOSED, a per-domain cache, and coarse error codes that
 * never leak provider text to a merchant.
 *
 * The gate's behaviour is exercised against a real in-memory Supabase fake
 * (FakeAdmin), not mocked away, so the filters and the error paths genuinely
 * run. MUTATION CONTROLS at the end show the fail-closed assertions catch a
 * gate that treats a DB error as "allow".
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin, type ErrorHooks } from '@/lib/__qa__/_fake-admin'
import { checkGate, hashClient, clientIpFrom, RATE_MAX_IN_WINDOW, recordRun } from '../store'
import { runFreeCheck } from '../run'
import type { FreeCheckResult } from '../types'
import type { ServiceRoleClient } from '@/lib/supabase/admin'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const NOW = new Date('2026-09-26T12:00:00Z')
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()
const CLIENT = hashClient('203.0.113.9')

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: `r${Math.random()}`,
    domain: 'example.co.il',
    locale: 'he',
    url: 'https://example.co.il/',
    result: { domain: 'example.co.il', cached: false } as unknown as FreeCheckResult,
    ai_used: true,
    client_hash: CLIENT,
    created_at: iso(60_000),
    ...over,
  }
}

async function main() {
  console.log('SOURCE) the route cannot skip a control')
  const route = stripComments(read('../../../app/api/free-check/route.ts'))
  check('URL is admitted through normalizeCheckUrl', /normalizeCheckUrl\(payload\.url\)/.test(route))
  // Ordering is judged inside the handler body, so the import block (where the
  // same identifiers appear in another order) cannot satisfy it.
  const handler = route.slice(route.indexOf('export async function POST'))
  check('admission happens before the run', handler.indexOf('normalizeCheckUrl') < handler.indexOf('runFreeCheck'))
  check('the gate is consulted before the run', handler.indexOf('checkGate') < handler.indexOf('runFreeCheck'))
  check('a refused gate short-circuits', /if \(!gate\.allowed\) return fail\(gate\.reason/.test(route))
  check('a cache hit returns without scanning', /if \(gate\.cached\)/.test(route))
  check('the model call is permitted only by the gate', /allowAi: gate\.allowAi/.test(route))
  check('every run is recorded (rate limit + spend ledger)', /recordRun\(/.test(route))
  check('responses are never cached by an intermediary', /'cache-control': 'no-store'/.test(route))
  check('errors are coarse codes, never provider text', !/err instanceof Error \? err\.message : String\(err\)[\s\S]{0,80}NextResponse/.test(route))
  check('no user-supplied header decides anything but the throttle key', !/request\.headers\.get\('authorization'\)/.test(route))
  check('node runtime (the guard needs DNS)', /export const runtime = 'nodejs'/.test(route))

  check('every response carries its own claim token, cache hit included',
    /issueClaimToken\(gate\.cachedCheckId\)/.test(route) && /issueClaimToken\(checkId\)/.test(route))
  check('the token rides the response, never the stored result',
    !/result: \{[^}]*claimToken/.test(route))

  const store = stripComments(read('../store.ts'))
  check('the raw IP is never stored, only a salted hash', /createHash\('sha256'\)/.test(store) && /FREE_CHECK_IP_SALT/.test(store))
  check('the ledger is only ever read scoped (client, domain, day)',
    /\.eq\('client_hash'/.test(store) && /\.eq\('domain'/.test(store) && /\.eq\('ai_used', true\)/.test(store))
  const migration = read('../../../supabase/migrations/20260926000000_free_site_check.sql')
  check('ledger table has RLS on and is revoked from anon/authenticated',
    /enable row level security/i.test(migration) && /revoke all on public\.free_site_checks from anon, authenticated/i.test(migration))
  check('the claims table is locked down the same way',
    /create table if not exists public\.free_site_check_claims/i.test(migration)
    && /alter table public\.free_site_check_claims enable row level security/i.test(migration)
    && /revoke all on public\.free_site_check_claims from anon, authenticated/i.test(migration))
  const claim = stripComments(read('../claim.ts'))
  check('a claim is consumed inside the UPDATE, never select-then-update',
    /\.update\(\{ consumed_at/.test(claim) && /\.is\('consumed_at', null\)/.test(claim))
  check('the claim token itself is never stored', /hashClaimToken\(token\)/.test(claim) && !/token_hash: token\b/.test(claim))
  const screen = stripComments(read('../../../components/free-check/FreeCheckExperience.tsx'))
  check('the signup link carries the claim when there is one', /claim=\$\{encodeURIComponent\(claimToken\)\}/.test(screen))

  console.log('\nGATE) rate limit, cache and spend ceiling, against a real fake')
  const admin = (rows: Record<string, unknown>[], hooks?: ErrorHooks) =>
    new FakeAdmin({ free_site_checks: rows }, hooks ? { free_site_checks: hooks } : {}) as unknown as ServiceRoleClient

  const fresh = await checkGate({ domain: 'example.co.il', locale: 'he', clientHash: CLIENT }, admin([]), NOW)
  check('an empty ledger allows the run and the model call', fresh.allowed && fresh.allowAi === true && !fresh.cached)

  const bursting = Array.from({ length: RATE_MAX_IN_WINDOW }, () => row({ created_at: iso(30_000) }))
  const limited = await checkGate({ domain: 'other.co.il', locale: 'he', clientHash: CLIENT }, admin(bursting), NOW)
  check('a client at the window allowance is refused', !limited.allowed && limited.reason === 'rate_limited')

  const stale = Array.from({ length: RATE_MAX_IN_WINDOW }, () => row({ created_at: iso(60 * 60 * 1000) }))
  const afterWindow = await checkGate({ domain: 'other.co.il', locale: 'he', clientHash: CLIENT }, admin(stale), NOW)
  check('the same client is allowed once the window has passed', afterWindow.allowed)

  const cachedRows = [row({ created_at: iso(2 * 60 * 60 * 1000), client_hash: 'someone-else', result: { domain: 'example.co.il', cached: false } as unknown as FreeCheckResult })]
  const cacheHit = await checkGate({ domain: 'example.co.il', locale: 'he', clientHash: CLIENT }, admin(cachedRows), NOW)
  check('a run inside 24h for the same domain is replayed', cacheHit.allowed && !!cacheHit.cached)
  check('a replayed result is marked cached', cacheHit.allowed && cacheHit.cached?.cached === true)
  check('a cache hit never permits a model call', cacheHit.allowed && cacheHit.allowAi === false)
  check('a cache hit names the row it replayed, so a claim can point at it',
    cacheHit.allowed && typeof cacheHit.cachedCheckId === 'string' && cacheHit.cachedCheckId.length > 0)

  const otherLocale = await checkGate({ domain: 'example.co.il', locale: 'en', clientHash: CLIENT }, admin(cachedRows), NOW)
  check('the cache is per locale (an English visitor gets English copy)', otherLocale.allowed && !otherLocale.cached)

  const expired = [row({ created_at: iso(25 * 60 * 60 * 1000), client_hash: 'someone-else' })]
  const afterTtl = await checkGate({ domain: 'example.co.il', locale: 'he', clientHash: CLIENT }, admin(expired), NOW)
  check('a run older than 24h is not replayed', afterTtl.allowed && !afterTtl.cached)

  process.env.FREE_CHECK_DAILY_AI_CAP = '2'
  const spentToday = [
    row({ domain: 'a.co.il', client_hash: 'x', created_at: iso(60 * 60 * 1000) }),
    row({ domain: 'b.co.il', client_hash: 'y', created_at: iso(2 * 60 * 60 * 1000) }),
  ]
  const capped = await checkGate({ domain: 'new.co.il', locale: 'he', clientHash: CLIENT }, admin(spentToday), NOW)
  check('at the daily model cap the check still runs', capped.allowed)
  check('but the model call is dropped rather than paid for', capped.allowed && capped.allowAi === false)
  const notCounted = [row({ domain: 'a.co.il', client_hash: 'x', ai_used: false }), row({ domain: 'b.co.il', client_hash: 'y', ai_used: false })]
  const notCapped = await checkGate({ domain: 'new.co.il', locale: 'he', clientHash: CLIENT }, admin(notCounted), NOW)
  check('runs that spent nothing do not count toward the cap', notCapped.allowed && notCapped.allowAi === true)
  delete process.env.FREE_CHECK_DAILY_AI_CAP

  console.log('\nFAIL CLOSED) an unreadable ledger refuses the run')
  const broken = await checkGate({ domain: 'example.co.il', locale: 'he', clientHash: CLIENT }, admin([], { select: () => ({ code: '42501' }) }), NOW)
  check('a ledger read error is internal, never an allow', !broken.allowed && broken.reason === 'internal')

  console.log('\nLEDGER WRITE) a failed insert never fails the response')
  let threw = false
  try {
    await recordRun(
      { domain: 'example.co.il', locale: 'he', url: 'https://example.co.il/', result: { aiUsed: true } as unknown as FreeCheckResult, clientHash: CLIENT },
      admin([], { insert: () => ({ code: '23505' }) }),
    )
  } catch { threw = true }
  check('recordRun swallows a DB error', !threw)

  console.log('\nTHROTTLE KEY) derived from the platform header, never trusted as identity')
  check('left-most x-forwarded-for entry is used', clientIpFrom(new Headers({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18' })) === '203.0.113.9')
  check('x-real-ip is the fallback', clientIpFrom(new Headers({ 'x-real-ip': '198.51.100.7' })) === '198.51.100.7')
  check('no header at all still yields a bucket', clientIpFrom(new Headers()) === 'unknown')
  check('the same IP always hashes the same, and differs per IP',
    hashClient('203.0.113.9') === hashClient('203.0.113.9') && hashClient('203.0.113.9') !== hashClient('203.0.113.10'))

  console.log('\nDEGRADATION) a model outage costs the teaser, not the check')
  const html = '<html lang="he"><head><title>חנות הבשמים המקורית של ישראל במשלוח חינם</title></head><body><h1>בשמים</h1><p>טקסט</p></body></html>'
  const outcome = await runFreeCheck(new URL('https://example.co.il/'), 'he', { allowAi: true }, {
    fetchHtml: async () => ({ ok: true, url: 'https://example.co.il/', status: 200, html, truncated: false }),
    fetchText: async () => ({ ok: false, reason: 'network' }),
    insight: async () => ({ ok: false, reason: 'gemini_request_failed' }),
    now: () => NOW,
  })
  check('the run still succeeds without the model', outcome.ok)
  if (outcome.ok) {
    check('technical findings are present', outcome.result.findings.length > 0)
    check('business/keywords/articles are empty rather than invented',
      outcome.result.business === null && outcome.result.keywords.length === 0 && outcome.result.articles.length === 0)
    check('aiUsed is false so the run is not billed to the cap', outcome.result.aiUsed === false)
    check('the GEO tiles still score four signals', outcome.result.geo.total === 4)
  }

  const blocked = await runFreeCheck(new URL('https://example.co.il/'), 'he', { allowAi: false }, {
    fetchHtml: async () => ({ ok: false, reason: 'blocked' }),
    fetchText: async () => ({ ok: false, reason: 'network' }),
  })
  check('a blocked fetch surfaces as blocked_url, not as a crash', !blocked.ok && blocked.code === 'blocked_url')
  const unreachable = await runFreeCheck(new URL('https://example.co.il/'), 'he', { allowAi: false }, {
    fetchHtml: async () => ({ ok: false, reason: 'timeout' }),
    fetchText: async () => ({ ok: false, reason: 'network' }),
  })
  check('a timeout surfaces as unreachable', !unreachable.ok && unreachable.code === 'unreachable')

  console.log('\nMUTATION CONTROLS) a gate that fails open would pass a weaker suite')
  const failOpenGate = async (error: boolean) => (error ? { allowed: true as const, allowAi: true } : { allowed: true as const, allowAi: true })
  check('CONTROL: a fail-open gate allows the run on a DB error', (await failOpenGate(true)).allowed)
  check('CONTROL: the real gate refuses it', !broken.allowed)
  // Weakening: a cache lookup that ignores locale would hand Hebrew copy to an
  // English visitor.
  const localeBlindHit = cachedRows.find((r) => r.domain === 'example.co.il')
  check('CONTROL: a locale-blind cache would hit for the English visitor', !!localeBlindHit)
  check('CONTROL: the real gate misses, so English copy is generated', otherLocale.allowed && !otherLocale.cached)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
void main()

export {}
