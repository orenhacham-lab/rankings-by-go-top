/**
 * The off switch and the API client, against a fake fetch — no network, no
 * Creem account.
 *
 * The failures this suite exists to prevent, in order of how much they would
 * cost: charging a real card from a preview deploy because the mode was
 * guessed; granting a plan from a response about SOMEBODY ELSE's
 * subscription; a 500 on a checkout or a webhook because a network blip threw;
 * and a provider's raw error text reaching a merchant.
 *
 * MUTATION CONTROLS at the end: a client that infers live mode from NODE_ENV,
 * and one that accepts a mismatched subscription id, must both be REJECTED
 * by these assertions.
 *
 * Run: npx tsx lib/creem/__qa__/creem-client.qa.ts
 */
import { CREEM_API_BASE, creemApiBase, creemMode, creemReadiness, isCreemEnabled } from '../config'
import { createCreemCheckout, fetchCreemSubscription } from '../client'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ENV_KEYS = ['CREEM_ENABLED', 'CREEM_MODE', 'CREEM_API_KEY', 'CREEM_WEBHOOK_SECRET', 'NODE_ENV', 'VERCEL_ENV'] as const
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<string, string | undefined>
// NODE_ENV is typed read-only, and this suite has to set it to prove that
// mode is NOT inferred from it. A mutable view of the same object.
const ENV = process.env as Record<string, string | undefined>
function env(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const k of ENV_KEYS) {
    const v = k in values ? values[k] : ORIGINAL[k]
    if (v === undefined) delete ENV[k]
    else ENV[k] = v
  }
}
/** The switch on and both secrets present. */
const configured = (over: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}) =>
  env({ CREEM_ENABLED: 'true', CREEM_API_KEY: 'creem_test_key', CREEM_WEBHOOK_SECRET: 'whsec_x', CREEM_MODE: 'test', ...over })

/** Records every fetch the client makes and answers with a canned response. */
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }
let calls: Call[] = []
const realFetch = globalThis.fetch
function fakeFetch(responder: (call: Call) => Response | Promise<Response> | Error) {
  calls = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    }
    calls.push(call)
    const out = await responder(call)
    if (out instanceof Error) throw out
    return out
  }) as typeof fetch
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const CHECKOUT = { productId: 'prod_x', successUrl: 'https://gotopseo.com/ok', requestId: 'user-1' }

async function main() {
  console.log('A) the off switch is off unless it is exactly "true"')
  for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes', ' true']) {
    env({ CREEM_ENABLED: value })
    check(`CREEM_ENABLED=${JSON.stringify(value)} is off`, isCreemEnabled() === false)
  }
  env({ CREEM_ENABLED: 'true' })
  check('CREEM_ENABLED="true" is on', isCreemEnabled() === true)

  console.log('\nB) live mode is never inferred — only asked for by name')
  env({ CREEM_MODE: undefined, NODE_ENV: 'production', VERCEL_ENV: 'production' })
  check('production NODE_ENV alone does NOT mean live', creemMode() === 'test')
  check('and the base URL is the sandbox', creemApiBase() === CREEM_API_BASE.test)
  for (const value of ['', 'prod', 'production', 'LIVE ', 'real']) {
    env({ CREEM_MODE: value })
    check(`CREEM_MODE=${JSON.stringify(value)} is not live`, creemMode() === (value.trim().toLowerCase() === 'live' ? 'live' : 'test'))
  }
  env({ CREEM_MODE: 'live' })
  check('CREEM_MODE="live" is live', creemMode() === 'live' && creemApiBase() === CREEM_API_BASE.live)
  check('the two base URLs are different hosts', CREEM_API_BASE.live !== CREEM_API_BASE.test)

  console.log('\nC) readiness names what is missing, never its value')
  env({ CREEM_ENABLED: 'true', CREEM_API_KEY: undefined, CREEM_WEBHOOK_SECRET: undefined, CREEM_MODE: 'test' })
  {
    const r = creemReadiness()
    check('not ready without secrets', r.ready === false)
    check('both missing names are reported', r.missing.includes('CREEM_API_KEY') && r.missing.includes('CREEM_WEBHOOK_SECRET'))
  }
  configured({ CREEM_ENABLED: 'false' })
  check('configured but switched off is still not ready', creemReadiness().ready === false)
  configured()
  {
    const r = creemReadiness()
    check('on and configured is ready', r.ready === true && r.missing.length === 0)
    check('no secret VALUE appears in the readiness report',
      !JSON.stringify(r).includes('creem_test_key') && !JSON.stringify(r).includes('whsec_x'))
  }

  console.log('\nD) nothing is called while the switch is off')
  env({ CREEM_ENABLED: 'false', CREEM_API_KEY: 'creem_test_key', CREEM_WEBHOOK_SECRET: 'whsec_x' })
  fakeFetch(() => json({}))
  {
    const out = await createCreemCheckout(CHECKOUT)
    check('a checkout is refused as not_configured', out.ok === false && out.reason === 'not_configured')
    check('and no request left the process', calls.length === 0)
  }
  configured({ CREEM_API_KEY: undefined })
  fakeFetch(() => json({}))
  {
    const out = await fetchCreemSubscription('sub_1')
    check('a missing API key refuses before any request',
      out.ok === false && out.reason === 'not_configured' && calls.length === 0)
  }

  console.log('\nE) a checkout is created against the configured mode')
  configured()
  fakeFetch(() => json({ id: 'ch_1', checkout_url: 'https://checkout.creem.io/ch_1' }))
  {
    const out = await createCreemCheckout({ ...CHECKOUT, customerEmail: 'buyer@example.com' })
    check('the session comes back', out.ok === true && out.value.checkoutUrl === 'https://checkout.creem.io/ch_1')
    check('it went to the sandbox host', calls[0].url === `${CREEM_API_BASE.test}/v1/checkouts`)
    check('it was a POST authenticated with x-api-key',
      calls[0].method === 'POST' && calls[0].headers['x-api-key'] === 'creem_test_key')
    const body = calls[0].body as Record<string, unknown>
    check('the REST field names are snake_case',
      body.product_id === 'prod_x' && body.success_url === CHECKOUT.successUrl && body.request_id === 'user-1')
    check('the customer email is passed as Creem expects',
      JSON.stringify(body.customer) === JSON.stringify({ email: 'buyer@example.com' }))
  }
  configured({ CREEM_MODE: 'live', CREEM_API_KEY: 'creem_live_key' })
  fakeFetch(() => json({ id: 'ch_2', checkoutUrl: 'https://checkout.creem.io/ch_2' }))
  {
    const out = await createCreemCheckout(CHECKOUT)
    check('live mode calls the live host', calls[0].url.startsWith(CREEM_API_BASE.live))
    check('a camelCase checkoutUrl is accepted too',
      out.ok === true && out.value.checkoutUrl === 'https://checkout.creem.io/ch_2')
  }
  configured()
  fakeFetch(() => json({ id: 'ch_3' }))
  {
    const out = await createCreemCheckout(CHECKOUT)
    check('a response with no checkout url is malformed, not a success',
      out.ok === false && out.reason === 'malformed_response')
  }

  console.log('\nF) a subscription is read back, and only the right one is accepted')
  configured()
  fakeFetch(() => json({
    id: 'sub_1', status: 'active', product: { id: 'prod_x' }, customer: 'cust_9',
    current_period_start_date: '2026-10-01T00:00:00Z', current_period_end_date: '2026-11-01T00:00:00Z',
    metadata: { referenceId: 'user-1' },
  }))
  {
    const out = await fetchCreemSubscription('sub_1')
    check('the snapshot comes back', out.ok === true && out.value.status === 'active')
    check('the id goes in the QUERY string, not the path',
      calls[0].url === `${CREEM_API_BASE.test}/v1/subscriptions?subscription_id=sub_1`)
    check('the product is read whether it is an object or an id',
      out.ok === true && out.value.productId === 'prod_x')
    check('the period comes from Creem, not computed here',
      out.ok === true && out.value.currentPeriodEnd === '2026-11-01T00:00:00Z')
    check('metadata is carried as data', out.ok === true && out.value.metadata?.referenceId === 'user-1')
  }
  fakeFetch(() => json({ id: 'sub_SOMEONE_ELSE', status: 'active', product: 'prod_x' }))
  {
    const out = await fetchCreemSubscription('sub_1')
    check('a response about ANOTHER subscription is refused',
      out.ok === false && out.reason === 'malformed_response')
  }
  fakeFetch(() => json({ id: 'sub_1', product: 'prod_x' }))
  {
    const out = await fetchCreemSubscription('sub_1')
    check('a response with no status is refused', out.ok === false && out.reason === 'malformed_response')
  }
  fakeFetch(() => json({}))
  {
    const out = await fetchCreemSubscription('   ')
    check('a blank id never reaches the network', out.ok === false && calls.length === 0)
  }

  console.log('\nG) every failure is a value, and Creem\'s wording stays out of it')
  configured()
  const failures: Array<[string, () => Response | Error, string]> = [
    ['401', () => json({ error: 'bad key' }, 401), 'unauthorized'],
    ['403', () => json({ error: 'forbidden' }, 403), 'unauthorized'],
    ['404', () => json({ error: 'no such subscription' }, 404), 'not_found'],
    ['422', () => json({ error: 'Your card was declined by issuer XYZ' }, 422), 'rejected'],
    ['500', () => json({ error: 'boom' }, 500), 'rejected'],
    ['a network error', () => new TypeError('fetch failed'), 'network'],
  ]
  for (const [name, make, expected] of failures) {
    fakeFetch(() => make())
    const out = await fetchCreemSubscription('sub_1')
    check(`${name} -> ${expected}, as a value`, out.ok === false && out.reason === expected,
      out.ok ? 'returned ok' : `got ${out.reason}`)
    check(`${name} carries no provider wording`, !JSON.stringify(out).toLowerCase().includes('declined'))
  }
  fakeFetch(() => new Response('<html>down for maintenance</html>', { status: 200 }))
  {
    const out = await fetchCreemSubscription('sub_1')
    check('a 200 that is not JSON is malformed, not a success',
      out.ok === false && out.reason === 'malformed_response')
  }
  {
    // An abort must surface as 'timeout', not as a thrown AbortError.
    fakeFetch(() => Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const out = await createCreemCheckout(CHECKOUT)
    check('an aborted request is a timeout value', out.ok === false && out.reason === 'timeout')
  }

  console.log('\nH) mutation controls: break the rules and these assertions must fail')
  {
    type ModeFn = () => 'test' | 'live'
    function modeSurvives(mode: ModeFn): boolean {
      env({ CREEM_MODE: undefined, NODE_ENV: 'production', VERCEL_ENV: 'production' })
      const guessedFromEnv = mode() === 'test'
      env({ CREEM_MODE: 'live' })
      const explicit = mode() === 'live'
      return guessedFromEnv && explicit
    }
    check('the real mode resolver survives', modeSurvives(creemMode) === true)
    const inferredFromNodeEnv: ModeFn = () =>
      process.env.CREEM_MODE?.trim().toLowerCase() === 'live' || process.env.NODE_ENV === 'production' ? 'live' : 'test'
    check('MUTATION: inferring live mode from NODE_ENV is caught', modeSurvives(inferredFromNodeEnv) === false)

    type Fetcher = (id: string) => Promise<{ ok: boolean }>
    async function idSurvives(fetchOne: Fetcher): Promise<boolean> {
      configured()
      fakeFetch(() => json({ id: 'sub_SOMEONE_ELSE', status: 'active', product: 'prod_x' }))
      const wrong = await fetchOne('sub_1')
      fakeFetch(() => json({ id: 'sub_1', status: 'active', product: 'prod_x' }))
      const right = await fetchOne('sub_1')
      return wrong.ok === false && right.ok === true
    }
    check('the real reader survives', (await idSurvives(fetchCreemSubscription)) === true)
    const acceptsAnyId: Fetcher = async () => {
      const res = await globalThis.fetch(`${creemApiBase()}/v1/subscriptions?subscription_id=sub_1`, {
        headers: { 'x-api-key': 'creem_test_key' },
      })
      const body = await res.json() as { status?: string }
      return { ok: Boolean(body.status) }
    }
    check('MUTATION: accepting a response about another subscription is caught',
      (await idSurvives(acceptsAnyId)) === false)
  }

  globalThis.fetch = realFetch
  env({})
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
