/**
 * THE GATE MAY VERIFY LOCALLY; THE AUTHORITY MAY NOT.
 *
 * `proxy.ts` runs at the edge nearest the reader, so its `auth.getUser()` was a
 * round trip from that edge to Mumbai before any page function started — about
 * 300ms on every navigation (measured 15.11.2026 from Tokyo: `/billing`
 * 671-922ms against `/api/projects/quota`, which the proxy does not match,
 * 300-380ms). `lib/auth/edge-session.ts` verifies the token's signature there
 * instead, with the project's published key set.
 *
 * This suite holds that to its contract:
 *   A. a signed-out visitor costs no request at all;
 *   B. a signed-in visitor costs ONE key-set fetch per warm instance, and the
 *      Auth server is not asked at all;
 *   C. a rotated key, an unreachable key set and an unverifiable token all end
 *      at `getUser()` — the behaviour this replaced;
 *   D. the authority is untouched: the dashboard layout and the API routes still
 *      ask the Auth server themselves, and the proxy still redirects a visitor
 *      without a valid token.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { verifiedUserId, __clearVerifyingKeys, JWKS_TTL_MS, type EdgeAuthClient } from '../edge-session'

const ROOT = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Comments are not code — the repo convention for every source guard. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

const KEYS = [{ kty: 'EC' as const, key_ops: ['verify'], kid: 'k1', alg: 'ES256' }]

/** A client the test drives, counting every call it would have made. */
function harness(opts: {
  token?: string | null
  claims?: ({ sub?: unknown } | null)[]
  errors?: boolean[]
  userId?: string | null
  jwksFails?: boolean
  keys?: unknown
} = {}) {
  const calls = { jwks: 0, getClaims: 0, getUser: 0, getSession: 0 }
  const jwksSeen: (unknown | undefined)[] = []
  let round = 0
  let now = 1_000_000
  const client: EdgeAuthClient = {
    auth: {
      getSession: async () => {
        calls.getSession++
        const token = 'token' in opts ? opts.token : 'jwt.a.b'
        return { data: { session: token ? { access_token: token } : null } }
      },
      getClaims: async (_jwt, options) => {
        calls.getClaims++
        jwksSeen.push(options?.jwks)
        const i = round++
        const error = opts.errors?.[i] ?? false
        return { data: error ? null : { claims: opts.claims?.[i] ?? { sub: 'u-1' } }, error: error ? { message: 'bad signature' } : null }
      },
      getUser: async () => {
        calls.getUser++
        return { data: { user: opts.userId === null ? null : { id: opts.userId ?? 'u-authoritative' } } }
      },
    },
  }
  const fetchImpl = (async () => {
    calls.jwks++
    if (opts.jwksFails) throw new Error('unreachable')
    return { ok: true, json: async () => ({ keys: opts.keys ?? KEYS }) } as unknown as Response
  }) as unknown as typeof fetch
  return { client, calls, jwksSeen, deps: { fetch: fetchImpl, now: () => now }, advance: (ms: number) => { now += ms } }
}

async function main() {
  console.log('\nA) A signed-out visitor costs nothing')
  {
    __clearVerifyingKeys()
    const h = harness({ token: null })
    const id = await verifiedUserId(h.client, 'https://p.supabase.co', h.deps)
    check('A1: answers null', id === null, String(id))
    check('A2: and asked NOBODY — no key set, no claims, no Auth server',
      h.calls.jwks === 0 && h.calls.getClaims === 0 && h.calls.getUser === 0, JSON.stringify(h.calls))
  }

  console.log('\nB) A signed-in visitor: one key-set fetch per instance, and the Auth server is never asked')
  {
    __clearVerifyingKeys()
    const h = harness({})
    const first = await verifiedUserId(h.client, 'https://p.supabase.co', h.deps)
    check('B1: the id comes from the token\'s own `sub`', first === 'u-1', String(first))
    check('B2: ONE key-set fetch', h.calls.jwks === 1, String(h.calls.jwks))
    check('B3: the keys were handed to getClaims, so the check is local',
      JSON.stringify(h.jwksSeen[0]) === JSON.stringify({ keys: KEYS }), JSON.stringify(h.jwksSeen[0]))
    check('B4: the Auth server was NOT asked', h.calls.getUser === 0, String(h.calls.getUser))

    const second = await verifiedUserId(h.client, 'https://p.supabase.co', h.deps)
    check('B5: a second page view re-uses the held keys — still one fetch',
      second === 'u-1' && h.calls.jwks === 1, `${second} / ${h.calls.jwks}`)

    h.advance(JWKS_TTL_MS + 1)
    await verifiedUserId(h.client, 'https://p.supabase.co', h.deps)
    check('B6: once the keys are stale they are fetched again', h.calls.jwks === 2, String(h.calls.jwks))
  }

  console.log('\nC) A token that cannot be verified here ends at the Auth server')
  {
    __clearVerifyingKeys()
    // A key rotated since the set was cached: the first check fails, the set is
    // fetched again and the second check succeeds.
    const h = harness({ errors: [true, false] })
    const id = await verifiedUserId(h.client, 'https://p.supabase.co', h.deps)
    check('C1: a rotated key is answered by fetching the set again, not by a round trip',
      id === 'u-1' && h.calls.jwks === 2 && h.calls.getUser === 0, `${id} / ${JSON.stringify(h.calls)}`)

    __clearVerifyingKeys()
    const h2 = harness({ errors: [true, true], userId: 'u-real' })
    const id2 = await verifiedUserId(h2.client, 'https://p.supabase.co', h2.deps)
    check('C2: when it still fails, getUser answers', id2 === 'u-real' && h2.calls.getUser === 1,
      `${id2} / ${JSON.stringify(h2.calls)}`)

    __clearVerifyingKeys()
    const h3 = harness({ jwksFails: true, userId: 'u-real' })
    const id3 = await verifiedUserId(h3.client, 'https://p.supabase.co', h3.deps)
    check('C3: an unreachable key set falls back too, and never throws',
      id3 === 'u-real' && h3.calls.getClaims === 0, `${id3} / ${JSON.stringify(h3.calls)}`)

    __clearVerifyingKeys()
    const h4 = harness({ claims: [{}], userId: 'u-real' })
    const id4 = await verifiedUserId(h4.client, 'https://p.supabase.co', h4.deps)
    check('C4: a verified token with no `sub` is nobody, and is NOT escalated to getUser',
      id4 === null && h4.calls.getUser === 0, `${id4} / ${JSON.stringify(h4.calls)}`)

    __clearVerifyingKeys()
    const h5 = harness({ errors: [true, true], userId: null })
    check('C5: and when getUser says nobody, the answer is null',
      (await verifiedUserId(h5.client, 'https://p.supabase.co', h5.deps)) === null)
  }

  console.log('\nD) The authority is untouched')
  {
    const proxy = strip(read('proxy.ts'))
    check('D1: the proxy no longer asks the Auth server itself',
      !/supabase\.auth\.getUser\(\)/.test(proxy), 'proxy.ts still calls auth.getUser()')
    check('D2: it reads the viewer through the shared gate',
      /verifiedUserId\(supabase, supabaseUrl\)/.test(proxy) && /from '@\/lib\/auth\/edge-session'/.test(proxy))
    check('D3: a visitor without a valid token is still sent to /login',
      /if \(!userId && isProtectedRoute\)/.test(proxy) && /loginUrl\.pathname = '\/login'/.test(proxy))
    check('D4: the entitlement check still runs on the id the gate returned',
      /explainAccess\(userId, entitlementClient\)/.test(proxy))

    // The gate is cheap BECAUSE something else is authoritative. These two must
    // keep asking the Auth server, in-region, before they read the owner's data.
    const layout = strip(read('app/(dashboard)/layout.tsx'))
    check('D5: the dashboard layout still verifies with the Auth server',
      /supabase\.auth\.getUser\(\)/.test(layout))
    for (const route of [
      'app/api/projects/[id]/dashboard/route.ts',
      'app/api/projects/[id]/waiting/route.ts',
      'app/api/projects/[id]/seed/route.ts',
    ]) {
      check(`D6-${route.split('/').slice(-2)[0]}: the route still verifies with the Auth server`,
        /auth\.getUser\(\)/.test(strip(read(route))))
    }
    check('D7-MUT: the guards DO match a file that asks the Auth server, so D is not vacuous',
      /supabase\.auth\.getUser\(\)/.test('const { data } = await supabase.auth.getUser()'))
    check('D8-MUT: and D1 would fail if the proxy went back to it',
      /supabase\.auth\.getUser\(\)/.test(proxy + '\nawait supabase.auth.getUser()'))
  }

  console.log('\nE) The key set is held off globalThis, not in module scope')
  {
    const src = strip(read('lib/auth/edge-session.ts'))
    check('E1: the cache is read from globalThis', /globalThis as JwksHost/.test(src))
    check('E2: and never from a module-scope let', !/^let\s+(held|cached)/m.test(src))
    __clearVerifyingKeys()
    const h = harness({})
    await verifiedUserId(h.client, 'https://p.supabase.co', h.deps)
    const shared = (globalThis as Record<string, unknown>)['__goTopAuthJwks__']
    check('E3: the fetched set is visible on globalThis', !!shared && typeof shared === 'object')
    check('E4-MUT: a cleared cache is gone, so E3 is not vacuous',
      (__clearVerifyingKeys(), (globalThis as Record<string, unknown>)['__goTopAuthJwks__'] === undefined))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
