/**
 * Who owns the publishing-platform connection.
 *
 * This replaces the old K3 contract ("connect WordPress/Shopify from the Content Hub").
 * That contract put a second copy of the connect forms inside the content page, next to
 * the article table, the automation queue and the pending topics — which is exactly what
 * made that page a catch-all nobody could read.
 *
 * The rule now: connection MANAGEMENT belongs to the project, in its settings screen
 * (it was a section of the project page until that page became tabs). The content
 * screens show WHERE articles publish (a Shopify queue can block on a missing default
 * blog, so the destination has to be visible with the articles) and link to the
 * project's settings for anything that changes the connection. No content screen
 * carries a connect form.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import * as setupLinks from '../../../../lib/content/content-hub-setup'
import { platformSetupHref, settingsGscHref } from '../../../../lib/content/content-hub-setup'

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
  const settingsPage = strip(read(join('app', '(dashboard)', 'settings', 'page.tsx')))
  const section = strip(read(join('components', 'content', 'ContentSection.tsx')))
  const articles = strip(read(join(WORKSPACE, 'ArticlesScreen.tsx')))

  // ── 1. No connect form anywhere in the content workspace. ──
  check('no content workspace file imports a connection panel',
    !/import WordPressConnectionPanel/.test(workspaceSrc) && !/import ShopifyConnectionPanel/.test(workspaceSrc),
    workspaceFiles.join(' '))
  check('…nor renders one', !/<WordPressConnectionPanel/.test(workspaceSrc) && !/<ShopifyConnectionPanel/.test(workspaceSrc))
  check('…and defines no credential / OAuth / token logic of its own',
    !/oauth\/start|exchangeCodeForToken|access_token|app_password/.test(workspaceSrc))

  // ── 2. The project's settings own it, through the section that already did. ──
  check("the project's settings render ContentSection", /<ContentSection projectId=\{project\.id\}/.test(settingsPage))
  check('ContentSection owns BOTH panels', /import WordPressConnectionPanel/.test(section) && /import ShopifyConnectionPanel/.test(section))
  check('and enforces platform exclusivity in the UI (one platform at a time)',
    /wpConnected/.test(section) && /shopifyConnected/.test(section))

  // ── 3. The panels still own the flow — nothing was reimplemented. ──
  const shopifyPanel = strip(read(join('components', 'content', 'ShopifyConnectionPanel.tsx')))
  // Owner, 5 Oct 2026: a store connects ONLY by installing from the Shopify App
  // Store, so the panel links to the listing and runs no OAuth of its own — no
  // typed-in shop domain, no authorize URL, no direct /oauth/start redirect.
  const shopifyPanelNoOAuth = (src: string) =>
    /href=\{SHOPIFY_APP_STORE_URL\}/.test(src)
    && !/\/api\/shopify\/oauth\/start/.test(src)
    && !/admin\/oauth\/authorize/.test(src)
    && !/myshopify\.com/.test(src)
  check('Shopify connect goes through the App Store listing, with no OAuth or domain field of its own',
    shopifyPanelNoOAuth(shopifyPanel))
  check('…MUTATION: a reinstated direct OAuth redirect is caught',
    !shopifyPanelNoOAuth(shopifyPanel + "\nwindow.location.href = `/api/shopify/oauth/start?projectId=${projectId}`"))

  // ── 4. A merchant on the articles screen can still SEE and REACH the connection. ──
  check('the articles screen shows the platform-aware destination card',
    /<ContentHubPlatformCard/.test(articles))
  // …but only once a platform IS connected. With none connected, the setup card above it
  // already asks for exactly that, and two cards asking one question is the clutter this
  // split exists to remove.
  check('…only when a platform is connected, so it never duplicates the setup card',
    // …and only once THIS project's overview said which platform (lib/connection-status).
    /\{data && activePlatform !== 'none' && \([\s\S]{0,200}<ContentHubPlatformCard/.test(articles))
  check('MUT: the card drawn before the overview answered (no data gate) fails that check',
    !/\{data && activePlatform !== 'none' && \([\s\S]{0,200}<ContentHubPlatformCard/.test(articles.replace("{data && activePlatform !== 'none' && (", "{activePlatform !== 'none' && (")))
  // The link and its target are both built from one constant, so they cannot drift.
  const linksToSettings = (src: string) => /href=\{platformSetupHref\(projectId\)\}/.test(src) && /t\.manageConnection/.test(src)
  const anchorsPlatform = (src: string) => /id=\{PROJECT_CONNECTION_ANCHOR\}[\s\S]{0,120}<ContentSection /.test(src)
  const anchorsGsc = (src: string) => /id=\{SETTINGS_GSC_ANCHOR\}[\s\S]{0,120}<GscPanel /.test(src)
  check("…and links to the project's settings, where the connection is managed", linksToSettings(articles))
  check('the settings screen carries that anchor, around the connect section', anchorsPlatform(settingsPage))
  check('…and the Search Console anchor, around the Search Console panel', anchorsGsc(settingsPage))
  // The onboarding card that asks a merchant to connect must reach the same place,
  // naming the project so the link opens it whichever project is current.
  check("the setup card links to the project's settings, not to a panel that is no longer there",
    platformSetupHref('p1') === '/settings?projectId=p1#platform'
    && !/scrollIntoView/.test(strip(read(join('components', 'content', 'ContentHubSetup.tsx')))))
  check("the Search Console CTA links to the same settings screen's Search Console section",
    settingsGscHref('p1') === '/settings?projectId=p1#search-console'
    && platformSetupHref('a b') === '/settings?projectId=a%20b#platform')

  // Mutation controls: the retired destinations must fail these checks.
  check('MUT: an articles screen linking to the retired project page fails the link check',
    !linksToSettings(articles.replace('href={platformSetupHref(projectId)}', 'href={`/projects/${projectId}#content-section`}')))
  check('MUT: a settings screen with a hand-typed anchor fails the anchor check',
    !anchorsPlatform(settingsPage.replace('id={PROJECT_CONNECTION_ANCHOR}', 'id="content-section"'))
    && !anchorsGsc(settingsPage.replace('id={SETTINGS_GSC_ANCHOR}', 'id="gsc-section"')))
  // The Search Console card links to the settings section that owns the panel, the same
  // place every Search Console widget sends a merchant: the content workspace's Search
  // Console screen, where the card used to point, is gone.
  const setupCard = strip(read(join('components', 'content', 'ContentHubSetup.tsx')))
  const gscCardToSettings = (src: string) => /<Link href=\{settingsGscHref\(projectId\)\}>/.test(src) && !/search-console#|gscSetupHref/.test(src)
  check("and the Search Console setup card links to that settings section, naming the project",
    gscCardToSettings(setupCard))
  check('…and the helper that linked to the retired screen is gone',
    !('gscSetupHref' in setupLinks) && !('GSC_SETUP_ANCHOR' in setupLinks))
  check('MUT: a card still linking to the retired Search Console screen fails that check',
    !gscCardToSettings(setupCard.replace('<Link href={settingsGscHref(projectId)}>', "<Link href={'/content/search-console#hub-setup-gsc'}>")))

  // ── 5. Returning from Shopify OAuth still lands in the content workspace (K1). ──
  const cb = strip(read(join('app', 'api', 'shopify', 'oauth', 'callback', 'route.ts')))
  check('Shopify OAuth returns to the content workspace on success (K1)',
    /contentHubReturnUrl\(appUrl, st\.project_id\)/.test(cb))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
