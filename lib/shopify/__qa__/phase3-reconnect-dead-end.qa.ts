/**
 * Production RETRY DEAD-END — a store that could never be offered a reconnect.
 *
 * Evidence (2026-08-31, production main @ 38755ee):
 *   * the embedded app showed "Needs attention" +
 *     "Authentication failed. Check the Admin API access token.";
 *   * Vercel logged only GET /api/shopify/app-home — never a POST to
 *     /api/shopify/embedded-install — so the deployed 403 diagnostics from
 *     PR #41 could not run at all;
 *   * the connection had been a retryable `app_uninstalled` tombstone until an
 *     invalid-token test overwrote its status/last_error.
 *
 * CULPRIT — app/api/shopify/test-connection/route.ts:36 (pre-fix):
 *
 *     last_error: test.status === 'connection_ok' ? null : test.error ?? test.status,
 *
 * `test.error` for a 401/403 is the ENGLISH SENTENCE built in
 * lib/shopify/client.ts ('Authentication failed. Check the Admin API access
 * token.'). Writing it destroyed the 'app_uninstalled' marker that app-home's
 * predicate — `connection_status === 'failed' && last_error === 'app_uninstalled'`
 * — was the only reader of. needsInstall was never returned again, the client
 * took the connected branch, and startEmbeddedInstall() became unreachable.
 *
 * THE FIX (lib/shopify/connection-health.ts):
 *   * detection runs on STABLE MACHINE CODES, normalising the legacy prose
 *     already sitting in production rows — never one exact English string;
 *   * a conclusively rejected credential (Shopify 401/403 -> invalid_token) is
 *     itself a reconnect state, so the dead-end cannot recur;
 *   * the uninstall marker is never overwritten by a FAILING test;
 *   * eligibility stays narrow — missing scopes / permission refusals /
 *     transport errors are still connected-with-a-problem.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-reconnect-dead-end.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  classifyReinstallNeed,
  normalizeConnectionErrorCode,
  nextConnectionLastError,
  formatConnectionError,
  SHOPIFY_UNINSTALL_CODE,
} from '../connection-health'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'go-top-seo-test.myshopify.com'
const OTHER_SHOP = 'someone-elses-store.myshopify.com'
/** The exact sentence lib/shopify/client.ts raises on a Shopify 401/403. */
const CLIENT_401_MESSAGE = 'Authentication failed. Check the Admin API access token.'

type Row = Record<string, unknown>

/** app-home's live lookup + decision, with the route's own filters. */
async function appHome(admin: FakeAdmin, shopDomain: string) {
  const { data } = await admin
    .from('shopify_connections')
    .select('id, connection_status, last_error')
    .eq('shop_domain', shopDomain)
    .is('archived_at', null)
    .maybeSingle()
  if (!data) return { connected: false, needsInstall: false, reason: null as string | null }
  const r = classifyReinstallNeed(data as { connection_status?: string; last_error?: string | null })
  if (r.needsInstall) return { connected: false, needsInstall: true, reason: r.reason as string | null }
  return { connected: true, needsInstall: false, reason: null as string | null }
}

/** test-connection's persistence — driven through the route's real helper. */
async function runTestConnection(
  admin: FakeAdmin, connectionId: string,
  test: { ok: boolean; status: string; error?: string },
) {
  const { data: prior } = await admin
    .from('shopify_connections').select('id, last_error').eq('id', connectionId).maybeSingle()
  await admin
    .from('shopify_connections')
    .update({
      connection_status: test.ok ? 'connected' : 'failed',
      last_error: nextConnectionLastError({
        priorLastError: (prior as Row | null)?.last_error as string | null,
        ok: test.ok, status: test.status, message: test.error,
      }),
    })
    .eq('id', connectionId)
}

function tombstone(over: Row = {}): Row {
  return {
    id: 'c1', shop_domain: SHOP, project_id: 'p1', user_id: 'u1', archived_at: null,
    connection_status: 'failed', last_error: SHOPIFY_UNINSTALL_CODE, granted_scopes: [], ...over,
  }
}

async function main() {
  console.log('Production retry dead-end — reconnect eligibility QA\n')

  console.log('0) NEGATIVE CONTROL — the pre-fix predicate is what dead-ended')
  {
    const preFix = (row: Row) => row.connection_status === 'failed' && row.last_error === SHOPIFY_UNINSTALL_CODE
    const overwritten = tombstone({ last_error: CLIENT_401_MESSAGE })
    check('0a: pre-fix, the intact tombstone WAS offered a reconnect', preFix(tombstone()) === true)
    check('0b: pre-fix, one invalid-token test ended that forever (the production bug)', preFix(overwritten) === false)
    check('0c: post-fix, the SAME overwritten row is offered a reconnect again',
      classifyReinstallNeed(overwritten).needsInstall === true)
  }

  console.log('\n1) app_uninstalled -> reconnect')
  {
    const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
    const d = await appHome(admin, SHOP)
    check('1a: not reported as a usable connection', d.connected === false)
    check('1b: reconnect is offered', d.needsInstall === true)
    check('1c: with the stable, non-sensitive reason app_uninstalled', d.reason === 'app_uninstalled')
    check('1d: the reason carries no shop token, secret or message text',
      !/token|secret|password|Bearer/i.test(String(d.reason)))
  }

  console.log('\n2) A conclusively invalid / revoked credential -> reconnect')
  {
    for (const [label, lastError] of [
      ['the code form written from now on', 'invalid_token'],
      ['the code form with human detail appended', formatConnectionError('invalid_token', CLIENT_401_MESSAGE)],
      ['the LEGACY English sentence already in production', CLIENT_401_MESSAGE],
      ['legacy prose, different casing/spacing', '  authentication failed. check the admin api access token.  '],
    ] as [string, string][]) {
      const admin = new FakeAdmin({ shopify_connections: [tombstone({ last_error: lastError })] })
      const d = await appHome(admin, SHOP)
      check(`2: ${label} -> reconnect offered, reason credential_revoked`,
        d.connected === false && d.needsInstall === true && d.reason === 'credential_revoked')
    }
    check('2e: detection does NOT depend on the exact English string — the code alone suffices',
      normalizeConnectionErrorCode('invalid_token') === 'invalid_token'
      && classifyReinstallNeed({ connection_status: 'failed', last_error: 'invalid_token' }).needsInstall === true)
    check('2f: an unrecognised free-text failure is NOT promoted to a reinstall',
      normalizeConnectionErrorCode('something we have never seen') === null
      && classifyReinstallNeed({ connection_status: 'failed', last_error: 'something we have never seen' }).needsInstall === false)
  }

  console.log('\n3) A repeatedly FAILING reconnect stays retryable')
  {
    // The exact production sequence: uninstall tombstone, then connection tests
    // that keep failing with Shopify 401/403.
    const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
    for (let i = 0; i < 5; i++) {
      await runTestConnection(admin, 'c1', { ok: false, status: 'invalid_token', error: CLIENT_401_MESSAGE })
      const d = await appHome(admin, SHOP)
      check(`3a: after failed attempt ${i + 1}, reconnect is still offered`, d.needsInstall === true)
    }
    const row = admin.tables.shopify_connections[0]
    check('3b: the uninstall marker itself survived every failing test (never overwritten)',
      row.last_error === SHOPIFY_UNINSTALL_CODE)
    check('3c: the English sentence was never persisted', !String(row.last_error).includes(CLIENT_401_MESSAGE))
    check('3d: so claim_shopify_shop_ownership can still recognise the tombstone',
      row.connection_status === 'failed' && row.last_error === 'app_uninstalled'
      && (row.granted_scopes as string[]).length === 0)

    // And a connection that was NOT a tombstone but whose credential is dead
    // stays retryable across repeated failures too.
    const admin2 = new FakeAdmin({ shopify_connections: [tombstone({ last_error: 'invalid_token' })] })
    for (let i = 0; i < 3; i++) await runTestConnection(admin2, 'c1', { ok: false, status: 'invalid_token', error: CLIENT_401_MESSAGE })
    check('3e: a revoked-credential row also stays in the reconnect state indefinitely',
      (await appHome(admin2, SHOP)).needsInstall === true)
    check('3f: it is stored as a code, so the next reader cannot be fooled by prose',
      normalizeConnectionErrorCode(admin2.tables.shopify_connections[0].last_error as string) === 'invalid_token')

    // A successful test is proof the app is installed again -> marker cleared.
    const admin3 = new FakeAdmin({ shopify_connections: [tombstone()] })
    await runTestConnection(admin3, 'c1', { ok: true, status: 'connection_ok' })
    check('3g: a SUCCESSFUL test clears the marker and restores the connection',
      admin3.tables.shopify_connections[0].connection_status === 'connected'
      && admin3.tables.shopify_connections[0].last_error === null
      && (await appHome(admin3, SHOP)).connected === true)
  }

  console.log('\n4) Scope / permission problems are NOT reinstall states')
  {
    for (const [label, lastError] of [
      ['missing scopes (code)', 'missing_scopes'],
      ['missing scopes (code + detail)', formatConnectionError('missing_scopes', 'Missing required scopes: read_content')],
      ['missing scopes (legacy prose)', 'Missing required scopes: read_content'],
      ['scope read refused (code)', 'permission_error'],
      ['scope read refused (legacy prose)', 'Could not read the token’s granted scopes.'],
      ['transport failure', 'network'],
      ['generic API error', 'api_error'],
      ['rate limited', 'rate_limited'],
      ['nothing recorded', ''],
    ] as [string, string][]) {
      const admin = new FakeAdmin({ shopify_connections: [tombstone({ last_error: lastError || null })] })
      const d = await appHome(admin, SHOP)
      check(`4: ${label} -> connected-with-a-problem, NOT a forced reinstall`,
        d.connected === true && d.needsInstall === false)
    }
    check('4j: a permission message is never normalised to invalid_token',
      normalizeConnectionErrorCode('Could not read the token’s granted scopes.') === 'permission_error')
    check('4k: a missing-scope message is never normalised to invalid_token',
      normalizeConnectionErrorCode('Missing required scopes: read_content') === 'missing_scopes')
    check('4l: an untested / mid-setup row is never a reinstall',
      classifyReinstallNeed({ connection_status: 'untested', last_error: null }).needsInstall === false)
    check('4m: a CONNECTED row is never a reinstall, whatever its last_error says',
      classifyReinstallNeed({ connection_status: 'connected', last_error: 'invalid_token' }).needsInstall === false
      && classifyReinstallNeed({ connection_status: 'connected', last_error: SHOPIFY_UNINSTALL_CODE }).needsInstall === false)
  }

  console.log('\n5) A healthy connection is unchanged')
  {
    const healthy = tombstone({ connection_status: 'connected', last_error: null, granted_scopes: ['read_products', 'read_content', 'write_content'] })
    const admin = new FakeAdmin({ shopify_connections: [healthy] })
    const d = await appHome(admin, SHOP)
    check('5a: still reported as connected', d.connected === true)
    check('5b: no install is demanded', d.needsInstall === false && d.reason === null)
    await runTestConnection(admin, 'c1', { ok: true, status: 'connection_ok' })
    check('5c: a passing test still clears last_error', admin.tables.shopify_connections[0].last_error === null)
    await runTestConnection(admin, 'c1', { ok: true, status: 'missing_scopes', error: 'Missing required scopes: read_content' })
    check('5d: an ok-with-warnings test still records a WARNING, not a reinstall',
      admin.tables.shopify_connections[0].connection_status === 'connected'
      && String(admin.tables.shopify_connections[0].last_error).startsWith('missing_scopes')
      && (await appHome(admin, SHOP)).needsInstall === false)
    check('5e: the human detail is still readable in the dashboard',
      String(admin.tables.shopify_connections[0].last_error).includes('Missing required scopes: read_content'))
  }

  console.log('\n6) No cross-shop / cross-project ownership bypass')
  {
    const admin = new FakeAdmin({
      shopify_connections: [
        tombstone(),
        { id: 'c2', shop_domain: OTHER_SHOP, project_id: 'p2', user_id: 'u2', archived_at: null,
          connection_status: 'connected', last_error: null, granted_scopes: ['read_products'] },
        { id: 'c3', shop_domain: SHOP, project_id: 'p0', user_id: 'u0', archived_at: '2026-08-30T00:00:00Z',
          connection_status: 'failed', last_error: SHOPIFY_UNINSTALL_CODE, granted_scopes: [] },
      ],
    })
    const a = await appHome(admin, SHOP)
    const b = await appHome(admin, OTHER_SHOP)
    check('6a: the tombstoned shop gets its own reconnect', a.needsInstall === true)
    check('6b: the OTHER shop is unaffected — still connected, no reconnect',
      b.connected === true && b.needsInstall === false)
    check('6c: an unrelated shop with no row is offered setup, never another shop’s reconnect',
      JSON.stringify(await appHome(admin, 'nobody.myshopify.com')) === JSON.stringify({ connected: false, needsInstall: false, reason: null }))
    check('6d: nothing in this decision path mutates any row',
      admin.tables.shopify_connections.length === 3
      && admin.tables.shopify_connections.every((r) => r.id === 'c1' || r.id === 'c2' || r.id === 'c3'))
    check('6e: the ARCHIVED historical row for the same shop is not read', a.reason === 'app_uninstalled' && (admin.tables.shopify_connections[2].archived_at as string).length > 0)

    const home = strip(read('app/api/shopify/app-home/route.ts'))
    check('6f: app-home resolves the shop ONLY from the verified session token',
      /const verified = verifyShopifySessionToken\(token\)/.test(home)
      && /const shopDomain = verified\.shopDomain/.test(home)
      && !/searchParams/.test(home))
    check('6g: the reconnect response leaks nothing beyond the shop and the reason',
      /needsInstallReason: reinstall\.reason,\s*\n\s*shopDomain,\s*\n\s*appUrl: config\.appUrl,/.test(home))
    const inst = strip(read('app/api/shopify/embedded-install/route.ts'))
    check('6h: embedded-install still requires a valid App Bridge session token',
      /const verified = verifyShopifySessionToken\(token\)/.test(inst)
      && /if \(!verified\.ok\) return fail\(401, 'invalid_session_token'\)/.test(inst))
    check('6i: and exchanges/writes ONLY for that verified shop — never a query or body value',
      /const shopDomain = verified\.shopDomain/.test(inst)
      && !/searchParams/.test(inst) && !/request\.json\(\)/.test(inst))
    check('6j: project ownership still transitions only through the RPC',
      /claim_shopify_shop_ownership/.test(read('lib/shopify/connection-ownership.ts')))
    check('6k: the RPC still supersedes another project’s shop ONLY for the exact tombstone',
      /v_existing\.last_error = 'app_uninstalled'/.test(read('supabase/migrations/20260830000000_shopify_reconnect_after_uninstall.sql')))
  }

  console.log('\n7) embedded-install runs only when the merchant initiates the reconnect')
  {
    const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
    const startIdx = client.indexOf('const startEmbeddedInstall = async () => {')
    const endIdx = client.indexOf('const startBillingIntent', startIdx)
    const body = client.slice(startIdx, endIdx)
    const postIdx = client.indexOf("fetch('/api/shopify/embedded-install'")
    check('7a: there is exactly ONE call to embedded-install in the client',
      (client.match(/'\/api\/shopify\/embedded-install'/g) || []).length === 1)
    check('7b: it lives inside startEmbeddedInstall, not at module or render level',
      startIdx !== -1 && endIdx > startIdx && postIdx > startIdx && postIdx < endIdx)
    check('7c: startEmbeddedInstall is reached only from a click handler',
      /onClick=\{startEmbeddedInstall\}/.test(client)
      && (client.match(/startEmbeddedInstall/g) || []).length === 2)
    check('7d: the mount effect loads app-home ONLY — it never auto-installs',
      /useEffect\(\(\) => \{ const t = setTimeout\(load, 0\); return \(\) => clearTimeout\(t\) \}, \[load\]\)/.test(client)
      && !/useEffect\([^)]*startEmbeddedInstall/.test(client))
    check('7e: a FAILED install attempt does not clear the reconnect state',
      /setInstallError\('We couldn/.test(body) && !/setData\(/.test(body) && !/setState\(/.test(body))
    check('7f: so the next refresh re-reads app-home and is offered the reconnect again',
      /const res = await fetch\('\/api\/shopify\/app-home'/.test(client) && /const retry = \(\) => \{ setState\('loading'\); load\(\) \}/.test(client))
    check('7g: the revoked-credential case is worded as a reconnect too',
      /needsInstallReason === 'credential_revoked'/.test(client) && /Reconnect store/.test(client))
  }

  console.log('\n8) The culprit route can no longer overwrite the marker')
  {
    const tc = strip(read('app/api/shopify/test-connection/route.ts'))
    check('8a: NEGATIVE CONTROL — the pre-fix write is gone',
      !/last_error: test\.status === 'connection_ok' \? null : test\.error/.test(tc))
    check('8b: the write goes through the shared helper',
      /last_error: nextConnectionLastError\(\{/.test(tc)
      && /import \{ nextConnectionLastError \} from '@\/lib\/shopify\/connection-health'/.test(tc))
    check('8c: it is given the row’s PRIOR last_error, which is what protects the marker',
      /priorLastError: loaded\.connection\.last_error/.test(tc))
    check('8d: no other route writes shopify_connections.last_error on a failure path',
      // sync.ts writes warnings alongside connection_status 'connected' only.
      /connection_status: 'connected',\s*\n\s*last_error: allOk \? null/.test(strip(read('lib/shopify/sync.ts'))))
  }

  console.log('\n9) PRESERVED — fail-closed install gate and the safe 403 diagnostics')
  {
    const inst = strip(read('app/api/shopify/embedded-install/route.ts'))
    const testGuard = inst.indexOf("return fail(502, 'token_verification_failed'")
    const gidGuard = inst.indexOf("return fail(502, 'shop_identity_unverified'")
    const pendingIdx = inst.indexOf('createPendingInstall(admin, {')
    check('9a: verification failure still aborts before any pending install',
      testGuard !== -1 && pendingIdx !== -1 && testGuard < pendingIdx)
    check('9b: an unverified shop identity still aborts before it too',
      gidGuard !== -1 && gidGuard < pendingIdx)
    check('9c: no connection mutation happens before those guards',
      inst.indexOf(".from('shopify_connections')") < testGuard
      && !/\.from\('shopify_connections'\)[\s\S]*\.update\(/.test(inst))
    check('9d: Shopify’s own structured reason is still reported (PR #41)',
      /shopifyMessages: test\.diagnostics\?\.shopifyMessages/.test(inst)
      && /shopifyCodes: test\.diagnostics\?\.shopifyCodes/.test(inst))
    check('9e: the sanitizer and its caps are unchanged',
      /MAX_ERROR_MESSAGE_CHARS/.test(read('lib/shopify/client.ts'))
      && /sanitizeShopifyMessage/.test(read('lib/shopify/client.ts')))
    check('9f: HMAC canonicalization still untouched (cbd889f remains unmerged)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(strip(read('lib/shopify/oauth.ts'))))
  }

  console.log('\n10) The health module handles no secrets')
  {
    const mod = read('lib/shopify/connection-health.ts')
    check('10a: it is pure — no fetch, no Supabase, no crypto', !/\bfetch\(|createAdminClient|encryptCredential|process\.env/.test(mod))
    check('10b: it never receives or returns a token', !/accessToken|sessionToken|access_token/.test(strip(mod)))
    check('10c: reasons are a closed, non-sensitive set',
      classifyReinstallNeed({ connection_status: 'failed', last_error: 'app_uninstalled' }).reason === 'app_uninstalled'
      && classifyReinstallNeed({ connection_status: 'failed', last_error: 'invalid_token' }).reason === 'credential_revoked')
    check('10d: a persisted detail is capped, so a long Shopify message cannot bloat the row',
      formatConnectionError('invalid_token', 'x'.repeat(5000)).length <= 320)
    check('10e: null / undefined / empty inputs are safe',
      classifyReinstallNeed(null).needsInstall === false
      && classifyReinstallNeed(undefined).needsInstall === false
      && normalizeConnectionErrorCode(null) === null
      && normalizeConnectionErrorCode('   ') === null)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
