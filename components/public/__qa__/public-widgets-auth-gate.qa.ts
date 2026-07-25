/**
 * J1 — the floating public contact widgets (WhatsApp / phone / mobile bar) must
 * hide for authenticated users, on every route, while still showing for
 * unauthenticated public visitors on the public pages.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { shouldRenderPublicWidgets } from '../PublicSiteWidgets'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function main() {
  console.log('J1 — public contact widgets auth gate')

  // Authenticated → NEVER render, on public-ish routes OR app routes.
  check('authenticated + home "/" → hidden', shouldRenderPublicWidgets(true, '/') === false)
  check('authenticated + legal page → hidden', shouldRenderPublicWidgets(true, '/accessibility') === false)
  check('authenticated + English legal → hidden', shouldRenderPublicWidgets(true, '/en/privacy') === false)
  check('authenticated + app route → hidden', shouldRenderPublicWidgets(true, '/dashboard') === false)

  // Unauthenticated → render on public pages (contact preserved for visitors).
  check('unauth + home "/" → shown', shouldRenderPublicWidgets(false, '/') === true)
  check('unauth + legal page → shown', shouldRenderPublicWidgets(false, '/accessibility') === true)
  check('unauth + English legal → shown', shouldRenderPublicWidgets(false, '/en/privacy') === true)
  check('unauth + public feature page → shown', shouldRenderPublicWidgets(false, '/features/keyword-research') === true)

  // Unauthenticated → still hidden inside the app / auth shells (unchanged pathname gate).
  check('unauth + /dashboard → hidden', shouldRenderPublicWidgets(false, '/dashboard') === false)
  check('unauth + /keywords → hidden', shouldRenderPublicWidgets(false, '/keywords') === false)
  check('unauth + /login → hidden', shouldRenderPublicWidgets(false, '/login') === false)
  check('unauth + /keyword-research (app) → hidden, but /features/... stays public',
    shouldRenderPublicWidgets(false, '/keyword-research') === false && shouldRenderPublicWidgets(false, '/features/keyword-research') === true)

  console.log('SOURCE) auth is resolved server-side and passed to the widget')
  const layout = strip(read('app/layout.tsx'))
  check('root layout is async + reads auth via getUser()', /async function RootLayout/.test(layout) && /supabase\.auth\.getUser\(\)/.test(layout))
  check('root layout passes isAuthenticated to the widget', /<PublicSiteWidgets isAuthenticated=\{isAuthenticated\}/.test(layout))
  check('auth failure defaults to the safe public behavior (no app break)', /catch\s*\{[\s\S]*isAuthenticated = false/.test(layout))
  const widget = strip(read('components/public/PublicSiteWidgets.tsx'))
  check('widget early-returns null when it should not render', /if \(!shouldRenderPublicWidgets\([\s\S]*return null/.test(widget))
  check('widget still preserves the pathname gate for unauth visitors', /isNonPublicArea/.test(widget))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
