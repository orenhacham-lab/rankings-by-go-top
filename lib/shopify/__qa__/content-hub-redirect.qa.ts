/**
 * K1 — a CLEAN WordPress/Shopify connection success drops the user directly into
 * the Content Hub for that project; warnings/errors stay on the integration screen.
 *
 * Behavioral: contentHubReturnUrl builds a server-side internal /content path for
 * the validated project id (no open redirect). Source-contract: the Shopify OAuth
 * callback only redirects to the hub AFTER all verification (HMAC / nonce / one-time
 * state / ownership) and only on clean success; the WordPress panel fires onConnected
 * only on a clean connect; the project page routes that to the hub.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { contentHubReturnUrl, projectReturnUrl } from '../oauth'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function main() {
  console.log('K1 — Content Hub redirect on clean connection success')

  // ── contentHubReturnUrl: internal /content path, project id in projectId param.
  check('builds an internal /content?projectId=… path', contentHubReturnUrl('https://app.example.com', 'p-123') === 'https://app.example.com/content?projectId=p-123')
  check('trailing slashes on appUrl are normalized', contentHubReturnUrl('https://app.example.com/', 'p-123') === 'https://app.example.com/content?projectId=p-123')
  check('project id is URL-encoded (no injection)', contentHubReturnUrl('https://a.co', 'a b/c?d').includes('projectId=a%20b%2Fc%3Fd'))
  // It never points off-site: the host is always the server-provided appUrl.
  check('always same-origin as appUrl (no open redirect)', new URL(contentHubReturnUrl('https://app.example.com', 'p1')).origin === 'https://app.example.com')
  // Errors/warnings keep using the project return URL (integration screen).
  check('errors still route to the project (integration) screen', projectReturnUrl('https://a.co', 'p1', { shopify: 'error', reason: 'x' }).startsWith('https://a.co/projects/p1?'))

  console.log('SOURCE) redirect is gated by full verification + clean success only')
  const cb = strip(read('app/api/shopify/oauth/callback/route.ts'))
  check('Shopify callback redirects to the hub only on clean success', /missing\.length > 0[\s\S]*?return toProject[\s\S]*?contentHubReturnUrl\(appUrl, st\.project_id\)/.test(cb))
  check('hub redirect uses the server-validated st.project_id (never client input)', /contentHubReturnUrl\(appUrl, st\.project_id\)/.test(cb))
  check('verification still precedes the redirect (hmac + nonce + one-time state + ownership)',
    /verifyShopifyHmac/.test(cb) && /verifyNonceCookie/.test(cb) && /is\('used_at', null\)/.test(cb) && /authContentProject/.test(cb))
  // The hub redirect (call site, not the import) must come AFTER the token save.
  check('hub redirect appears after the shopify_connections upsert',
    cb.indexOf('contentHubReturnUrl(appUrl, st.project_id)') > cb.indexOf("from('shopify_connections').upsert"))
  check('warnings/errors still go to the project screen (toProject)', /shopify: 'warning', reason: 'missing_scopes'/.test(cb) && /toProject\(st\.project_id, \{ shopify: 'error'/.test(cb))

  const wp = strip(read('components/content/WordPressConnectionPanel.tsx'))
  check('WP panel fires onConnected ONLY on a clean connect (data.test?.ok branch)', /data\.test\?\.ok\)[\s\S]*?onConnected\?\.\(\)/.test(wp))
  check('WP panel does NOT fire onConnected on disconnect', !/handleDisconnect[\s\S]*?onConnected/.test(wp))

  const section = strip(read('components/content/ContentSection.tsx'))
  check('project page routes a clean WP connect to the Content Hub (validated internal path)',
    /router\.push\(`\/content\?projectId=\$\{encodeURIComponent\(projectId\)\}`\)/.test(section) && /onConnected=\{goToContentHub\}/.test(section))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
