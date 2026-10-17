/**
 * THE RETIRED TOPICS AND AUTOMATION SCREENS (W6c) — redirects into the content
 * strategy tab, and the tab's own addresses.
 *
 *  R) /content/topics and /content/automation answer with a redirect to the strategy
 *     tab's list view, at the section that replaced each, keeping every parameter, and
 *     can never send anyone off the site;
 *  P) each is a plain server redirect outside the dashboard group, and the old screens'
 *     pages are gone;
 *  L) nothing inside the app links to either address any more;
 *  V) the view parameter and the in-app links of the tab.
 *
 * Source guards strip comments first. Every guard has a mutation control.
 *
 * Run: npx tsx lib/content/strategy/__qa__/content-strategy-redirects.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  legacyAutomationRedirect, legacyTopicsRedirect, strategyHref, strategyViewFromParam, STRATEGY_ANCHORS,
} from '../view'
import { CONTENT_AUTOMATION_PATH, CONTENT_STRATEGY_PATH, CONTENT_TOPICS_PATH } from '../../content-workspace-nav'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const ORIGIN = 'https://app.test'
type Q = Record<string, string | string[] | undefined>
type Redirect = (q: Q) => string

async function main() {
  console.log('Content strategy — the retired screens redirect into the tab')

  // ── R) the redirects ──────────────────────────────────────────────────────
  console.log('\nR) where the old addresses land')
  {
    check('R1: a plain link to topics opens the list view at the topics',
      legacyTopicsRedirect({}) === '/content/strategy?view=list#topics', legacyTopicsRedirect({}))
    check('R2: a plain link to automation opens the list view at the ideas (the queue is right below)',
      legacyAutomationRedirect({}) === '/content/strategy?view=list#ideas', legacyAutomationRedirect({}))
    const every: Q = { projectId: 'p1', lang: 'he', section: 'manual', utm_source: ['mail', 'app'] }
    check('R3: every parameter is carried over as it came, the ideas sub-tab included',
      legacyAutomationRedirect(every) === '/content/strategy?projectId=p1&lang=he&section=manual&utm_source=mail&utm_source=app&view=list#ideas',
      legacyAutomationRedirect(every))
    const keepsOnlyProject: Redirect = (q) => legacyAutomationRedirect({ projectId: q.projectId })
    check('R3-MUT: a redirect that keeps only the project fails R3',
      keepsOnlyProject(every) !== legacyAutomationRedirect(every))
    check('R4: the view is the redirect\'s own decision, whatever the link said',
      legacyTopicsRedirect({ view: ['board', 'list'] }) === '/content/strategy?view=list#topics')

    const hostile: Q[] = [
      {}, { next: 'https://evil.test' }, { projectId: '//evil.test' }, { section: '/\\evil.test' }, { view: 'https://evil.test' },
      { lang: ['en', 'https://evil.test#x'] }, { '#': 'x' }, { projectId: ['p1', 'https://evil.test'] },
    ]
    const staysOnSite = (fn: Redirect, anchor: string) => hostile.every((q) => {
      const url = new URL(fn(q), ORIGIN)
      return url.origin === ORIGIN && url.pathname === CONTENT_STRATEGY_PATH && url.hash === `#${anchor}`
        && url.searchParams.getAll('view').join() === 'list'
    })
    check('R5: topics always lands on the strategy tab, at its topics, on this site', staysOnSite(legacyTopicsRedirect, 'topics'))
    check('R6: automation always lands on the strategy tab, at its ideas, on this site', staysOnSite(legacyAutomationRedirect, 'ideas'))
    const followsNext: Redirect = (q) => (typeof q.next === 'string' ? q.next : legacyTopicsRedirect(q))
    check('R-MUT: a redirect that follows `next` fails R5', !staysOnSite(followsNext, 'topics'))
    const anchorFromRequest: Redirect = (q) => (typeof q.section === 'string' ? legacyTopicsRedirect(q).replace(/#.*$/, `#${q.section}`) : legacyTopicsRedirect(q))
    check('R-MUT2: a redirect that takes its section from the request fails R5', !staysOnSite(anchorFromRequest, 'topics'))
    const viewFromRequest: Redirect = (q) => {
      const url = legacyTopicsRedirect(q)
      return typeof q.view === 'string' ? url.replace('view=list', `view=${encodeURIComponent(q.view)}`) : url
    }
    check('R-MUT3: a redirect that keeps the request\'s view fails R5', !staysOnSite(viewFromRequest, 'topics'))
  }

  // ── P) the pages ──────────────────────────────────────────────────────────
  console.log('\nP) plain server redirects, outside the dashboard group')
  {
    const PAGES = [
      ['app/content/topics/page.tsx', 'legacyTopicsRedirect'],
      ['app/content/automation/page.tsx', 'legacyAutomationRedirect'],
    ] as const
    const onlyRedirects = (src: string, fn: string) => !/'use client'/.test(src)
      && new RegExp(`redirect\\(${fn}\\(await searchParams\\)\\)`).test(src)
      && !/createClient|createAdminClient|\.from\(|fetch\(|return </.test(src)
    for (const [path, fn] of PAGES) {
      check(`P1: ${path} is a server redirect that reads nothing`, existsSync(join(ROOT, path)) && onlyRedirects(strip(read(path)), fn))
      check(`P1-MUT: ${path} rendering a screen instead fails P1`,
        !onlyRedirects(strip(read(path)).replace(`redirect(${fn}(await searchParams))`, 'return <TopicsScreen />'), fn))
    }
    const IN_GROUP = ['app/(dashboard)/content/(workspace)/topics/page.tsx', 'app/(dashboard)/content/(workspace)/automation/page.tsx']
    const outside = (present: string[]) => present.every((f) => !IN_GROUP.includes(f))
    const present = IN_GROUP.filter((f) => existsSync(join(ROOT, f)))
    check('P2: the old screens\' pages inside the workspace are gone', outside(present), present.join(', '))
    check('P2-MUT: an old page back inside the group fails P2', !outside([...present, IN_GROUP[0]]))
    check('P3: the strategy tab itself is a page of the workspace',
      existsSync(join(ROOT, 'app/(dashboard)/content/(workspace)/strategy/page.tsx')))
    const page = strip(read('app/(dashboard)/content/(workspace)/strategy/page.tsx'))
    const proFirstFromServer = (s: string) => /<ContentStrategyScreen proFirst=\{isProFirstControllerEnabled\(\)\} \/>/.test(s) && !/'use client'/.test(s)
    check('P4: the tab resolves the Pro-first flag on the server, as the automation page did', proFirstFromServer(page))
    check('P4-MUT: a page that hard-codes it fails P4', !proFirstFromServer(page.replace('proFirst={isProFirstControllerEnabled()}', 'proFirst={true}')))
    check('P5: the addresses are the retired screens\'',
      CONTENT_TOPICS_PATH === '/content/topics' && CONTENT_AUTOMATION_PATH === '/content/automation' && CONTENT_STRATEGY_PATH === '/content/strategy')
  }

  // ── L) no link to the old addresses ───────────────────────────────────────
  console.log('\nL) nothing in the app links to the old addresses')
  {
    const files = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
      const rel = `${dir}/${d.name}`
      if (d.isDirectory()) return d.name === '__qa__' || d.name === 'node_modules' ? [] : files(rel)
      return /\.tsx?$/.test(d.name) ? [rel] : []
    })
    const all = ['app', 'components', 'lib'].flatMap(files).map((path) => ({ path, src: strip(read(path)) }))
    // The address as a literal (not /api/content/automation/…), or the retired constants.
    const OLD = /(?<![\w/-])['"`]\/content\/(topics|automation)(?![\w/-])|CONTENT_(TOPICS|AUTOMATION)_PATH/
    const DECLARATION = 'lib/content/content-workspace-nav.ts'
    const linking = (list: { path: string; src: string }[]) => list.filter((f) => f.path !== DECLARATION && OLD.test(f.src)).map((f) => f.path)
    check('L1: only the nav declaration names the old addresses', linking(all).length === 0, linking(all).join(', '))
    const regressed = [...all, { path: 'components/x.tsx', src: "router.push('/content/topics')" }, { path: 'components/y.tsx', src: 'router.push(CONTENT_AUTOMATION_PATH)' }]
    check('L-MUT: a screen that pushes either old address again fails L1', linking(regressed).length === 2)
    check('L2: the API under /api/content/automation is not mistaken for the screen',
      !OLD.test("fetch('/api/content/automation/pools')") && !OLD.test("fetch(`/api/content/topics?projectId=${id}`)"))
  }

  // ── V) the tab's own addresses ────────────────────────────────────────────
  console.log('\nV) the view and the in-app links')
  {
    check('V1: only the exact value "list" opens the list; anything else is the board',
      strategyViewFromParam('list') === 'list' && ['LIST', '', 'board', 'grid', null, undefined].every((v) => strategyViewFromParam(v) === 'board'))
    check('V2: the board is the tab\'s bare address', strategyHref('board') === '/content/strategy')
    check('V3: a section of the list is the list view with its anchor',
      strategyHref('list', STRATEGY_ANCHORS.queue) === '/content/strategy?view=list#queue'
      && strategyHref('list', STRATEGY_ANCHORS.topics) === '/content/strategy?view=list#topics')
    check('V4: the anchors are the three sections of the list', Object.values(STRATEGY_ANCHORS).sort().join() === 'ideas,queue,topics')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })

export {}
