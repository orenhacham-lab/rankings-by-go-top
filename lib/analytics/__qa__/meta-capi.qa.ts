/**
 * Meta Conversions API — the signup conversion sent from the server.
 *
 * What this guards, and why each group is here:
 *
 *  A) INERT UNTIL SWITCHED ON. The whole point of merging this before the
 *     privacy policy names Meta is that nothing leaves the server until
 *     META_CAPI_PIXEL_ID and META_CAPI_ACCESS_TOKEN exist. A regression that
 *     made it fire on a default deployment would be an undisclosed transfer of
 *     personal data, so A1-A3 prove no fetch happens without both, and that
 *     the kill switch stops it even with both.
 *
 *  B) ONLY HASHED IDENTIFIERS LEAVE. The raw email must never appear in the
 *     request body, the hash must be Meta's normalisation (trim + lower-case,
 *     SHA-256 hex), and the user id goes the same way. B4 pins the source
 *     file against the identifiers this design deliberately refuses: the
 *     `_fbp` / `_fbc` cookies, the IP address and the user agent.
 *
 *  C) COUNTED ONCE. Both signup doors can reach the sender for one account, so
 *     the event id is derived from the user id and nothing else.
 *
 *  D) NEVER BREAKS A SIGNUP. A rejecting or throwing Graph API returns a
 *     result, never an exception.
 *
 *  E) THE CALL SITES. Both are inside a fresh-signup gate: /api/auth/callback
 *     for Google and email confirmation, /api/send-notification-email for
 *     email+password. A conversion that fired for an ordinary sign-in would
 *     report one account many times.
 *
 * Every group has a mutation control.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import {
  buildSignupEvent,
  hashedEmail,
  metaCapiConfig,
  sendSignupConversion,
  signupEventId,
} from '../meta-capi'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const LIVE_ENV = {
  META_CAPI_PIXEL_ID: '1427506179136706',
  META_CAPI_ACCESS_TOKEN: 'test-token',
}
const USER = { userId: 'b3f1c0de-0000-4000-8000-000000000001', email: 'Oren@Example.COM ', createdAt: null }

/** A fetch that records what it was asked to send and answers 200. */
function recordingFetch() {
  const calls: { url: string; body: string }[] = []
  const fn = (async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), body: String((init as { body?: unknown } | undefined)?.body ?? '') })
    return { ok: true, status: 200 } as Response
  }) as unknown as typeof fetch
  return { calls, fn }
}

async function main() {
  console.log('A) inert until the deployment is given credentials')
  {
    for (const [label, env] of [
      ['nothing set', {}],
      ['pixel id only', { META_CAPI_PIXEL_ID: LIVE_ENV.META_CAPI_PIXEL_ID }],
      ['token only', { META_CAPI_ACCESS_TOKEN: LIVE_ENV.META_CAPI_ACCESS_TOKEN }],
    ] as const) {
      const { calls, fn } = recordingFetch()
      const result = await sendSignupConversion(USER, { env, fetch: fn })
      check(`A1 (${label}): nothing is sent, and the caller is told why`,
        calls.length === 0 && result.sent === false && result.reason === 'not_configured')
    }
    check('A2: the kill switch stops a fully configured deployment',
      metaCapiConfig({ ...LIVE_ENV, META_CAPI_DISABLED: 'TRUE' }) === null)
    check('MUT: a sender that ignores the missing token fails A1',
      metaCapiConfig({ META_CAPI_PIXEL_ID: LIVE_ENV.META_CAPI_PIXEL_ID }) === null)

    const { calls, fn } = recordingFetch()
    const sent = await sendSignupConversion(USER, { env: LIVE_ENV, fetch: fn })
    check('A3: with both set, exactly one request goes to the Graph API',
      sent.sent === true && calls.length === 1 && calls[0].url.startsWith('https://graph.facebook.com/'))
  }

  console.log('B) only hashed identifiers leave this server')
  {
    const { calls, fn } = recordingFetch()
    await sendSignupConversion(USER, { env: LIVE_ENV, fetch: fn })
    const body = calls[0]?.body ?? ''
    const expected = createHash('sha256').update('oren@example.com').digest('hex')
    check('B1: the email is normalised (trimmed, lower-cased) and SHA-256 hashed', body.includes(expected))
    check('B2: the raw email never appears in the body, in any casing', !/oren@example\.com/i.test(body))
    check('B3: the user id is hashed too, never sent as itself',
      !body.includes(USER.userId) && body.includes(createHash('sha256').update(USER.userId).digest('hex')))
    // The control: a body that carried the address instead of its hash would be
    // caught by B1 and B2, and the same body is what both read.
    const leaking = body.replace(expected, 'oren@example.com')
    check('MUT: a body carrying the address instead of its hash fails B1 and B2',
      !leaking.includes(expected) && /oren@example\.com/i.test(leaking) && hashedEmail(' OREN@example.com ') === expected)

    // The identifiers this design refuses. Comments are stripped first, so the
    // file's own explanation of what it does not send cannot satisfy the check.
    const source = strip(read('lib/analytics/meta-capi.ts'))
    for (const refused of ['_fbp', '_fbc', 'client_ip_address', 'client_user_agent', 'cookies(', 'headers(']) {
      check(`B4 (${refused}): the sender never reaches for it`, !source.includes(refused))
    }
    check('MUT: a sender that read the browser cookies fails B4', (source + "cookies(").includes('cookies('))

    // A source URL carries whatever was in the query string; only origin+path go.
    const withQuery = buildSignupEvent({ ...USER, sourceUrl: 'https://gotopseo.com/signup?email=oren%40example.com&ref=abc' })
    check('B5: a source URL is reduced to origin and path, dropping the query',
      withQuery.event_source_url === 'https://gotopseo.com/signup')
    check('B6: a non-https or unparseable source URL is dropped entirely',
      buildSignupEvent({ ...USER, sourceUrl: 'http://gotopseo.com/signup' }).event_source_url === undefined &&
      buildSignupEvent({ ...USER, sourceUrl: 'not a url' }).event_source_url === undefined)
  }

  console.log('C) one account is counted once')
  {
    const a = signupEventId(USER.userId)
    const b = signupEventId(USER.userId)
    check('C1: the same account always produces the same event id', a === b && a.startsWith('signup_'))
    check('C2: a different account produces a different one', signupEventId('other-user') !== a)
    check('MUT: an event id with anything time-varying in it fails C1',
      `signup_${Date.now()}` !== `signup_${Date.now() + 1}`)

    // Meta rejects events dated in the future or older than seven days.
    const now = Date.parse('2026-10-09T12:00:00Z')
    const old = buildSignupEvent({ ...USER, createdAt: '2026-09-01T00:00:00Z' }, now)
    const future = buildSignupEvent({ ...USER, createdAt: '2027-01-01T00:00:00Z' }, now)
    const fresh = buildSignupEvent({ ...USER, createdAt: '2026-10-09T11:55:00Z' }, now)
    check('C3: the event time is the account\'s own, unless that is stale or in the future',
      fresh.event_time === Math.floor(Date.parse('2026-10-09T11:55:00Z') / 1000) &&
      old.event_time === Math.floor(now / 1000) &&
      future.event_time === Math.floor(now / 1000))

    check('C4: with no email and no id there is nothing to match, so nothing is sent',
      (await sendSignupConversion({ userId: '', email: null }, { env: LIVE_ENV, fetch: recordingFetch().fn })).sent === false)
  }

  console.log('D) a failing Graph API never breaks a signup')
  {
    const rejecting = (async () => ({ ok: false, status: 400 } as Response)) as unknown as typeof fetch
    const throwing = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    const a = await sendSignupConversion(USER, { env: LIVE_ENV, fetch: rejecting })
    const b = await sendSignupConversion(USER, { env: LIVE_ENV, fetch: throwing })
    check('D1: a 400 comes back as a result, not an exception', a.sent === false && a.reason === 'send_failed')
    check('D2: a thrown network error comes back as a result too', b.sent === false && b.reason === 'send_failed')
    const source = strip(read('lib/analytics/meta-capi.ts'))
    check('D3: the request is given a timeout, so a hanging Graph API cannot hold a signup open',
      /AbortController/.test(source) && /signal: controller\.signal/.test(source))
    check('MUT: dropping the abort signal fails D3', !/signal: controller\.signal/.test(source.replace('signal: controller.signal', '')))
  }

  console.log('E) both call sites, each behind a fresh-signup gate')
  {
    const callback = strip(read('app/api/auth/callback/route.ts'))
    const emailRoute = strip(read('app/api/send-notification-email/route.ts'))

    const gatedIn = (src: string) => {
      const at = src.indexOf('reportSignupConversion({')
      if (at === -1) return false
      // Walk back to the enclosing `if (...isFreshSignup...)` without leaving the function.
      const before = src.slice(0, at)
      const lastGate = before.lastIndexOf('isFreshSignup(')
      if (lastGate === -1) return false
      // Nothing may close that block between the gate and the call.
      return !/\n  \}\n/.test(before.slice(lastGate))
    }
    check('E1: the auth callback reports only a fresh signup', gatedIn(callback))
    check('E2: the email+password route reports only a fresh signup', gatedIn(emailRoute))
    check('MUT: an ungated call fails the gate check',
      !gatedIn(emailRoute.replace(/if \(isFreshSignup\(user\)\) \{/, 'if (true) {').replace('isFreshSignup', 'xx')))
    check('E3: neither call site is given a raw email to send on',
      /email: user\.email/.test(callback) && /email: user\.email/.test(emailRoute))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

void main()

export {}
