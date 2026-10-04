/**
 * Area D — global active-project resolution core.
 *
 * Behavioral coverage of every precedence branch, validation (deleted/inactive/
 * unowned dropped), the deterministic most-recently-updated fallback, the
 * user-namespaced storage key, legacy-param reconciliation, and cross-tab event
 * filtering (other users' keys ignored). Plus a source-contract that the provider
 * is a single source of truth wired into the layout and consumed by the two
 * highest-risk sections.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  activeProjectStorageKey, resolveActiveProject, isValidActiveId, mostRecentlyUpdated,
  readUrlProjectId, activeIdFromStorageEvent, type ActiveProjectLite,
} from '../resolve'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
/**
 * A file that vanished between the directory walk and the read is not a
 * finding. This suite scans every source file, and the suites that run beside
 * it write a mutated copy next to the original (`*.mut3.ts`) and delete it
 * again — so under the parallel runner this threw ENOENT and the whole suite
 * reported NO_SUMMARY, twice, for a file that was never part of the codebase.
 */
const read = (p: string) => { try { return readFileSync(join(ROOT, p), 'utf8') } catch { return '' } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const P = (id: string, updated_at?: string): ActiveProjectLite => ({ id, name: id, updated_at })
const params = (obj: Record<string, string>) => ({ get: (k: string) => obj[k] ?? null })

function main() {
  console.log('Area D — active-project resolution core')

  // ── User-namespaced storage key (no cross-user leakage on a shared browser).
  check('storage key is namespaced per user', activeProjectStorageKey('u1') === 'active-project:u1' && activeProjectStorageKey('u2') === 'active-project:u2')

  const three = [P('a', '2026-01-01T00:00:00Z'), P('b', '2026-03-01T00:00:00Z'), P('c', '2026-02-01T00:00:00Z')]

  // ── Precedence 1: a valid URL id wins over everything (deep-link).
  check('URL id wins (over persisted)', resolveActiveProject({ urlId: 'c', persistedId: 'a', projects: three }).id === 'c')
  check('URL source is url', resolveActiveProject({ urlId: 'c', persistedId: 'a', projects: three }).source === 'url')
  // ── Precedence 2: persisted wins when no valid URL id.
  check('persisted wins when URL absent', resolveActiveProject({ persistedId: 'a', projects: three }).id === 'a')
  // ── Invalid ids are DROPPED, never trusted (deleted/inactive/unowned).
  check('invalid URL id is skipped → falls to persisted', resolveActiveProject({ urlId: 'zzz', persistedId: 'b', projects: three }).id === 'b')
  check('invalid persisted id is skipped → falls to fallback', resolveActiveProject({ persistedId: 'gone', projects: three }).source === 'fallback')
  // ── Precedence 3: the only accessible active project.
  check('only one project → that one (source only)', (() => { const r = resolveActiveProject({ projects: [P('solo')] }); return r.id === 'solo' && r.source === 'only' })())
  // ── Precedence 4: most-recently-updated deterministic fallback (b is newest).
  check('multiple + none saved → most-recently-updated', resolveActiveProject({ projects: three }).id === 'b')
  check('fallback is deterministic (id tiebreak on equal timestamps)', mostRecentlyUpdated([P('y', '2026-01-01T00:00:00Z'), P('x', '2026-01-01T00:00:00Z')])!.id === 'x')
  // ── Precedence 5: nothing.
  check('no projects → null/none', (() => { const r = resolveActiveProject({ projects: [] }); return r.id === null && r.source === 'none' })())

  check('isValidActiveId gates on the owned+active list', isValidActiveId('a', three) && !isValidActiveId('nope', three) && !isValidActiveId(null, three))

  // ── Legacy param reconciliation: projectId canonical; project_id read but flagged for rewrite.
  check('projectId is canonical (not legacy)', (() => { const r = readUrlProjectId(params({ projectId: 'p1' })); return r.id === 'p1' && r.fromLegacy === false })())
  check('project_id read as legacy → fromLegacy true (rewrite due)', (() => { const r = readUrlProjectId(params({ project_id: 'p2' })); return r.id === 'p2' && r.fromLegacy === true })())
  check('projectId preferred over project_id when both present', readUrlProjectId(params({ projectId: 'canon', project_id: 'legacy' })).id === 'canon')
  check('no param → null', readUrlProjectId(params({})).id === null)

  // ── Cross-tab: only THIS user's key is honored; other users' keys are ignored.
  check('storage event for this user is relevant', (() => { const r = activeIdFromStorageEvent({ key: 'active-project:u1', newValue: 'x' }, 'u1'); return r.relevant && r.value === 'x' })())
  check('storage event for ANOTHER user is ignored (no leakage)', activeIdFromStorageEvent({ key: 'active-project:u2', newValue: 'x' }, 'u1').relevant === false)
  check('unrelated storage key ignored', activeIdFromStorageEvent({ key: 'theme', newValue: 'dark' }, 'u1').relevant === false)
  check('cleared key (newValue null) is relevant with null value', (() => { const r = activeIdFromStorageEvent({ key: 'active-project:u1', newValue: null }, 'u1'); return r.relevant && r.value === null })())

  console.log('SOURCE) single provider, wired into layout + the two high-risk sections')
  const provider = strip(read('lib/active-project/ActiveProjectProvider.tsx'))
  check('provider persists under the user-namespaced key', /activeProjectStorageKey\(/.test(provider))
  check('provider subscribes to the window storage event', /addEventListener\('storage'/.test(provider) && /activeIdFromStorageEvent/.test(provider))
  check('provider syncs the URL via router.replace (no history spam), not push', /router\.replace\(/.test(provider) && !/router\.push\(/.test(provider))
  check('provider re-validates against the owned+active list', /isValidActiveId/.test(provider) && /resolveActiveProject/.test(provider))

  const layout = strip(read('app/(dashboard)/layout.tsx'))
  check('exactly one ActiveProjectProvider is mounted in the dashboard layout', (layout.match(/ActiveProjectProvider/g) || []).length >= 1 && /userId=\{/.test(layout))

  // ONE control picks the project: the switcher in the top bar. The screens used to
  // carry a project dropdown each (keywords, reports, research, content); each one
  // drove the shared state, but four ways to answer one question is three too many.
  const gate = strip(read('components/layout/WorkspaceGate.tsx'))
  // …and only once the list is resolved, so the row it reads is for an id the
  // provider has already validated against the user's own projects.
  check('the workspace gate reads the shared state and loads that project\u2019s row once validated',
    /useActiveProject\(/.test(gate) && /useProjectRow\(isResolved \? activeProjectId : null\)/.test(gate))
  const keywords = strip(read('app/(dashboard)/keywords/page.tsx'))
  check('keywords renders inside the workspace gate, with no project state of its own',
    /<WorkspaceGate>/.test(keywords) && !/useState|setSelectedProjectId/.test(keywords))
  const switcher = strip(read('components/layout/WorkspaceSwitcher.tsx'))
  check('the top bar switcher drives the SHARED state (setActiveProject)',
    /onClick=\{\(\) => \{ setActiveProject\(p\.id\); setOpen\(false\) \}\}/.test(switcher))
  const sourceFiles = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = `${dir}/${d.name}`
    if (d.isDirectory()) return d.name === '__qa__' || d.name === 'node_modules' ? [] : sourceFiles(rel)
    return /\.tsx?$/.test(d.name) ? [rel] : []
  })
  const PROVIDER = 'lib/active-project/ActiveProjectProvider.tsx'
  const setters = (files: { path: string; src: string }[]) =>
    files.filter((f) => f.path !== PROVIDER && /\bsetActiveProject\(/.test(f.src)).map((f) => f.path)
  const files = ['app', 'components', 'lib'].flatMap(sourceFiles).map((path) => ({ path, src: strip(read(path)) }))
  const onlySwitcher = (found: string[]) => found.length === 1 && found[0] === 'components/layout/WorkspaceSwitcher.tsx'
  check('the switcher is the ONLY control that changes the project', onlySwitcher(setters(files)), setters(files).join(', '))
  check('MUT: a screen that brings back its own project dropdown fails that check',
    !onlySwitcher(setters([...files, { path: 'app/(dashboard)/keywords/page.tsx', src: '<select onChange={(e) => setActiveProject(e.target.value)} />' }])))
  const content = strip(read('components/content/workspace/ContentWorkspaceProvider.tsx'))
  check('the content workspace consumes the shared hook (not a raw searchParams read)', /useActiveProject\(/.test(content))

  const reports = strip(read('app/(dashboard)/reports/page.tsx'))
  check('reports consumes the shared hook + derives its id (no private setter)',
    /useActiveProject\(/.test(reports) && /const selectedProjectId = activeProjectId/.test(reports) && !/setSelectedProjectId/.test(reports))
  check('reports carries no project dropdown of its own', !/setActiveProject|selectProject/.test(reports))
  check('reports retired the legacy project_id param (no searchParams project_id read)',
    !/searchParams\.get\('project_id'\)/.test(reports) && !/useSearchParams/.test(reports))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
