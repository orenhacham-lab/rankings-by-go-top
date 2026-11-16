/**
 * THE READS THAT ONLY NEED THE PROJECT ID, STARTED AS THE SCREEN MOUNTS.
 *
 * Search Console's status and the monthly-report teaser are drawn by cards that
 * only exist once the dashboard's own route has answered, so a measured dashboard
 * load started GET /api/gsc/status and GET /api/reports/monthly in its FOURTH wave
 * of requests (~2986ms), and the Search Console metrics those gate in its fifth
 * (~3423ms) — although both need nothing but the project id, which the screen has
 * from its first render.
 *
 * A) the monthly read is shared by URL, from a cache that survives a second module
 *    instance, and a reload still asks again;
 * B) the dashboard starts both reads itself, in an effect that does not wait for the
 *    screen to leave its loading state, and asks nothing when the SERVER says
 *    Search Console is off.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const withoutComments = (v: string) => v.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

type FetchCall = string

async function main() {
  console.log('A) the monthly read is shared by URL')
  {
    const calls: FetchCall[] = []
    ;(globalThis as unknown as { fetch: unknown }).fetch = async (url: unknown) => {
      calls.push(String(url))
      return { ok: true, json: async () => ({ ok: true, available: true, months: [], report: null }) } as unknown as Response
    }
    const mod = await import('../useMonthlyReports')

    // The screen warms the read; the teaser, mounting later, asks the same URL.
    mod.prefetchMonthlyReports('p1')
    mod.prefetchMonthlyReports('p1')
    await new Promise((r) => setTimeout(r, 0))
    check('A1: two asks for one project are ONE request', calls.length === 1, `${calls.length} requests: ${calls.join(' , ')}`)
    check('A2: …for the project\'s own latest report', calls[0]?.includes('projectId=p1') === true, calls[0])

    mod.prefetchMonthlyReports('p2')
    await new Promise((r) => setTimeout(r, 0))
    check('A3: another project is its own request', calls.length === 2, String(calls.length))

    // Nothing is asked for a screen with no project.
    mod.prefetchMonthlyReports(null)
    mod.prefetchMonthlyReports('')
    await new Promise((r) => setTimeout(r, 0))
    check('A4: no project id asks nothing', calls.length === 2, String(calls.length))

    const src = withoutComments(read('components/reports/monthly/useMonthlyReports.ts'))
    check('A5: the cache lives on globalThis, not in module scope',
      /const CACHE_KEY = '__goTopMonthlyCache__'/.test(src) && /globalThis as CacheHost/.test(src))
    check('A6: a reload asks again instead of being served the answer it replaces',
      /readMonthly\(monthlyUrl\(projectId, month\), tick > 0\)/.test(src))
    check('A7: the hook reads through the shared read, not fetch of its own',
      !/fetch\(monthlyUrl\(/.test(src))
    // MUTATION CONTROL — the shape this replaced must not satisfy A6/A7.
    const old = "fetch(monthlyUrl(projectId, month), { cache: 'no-store' })"
    check('A-MUT: the old per-hook fetch fails A6 and A7',
      !/readMonthly\(monthlyUrl\(projectId, month\), tick > 0\)/.test(old) && /fetch\(monthlyUrl\(/.test(old))
  }

  console.log('\nB) the dashboard starts both reads as it mounts')
  {
    const src = withoutComments(read('app/(dashboard)/dashboard/page.tsx'))
    const effect = src.match(/useEffect\(\(\) => \{\s*if \(gscEnabled !== false\)[\s\S]*?\}, \[project\.id, gscEnabled\]\)/)
    check('B1: one effect starts the Search Console status and the monthly read', effect !== null)
    check('B2: the status read goes through the shared read, by its own URL',
      /readGscResponse\(gscStatusUrl\(project\.id\)\)/.test(effect?.[0] ?? ''))
    check('B3: the monthly read is warmed for the same project',
      /prefetchMonthlyReports\(project\.id\)/.test(effect?.[0] ?? ''))
    check('B4: Search Console switched off on the SERVER is not asked at all',
      /if \(gscEnabled !== false\)/.test(effect?.[0] ?? ''))
    check('B5: gscEnabled comes from the layout\'s own answer, not a build-time flag',
      /const gscEnabled = useGscEnabled\(\)/.test(src))

    // The effect must sit ABOVE the loading early return, or it would never run
    // on the load it is meant to shorten.
    const effectAt = src.indexOf('prefetchMonthlyReports(project.id)')
    const skeletonAt = src.indexOf("if (status === 'loading' || !rankings || !modeKnown)")
    check('B6: it runs before the screen\'s loading state returns',
      effectAt > 0 && skeletonAt > 0 && effectAt < skeletonAt, `${effectAt} vs ${skeletonAt}`)
    check('B7: it does not wait for the dashboard route\'s own answer',
      !/\[project\.id, gscEnabled, overview/.test(src) && !/if \(overview\.status === 'ready'\) \{\s*prefetchMonthlyReports/.test(src))
    // MUTATION CONTROL — an effect gated on the route's answer fails B7's intent and B1.
    const gated = "useEffect(() => { if (overview.status !== 'ready') return; prefetchMonthlyReports(project.id) }, [project.id, overview.status])"
    check('B-MUT: an effect gated on the route\'s answer fails B1',
      !/useEffect\(\(\) => \{\s*if \(gscEnabled !== false\)/.test(gated))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
