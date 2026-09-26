/**
 * Who owns the publishing-platform connection.
 *
 * This replaces the old K3 contract ("connect WordPress/Shopify from the Content Hub").
 * That contract put a second copy of the connect forms inside the content page, next to
 * the article table, the automation queue and the pending topics — which is exactly what
 * made that page a catch-all nobody could read.
 *
 * The rule now: connection MANAGEMENT belongs to the project. The content screens show
 * WHERE articles publish (a Shopify queue can block on a missing default blog, so the
 * destination has to be visible with the articles) and link to the project for anything
 * that changes the connection. No content screen carries a connect form.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { platformSetupHref, gscSetupHref } from '../../../../lib/content/content-hub-setup'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const WORKSPACE = join('components', 'content', 'workspace')
/** Every file of the content workspace, so a connect form cannot reappear in a new screen. */
const workspaceFiles = readdirSync(join(ROOT, WORKSPACE), { withFileTypes: true })
  .filter((d) => d.isFile() && (d.name.endsWith('.tsx') || d.name.endsWith('.ts')))
  .map((d) => join(WORKSPACE, d.name))

function main() {
  console.log('Connection ownership — the project, not the content screens')

  const workspaceSrc = workspaceFiles.map((p) => strip(read(p))).join('\n')
  const projectPage = strip(read(join('app', '(dashboard)', 'projects', '[id]', 'page.tsx')))
  const section = strip(read(join('components', 'content', 'ContentSection.tsx')))
  const articles = strip(read(join(WORKSPACE, 'ArticlesScreen.tsx')))

  // ── 1. No connect form anywhere in the content workspace. ──
  check('no content workspace file imports a connection panel',
    !/import WordPressConnectionPanel/.test(workspaceSrc) && !/import ShopifyConnectionPanel/.test(workspaceSrc),
    workspaceFiles.join(' '))
  check('…nor renders one', !/<WordPressConnectionPanel/.test(workspaceSrc) && !/<ShopifyConnectionPanel/.test(workspaceSrc))
  check('…and defines no credential / OAuth / token logic of its own',
    !/oauth\/start|exchangeCodeForToken|access_token|app_password/.test(workspaceSrc))

  // ── 2. The project page owns it, through the section that already did. ──
  check('the project page renders ContentSection', /<ContentSection projectId=\{id\}/.test(projectPage))
  check('ContentSection owns BOTH panels', /import WordPressConnectionPanel/.test(section) && /import ShopifyConnectionPanel/.test(section))
  check('and enforces platform exclusivity in the UI (one platform at a time)',
    /wpConnected/.test(section) && /shopifyConnected/.test(section))

  // ── 3. The panels still own the flow — nothing was reimplemented. ──
  const shopifyPanel = strip(read(join('components', 'content', 'ShopifyConnectionPanel.tsx')))
  check('Shopify connect reuses the existing OAuth start route (no duplicated OAuth)',
    /\/api\/shopify\/oauth\/start\?projectId=/.test(shopifyPanel))

  // ── 4. A merchant on the articles screen can still SEE and REACH the connection. ──
  check('the articles screen shows the platform-aware destination card',
    /<ContentHubPlatformCard/.test(articles))
  // …but only once a platform IS connected. With none connected, the setup card above it
  // already asks for exactly that, and two cards asking one question is the clutter this
  // split exists to remove.
  check('…only when a platform is connected, so it never duplicates the setup card',
    /\{activePlatform !== 'none' && \([\s\S]{0,200}<ContentHubPlatformCard/.test(articles))
  check('…and links to the project, where the connection is managed',
    /href=\{`\/projects\/\$\{projectId\}#content-section`\}/.test(articles) && /t\.manageConnection/.test(articles))
  check('the project page still carries that anchor', /id="content-section"/.test(projectPage))
  // The onboarding card that asks a merchant to connect must reach the same place.
  check('the setup card links to the project page, not to a panel that is no longer there',
    platformSetupHref('p1') === '/projects/p1#content-section'
    && !/scrollIntoView/.test(strip(read(join('components', 'content', 'ContentHubSetup.tsx')))))
  check('and the Search Console setup card links to the screen that owns that panel',
    gscSetupHref() === '/content/search-console#hub-setup-gsc'
    && /id=\{GSC_SETUP_ANCHOR\}/.test(strip(read(join(WORKSPACE, 'SearchConsoleScreen.tsx')))))

  // ── 5. Returning from Shopify OAuth still lands in the content workspace (K1). ──
  const cb = strip(read(join('app', 'api', 'shopify', 'oauth', 'callback', 'route.ts')))
  check('Shopify OAuth returns to the content workspace on success (K1)',
    /contentHubReturnUrl\(appUrl, st\.project_id\)/.test(cb))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
