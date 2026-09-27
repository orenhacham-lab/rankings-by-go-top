/**
 * The content workspace is one screen per concern.
 *
 * It used to be components/content/ContentHub.tsx: 1,325 lines holding the article
 * table, the pending topics, the automation ideas, the publishing queue, the Search
 * Console area and the WordPress/Shopify connection forms behind internal useState
 * tabs. Nothing had a URL, nothing could be reasoned about alone, and "content" was
 * the one screen a merchant could not describe.
 *
 * This suite pins the shape that replaced it: three routes, one shared provider, one
 * shell, and screens that do not reach into each other. Each screen is also a sidebar
 * entry of its own — the hub entry they used to hide behind is gone — so the workspace
 * has no tab bar and every screen names itself. It is a SOURCE contract: it checks
 * structure, not rendered output; the journeys cover behaviour.
 *
 * There were four until Search Console stopped being a screen: it is a data source of
 * the screens that already exist now (its recommendations are a section of Topics), and
 * its old address is a redirect (section S of lib/active-project/__qa__/workspace-structure.qa.ts
 * pins where it goes).
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  CONTENT_SCREENS, CONTENT_ROOT_PATH, CONTENT_TOPICS_PATH, CONTENT_AUTOMATION_PATH,
  activeContentScreen, isContentScreenEnabled,
} from '../../../../lib/content/content-workspace-nav'
import { getDashboardDictionary } from '../../../../lib/i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const WS = join('components', 'content', 'workspace')
const APP = join('app', '(dashboard)', 'content', '(workspace)')

/** Screen file → the components that belong to OTHER screens and must not appear in it.
 *  Search Console's recommendations belong to Topics now; its data table stays in the
 *  project's settings (GscPanel) and its opportunities in keyword research. */
const NOT_IN: Record<string, readonly string[]> = {
  'ArticlesScreen.tsx': ['AutomationIdeas', 'AutomationSchedule', 'TopicsList', 'NewTopicsLinkPlanPanel', 'GscRecommendations', 'GscMetricsTable', 'GscOpportunities', 'GscPanel'],
  'TopicsScreen.tsx': ['AutomationIdeas', 'AutomationSchedule', 'GscMetricsTable', 'GscOpportunities', 'GscPanel'],
  'AutomationScreen.tsx': ['TopicsList', 'NewTopicsLinkPlanPanel', 'GscRecommendations', 'GscMetricsTable', 'GscOpportunities', 'GscPanel'],
}

/** The workspace's screens, and nothing else: Search Console is not one of them. */
const SCREEN_KEYS = ['articles', 'topics', 'automation']
const isTheThreeScreens = (keys: readonly string[]) => JSON.stringify(keys) === JSON.stringify(SCREEN_KEYS)

const screenFiles = Object.keys(NOT_IN)
const workspaceFiles = readdirSync(join(ROOT, WS), { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith('.tsx'))
  .map((d) => d.name)

/** Resolve an href to its page file, descending through route groups at any depth. */
function routeFileFor(href: string): string | null {
  const segments = href.split('/').filter(Boolean)
  const groupsIn = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('(') && d.name.endsWith(')'))
        .map((d) => d.name)
    } catch { return [] }
  }
  const walk = (dir: string, rest: readonly string[]): string | null => {
    if (rest.length === 0) {
      if (existsSync(join(dir, 'page.tsx'))) return join(dir, 'page.tsx')
      for (const g of groupsIn(dir)) { const hit = walk(join(dir, g), rest); if (hit) return hit }
      return null
    }
    const [head, ...tail] = rest
    if (existsSync(join(dir, head))) { const hit = walk(join(dir, head), tail); if (hit) return hit }
    for (const g of groupsIn(dir)) { const hit = walk(join(dir, g), rest); if (hit) return hit }
    return null
  }
  return walk(join(ROOT, 'app'), segments)
}

function main() {
  console.log('The content workspace — one screen per concern')

  // ── 1. The blob is gone, not renamed. ──
  check('components/content/ContentHub.tsx no longer exists',
    !existsSync(join(ROOT, 'components', 'content', 'ContentHub.tsx')))
  // Every source file, not a list of the places it used to be: the project page
  // that once mounted it is a redirect now, and a list would go stale again.
  check('and nothing imports it', (() => {
    const importers: string[] = []
    const scan = (dir: string) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = join(dir, e.name)
        if (e.isDirectory()) { if (e.name !== '__qa__' && e.name !== 'node_modules') scan(rel); continue }
        if (/\.tsx?$/.test(e.name) && /from '@\/components\/content\/ContentHub'/.test(strip(read(rel)))) importers.push(rel)
      }
    }
    for (const top of ['app', 'components', 'lib']) scan(top)
    return importers.length === 0
  })())

  // ── 2. Every declared screen is a real route. ──
  for (const s of CONTENT_SCREENS) {
    check(`screen "${s.key}" has a page at ${s.href}`, routeFileFor(s.href) !== null)
  }
  check('the screens are articles, topics and automation — Search Console is not a screen',
    isTheThreeScreens(CONTENT_SCREENS.map((s) => s.key)), CONTENT_SCREENS.map((s) => s.key).join(', '))
  check('MUT: a screen list that still declares Search Console fails that check',
    !isTheThreeScreens([...CONTENT_SCREENS.map((s) => s.key), 'searchConsole']))
  check('the Search Console screen has no page and no component inside the workspace',
    !existsSync(join(ROOT, APP, 'search-console')) && !existsSync(join(ROOT, WS, 'SearchConsoleScreen.tsx')))
  check('all three routes live under ONE layout, so the frame is shared',
    existsSync(join(ROOT, APP, 'layout.tsx')))
  // The article editor sits beside them and must NOT inherit the workspace frame —
  // that is why the screens are in a route group of their own.
  check('the article editor is OUTSIDE the workspace group',
    existsSync(join(ROOT, 'app', '(dashboard)', 'content', 'articles', '[id]', 'page.tsx'))
    && !existsSync(join(ROOT, APP, 'articles', '[id]', 'page.tsx')))

  // ── 3. Screens do not bleed into each other. ──
  for (const file of screenFiles) {
    const src = strip(read(join(WS, file)))
    const leaked = NOT_IN[file].filter((c) => new RegExp(`<${c}[\\s/>]`).test(src))
    check(`${file} renders only its own subject`, leaked.length === 0, leaked.join(', '))
  }
  check('Topics carries the Search Console recommendations the retired screen used to show',
    /<GscRecommendations\s/.test(strip(read(join(WS, 'TopicsScreen.tsx')))))

  // ── 4. One loader for the shared payload, in the provider. ──
  const providerSrc = strip(read(join(WS, 'ContentWorkspaceProvider.tsx')))
  const screensSrc = screenFiles.map((f) => strip(read(join(WS, f)))).join('\n')
  check('the overview is fetched ONCE, by the provider',
    /\/api\/content\/overview/.test(providerSrc)
    && !/\/api\/content\/overview/.test(screensSrc))
  check('no screen reads the accessible-project list directly',
    !/useActiveProject\(/.test(screensSrc) && /useActiveProject\(/.test(providerSrc))

  // ── 5. A screen is a route AND a sidebar entry — never a tab, never both. ──
  const allWorkspace = workspaceFiles.map((f) => strip(read(join(WS, f)))).join('\n')
  const sidebarSrc = strip(read(join('components', 'layout', 'Sidebar.tsx')))
  check('nothing in the workspace keeps an activeTab state', !/setActiveTab|activeTab/.test(allWorkspace))
  // The workspace had a tab bar of its own while the four screens hid behind one
  // "Content Hub" sidebar entry. The entry is gone, so the tab bar would now be the
  // same navigation rendered twice.
  check('the workspace has no tab bar of its own',
    !existsSync(join(ROOT, WS, 'ContentNav.tsx')) && !/<ContentNav/.test(allWorkspace))
  check('the sidebar carries the screens instead, derived from CONTENT_SCREENS',
    /CONTENT_SCREENS/.test(sidebarSrc) && /\.\.\.contentNavItems/.test(sidebarSrc))
  check('and marks the current entry for assistive tech', /aria-current=/.test(sidebarSrc))
  // Without a tab bar, the heading is the only thing on the page that says which
  // screen this is — so it must be the SCREEN's name, not one title for all four.
  const shellHeading = strip(read(join(WS, 'ContentWorkspaceShell.tsx')))
  check('each screen names itself in the heading, resolved from the pathname',
    /activeContentScreen\(usePathname\(\)/.test(shellHeading)
    && /title=\{t\.screens\[screen\]\}/.test(shellHeading)
    && /subtitle=\{t\.screenSubtitles\[screen\]\}/.test(shellHeading))

  // ── 6. The frame is mounted once, by the shell. ──
  const shellSrc = strip(read(join(WS, 'ContentWorkspaceShell.tsx')))
  for (const [what, needle] of [['the brief modal', '<ArticleBriefModal'], ['the toast host', '<ToastHost'], ['the setup cards', '<ContentHubSetup']] as const) {
    check(`${what} is mounted exactly once, by the shell`,
      (shellSrc.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length === 1
      && !new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(screensSrc))
  }

  // ── 7. The content flag is checked once, for every screen. ──
  const layoutSrc = strip(read(join(APP, 'layout.tsx')))
  check('the layout gates NEXT_PUBLIC_ENABLE_CONTENT for the whole workspace',
    /NEXT_PUBLIC_ENABLE_CONTENT !== 'true'/.test(layoutSrc))
  check('and it wraps provider + shell (a screen can never render bare)',
    /<ContentWorkspaceProvider>/.test(layoutSrc) && /<ContentWorkspaceShell>/.test(layoutSrc))

  // ── 8. Both locales name every screen, and say what it is. ──
  for (const loc of ['he', 'en'] as const) {
    const hub = getDashboardDictionary(loc).contentHub as unknown as {
      screens?: Record<string, string>
      screenSubtitles?: Record<string, string>
    }
    check(`(${loc}) every screen has a label`,
      !!hub.screens && CONTENT_SCREENS.every((s) => typeof hub.screens![s.key] === 'string' && hub.screens![s.key].length > 0))
    check(`(${loc}) every screen has its own one-line subtitle`,
      !!hub.screenSubtitles
      && CONTENT_SCREENS.every((s) => typeof hub.screenSubtitles![s.key] === 'string' && hub.screenSubtitles![s.key].length > 0)
      && new Set(CONTENT_SCREENS.map((s) => hub.screenSubtitles![s.key])).size === CONTENT_SCREENS.length)
  }

  // ── 9. The pure nav helpers. ──
  check('the root path resolves to the articles screen', activeContentScreen(CONTENT_ROOT_PATH) === 'articles')
  check('a nested path resolves to its own screen, not the root',
    activeContentScreen(CONTENT_AUTOMATION_PATH) === 'automation'
    && activeContentScreen(CONTENT_TOPICS_PATH) === 'topics')
  check('a deeper path still belongs to its screen', activeContentScreen(`${CONTENT_AUTOMATION_PATH}/anything`) === 'automation')
  const flagged = CONTENT_SCREENS.find((s) => s.flag)!
  check('a flagged screen is hidden when its flag is absent, empty or not exactly "true"',
    !isContentScreenEnabled(flagged, {})
    && !isContentScreenEnabled(flagged, { [flagged.flag!]: '' })
    && !isContentScreenEnabled(flagged, { [flagged.flag!]: 'TRUE' })
    && isContentScreenEnabled(flagged, { [flagged.flag!]: 'true' }))
  check('an unflagged screen is always reachable', isContentScreenEnabled(CONTENT_SCREENS[0], {}))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
