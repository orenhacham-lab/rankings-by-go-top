/**
 * K3 — initiate WP/Shopify connection from the Content Hub, reusing the existing
 * self-contained panels (no duplicated credential/OAuth logic), refreshing the hub
 * in place, and returning to the hub after the Shopify OAuth round-trip (via K1).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function main() {
  console.log('K3 — connect WP/Shopify from the Content Hub')

  const hub = strip(read('components/content/ContentHub.tsx'))
  check('hub reuses the existing WordPress + Shopify panels (no new connect UI)',
    /import WordPressConnectionPanel/.test(hub) && /import ShopifyConnectionPanel/.test(hub))
  check('WordPress panel is wired to refresh the hub after connect/disconnect', /<WordPressConnectionPanel projectId=\{projectId\} onChanged=\{load\}/.test(hub))
  check('Shopify connect is offered ONLY when no platform is connected (exclusivity)',
    /activePlatform === 'none' &&[\s\S]{0,120}<ShopifyConnectionPanel projectId=\{projectId\} onChanged=\{load\}/.test(hub))
  check('hub does NOT redirect away on WP connect (no onConnected in the hub mount)',
    !/<WordPressConnectionPanel[^>]*onConnected/.test(hub))

  // The panels own the credential/OAuth flow — the hub adds none of its own.
  const shopifyPanel = strip(read('components/content/ShopifyConnectionPanel.tsx'))
  check('Shopify connect reuses the existing OAuth start route (no duplicated OAuth)',
    /\/api\/shopify\/oauth\/start\?projectId=/.test(shopifyPanel))
  check('hub itself defines no Shopify OAuth / token logic', !/oauth\/start|exchangeCodeForToken|access_token/.test(hub))

  // Returning to the hub after Shopify OAuth is handled by K1 (callback → /content).
  const cb = strip(read('app/api/shopify/oauth/callback/route.ts'))
  check('Shopify OAuth returns to the Content Hub on success (K1)', /contentHubReturnUrl\(appUrl, st\.project_id\)/.test(cb))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
