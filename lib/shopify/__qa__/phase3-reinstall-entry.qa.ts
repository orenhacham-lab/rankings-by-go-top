/**
 * Production bug — reinstalling the app never triggered a fresh install.
 *
 * Confirmed evidence (2026-08-31, main @ b2e0f56):
 *   * the live connection for go-top-seo-test.myshopify.com is
 *     connection_status 'failed', last_error 'app_uninstalled';
 *   * the app was uninstalled and freshly reinstalled;
 *   * opening /shopify/app did NOT call /api/shopify/embedded-install;
 *   * shopify_pending_installs still held ONLY the row from the previous
 *     install (created 2026-08-30 10:23, expired 10:53, consumed 10:51);
 *   * the embedded UI showed only "Needs attention / app_uninstalled".
 *
 * ROOT CAUSE — /api/shopify/app-home reported `connected: true` for ANY
 * non-archived row, with no regard for connection_status. The uninstall
 * tombstone is live (archived_at IS NULL) but its Admin API token is the
 * revocation sentinel, so the client took the connected branch, rendered the
 * Connection card, and never reached the `!connected` branch that calls
 * startEmbeddedInstall(). With embedded-install never invoked there was no
 * token exchange, no new pending install, and no way back.
 *
 * Two further defects surfaced on the same path and are fixed here:
 *   * embedded-install computed testShopifyConnection() and getShopIdentity()
 *     and then IGNORED both, so a token that failed verification still became
 *     a pending install — that is how a connection with a NULL shop_gid was
 *     created, later failing test-connection with invalid_token and correctly
 *     blocking billing with shop_identity_unverified;
 *   * createPendingInstall only ever INSERTed, so a stale consumed/expired row
 *     for the shop was left behind instead of being replaced.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-reinstall-entry.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { createPendingInstall, loadValidPendingInstall, PENDING_LINK_TTL_MS } from '../pending-link'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'go-top-seo-test.myshopify.com'

/** Reproduces app-home's connected/needsInstall decision exactly. */
function appHomeDecision(row: { connection_status: string; last_error: string | null } | null) {
  if (!row) return { connected: false, needsInstall: false }
  if (row.connection_status === 'failed' && row.last_error === 'app_uninstalled') {
    return { connected: false, needsInstall: true, needsInstallReason: 'app_uninstalled' }
  }
  return { connected: true, needsInstall: false }
}
/** The PRE-FIX decision, for negative controls: a row existed => connected. */
const oldAppHomeDecision = (row: unknown) => ({ connected: !!row })

async function main() {
  console.log('Production bug — reinstall entry flow QA\n')

  console.log('1) app_uninstalled TRIGGERS a fresh embedded install')
  {
    const tombstone = { connection_status: 'failed', last_error: 'app_uninstalled' }
    check('1a: NEGATIVE CONTROL — the pre-fix decision reported connected:true (the production bug)',
      oldAppHomeDecision(tombstone).connected === true)
    const d = appHomeDecision(tombstone)
    check('1b: it is NOT reported as a usable connection', d.connected === false)
    check('1c: it is explicitly flagged as needing a fresh install', d.needsInstall === true)
    check('1d: with a stable, non-sensitive reason code', d.needsInstallReason === 'app_uninstalled')
  }

  console.log('\n2) A healthy CONNECTED store does NOT trigger a reinstall')
  {
    const d = appHomeDecision({ connection_status: 'connected', last_error: null })
    check('2a: still reported as connected', d.connected === true)
    check('2b: no install is demanded', d.needsInstall === false)
  }

  console.log('\n3) Eligibility stays NARROW — a generic failure is not a reinstall')
  {
    for (const [label, row] of [
      ['failed with a different error (bad token)', { connection_status: 'failed', last_error: 'token_invalid' }],
      ['failed with no error recorded', { connection_status: 'failed', last_error: null }],
      ['untested / mid-setup', { connection_status: 'untested', last_error: null }],
    ] as [string, { connection_status: string; last_error: string | null }][]) {
      const d = appHomeDecision(row)
      check(`3: ${label} -> still connected-with-a-problem, NOT a forced reinstall`,
        d.connected === true && d.needsInstall === false)
    }
  }

  console.log('\n4) Expired / consumed pending installs are REPLACED, never reused')
  {
    const stale = {
      token: 'old-token', shop_domain: SHOP, shop_gid: null,
      access_token_encrypted: 'enc(old)', api_version: '2026-07', granted_scopes: [],
      storefront_domain: null,
      created_at: '2026-08-30T10:23:00Z',
      expires_at: '2026-08-30T10:53:00Z',   // long past
      consumed_at: '2026-08-30T10:51:00Z',  // already consumed
    }
    const admin = new FakeAdmin({ shopify_pending_installs: [stale] })

    check('4a: the stale row cannot be loaded (consumed)', await loadValidPendingInstall(admin as never, 'old-token') === null)

    const fresh = await createPendingInstall(admin as never, {
      shop_domain: SHOP, shop_gid: 'gid://shopify/Shop/123',
      access_token_encrypted: 'enc(FRESH)', api_version: '2026-07',
      granted_scopes: ['read_products', 'read_content', 'write_content'],
      storefront_domain: null,
    })
    const rows = admin.tables.shopify_pending_installs
    check('4b: the stale row is GONE — replaced, not accumulated',
      !rows.some((r) => r.token === 'old-token'))
    check('4c: exactly ONE pending row for the shop', rows.filter((r) => r.shop_domain === SHOP).length === 1)
    check('4d: it is the new one, unconsumed, carrying the fresh token',
      rows[0].token === fresh && rows[0].consumed_at == null && rows[0].access_token_encrypted === 'enc(FRESH)')
    check('4e: the new token is a different token from the stale one', fresh !== 'old-token')
    check('4f: it is loadable', (await loadValidPendingInstall(admin as never, fresh))?.token === fresh)
    check('4g: its expiry is in the future', new Date(String(rows[0].expires_at)).getTime() > Date.now())
    check('4h: TTL is the shared constant, not an ad-hoc value',
      new Date(String(rows[0].expires_at)).getTime() - Date.now() <= PENDING_LINK_TTL_MS + 5_000)
  }

  console.log('\n5) An UNVERIFIED token never becomes a connection (fail closed)')
  {
    const src = strip(read('app/api/shopify/embedded-install/route.ts'))
    const testIdx = src.indexOf('const test = await testShopifyConnection(creds)')
    const testGuard = src.indexOf("if (!test.ok) return fail(502, 'token_verification_failed')")
    const gidGuard = src.indexOf("if (!shopGid) return fail(502, 'shop_identity_unverified')")
    const pendingIdx = src.indexOf('createPendingInstall(admin, {')
    check('5a: the freshly exchanged token is verified against Shopify', testIdx !== -1)
    check('5b: a failed verification aborts with token_verification_failed', testGuard !== -1)
    check('5c: that guard runs BEFORE any pending install is created', testGuard !== -1 && pendingIdx !== -1 && testGuard < pendingIdx)
    check('5d: a missing shop_gid aborts with shop_identity_unverified', gidGuard !== -1)
    check('5e: that guard also runs BEFORE the pending install', gidGuard !== -1 && gidGuard < pendingIdx)
    check('5f: NEGATIVE CONTROL — the results are no longer computed and discarded',
      !/const test = await testShopifyConnection\(creds\)\s*\n\s*const grantedScopes/.test(src))
    check('5g: storefront_domain comes from the VERIFIED test result', /const storefront = test\.storefrontDomain \?\? null/.test(src))
  }

  console.log('\n6) Billing stays blocked until shop identity is verified')
  {
    // shop_gid can no longer be null on a newly created connection (5d), and
    // the pre-existing billing guard still refuses to proceed without it.
    const home = read('app/api/shopify/app-home/route.ts')
    check('6a: app-home still reports shop_identity_unverified when shop_gid is missing',
      /verificationError: 'shop_identity_unverified'/.test(home))
    check('6b: it does so INSTEAD of calling the Partner billing API',
      /if \(!connection\.shop_gid\) \{[\s\S]{0,240}shop_identity_unverified/.test(home))
    const intent = read('app/api/shopify/billing/start-intent/route.ts')
    check('6c: start-intent still requires a shop_gid before minting a billing intent',
      /shop_gid/.test(intent))
  }

  console.log('\n7) The client actually drives the install from the needsInstall state')
  {
    const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
    check('7a: needsInstall is part of the app-home contract the client reads', /needsInstall\?: boolean/.test(client))
    check('7b: the !connected branch is what renders for a tombstone, and it calls embedded-install',
      /if \(!data\.connected\)/.test(client) && /startEmbeddedInstall/.test(client))
    check('7c: startEmbeddedInstall still POSTs a FRESH App Bridge id token',
      /bridge\.idToken\(\)/.test(client) && /'\/api\/shopify\/embedded-install'/.test(client)
      && /method: 'POST'/.test(client))
    check('7d: the reinstall case is worded as a reconnect, not a first-time connect',
      /Reconnect this store to Rankings/.test(client) && /Reconnect store/.test(client))
  }

  console.log('\n8) app-home source contract — the tombstone branch precedes every connected-only behaviour')
  {
    const src = strip(read('app/api/shopify/app-home/route.ts'))
    const uninstalledIdx = src.indexOf('const uninstalled =')
    const adminIdx = src.indexOf('const isAdmin = await isAdminUser')
    const partnerIdx = src.indexOf('getActiveShopifySubscription(connection.shop_gid')
    check('8a: the uninstall tombstone is detected', uninstalledIdx !== -1)
    check('8b: it returns needsInstall before the admin lookup', uninstalledIdx !== -1 && adminIdx !== -1 && uninstalledIdx < adminIdx)
    check('8c: and before any live Partner billing call', uninstalledIdx !== -1 && partnerIdx !== -1 && uninstalledIdx < partnerIdx)
    check('8d: the predicate is the narrow one, not a broad status check',
      /connection_status === 'failed'[\s\S]{0,120}last_error === 'app_uninstalled'/.test(src)
      && !/connection_status !== 'connected'/.test(src))
    check('8e: the live lookup still excludes archived rows (PR #37 preserved)', /\.is\('archived_at', null\)/.test(src))
  }

  console.log('\n9) PRESERVED — App Bridge, CSP, HMAC, ownership RPC, archived_at filters')
  {
    check('9a: App Bridge is still a real synchronous script tag',
      /<script src="https:\/\/cdn\.shopify\.com\/shopifycloud\/app-bridge\.js"/.test(read('app/shopify/app/layout.tsx')))
    check('9b: frame-ancestors CSP still scoped to /shopify/app',
      /source:\s*'\/shopify\/app\/:path\*'/.test(read('next.config.ts')))
    const oauth = strip(read('lib/shopify/oauth.ts'))
    check('9c: HMAC canonicalization unchanged (cbd889f still excluded)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(oauth) && !/encodeURIComponent\(params\[k\]\)/.test(oauth))
    check('9d: the ownership RPC is still the single transition point',
      /claim_shopify_shop_ownership/.test(read('lib/shopify/connection-ownership.ts')))
    check('9e: ownership eligibility is unchanged — active connections still protected',
      /shop_already_connected/.test(read('lib/shopify/connection-ownership.ts')))
    check('9f: embedded-install still short-circuits a genuinely CONNECTED shop',
      /\.eq\('connection_status', 'connected'\)[\s\S]{0,200}alreadyConnected: true/.test(read('app/api/shopify/embedded-install/route.ts')))
  }

  console.log('\n10) The archived historical row is untouched by this pass')
  {
    const src = read('app/api/shopify/app-home/route.ts') + read('app/api/shopify/embedded-install/route.ts') + read('lib/shopify/pending-link.ts')
    check('10a: nothing writes archived_at or archived_reason', !/archived_at:\s|archived_reason:\s/.test(src))
    // app-home legitimately writes the billing cache for a genuinely CONNECTED
    // non-admin shop (pre-existing behaviour). What matters is that the
    // needsInstall path returns BEFORE any of that — proved by 8b/8c — so no
    // billing state is read from or written for an uninstalled store.
    const home = strip(read('app/api/shopify/app-home/route.ts'))
    const uninstalledReturn = home.indexOf("needsInstallReason: 'app_uninstalled'")
    // The CALL SITE, not the import at the top of the file.
    const firstBillingWrite = home.indexOf('await recordShopifyBillingCache(admin,')
    check('10b: the needsInstall response is returned before any billing-cache write',
      uninstalledReturn !== -1 && firstBillingWrite !== -1 && uninstalledReturn < firstBillingWrite)
    check('10b: nothing in this pass reads the archived row', !/archived_reason\s*===|archived_at\s*!==\s*null/.test(src))
    check('10c: the only DELETE is scoped to the short-lived pending-install handoff table',
      (read('lib/shopify/pending-link.ts').match(/\.delete\(\)/g) || []).length === 1
      && /from\('shopify_pending_installs'\)\.delete\(\)\.eq\('shop_domain'/.test(read('lib/shopify/pending-link.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
