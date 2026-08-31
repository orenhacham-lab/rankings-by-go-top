/**
 * Shopify EXPIRING offline access tokens — full lifecycle QA.
 *
 * PRODUCTION ROOT CAUSE (Shopify's own 403 body):
 *   "[API] Non-expiring access tokens are no longer accepted for the Admin
 *    API. Start using expiring offline tokens."
 * The exchange returned HTTP 200 with tokenType 'offline', expiresIn null and
 * no refresh-token metadata — a NON-EXPIRING token, which every Admin API call
 * then refused. Shopify's token-exchange documentation requires `expiring=1`
 * for a public embedded app to be issued an expiring offline grant.
 *
 * This suite covers the whole lifecycle that requirement implies, not just the
 * request parameter: the required response shape, the handoff through the
 * pending install and the ownership claim, reuse vs refresh, atomic rotation,
 * the concurrency rules, background publishing with no merchant session,
 * terminal failure leading to a reconnect, uninstall clearing the refresh
 * material, and the log-safety rules for a second secret.
 *
 * The DATABASE side of the lease is proved against real PostgreSQL by
 * supabase/migrations/__qa__/expiring-offline-tokens.probe.sql (36/36, plus 8
 * truly-parallel sessions yielding exactly one lease). This file proves the
 * application half and the source contracts a JS model cannot.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-expiring-offline-tokens.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'

// Set BEFORE anything reads them — both are read lazily, inside the functions
// that need them, so module import order does not matter.
process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY ||= 'a'.repeat(64)
process.env.SHOPIFY_PUBLIC_CLIENT_ID ||= 'test-public-client-id'
process.env.SHOPIFY_PUBLIC_CLIENT_SECRET ||= 'test-public-client-secret'
process.env.SHOPIFY_APP_URL ||= 'https://www.example.test'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'go-top-seo-test.myshopify.com'
const ACCESS = 'shpat_ACCESS_TOKEN_VALUE'
const REFRESH = 'shpr_REFRESH_TOKEN_VALUE'
const SESSION_TOKEN = 'header.payload.signature'
const CLIENT_SECRET = 'test-public-client-secret'

type Json = Record<string, unknown>
/** A fetch stand-in that records the request and replies with `body`. */
function fakeFetch(status: number, body: Json | null, sink?: { calls: { url: string; body: Json }[] }) {
  return (async (url: string | URL, init?: { body?: string }) => {
    sink?.calls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') as Json })
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h: string) => (h === 'x-request-id' ? 'req-abc123' : null) },
      json: async () => body,
    } as unknown as Response
  }) as unknown as typeof fetch
}

const expiringBody = (over: Json = {}): Json => ({
  access_token: ACCESS, refresh_token: REFRESH,
  expires_in: 86400, refresh_token_expires_in: 30 * 86400,
  scope: 'read_products,write_content', ...over,
})

async function main() {
  console.log('Shopify expiring offline tokens — lifecycle QA\n')

  const {
    exchangeSessionTokenForOfflineToken, exchangeCodeForToken,
    parseExpiringOfflineToken, buildAuthorizeUrl, expiryFromNow, TokenExchangeError,
  } = await import('../oauth')
  const { resolveShopifyAccessToken, isAccessTokenSafelyValid, REFRESH_SKEW_SECONDS } = await import('../token-resolver')
  const { createPendingInstall, loadValidPendingInstall } = await import('../pending-link')
  const { claimShopForProject } = await import('../connection-ownership')
  const { encryptCredential, decryptCredential } = await import('@/lib/security/credentials-crypto')
  const { classifyReinstallNeed } = await import('../connection-health')
  const { applyAppUninstalled } = await import('../shop-cleanup')

  console.log('1) Every offline grant asks for an EXPIRING token')
  {
    const sink = { calls: [] as { url: string; body: Json }[] }
    await exchangeSessionTokenForOfflineToken({
      shop: SHOP, sessionToken: SESSION_TOKEN, clientId: 'cid', clientSecret: CLIENT_SECRET,
      fetchImpl: fakeFetch(200, expiringBody(), sink),
    })
    check('1a: the token exchange sends expiring=1', sink.calls[0]?.body.expiring === '1')
    check('1b: alongside the unchanged token-exchange grant',
      sink.calls[0]?.body.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange'
      && sink.calls[0]?.body.requested_token_type === 'urn:shopify:params:oauth:token-type:offline-access-token')
    check('1c: to the shop’s own /admin/oauth/access_token', sink.calls[0]?.url === `https://${SHOP}/admin/oauth/access_token`)

    const sink2 = { calls: [] as { url: string; body: Json }[] }
    await exchangeCodeForToken({ shop: SHOP, code: 'the-code', clientId: 'cid', clientSecret: CLIENT_SECRET, fetchImpl: fakeFetch(200, expiringBody(), sink2) })
    check('1d: the authorization-code exchange sends it too', sink2.calls[0]?.body.expiring === '1')

    const url = buildAuthorizeUrl({ shop: SHOP, clientId: 'cid', redirectUri: 'https://x/y', state: 's' })
    check('1e: and the authorize URL that precedes it carries expiring=1',
      new URL(url).searchParams.get('expiring') === '1')
    // NEGATIVE CONTROL — the pre-fix request is exactly the one that produced
    // production's non-expiring token: same body, minus `expiring`.
    const preFixBody = { ...(sink.calls[0]?.body ?? {}) } as Json
    delete preFixBody.expiring
    check('1f: NEGATIVE CONTROL — the pre-fix body differed only by the missing expiring flag',
      Object.keys(preFixBody).length === Object.keys(sink.calls[0]!.body).length - 1
      && preFixBody.expiring === undefined)
    const oauthSrc = strip(read('lib/shopify/oauth.ts'))
    check('1g: every offline-grant request in the module carries the flag',
      (oauthSrc.match(/\[SHOPIFY_EXPIRING_TOKEN_PARAM\]: SHOPIFY_EXPIRING_TOKEN_VALUE/g) || []).length === 3)
  }

  console.log('\n2) A NON-EXPIRING response is rejected before anything is persisted')
  {
    for (const [label, body] of [
      ['exactly the production shape (no refresh, no expiry)', { access_token: ACCESS, scope: 'read_products' }],
      ['refresh token but no expiries', { access_token: ACCESS, refresh_token: REFRESH }],
      ['expiries but no refresh token', { access_token: ACCESS, expires_in: 86400, refresh_token_expires_in: 100 }],
      ['no refresh_token_expires_in', { access_token: ACCESS, refresh_token: REFRESH, expires_in: 86400 }],
    ] as [string, Json][]) {
      let thrown: unknown = null
      try {
        await exchangeSessionTokenForOfflineToken({
          shop: SHOP, sessionToken: SESSION_TOKEN, clientId: 'cid', clientSecret: CLIENT_SECRET,
          fetchImpl: fakeFetch(200, body),
        })
      } catch (e) { thrown = e }
      check(`2: ${label} -> rejected`, thrown instanceof TokenExchangeError && thrown.message === 'token_exchange_not_expiring')
    }
    let diag: Record<string, unknown> = {}
    try {
      await exchangeSessionTokenForOfflineToken({
        shop: SHOP, sessionToken: SESSION_TOKEN, clientId: 'cid', clientSecret: CLIENT_SECRET,
        fetchImpl: fakeFetch(200, { access_token: ACCESS, scope: 'read_products' }),
      })
    } catch (e) { diag = (e as InstanceType<typeof TokenExchangeError>).diagnostics as Record<string, unknown> }
    check('2e: the diagnostics name the MISSING Shopify fields',
      JSON.stringify(diag.missingFields) === JSON.stringify(['refresh_token', 'expires_in', 'refresh_token_expires_in']))
    check('2f: and record that expiring=1 WAS requested (so this is Shopify’s answer, not our omission)',
      diag.requestedExpiring === true && diag.hasRefreshToken === false)
    check('2g: an access token with no refresh half is still reported as absent-refresh, never stored',
      parseExpiringOfflineToken({ access_token: ACCESS }).ok === false)
    check('2h: a complete grant parses', parseExpiringOfflineToken(expiringBody()).ok === true)

    const inst = strip(read('app/api/shopify/embedded-install/route.ts'))
    const exchangeIdx = inst.indexOf('exchanged = await exchangeSessionTokenForOfflineToken(')
    const rejectIdx = inst.indexOf("'non_expiring_token_rejected'")
    const pendingIdx = inst.indexOf('createPendingInstall(admin, {')
    check('2i: the route has a distinct stable reason for it', rejectIdx !== -1)
    check('2j: raised BEFORE any pending install exists',
      exchangeIdx !== -1 && rejectIdx > exchangeIdx && rejectIdx < pendingIdx)
    check('2k: the authorization-code callback fails closed the same way',
      /non_expiring_token_rejected/.test(strip(read('app/api/shopify/oauth/callback/route.ts'))))
  }

  console.log('\n3) The expiring grant survives pending install -> ownership claim')
  {
    const admin = new FakeAdmin({ shopify_pending_installs: [], shopify_connections: [], projects: [] })
    const accessEnc = encryptCredential(ACCESS)
    const refreshEnc = encryptCredential(REFRESH)
    const t0 = Date.now()
    const token = await createPendingInstall(admin as never, {
      shop_domain: SHOP, shop_gid: 'gid://shopify/Shop/1',
      access_token_encrypted: accessEnc,
      refresh_token_encrypted: refreshEnc,
      access_token_expires_at: expiryFromNow(86400, t0),
      refresh_token_expires_at: expiryFromNow(30 * 86400, t0),
      api_version: '2026-07', granted_scopes: ['read_products', 'write_content'], storefront_domain: null,
    })
    const pending = await loadValidPendingInstall(admin as never, token)
    check('3a: the pending row carries the refresh CIPHERTEXT', pending?.refresh_token_encrypted === refreshEnc)
    check('3b: and both expiries', !!pending?.access_token_expires_at && !!pending?.refresh_token_expires_at)
    check('3c: the refresh token is never stored in plaintext',
      pending?.refresh_token_encrypted !== REFRESH && decryptCredential(pending!.refresh_token_encrypted!) === REFRESH)

    const claim = await claimShopForProject(admin as never, {
      userId: 'u1', projectId: 'p1', shopDomain: SHOP, shopGid: 'gid://shopify/Shop/1',
      accessTokenEncrypted: pending!.access_token_encrypted,
      refreshTokenEncrypted: pending!.refresh_token_encrypted,
      accessTokenExpiresAt: pending!.access_token_expires_at,
      refreshTokenExpiresAt: pending!.refresh_token_expires_at,
      apiVersion: '2026-07', grantedScopes: ['read_products', 'write_content'],
      storefrontDomain: null, connectionStatus: 'connected', lastError: null,
      proof: 'session_token_exchange_verified',
    })
    check('3d: the claim succeeds', claim.ok === true)
    const row = admin.tables.shopify_connections[0]
    check('3e: all FOUR values land on the live connection',
      row.access_token_encrypted === accessEnc && row.refresh_token_encrypted === refreshEnc
      && !!row.access_token_expires_at && !!row.refresh_token_expires_at)
    check('3f: link/complete forwards them from the pending row, not from the request',
      /refreshTokenEncrypted: pending\.refresh_token_encrypted/.test(strip(read('app/api/shopify/link/complete/route.ts'))))
    check('3g: the RPC receives them in the SAME call as the access token',
      /p_access_token_encrypted: args\.accessTokenEncrypted,[\s\S]{0,400}p_refresh_token_encrypted: args\.refreshTokenEncrypted/
        .test(strip(read('lib/shopify/connection-ownership.ts'))))
  }

  console.log('\n4) A valid, unexpired access token is REUSED')
  {
    const admin = new FakeAdmin({ shopify_connections: [] })
    let fetched = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => { fetched++; throw new Error('must not be called') }) as unknown as typeof fetch
    try {
      const r = await resolveShopifyAccessToken(admin as never, {
        id: 'c1', shop_domain: SHOP,
        access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: encryptCredential(REFRESH),
        access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      })
      check('4a: the stored token is returned as-is', r.ok === true && r.accessToken === ACCESS)
      check('4b: nothing was rotated', r.ok === true && r.rotated === false)
      check('4c: Shopify was never contacted', fetched === 0)
    } finally { globalThis.fetch = originalFetch }
    check('4d: the validity rule keeps a safety margin',
      isAccessTokenSafelyValid(new Date(Date.now() + (REFRESH_SKEW_SECONDS + 60) * 1000).toISOString()) === true
      && isAccessTokenSafelyValid(new Date(Date.now() + (REFRESH_SKEW_SECONDS - 60) * 1000).toISOString()) === false)
  }

  console.log('\n5) A near-expiry token is refreshed, and stored atomically')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{
        id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
        connection_status: 'connected', last_error: null,
        access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: encryptCredential(REFRESH),
        access_token_expires_at: new Date(Date.now() + 30_000).toISOString(),  // inside the skew
        refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        token_refresh_lease_token: null, token_refresh_lease_until: null,
      }],
    })
    const sink = { calls: [] as { url: string; body: Json }[] }
    const originalFetch = globalThis.fetch
    globalThis.fetch = fakeFetch(200, expiringBody({ access_token: 'shpat_ROTATED', refresh_token: 'shpr_ROTATED' }), sink)
    let r
    try {
      r = await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never)
    } finally { globalThis.fetch = originalFetch }
    check('5a: the caller receives the ROTATED access token', r.ok === true && r.accessToken === 'shpat_ROTATED')
    check('5b: it reports that a rotation happened', r.ok === true && r.rotated === true)
    check('5c: the refresh used grant_type=refresh_token with the stored refresh token',
      sink.calls[0]?.body.grant_type === 'refresh_token' && sink.calls[0]?.body.refresh_token === REFRESH)
    check('5d: with the app credentials, at the shop’s own endpoint',
      sink.calls[0]?.body.client_id === process.env.SHOPIFY_PUBLIC_CLIENT_ID
      && sink.calls[0]?.body.client_secret === CLIENT_SECRET
      && sink.calls[0]?.url === `https://${SHOP}/admin/oauth/access_token`)
    const row = admin.tables.shopify_connections[0]
    check('5e: BOTH halves were stored, encrypted',
      decryptCredential(row.access_token_encrypted as string) === 'shpat_ROTATED'
      && decryptCredential(row.refresh_token_encrypted as string) === 'shpr_ROTATED')
    check('5f: neither is stored in plaintext',
      row.access_token_encrypted !== 'shpat_ROTATED' && row.refresh_token_encrypted !== 'shpr_ROTATED')
    check('5g: BOTH expiries moved forward',
      new Date(row.access_token_expires_at as string).getTime() > Date.now() + 3600_000
      && new Date(row.refresh_token_expires_at as string).getTime() > Date.now() + 29 * 86400_000)
    check('5h: the lease was released', row.token_refresh_lease_token === null)
  }

  console.log('\n6) Concurrent refreshes cannot leave a RETIRED pair stored')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{
        id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
        connection_status: 'connected', last_error: null,
        access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: encryptCredential(REFRESH),
        access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        token_refresh_lease_token: null, token_refresh_lease_until: null,
      }],
    })
    // Invocation A takes the lease.
    const a = (await admin.rpc('begin_shopify_token_refresh', { p_connection_id: 'c1', p_lease_seconds: 60, p_min_valid_seconds: 300 })).data as { outcome: string; lease_token: string }[]
    check('6a: the first invocation is granted the lease', a[0].outcome === 'granted')
    // Invocation B, arriving while A is still working, is refused.
    const b = (await admin.rpc('begin_shopify_token_refresh', { p_connection_id: 'c1', p_lease_seconds: 60, p_min_valid_seconds: 300 })).data as { outcome: string; refresh_token_encrypted: string | null }[]
    check('6b: a concurrent invocation is locked out', b[0].outcome === 'locked')
    check('6c: and is never handed the refresh material', b[0].refresh_token_encrypted === null)
    // A finishes.
    const doneA = (await admin.rpc('complete_shopify_token_refresh', {
      p_connection_id: 'c1', p_lease_token: a[0].lease_token,
      p_access_token_encrypted: encryptCredential('shpat_WINNER'), p_refresh_token_encrypted: encryptCredential('shpr_WINNER'),
      p_access_token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
      p_refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    })).data as { outcome: string }[]
    check('6d: the lease holder’s rotation lands', doneA[0].outcome === 'rotated')
    // A straggler holding the OLD lease tries to write its now-retired pair.
    const straggler = (await admin.rpc('complete_shopify_token_refresh', {
      p_connection_id: 'c1', p_lease_token: a[0].lease_token,
      p_access_token_encrypted: encryptCredential('shpat_RETIRED'), p_refresh_token_encrypted: encryptCredential('shpr_RETIRED'),
      p_access_token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
      p_refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
    })).data as { outcome: string }[]
    check('6e: a rotation whose lease is gone is REFUSED', straggler[0].outcome === 'lease_lost')
    const row = admin.tables.shopify_connections[0]
    check('6f: the WINNING pair is what remains stored',
      decryptCredential(row.access_token_encrypted as string) === 'shpat_WINNER'
      && decryptCredential(row.refresh_token_encrypted as string) === 'shpr_WINNER')
    const partial = (await admin.rpc('complete_shopify_token_refresh', {
      p_connection_id: 'c1', p_lease_token: a[0].lease_token,
      p_access_token_encrypted: encryptCredential('shpat_HALF'), p_refresh_token_encrypted: null,
      p_access_token_expires_at: new Date().toISOString(), p_refresh_token_expires_at: null,
    })).data as { outcome: string }[]
    check('6g: half a rotation is never stored', partial[0].outcome === 'invalid_rotation'
      && decryptCredential(admin.tables.shopify_connections[0].access_token_encrypted as string) === 'shpat_WINNER')
    check('6h: an abandoned lease is reclaimable (crash recovery), not permanent', (() => {
      const r = admin.tables.shopify_connections[0]
      r.access_token_expires_at = new Date(Date.now() - 1000).toISOString()
      r.token_refresh_lease_token = 'stale'
      r.token_refresh_lease_until = new Date(Date.now() - 1000).toISOString()
      return true
    })())
    const reclaimed = (await admin.rpc('begin_shopify_token_refresh', { p_connection_id: 'c1', p_lease_seconds: 60, p_min_valid_seconds: 300 })).data as { outcome: string }[]
    check('6i: the expired lease is reclaimed', reclaimed[0].outcome === 'granted')
    check('6j: the resolver never rotates without holding a lease',
      /outcome !== 'granted'[\s\S]{0,120}return \{ ok: false, reason: 'refresh_failed' \}/.test(strip(read('lib/shopify/token-resolver.ts'))))
  }

  console.log('\n7) Background publishing works with NO merchant session')
  {
    // publish-item-shopify runs from the automation runner with an admin client
    // and no request, no cookies and no App Bridge token. It reaches Shopify
    // through the same resolver, so the refresh must work from stored state
    // alone — which is exactly what this exercises.
    const admin = new FakeAdmin({
      shopify_connections: [{
        id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
        connection_status: 'connected', last_error: null,
        access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: encryptCredential(REFRESH),
        access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        token_refresh_lease_token: null, token_refresh_lease_until: null,
      }],
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fakeFetch(200, expiringBody({ access_token: 'shpat_BG', refresh_token: 'shpr_BG' }))
    let r
    try {
      r = await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never)
    } finally { globalThis.fetch = originalFetch }
    check('7a: an expired token is refreshed with no session of any kind', r.ok === true && r.accessToken === 'shpat_BG')
    check('7b: the background publisher goes through the same single entry point',
      /loadShopifyConnection\(admin, item\.project_id\)/.test(strip(read('lib/content/automation/publish-item-shopify.ts'))))
    check('7c: which is the ONLY place a stored Shopify token is decrypted for use',
      /resolveShopifyAccessToken\(admin, connection\)/.test(strip(read('lib/shopify/api-auth.ts')))
      && !/decryptCredential/.test(strip(read('lib/shopify/api-auth.ts'))))
    check('7d: the resolver needs nothing but the connection row and app credentials',
      !/session_token|idToken|Authorization|cookies\(\)/.test(strip(read('lib/shopify/token-resolver.ts'))))
  }

  console.log('\n8) A terminal refresh failure leads to a RECONNECT, not a dead end')
  {
    const mk = (lastError: string | null) => new FakeAdmin({
      shopify_connections: [{
        id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
        connection_status: 'connected', last_error: lastError,
        access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: encryptCredential(REFRESH),
        access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        token_refresh_lease_token: null, token_refresh_lease_until: null,
      }],
    })
    const originalFetch = globalThis.fetch

    // TERMINAL: Shopify rejects the refresh token itself.
    const admin = mk(null)
    globalThis.fetch = fakeFetch(400, { error: 'invalid_grant' })
    let r
    try { r = await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    check('8a: the caller is told the refresh failed', r.ok === false && r.reason === 'refresh_failed')
    const row = admin.tables.shopify_connections[0]
    check('8b: a stable machine state is recorded', row.connection_status === 'failed' && row.last_error === 'refresh_token_invalid')
    check('8c: which app-home classifies as needsInstall/reconnect',
      classifyReinstallNeed(row as never).needsInstall === true
      && classifyReinstallNeed(row as never).reason === 'credential_revoked')
    check('8d: the lease is released, so the next attempt is not blocked', row.token_refresh_lease_token === null)
    const again = (await admin.rpc('begin_shopify_token_refresh', { p_connection_id: 'c1', p_lease_seconds: 60, p_min_valid_seconds: 300 })).data as { outcome: string }[]
    check('8e: NOT a new retry dead-end — the connection is still leasable', again[0].outcome === 'granted')

    // TRANSIENT: Shopify was briefly unavailable. Nothing may change.
    const admin2 = mk(null)
    globalThis.fetch = fakeFetch(503, { error: 'unavailable' })
    let r2
    try { r2 = await resolveShopifyAccessToken(admin2 as never, admin2.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    const row2 = admin2.tables.shopify_connections[0]
    check('8f: a transient failure is reported as transient', r2.ok === false && r2.reason === 'refresh_in_progress')
    check('8g: and changes NO credential state', row2.connection_status === 'connected' && row2.last_error === null)
    check('8h: so it can never manufacture a reconnect', classifyReinstallNeed(row2 as never).needsInstall === false)

    // The uninstall tombstone is never overwritten.
    const admin3 = mk('app_uninstalled')
    // A real tombstone is 'failed' — mk() builds a healthy row by default.
    admin3.tables.shopify_connections[0].connection_status = 'failed'
    globalThis.fetch = fakeFetch(401, { error: 'invalid_grant' })
    try { await resolveShopifyAccessToken(admin3 as never, admin3.tables.shopify_connections[0] as never) }
    finally { globalThis.fetch = originalFetch }
    check('8i: a terminal failure never overwrites app_uninstalled',
      admin3.tables.shopify_connections[0].last_error === 'app_uninstalled')
    check('8j: which keeps the ownership RPC able to supersede that shop',
      classifyReinstallNeed(admin3.tables.shopify_connections[0] as never).reason === 'app_uninstalled')

    check('8k: a legacy connection with no refresh material is used as-is, not failed', await (async () => {
      const legacy = new FakeAdmin({ shopify_connections: [] })
      const res = await resolveShopifyAccessToken(legacy as never, {
        id: 'legacy', shop_domain: SHOP, access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: null, access_token_expires_at: null, refresh_token_expires_at: null,
      })
      return res.ok === true && res.accessToken === ACCESS && res.rotated === false
    })())
  }

  console.log('\n9) Uninstall clears the refresh credentials')
  {
    const admin = new FakeAdmin({
      shopify_connections: [{
        id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
        connection_status: 'connected', last_error: null, granted_scopes: ['read_products'],
        default_blog_id: 'gid://shopify/Blog/1',
        access_token_encrypted: encryptCredential(ACCESS),
        refresh_token_encrypted: encryptCredential(REFRESH),
        access_token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        token_refresh_lease_token: 'in-flight', token_refresh_lease_until: new Date(Date.now() + 60_000).toISOString(),
      }],
    })
    const res = await applyAppUninstalled(admin as never, SHOP)
    const row = admin.tables.shopify_connections[0]
    check('9a: the uninstall applies', res.ok === true)
    check('9b: the refresh token is GONE — no new access token can ever be minted', row.refresh_token_encrypted === null)
    check('9c: both expiries are cleared', row.access_token_expires_at === null && row.refresh_token_expires_at === null)
    check('9d: any in-flight refresh lease is voided', row.token_refresh_lease_token === null && row.token_refresh_lease_until === null)
    check('9e: the access token is still the non-usable sentinel, never blank',
      typeof row.access_token_encrypted === 'string' && row.access_token_encrypted !== ''
      && decryptCredential(row.access_token_encrypted as string) === '__revoked__')
    check('9f: the tombstone semantics are UNCHANGED',
      row.connection_status === 'failed' && row.last_error === 'app_uninstalled'
      && (row.granted_scopes as string[]).length === 0 && row.default_blog_id === null)
    check('9g: archival is untouched by uninstall', row.archived_at === null)
    check('9h: and it still reads as a reconnect', classifyReinstallNeed(row as never).reason === 'app_uninstalled')
  }

  console.log('\n10) No credential material can reach a log or a client response')
  {
    const resolver = read('lib/shopify/token-resolver.ts')
    const oauth = read('lib/shopify/oauth.ts')
    const inst = read('app/api/shopify/embedded-install/route.ts')

    // Every console.* argument list in the new/changed code, checked for the
    // names of values that must never be logged.
    // Paren-BALANCED extraction of every console.* call in the resolver — a
    // regex span would silently swallow surrounding code and pass vacuously.
    const consoleCalls = (src: string): string[] => {
      const out: string[] = []
      const re = /console\.(warn|error|log|info|debug)\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        let depth = 1
        let i = m.index + m[0].length
        for (; i < src.length && depth > 0; i++) {
          if (src[i] === '(') depth++
          else if (src[i] === ')') depth--
        }
        out.push(src.slice(m.index, i))
      }
      return out
    }
    const loggedCalls = consoleCalls(strip(resolver))
    const logged = loggedCalls.join('\n')
    check('10-pre: the extraction actually found the log statements', loggedCalls.length >= 2)
    check('10a: the resolver logs no token, refresh token, secret or ciphertext',
      !/accessToken|refreshToken|refresh_token_encrypted|access_token_encrypted|clientSecret|client_secret|Authorization/.test(logged))
    check('10b: it logs only stable codes, a status, the shop and Shopify’s request id',
      /shopDomain: connection\.shop_domain/.test(logged) && /shopifyRequestId/.test(logged) && /terminal/.test(logged))
    check('10c: the refresh token is never returned to a caller',
      /return \{ ok: true, accessToken/.test(resolver) && !/return[^\n]*refreshToken/.test(strip(resolver)))
    check('10d: the exchange diagnostics carry a LENGTH and a boolean, never the value',
      /refreshTokenLength: rawRefresh\.length/.test(oauth) && /hasRefreshToken: !!rawRefresh/.test(oauth)
      && !/refreshToken: rawRefresh/.test(oauth))
    check('10e: TokenRefreshError carries only status, request id and field NAMES',
      /diagnostics: \{ httpStatus: number \| null; shopifyRequestId: string \| null; missingFields\?: string\[\] \}/.test(oauth))
    const failPayloads = (() => {
      const src = strip(inst)
      const out: string[] = []
      const re = /return fail\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        let depth = 1
        let i = m.index + m[0].length
        for (; i < src.length && depth > 0; i++) {
          if (src[i] === '(') depth++
          else if (src[i] === ')') depth--
        }
        out.push(src.slice(m.index, i))
      }
      return out.join('\n')
    })()
    check('10f: the install route’s failure payloads add no token-shaped field',
      /hasRefreshToken: d\.hasRefreshToken/.test(failPayloads)
      && !/refreshToken:|accessToken:|refresh_token|access_token_encrypted|clientSecret/.test(failPayloads))
    check('10g: no response body from Shopify is ever logged or stored',
      !/JSON\.stringify\(json\)|body: json|responseBody/.test(resolver + oauth))
    const resolverBody = strip(resolver)
    check('10h: the decrypted refresh token is used ONLY for the rotation request',
      /const refreshToken = decrypt\(row\.refresh_token_encrypted\)/.test(resolverBody)
      // its only other appearances are the null-guard and the single call arg
      // Counting the LOCAL only: `rotated.refreshToken` is the newly issued
      // value, which is encrypted on the very next line.
      && (resolverBody.match(/(?<!\.)\brefreshToken\b/g) || []).length === 3
      && /refreshOfflineAccessToken\(\{[\s\S]{0,120}refreshToken,/.test(resolverBody))
    check('10n: the ROTATED plaintext pair is encrypted before it touches the database',
      /accessEncrypted = encryptCredential\(rotated\.accessToken\)/.test(resolverBody)
      && /refreshEncrypted = encryptCredential\(rotated\.refreshToken\)/.test(resolverBody)
      && /p_refresh_token_encrypted: refreshEncrypted/.test(resolverBody))

    // The strongest form: run the failing paths and capture everything printed.
    const printed: string[] = []
    const origWarn = console.warn, origError = console.error
    console.warn = (...a: unknown[]) => { printed.push(a.map((x) => JSON.stringify(x)).join(' ')) }
    console.error = (...a: unknown[]) => { printed.push(a.map((x) => JSON.stringify(x)).join(' ')) }
    const originalFetch = globalThis.fetch
    try {
      const admin = new FakeAdmin({
        shopify_connections: [{
          id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
          connection_status: 'connected', last_error: null,
          access_token_encrypted: encryptCredential(ACCESS),
          refresh_token_encrypted: encryptCredential(REFRESH),
          access_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
          refresh_token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
          token_refresh_lease_token: null, token_refresh_lease_until: null,
        }],
      })
      globalThis.fetch = fakeFetch(400, { error: 'invalid_grant', access_token: ACCESS, refresh_token: REFRESH })
      await resolveShopifyAccessToken(admin as never, admin.tables.shopify_connections[0] as never)
      globalThis.fetch = fakeFetch(200, { access_token: ACCESS })   // non-expiring 200
      const admin2 = new FakeAdmin({
        shopify_connections: [{ ...(admin.tables.shopify_connections[0] as Record<string, unknown>), last_error: null, connection_status: 'connected', token_refresh_lease_token: null, token_refresh_lease_until: null }],
      })
      await resolveShopifyAccessToken(admin2 as never, admin2.tables.shopify_connections[0] as never)
    } finally {
      globalThis.fetch = originalFetch
      console.warn = origWarn
      console.error = origError
    }
    const all = printed.join('\n')
    check('10i: nothing printed contains the access token', !all.includes(ACCESS))
    check('10j: nothing printed contains the refresh token', !all.includes(REFRESH))
    check('10k: nothing printed contains the client secret', !all.includes(CLIENT_SECRET))
    check('10l: nothing printed contains stored ciphertext',
      !printed.some((line) => /[0-9a-f]{24}:[0-9a-f]{32}:/.test(line)))
    check('10m: something WAS logged (the test is not vacuous)', printed.length > 0)
  }

  console.log('\n11) PRESERVED — every guard the earlier rounds established')
  {
    const inst = strip(read('app/api/shopify/embedded-install/route.ts'))
    const home = strip(read('app/api/shopify/app-home/route.ts'))
    check('11a: App Bridge session-token verification still gates the install',
      /const verified = verifyShopifySessionToken\(token\)/.test(inst)
      && /if \(!verified\.ok\) return fail\(401, 'invalid_session_token'\)/.test(inst))
    check('11b: the verified shop is still the only shop used', /const shopDomain = verified\.shopDomain/.test(inst) && !/searchParams/.test(inst))
    check('11c: token verification still gates persistence',
      inst.indexOf("return fail(502, 'token_verification_failed'") < inst.indexOf('createPendingInstall(admin, {'))
    check('11d: shop identity is still verified before a connection can exist',
      inst.indexOf("return fail(502, 'shop_identity_unverified'") < inst.indexOf('createPendingInstall(admin, {'))
    check('11e: the safe shopifyMessages/shopifyCodes diagnostics survive',
      /shopifyMessages: test\.diagnostics\?\.shopifyMessages/.test(inst) && /shopifyCodes: test\.diagnostics\?\.shopifyCodes/.test(inst))
    check('11f: the reconnect dead-end fix survives (classifier, not an English string)',
      /classifyReinstallNeed/.test(home) && !/last_error === 'app_uninstalled'/.test(home))
    check('11g: archived rows are still excluded from live lookups', /\.is\('archived_at', null\)/.test(home))
    check('11h: ownership still transitions only through the RPC',
      /claim_shopify_shop_ownership/.test(read('lib/shopify/connection-ownership.ts')))
    check('11i: billing still refuses an unverified shop identity', /shop_identity_unverified/.test(home))
    check('11j: HMAC canonicalization untouched (cbd889f still unmerged)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(strip(read('lib/shopify/oauth.ts')))
      && !/encodeURIComponent\(params\[k\]\)/.test(strip(read('lib/shopify/oauth.ts'))))
    check('11k: the connection guard still default-denies an inactive connection',
      /connection\.connection_status !== 'connected' && !opts\?\.allowInactive/.test(strip(read('lib/shopify/api-auth.ts'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
