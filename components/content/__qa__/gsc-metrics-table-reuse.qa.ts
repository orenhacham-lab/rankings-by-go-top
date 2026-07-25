/**
 * L2 — the read-only SC metrics table is a SINGLE shared component reused on the
 * project page (GscPanel) and in the Content Hub data sub-tab. One data model, no
 * duplicated sync logic, and the hub sub-tab shows the customer-facing table — NOT
 * the internal raw diagnostic browser.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { getDashboardDictionary } from '../../../lib/i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function main() {
  console.log('L2 — shared GscMetricsTable reuse + hub sub-tab')

  const table = strip(read('components/content/GscMetricsTable.tsx'))
  const panel = strip(read('components/content/GscPanel.tsx'))
  const hub = strip(read('components/content/ContentHub.tsx'))

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

  // Hub sub-tab: recommendations vs data; data → the shared table, NOT the internal browser.
  check('hub has a recommendations/data sub-tab', /setGscView\(key\)/.test(hub) && /gscSubTabs\.recommendations/.test(hub) && /gscSubTabs\.data/.test(hub))
  check("hub 'data' view renders the shared GscMetricsTable", /gscView === 'recommendations' \?[\s\S]*?<GscRecommendations[\s\S]*?\) : \([\s\S]*?<GscMetricsTable projectId=\{projectId\} \/>/.test(hub))
  check('hub data sub-tab does NOT render the internal raw browser (GscOpportunities)',
    !/gscView[\s\S]{0,400}<GscOpportunities/.test(hub))

  // i18n present both locales.
  for (const loc of ['he', 'en'] as const) {
    const st = getDashboardDictionary(loc).contentHub.gscSubTabs as Record<string, string>
    check(`(${loc}) gscSubTabs.recommendations/data exist`, typeof st.recommendations === 'string' && typeof st.data === 'string')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
