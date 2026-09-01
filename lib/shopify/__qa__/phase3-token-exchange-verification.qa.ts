/**
 * Production failure — reinstall reaches embedded-install and is rejected with
 * {"error":"token_verification_failed"}, with no further detail in Vercel.
 *
 * WHAT THIS PASS ESTABLISHES.
 *
 * (a) The raw-vs-encrypted hypothesis is DISPROVEN, from the real signatures:
 *     ShopifyCredentials.accessToken is documented "plaintext, decrypted
 *     server-side at call time"; graphql() puts creds.accessToken directly into
 *     the X-Shopify-Access-Token header; and embedded-install passes
 *     exchanged.accessToken — the RAW token straight from the exchange, before
 *     encryptCredential is ever called. The contract matches at every hop. The
 *     encrypted form is only ever handed to createPendingInstall. Tests 1-2
 *     pin this both ways, so a future edit that passes ciphertext to the
 *     verifier fails loudly instead of silently producing a 401.
 *
 * (b) The failure surface is enumerated exactly. testShopifyConnection returns
 *     ok:false in only four ways:
 *       1. the `{ shop { … } }` query throws  -> invalid_token | permission_error
 *       2. it returns no shop.name            -> permission_error
 *       3. getGrantedScopes cannot read
 *          currentAppInstallation.accessScopes -> scopesReadable:false
 *          -> classifyConnection -> permission_error -> ok:false
 *       4. (missing_scopes and api_version_fallback are ok:TRUE, so neither
 *          can be the cause)
 *     Case 3 is a SEPARATE query surface from case 1: a token that reads `shop`
 *     perfectly can still fail here, and the old code swallowed the reason
 *     entirely (`catch { readable:false }`), which is why production could not
 *     distinguish it from a dead token.
 *
 * (c) WHAT IT DOES NOT ESTABLISH: which of 1/2/3 is actually happening on the
 *     live store. That needs either live Shopify credentials (egress to
 *     Shopify is blocked from this environment) or the diagnostics below in
 *     production. No root cause is asserted here beyond (a).
 *
 * The fail-closed gate is UNCHANGED — verification and shop_gid must both
 * succeed before any pending install or connection exists.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-token-exchange-verification.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { ShopifyClientError, testShopifyConnection, getGrantedScopes, getShopIdentity, sanitizeShopifyMessage, extractShopifyErrorDetail } from '../client'
import { encryptCredential, isCredentialsCryptoConfigured } from '@/lib/security/credentials-crypto'
import { SHOPIFY_API_VERSION } from '../constants'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'go-top-seo-test.myshopify.com'
const RAW_TOKEN = 'shpat_raw_offline_token_value'

/** Captures exactly what reaches Shopify, so the header can be asserted. */
type StubResponse = { status: number; body: unknown; headers?: Record<string, string> }
function captureFetch(handler: (url: string, init: RequestInit) => StubResponse) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit })
    const r = handler(String(url), init as RequestInit)
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (k: string) => (r.headers ?? {})[k.toLowerCase()] ?? null },
      json: async () => r.body,
    }
  }) as unknown as typeof fetch
  return { impl, calls }
}
const okShop = { data: { shop: { name: 'Go Top SEO Test', myshopifyDomain: SHOP, primaryDomain: { host: SHOP } } } }
const okScopes = { data: { currentAppInstallation: { accessScopes: [{ handle: 'read_products' }, { handle: 'read_content' }, { handle: 'write_content' }] } } }

async function main() {
  console.log('Token-exchange verification QA\n')
  const realFetch = globalThis.fetch

  console.log('1) CONTRACT — the verifier receives the RAW token and sends it as-is')
  {
    const { impl, calls } = captureFetch((url): StubResponse =>
      url.includes('currentAppInstallation') ? { status: 200, body: okScopes } : { status: 200, body: okShop })
    // graphql() bodies differ, not the URL — dispatch on the query instead.
    const { impl: impl2, calls: calls2 } = captureFetch((_u, init): StubResponse => {
      const q = String((init as { body?: string }).body || '')
      return { status: 200, body: q.includes('currentAppInstallation') ? okScopes : okShop, headers: { 'x-shopify-api-version': SHOPIFY_API_VERSION } }
    })
    void impl; void calls
    globalThis.fetch = impl2
    const res = await testShopifyConnection({ shopDomain: SHOP, accessToken: RAW_TOKEN, apiVersion: SHOPIFY_API_VERSION })
    globalThis.fetch = realFetch

    check('1a: a valid RAW token verifies successfully', res.ok === true)
    const hdr = (calls2[0].init.headers as Record<string, string>)['X-Shopify-Access-Token']
    check('1b: the token is sent verbatim in X-Shopify-Access-Token', hdr === RAW_TOKEN)
    check('1c: it is NOT encrypted, wrapped or prefixed on the way out', !hdr.includes(':'))
    check('1d: the request targets the shop\'s Admin GraphQL endpoint',
      calls2[0].url === `https://${SHOP}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`)
    check('1e: the pinned API version is in the path', calls2[0].url.includes(`/api/${SHOPIFY_API_VERSION}/`))
  }

  console.log('\n2) CONTRACT — passing ENCRYPTED ciphertext instead of the raw token MUST fail')
  {
    if (!isCredentialsCryptoConfigured()) {
      process.env.CREDENTIALS_ENC_KEY ||= 'a'.repeat(64)
    }
    let ciphertext: string
    try { ciphertext = encryptCredential(RAW_TOKEN) } catch { ciphertext = 'aa:bb:cc' }
    check('2a: ciphertext is structurally different from the raw token (iv:tag:ciphertext)',
      ciphertext !== RAW_TOKEN && ciphertext.split(':').length === 3)

    // Shopify answers 401 for a token it does not recognise — which is exactly
    // what it would do if ciphertext were ever sent by mistake.
    const { impl } = captureFetch((_u, init): StubResponse => {
      const sent = (init.headers as Record<string, string>)['X-Shopify-Access-Token']
      return sent === RAW_TOKEN
        ? { status: 200, body: okShop, headers: { 'x-shopify-api-version': SHOPIFY_API_VERSION } }
        : { status: 401, body: { errors: 'Unauthorized' }, headers: { 'x-request-id': 'req-abc-123' } }
    })
    globalThis.fetch = impl
    const res = await testShopifyConnection({ shopDomain: SHOP, accessToken: ciphertext, apiVersion: SHOPIFY_API_VERSION })
    globalThis.fetch = realFetch

    check('2b: sending ciphertext fails verification (a raw/encrypted swap can never pass silently)', res.ok === false)
    check('2c: it is classified as invalid_token', res.status === 'invalid_token')
    check('2d: the diagnostic names the shop_query stage', res.diagnostics?.stage === 'shop_query')
    check('2e: it carries Shopify\'s HTTP status', res.diagnostics?.httpStatus === 401)
    check('2f: and Shopify\'s opaque request id for correlation', res.diagnostics?.requestId === 'req-abc-123')
  }

  console.log('\n3) The access-scopes stage is a SEPARATE failure surface from the shop query')
  {
    // The shop query succeeds; only currentAppInstallation is refused. Before
    // this pass that produced a bare ok:false with no way to tell it apart.
    const { impl } = captureFetch((_u, init): StubResponse => {
      const q = String((init as { body?: string }).body || '')
      return q.includes('currentAppInstallation')
        ? { status: 403, body: { errors: 'Access denied' }, headers: { 'x-request-id': 'req-scopes-9' } }
        : { status: 200, body: okShop, headers: { 'x-shopify-api-version': SHOPIFY_API_VERSION } }
    })
    globalThis.fetch = impl
    const res = await testShopifyConnection({ shopDomain: SHOP, accessToken: RAW_TOKEN, apiVersion: SHOPIFY_API_VERSION })
    globalThis.fetch = realFetch

    check('3a: a readable shop + unreadable scopes still yields ok:false', res.ok === false)
    check('3b: classified permission_error, NOT invalid_token', res.status === 'permission_error')
    check('3c: the diagnostic names the access_scopes stage — the distinction production lacked',
      res.diagnostics?.stage === 'access_scopes')
    check('3d: with the HTTP status from that specific call', res.diagnostics?.httpStatus === 403)
    check('3e: and its own Shopify request id', res.diagnostics?.requestId === 'req-scopes-9')
  }

  console.log('\n4) getGrantedScopes no longer swallows the reason')
  {
    const { impl } = captureFetch((): StubResponse => ({ status: 401, body: { errors: 'Unauthorized' }, headers: { 'x-request-id': 'req-gs-1' } }))
    globalThis.fetch = impl
    const g = await getGrantedScopes({ shopDomain: SHOP, accessToken: RAW_TOKEN, apiVersion: SHOPIFY_API_VERSION })
    globalThis.fetch = realFetch
    check('4a: readable is false', g.readable === false)
    check('4b: the failure kind is reported', g.failure?.kind === 'invalid_token')
    check('4c: with the HTTP status', g.failure?.status === 401)
    check('4d: and the request id', g.failure?.requestId === 'req-gs-1')
  }

  console.log('\n5) ShopifyClientError carries safe correlation metadata')
  {
    const e = new ShopifyClientError('invalid_token', 'nope', { status: 403, requestId: 'r-1' })
    check('5a: status is retained', e.status === 403)
    check('5b: requestId is retained', e.requestId === 'r-1')
    check('5c: it is still a plain Error with a kind', e instanceof Error && e.kind === 'invalid_token')
  }

  console.log('\n6) Shop identity is resolved from the same raw token, against the same shop')
  {
    const { impl, calls } = captureFetch((): StubResponse => ({
      status: 200,
      body: { data: { shop: { id: 'gid://shopify/Shop/778', myshopifyDomain: SHOP } } },
      headers: { 'x-shopify-api-version': SHOPIFY_API_VERSION },
    }))
    globalThis.fetch = impl
    const id = await getShopIdentity({ shopDomain: SHOP, accessToken: RAW_TOKEN, apiVersion: SHOPIFY_API_VERSION })
    globalThis.fetch = realFetch
    check('6a: identity resolves with the RAW token', id?.shopGid === 'gid://shopify/Shop/778')
    check('6b: the returned domain matches the requested shop', id?.myshopifyDomain === SHOP)
    check('6c: it used the same header and endpoint',
      (calls[0].init.headers as Record<string, string>)['X-Shopify-Access-Token'] === RAW_TOKEN
      && calls[0].url.startsWith(`https://${SHOP}/admin/api/`))
  }

  console.log('\n7) embedded-install: the FAIL-CLOSED gate is unchanged')
  {
    const src = strip(read('app/api/shopify/embedded-install/route.ts'))
    const testGuard = src.indexOf("return fail(502, 'token_verification_failed'")
    const gidGuard = src.indexOf("return fail(502, 'shop_identity_unverified'")
    const pending = src.indexOf('createPendingInstall(admin, {')
    check('7a: verification failure still aborts', testGuard !== -1)
    check('7b: a missing shop_gid still aborts', gidGuard !== -1)
    check('7c: BOTH still run before any pending install exists',
      testGuard < pending && gidGuard < pending)
    check('7d: the raw exchanged token is what gets verified',
      /accessToken: exchanged\.accessToken/.test(src))
    check('7e: only the ENCRYPTED form is ever persisted',
      /access_token_encrypted: tokenEncrypted/.test(src) && /encryptCredential\(exchanged\.accessToken\)/.test(src))
    check('7f: the connected-shop short-circuit is untouched', /alreadyConnected: true/.test(src))
  }

  console.log('\n8) Diagnostics are SAFE — no secret can reach a log')
  {
    const src = read('app/api/shopify/embedded-install/route.ts')
    const logCalls = (strip(src).match(/console\.\w+\([^\n]*/g) || [])
    const forbidden = /sessionToken|accessToken|clientSecret|access_token_encrypted|tokenEncrypted|authorization|cookie|Bearer|exchanged\.|creds\b|\.body\b/i
    for (const c of logCalls) {
      check(`8a: log call carries no secret-bearing value — ${c.slice(0, 46)}…`, !forbidden.test(c))
    }
    const failFn = src.slice(src.indexOf('function fail('), src.indexOf('export async function POST'))
    check('8b: fail() logs only reason + the caller-supplied diagnostic object',
      /route: 'embedded_install', reason, \.\.\.\(diag \?\? \{\}\)/.test(failFn))
    // Every field actually passed as a diagnostic must be on the allowed list.
    const diagKeys = [...src.matchAll(/fail\(\d+, '[a-z_]+', \{([\s\S]*?)\}\)/g)]
      .flatMap((m) => [...m[1].matchAll(/^\s*(\w+):/gm)].map((k) => k[1]))
    const ALLOWED = new Set([
      'stage', 'kind', 'httpStatus', 'shopifyRequestId', 'apiVersionRequested', 'apiVersionActual',
      'apiVersion', 'shopDomain', 'tokenAuthenticates',
      // token-exchange response SHAPE — statuses, booleans, lengths, a fixed
      // classification label, and public scope NAMES. No token bytes.
      'exchangeHttpStatus', 'exchangeRequestId', 'hasAccessToken', 'tokenType', 'tokenLength',
      'scopes', 'scopeCount', 'associatedUserScope', 'expiresIn', 'requestedTokenType',
      // Shopify's own structured error reason, sanitized and capped in client.ts.
      'shopifyMessages', 'shopifyCodes',
      // EXPIRING-grant shape. `requestedExpiring` and `hasRefreshToken` are
      // booleans, `refreshTokenLength` and `refreshTokenExpiresIn` are numbers,
      // and `missingFields` is a list of Shopify's own PUBLIC field names —
      // none of them is, or is derived from, a token value.
      'requestedExpiring', 'hasRefreshToken', 'refreshTokenLength', 'refreshTokenExpiresIn', 'missingFields',
    ])
    const bad = [...new Set(diagKeys)].filter((k) => !ALLOWED.has(k))
    check('8c: every diagnostic field is on the safe allow-list (stage, kind, status, api version, shop domain, request id)',
      bad.length === 0, bad.join(', '))
    check('8d: the response body to the client is still just a stable reason code',
      /NextResponse\.json\(\{ error: reason \}, \{ status \}\)/.test(src))
  }

  console.log('\n9) PRESERVED — PR #37 ownership, PR #38 reinstall, App Bridge, CSP, HMAC, billing identity guard')
  {
    check('9a: ownership RPC still the single transition point',
      /claim_shopify_shop_ownership/.test(read('lib/shopify/connection-ownership.ts')))
    check('9b: archived rows still excluded from live lookups',
      /\.is\('archived_at', null\)/.test(read('app/api/shopify/app-home/route.ts')))
    // PR #38 detected the reinstall case with one exact string; that string was
    // overwritable and dead-ended production, so it is now the shared classifier
    // in lib/shopify/connection-health.ts. The GUARANTEE under test is unchanged:
    // app-home still returns needsInstall + a stable reason for a store whose
    // credential can no longer be used.
    check('9c: the reinstall (needsInstall) entry from PR #38 is intact',
      /needsInstall: true,\s*\n\s*needsInstallReason: reinstall\.reason/.test(read('app/api/shopify/app-home/route.ts'))
      && /classifyReinstallNeed/.test(read('app/api/shopify/app-home/route.ts')))
    check('9d: App Bridge is still a real synchronous script tag',
      /<script src="https:\/\/cdn\.shopify\.com\/shopifycloud\/app-bridge\.js"/.test(read('app/shopify/app/layout.tsx')))
    check('9e: frame-ancestors CSP still scoped to /shopify/app',
      /source:\s*'\/shopify\/app\/:path\*'/.test(read('next.config.ts')))
    const oauth = strip(read('lib/shopify/oauth.ts'))
    check('9f: HMAC canonicalization unchanged (cbd889f still excluded)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(oauth) && !/encodeURIComponent\(params\[k\]\)/.test(oauth))
    check('9g: billing still refuses an unverified shop identity',
      /shop_identity_unverified/.test(read('app/api/shopify/app-home/route.ts')))
  }

  console.log('\n10) Token-exchange response diagnostics — shape only, never material')
  {
    const { exchangeSessionTokenForOfflineToken, TokenExchangeError } = await import('../oauth')
    const OFFLINE = 'shpat_' + 'f'.repeat(32)
    const realFetch = globalThis.fetch

    const stub = (status: number, body: unknown, reqId = 'req-x-1') => (async () => ({
      ok: status >= 200 && status < 300, status,
      headers: { get: (k: string) => (k.toLowerCase() === 'x-request-id' ? reqId : null) },
      json: async () => body,
    })) as unknown as typeof fetch

    // Every fixture below is now an EXPIRING grant: Shopify no longer accepts
    // non-expiring Admin API tokens, so the exchange REQUIRES access_token +
    // refresh_token + expires_in + refresh_token_expires_in and rejects
    // anything less (proved separately in
    // lib/shopify/__qa__/phase3-expiring-offline-tokens.qa.ts). The diagnostics
    // guarantees under test here are unchanged.
    const REFRESH = 'shpr_' + 'e'.repeat(32)
    const expiring = (over: Record<string, unknown>) => ({
      access_token: OFFLINE, refresh_token: REFRESH, expires_in: 86400, refresh_token_expires_in: 2592000, ...over,
    })

    // Happy path: the diagnostics describe the response without quoting it.
    const okRes = await exchangeSessionTokenForOfflineToken({
      shop: SHOP, sessionToken: 'sess.tok', clientId: 'id', clientSecret: 'sec',
      fetchImpl: stub(200, expiring({ scope: 'read_products,read_content,write_content' })),
    })
    const d = okRes.diagnostics
    check('10a: HTTP status recorded', d.httpStatus === 200)
    check('10b: Shopify request id recorded', d.shopifyRequestId === 'req-x-1')
    check('10c: presence of an access_token recorded as a boolean', d.hasAccessToken === true)
    check('10d: token LENGTH recorded, not the token', d.tokenLength === OFFLINE.length)
    check('10e: token classified as OFFLINE from its documented prefix', d.tokenType === 'offline')
    check('10f: scope NAMES recorded', d.scopes.join(',') === 'read_products,read_content,write_content')
    check('10g: scope count recorded', d.scopeCount === 3)
    check('10h: requested token type echoed for comparison',
      d.requestedTokenType === 'urn:shopify:params:oauth:token-type:offline-access-token')

    // An ONLINE token returned despite requesting offline — the mismatch case.
    const onlineRes = await exchangeSessionTokenForOfflineToken({
      shop: SHOP, sessionToken: 's', clientId: 'i', clientSecret: 'x',
      fetchImpl: stub(200, expiring({ access_token: 'shpca_' + 'a'.repeat(32), scope: 'read_products', associated_user_scope: 'read_products', expires_in: 86399 })),
    })
    check('10i: an online token is classified as such (offline/online mismatch is visible)',
      onlineRes.diagnostics.tokenType === 'online')
    check('10j: associated_user_scope is surfaced when present', onlineRes.diagnostics.associatedUserScope === 'read_products')
    check('10k: expires_in is surfaced when present', onlineRes.diagnostics.expiresIn === 86399)

    // ZERO granted scopes — the state that makes the Admin API 403 every query.
    const noScope = await exchangeSessionTokenForOfflineToken({
      shop: SHOP, sessionToken: 's', clientId: 'i', clientSecret: 'x',
      fetchImpl: stub(200, expiring({ scope: '' })),
    })
    check('10l: an empty scope grant is visible as scopeCount 0', noScope.diagnostics.scopeCount === 0)
    check('10l2: the expiring-grant shape is reported too, without any value',
      okRes.diagnostics.requestedExpiring === true
      && okRes.diagnostics.hasRefreshToken === true
      && okRes.diagnostics.refreshTokenLength === REFRESH.length
      && okRes.diagnostics.refreshTokenExpiresIn === 2592000
      && !JSON.stringify(okRes.diagnostics).includes(REFRESH))

    // Failure paths still carry diagnostics.
    let thrown: unknown = null
    try {
      await exchangeSessionTokenForOfflineToken({ shop: SHOP, sessionToken: 's', clientId: 'i', clientSecret: 'x', fetchImpl: stub(400, { error: 'invalid_subject_token' }, 'req-fail-2') })
    } catch (e) { thrown = e }
    check('10m: a non-2xx exchange still throws (fail-closed unchanged)', thrown instanceof TokenExchangeError)
    check('10n: with the HTTP status and request id attached',
      (thrown as InstanceType<typeof TokenExchangeError>).diagnostics.httpStatus === 400
      && (thrown as InstanceType<typeof TokenExchangeError>).diagnostics.shopifyRequestId === 'req-fail-2')

    let thrown2: unknown = null
    try {
      await exchangeSessionTokenForOfflineToken({ shop: SHOP, sessionToken: 's', clientId: 'i', clientSecret: 'x', fetchImpl: stub(200, { scope: 'read_products' }) })
    } catch (e) { thrown2 = e }
    // The PRODUCTION failure: a 200 with a perfectly good offline token and no
    // refresh material. Refused, with the missing PUBLIC field names reported.
    let thrown3: unknown = null
    try {
      await exchangeSessionTokenForOfflineToken({ shop: SHOP, sessionToken: 's', clientId: 'i', clientSecret: 'x', fetchImpl: stub(200, { access_token: OFFLINE, scope: 'read_products' }) })
    } catch (e) { thrown3 = e }
    check('10q: a NON-EXPIRING 200 is refused', thrown3 instanceof TokenExchangeError
      && (thrown3 as Error).message === 'token_exchange_not_expiring')
    // refresh_token_expires_in is OPTIONAL by Shopify's contract, so it is not
    // listed as missing — only the fields an expiring grant must always carry.
    check('10r: naming the missing REQUIRED fields, and nothing from the body',
      JSON.stringify((thrown3 as InstanceType<typeof TokenExchangeError>).diagnostics.missingFields)
        === JSON.stringify(['refresh_token', 'expires_in'])
      && !JSON.stringify((thrown3 as InstanceType<typeof TokenExchangeError>).diagnostics).includes(OFFLINE))
    check('10o: a 200 with no access_token still throws', thrown2 instanceof TokenExchangeError)
    check('10p: reporting hasAccessToken:false and tokenType absent',
      (thrown2 as InstanceType<typeof TokenExchangeError>).diagnostics.hasAccessToken === false
      && (thrown2 as InstanceType<typeof TokenExchangeError>).diagnostics.tokenType === 'absent')

    globalThis.fetch = realFetch
  }

  console.log('\n11) NO credential material can appear in any diagnostic value')
  {
    const { exchangeSessionTokenForOfflineToken } = await import('../oauth')
    const SECRET = 'super-secret-client-secret-value'
    const SESSION = 'eyJhbGciOiJIUzI1NiJ9.sessionpayload.signature'
    const TOKEN = 'shpat_' + 'd'.repeat(40)
    // An EXPIRING grant, so the refresh token is a SECOND secret this must
    // prove cannot leak.
    const REFRESH_TOKEN = 'shpr_' + 'c'.repeat(40)
    const stub = (async () => ({
      ok: true, status: 200,
      headers: { get: () => 'req-z' },
      json: async () => ({
        access_token: TOKEN, refresh_token: REFRESH_TOKEN,
        expires_in: 86400, refresh_token_expires_in: 2592000, scope: 'read_products',
      }),
    })) as unknown as typeof fetch

    const res = await exchangeSessionTokenForOfflineToken({
      shop: SHOP, sessionToken: SESSION, clientId: 'client-id-abc', clientSecret: SECRET, fetchImpl: stub,
    })
    const serialized = JSON.stringify(res.diagnostics)
    for (const [label, secret] of [
      ['the access token', TOKEN],
      ['the session token', SESSION],
      ['the client secret', SECRET],
      ['the REFRESH token', REFRESH_TOKEN],
    ] as [string, string][]) {
      check(`11: ${label} never appears in the diagnostics object`, !serialized.includes(secret))
    }
    // Not even a fragment: a prefix long enough to be identifying must be absent.
    check('11: no 12-character fragment of the access token leaks', !serialized.includes(TOKEN.slice(0, 12)))
    check('11: no 12-character fragment of the refresh token leaks', !serialized.includes(REFRESH_TOKEN.slice(0, 12)))
    check('11: the classification is a fixed label, not bytes taken from the token',
      /"tokenType":"(offline|online|app_secret_shaped|unrecognised|absent)"/.test(serialized))
    check('11: only shape fields are present',
      Object.keys(res.diagnostics).every((k) => [
        'httpStatus', 'shopifyRequestId', 'hasAccessToken', 'tokenLength', 'tokenType',
        'scopes', 'scopeCount', 'associatedUserScope', 'expiresIn', 'requestedTokenType',
        'requestedExpiring', 'hasRefreshToken', 'refreshTokenLength', 'refreshTokenExpiresIn',
      ].includes(k)))
    check('11: the refresh token is reported as a LENGTH and a boolean only',
      res.diagnostics.hasRefreshToken === true && res.diagnostics.refreshTokenLength === REFRESH_TOKEN.length)

    // The route must never hand a raw credential to fail().
    const route = strip(read('app/api/shopify/embedded-install/route.ts'))
    // Assert the real property: inside every fail(...) diagnostic OBJECT, no
    // field's VALUE references a token/secret. (The route legitimately uses
    // exchanged.accessToken once, to build `creds` for the Admin API call —
    // that is the whole point of the token and is not a log.)
    // Brace-balanced extraction — a lazy regex would run past the block and
    // swallow unrelated code (including the legitimate `creds` construction).
    const diagObjects: string[] = []
    for (const m of route.matchAll(/fail\(\d+, '[a-z_]+', \{/g)) {
      let depth = 1
      let i = m.index! + m[0].length
      const start = i
      while (i < route.length && depth > 0) {
        if (route[i] === '{') depth++
        else if (route[i] === '}') depth--
        i++
      }
      diagObjects.push(route.slice(start, i - 1))
    }
    check('11: at least one diagnostic object was found to inspect', diagObjects.length > 0)
    const leaky = diagObjects.filter((o) => /accessToken|sessionToken|clientSecret|tokenEncrypted|authHeader|\btoken\b\s*[,}]/.test(o))
    check('11: no fail() diagnostic field carries a token or secret value', leaky.length === 0,
      leaky.join(' | ').slice(0, 120))
    check('11: the route logs exchanged.diagnostics fields only, never the exchange result itself',
      !/\.\.\.exchanged\b/.test(route) && !/exchanged,/.test(route))
  }

  console.log('\n12) Shopify\'s structured 403 reason is captured, not discarded')
  {
    const realFetch = globalThis.fetch
    // A 403 whose body names the missing access — the case production hit.
    const { impl } = captureFetch((): StubResponse => ({
      status: 403,
      // A representative Shopify 403 body. The wording is a FIXTURE only — it
      // asserts nothing about which scope the live store is actually missing.
      body: { errors: [{ message: 'Access denied for shop field.', extensions: { code: 'ACCESS_DENIED' } }] },
      headers: { 'x-request-id': 'req-403-abc' },
    }))
    globalThis.fetch = impl
    const res = await testShopifyConnection({ shopDomain: SHOP, accessToken: RAW_TOKEN, apiVersion: SHOPIFY_API_VERSION })
    globalThis.fetch = realFetch

    check('12a: still fails closed', res.ok === false)
    check('12b: HTTP 403 recorded', res.diagnostics?.httpStatus === 403)
    check('12c: Shopify\'s message is captured', (res.diagnostics?.shopifyMessages ?? [])[0] === 'Access denied for shop field.')
    check('12d: the GraphQL extensions.code is captured', (res.diagnostics?.shopifyCodes ?? [])[0] === 'ACCESS_DENIED')
    check('12e: the request id is still captured', res.diagnostics?.requestId === 'req-403-abc')
  }

  console.log('\n13) Body parsing is safe, capped, and never returns the body')
  {
    // Top-level string form.
    const strForm = await extractShopifyErrorDetail({ text: async () => JSON.stringify({ errors: '[API] Invalid API key or access token' }) })
    check('13a: a top-level `errors` string is extracted', strForm.messages[0] === '[API] Invalid API key or access token')

    // Object-map form.
    const objForm = await extractShopifyErrorDetail({ text: async () => JSON.stringify({ errors: { shop: 'not permitted' } }) })
    check('13b: an object-map `errors` is extracted', objForm.messages[0] === 'not permitted')

    // Non-JSON must not throw.
    const html = await extractShopifyErrorDetail({ text: async () => '<html>500</html>' })
    check('13c: a non-JSON body yields nothing and does not throw', html.messages.length === 0 && html.codes.length === 0)

    // Caps.
    const many = await extractShopifyErrorDetail({ text: async () => JSON.stringify({ errors: Array.from({ length: 20 }, (_, i) => ({ message: `e${i}`, extensions: { code: `C${i}` } })) }) })
    check('13d: at most 3 messages are kept', many.messages.length <= 3)
    check('13e: at most 3 codes are kept', many.codes.length <= 3)

    const long = await extractShopifyErrorDetail({ text: async () => JSON.stringify({ errors: 'x'.repeat(5000) }) })
    check('13f: a single message is capped to 200 chars', (long.messages[0] ?? '').length <= 200)

    // A giant body is truncated before parsing (so it fails to parse, safely).
    const giant = await extractShopifyErrorDetail({ text: async () => '{"errors":"' + 'y'.repeat(20000) + '"}' })
    check('13g: an oversized body is truncated and yields nothing rather than being logged', giant.messages.length === 0)
  }

  console.log('\n14) SANITIZER — no credential shape can survive into a message')
  {
    const SECRETS: [string, string][] = [
      ['Shopify offline token', 'shpat_' + 'a'.repeat(32)],
      ['Shopify online token', 'shpca_' + 'b'.repeat(32)],
      ['Shopify app secret', 'shpss_' + 'c'.repeat(32)],
      ['bearer header', 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature'],
      ['JWT session token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlAAAA'],
      ['long hex secret', 'd'.repeat(48)],
    ]
    for (const [label, secret] of SECRETS) {
      const out = sanitizeShopifyMessage(`Shopify said: ${secret} was rejected`)
      check(`14: ${label} is redacted from a Shopify message`, !out.includes(secret))
      check(`14: ${label} — a 12-char fragment does not survive either`, !out.includes(secret.slice(0, 12)))
    }
    check('14: ordinary Shopify text is preserved so the reason stays readable',
      sanitizeShopifyMessage('Access denied for shop field.') === 'Access denied for shop field.')

    // End-to-end: a 403 body echoing a token must not reach the diagnostics.
    const realFetch = globalThis.fetch
    const LEAK = 'shpat_' + 'e'.repeat(32)
    const { impl } = captureFetch((): StubResponse => ({
      status: 403, body: { errors: [{ message: `token ${LEAK} denied` }] }, headers: { 'x-request-id': 'r' },
    }))
    globalThis.fetch = impl
    const res = await testShopifyConnection({ shopDomain: SHOP, accessToken: RAW_TOKEN, apiVersion: SHOPIFY_API_VERSION })
    globalThis.fetch = realFetch
    const serialized = JSON.stringify(res.diagnostics)
    check('14: a token echoed by Shopify never reaches the diagnostics', !serialized.includes(LEAK))
    check('14: it is replaced by a redaction marker', serialized.includes('[redacted-token]'))
  }

  console.log('\n15) Fail-closed behaviour is unchanged by the added detail')
  {
    const route = strip(read('app/api/shopify/embedded-install/route.ts'))
    const testGuard = route.indexOf("return fail(502, 'token_verification_failed'")
    const gidGuard = route.indexOf("return fail(502, 'shop_identity_unverified'")
    const pending = route.indexOf('createPendingInstall(admin, {')
    check('15a: verification failure still aborts before any pending install',
      testGuard !== -1 && pending !== -1 && testGuard < pending)
    check('15b: a missing shop_gid still aborts before any pending install',
      gidGuard !== -1 && gidGuard < pending)
    const client = read('lib/shopify/client.ts')
    check('15c: 401/403 still throw invalid_token (classification unchanged)',
      /if \(res\.status === 401 \|\| res\.status === 403\) \{\s*\n\s*throw new ShopifyClientError\('invalid_token'/.test(client))
    check('15d: the body is read ONLY on a non-2xx, so the 2xx path is untouched',
      /if \(res\.status < 200 \|\| res\.status >= 300\) \{\s*\n\s*detail = await extractShopifyErrorDetail/.test(client))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
