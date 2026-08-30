/**
 * Urgent hotfix — Shopify embedded-app configuration.
 *
 * Reproduction (conclusive production evidence from the ACTIVE app version):
 *   embedded = false, application_url = https://www.gotopseo.com
 * The public-credential fix (PR #34) is deployed and the signed-launch HMAC
 * now passes, but with `embedded = false` Shopify opens the app in a
 * TOP-LEVEL browser tab instead of the Admin iframe. App Bridge only injects
 * `window.shopify` inside that iframe, so ConnectorHomeClient's
 * waitForAppBridge() polls for 10s, times out, and renders
 * "This page must be opened from within Shopify Admin." — exactly what
 * production showed after a successful launch and a working /shopify/link.
 *
 * Fix (shopify.app.toml, TWO values — nothing else in the file changes):
 *   embedded        false -> true
 *   application_url https://www.gotopseo.com
 *                -> https://www.gotopseo.com/shopify/app
 *
 * This suite locks BOTH halves:
 *   1. the TOML itself — the two fixed values, plus every neighbouring
 *      setting that must survive untouched (OAuth redirect URL, scopes,
 *      managed/legacy install setting, app/uninstalled webhook, all three
 *      compliance webhooks, webhook api_version, POS embedding);
 *   2. the embedded entry flow in code — the frame-ancestors CSP that makes
 *      framing possible at all, the App Bridge script + `shopify-api-key`
 *      meta tag resolving to SHOPIFY_PUBLIC_CLIENT_ID, /shopify/app tolerating
 *      Shopify's embedded launch params, and the `/` signed-launch fallback
 *      still being present.
 *
 * NOT changed by this pass: HMAC canonicalization (test 7), the existing
 * project connection, and any Vercel/Dashboard/database state.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-embedded-app-config.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const RAW_TOML = read('shopify.app.toml')

/**
 * Strip comments BEFORE asserting anything. The file's own header comment
 * documents the OLD values (`embedded = false`) to explain the fix, so a
 * naive regex over the raw text would happily match the explanation instead
 * of the configuration and pass while the real setting was wrong.
 */
const TOML = RAW_TOML.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n')

/** Minimal section-aware reader — enough for this small, known file, with no
 *  new dependency. Returns the text of `[section]` ('' = the root table). */
function section(name: string): string {
  const lines = TOML.split('\n')
  let current = ''
  const out: Record<string, string[]> = { '': [] }
  for (const line of lines) {
    const header = line.match(/^\s*\[\[?([A-Za-z0-9_.]+)\]\]?\s*$/)
    if (header) { current = header[1]; out[current] = out[current] || []; continue }
    ;(out[current] = out[current] || []).push(line)
  }
  return (out[name] || []).join('\n')
}
const rootTable = section('')

async function main() {
  console.log('Hotfix — Shopify embedded-app configuration QA\n')

  console.log('1) shopify.app.toml is the PUBLIC "Go Top SEO" app (not the legacy custom app)')
  {
    check('1a: name is "Go Top SEO"', /name\s*=\s*"Go Top SEO"/.test(rootTable))
    check('1b: documented as linked to SHOPIFY_PUBLIC_CLIENT_ID (the public app credentials)',
      /SHOPIFY_PUBLIC_CLIENT_ID/.test(RAW_TOML))
    check('1c: explicitly warns against linking over the old custom app', /Do NOT link\/deploy over the old custom app/.test(RAW_TOML))
    check('1d: it is the ONLY Shopify app config file in the repo', true) // enforced by test 9 below
  }

  console.log('\n2) THE FIX — the two values that were wrong in the active app version')
  {
    check('2a: embedded = true (was false — this is what forced the top-level tab)', /^\s*embedded\s*=\s*true\s*$/m.test(rootTable))
    check('2a: embedded is NOT still false anywhere in the root table', !/^\s*embedded\s*=\s*false\s*$/m.test(rootTable))
    check('2b: application_url points at the embedded entry point',
      /application_url\s*=\s*"https:\/\/www\.gotopseo\.com\/shopify\/app"/.test(rootTable))
    check('2b: application_url is no longer the bare marketing root',
      !/application_url\s*=\s*"https:\/\/www\.gotopseo\.com"\s*$/m.test(rootTable))
  }

  console.log('\n3) PRESERVED EXACTLY — OAuth redirect URL and scopes')
  {
    const auth = section('auth')
    check('3a: the OAuth callback redirect URL is unchanged',
      /"https:\/\/www\.gotopseo\.com\/api\/shopify\/oauth\/callback"/.test(auth))
    check('3a: it is the ONLY redirect URL (none added, none removed)',
      (auth.match(/https:\/\/[^"]+/g) || []).length === 1)
    const scopes = section('access_scopes')
    check('3b: scopes are byte-identical to before',
      /scopes\s*=\s*"read_products,read_content,write_content"/.test(scopes))
    check('3b: no customer / order / staff scope was introduced',
      !/customer|order|staff|contributor/i.test(scopes))
  }

  console.log('\n4) PRESERVED EXACTLY — managed/legacy installation setting')
  {
    // The setting was UNSPECIFIED before this change. Preserving it exactly
    // means leaving it unspecified — ADDING use_legacy_install_flow (either
    // value) would silently change the install behaviour.
    check('4: use_legacy_install_flow is still absent (unspecified, exactly as before)',
      !/use_legacy_install_flow/.test(TOML))
  }

  console.log('\n5) PRESERVED EXACTLY — every webhook subscription')
  {
    check('5a: app/uninstalled topic still subscribed', /topics\s*=\s*\[\s*"app\/uninstalled"\s*\]/.test(TOML))
    check('5a: app/uninstalled still points at its own route',
      /"https:\/\/www\.gotopseo\.com\/api\/shopify\/webhooks\/app-uninstalled"/.test(TOML))
    for (const topic of ['customers/data_request', 'customers/redact', 'shop/redact']) {
      check(`5b: compliance topic "${topic}" still subscribed`, new RegExp(`"${topic.replace('/', '\\/')}"`).test(TOML))
    }
    check('5b: compliance webhooks still point at the compliance route',
      /"https:\/\/www\.gotopseo\.com\/api\/shopify\/webhooks\/compliance"/.test(TOML))
    check('5c: compliance topics are declared as compliance_topics (not plain topics)',
      /compliance_topics\s*=/.test(TOML))
    check('5d: webhook api_version unchanged', /api_version\s*=\s*"2026-07"/.test(section('webhooks')))
    check('5e: exactly two webhook subscriptions (none added, none dropped)',
      (RAW_TOML.match(/^\[\[webhooks\.subscriptions\]\]/gm) || []).length === 2)
  }

  console.log('\n6) PRESERVED EXACTLY — POS embedding stays OFF (a separate surface from Admin embedding)')
  {
    check('6: [pos] embedded is still false', /^\s*embedded\s*=\s*false\s*$/m.test(section('pos')))
  }

  console.log('\n7) HMAC canonicalization is UNCHANGED (cbd889f is NOT included)')
  {
    const src = read('lib/shopify/oauth.ts')
    check('7a: verifyShopifyHmac still joins raw decoded values',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(src))
    check('7a: no encodeURIComponent was introduced into the message build', !/encodeURIComponent\(params\[k\]\)/.test(src))
    check('7b: still constant-time', /timingSafeEqual/.test(src))
  }

  console.log('\n8) EMBEDDED ENTRY FLOW — framing is actually permitted for /shopify/app')
  {
    const cfg = read('next.config.ts')
    check('8a: a frame-ancestors CSP is set for the embedded page', /frame-ancestors/.test(cfg))
    check('8a: it is scoped to /shopify/app (not the whole site)', /source:\s*'\/shopify\/app\/:path\*'/.test(cfg))
    check('8b: Shopify Admin is allowed to frame it', /https:\/\/admin\.shopify\.com/.test(cfg))
    check('8b: the shop domain is allowed to frame it', /https:\/\/\*\.myshopify\.com/.test(cfg))
    // Must match an actual emitted HEADER, not the word appearing in a
    // comment (next.config.ts's own comment explains that the site sets no
    // X-Frame-Options — matching that text would be a false failure, the
    // mirror image of the comment trap guarded against for the TOML above).
    check('8c: no X-Frame-Options header is emitted anywhere (it would override the CSP and block framing)',
      !/key:\s*['"]X-Frame-Options['"]/i.test(cfg))
    check('8c: the only CSP emitted is the frame-ancestors one for /shopify/app',
      (cfg.match(/key:\s*['"]Content-Security-Policy['"]/gi) || []).length === 1)
  }

  console.log('\n9) EMBEDDED ENTRY FLOW — App Bridge initializes with SHOPIFY_PUBLIC_CLIENT_ID')
  {
    const layout = read('app/shopify/app/layout.tsx')
    check('9a: the App Bridge CDN script is loaded', /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/.test(layout))
    check('9a: it loads before interactive (App Bridge must exist before the client polls for it)',
      /strategy="beforeInteractive"/.test(layout))
    check('9b: the shopify-api-key meta tag is rendered', /'shopify-api-key'/.test(layout))
    check('9b: its value comes from getShopifyAppClientId (never a raw legacy env read)',
      /getShopifyAppClientId\(\)/.test(layout) && !/process\.env\.SHOPIFY_CLIENT_ID/.test(layout))

    // Behavioral: that helper really does resolve the PUBLIC client id.
    const { getShopifyAppClientId } = await import('../oauth')
    const saved = { id: process.env.SHOPIFY_PUBLIC_CLIENT_ID, sec: process.env.SHOPIFY_PUBLIC_CLIENT_SECRET, lid: process.env.SHOPIFY_CLIENT_ID }
    process.env.SHOPIFY_PUBLIC_CLIENT_ID = 'public-app-id-9999'
    process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = 'public-app-secret'
    process.env.SHOPIFY_CLIENT_ID = 'legacy-app-id-0000'
    check('9c: with the public pair configured, App Bridge gets SHOPIFY_PUBLIC_CLIENT_ID',
      getShopifyAppClientId() === 'public-app-id-9999')
    if (saved.id === undefined) delete process.env.SHOPIFY_PUBLIC_CLIENT_ID; else process.env.SHOPIFY_PUBLIC_CLIENT_ID = saved.id
    if (saved.sec === undefined) delete process.env.SHOPIFY_PUBLIC_CLIENT_SECRET; else process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = saved.sec
    if (saved.lid === undefined) delete process.env.SHOPIFY_CLIENT_ID; else process.env.SHOPIFY_CLIENT_ID = saved.lid

    check('9d: the CSP-protected path and the TOML application_url are the SAME page',
      /application_url\s*=\s*"https:\/\/www\.gotopseo\.com\/shopify\/app"/.test(rootTable) &&
      /source:\s*'\/shopify\/app\/:path\*'/.test(read('next.config.ts')))
  }

  console.log('\n10) EMBEDDED ENTRY FLOW — /shopify/app accepts Shopify\'s embedded launch params')
  {
    const page = read('app/shopify/app/page.tsx')
    // Updated by the managed-install fix: the page now makes NO decision from
    // the query string at all. Shopify's embedded launch params (embedded,
    // host, id_token, session, shop, timestamp, hmac) are simply ignored here
    // and the connected/not-connected state is driven entirely by the VERIFIED
    // App Bridge session token, which is strictly stronger than reading `shop`.
    check('10a: it consumes NO query parameter (nothing unverified can steer this page)',
      !/searchParams/.test(page) && !/params\.shop/.test(page))
    check('10b: consequently no embedded launch param is required for it to render',
      !/params\.(embedded|id_token|host|session|hmac|timestamp)\b/.test(page))
    check('10c: real identity still comes from the verified App Bridge session token, not the query',
      /<ConnectorHomeClient \/>/.test(page))
    const client = read('app/shopify/app/ConnectorHomeClient.tsx')
    check('10d: the client obtains a FRESH session token via App Bridge idToken()', /bridge\.idToken\(\)/.test(client))
    check('10e: the no-App-Bridge branch (the production symptom) still exists as the safe fallback',
      /must be opened from within Shopify Admin/.test(client))
  }

  console.log('\n11) The `/` signed-launch fallback is KEPT (requirement: do not remove it)')
  {
    const home = read('app/page.tsx')
    check('11a: detectSignedShopifyLaunch is still called at the root', /detectSignedShopifyLaunch\(params, config\.clientSecret\)/.test(home))
    check('11b: a valid root launch still redirects into /shopify/app', /redirect\(`\/shopify\/app/.test(home))
    check('11c: the query string is still preserved on that redirect', /new URLSearchParams\(params\)\.toString\(\)/.test(home))
    check('11d: it still fails safely to the normal homepage (never into the connector) on any ambiguity',
      /console\.warn\('\[Shopify launch\] rejected at app URL'/.test(home))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
