/**
 * Sidebar navigation contract.
 *
 * Replaces the old `sidebar-order` guard, which pinned a flat list with
 * "Content Hub immediately after Projects". The nav is now declared as named
 * GROUPS, so the contract worth holding changed: not "which entry follows
 * which", but "every entry sits in a named group, every label exists in both
 * languages, and every href is a real route".
 *
 * Since the content workspace lost its hub entry, the sidebar also carries the
 * content SCREENS directly, derived from CONTENT_SCREENS rather than re-listed here.
 * That is the second contract below: derived, not duplicated, and one active entry.
 * Search Console is not one of them any more: it feeds the other screens, and its
 * connection is a section of the project's settings.
 *
 * Mostly a SOURCE guard — it reads Sidebar.tsx and the two dictionaries and strips
 * comments before matching, so prose in a comment can never satisfy a check. The
 * active-entry resolution is imported and tested as a function.
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { CONTENT_SCREENS, CONTENT_ROOT_PATH, CONTENT_STRATEGY_PATH, CONTENT_EXISTING_PATH, CONTENT_TOPICS_PATH, CONTENT_AUTOMATION_PATH } from '../../../lib/content/content-workspace-nav'
import { getDashboardDictionary } from '../../../lib/i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const ROOT = join(__dirname, '..', '..', '..')

/** Next.js route groups under app/ — "(dashboard)", "(setup)", … */
/**
 * Does this href have a page? A route group — a directory in (parentheses) — adds a
 * layout without adding a URL segment, and may appear at ANY depth: /content lives at
 * app/(dashboard)/content/(workspace)/page.tsx, because the content screens share a
 * layout that the article editor beside them must not inherit. So resolution walks the
 * href's real segments and is free to descend through any number of groups on the way.
 */
function routeExists(href: string): boolean {
  const segments = href.split('/').filter(Boolean)
  const groupsIn = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('(') && d.name.endsWith(')'))
        .map((d) => d.name)
    } catch { return [] }
  }
  const walk = (dir: string, rest: readonly string[]): boolean => {
    if (rest.length === 0) {
      // The page may sit directly here, or one or more route groups deeper.
      if (existsSync(join(dir, 'page.tsx'))) return true
      return groupsIn(dir).some((g) => walk(join(dir, g), rest))
    }
    const [head, ...tail] = rest
    if (existsSync(join(dir, head)) && walk(join(dir, head), tail)) return true
    return groupsIn(dir).some((g) => walk(join(dir, g), rest))
  }
  return walk(join(ROOT, 'app'), segments)
}


/** The groups, in the order the sidebar must render them. */
const EXPECTED_GROUPS = ['groupMain', 'groupResearch', 'groupMonitoring', 'groupAccount'] as const

/**
 * The nav itself, with the content flag ON so the derived content entries exist.
 * Set before the module is required: `contentNavItems` is resolved at module load,
 * which is exactly how Next inlines the flag into the bundle.
 */
process.env.NEXT_PUBLIC_ENABLE_CONTENT = 'true'
// The same for AI visibility, whose entry is resolved at module load from its flag.
process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY = 'true'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { navItemKeys, activeNavHref } = require('../Sidebar') as {
  navItemKeys: readonly { href: string }[]
  activeNavHref: (pathname: string, items: readonly { href: string }[]) => string | null
}

function main() {
  console.log('Sidebar — grouped navigation contract')

  const src = strip(readFileSync(join(__dirname, '..', 'Sidebar.tsx'), 'utf8'))
  const he = strip(readFileSync(join(ROOT, 'lib/i18n/dashboard/he.ts'), 'utf8'))
  const en = strip(readFileSync(join(ROOT, 'lib/i18n/dashboard/en.ts'), 'utf8'))

  // ── The groups exist, in order ────────────────────────────────────────────
  const groupPositions = EXPECTED_GROUPS.map((g) => src.indexOf(`groupKey: '${g}'`))
  check('every expected group is declared in Sidebar.tsx',
    groupPositions.every((i) => i > 0),
    EXPECTED_GROUPS.filter((_, i) => groupPositions[i] < 0).join(', '))
  check('the groups are declared in the intended order',
    groupPositions.every((p, i) => i === 0 || p > groupPositions[i - 1]))

  // ── Every group heading is translated in BOTH languages ───────────────────
  for (const g of EXPECTED_GROUPS) {
    check(`group heading "${g}" exists in he.ts`, new RegExp(`\\b${g}:\\s*'`).test(he))
    check(`group heading "${g}" exists in en.ts`, new RegExp(`\\b${g}:\\s*'`).test(en))
  }

  // ── Every nav entry: real route + label in both languages ─────────────────
  // Scoped to the navGroupKeys region on purpose: `adminItemKeys` below it is a
  // separate, deliberately flat list for admins and is not part of this contract.
  const regionStart = src.indexOf('const navGroupKeys')
  const regionEnd = src.indexOf('const adminItemKeys')
  check('navGroupKeys is declared before the admin list', regionStart > 0 && regionEnd > regionStart)
  const groupsRegion = src.slice(regionStart, regionEnd)

  // Only the hrefs that sit INSIDE an `items: [ … ]` array are grouped. Anything
  // else in the region is a flat entry that escaped the grouping.
  const groupedSource = [...groupsRegion.matchAll(/items: \[([\s\S]*?)\n {4}\],/g)]
    .map((m) => m[1]).join('\n')
  check('the per-group items arrays were parsed', groupedSource.length > 0)

  const entryPattern = /href: '(\/[a-z-]+)', labelKey: '([A-Za-z]+)'/g
  const entries = [...groupedSource.matchAll(entryPattern)]
    .map((m) => ({ href: m[1], labelKey: m[2] }))
  // Entries behind a build-time flag are declared in a list of their own and spread
  // into their group; they are entries all the same and get the same checks.
  const aiListMatch = src.match(/const aiVisibilityNavItems[\s\S]*?\n\n/)
  const aiList = aiListMatch ? aiListMatch[0] : ''
  const flagged = [...aiList.matchAll(entryPattern)].map((m) => ({ href: m[1], labelKey: m[2] }))
  const allEntries = [...entries, ...flagged]

  check('nav entries were found at all', allEntries.length >= 8, `found ${allEntries.length}`)

  for (const { href, labelKey } of allEntries) {
    check(`"${href}" resolves to a real page`, routeExists(href))
    check(`label "${labelKey}" exists in he.ts`, new RegExp(`\\b${labelKey}:\\s*'`).test(he))
    check(`label "${labelKey}" exists in en.ts`, new RegExp(`\\b${labelKey}:\\s*'`).test(en))
  }

  // ── No nav entry escapes the groups ───────────────────────────────────────
  // A flat entry added after the groups block is exactly the regression this
  // guard exists to catch, so count the hrefs rendered by the mobile grid
  // against the hrefs declared inside the groups.
  const allInRegion = [...groupsRegion.matchAll(/href: '(\/[a-z-]+)', labelKey:/g)].map((m) => m[1])
  const groupedHrefs = new Set(entries.map((e) => e.href))
  const strays = allInRegion.filter((h) => !groupedHrefs.has(h))
  check('no nav entry is declared outside a group', strays.length === 0, strays.join(', '))

  // ── Mobile and desktop cannot drift apart ─────────────────────────────────
  check('the flat mobile list is DERIVED from the groups, never re-declared',
    /const navItemKeys\s*=\s*navGroupKeys\.flatMap/.test(src))
  check('both surfaces render the shared NavLink component',
    (src.match(/<NavLink\b/g) ?? []).length >= 2)

  // ── The content screens are entries of their own, derived from one list ───
  const iResearch = src.indexOf(`groupKey: 'groupResearch'`)
  const iMonitoring = src.indexOf(`groupKey: 'groupMonitoring'`)
  const iContent = src.indexOf('...contentNavItems')
  check('the content screens sit inside the research group',
    iContent > iResearch && iContent < iMonitoring)
  check('…and they are DERIVED from CONTENT_SCREENS, never re-listed here',
    /CONTENT_SCREENS\s*\n?\s*\.filter\(\(s\) => isContentScreenEnabled\(s, CONTENT_FLAGS\)\)/.test(src)
    && /screenKey: s\.key/.test(src))
  check('…gated by the build-time content flag, as the one hub entry was',
    /NEXT_PUBLIC_ENABLE_CONTENT === 'true'/.test(src))
  // A hard-coded content href is the regression: it would survive a screen being
  // renamed, removed or flagged off, and point the merchant at a 404.
  const hardCoded = CONTENT_SCREENS.filter((c) => src.includes(`href: '${c.href}'`)).map((c) => c.href)
  check('no content href is hard-coded in the sidebar', hardCoded.length === 0, hardCoded.join(', '))
  for (const c of CONTENT_SCREENS) {
    check(`content screen "${c.key}" resolves to a real page`, routeExists(c.href))
    for (const loc of ['he', 'en'] as const) {
      const label = getDashboardDictionary(loc).contentHub.screens[c.key]
      check(`(${loc}) content screen "${c.key}" is labelled`, typeof label === 'string' && label.length > 0)
    }
  }
  // The retired hub label must not linger: a "Content Hub" entry in the dictionary is
  // how the concept would creep back into a sidebar that no longer has one screen for it.
  check('the retired hub label is gone from both dictionaries',
    !/\n\s{4}content:\s*'/.test(he) && !/\n\s{4}content:\s*'/.test(en))
  // Search Console left the sidebar with its screen: no entry, icon or flag for it.
  const noSearchConsoleEntry = (sidebar: string) => !/searchConsole|\/content\/search-console|NEXT_PUBLIC_GSC_READ_ONLY_ENABLED/.test(sidebar)
  check('the sidebar has no Search Console entry, icon or flag', noSearchConsoleEntry(src))
  check('MUT: a sidebar with the Search Console icon back fails that check',
    !noSearchConsoleEntry(src.replace('articles: Newspaper,', 'articles: Newspaper,\n  searchConsole: LineChart,')))

  // ── "Topics" and "automation" are ONE entry now: the content strategy (W6c) ──
  // Two entries for what will be written split one question across two screens. The
  // merged tab is one entry, it comes before the articles, and the old two are gone
  // from the declaration, the icons, the runtime list and both dictionaries.
  const contentHrefs = navItemKeys.map((i) => i.href).filter((h) => h === CONTENT_ROOT_PATH || h.startsWith(`${CONTENT_ROOT_PATH}/`))
  // The existing content (what was on the site before us) follows the articles.
  const oneStrategyEntry = (hrefs: readonly string[]) =>
    JSON.stringify(hrefs) === JSON.stringify([CONTENT_STRATEGY_PATH, CONTENT_ROOT_PATH, CONTENT_EXISTING_PATH])
  check('the content entries are the content strategy, then the articles, then the existing content, and nothing else',
    oneStrategyEntry(contentHrefs), contentHrefs.join(', '))
  check('MUT: a nav that keeps the topics and automation entries fails that check',
    !oneStrategyEntry([...contentHrefs, CONTENT_TOPICS_PATH, CONTENT_AUTOMATION_PATH])
    && !oneStrategyEntry([CONTENT_ROOT_PATH, CONTENT_STRATEGY_PATH]))
  const noOldEntries = (sidebar: string) => !/\b(topics|automation):\s*[A-Z]\w*,/.test(sidebar) && /strategy: [A-Z]\w*,/.test(sidebar)
  check('the sidebar icons name the strategy entry, not the two old ones', noOldEntries(src))
  check('MUT: a sidebar with the topics icon back fails that check',
    !noOldEntries(src.replace('articles: Newspaper,', 'articles: Newspaper,\n  topics: Target,')))
  for (const loc of ['he', 'en'] as const) {
    const screens = getDashboardDictionary(loc).contentHub.screens as Record<string, string>
    check(`(${loc}) the dictionary labels the strategy entry and no longer the two old ones`,
      typeof screens.strategy === 'string' && screens.strategy.length > 0 && !('topics' in screens) && !('automation' in screens))
  }
  check('the strategy label is the plan\'s own name for the tab',
    getDashboardDictionary('he').contentHub.screens.strategy === 'אסטרטגיית תוכן'
    && (getDashboardDictionary('en').contentHub.screens.strategy as string) === 'Content strategy')

  // ── Every screen is a tab of the current project ──────────────────────────
  // The project is picked in the top bar's workspace switcher, so there is no
  // Clients tab and no Projects tab to pick it from, and the project's own
  // settings are a tab of their own.
  const noProjectTabs = (hrefs: readonly string[]) => !hrefs.includes('/clients') && !hrefs.includes('/projects')
  check('there is no Clients or Projects tab (declared)', noProjectTabs(allEntries.map((e) => e.href)),
    allEntries.map((e) => e.href).join(', '))
  check('…nor at runtime, in the list both surfaces render', noProjectTabs(navItemKeys.map((i) => i.href)))
  check("the project's settings are a tab of the account group",
    /groupKey: 'groupAccount',\s*items: \[\s*\{ href: '\/settings', labelKey: 'projectSettings'/.test(groupsRegion))
  check('MUT: a nav that brings the Clients tab back fails that check',
    !noProjectTabs([...allEntries.map((e) => e.href), '/clients']))

  // AI visibility is the tool itself, behind the same flag as its page: with the
  // flag off the page says it is not available, so no entry may lead there.
  const aiGated = (sidebarSrc: string) =>
    /const aiVisibilityNavItems[^=]*=\s*process\.env\.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'\s*\?\s*\[\{ href: '\/ai-visibility'/.test(sidebarSrc)
    && !/items: \[[^\]]*href: '\/ai-visibility'/.test(sidebarSrc)
  check('the AI visibility entry is gated by its build-time flag', aiGated(src))
  check('…spread inside the monitoring group',
    groupsRegion.indexOf('...aiVisibilityNavItems') > groupsRegion.indexOf(`groupKey: 'groupMonitoring'`)
    && groupsRegion.indexOf('...aiVisibilityNavItems') < groupsRegion.indexOf(`groupKey: 'groupAccount'`))
  check('…and its page checks the very same flag',
    /process\.env\.NEXT_PUBLIC_ENABLE_AI_VISIBILITY !== 'true'/.test(strip(readFileSync(join(ROOT, 'app/(dashboard)/ai-visibility/page.tsx'), 'utf8'))))
  check('with the flag on, the entry is rendered', navItemKeys.some((i) => i.href === '/ai-visibility'))
  check('MUT: an ungated entry fails the gate check',
    !aiGated(src.replace(/process\.env\.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true'\s*\?/, 'true ?')))

  // ── Exactly one entry is current, whichever content screen is open ────────
  // /content is a PREFIX of /content/strategy, so a plain prefix test lit up two
  // entries at once. The resolution keeps the longest match.
  // The naive rule this replaced — "pathname starts with href" — matches BOTH the
  // articles entry and the nested one. Asserting that it still would is what proves
  // the resolution is doing work, not that the paths happen not to collide.
  const naiveMatches = (pathname: string) =>
    navItemKeys.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).length
  check('the articles entry is current on the workspace root',
    activeNavHref(CONTENT_ROOT_PATH, navItemKeys) === CONTENT_ROOT_PATH)
  check('a nested screen matches TWO entries by prefix, and only the nested one is current',
    naiveMatches(CONTENT_STRATEGY_PATH) === 2
    && activeNavHref(CONTENT_STRATEGY_PATH, navItemKeys) === CONTENT_STRATEGY_PATH)
  check('the article editor keeps the articles entry current',
    activeNavHref(`${CONTENT_ROOT_PATH}/articles/abc-123`, navItemKeys) === CONTENT_ROOT_PATH)
  check('an unrelated path lights nothing', activeNavHref('/nowhere', navItemKeys) === null)
  check('a sibling prefix does not match (/keywords vs /keyword-research)',
    activeNavHref('/keyword-research', navItemKeys) === '/keyword-research')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
