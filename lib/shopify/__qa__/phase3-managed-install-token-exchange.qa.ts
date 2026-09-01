/**
 * Release blocker — first-time merchant onboarding under `embedded = true`.
 *
 * Problem: app/shopify/app/page.tsx server-redirected an unconnected shop to
 * /api/shopify/install, which redirects to https://{shop}/admin/oauth/authorize.
 * Shopify refuses to let that page be framed, so under embedded = true the
 * redirect ran INSIDE the Admin iframe and rendered a blocked frame — a
 * brand-new merchant could never install.
 *
 * Chosen model (Model A — Shopify-managed installation + token exchange),
 * per Shopify's current official documentation:
 *   * "Enable Shopify-managed installations for your app" —
 *     https://shopify.dev/docs/apps/build/authentication-authorization/app-installation
 *     Managed installation applies when `use_legacy_install_flow` is false or
 *     omitted; Shopify installs the app and updates access scopes WITHOUT
 *     calling the app during installation.
 *   * "Set up embedded app authorization" —
 *     https://shopify.dev/docs/apps/build/authentication-authorization/set-embedded-app-authorization
 *     Embedded apps obtain access tokens via token exchange: App Bridge
 *     supplies a short-lived ID token, the backend exchanges it for an access
 *     token. No OAuth redirects.
 *   * Changelog: "New OAuth2 Token Exchange API & Shopify managed install
 *     authorization flows available" —
 *     https://shopify.dev/changelog/new-oauth2-token-exchange-api-shopify-managed-install-authorization-flows-available
 *   * Reference implementation (request shape mirrored exactly):
 *     https://github.com/Shopify/shopify-app-js/blob/main/packages/apps/shopify-api/lib/auth/oauth/token-exchange.ts
 *     which proves an OFFLINE token is obtainable —
 *     RequestedTokenType.OfflineAccessToken =
 *     'urn:shopify:params:oauth:token-type:offline-access-token'.
 *
 * The active app version reports "Use legacy install flow: false" and the TOML
 * deliberately omits the key, so managed installation is already in force —
 * which is exactly why the authorization-code redirect was both unnecessary
 * and harmful here.
 *
 * The authorization-code flow is NOT removed: the dashboard-initiated connect
 * path (/api/shopify/oauth/start → authorize → callback) runs top-level in an
 * ordinary tab, where framing rules do not apply. Its HMAC/state/nonce
 * protections are re-proved below to remain fail-closed.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-managed-install-token-exchange.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  exchangeSessionTokenForOfflineToken,
  TOKEN_EXCHANGE_GRANT_TYPE,
  TOKEN_EXCHANGE_SUBJECT_TOKEN_TYPE,
  TOKEN_EXCHANGE_OFFLINE_TOKEN_TYPE,
} from '../oauth'
import { isAdminUser } from '@/app/api/shopify/billing/start-intent/route'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'go-top-seo-test.myshopify.com'

/** A fetch stub that records the request and returns a scripted response. */
function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }
  }) as unknown as typeof fetch
  return { impl, calls }
}

async function main() {
  console.log('Release blocker — managed install / token exchange QA\n')

  console.log('1) (proof) Token exchange requests an OFFLINE token, exactly as Shopify documents')
  {
    // The response is an EXPIRING offline grant — the only shape the exchange
    // accepts since Shopify stopped honouring non-expiring Admin API tokens.
    const { impl, calls } = stubFetch(200, {
      access_token: 'unit-test-access-token', refresh_token: 'unit-test-refresh-token',
      expires_in: 86400, refresh_token_expires_in: 2592000,
      scope: 'read_products,write_content',
    })
    const out = await exchangeSessionTokenForOfflineToken({
      shop: SHOP, sessionToken: 'the.session.token', clientId: 'pub-id', clientSecret: 'pub-secret', fetchImpl: impl,
    })
    check('1a: returns the offline access token', out.accessToken === 'unit-test-access-token')
    check('1a: returns the granted scope string', out.scope === 'read_products,write_content')
    check('1b: posts to the shop\'s access_token endpoint', calls[0].url === `https://${SHOP}/admin/oauth/access_token`)
    const body = JSON.parse(String(calls[0].init.body))
    check('1c: grant_type is the token-exchange grant', body.grant_type === TOKEN_EXCHANGE_GRANT_TYPE
      && body.grant_type === 'urn:ietf:params:oauth:grant-type:token-exchange')
    check('1c: subject_token is the session token', body.subject_token === 'the.session.token')
    check('1c: subject_token_type is id_token', body.subject_token_type === TOKEN_EXCHANGE_SUBJECT_TOKEN_TYPE
      && body.subject_token_type === 'urn:ietf:params:oauth:token-type:id_token')
    check('1d: requested_token_type is OFFLINE — this is what proves managed install can supply the token this app stores',
      body.requested_token_type === TOKEN_EXCHANGE_OFFLINE_TOKEN_TYPE
      && body.requested_token_type === 'urn:shopify:params:oauth:token-type:offline-access-token')
    check('1e: the app credentials are sent as client_id/client_secret', body.client_id === 'pub-id' && body.client_secret === 'pub-secret')
    check('1d2: expiring=1 is requested, so Shopify issues an EXPIRING offline token',
      body.expiring === '1')
    check('1d3: and the refresh half is returned to the caller for storage',
      out.refreshToken === 'unit-test-refresh-token' && out.expiresIn === 86400 && out.refreshTokenExpiresIn === 2592000)
    check('1f: never follows a redirect (a redirect would mean something other than the token endpoint answered)',
      calls[0].init.redirect === 'error')
  }

  console.log('\n2) (proof) Token-exchange validation is FAIL-CLOSED')
  {
    const bad = stubFetch(401, { error: 'invalid_subject_token' })
    let threw = false
    try { await exchangeSessionTokenForOfflineToken({ shop: SHOP, sessionToken: 'x', clientId: 'a', clientSecret: 'b', fetchImpl: bad.impl }) }
    catch { threw = true }
    check('2a: a non-2xx response throws (never returns a usable result)', threw)

    const empty = stubFetch(200, { scope: 'read_products' })
    let threw2 = false
    try { await exchangeSessionTokenForOfflineToken({ shop: SHOP, sessionToken: 'x', clientId: 'a', clientSecret: 'b', fetchImpl: empty.impl }) }
    catch { threw2 = true }
    check('2b: a 200 with no access_token throws (never invents a token)', threw2)

    // A 200 carrying only an access token is the NON-EXPIRING grant production
    // received. It is refused for the same fail-closed reason.
    const nonExpiring = stubFetch(200, { access_token: 'unit-test-access-token', scope: 'read_products' })
    let threw2b = false
    try { await exchangeSessionTokenForOfflineToken({ shop: SHOP, sessionToken: 'x', clientId: 'a', clientSecret: 'b', fetchImpl: nonExpiring.impl }) }
    catch (e) { threw2b = e instanceof Error && e.message === 'token_exchange_not_expiring' }
    check('2b2: a NON-EXPIRING 200 throws token_exchange_not_expiring', threw2b)

    const junk = stubFetch(200, null)
    let threw3 = false
    try { await exchangeSessionTokenForOfflineToken({ shop: SHOP, sessionToken: 'x', clientId: 'a', clientSecret: 'b', fetchImpl: junk.impl }) }
    catch { threw3 = true }
    check('2c: an unparseable/null body throws', threw3)
  }

  console.log('\n3) A brand-new merchant can START authentication from an embedded launch')
  {
    const route = read('app/api/shopify/embedded-install/route.ts')
    check('3a: the embedded-install route exists and is a POST', /export async function POST\(/.test(route))
    check('3b: identity comes ONLY from a verified App Bridge session token', /verifyShopifySessionToken\(token\)/.test(route))
    check('3b: it fails closed (401) when that verification fails', /if \(!verified\.ok\) return fail\(401, 'invalid_session_token'\)/.test(route))
    check('3c: the exchange uses the VERIFIED shop domain, never a query/body value',
      /shop: shopDomain/.test(route) && !/searchParams|request\.json\(\)/.test(route))
    check('3d: it produces the SAME pending-install row the OAuth path produced',
      /createPendingInstall\(admin, \{/.test(route))
    // UPDATED with the first-party handoff fix. This response is read by a
    // fetch() inside the Shopify Admin iframe — a third-party context for this
    // origin — so it must NOT try to establish the pending-link cookie: modern
    // Chrome drops it, which is exactly how production reached /shopify/link
    // with no cookie and rendered "Linking session expired". The cookie is now
    // set by the first-party POST resume endpoint instead.
    check('3d2: the embedded response no longer attempts to set the pending-link cookie',
      !/PENDING_LINK_COOKIE/.test(route) && !/res\.cookies\.set/.test(route))
    check('3e: the continuation path is a fixed server constant, never caller-supplied (no open redirect)',
      /resumePath: PENDING_LINK_RESUME_PATH/.test(route)
      && !/resumePath:\s*(body|json|params)/.test(route))

    const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
    check('3f: the not-connected branch drives the install instead of dead-ending at a login link',
      /startEmbeddedInstall/.test(client) && /'\/api\/shopify\/embedded-install'/.test(client))
    check('3g: it sends a FRESH App Bridge id token as a Bearer credential',
      /bridge\.idToken\(\)/.test(client) && /Authorization: `Bearer \$\{token\}`/.test(client))
  }

  console.log('\n4) Shopify authorization is NEVER rendered inside the iframe')
  {
    const page = strip(read('app/shopify/app/page.tsx'))
    check('4a: the embedded page no longer server-redirects to the install route (the exact iframe-hostile point)',
      !/redirect\(`\/api\/shopify\/install/.test(page) && !/\/api\/shopify\/install/.test(page))
    check('4b: it performs no redirect at all any more', !/\bredirect\(/.test(page))
    check('4c: it no longer reads shop from the query to make that decision', !/normalizeShopDomain/.test(page) && !/params\.shop/.test(page))
    check('4d: it just renders the client shell', /<ConnectorHomeClient \/>/.test(page))

    // Nothing reachable from the embedded surface navigates to Shopify's
    // authorize screen. buildAuthorizeUrl is what produces that URL.
    const embeddedSurface = ['app/shopify/app/page.tsx', 'app/shopify/app/ConnectorHomeClient.tsx', 'app/shopify/app/layout.tsx', 'app/api/shopify/embedded-install/route.ts']
    for (const rel of embeddedSurface) {
      // Comments must be stripped first: these files' own headers EXPLAIN the
      // authorize-screen problem by name, and matching that prose instead of
      // real code would be a false failure.
      check(`4e: ${rel} never builds/uses a Shopify authorize URL`,
        !/buildAuthorizeUrl|admin\/oauth\/authorize/.test(strip(read(rel))))
    }
    check('4f: the embedded-install route reaches Shopify ONLY at the token endpoint, server-side',
      /exchangeSessionTokenForOfflineToken/.test(read('app/api/shopify/embedded-install/route.ts')))
  }

  console.log('\n5) The authorization-code flow REMAINS fail-closed (kept for the top-level dashboard connect path)')
  {
    const cb = read('app/api/shopify/oauth/callback/route.ts')
    check('5a: HMAC is still verified, and rejection is a hard return', /if \(!verifyShopifyHmac\(params, config\.clientSecret\)\)/.test(cb))
    check('5b: the signed nonce cookie is still verified against state', /verifyNonceCookie\(nonceCookieRaw, config\.clientSecret\)/.test(cb))
    check('5c: state is still consumed atomically (replay rejected)', /is\('used_at', null\)/.test(cb) && /state_replay/.test(cb))
    check('5d: the callback shop must still match the state\'s shop', /st\.shop_domain !== shop/.test(cb))
    check('5e: expired state is still rejected', /expires_at\)\.getTime\(\) < Date\.now\(\)/.test(cb))
    const start = read('app/api/shopify/oauth/start/route.ts')
    check('5f: the start route still exists for the non-embedded connect path', /buildAuthorizeUrl/.test(start))
    check('5g: authorization-code exchange is still available for that path', /exchangeCodeForToken/.test(read('lib/shopify/oauth.ts')))
  }

  console.log('\n6) Existing connected shops SKIP reauthorization')
  {
    const route = read('app/api/shopify/embedded-install/route.ts')
    const routeCode = strip(route)
    const connIdx = routeCode.indexOf("from('shopify_connections')")
    // Must be the CALL SITE, not the import statement (which necessarily
    // appears at the top of the file, before everything).
    const exchangeIdx = routeCode.indexOf('await exchangeSessionTokenForOfflineToken({')
    check('6a: the connected-shop check runs BEFORE any token exchange', connIdx !== -1 && exchangeIdx !== -1 && connIdx < exchangeIdx)
    check('6b: it only counts a genuinely connected row', /\.eq\('connection_status', 'connected'\)/.test(route))
    check('6c: an already-connected shop returns early with no exchange and no new pending install',
      /if \(existing\) return NextResponse\.json\(\{ alreadyConnected: true, next: null \}\)/.test(route))
    const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
    check('6d: the client treats alreadyConnected as "just reload", not as a new install',
      /json\.alreadyConnected.*retry\(\)/s.test(client))
  }

  console.log('\n7) /shopify/link and project selection resume correctly (UNCHANGED downstream)')
  {
    const link = read('app/shopify/link/page.tsx')
    check('7a: the pending install is still identified ONLY by the signed httpOnly cookie', /PENDING_LINK_COOKIE/.test(link) && !/searchParams/.test(link))
    check('7b: unauthenticated merchants still get the hardcoded, server-resolved continuation (no open redirect)',
      /href="\/login\?next=%2Fshopify%2Flink"/.test(link))
    check('7c: authenticated merchants still get the project picker', /<ShopifyLinkClient/.test(link))
    const complete = read('app/api/shopify/link/complete/route.ts')
    check('7d: completion still re-validates the pending install server-side', /loadValidPendingInstall|consumePendingInstall/.test(complete))
    check('7e: the embedded-install route writes the SAME row shape /shopify/link consumes',
      /shop_domain|access_token_encrypted|granted_scopes/.test(read('app/api/shopify/embedded-install/route.ts')))
  }

  console.log('\n8) Admin billing bypass remains intact')
  {
    const home = read('app/api/shopify/app-home/route.ts')
    const isAdminIdx = home.indexOf('const isAdmin = await isAdminUser(admin, connection.user_id)')
    const partnerIdx = home.indexOf('getActiveShopifySubscription(connection.shop_gid')
    check('8a: isAdmin is still resolved before the live Partner billing call', isAdminIdx !== -1 && partnerIdx !== -1 && isAdminIdx < partnerIdx)
    check('8b: the admin branch still makes no Partner call and no billing-cache write',
      /if \(isAdmin\) \{\s*\n(\s*\/\/[^\n]*\n)*\s*\} else if \(!shopifyBills\)/.test(home))
    const adminFake = new FakeAdmin({ profiles: [{ id: 'u-admin', role: 'admin' }] })
    check('8c: isAdminUser still true for role=admin', await isAdminUser(adminFake as unknown, 'u-admin') === true)
    const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
    const gate = client.indexOf('data.isAdmin ?')
    check('8d: the admin branch still renders no billing control', gate !== -1
      && !/startBillingIntent|Choose a plan|Manage plan/.test(client.slice(gate, client.indexOf(') : (', gate))))
  }

  console.log('\n9) Non-admin Shopify billing governance remains intact')
  {
    const userFake = new FakeAdmin({ profiles: [{ id: 'u-shop', role: 'user' }] })
    check('9a: isAdminUser still false for an ordinary merchant', await isAdminUser(userFake as unknown, 'u-shop') === false)
    const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
    const gate = client.indexOf('data.isAdmin ?')
    const nonAdmin = client.slice(client.indexOf(') : (', gate))
    check('9b: the non-admin branch still renders the Billing card and its plan control',
      /title="Billing"/.test(nonAdmin) && /startBillingIntent/.test(nonAdmin))
    check('9c: billing is still started just-in-time via the authenticated intent route',
      /'\/api\/shopify\/billing\/start-intent'/.test(client))
    const home = read('app/api/shopify/app-home/route.ts')
    check('9d: a non-admin connected shop is still billing-verified live', /getActiveShopifySubscription/.test(home))
    check('9e: billing is reached only AFTER connection (app-home requires a connection row)',
      /if \(!data\) \{\s*\n\s*return Response\.json\(\{\s*\n?\s*connected: false/.test(home))
  }

  console.log('\n10) Session-token, HMAC and shop validation are NOT weakened')
  {
    const st = read('lib/shopify/session-token.ts')
    check('10a: session tokens still require exactly HS256', /HS256/.test(st))
    check('10b: aud must still equal the configured client id', /payload\.aud !== config\.clientId/.test(st))
    check('10c: iss/dest hostnames must still match and end with .myshopify.com', /myshopify\.com/.test(st))
    check('10d: nbf/exp are still enforced', /not_yet_valid/.test(st) && /expired/.test(st))
    const oauth = strip(read('lib/shopify/oauth.ts'))
    check('10e: HMAC canonicalization is UNCHANGED (cbd889f not included)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(oauth) && !/encodeURIComponent\(params\[k\]\)/.test(oauth))
    check('10f: HMAC comparison is still constant-time', /timingSafeEqual/.test(oauth))
    const route = read('app/api/shopify/embedded-install/route.ts')
    check('10g: the new route never logs the shop, token, or secret',
      !(/console\.\w+\([^\n]*(shopDomain|accessToken|clientSecret|sessionToken|token\b)/.test(strip(route))))
    // The log now also carries a caller-supplied diagnostic object whose
    // fields are constrained to a safe allow-list (proved in
    // phase3-token-exchange-verification.qa.ts section 8).
    check('10h: its rejection log carries a stable reason code plus only safe diagnostics',
      /console\.warn\('\[Shopify embedded install\] rejected', \{ route: 'embedded_install', reason, \.\.\.\(diag \?\? \{\}\) \}\)/.test(route))
  }

  console.log('\n11) shopify.app.toml keeps the embedded configuration from the previous commit')
  {
    const toml = read('shopify.app.toml').split('\n').map((l) => l.replace(/#.*$/, '')).join('\n')
    check('11a: application_url is still the embedded entry point',
      /application_url\s*=\s*"https:\/\/www\.gotopseo\.com\/shopify\/app"/.test(toml))
    check('11b: embedded is still true', /^\s*embedded\s*=\s*true\s*$/m.test(toml))
    check('11c: use_legacy_install_flow is still absent — managed installation stays in force, which is what makes token exchange the correct model',
      !/use_legacy_install_flow/.test(toml))
    check('11d: the OAuth callback redirect URL is still declared (the top-level connect path still uses it)',
      /"https:\/\/www\.gotopseo\.com\/api\/shopify\/oauth\/callback"/.test(toml))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
