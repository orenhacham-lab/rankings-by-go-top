/**
 * Sidebar navigation contract.
 *
 * Replaces the old `sidebar-order` guard, which pinned a flat list with
 * "Content Hub immediately after Projects". The nav is now declared as named
 * GROUPS, so the contract worth holding changed: not "which entry follows
 * which", but "every entry sits in a named group, every label exists in both
 * languages, and every href is a real route".
 *
 * Since the content workspace lost its hub entry, the sidebar also carries the four
 * content SCREENS directly, derived from CONTENT_SCREENS rather than re-listed here.
 * That is the second contract below: derived, not duplicated, and one active entry.
 *
 * Mostly a SOURCE guard — it reads Sidebar.tsx and the two dictionaries and strips
 * comments before matching, so prose in a comment can never satisfy a check. The
 * active-entry resolution is imported and tested as a function.
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { CONTENT_SCREENS, CONTENT_ROOT_PATH, CONTENT_TOPICS_PATH } from '../../../lib/content/content-workspace-nav'
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

  const entries = [...groupedSource.matchAll(/href: '(\/[a-z-]+)', labelKey: '([A-Za-z]+)'/g)]
    .map((m) => ({ href: m[1], labelKey: m[2] }))

  check('nav entries were found at all', entries.length >= 8, `found ${entries.length}`)

  for (const { href, labelKey } of entries) {
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

  // ── Exactly one entry is current, whichever content screen is open ────────
  // /content is a PREFIX of /content/topics, so a plain prefix test lit up two
  // entries at once. The resolution keeps the longest match.
  // The naive rule this replaced — "pathname starts with href" — matches BOTH the
  // articles entry and the nested one. Asserting that it still would is what proves
  // the resolution is doing work, not that the paths happen not to collide.
  const naiveMatches = (pathname: string) =>
    navItemKeys.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).length
  check('the articles entry is current on the workspace root',
    activeNavHref(CONTENT_ROOT_PATH, navItemKeys) === CONTENT_ROOT_PATH)
  check('a nested screen matches TWO entries by prefix, and only the nested one is current',
    naiveMatches(CONTENT_TOPICS_PATH) === 2
    && activeNavHref(CONTENT_TOPICS_PATH, navItemKeys) === CONTENT_TOPICS_PATH)
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
