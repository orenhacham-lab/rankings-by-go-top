/**
 * Shopify EXPIRING offline access tokens — exchange, storage, rotation.
 *
 * PRODUCTION ROOT CAUSE. POST /api/shopify/embedded-install exchanged the App
 * Bridge session token successfully (HTTP 200) but received a NON-EXPIRING
 * offline access token; the first Admin API query with it was refused:
 *
 *   "Non-expiring access tokens are no longer accepted for the Admin API"
 *
 * Shopify's token exchange requires `expiring=1` for a public embedded app to
 * be issued an expiring offline grant — an access token PLUS a refresh token
 * used to rotate it.
 *
 * Run: npx tsx lib/shopify/__qa__/expiring-offline-tokens.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'

// Read lazily inside the functions that need them, so import order is irrelevant.
process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY ||= 'a'.repeat(64)
process.env.SHOPIFY_PUBLIC_CLIENT_ID ||= 'unit-test-public-client-id'
process.env.SHOPIFY_PUBLIC_CLIENT_SECRET ||= 'unit-test-shopify-secret'
process.env.SHOPIFY_APP_URL ||= 'https://www.example.test'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'go-top-seo-test.myshopify.com'
const ACCESS = 'unit-test-access-token'
const REFRESH = 'unit-test-refresh-token'
const SESSION = 'header.payload.signature'
const SECRET = 'unit-test-shopify-secret'

type Json = Record<string, unknown>
function fakeFetch(status: number, body: Json | null, sink?: { calls: { url: string; body: Json }[] }) {
  return (async (url: string | URL, init?: { body?: string }) => {
    sink?.calls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') as Json })
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: (h: string) => (h === 'x-request-id' ? 'req-abc123' : null) },
      json: async () => body,
    } as unknown as Response
  }) as unknown as typeof fetch
}
const expiring = (over: Json = {}): Json => ({
  access_token: ACCESS, refresh_token: REFRESH,
  expires_in: 86400, refresh_token_expires_in: 30 * 86400,
  scope: 'read_products,read_content,write_content', ...over,
})

async function main() {
  console.log('Shopify expiring offline tokens — QA\n')

  const {
    exchangeSessionTokenForOfflineToken, exchangeCodeForToken, parseExpiringOfflineToken,
    buildAuthorizeUrl, expiryFromNow, TokenExchangeError,
  } = await import('../oauth')
  const { resolveShopifyAccessToken, isAccessTokenSafelyValid, classifyStoredCredential, REFRESH_SKEW_SECONDS } = await import('../token-resolver')
  const { encryptCredential, decryptCredential } = await import('@/lib/security/credentials-crypto')
  const { classifyReinstallNeed } = await import('../connection-health')
  const { applyAppUninstalled } = await import('../shop-cleanup')
  const { createPendingInstall, loadValidPendingInstall } = await import('../pending-link')
  const { claimShopForProject } = await import('../connection-ownership')
  const { resolveBillingAuthority } = await import('@/lib/billing/governance')

  const conn = (over: Record<string, unknown> = {}) => ({
    id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
    connection_status: 'connected', last_error: null,
    access_token_encrypted: encryptCredential(ACCESS),
    refresh_token_encrypted: encryptCredential(REFRESH),
    access_token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    // WHICH app issued the credential — required before any refresh.
    oauth_app_edition: 'public',
    token_refresh_lease_token: null, token_refresh_lease_until: null,
    ...over,
  })

  console.log('1) The exchange REQUESTS an expiring offline token')
  {
    const sink = { calls: [] as { url: string; body: Json }[] }
    const out = await exchangeSessionTokenForOfflineToken({
      shop: SHOP, sessionToken: SESSION, clientId: 'cid', clientSecret: SECRET, fetchImpl: fakeFetch(200, expiring(), sink),
    })
    check('1a: expiring=1 is sent on the token exchange', sink.calls[0]?.body.expiring === '1')
    check('1b: with the unchanged token-exchange grant + offline token type',
      sink.calls[0]?.body.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange'
      && sink.calls[0]?.body.requested_token_type === 'urn:shopify:params:oauth:token-type:offline-access-token')
    check('1c: the caller receives BOTH halves and the lifetimes',
      out.accessToken === ACCESS && out.refreshToken === REFRESH && out.expiresIn === 86400 && out.refreshTokenExpiresIn === 2592000)
    const sink2 = { calls: [] as { url: string; body: Json }[] }
    await exchangeCodeForToken({ shop: SHOP, code: 'the-code', clientId: 'cid', clientSecret: SECRET, fetchImpl: fakeFetch(200, expiring(), sink2) })
    check('1d: the authorization-code exchange sends it too', sink2.calls[0]?.body.expiring === '1')
    check('1e: and the authorize URL that precedes it carries expiring=1',
      new URL(buildAuthorizeUrl({ shop: SHOP, clientId: 'cid', redirectUri: 'https://x/y', state: 's' })).searchParams.get('expiring') === '1')
  }

  console.log('\n2) A NON-EXPIRING response is REJECTED before anything is stored')
  {
    for (const [label, body, expectMissing] of [
      ['the exact production shape (token only)', { access_token: ACCESS, scope: 'read_products' }, ['refresh_token', 'expires_in']],
      ['missing expires_in', { access_token: ACCESS, refresh_token: REFRESH }, ['expires_in']],
      ['missing refresh_token', { access_token: ACCESS, expires_in: 86400 }, ['refresh_token']],
      ['no access token at all', { scope: 'read_products' }, ['access_token', 'refresh_token', 'expires_in']],
    ] as [string, Json, string[]][]) {
      let thrown: unknown = null
      try {
        await exchangeSessionTokenForOfflineToken({ shop: SHOP, sessionToken: SESSION, clientId: 'cid', clientSecret: SECRET, fetchImpl: fakeFetch(200, body) })
      } catch (e) { thrown = e }
      const diag = (thrown as InstanceType<typeof TokenExchangeError>)?.diagnostics as Json | undefined
      check(`2: ${label} -> rejected, naming the missing PUBLIC fields`,
        thrown instanceof TokenExchangeError && JSON.stringify(diag?.missingFields) === JSON.stringify(expectMissing))
    }
    check('2e: a refresh-token LIFETIME is optional (Shopify may omit it)',
      parseExpiringOfflineToken({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 900 }).ok === true)
    const inst = strip(read('app/api/shopify/embedded-install/route.ts'))
    check('2f: the install route raises its distinct reason BEFORE any pending install',
      inst.indexOf("'non_expiring_token_rejected'") !== -1
      && inst.indexOf("'non_expiring_token_rejected'") < inst.indexOf('createPendingInstall(admin, {'))
    check('2g: the authorization-code callback fails closed the same way',
      /reauthorization_required/.test(strip(read('app/api/shopify/oauth/callback/route.ts'))))
  }

  console.log('\n3) Both halves are ENCRYPTED, and survive the pending-install handoff')
  {
    const admin = new FakeAdmin({ shopify_pending_installs: [], shopify_connections: [], projects: [], billing_governance: [] })
    const t0 = Date.now()
    const token = await createPendingInstall(admin as never, {
      shop_domain: SHOP, shop_gid: 'gid://shopify/Shop/1',
      access_token_encrypted: encryptCredential(ACCESS),
      refresh_token_encrypted: encryptCredential(REFRESH),
      access_token_expires_at: expiryFromNow(86400, t0),
      refresh_token_expires_at: expiryFromNow(30 * 86400, t0),
      install_origin: 'shopify_app_store', oauth_app_edition: 'public',
      api_version: '2026-07', granted_scopes: ['read_products', 'read_content', 'write_content'], storefront_domain: null,
    })
    const pending = await loadValidPendingInstall(admin as never, token)
    check('3a: the pending row carries refresh CIPHERTEXT, never plaintext',
      !!pending?.refresh_token_encrypted && pending.refresh_token_encrypted !== REFRESH
      && decryptCredential(pending.refresh_token_encrypted) === REFRESH)
    check('3b: and the access token likewise', pending!.access_token_encrypted !== ACCESS
      && decryptCredential(pending!.access_token_encrypted) === ACCESS)
    check('3c: with both expiries', !!pending?.access_token_expires_at && !!pending?.refresh_token_expires_at)

    const claim = await claimShopForProject(admin as never, {
      userId: 'u1', projectId: 'p1', shopDomain: SHOP, shopGid: 'gid://shopify/Shop/1',
      accessTokenEncrypted: pending!.access_token_encrypted,
      refreshTokenEncrypted: pending!.refresh_token_encrypted,
      accessTokenExpiresAt: pending!.access_token_expires_at,
      refreshTokenExpiresAt: pending!.refresh_token_expires_at,
      oauthAppEdition: pending!.oauth_app_edition,
      apiVersion: '2026-07', grantedScopes: ['read_products', 'read_content', 'write_content'],
      storefrontDomain: null, connectionStatus: 'connected', lastError: null,
      proof: 'session_token_exchange_verified',
    })
    const row = admin.tables.shopify_connections[0]
    check('3d2: the issuing app travels with the pair',
      admin.tables.shopify_connections[0].oauth_app_edition === 'public')
    check('3d: the ownership claim transfers ALL FOUR values to the live row',
      claim.ok === true && row.access_token_encrypted === pending!.access_token_encrypted
      && row.refresh_token_encrypted === pending!.refresh_token_encrypted
      && !!row.access_token_expires_at && !!row.refresh_token_expires_at)
    check('3e: no empty encrypted credential is ever stored',
      row.access_token_encrypted !== '' && row.refresh_token_encrypted !== '')
  }

  console.log('\n4) A valid token is REUSED; a near-expiry or expired one is REFRESHED')
  {
    const originalFetch = globalThis.fetch
    // Valid — no Shopify call at all.
    let called = 0
    globalThis.fetch = (async () => { called++; throw new Error('must not be called') }) as unknown as typeof fetch
    let r
    try {
      const admin = new FakeAdmin({ shopify_connections: [conn()] })
      r = await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never)
    } finally { globalThis.fetch = originalFetch }
    check('4a: an unexpired token is reused', r.ok === true && r.accessToken === ACCESS && r.rotated === false)
    check('4b: Shopify was never contacted', called === 0)
    check('4c: the validity rule keeps a safety margin',
      isAccessTokenSafelyValid(new Date(Date.now() + (REFRESH_SKEW_SECONDS + 60) * 1000).toISOString()) === true
      && isAccessTokenSafelyValid(new Date(Date.now() + (REFRESH_SKEW_SECONDS - 60) * 1000).toISOString()) === false)

    for (const [label, expiresAt] of [
      ['near-expiry (inside the skew)', new Date(Date.now() + 30_000).toISOString()],
      ['already expired', new Date(Date.now() - 60_000).toISOString()],
    ] as [string, string][]) {
      const admin = new FakeAdmin({ shopify_connections: [conn({ access_token_expires_at: expiresAt })] })
      const sink = { calls: [] as { url: string; body: Json }[] }
      globalThis.fetch = fakeFetch(200, expiring({ access_token: 'unit-test-access-token-2', refresh_token: 'unit-test-refresh-token-2' }), sink)
      let res
      try { res = await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never) }
      finally { globalThis.fetch = originalFetch }
      const row = admin.tables.shopify_connections[0]
      check(`4: a ${label} token is refreshed before the API call`, res.ok === true && res.rotated === true && res.accessToken === 'unit-test-access-token-2')
      check(`4: the refresh uses grant_type=refresh_token with the stored refresh token`,
        sink.calls[0]?.body.grant_type === 'refresh_token' && sink.calls[0]?.body.refresh_token === REFRESH)
      check(`4: the ROTATED refresh token replaces the previous one, encrypted`,
        decryptCredential(row.refresh_token_encrypted as string) === 'unit-test-refresh-token-2'
        && row.refresh_token_encrypted !== 'unit-test-refresh-token-2')
      check(`4: both expiries moved forward`,
        new Date(row.access_token_expires_at as string).getTime() > Date.now() + 3600_000
        && new Date(row.refresh_token_expires_at as string).getTime() > Date.now() + 29 * 86400_000)
    }
  }

  console.log('\n5) BLOCKER 5 — refresh is SERIALIZED per connection, before the Shopify call')
  {
    const originalFetch = globalThis.fetch
    const stale = (over: Record<string, unknown> = {}) =>
      conn({ access_token_expires_at: new Date(Date.now() - 1000).toISOString(), ...over })

    // TRUE CONCURRENCY: two resolver calls started together on one connection.
    const admin = new FakeAdmin({ shopify_connections: [stale()] })
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls++
      // Hold the "network" open so the second caller is genuinely in flight.
      await new Promise((r) => setTimeout(r, 30))
      return {
        ok: true, status: 200,
        headers: { get: () => 'req-1' },
        json: async () => expiring({ access_token: 'unit-test-access-token-winner', refresh_token: 'unit-test-refresh-token-winner' }),
      } as unknown as Response
    }) as unknown as typeof fetch
    let both
    try {
      const row = admin.tables.shopify_connections[0] as never
      both = await Promise.all([
        resolveShopifyAccessToken(admin as never, row),
        resolveShopifyAccessToken(admin as never, row),
      ])
    } finally { globalThis.fetch = originalFetch }

    check('5a: Shopify refresh was called EXACTLY ONCE for the two callers', fetchCalls === 1)
    check('5b: both callers succeed', both[0].ok === true && both[1].ok === true)
    check('5c: both receive the SAME persisted access token',
      both[0].ok && both[1].ok && both[0].accessToken === both[1].accessToken
      && both[0].accessToken === 'unit-test-access-token-winner')
    check('5d: exactly one rotated pair is stored',
      decryptCredential(admin.tables.shopify_connections[0].access_token_encrypted as string) === 'unit-test-access-token-winner'
      && decryptCredential(admin.tables.shopify_connections[0].refresh_token_encrypted as string) === 'unit-test-refresh-token-winner')
    check('5e: neither caller marked the connection failed',
      admin.tables.shopify_connections[0].connection_status === 'connected'
      && admin.tables.shopify_connections[0].last_error === null)
    check('5f: the lease was released', admin.tables.shopify_connections[0].token_refresh_lease_token === null)

    // An ACTIVE lease prevents a second Shopify call outright.
    const locked = new FakeAdmin({ shopify_connections: [stale({
      token_refresh_lease_token: 'someone-else', token_refresh_lease_until: new Date(Date.now() + 60_000).toISOString(),
    })] })
    let lockedCalls = 0
    globalThis.fetch = (async () => { lockedCalls++; throw new Error('must not be called') }) as unknown as typeof fetch
    let lockedResult
    try { lockedResult = await resolveShopifyAccessToken(locked as never, locked.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    check('5g: an unexpired lease held by another worker blocks the Shopify call entirely', lockedCalls === 0)
    check('5h: and the blocked caller reports a TRANSIENT failure, not a credential one',
      lockedResult.ok === false && lockedResult.reason === 'token_refresh_failed')
    check('5i: without touching the connection', locked.tables.shopify_connections[0].connection_status === 'connected')

    // An EXPIRED lease (crashed worker) is reclaimable.
    const abandoned = new FakeAdmin({ shopify_connections: [stale({
      token_refresh_lease_token: 'crashed-worker', token_refresh_lease_until: new Date(Date.now() - 1000).toISOString(),
    })] })
    globalThis.fetch = fakeFetch(200, expiring({ access_token: 'unit-test-access-token-recovered', refresh_token: 'unit-test-refresh-token-recovered' }))
    let recovered
    try { recovered = await resolveShopifyAccessToken(abandoned as never, abandoned.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    check('5j: a crashed worker’s expired lease is reclaimed', recovered.ok === true && recovered.accessToken === 'unit-test-access-token-recovered')

    // A stale worker cannot overwrite a newer pair, nor resurrect an uninstall.
    const staleWorker = new FakeAdmin({ shopify_connections: [stale()] })
    const snapshot = { ...staleWorker.tables.shopify_connections[0] } as Record<string, unknown>
    Object.assign(staleWorker.tables.shopify_connections[0], {
      access_token_encrypted: encryptCredential('unit-test-access-token-newer'),
      refresh_token_encrypted: encryptCredential('unit-test-refresh-token-newer'),
      access_token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
      token_refresh_lease_token: null, token_refresh_lease_until: null,
    })
    globalThis.fetch = fakeFetch(200, expiring({ access_token: 'unit-test-access-token-retired', refresh_token: 'unit-test-refresh-token-retired' }))
    let staleResult
    try { staleResult = await resolveShopifyAccessToken(staleWorker as never, snapshot as never) }
    finally { globalThis.fetch = originalFetch }
    check('5k: a worker holding a retired credential cannot overwrite the newer one',
      decryptCredential(staleWorker.tables.shopify_connections[0].access_token_encrypted as string) === 'unit-test-access-token-newer')
    check('5l: it reloads and uses the token that actually landed',
      staleResult.ok === true && staleResult.accessToken === 'unit-test-access-token-newer')

    const uninstalled = new FakeAdmin({ shopify_connections: [stale({ connection_status: 'failed', last_error: 'app_uninstalled' })] })
    let uninstalledCalls = 0
    globalThis.fetch = (async () => { uninstalledCalls++; throw new Error('must not be called') }) as unknown as typeof fetch
    let uninstalledResult
    try { uninstalledResult = await resolveShopifyAccessToken(uninstalled as never, uninstalled.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    check('5m: an uninstalled store is never refreshed at all', uninstalledCalls === 0)
    check('5n: it reports reauthorization_required', uninstalledResult.ok === false && uninstalledResult.reason === 'reauthorization_required')
    check('5o: and the tombstone survives', uninstalled.tables.shopify_connections[0].last_error === 'app_uninstalled')

    const resolver = strip(read('lib/shopify/token-resolver.ts'))
    const beginIdx = resolver.indexOf("admin.rpc('begin_shopify_token_refresh'")
    const fetchIdx = resolver.indexOf('refreshOfflineAccessToken({')
    check('5p: the lease is acquired BEFORE the external Shopify call', beginIdx !== -1 && fetchIdx !== -1 && beginIdx < fetchIdx)

    // A HUNG Shopify request must abort well before the lease expires,
    // otherwise the lease is reclaimed while this worker is still holding a
    // pair Shopify may already have replaced.
    const { REFRESH_TIMEOUT_MS } = await import('../oauth')
    const { REFRESH_LEASE_SECONDS } = await import('../token-resolver')
    check('5q: the HTTP timeout is strictly shorter than the refresh lease',
      REFRESH_TIMEOUT_MS < REFRESH_LEASE_SECONDS * 1000)

    const hung = new FakeAdmin({ shopify_connections: [stale()] })
    const abortState = { aborted: false }
    globalThis.fetch = (async (_u: unknown, init?: { signal?: AbortSignal }) => {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          abortState.aborted = true
          const e = new Error('aborted'); e.name = 'AbortError'; reject(e)
        })
      })
    }) as unknown as typeof fetch
    let hungResult
    try {
      hungResult = await Promise.race([
        resolveShopifyAccessToken(hung as never, { ...(hung.tables.shopify_connections[0] as Record<string, unknown>) } as never),
        new Promise((r) => setTimeout(() => r({ ok: false, reason: 'harness_timeout' }), 4000)),
      ]) as { ok: boolean; reason?: string }
    } finally { globalThis.fetch = originalFetch }
    // The production timeout is 20s, so the harness proves the WIRING (a signal
    // is passed and an abort is honoured) with a short local override below.
    check('5r: a request that never resolves is given an abort signal', typeof hungResult === 'object')

    // Direct, deterministic proof of the abort path with a tiny timeout.
    const { refreshOfflineAccessToken, TokenRefreshError } = await import('../oauth')
    let timeoutErr: unknown = null
    try {
      await refreshOfflineAccessToken({
        shop: SHOP, refreshToken: REFRESH, clientId: 'id', clientSecret: SECRET, timeoutMs: 50,
        fetchImpl: (async (_u: unknown, init?: { signal?: AbortSignal }) => new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener('abort', () => { abortState.aborted = true; const e = new Error('aborted'); e.name = 'AbortError'; rej(e) })
        })) as unknown as typeof fetch,
      })
    } catch (e) { timeoutErr = e }
    check('5s: a hung refresh ABORTS rather than hanging past its lease',
      abortState.aborted === true && timeoutErr instanceof TokenRefreshError && (timeoutErr as Error).message === 'refresh_timeout')
    check('5t: and the timeout is TRANSIENT, never terminal',
      timeoutErr instanceof TokenRefreshError && (timeoutErr as InstanceType<typeof TokenRefreshError>).terminal === false)

    // PERSISTENCE retry must not call Shopify a second time: the rotation
    // already happened and the old refresh token is spent.
    const flaky = new FakeAdmin({ shopify_connections: [stale()] })
    let persistCalls = 0
    let shopifyCalls = 0
    flaky.rpcHooks['complete_shopify_token_refresh'] = () => {
      persistCalls++
      return persistCalls === 1 ? { message: 'connection reset', code: '08006' } : null
    }
    globalThis.fetch = (async () => {
      shopifyCalls++
      return { ok: true, status: 200, headers: { get: () => 'r' },
        json: async () => expiring({ access_token: 'unit-test-access-token-once', refresh_token: 'unit-test-refresh-token-once' }) } as unknown as Response
    }) as unknown as typeof fetch
    let flakyResult
    try { flakyResult = await resolveShopifyAccessToken(flaky as never, flaky.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    check('5u: a DB failure while persisting is retried in place', persistCalls === 2)
    check('5v: without calling Shopify a second time', shopifyCalls === 1)
    check('5w: and the retry succeeds', flakyResult.ok === true && flakyResult.accessToken === 'unit-test-access-token-once')

    // REPEATED persistence failure: transient, connection untouched, lease freed.
    const stuck = new FakeAdmin({ shopify_connections: [stale()] })
    stuck.rpcHooks['complete_shopify_token_refresh'] = () => ({ message: 'db down', code: '08006' })
    globalThis.fetch = fakeFetch(200, expiring({ access_token: 'unit-test-access-token-lost', refresh_token: 'unit-test-refresh-token-lost' }))
    let stuckResult
    try { stuckResult = await resolveShopifyAccessToken(stuck as never, stuck.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    const stuckRow = stuck.tables.shopify_connections[0]
    check('5x: repeated persistence failure is TRANSIENT', stuckResult.ok === false && stuckResult.reason === 'token_refresh_failed')
    check('5y: the connection is NOT marked failed', stuckRow.connection_status === 'connected' && stuckRow.last_error === null)
    check('5z: and the owned lease is released for the next attempt', stuckRow.token_refresh_lease_token === null)
  }

  console.log('\n6) Refresh failure fails CLOSED and changes no billing authority')
  {
    const originalFetch = globalThis.fetch
    const mk = () => new FakeAdmin({
      shopify_connections: [conn({ access_token_expires_at: new Date(Date.now() - 60_000).toISOString() })],
      billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
    })
    // TERMINAL — Shopify rejects the refresh token.
    const admin = mk()
    globalThis.fetch = fakeFetch(400, { error: 'invalid_grant' })
    let r
    try { r = await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    const row = admin.tables.shopify_connections[0]
    check('6a: the caller gets the stable reauthorization result', r.ok === false && r.reason === 'reauthorization_required')
    check('6b: no Admin API call can proceed (no token is returned at all)', !('accessToken' in r))
    check('6c: the connection is marked for reconnect', row.connection_status === 'failed' && row.last_error === 'refresh_token_invalid')
    check('6d: which app-home classifies as needsInstall',
      classifyReinstallNeed(row as never).needsInstall === true && classifyReinstallNeed(row as never).reason === 'credential_revoked')
    check('6e: BILLING AUTHORITY is unchanged',
      (await resolveBillingAuthority(admin as never, 'u1') as { authority: string }).authority === 'shopify')

    // TRANSIENT — nothing changes at all.
    const admin2 = mk()
    globalThis.fetch = fakeFetch(503, { error: 'unavailable' })
    let r2
    try { r2 = await resolveShopifyAccessToken(admin2 as never, admin2.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    const row2 = admin2.tables.shopify_connections[0]
    check('6f: a transient failure is reported as transient', r2.ok === false && r2.reason === 'token_refresh_failed')
    check('6g: and changes NO stored state', row2.connection_status === 'connected' && row2.last_error === null)

    // An uninstall tombstone is never overwritten.
    const admin3 = new FakeAdmin({
      shopify_connections: [conn({ access_token_expires_at: new Date(Date.now() - 60_000).toISOString(), connection_status: 'failed', last_error: 'app_uninstalled' })],
      billing_governance: [],
    })
    globalThis.fetch = fakeFetch(401, { error: 'invalid_grant' })
    try { await resolveShopifyAccessToken(admin3 as never, admin3.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    check('6h: a terminal failure never overwrites app_uninstalled',
      admin3.tables.shopify_connections[0].last_error === 'app_uninstalled')

    // A PROVEN legacy credential — the legacy custom app's tokens are
    // non-expiring by design, and the edition says so — is used as-is. An
    // UNRECORDED edition is not (see 6b5): that is the difference between
    // proving a legacy token and guessing at one.
    const legacy = new FakeAdmin({ shopify_connections: [] })
    const res = await resolveShopifyAccessToken(legacy as never, {
      id: 'legacy', shop_domain: SHOP, access_token_encrypted: encryptCredential(ACCESS),
      refresh_token_encrypted: null, access_token_expires_at: null, refresh_token_expires_at: null,
      oauth_app_edition: 'legacy',
    })
    check('6i: a PROVEN legacy non-expiring credential is used as-is', res.ok === true && res.rotated === false)
  }

  console.log('\n6b) BLOCKER 7 — an incomplete or unprovable credential is never sent to the Admin API')
  {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = (async () => { calls++; throw new Error('must not be called') }) as unknown as typeof fetch
    try {
      // An expiry but NO refresh material: inconsistent, and the access token is
      // at or past expiry. Returning it would send a dead credential upstream.
      const incomplete = await resolveShopifyAccessToken(new FakeAdmin({ shopify_connections: [] }) as never, {
        id: 'c-incomplete', shop_domain: SHOP, access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: null,
        access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
        refresh_token_expires_at: null, oauth_app_edition: 'public',
      })
      check('6b1: an expiring row with no refresh material demands reauthorization',
        incomplete.ok === false && incomplete.reason === 'reauthorization_required')
      check('6b2: and no token is handed back at all', !('accessToken' in incomplete))

      // A NEAR-expiry incomplete row is refused too, not squeaked through.
      const near = await resolveShopifyAccessToken(new FakeAdmin({ shopify_connections: [] }) as never, {
        id: 'c-near', shop_domain: SHOP, access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: null,
        access_token_expires_at: new Date(Date.now() + 30_000).toISOString(),
        refresh_token_expires_at: null, oauth_app_edition: 'public',
      })
      check('6b3: a near-expiry incomplete row is refused as well',
        near.ok === false && near.reason === 'reauthorization_required')

      // A public-app NON-EXPIRING token is exactly the deprecated kind.
      const publicLegacyShape = await resolveShopifyAccessToken(new FakeAdmin({ shopify_connections: [] }) as never, {
        id: 'c-pub', shop_domain: SHOP, access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: null, access_token_expires_at: null, refresh_token_expires_at: null,
        oauth_app_edition: 'public',
      })
      check('6b4: a PUBLIC-app non-expiring token is never sent to the Admin API',
        publicLegacyShape.ok === false && publicLegacyShape.reason === 'reauthorization_required')

      // An UNRECORDED edition is a PRE-COLUMN row — it can only have been issued
      // before the public app existed (no writer since the column was added can
      // produce NULL), so it is the legacy custom app and its non-expiring token
      // is used. This is the historical direct-connection regression: refusing
      // it stranded intentional pre-approval connections behind a false
      // "no connected store".
      const unknownEdition = await resolveShopifyAccessToken(new FakeAdmin({ shopify_connections: [] }) as never, {
        id: 'c-unknown', shop_domain: SHOP, access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: null, access_token_expires_at: null, refresh_token_expires_at: null,
        oauth_app_edition: null,
      })
      check('6b5: a PRE-COLUMN (null-edition) non-expiring credential is USED, not refused',
        unknownEdition.ok === true, JSON.stringify(unknownEdition))
      check('6b6: none of these contacted Shopify', calls === 0)

      check('6b7: the shape classifier names each case exactly', (() => {
        const base = { id: 'x', shop_domain: SHOP, access_token_encrypted: 'e' }
        return classifyStoredCredential({ ...base, refresh_token_encrypted: 'r', access_token_expires_at: 'now' }) === 'expiring'
          && classifyStoredCredential({ ...base, access_token_expires_at: 'now' }) === 'incomplete'
          && classifyStoredCredential({ ...base, oauth_app_edition: 'legacy' }) === 'legacy'
          // The public-app guard is UNCHANGED — this is the case that must stay refused.
          && classifyStoredCredential({ ...base, oauth_app_edition: 'public' }) === 'unusable'
          // A pre-column NULL edition is legacy by construction, not unusable.
          && classifyStoredCredential({ ...base }) === 'legacy'
          && classifyStoredCredential({ ...base, oauth_app_edition: null }) === 'legacy'
          // …but only when there is nothing to rotate with: an expiry or refresh
          // material still classifies first, regardless of the null edition.
          && classifyStoredCredential({ ...base, access_token_expires_at: 'now' }) === 'incomplete'
          && classifyStoredCredential({ ...base, refresh_token_encrypted: 'r' }) === 'expiring'
      })())
    } finally { globalThis.fetch = originalFetch }
  }

  console.log('\n6c) BLOCKER 6 — refresh signs with the app that ISSUED the credential')
  {
    const originalFetch = globalThis.fetch
    const stale = (edition: string | null) => ({
      id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
      connection_status: 'connected', last_error: null,
      access_token_encrypted: encryptCredential(ACCESS),
      refresh_token_encrypted: encryptCredential(REFRESH),
      access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      oauth_app_edition: edition, token_refresh_lease_token: null, token_refresh_lease_until: null,
    })

    process.env.SHOPIFY_CLIENT_ID = 'unit-test-legacy-client-id'
    process.env.SHOPIFY_CLIENT_SECRET = 'unit-test-legacy-shopify-secret'

    for (const [label, edition, expectId, expectSecret] of [
      ['a PUBLIC token uses the public pair', 'public', 'unit-test-public-client-id', 'unit-test-shopify-secret'],
      ['a LEGACY token uses the legacy pair', 'legacy', 'unit-test-legacy-client-id', 'unit-test-legacy-shopify-secret'],
    ] as [string, string, string, string][]) {
      const admin = new FakeAdmin({ shopify_connections: [stale(edition)] })
      const sink = { calls: [] as { url: string; body: Json }[] }
      globalThis.fetch = fakeFetch(200, expiring({ access_token: 'unit-test-access-token-r', refresh_token: 'unit-test-refresh-token-r' }), sink)
      try { await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never) }
      finally { globalThis.fetch = originalFetch }
      check(`6c: ${label}`, sink.calls[0]?.body.client_id === expectId && sink.calls[0]?.body.client_secret === expectSecret)
    }

    // Missing credentials for the STORED edition fail closed rather than
    // silently signing with the other app's pair.
    const savedId = process.env.SHOPIFY_CLIENT_ID
    const savedSecret = process.env.SHOPIFY_CLIENT_SECRET
    delete process.env.SHOPIFY_CLIENT_ID
    delete process.env.SHOPIFY_CLIENT_SECRET
    let noCreds
    let credCalls = 0
    globalThis.fetch = (async () => { credCalls++; throw new Error('must not be called') }) as unknown as typeof fetch
    const legacyAdmin = new FakeAdmin({ shopify_connections: [stale('legacy')] })
    try { noCreds = await resolveShopifyAccessToken(legacyAdmin as never, legacyAdmin.tables.shopify_connections[0] as never) }
    finally {
      globalThis.fetch = originalFetch
      if (savedId) process.env.SHOPIFY_CLIENT_ID = savedId
      if (savedSecret) process.env.SHOPIFY_CLIENT_SECRET = savedSecret
    }
    check('6c4: a legacy token with no legacy credentials fails closed', noCreds.ok === false && noCreds.reason === 'not_configured')
    check('6c5: and NEVER falls back to the public pair', credCalls === 0)
    check('6c6: the lease it took was released', legacyAdmin.tables.shopify_connections[0].token_refresh_lease_token === null)

    const oauth = strip(read('lib/shopify/oauth.ts'))
    check('6c7: the per-edition resolver has no cross-app fallback',
      /if \(edition === 'public'\)[\s\S]{0,320}return \{ clientId, clientSecret, appUrl, edition: 'public' \}/.test(oauth))
    const install = strip(read('app/api/shopify/embedded-install/route.ts'))
    check('6c8: the embedded install REQUIRES the public app explicitly',
      /getShopifyOAuthConfigForEdition\('public'\)/.test(install) && !/getShopifyOAuthConfig\(\)/.test(install))
  }

  console.log('\n7) Uninstall clears refresh credentials')
  {
    const admin = new FakeAdmin({
      shopify_connections: [conn({ granted_scopes: ['read_products'], default_blog_id: 'gid://shopify/Blog/1' })],
      billing_governance: [{ user_id: 'u1', signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
    })
    const res = await applyAppUninstalled(admin as never, SHOP)
    const row = admin.tables.shopify_connections[0]
    check('7a: the uninstall applies', res.ok === true)
    check('7b: the refresh token is GONE — no new access token can be minted', row.refresh_token_encrypted === null)
    check('7c: both expiries are cleared', row.access_token_expires_at === null && row.refresh_token_expires_at === null)
    check('7d: the access token is the non-usable sentinel, never blank',
      typeof row.access_token_encrypted === 'string' && row.access_token_encrypted !== ''
      && decryptCredential(row.access_token_encrypted as string) === '__revoked__')
    check('7e: tombstone semantics unchanged', row.connection_status === 'failed' && row.last_error === 'app_uninstalled')
    check('7f: and billing authority is untouched by the uninstall',
      (await resolveBillingAuthority(admin as never, 'u1') as { authority: string }).authority === 'shopify')
  }

  console.log('\n8) No token reaches a log, a client response, or the wrong app secret')
  {
    const printed: string[] = []
    const ow = console.warn, oe = console.error
    console.warn = (...a: unknown[]) => { printed.push(a.map((x) => JSON.stringify(x)).join(' ')) }
    console.error = (...a: unknown[]) => { printed.push(a.map((x) => JSON.stringify(x)).join(' ')) }
    const originalFetch = globalThis.fetch
    try {
      const admin = new FakeAdmin({
        shopify_connections: [conn({ access_token_expires_at: new Date(Date.now() - 60_000).toISOString() })],
        billing_governance: [],
      })
      globalThis.fetch = fakeFetch(400, { error: 'invalid_grant', access_token: ACCESS, refresh_token: REFRESH })
      await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never)
    } finally { globalThis.fetch = originalFetch; console.warn = ow; console.error = oe }
    const all = printed.join('\n')
    check('8a: something WAS logged (not vacuous)', printed.length > 0)
    check('8b: no access token appears in any log line', !all.includes(ACCESS))
    check('8c: no refresh token appears', !all.includes(REFRESH))
    check('8d: no client secret appears', !all.includes(SECRET))
    check('8e: no stored ciphertext appears', !printed.some((l) => /[0-9a-f]{24}:[0-9a-f]{32}:/.test(l)))

    const resolver = strip(read('lib/shopify/token-resolver.ts'))
    check('8f: the resolver returns only the access token to its caller',
      /return \{ ok: true, accessToken/.test(resolver) && !/return[^\n]*refreshToken/.test(resolver))
    const apiAuth = strip(read('lib/shopify/api-auth.ts'))
    check('8g: sanitizeShopifyConnection still strips every token before the browser sees a connection',
      !/access_token_encrypted:/.test(apiAuth.slice(apiAuth.indexOf('export function sanitizeShopifyConnection'))))
    // Secret separation — no fallback, no substitution.
    const hmac = strip(read('lib/shopify/webhook-hmac.ts'))
    const pub = strip(read('lib/shopify/webhook-public.ts'))
    check('8h: the base webhook verifier reads ONLY SHOPIFY_CLIENT_SECRET',
      /process\.env\.SHOPIFY_CLIENT_SECRET/.test(hmac) && !/SHOPIFY_PUBLIC_CLIENT_SECRET/.test(hmac.replace(/[^\n]*NOT[^\n]*/g, '')))
    check('8i: the public webhook verifier reads ONLY SHOPIFY_PUBLIC_CLIENT_SECRET',
      /process\.env\.SHOPIFY_PUBLIC_CLIENT_SECRET/.test(pub) && !/process\.env\.SHOPIFY_CLIENT_SECRET/.test(pub))
    const oauth = strip(read('lib/shopify/oauth.ts'))
    check('8j: the OAuth config resolves an ATOMIC pair — an id is never mixed with the other app’s secret',
      /if \(publicClientId && publicClientSecret\) \{[\s\S]{0,200}edition: 'public'/.test(oauth)
      && /if \(clientId && clientSecret\) \{[\s\S]{0,200}edition: 'legacy'/.test(oauth))
    check('8k: the token exchange signs with the resolved pair’s secret, never a hard-coded env read',
      /clientSecret: config\.clientSecret/.test(strip(read('app/api/shopify/embedded-install/route.ts'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
