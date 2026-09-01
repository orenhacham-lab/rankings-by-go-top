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
  const { resolveShopifyAccessToken, isAccessTokenSafelyValid, REFRESH_SKEW_SECONDS } = await import('../token-resolver')
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
      install_origin: 'shopify_app_store',
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
      apiVersion: '2026-07', grantedScopes: ['read_products', 'read_content', 'write_content'],
      storefrontDomain: null, connectionStatus: 'connected', lastError: null,
      proof: 'session_token_exchange_verified',
    })
    const row = admin.tables.shopify_connections[0]
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

  console.log('\n5) Concurrency — a lost race never overwrites newer credentials')
  {
    const originalFetch = globalThis.fetch
    const staleRow = conn({ access_token_expires_at: new Date(Date.now() - 1000).toISOString() })
    const admin = new FakeAdmin({ shopify_connections: [staleRow] })
    // Request A loaded this row; request B rotates FIRST, in between.
    const snapshotA = { ...admin.tables.shopify_connections[0] } as Record<string, unknown>
    const winner = { access: 'unit-test-access-token-winner', refresh: 'unit-test-refresh-token-winner' }
    Object.assign(admin.tables.shopify_connections[0], {
      access_token_encrypted: encryptCredential(winner.access),
      refresh_token_encrypted: encryptCredential(winner.refresh),
      access_token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
    })
    globalThis.fetch = fakeFetch(200, expiring({ access_token: 'unit-test-access-token-loser', refresh_token: 'unit-test-refresh-token-loser' }))
    let res
    try { res = await resolveShopifyAccessToken(admin as never, snapshotA as never) }
    finally { globalThis.fetch = originalFetch }
    const row = admin.tables.shopify_connections[0]
    check('5a: the loser does NOT overwrite the winner’s pair',
      decryptCredential(row.access_token_encrypted as string) === winner.access
      && decryptCredential(row.refresh_token_encrypted as string) === winner.refresh)
    check('5b: the loser reloads and returns the credential that actually landed',
      res.ok === true && res.accessToken === winner.access && res.rotated === false)
    const resolver = strip(read('lib/shopify/token-resolver.ts'))
    check('5c: the write is conditioned on the exact ciphertext the caller loaded',
      /\.eq\('access_token_encrypted', current\.access_token_encrypted\)/.test(resolver))
    check('5d: and no lock or new RPC was introduced for it',
      !/\.rpc\(/.test(resolver) && !/advisory/i.test(resolver))
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

    // Legacy rows are used as-is rather than failed.
    const legacy = new FakeAdmin({ shopify_connections: [] })
    const res = await resolveShopifyAccessToken(legacy as never, {
      id: 'legacy', shop_domain: SHOP, access_token_encrypted: encryptCredential(ACCESS),
      refresh_token_encrypted: null, access_token_expires_at: null, refresh_token_expires_at: null,
    })
    check('6i: a legacy non-expiring connection is used as-is, not failed', res.ok === true && res.rotated === false)
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
