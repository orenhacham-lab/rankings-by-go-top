/**
 * L2 — the read-only SC metrics table is a SINGLE shared component. One data model, no
 * duplicated sync logic.
 *
 * It used to have two homes: GscPanel (now in the project's settings) and the data
 * sub-tab of the content workspace's Search Console screen. That screen is gone:
 * Search Console feeds the other screens with widgets of their own, so the table's one
 * home is GscPanel, next to the connection that produces its data.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { getDashboardDictionary } from '../../../lib/i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** Every .tsx under app/ and components/, as [path, comment-stripped source]. */
function tsxSources(): [string, string][] {
  const out: [string, string][] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (name === 'node_modules' || name === '__qa__') continue
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.tsx')) out.push([relative(ROOT, full), strip(readFileSync(full, 'utf8'))])
    }
  }
  walk(join(ROOT, 'app'))
  walk(join(ROOT, 'components'))
  return out
}
/** The files that render the shared table. */
const tableUsers = (sources: [string, string][]) => sources.filter(([, src]) => /<GscMetricsTable\b/.test(src)).map(([p]) => p)

function main() {
  console.log('L2 — shared GscMetricsTable, one home (GscPanel)')

  const table = strip(read('components/content/GscMetricsTable.tsx'))
  const panel = strip(read('components/content/GscPanel.tsx'))

  // Shared component with the specified projectId API.
  check('GscMetricsTable is a projectId component', /export default function GscMetricsTable\(\{ projectId/.test(table))
  check('it reuses the existing status + metrics endpoints (one data model)',
    /\/api\/gsc\/status\?projectId=/.test(table) && /\/api\/gsc\/metrics\?projectId=/.test(table))
  check('it is READ-ONLY — no sync/disconnect/connect logic duplicated', !/\/api\/gsc\/sync|\/api\/gsc\/connect|\/api\/gsc\/property/.test(table))

  // Every required state is represented.
  for (const [label, re] of [
    ['not connected', /errors\.not_connected/],
    ['no property', /noPropertyAssigned/],
    ['reauth required', /reauth_required[\s\S]*statusReauthRequired/],
    ['never synced', /neverSynced/],
    ['loading', /statusLoading/],
    ['error', /rowsError/],
    ['empty', /emptyRows/],
    ['data (summary + table)', /propertySummaryLabel[\s\S]*colQuery/],
  ] as const) {
    check(`state present: ${label}`, (re as RegExp).test(table))
  }

  // L1 pagination carried into the shared table.
  check('shared table uses the 10/25/50/100 pagination', /PAGE_SIZE_OPTIONS = \[10, 25, 50, 100\]/.test(table) && /useState<number>\(10\)/.test(table))

  // Project page: GscPanel delegates the data view (no inline table left).
  check('GscPanel renders the shared table (with refreshKey)', /<GscMetricsTable projectId=\{projectId\} refreshKey=\{dataRefresh\}/.test(panel))
  check('GscPanel no longer contains its own metrics <table>', !/<table className="w-full text-sm">/.test(panel))
  check('GscPanel bumps refresh after sync / property change (no lost refresh)', /setDataRefresh\(\(k\) => k \+ 1\)/.test(panel))

  // One home: the Search Console screen and its recommendations/data sub-tab are gone.
  const sources = tsxSources()
  const users = tableUsers(sources)
  check('the only screen code that renders the shared table is GscPanel',
    users.length === 1 && users[0] === join('components', 'content', 'GscPanel.tsx'), users.join(', '))
  check('MUT: a second screen rendering its own copy of the table fails that check',
    tableUsers([...sources, ['components/content/workspace/SearchConsoleScreen.tsx', '<GscMetricsTable projectId={projectId} />']]).length === 2)
  check('the Search Console screen (and its sub-tab) no longer exists',
    !existsSync(join(ROOT, 'components/content/workspace/SearchConsoleScreen.tsx')))
  for (const loc of ['he', 'en'] as const) {
    const hub = getDashboardDictionary(loc).contentHub as Record<string, unknown>
    check(`(${loc}) the sub-tab's copy (gscSubTabs) is gone with it`, !('gscSubTabs' in hub))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
