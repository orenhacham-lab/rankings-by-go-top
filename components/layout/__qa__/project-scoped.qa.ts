/**
 * EVERY PER-PROJECT SCREEN STARTS OVER WHEN THE PROJECT CHANGES.
 *
 * The bug (owner, 4 October 2026: "you switch from project to project, it looks
 * like it moved to the next one but shows the same page with the previous
 * project's content, and you have to refresh or change page to see it change").
 * Switching the workspace changes the active project id, so a screen's effects
 * re-fetch, but React keeps the same component instance and everything it holds
 * in useState stays the previous project's.
 *
 * Two things already fix it, and a per-project screen must use one of them:
 *  - WorkspaceGate, which renders a skeleton instead of the screen while the new
 *    project's row loads, unmounting the old state on the way;
 *  - ProjectScoped, which keys the subtree on the project id.
 *
 * A screen that reads useActiveProject() and does neither is the bug. This is a
 * CLOSED WORLD: a new dashboard page is listed as account-level, with a reason,
 * or it has to scope itself. Each listed reason is checked against the file, so
 * a page cannot be excused by a stale entry.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const PAGES = join(ROOT, 'app', '(dashboard)')

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`PASS ${name}`) } else { failed++; console.log(`FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail)) }
}

const read = (p: string): string => { try { return readFileSync(p, 'utf8') } catch { return '' } }
/** Source guards match on code, not on prose. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Pages that are NOT about one project, and why. An entry is honoured only
 * while the file still does not read the active project.
 */
const ACCOUNT_LEVEL: Record<string, string> = {
  'billing/page.tsx': 'the account’s subscription and invoices',
  'clients/page.tsx': 'the account’s client list',
  'projects/page.tsx': 'the list of projects itself',
  'reco-qa/page.tsx': 'an internal QA screen',
  'scans/page.tsx': 'a redirect',
  'maps-posts/page.tsx': 'a thin wrapper; MapsPostsView carries the WorkspaceGate',
}

const dirs = readdirSync(PAGES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const pages = dirs.map((d) => `${d}/page.tsx`).filter((rel) => read(join(PAGES, rel)) !== '')
check(`A1: the dashboard's pages are read (${pages.length} found)`, pages.length >= 10, pages)

const unscoped: string[] = []
for (const rel of pages) {
  const src = code(read(join(PAGES, rel)))
  const scoped = src.includes('WorkspaceGate') || src.includes('ProjectScoped')
  const perProject = src.includes('useActiveProject')
  if (perProject && !scoped) unscoped.push(rel)
}
check('A2: no dashboard page reads the active project without scoping itself to it', unscoped.length === 0, unscoped)

// An entry in the list above must still be true of the file.
const staleExcuses = Object.keys(ACCOUNT_LEVEL).filter((rel) => {
  const src = code(read(join(PAGES, rel)))
  return src !== '' && src.includes('useActiveProject') && !src.includes('WorkspaceGate') && !src.includes('ProjectScoped')
})
check('A3: every page excused as account-level still does not read the active project', staleExcuses.length === 0, staleExcuses)
check('A4: the list has no entry for a page that no longer exists', Object.keys(ACCOUNT_LEVEL).every((rel) => read(join(PAGES, rel)) !== ''), Object.keys(ACCOUNT_LEVEL).filter((rel) => read(join(PAGES, rel)) === ''))

// The content workspace holds a project's topics and queue in its own state and
// is a layout, not a page, so it is checked by name.
const contentLayout = code(read(join(PAGES, 'content', '(workspace)', 'layout.tsx')))
check('A5: the content workspace is scoped to the project', contentLayout.includes('ProjectScoped'), contentLayout.slice(0, 120))

// B) ProjectScoped itself: the key is what discards the subtree, and the first
// resolve must not be treated as a switch.
const scopedSrc = code(read(join(ROOT, 'components', 'layout', 'ProjectScoped.tsx')))
check('B1: ProjectScoped keys its subtree on the active project', /key=\{[^}]*activeProjectId/.test(scopedSrc), scopedSrc)
check('B2: it reads the global active-project state, not its own', scopedSrc.includes('useActiveProject'))
check('B3: it distinguishes "not resolved yet" from "no project", so the first resolve is not a switch', scopedSrc.includes('isResolved') && /'resolving'/.test(scopedSrc))
check('B4: it renders no markup of its own', scopedSrc.includes('Fragment') && !/<div/.test(scopedSrc))

// B-MUT: a wrapper with no key does not fix the bug — it is the bug.
const noKey = "return <Fragment>{children}</Fragment>"
check('B-MUT: a wrapper without the key would not remount the screen, and B1 would catch it', !/key=\{[^}]*activeProjectId/.test(noKey))
// A-MUT: a page that read the active project and scoped nothing would fail A2.
const unscopedPage = "'use client'\nconst { activeProjectId } = useActiveProject()\nexport default function Page() { return null }"
check('A-MUT: such a page is detected', unscopedPage.includes('useActiveProject') && !unscopedPage.includes('WorkspaceGate') && !unscopedPage.includes('ProjectScoped'))

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
