/**
 * Active publishing-platform resolver — the platform-routing matrix + wiring guards.
 *
 * Proves the fix for "Shopify project routed to WordPress": platform selection is by
 * connection VALIDITY (connected), never row existence, so a stale/failed/untested
 * WordPress row never blocks a valid Shopify connection or fabricates a platform_conflict.
 * Guards prove the ONE resolver is used at every dispatch/routing site.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveActivePlatform } from '../platform/active-platform'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const wp = (present: boolean, status: string | null) => ({ present, connectionStatus: status })
const sh = (present: boolean, status: string | null, canPublish = true) => ({ present, connectionStatus: status, canPublish })

async function main() {
  console.log('MATRIX) resolveActivePlatform — validity, not row existence')

  check('WordPress-only connected → wordpress', resolveActivePlatform({ wordpress: wp(true, 'connected'), shopify: sh(false, null) }).platform === 'wordpress')
  check('WordPress-only UNTESTED → wordpress (preserve WordPress semantics)', resolveActivePlatform({ wordpress: wp(true, 'untested'), shopify: sh(false, null) }).platform === 'wordpress')
  check('Shopify-only connected → shopify', resolveActivePlatform({ wordpress: wp(false, null), shopify: sh(true, 'connected') }).platform === 'shopify')
  check('Shopify-only UNTESTED → shopify (its route surfaces the exact state)', resolveActivePlatform({ wordpress: wp(false, null), shopify: sh(true, 'untested') }).platform === 'shopify')

  // THE BUG — a stale/failed/untested WordPress row must NOT block a valid Shopify connection.
  check('FAILED WordPress row + connected Shopify → shopify (no false conflict)', resolveActivePlatform({ wordpress: wp(true, 'failed'), shopify: sh(true, 'connected') }).platform === 'shopify')
  check('UNTESTED WordPress row + connected Shopify → shopify', resolveActivePlatform({ wordpress: wp(true, 'untested'), shopify: sh(true, 'connected') }).platform === 'shopify')
  {
    const r = resolveActivePlatform({ wordpress: wp(true, 'failed'), shopify: sh(true, 'connected') })
    check('… and the stale WordPress row is NOT active', r.wordpressActive === false && r.shopifyActive === true)
  }

  // Two GENUINELY active platforms → explicit conflict.
  check('connected WordPress + connected Shopify → conflict', resolveActivePlatform({ wordpress: wp(true, 'connected'), shopify: sh(true, 'connected') }).platform === 'conflict')

  // Neither active → explicit no-platform state.
  check('neither present → none', resolveActivePlatform({ wordpress: wp(false, null), shopify: sh(false, null) }).platform === 'none')
  check('both present but NEITHER connected → none', resolveActivePlatform({ wordpress: wp(true, 'failed'), shopify: sh(true, 'failed') }).platform === 'none')

  // Shopify connected but missing write_content scope → still routes to shopify (so the
  // exact corrective action surfaces + stays retriable), flagged as needing scope.
  {
    const r = resolveActivePlatform({ wordpress: wp(false, null), shopify: sh(true, 'connected', false) })
    check('connected Shopify WITHOUT publish scope → shopify + shopifyNeedsScope', r.platform === 'shopify' && r.shopifyNeedsScope === true)
  }
  check('connected Shopify WITH scope → shopifyNeedsScope false', resolveActivePlatform({ wordpress: wp(false, null), shopify: sh(true, 'connected', true) }).shopifyNeedsScope === false)

  console.log('GUARD) the ONE resolver is used at every dispatch/routing site')
  {
    const publishItem = read('../automation/publish-item.ts')
    check('publishPoolItem dispatches via loadActivePlatform (not row existence)', /loadActivePlatform\(/.test(publishItem) && /active\.platform === 'conflict'/.test(publishItem) && /active\.platform === 'shopify'/.test(publishItem) && /active\.platform === 'none'/.test(publishItem) && !/select\('id'\)\.eq\('project_id', item\.project_id\)/.test(publishItem))

    const overview = read('../../../app/api/content/overview/route.ts')
    // The response gained `alerts` (the shared read model), so the payload is
    // matched on its members rather than on the exact closing shape.
    check('overview returns shopify + resolved platform + shopify article fields', /resolveActivePlatform\(/.test(overview) && /shopify,\s*platform,/.test(overview) && /shopify_article_id/.test(overview))
    check('overview also returns the shared active-alert decision', /alerts,\s*alertsUnavailable\s*}\)/.test(overview) && /loadActiveAlerts\(/.test(overview))

    const hub = read('../../../components/content/ContentHub.tsx')
    check('ContentHub routes row + batch by activePlatform to the Shopify route', /activePlatform: ActivePlatform = data\?\.platform\?\.platform/.test(hub) && /articles\/\$\{a\.id\}\/shopify/.test(hub) && /articles\/\$\{id\}\/shopify/.test(hub) && /if \(activePlatform === 'shopify'\) \{ await exportRowShopify/.test(hub))
    // The corrective codes used to be an inline three-way ternary here. They now
    // go through ONE localizer (lib/i18n/dashboard/shopify-publish-error.ts),
    // which covers every code in every shape the server emits instead of three
    // of them — so the contract is that the localizer is used, and that the
    // shared dictionary really carries the corrective codes.
    check('ContentHub Shopify row is idempotent + surfaces corrective scope/blog errors',
      /shopifyPublishError\(/.test(hub) && /localizeShopifyPublishError/.test(hub) && /shopify_article_id/.test(hub))
    const genErrors = read('../../i18n/dashboard/en.ts')
    check('the shared dictionary carries the corrective Shopify publish codes',
      /missing_write_content_scope: '/.test(genErrors) && /no_shopify_blog: '/.test(genErrors)
      && /missing_default_blog: '/.test(genErrors) && /blog_lookup_failed: '/.test(genErrors))

    const gate = read('../../../components/content/ArticleEditorPublishGate.tsx')
    check('ArticleEditorPublishGate resolves by validity via the shared resolver', /resolveActivePlatform\(/.test(gate) && /platform === 'conflict'/.test(gate) && /platform === 'wordpress'/.test(gate) && /platform === 'shopify'/.test(gate) && !/setWpConnected\(!!wp\.connection\)/.test(gate))

    const loader = read('../platform/load-active-platform.ts')
    check('server loader reads connection_status + granted_scopes (validity)', /connection_status/.test(loader) && /granted_scopes/.test(loader) && /hasWriteContent/.test(loader))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
