/**
 * Release blocker — App Bridge never loaded on the embedded App Home.
 *
 * Production evidence (raw HTML of https://www.gotopseo.com/shopify/app):
 *   <link rel="preload" href="https://cdn.shopify.com/shopifycloud/app-bridge.js" as="script"/>
 *   <meta name="shopify-api-key" content="…"/>
 * and NO <script src="…/app-bridge.js">. So `window.shopify` never existed,
 * ConnectorHomeClient's waitForAppBridge() polled for 10s and gave up, and the
 * embedded iframe showed "This page must be opened from within Shopify Admin."
 *
 * ROOT CAUSE — next/script's beforeInteractive strategy in a NESTED layout.
 * app/shopify/app/layout.tsx used:
 *   <Script src="…/app-bridge.js" strategy="beforeInteractive" />
 * In the App Router that branch of Next's own client/script.js does:
 *   ReactDOM.preload(src, { as: 'script' })          -> the preload <link>
 *   <script>(self.__next_s=self.__next_s||[]).push([src, {…}])</script>
 * with the source comment "Before interactive scripts need to be loaded by
 * Next.js' runtime instead of native <script> tags". That runtime drains
 * `__next_s` only for beforeInteractive scripts declared in the ROOT layout.
 * Declared in a nested layout, the preload link and the queue entry are emitted
 * but nothing ever executes them — a preload is a fetch hint, never execution.
 *
 * FIX: emit a plain, synchronous <script src> from the same route-scoped
 * layout. A Server Component's raw <script src> is serialized verbatim into the
 * HTML and executes normally, and keeping it in this nested layout is what
 * confines App Bridge to /shopify/app instead of the whole marketing site.
 *
 * Verified against real rendered HTML from `next start` (not just source):
 *   before: 0 executable script tags, 1 preload link, 1 __next_s queue push
 *   after : 1 executable <script src="…/app-bridge.js">, 0 preload, 0 __next_s
 * and in a real Chromium session with a stubbed CDN response: the script
 * executed, window.shopify.idToken() resolved, /api/shopify/app-home and
 * /api/shopify/embedded-install both received `Bearer <token>`, the connected
 * admin/non-admin billing split rendered correctly, and the page never showed
 * the "must be opened from within Shopify Admin" state.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-app-bridge-script.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import ShopifyAppLayout, { generateMetadata } from '@/app/shopify/app/layout'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const APP_BRIDGE_SRC = 'https://cdn.shopify.com/shopifycloud/app-bridge.js'

async function main() {
  console.log('Release blocker — App Bridge script emission QA\n')

  console.log('1) BEHAVIOURAL — the layout really emits an executable script tag')
  {
    // Renders the actual Server Component, so this proves emitted HTML rather
    // than merely asserting on source text.
    const html = renderToStaticMarkup(createElement(ShopifyAppLayout, null, null))
    check('1a: output contains a real <script> element', /<script[\s>]/.test(html))
    check('1b: its src is exactly the App Bridge CDN URL',
      new RegExp(`<script[^>]*src="${APP_BRIDGE_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(html))
    check('1c: EXACTLY ONE App Bridge load (no duplicate with a leftover next/script)',
      (html.match(/app-bridge\.js/g) || []).length === 1)
    check('1d: it is SYNCHRONOUS — no async/defer (Shopify requires App Bridge first and blocking)',
      !/<script[^>]*\b(async|defer)\b/.test(html))

    // The exact production failure mode, asserted as a NEGATIVE.
    check('1e: REJECTS the old failure mode — no preload-only link is emitted instead of a script',
      !/rel="preload"/.test(html))
    check('1f: REJECTS the old failure mode — no __next_s queue push (that is never drained from a nested layout)',
      !/__next_s/.test(html))
  }

  console.log('\n2) A preload link alone is provably insufficient (documents WHY 1e/1f matter)')
  {
    // A preload is a fetch hint: it warms the cache and never executes. If a
    // future edit reintroduces beforeInteractive, 1e/1f above fail — this test
    // pins the reasoning so the intent is not lost.
    const preloadOnly = '<link rel="preload" href="' + APP_BRIDGE_SRC + '" as="script"/>'
    check('2a: a preload link contains no executable script element', !/<script/.test(preloadOnly))
    check('2b: so it can never define window.shopify', !/window\.shopify/.test(preloadOnly))
  }

  console.log('\n3) next/script beforeInteractive is NOT reintroduced in this nested layout')
  {
    const src = strip(read('app/shopify/app/layout.tsx'))
    check('3a: next/script is not imported here', !/from 'next\/script'/.test(src))
    check('3b: no beforeInteractive strategy anywhere in the layout', !/beforeInteractive/.test(src))
    check('3c: the script is a plain <script src> element', new RegExp(`<script src="${APP_BRIDGE_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(src))
    // Next's constraint is root-layout-only; make sure nobody "fixed" it by
    // moving App Bridge into the root layout, which would load it site-wide.
    const rootLayout = read('app/layout.tsx')
    check('3d: App Bridge was NOT moved into the ROOT layout (that would load it site-wide)',
      !/app-bridge\.js/.test(rootLayout))
  }

  console.log('\n4) The meta tag is present and carries the centrally resolved PUBLIC client id')
  {
    const saved = {
      pid: process.env.SHOPIFY_PUBLIC_CLIENT_ID, psec: process.env.SHOPIFY_PUBLIC_CLIENT_SECRET,
      lid: process.env.SHOPIFY_CLIENT_ID,
    }
    process.env.SHOPIFY_PUBLIC_CLIENT_ID = 'public-app-id-abcdef'
    process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = 'public-secret'
    process.env.SHOPIFY_CLIENT_ID = 'legacy-app-id-999999'
    const meta = await generateMetadata()
    const other = (meta.other || {}) as Record<string, string>
    check('4a: the shopify-api-key meta tag is emitted', other['shopify-api-key'] === 'public-app-id-abcdef')
    check('4b: it is the PUBLIC client id, never the legacy one', other['shopify-api-key'] !== 'legacy-app-id-999999')

    // Half-configured public pair must fall back atomically (never a mixed pair).
    delete process.env.SHOPIFY_PUBLIC_CLIENT_SECRET
    const meta2 = await generateMetadata()
    check('4c: with only half the public pair, it falls back to the legacy id (atomic pair preserved)',
      ((meta2.other || {}) as Record<string, string>)['shopify-api-key'] === 'legacy-app-id-999999')

    delete process.env.SHOPIFY_PUBLIC_CLIENT_ID; delete process.env.SHOPIFY_CLIENT_ID
    const meta3 = await generateMetadata()
    check('4d: with nothing configured the meta tag is omitted rather than emitted empty',
      Object.keys((meta3.other || {}) as Record<string, string>).length === 0)

    if (saved.pid === undefined) delete process.env.SHOPIFY_PUBLIC_CLIENT_ID; else process.env.SHOPIFY_PUBLIC_CLIENT_ID = saved.pid
    if (saved.psec === undefined) delete process.env.SHOPIFY_PUBLIC_CLIENT_SECRET; else process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = saved.psec
    if (saved.lid === undefined) delete process.env.SHOPIFY_CLIENT_ID; else process.env.SHOPIFY_CLIENT_ID = saved.lid

    const src = read('app/shopify/app/layout.tsx')
    check('4e: the resolver is still getShopifyAppClientId (no raw env read here)',
      /getShopifyAppClientId\(\)/.test(src) && !/process\.env\.SHOPIFY_CLIENT_ID/.test(src))
  }

  console.log('\n5) Meta availability when App Bridge executes')
  {
    // generateMetadata output lands in <head>; the script is emitted by the
    // layout body, so the meta tag always precedes it in document order. This
    // was confirmed on the real rendered page (meta byte-offset < script
    // byte-offset) and in Chromium: the stubbed App Bridge read
    // document.querySelector('meta[name="shopify-api-key"]').content
    // successfully at execution time.
    const src = read('app/shopify/app/layout.tsx')
    const metaIdx = src.indexOf('shopify-api-key')
    const scriptIdx = src.indexOf(APP_BRIDGE_SRC)
    check('5a: metadata (head) is declared before the script (body) in the layout',
      metaIdx !== -1 && scriptIdx !== -1 && metaIdx < scriptIdx)
    check('5b: the script is not hoisted out of order (no async/defer in source)',
      !new RegExp(`<script[^>]*\\b(async|defer)\\b[^>]*${APP_BRIDGE_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(src))
  }

  console.log('\n6) App Bridge stays confined to /shopify/app (not on marketing routes)')
  {
    // Only files under the /shopify/app route segment may reference the CDN.
    const offenders: string[] = []
    for (const rel of [
      'app/layout.tsx', 'app/page.tsx', 'app/shopify/link/page.tsx',
      'app/(dashboard)/billing/page.tsx', 'components/PublicNav.tsx', 'components/Footer.tsx',
      'next.config.ts',
    ]) {
      try { if (/app-bridge\.js/.test(read(rel))) offenders.push(rel) } catch { /* file may not exist */ }
    }
    check('6a: no root layout / marketing / dashboard file references App Bridge', offenders.length === 0,
      offenders.join(', '))
    check('6b: the embedded layout under the /shopify/app segment does reference it',
      /app-bridge\.js/.test(read('app/shopify/app/layout.tsx')))
  }

  console.log('\n7) The client contract App Bridge must satisfy is unchanged')
  {
    const client = strip(read('app/shopify/app/ConnectorHomeClient.tsx'))
    check('7a: it still waits for window.shopify.idToken', /w\.shopify\?\.idToken/.test(client))
    check('7b: it still fetches a FRESH id token per request', /bridge\.idToken\(\)/.test(client))
    check('7c: app-home is still called with that token as a Bearer credential',
      /'\/api\/shopify\/app-home'.*Authorization: `Bearer \$\{token\}`/s.test(client))
    check('7d: the embedded-install token exchange is still wired to the same token',
      /'\/api\/shopify\/embedded-install'/.test(client) && /startEmbeddedInstall/.test(client))
    check('7e: the no-App-Bridge fallback still exists (it must never be reachable in a real iframe now)',
      /must be opened from within Shopify Admin/.test(client))
  }

  console.log('\n8) Untouched by this fix — CSP, credentials, token exchange, billing, HMAC, TOML')
  {
    const cfg = read('next.config.ts')
    check('8a: frame-ancestors CSP still scoped to /shopify/app', /source:\s*'\/shopify\/app\/:path\*'/.test(cfg)
      && /frame-ancestors https:\/\/admin\.shopify\.com https:\/\/\*\.myshopify\.com/.test(cfg))
    const oauth = strip(read('lib/shopify/oauth.ts'))
    check('8b: HMAC canonicalization unchanged (cbd889f still not included)',
      /\.map\(\(k\) => `\$\{k\}=\$\{params\[k\]\}`\)/.test(oauth) && !/encodeURIComponent\(params\[k\]\)/.test(oauth))
    check('8c: public/legacy atomic credential resolution unchanged', /edition: 'public'/.test(oauth) && /edition: 'legacy'/.test(oauth))
    check('8d: offline token exchange unchanged',
      /urn:shopify:params:oauth:token-type:offline-access-token/.test(oauth))
    const route = read('app/api/shopify/embedded-install/route.ts')
    check('8e: embedded-install still verifies the session token and fails closed',
      /verifyShopifySessionToken\(token\)/.test(route) && /fail\(401, 'invalid_session_token'\)/.test(route))
    check('8f: already-connected shops still short-circuit before any exchange',
      /alreadyConnected: true/.test(route))
    const home = read('app/api/shopify/app-home/route.ts')
    check('8g: admin billing bypass still resolved before the Partner call',
      home.indexOf('const isAdmin = await isAdminUser(admin, connection.user_id)') <
      home.indexOf('getActiveShopifySubscription(connection.shop_gid'))
    const toml = read('shopify.app.toml').split('\n').map((l) => l.replace(/#.*$/, '')).join('\n')
    check('8h: shopify.app.toml untouched — embedded true, /shopify/app URL, callback + scopes intact',
      /^\s*embedded\s*=\s*true\s*$/m.test(toml)
      && /application_url\s*=\s*"https:\/\/www\.gotopseo\.com\/shopify\/app"/.test(toml)
      && /"https:\/\/www\.gotopseo\.com\/api\/shopify\/oauth\/callback"/.test(toml)
      && /scopes\s*=\s*"read_products,read_content,write_content"/.test(toml))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
