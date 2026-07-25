/**
 * L1 — GSC metrics pagination: default 10 rows, page-size selector 10/25/50/100,
 * page reset on size change, sorting/filtering untouched. Client-only (the metrics
 * endpoint already clamps pageSize ≤ 100).
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
  console.log('L1 — GSC pagination')

  const panel = strip(read('components/content/GscPanel.tsx'))
  check('page-size options are 10 / 25 / 50 / 100', /PAGE_SIZE_OPTIONS = \[10, 25, 50, 100\]/.test(panel))
  check('default page size is 10', /useState<number>\(10\)/.test(panel))
  check('fetch uses the dynamic pageSize (not a hardcoded 25)', /pageSize=\$\{pageSize\}/.test(panel) && !/pageSize=\$\{PAGE_SIZE\}/.test(panel))
  check('page resets to 0 when the size changes', /setPageSize\(Number\(e\.target\.value\)\); setPage\(0\)/.test(panel))
  check('pageSize is a fetch dependency (re-loads on change)', /\[projectId, property, activeWindow, activeTab, page, pageSize\]/.test(panel))
  check('the size selector renders all options', /PAGE_SIZE_OPTIONS\.map\(\(n\) => \(<option/.test(panel))
  // Sorting/filtering (window + view tabs) untouched — still present.
  check('window + view tabs preserved (sorting/filtering intact)', /setActiveWindow/.test(panel) && /setActiveTab/.test(panel))

  // Server unchanged: the endpoint already clamps to ≤ 100.
  const metrics = strip(read('app/api/gsc/metrics/route.ts'))
  check('metrics endpoint clamps pageSize to ≤ MAX_PAGE_SIZE (no server change needed)', /Math\.min\(MAX_PAGE_SIZE, Math\.max\(1, Number\(url\.searchParams\.get\('pageSize'\)\)/.test(metrics))

  // i18n present in both locales.
  for (const loc of ['he', 'en'] as const) {
    const g = getDashboardDictionary(loc).projectDetail.contentSection.gsc as Record<string, unknown>
    check(`(${loc}) pageSizeLabel string exists`, typeof g.pageSizeLabel === 'string' && (g.pageSizeLabel as string).length > 0)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
