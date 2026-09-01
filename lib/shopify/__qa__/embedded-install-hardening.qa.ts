/**
 * /api/shopify/embedded-install — stable failure codes and scope verification.
 *
 * The production reconnect returned a generic 502 for a condition that was
 * entirely predictable and recoverable: Shopify issued a NON-EXPIRING offline
 * token, which the Admin API then refused. A 502 reads as "our server is
 * broken" and gives the embedded UI nothing to act on, so the merchant had no
 * route back.
 *
 * This file covers what the route must now do: stable non-sensitive codes with
 * meaningful statuses, scope verification against ONE authoritative list, and
 * the guards that must survive — session-token verification, shop-domain
 * normalization, shop-identity verification, and no connection created from an
 * unverified credential.
 *
 * Run: npx tsx lib/shopify/__qa__/embedded-install-hardening.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { SHOPIFY_REQUIRED_SCOPES, SHOPIFY_APP_SCOPES, missingScopes, hasWriteContent } from '../constants'
import { EMBEDDED_INSTALL_ERROR_STATUS } from '../../../app/api/shopify/embedded-install/route'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

async function main() {
  console.log('Embedded install — hardening and scope verification\n')
  const route = strip(read('app/api/shopify/embedded-install/route.ts'))

  console.log('1) Stable, non-sensitive failure codes with meaningful statuses')
  {
    check('1a: a predictable reauthorization condition is NOT a generic 502',
      EMBEDDED_INSTALL_ERROR_STATUS.reauthorization_required === 409)
    check('1b: a genuine upstream failure still reports 502',
      EMBEDDED_INSTALL_ERROR_STATUS.token_exchange_failed === 502)
    check('1c: a transient refresh failure reports 503', EMBEDDED_INSTALL_ERROR_STATUS.token_refresh_failed === 503)
    check('1d: an unverified shop identity reports 409', EMBEDDED_INSTALL_ERROR_STATUS.shop_identity_unverified === 409)
    check('1e: insufficient scopes report 409 — a reconnect, not a server error',
      EMBEDDED_INSTALL_ERROR_STATUS.insufficient_scopes === 409)
    check('1f: an invalid session token still fails closed with 401',
      EMBEDDED_INSTALL_ERROR_STATUS.invalid_session_token === 401)
    check('1g: every code is a stable snake_case identifier, never prose',
      Object.keys(EMBEDDED_INSTALL_ERROR_STATUS).every((k) => /^[a-z][a-z_]*$/.test(k)))
    check('1h: a NON-EXPIRING grant maps to reauthorization_required',
      /const reason = nonExpiring \? 'reauthorization_required' : 'token_exchange_failed'/.test(route))
    check('1i: its precise internal cause stays in the LOG, not the response',
      /cause: nonExpiring \? 'non_expiring_token_rejected' : undefined/.test(route))
  }

  console.log('\n2) Scope verification — one authoritative list, never a billing failure')
  {
    check('2a: the app-scope list matches shopify.app.toml exactly',
      new RegExp(`scopes = "${[...SHOPIFY_APP_SCOPES].join(',')}"`).test(read('shopify.app.toml')))
    check('2b: the REQUIRED set is what the implemented queries need',
      JSON.stringify([...SHOPIFY_REQUIRED_SCOPES]) === JSON.stringify(['read_products', 'read_content']))
    check('2c: a complete grant has nothing missing',
      missingScopes(['read_products', 'read_content', 'write_content']).length === 0)
    check('2d: the PRODUCTION grant (read_products + write_content) is complete — a write scope implies its read',
      missingScopes(['read_products', 'write_content']).length === 0)
    check('2e: a grant missing read_products IS incomplete',
      JSON.stringify(missingScopes(['read_content'])) === JSON.stringify(['read_products']))
    check('2f: a grant with no content scope at all is incomplete',
      JSON.stringify(missingScopes(['read_products'])) === JSON.stringify(['read_content']))
    check('2g: publishing capability is still reported separately from the gate',
      hasWriteContent(['read_products', 'read_content']) === false
      && hasWriteContent(['read_products', 'read_content', 'write_content']) === true)

    const scopeIdx = route.indexOf("missingScopes(grantedScopes, SHOPIFY_REQUIRED_SCOPES)")
    const pendingIdx = route.indexOf('createPendingInstall(admin, {')
    check('2h: the route verifies scopes BEFORE creating a pending install',
      scopeIdx !== -1 && pendingIdx !== -1 && scopeIdx < pendingIdx)
    check('2i: it refuses with insufficient_scopes, never with a billing reason',
      /'insufficient_scopes'/.test(route) && !/billing_required/.test(route))
    check('2j: the diagnostics carry scope NAMES only — public API identifiers',
      /requiredScopes: \[\.\.\.SHOPIFY_REQUIRED_SCOPES\]/.test(route) && /missingScopes: missing/.test(route))
    check('2k: it uses the shared list, not a second inline copy',
      !/\['read_products', 'read_content'\]/.test(route))
  }

  console.log('\n3) PRESERVED — identity, verification and fail-closed guards')
  {
    const verifyIdx = route.indexOf('const verified = verifyShopifySessionToken(token)')
    const pendingIdx = route.indexOf('createPendingInstall(admin, {')
    check('3a: identity comes only from a verified App Bridge session token',
      verifyIdx !== -1 && /if \(!verified\.ok\) return fail\(401, 'invalid_session_token'\)/.test(route))
    check('3b: the verified shop is the only shop used — never a query param or body',
      /const shopDomain = verified\.shopDomain/.test(route)
      && !/searchParams/.test(route) && !/request\.json\(\)/.test(route))
    const sessionToken = strip(read('lib/shopify/session-token.ts'))
    check('3c: the shop domain is normalized and must be a real myshopify host',
      /new URL\(value\)\.hostname\.toLowerCase\(\)/.test(sessionToken)
      && /endsWith\('\.myshopify\.com'\)/.test(sessionToken))
    check('3d: issuer and destination must agree, so no arbitrary host is accepted',
      /issHost !== destHost/.test(sessionToken))
    check('3e: a failed credential verification aborts before any pending install',
      route.indexOf("return fail(502, 'token_verification_failed'") < pendingIdx)
    check('3f: an unverified shop identity aborts before it too',
      route.indexOf("'shop_identity_unverified'") < pendingIdx)
    check('3g: no connection can be created from an unverified credential',
      !/\.from\('shopify_connections'\)[\s\S]*\.insert\(/.test(route))
    check('3h: pending-install cleanup stays idempotent — prior rows are replaced',
      /await admin\.from\('shopify_pending_installs'\)\.delete\(\)\.eq\('shop_domain'/.test(strip(read('lib/shopify/pending-link.ts'))))
    check('3i: an already-connected shop is still a no-op',
      /\.eq\('connection_status', 'connected'\)[\s\S]{0,200}alreadyConnected: true/.test(route))
  }

  console.log('\n4) Shopify’s own error text never reaches the client')
  {
    const failFn = route.slice(route.indexOf('function fail('), route.indexOf('export async function POST'))
    check('4a: the response body carries ONLY the stable code',
      /NextResponse\.json\(\{ error: reason \}, \{ status \}\)/.test(failFn))
    check('4b: diagnostics go to the server log, not the response',
      /console\.warn\('\[Shopify embedded install\] rejected'/.test(failFn))
    check('4c: no Shopify response body is ever attached to a response',
      !/body: await|responseBody|await res\.text\(\)/.test(route))
    // Paren-BALANCED extraction of the fail() CALL SITES — a whole-file regex
    // would also match the exchange's own arguments and the creds object,
    // neither of which is a response payload.
    const failPayloads = (() => {
      const out: string[] = []
      const re = /return fail\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(route))) {
        let depth = 1
        let i = m.index + m[0].length
        for (; i < route.length && depth > 0; i++) {
          if (route[i] === '(') depth++
          else if (route[i] === ')') depth--
        }
        out.push(route.slice(m.index, i))
      }
      return out
    })()
    check('4d: the extraction found the failure payloads (not vacuous)', failPayloads.length >= 5)
    check('4e: no token-shaped value appears in ANY failure payload',
      !/accessToken:|refreshToken:|sessionToken:|clientSecret:|access_token|refresh_token|_encrypted/.test(failPayloads.join('\n')))
    check('4f: they carry only stages, statuses, shape counts and public names',
      failPayloads.some((p) => /shopDomain,/.test(p)) && failPayloads.some((p) => /stage:/.test(p)))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
