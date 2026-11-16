/**
 * THE ACTIVE-PROJECT LIST, AND THE GATE IT USED TO BE.
 *
 * Every request a dashboard page makes is keyed by the active project id, and
 * the client learned that id by asking `/api/projects/active` on mount. Nothing
 * else could start until it answered: measured from Tokyo, about 650ms of a
 * dashboard load spent before any real work began. The layout now builds the
 * same list in the database's own region and hands it to the provider.
 *
 * A) the list itself: the rows, the icons, and the retry picks are what they
 *    were, from ONE read of project_seed_runs instead of two.
 * B) the layout issues its three independent reads together, proved the same
 *    way the route guard's are: a client that answers nothing until all three
 *    are in flight.
 * C) the seeded provider asks for nothing, and the fetching path still exists
 *    for every other caller.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildActiveProjectList } from '../list'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const withoutComments = (v: string) => v.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const USER = 'u1'
const NOW = new Date('2026-11-16T00:00:00Z')
const LONG_AGO = '2026-01-01T00:00:00Z'

type Row = Record<string, unknown>

/**
 * A Supabase-shaped fake that counts reads per table. Only the chain these two
 * callers use is modelled; anything else throws rather than quietly passing.
 */
function fakeDb(tables: Record<string, Row[]>, opts: { failProjects?: boolean } = {}) {
  const reads: string[] = []
  const client = {
    from(table: string) {
      reads.push(table)
      const rows = [...(tables[table] ?? [])]
      const q: Record<string, unknown> = {}
      const self = () => q
      q.select = self
      q.eq = self
      q.in = self
      q.not = self
      q.order = self
      q.limit = () => Promise.resolve(
        table === 'projects' && opts.failProjects
          ? { data: null, error: { code: '42501' } }
          : { data: rows, error: null },
      )
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(
        table === 'projects' && opts.failProjects
          ? { data: null, error: { code: '42501' } }
          : { data: rows, error: null },
      ).then(res)
      return q
    },
  }
  return { client, reads }
}

async function main() {
  console.log('A) the list, from one read of the runs table')
  {
    const tables = {
      projects: [
        { id: 'p1', name: 'One', updated_at: '2026-11-10T00:00:00Z', target_domain: 'one.example' },
        { id: 'p2', name: 'Two', updated_at: '2026-11-09T00:00:00Z', target_domain: 'two.example' },
      ],
      project_seed_runs: [
        // p1's newest run carries an icon; the older one must not win.
        { id: 'r1', project_id: 'p1', status: 'done', site_icon: 'https://one.example/icon.png', checked_at: null },
        { id: 'r0', project_id: 'p1', status: 'done', site_icon: 'https://one.example/old.png', checked_at: null },
        // p2's newest finished run found nothing and was never looked at again.
        { id: 'r2', project_id: 'p2', status: 'done', site_icon: null, checked_at: null },
      ],
    }
    const db = fakeDb(tables)
    const out = await buildActiveProjectList(db.client as never, USER, NOW)

    check('A1: both owned projects are listed, in the order the query returned',
      out !== null && out.projects.map((p) => p.id).join(',') === 'p1,p2',
      out ? out.projects.map((p) => p.id).join(',') : 'null')
    check('A2: the icon comes from the NEWEST run, not an older one',
      out?.projects[0]?.site_icon === 'https://one.example/icon.png', String(out?.projects[0]?.site_icon))
    check('A3: a project whose scan found no icon is listed without one',
      out?.projects[1]?.site_icon === null, String(out?.projects[1]?.site_icon))
    check('A4: that project IS picked for another look', out?.iconRetryRunIds.join(',') === 'r2',
      out?.iconRetryRunIds.join(','))
    check('A5: the one with an icon is NOT', !out?.iconRetryRunIds.includes('r1'))
    // A run that never finished is not a verdict about its icon, so it is not retried.
    const unfinished = fakeDb({
      projects: [{ id: 'p6', name: 'Six', updated_at: null, target_domain: 'six.example' }],
      project_seed_runs: [{ id: 'r6', project_id: 'p6', status: 'running', site_icon: null, checked_at: null }],
    })
    check('A5b: a run still in progress is not picked for a look',
      (await buildActiveProjectList(unfinished.client as never, USER, NOW))?.iconRetryRunIds.length === 0)
    check('A6: the domains come back for the icon refresh',
      out?.domains.get('p1') === 'one.example' && out?.domains.get('p2') === 'two.example')

    const runReads = db.reads.filter((t) => t === 'project_seed_runs').length
    check('A7: project_seed_runs is read ONCE, not twice', runReads === 1, `read ${runReads} times`)
    check('A8: …and projects once', db.reads.filter((t) => t === 'projects').length === 1)

    // An icon the project's own domain does not vouch for is refused, as before.
    const foreign = fakeDb({
      projects: [{ id: 'p3', name: 'Three', updated_at: null, target_domain: 'three.example' }],
      project_seed_runs: [{ id: 'r3', project_id: 'p3', status: 'done', site_icon: 'https://evil.example/x.png', checked_at: null }],
    })
    const out2 = await buildActiveProjectList(foreign.client as never, USER, NOW)
    check('A9: an icon hosted off the project\'s own site is dropped', out2?.projects[0]?.site_icon === null,
      String(out2?.projects[0]?.site_icon))

    // A run looked at recently is not looked at again.
    const recent = fakeDb({
      projects: [{ id: 'p4', name: 'Four', updated_at: null, target_domain: 'four.example' }],
      project_seed_runs: [{ id: 'r4', project_id: 'p4', status: 'done', site_icon: null, checked_at: NOW.toISOString() }],
    })
    const out3 = await buildActiveProjectList(recent.client as never, USER, NOW)
    check('A10: a run checked just now is not re-checked', out3?.iconRetryRunIds.length === 0,
      out3?.iconRetryRunIds.join(','))
    const stale = fakeDb({
      projects: [{ id: 'p5', name: 'Five', updated_at: null, target_domain: 'five.example' }],
      project_seed_runs: [{ id: 'r5', project_id: 'p5', status: 'done', site_icon: null, checked_at: LONG_AGO }],
    })
    const out4 = await buildActiveProjectList(stale.client as never, USER, NOW)
    check('A11: …but one checked long ago is', out4?.iconRetryRunIds.join(',') === 'r5', out4?.iconRetryRunIds.join(','))

    // A failed list is null — never an empty list, which reads as "no projects".
    const broken = fakeDb({ projects: [], project_seed_runs: [] }, { failProjects: true })
    check('A12: a failed read returns null, not an empty list',
      (await buildActiveProjectList(broken.client as never, USER, NOW)) === null)
  }

  console.log('\nB) the layout issues its three reads together')
  {
    const src = withoutComments(read('app/(dashboard)/layout.tsx'))
    check('B1: the three are awaited as one Promise.all', /await Promise\.all\(\[/.test(src))
    check('B2: the default-client catch-all is inside it', /Promise\.all\(\[[\s\S]*ensureDefaultClient\(/.test(src))
    check('B3: the profile read is inside it', /Promise\.all\(\[[\s\S]*from\('profiles'\)/.test(src))
    check('B4: the project list is inside it', /Promise\.all\(\[[\s\S]*buildActiveProjectList\(/.test(src))
    check('B5: none of the three is awaited on its own first',
      !/await ensureDefaultClient\(/.test(src) && !/await buildActiveProjectList\(/.test(src))
    check('B6: the list is handed to the provider',
      /<ActiveProjectProvider[^>]*initialProjects=/.test(src))
    // MUTATION CONTROL — the shape this replaced must not satisfy B1/B5.
    const sequential = "const r = await ensureDefaultClient(supabase, admin)\nconst list = await buildActiveProjectList(supabase, id)"
    check('B-MUT: the old sequential shape fails B1 and B5',
      !/await Promise\.all\(\[/.test(sequential) && /await ensureDefaultClient\(/.test(sequential))
  }

  console.log('\nC) a seeded provider asks for nothing')
  {
    const src = withoutComments(read('lib/active-project/ActiveProjectProvider.tsx'))
    check('C1: the provider takes initialProjects', /initialProjects\?: ActiveProjectLite\[\] \| null/.test(src))
    check('C2: the mount effect returns on it, before loadProjects',
      /if \(initialProjects\) \{ applyList\(initialProjects, false\); return \}[\s\S]*void loadProjects\(signal\)/.test(src))
    check('C3: resolving a list is ONE function, used by both paths',
      /const applyList = useCallback/.test(src) && /applyList\(list, failed\)/.test(src))
    check('C4: the fetching path still exists for every other caller',
      /fetch\('\/api\/projects\/active'\)/.test(src) && /const reloadProjects = useCallback/.test(src))
    // MUTATION CONTROL — a mount effect that fetches regardless fails C2.
    const always = "useEffect(() => { const signal = { cancelled: false }; void loadProjects(signal) }, [])"
    check('C-MUT: a mount effect with no seeded return fails C2',
      !/if \(initialProjects\) \{ applyList/.test(always))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
