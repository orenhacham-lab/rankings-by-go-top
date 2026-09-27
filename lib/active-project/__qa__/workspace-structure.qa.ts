/**
 * WORKSPACE STRUCTURE — every screen is a tab of the current project.
 *
 * The app used to have a Clients tab, a Projects tab and a project page that held
 * a project's keywords, AI visibility, content connection and Search Console. The
 * project is picked in the top bar now, and each of those is a tab scoped to it.
 * This suite holds the contracts that restructure depends on:
 *
 *  A) the retired project page is a redirect that keeps every old link working
 *     (Shopify "Open dashboard", the Shopify and Search Console returns,
 *     bookmarks) and can never send anyone off the site;
 *  S) so is the retired Search Console screen (/content/search-console): Search
 *     Console feeds the other screens now, and its address forwards to keyword
 *     research, or with a connection result to the Search Console section of
 *     settings, keeping projectId and lang;
 *  B) nothing inside the app links to either any more;
 *  C) a project created a moment ago is adopted from the url, after validation;
 *  D) creating a project opens it;
 *  E) the switcher is the tour's first stop in every state, and keeps a way to
 *     the inactive projects;
 *  F) the workspace gate answers in the right order, and every dead end has a
 *     way out; the row it shows is never the previous project's;
 *  G) the tabs that replaced the project page are behind the same sign-in and
 *     subscription gate it was;
 *  H) the dashboard and the scans list read the current project only.
 *
 * Source guards strip comments first. Every guard has a mutation control that
 * breaks the rule on purpose and shows the guard fails.
 *
 * Run: npx tsx lib/active-project/__qa__/workspace-structure.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { projectPageRedirect, PROJECT_PAGE_SECTION_PATHS, searchConsoleScreenRedirect, SEARCH_CONSOLE_SCREEN_PATH } from '../project-page-redirect'
import { deriveRow, withDeadline, type RowRead } from '../useProjectRow'
import type { Project } from '../../supabase/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))

const ORIGIN = 'https://app.test'
const FIXED_PATHS = ['/dashboard', '/settings', ...new Set(Object.values(PROJECT_PAGE_SECTION_PATHS))]
const FIXED_ANCHORS = ['', '#platform', '#search-console']

async function main() {
  console.log('Workspace structure — every screen is a tab of the current project')

  // ── A) the retired project page ────────────────────────────────────────────
  console.log('\nA) /projects/{id} redirects, keeping every old link working')
  {
    const r = projectPageRedirect
    check('A1: a plain link opens the project\'s dashboard', r('p1', {}) === '/dashboard?projectId=p1', r('p1', {}))
    check('A2: the Shopify handoff\'s language is carried through the hop',
      r('p1', { lang: 'en' }) === '/dashboard?lang=en&projectId=p1', r('p1', { lang: 'en' }))
    check('A3: each section deep link lands on the tab that owns it',
      r('p1', { section: 'ai-visibility' }) === '/ai-visibility?projectId=p1'
      && r('p1', { section: 'rankings' }) === '/keywords?projectId=p1'
      && r('p1', { section: 'reports' }) === '/keywords?projectId=p1'
      && r('p1', { section: 'content' }) === '/settings?projectId=p1#platform')
    const oddSections = ['nope', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '']
    check('A4: an unknown section, prototype names included, goes to the dashboard',
      oddSections.every((section) => r('p1', { section }) === '/dashboard?projectId=p1'),
      oddSections.map((section) => r('p1', { section })).join(' | '))
    check('A5: a Shopify connection or billing result lands on the platform section of settings, with the result and its reason',
      r('p1', { shopify: 'error', reason: 'shop_mismatch' }) === '/settings?shopify=error&reason=shop_mismatch&projectId=p1#platform')
    check('A6: a Search Console result lands on the Search Console section of settings, even over a section link',
      r('p1', { gsc: 'connected', section: 'ai-visibility' }) === '/settings?gsc=connected&projectId=p1#search-console'
      && r('p1', { gsc_error: 'denied' }) === '/settings?gsc_error=denied&projectId=p1#search-console')
    check('A7: the project is the one in the address; a projectId in the query cannot replace it',
      r('p1', { projectId: 'other', project_id: 'other2' }) === '/dashboard?projectId=p1')

    // Never off the site, whatever the request carries.
    const hostile: Record<string, string | string[]>[] = [
      { section: '//evil.test' }, { section: 'https://evil.test' }, { section: '/\\evil.test' },
      { next: 'https://evil.test' }, { section: ['ai-visibility', '//evil.test'] }, { lang: ['en', 'he'] },
    ]
    const ids = ['p1', '../../admin', '//evil.test', 'a b?c#d', 'https://evil.test']
    const staysOnSite = (fn: typeof r) => ids.every((id) => hostile.every((q) => {
      const out = fn(id, q)
      const url = new URL(out, ORIGIN)
      return url.origin === ORIGIN
        && FIXED_PATHS.includes(url.pathname)
        && FIXED_ANCHORS.includes(url.hash)
        && url.searchParams.get('projectId') === id
    }))
    check('A8: every destination is a fixed path and section on this site, carrying the id only as a parameter', staysOnSite(r))
    const broken = (id: string, q: Record<string, string | string[] | undefined>) =>
      `${typeof q.section === 'string' && q.section ? q.section : `/projects/${id}`}?projectId=${id}`
    check('A-MUT: a redirect that trusts the section as a path fails A8', !staysOnSite(broken))
    const anchorFromRequest = (id: string, q: Record<string, string | string[] | undefined>) =>
      `${r(id, {})}#${typeof q.section === 'string' ? q.section : ''}`
    check('A-MUT2: a redirect that takes its anchor from the request fails A8', !staysOnSite(anchorFromRequest))

    // The anchors only help if the screen scrolls to them: its sections render
    // after the project loads, later than the browser's own jump to the anchor.
    const scrollsToSection = (src: string) =>
      /const id = window\.location\.hash\.slice\(1\)/.test(src)
      && /id !== PROJECT_CONNECTION_ANCHOR && id !== SETTINGS_GSC_ANCHOR/.test(src)
      && /document\.getElementById\(id\)\?\.scrollIntoView\(/.test(src)
      && /new ResizeObserver\(jump\)/.test(src)
    const settingsSrc = strip(read('app/(dashboard)/settings/page.tsx'))
    check('A11: settings scrolls to the linked section once the project has loaded', scrollsToSection(settingsSrc))
    check('A11-MUT: without the scroll, A11 fails',
      !scrollsToSection(settingsSrc.replace('document.getElementById(id)?.scrollIntoView(', 'void (')))

    // Outside the (dashboard) group, whose layout wraps pages in Suspense: a
    // redirect thrown inside a boundary is streamed and run by the browser; here
    // it is a plain HTTP 307 (the reviewer journey measures the status).
    const outsideGroup = (paths: string[]) => paths.includes('app/projects/[id]/page.tsx')
      && !paths.includes('app/(dashboard)/projects/[id]/page.tsx')
    const present = ['app/projects/[id]/page.tsx', 'app/(dashboard)/projects/[id]/page.tsx'].filter((f) => existsSync(join(ROOT, f)))
    check('A10: the redirect lives outside the Suspense-wrapped dashboard group', outsideGroup(present), present.join(', '))
    check('A-MUT: the page back inside the group fails A10', !outsideGroup([...present, 'app/(dashboard)/projects/[id]/page.tsx']))
    const page = code('app/projects/[id]/page.tsx')
    const onlyRedirects = (src: string) => !/'use client'/.test(src)
      && /redirect\(projectPageRedirect\(id, await searchParams\)\)/.test(src)
      && !/createClient|\.from\(|fetch\(/.test(src)
    check('A9: the page is a server-side redirect that reads nothing', onlyRedirects(page))
    check('A-MUT: a page that still loads the project fails A9',
      !onlyRedirects(page + "\nconst row = await createClient().from('projects')"))
  }

  // ── S) the retired Search Console screen ───────────────────────────────────
  console.log('\nS) /content/search-console redirects: keyword research, or settings for a connection result')
  {
    const r = searchConsoleScreenRedirect
    check('S1: a plain link opens keyword research, where the opportunities are now',
      r({}) === '/keyword-research' && r({ projectId: 'p1' }) === '/keyword-research?projectId=p1', r({ projectId: 'p1' }))
    check('S2: the project and the language are carried through the hop',
      r({ projectId: 'p1', lang: 'en' }) === '/keyword-research?projectId=p1&lang=en', r({ projectId: 'p1', lang: 'en' }))
    check('S3: a Search Console result lands on the Search Console section of settings, with the project and language',
      r({ gsc: 'connected', projectId: 'p1' }) === '/settings?gsc=connected&projectId=p1#search-console'
      && r({ projectId: 'p1', gsc_error: 'access_denied', lang: 'he' }) === '/settings?projectId=p1&gsc_error=access_denied&lang=he#search-console',
      r({ projectId: 'p1', gsc_error: 'access_denied', lang: 'he' }))
    check('S3b: an empty result value still counts as a result (the panel reads and clears it)',
      r({ gsc: '' }) === '/settings?gsc=#search-console', r({ gsc: '' }))
    const hostile: Record<string, string | string[]>[] = [
      {}, { next: 'https://evil.test' }, { gsc: '//evil.test' }, { gsc_error: 'https://evil.test' },
      { projectId: '//evil.test' }, { projectId: ['p1', 'https://evil.test'], lang: ['en', 'he'] }, { section: '/\\evil.test' },
    ]
    const paths = ['/keyword-research', '/settings']
    const anchors = ['', '#search-console', '#platform']
    const staysOnSite = (fn: typeof r) => hostile.every((q) => {
      const url = new URL(fn(q), ORIGIN)
      const sent = q.projectId === undefined ? [] : Array.isArray(q.projectId) ? q.projectId : [q.projectId]
      return url.origin === ORIGIN && paths.includes(url.pathname) && anchors.includes(url.hash)
        && JSON.stringify(url.searchParams.getAll('projectId')) === JSON.stringify(sent)
    })
    check('S4: every destination is a fixed path and section on this site; the request only ever fills parameters', staysOnSite(r))
    const trustsNext = (q: Record<string, string | string[] | undefined>) => (typeof q.next === 'string' ? q.next : r(q))
    check('S-MUT: a redirect that follows a `next` parameter fails S4', !staysOnSite(trustsNext))
    const resultAsPath = (q: Record<string, string | string[] | undefined>) => (typeof q.gsc === 'string' ? `${q.gsc}#search-console` : r(q))
    check('S-MUT2: a redirect that builds its path from the result fails S4', !staysOnSite(resultAsPath))

    // A plain HTTP 307 before anything renders: outside the Suspense-wrapped group.
    const PAGE = 'app/content/search-console/page.tsx'
    const IN_GROUP = 'app/(dashboard)/content/(workspace)/search-console/page.tsx'
    const outsideGroup = (files: string[]) => files.includes(PAGE) && !files.includes(IN_GROUP)
    const present = [PAGE, IN_GROUP].filter((f) => existsSync(join(ROOT, f)))
    check('S5: the redirect lives outside the dashboard group, and the old screen\'s page is gone', outsideGroup(present), present.join(', '))
    check('S5-MUT: the screen back inside the group fails S5', !outsideGroup([...present, IN_GROUP]))
    const onlyRedirects = (src: string) => !/'use client'/.test(src)
      && /redirect\(searchConsoleScreenRedirect\(await searchParams\)\)/.test(src)
      && !/createClient|\.from\(|fetch\(/.test(src)
    const page = code(PAGE)
    check('S6: the page is a server-side redirect that reads nothing', onlyRedirects(page))
    check('S6-MUT: a page that renders the old screen instead fails S6',
      !onlyRedirects(page.replace('redirect(searchConsoleScreenRedirect(await searchParams))', 'return null')))
    check('S7: the address it answers is the retired screen\'s', SEARCH_CONSOLE_SCREEN_PATH === '/content/search-console')
  }

  // ── B) no link inside the app points at the retired page ─────────────────
  console.log('\nB) links inside the app go to the tabs, not to the retired page')
  {
    const tsxFiles = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
      const rel = `${dir}/${d.name}`
      if (d.isDirectory()) return d.name === '__qa__' || d.name === 'node_modules' ? [] : tsxFiles(rel)
      return d.name.endsWith('.tsx') ? [rel] : []
    })
    // A path that STARTS with /projects/{id}; /api/projects/{id}/… is the API, not the page.
    const RETIRED_LINK = /(?<![\w-])\/projects\/(\$\{|['"]\s*\+)/
    const linking = (files: { path: string; src: string }[]) => files.filter((f) => RETIRED_LINK.test(f.src)).map((f) => f.path)
    const files = ['app', 'components'].flatMap(tsxFiles).map((path) => ({ path, src: code(path) }))
    check('B1: no screen or component links to /projects/{id}', linking(files).length === 0, linking(files).join(', '))
    check('B-MUT: a component linking there is found',
      linking([...files, { path: 'components/x.tsx', src: '<Link href={`/projects/${project.id}`}>' }]).length === 1)
    // The addresses that still point there are outside the app and go through the
    // redirect on purpose: the Shopify app home and the Shopify connection returns.
    check('B2: the Shopify app home still hands off through the redirect, with its language',
      /externalUrlWithLocale\(config\.appUrl, `\/projects\/\$\{encodeURIComponent\(connection\.project_id\)\}`, surfaceLocale\)/
        .test(code('app/api/shopify/app-home/route.ts')))
    check('B3: the Shopify returns name the result as `shopify`, which A5 routes to settings',
      /\{ shopify: 'error', reason \}/.test(code('app/api/shopify/oauth/start/route.ts'))
      && /shopify: 'warning', reason: 'no_active_plan'/.test(code('app/api/shopify/billing/return/route.ts')))

    // Nor at the retired Search Console screen: not a link, not a nav entry, not the
    // OAuth return. Its path is named once, where its redirect is declared.
    const sourceFiles = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
      const rel = `${dir}/${d.name}`
      if (d.isDirectory()) return d.name === '__qa__' || d.name === 'node_modules' ? [] : sourceFiles(rel)
      return /\.tsx?$/.test(d.name) ? [rel] : []
    })
    const naming = (list: { path: string; src: string }[]) => list.filter((f) => f.src.includes('/content/search-console')).map((f) => f.path)
    const all = ['app', 'components', 'lib'].flatMap(sourceFiles).map((path) => ({ path, src: code(path) }))
    const named = naming(all)
    check('B4: only the redirect\'s own module names /content/search-console',
      named.length === 1 && named[0] === 'lib/active-project/project-page-redirect.ts', named.join(', '))
    check('B4-MUT: an OAuth return still pointing there is found',
      naming([...all, { path: 'app/api/gsc/callback/route.ts', src: "new URL(returnHub ? '/content/search-console' : '/settings', origin)" }]).length === 2)
  }

  // ── C) a project created a moment ago is adopted from the url ────────────
  console.log('\nC) the provider adopts a new project from the url, once validated')
  {
    const provider = code('lib/active-project/ActiveProjectProvider.tsx')
    const reloadsOnce = (src: string) =>
      /else if \(!reloadedForUrlIds\.current\.has\(urlId\)\) \{\s*reloadedForUrlIds\.current\.add\(urlId\)\s*setIsResolved\(false\)\s*void loadProjects\(\)/.test(src)
    check('C1: an id the list does not know reloads the list ONCE, unresolved meanwhile', reloadsOnce(provider))
    check('C2: the reload resolves against the CURRENT url, not the first render\'s',
      /readUrlProjectId\(searchParamsRef\.current\)/.test(provider))
    check('C3: a url id is adopted only when it validates against the user\'s own list',
      /if \(isValidActiveId\(urlId, projectsRef\.current\)\) \{\s*setActiveProjectId\(urlId\)/.test(provider))
    check('C-MUT: a reload without the once-guard fails C1',
      !reloadsOnce(provider.replace('else if (!reloadedForUrlIds.current.has(urlId)) {', 'else {')))
  }

  // ── D) creating a project opens it ───────────────────────────────────────
  console.log('\nD) a new project opens as the current project, on its settings')
  {
    const route = code('app/api/projects/create/route.ts')
    check('D1: the create route returns the new row\'s id (RLS-proven by project-create-returning.probe.sql)',
      /\.insert\(data\)\.select\('id'\)\.single\(\)/.test(route) && /\{ success: true, data: insertResult \}/.test(route))
    const form = code('components/projects/ProjectForm.tsx')
    check('D2: the form reads the id defensively and hands it on',
      /createdId = typeof created\?\.data\?\.id === 'string' \? created\.data\.id : undefined/.test(form) && /onSuccess\(createdId\)/.test(form))
    const newPage = code('app/(dashboard)/projects/new/page.tsx')
    const opensEncoded = (src: string) =>
      /router\.push\(createdId \? `\/settings\?projectId=\$\{encodeURIComponent\(createdId\)\}` : '\/dashboard'\)/.test(src)
    check('D3: the new project opens on its settings, its id encoded', opensEncoded(newPage))
    check('D-MUT: an unencoded id fails D3', !opensEncoded(newPage.replace('encodeURIComponent(createdId)', 'createdId')))
  }

  // ── E) the switcher ──────────────────────────────────────────────────────
  console.log('\nE) the switcher: the tour\'s first stop, and the way to inactive projects')
  {
    const sw = code('components/layout/WorkspaceSwitcher.tsx')
    const anchored = (src: string) => (src.match(/data-onboarding="workspace"/g) ?? []).length === 4
    check('E1: every state the switcher renders carries the tour anchor (error, loading, first project, list)', anchored(sw))
    check('E-MUT: a state without the anchor fails E1', !anchored(sw.replace('data-onboarding="workspace" className="text-sm text-muted"', 'className="text-sm text-muted"')))
    check('E2: the menu keeps a link to the project list, where inactive projects are',
      /href="\/projects"/.test(sw) && /\{t\.manage\}/.test(sw))
    const tour = code('components/onboarding/DashboardOnboardingTour.tsx')
    check('E3: the tour starts at the switcher for a new account, past it otherwise',
      /\{ step: 'createProject', selector: '\[data-onboarding="workspace"\]' \}/.test(tour)
      && /const getStartStep = useCallback\(\(\) => \(totalProjects === 0 \? 0 : 1\), \[totalProjects\]\)/.test(tour))
    const dash = code('app/(dashboard)/dashboard/page.tsx')
    check('E4: the tour waits for the project list before it decides',
      /\{isResolved && !projectsError && <DashboardOnboardingTour totalProjects=\{projects\.length\} \/>\}/.test(dash))
  }

  // ── F) the workspace gate ────────────────────────────────────────────────
  console.log('\nF) the workspace gate answers in order, and never shows the previous project')
  {
    const gate = code('components/layout/WorkspaceGate.tsx')
    const MARKERS = ['if (isResolved && projectsError)', 'if (isResolved && !activeProjectId)', "if (status === 'error')",
      "if (isResolved && status === 'missing')", "if (!isResolved || status === 'loading' || !project)", 'children(project, reload)']
    const ordered = (src: string) => MARKERS.every((m, i) => src.indexOf(m) > 0 && (i === 0 || src.indexOf(m) > src.indexOf(MARKERS[i - 1])))
    check('F1: list failure, no project, row failure, missing, loading, then the tab', ordered(gate))
    check('F-MUT: the spinner before the failure fails F1',
      !ordered(gate.replace("if (status === 'error')", 'if (false)').replace('if (!isResolved ||', "if (status === 'error') {}\n  if (!isResolved ||")))
    check('F2: every dead end offers its one way out',
      /title=\{t\.projectsLoadError\} action=\{<Button onClick=\{reloadProjects\}>/.test(gate)
      && /title=\{t\.projectLoadError\} action=\{<Button onClick=\{reload\}>/.test(gate)
      && /title=\{t\.projectMissing\} action=\{<Button onClick=\{reloadProjects\}>/.test(gate)
      && /<Link href="\/projects\/new"><Button>\{t\.noProjectCta\}<\/Button><\/Link>/.test(gate))

    // The row state machine itself.
    const row = (id: string) => ({ id } as unknown as Project)
    const at = (projectId: string, attempt: number, r: Project | null, failed = false): RowRead => ({ projectId, attempt, row: r, failed })
    check('F3: no project is `missing`', deriveRow(null, null, 0).status === 'missing')
    check('F4: before the first read, `loading`', deriveRow('p1', null, 0).status === 'loading')
    const switched = deriveRow('p2', at('p1', 0, row('p1')), 0)
    check('F5: after a switch, the PREVIOUS project\'s row is never handed out', switched.status === 'loading' && switched.project === null)
    check('F6: a read of this project shows its row', deriveRow('p1', at('p1', 0, row('p1')), 0).project?.id === 'p1')
    check('F7: a reload keeps the row on screen while it refetches', deriveRow('p1', at('p1', 0, row('p1')), 1).status === 'ready')
    check('F8: a failed read is an error; its retry reads as loading again',
      deriveRow('p1', at('p1', 0, null, true), 0).status === 'error' && deriveRow('p1', at('p1', 0, null, true), 1).status === 'loading')
    check('F9: a row that did not come back is `missing`, not an error', deriveRow('p1', at('p1', 0, null), 0).status === 'missing')

    const late = await withDeadline(new Promise((resolve) => setTimeout(() => resolve('late'), 200)), 20)
    const rejected = await withDeadline(Promise.reject(new Error('boom')), 50)
    const onTime = await withDeadline(Promise.resolve('ok'), 50)
    check('F10: a bounded read ends as null on a stall or a failure, and as its value on time',
      late === null && rejected === null && onTime === 'ok', JSON.stringify({ late, rejected, onTime }))
  }

  // ── G) the tabs are behind the gate the project page was ─────────────────
  console.log('\nG) sign-in and subscription gate')
  {
    const proxy = code('proxy.ts')
    const gated = (src: string) => {
      const block = src.slice(src.indexOf('const isProtectedRoute'), src.indexOf('if (!user && isProtectedRoute)'))
      return ['/dashboard', '/projects', '/keywords', '/scans', '/reports', '/settings', '/ai-visibility']
        .every((p) => block.includes(`pathname.startsWith('${p}')`))
    }
    check('G1: every tab that replaced the project page is a protected route', gated(proxy))
    check('G-MUT: a /settings outside the gate fails G1', !gated(proxy.replace("pathname.startsWith('/settings') ||", '')))
  }

  // ── H) the dashboard and the scans list read the current project only ───
  console.log('\nH) per-project reads')
  {
    const scoped = (src: string) => {
      const reads = src.match(/\.from\('[a-z_]+'\)/g) ?? []
      return reads.length > 0
        && !/\.from\('(clients|projects)'\)/.test(src)
        && !/\.eq\('user_id'/.test(src)
        && (src.match(/\.eq\('project_id', (projectId|project\.id)\)/g) ?? []).length
          + (src.match(/\.in\('tracking_target_id', targetIds\)/g) ?? []).length === reads.length
    }
    const dash = code('app/(dashboard)/dashboard/page.tsx')
    const scans = code('app/(dashboard)/scans/page.tsx')
    check('H1: every dashboard read is filtered to the current project', scoped(dash))
    check('H2: the scans list reads the current project\'s scans only', scoped(scans))
    check('H-MUT: an account-wide read fails H1',
      !scoped(dash + "\nsupabase.from('clients').select('*').eq('user_id', user.id)"))
    const research = code('app/(dashboard)/keyword-research/page.tsx')
    check('H3: keyword research adds to the current project, with no project picker of its own',
      /useActiveProject\(\)/.test(research) && !/setSelectedProject|fetch\('\/api\/projects'\)/.test(research))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
