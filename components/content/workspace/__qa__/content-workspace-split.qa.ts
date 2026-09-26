/**
 * The content workspace is one screen per concern.
 *
 * It used to be components/content/ContentHub.tsx: 1,325 lines holding the article
 * table, the pending topics, the automation ideas, the publishing queue, the Search
 * Console area and the WordPress/Shopify connection forms behind internal useState
 * tabs. Nothing had a URL, nothing could be reasoned about alone, and "content" was
 * the one screen a merchant could not describe.
 *
 * This suite pins the shape that replaced it: four routes, one shared provider, one
 * shell, and screens that do not reach into each other. It is a SOURCE contract —
 * it checks structure, not rendered output; the journeys cover behaviour.
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  CONTENT_SCREENS, CONTENT_ROOT_PATH, CONTENT_AUTOMATION_PATH, CONTENT_SEARCH_CONSOLE_PATH,
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

/** Screen file → the components that belong to OTHER screens and must not appear in it. */
const NOT_IN: Record<string, readonly string[]> = {
  'ArticlesScreen.tsx': ['AutomationIdeas', 'AutomationSchedule', 'TopicsList', 'NewTopicsLinkPlanPanel', 'GscRecommendations', 'GscMetricsTable', 'GscOpportunities', 'GscPanel'],
  'TopicsScreen.tsx': ['AutomationIdeas', 'AutomationSchedule', 'GscRecommendations', 'GscMetricsTable', 'GscOpportunities', 'GscPanel'],
  'AutomationScreen.tsx': ['TopicsList', 'NewTopicsLinkPlanPanel', 'GscRecommendations', 'GscMetricsTable', 'GscOpportunities', 'GscPanel'],
  'SearchConsoleScreen.tsx': ['AutomationIdeas', 'AutomationSchedule', 'TopicsList', 'NewTopicsLinkPlanPanel'],
}

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
  check('and nothing imports it', (() => {
    const all = [...workspaceFiles.map((f) => read(join(WS, f))), read(join('app', '(dashboard)', 'projects', '[id]', 'page.tsx'))].join('\n')
    return !/from '@\/components\/content\/ContentHub'/.test(all)
  })())

  // ── 2. Every declared screen is a real route. ──
  for (const s of CONTENT_SCREENS) {
    check(`screen "${s.key}" has a page at ${s.href}`, routeFileFor(s.href) !== null)
  }
  check('all four routes live under ONE layout, so the frame is shared',
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

  // ── 4. One loader for the shared payload, in the provider. ──
  const providerSrc = strip(read(join(WS, 'ContentWorkspaceProvider.tsx')))
  const screensSrc = screenFiles.map((f) => strip(read(join(WS, f)))).join('\n')
  check('the overview is fetched ONCE, by the provider',
    /\/api\/content\/overview/.test(providerSrc)
    && !/\/api\/content\/overview/.test(screensSrc))
  check('no screen reads the accessible-project list directly',
    !/useActiveProject\(/.test(screensSrc) && /useActiveProject\(/.test(providerSrc))

  // ── 5. A tab is a route, not a piece of state. ──
  const navSrc = strip(read(join(WS, 'ContentNav.tsx')))
  const allWorkspace = workspaceFiles.map((f) => strip(read(join(WS, f)))).join('\n')
  check('nothing in the workspace keeps an activeTab state', !/setActiveTab|activeTab/.test(allWorkspace))
  check('the nav renders Links', /<Link\s/.test(navSrc) && /href=\{s\.href\}/.test(navSrc))
  check('and marks the current screen for assistive tech', /aria-current=/.test(navSrc))
  // A tab a merchant cannot open teaches them nothing; the two disabled placeholders
  // that used to sit in this bar are gone.
  check('no disabled "coming soon" placeholder in the nav',
    !/comingSoon|cursor-not-allowed/.test(navSrc))

  // ── 6. The frame is mounted once, by the shell. ──
  const shellSrc = strip(read(join(WS, 'ContentWorkspaceShell.tsx')))
  for (const [what, needle] of [['the brief modal', '<ArticleBriefModal'], ['the toast host', '<ToastHost'], ['the setup cards', '<ContentHubSetup'], ['the nav', '<ContentNav']] as const) {
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

  // ── 8. Both locales name every screen. ──
  for (const loc of ['he', 'en'] as const) {
    const screens = (getDashboardDictionary(loc).contentHub as unknown as { screens?: Record<string, string> }).screens
    check(`(${loc}) every screen has a label`,
      !!screens && CONTENT_SCREENS.every((s) => typeof screens[s.key] === 'string' && screens[s.key].length > 0))
  }

  // ── 9. The pure nav helpers. ──
  check('the root path resolves to the articles screen', activeContentScreen(CONTENT_ROOT_PATH) === 'articles')
  check('a nested path resolves to its own screen, not the root',
    activeContentScreen(CONTENT_AUTOMATION_PATH) === 'automation'
    && activeContentScreen(CONTENT_SEARCH_CONSOLE_PATH) === 'searchConsole')
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
