/**
 * THE DASHBOARD'S OWN DATA, BUILT IN-REGION AND HANDED TO THE SCREEN.
 *
 * The screen asked `/api/projects/[id]/dashboard` from the browser once the page
 * had hydrated, and showed a skeleton until it answered. Measured from Oren's
 * browser against production on 16.11.2026: document at 1532ms, that answer at
 * 3185ms, while a route that reads NOTHING costs 510-760ms from there. The cost
 * is the round trip, not the work, so the layout builds the same answer beside
 * the database and writes it into the HTML.
 *
 * A) the layout builds it with the route's own handler and dependencies, for a
 *    project it never trusts, and fails silently;
 * B) the screen reads it on its FIRST render and makes no request when it has it;
 * C) the mechanism itself, executed: the script writes, reads back once, refuses
 *    a stale answer, and cannot close its own tag.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { seedScript, takeSeed, HTML_SEED_GLOBAL, HTML_SEED_MAX_AGE_MS } from '@/lib/client/html-seed'
import { dashboardOverviewUrl } from '../urls'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (v: string) => v.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function main() {
  console.log('A) the layout builds the route\'s own answer, in-region')
  {
    const layout = strip(read('app/(dashboard)/dashboard/layout.tsx'))
    const route = strip(read('app/api/projects/[id]/dashboard/route.ts'))
    check('A1: the layout answers with the route\'s handler, not a copy of the reads',
      /handleDashboardGet\(projectId, liveDeps\(\)\)/.test(layout))
    check('A2: …and the route uses the very same handler and dependencies',
      /handleDashboardGet\(id, liveDeps\(\)\)/.test(route) && /from '@\/lib\/dashboard\/live-deps'/.test(route))
    check('A3: the wiring lives in one module, so the two cannot drift apart',
      /export function liveDeps\(\): DashboardDeps/.test(strip(read('lib/dashboard/live-deps.ts'))))
    check('A4: it is AWAITED, not put behind a Suspense boundary that would arrive too late',
      /const answer = await seed\(\)/.test(layout) && !/Suspense/.test(layout))
    check('A5: the project comes from the cookie the provider mirrors, never from a request value',
      /cookies\(\)\)\.get\(ACTIVE_PROJECT_COOKIE\)\?\.value/.test(layout) && !/searchParams/.test(layout))
    check('A6: the cookie is only shape-checked here; ownership is the handler\'s own read',
      /if \(!projectId \|\| !UUID\.test\(projectId\)\) return null/.test(layout))
    check('A7: anything but a real answer seeds nothing', /if \(res\.status !== 200\) return null/.test(layout))
    check('A8: every failure is silent, so the screen just asks as before',
      /catch \{\s*return null\s*\}/.test(layout))
    check('A9: it is handed over under the URL the screen would have fetched',
      /url: dashboardOverviewUrl\(projectId\)/.test(layout))
    // MUTATION CONTROL — streaming it behind Suspense, which A4 exists to prevent.
    const streamed = '<Suspense fallback={null}><Seed /></Suspense>'
    check('A-MUT: a streamed seed fails A4', /Suspense/.test(streamed))
  }

  console.log('\nB) the screen reads it on its first render')
  {
    const hook = strip(read('components/dashboard/useDashboardData.ts'))
    check('B1: the seeded answer is read in the state initialiser, not in an effect',
      /useState<\{ attempt: number; state: OverviewState \} \| null>\(\(\) => \{\s*const seeded = takeSeed\(dashboardOverviewUrl\(projectId\)\)/.test(hook))
    check('B2: …and an attempt already answered makes no request',
      /if \(result && result\.attempt === attempt\) return/.test(hook))
    check('B3: without a seed it fetches exactly as before',
      /getJson\(dashboardOverviewUrl\(projectId\)\)/.test(hook))
    check('B4: a reload still asks the route, so the screen can be refreshed',
      /const reload = useCallback\(\(\) => setAttempt\(\(n\) => n \+ 1\)/.test(hook))
    check('B5: the seed and the fetch become the state through ONE reader, so they cannot disagree',
      (hook.match(/overviewFrom\(/g) || []).length >= 3)
    check('B6: the URL builder is shared with the server, in a module with no \'use client\'',
      !/'use client'/.test(read('lib/dashboard/urls.ts')) && /export const dashboardOverviewUrl = sharedOverviewUrl/.test(hook))
    check('B7: the seeded URL is the fetched URL, character for character',
      dashboardOverviewUrl('a b') === '/api/projects/a%20b/dashboard', dashboardOverviewUrl('a b'))
    // MUTATION CONTROL — reading the seed in an effect, which is after the first render.
    const inEffect = 'useEffect(() => { const seeded = takeSeed(url) }, [])'
    check('B-MUT: reading the seed in an effect fails B1', !/useState<\{ attempt/.test(inEffect))
  }

  console.log('\nC) the mechanism, executed')
  {
    const url = dashboardOverviewUrl('p1')
    const body = { ok: true, note: 'can it close the tag? </script><img src=x>' }
    const script = seedScript(url, 200, body)
    check('C1: the script can never close its own tag', !/<\/script/i.test(script) && !script.includes('<img'))
    new Function(script)()
    const store = (globalThis as Record<string, unknown>)[HTML_SEED_GLOBAL] as Record<string, unknown>
    check('C2: running it puts the answer on globalThis, keyed by that URL', !!store && !!store[url])
    const taken = takeSeed(url)
    check('C3: …and it reads back as the very answer the server built',
      taken?.status === 200 && JSON.stringify(taken?.body) === JSON.stringify(body), JSON.stringify(taken))
    check('C4: it is served ONCE, so a later read asks the route', takeSeed(url) === null)
    store[url] = { at: Date.now() - (HTML_SEED_MAX_AGE_MS + 1_000), status: 200, body: { ok: true } }
    check('C5: an answer too old to pass for a fresh one is refused, and dropped',
      takeSeed(url) === null && !store[url])
    check('C6: a URL that was never seeded reads as nothing', takeSeed(dashboardOverviewUrl('other')) === null)
    check('C7: one mechanism, shared: the Search Console seed uses this module too',
      /from '@\/lib\/client\/html-seed'/.test(read('components/gsc/gsc-data.ts'))
      && /from '@\/lib\/client\/html-seed'/.test(read('components/HtmlSeed.tsx')))
    // MUTATION CONTROL — a payload that does not escape `<` can close the tag.
    const unescaped = `var s=${JSON.stringify({ body: '</script>' })}`
    check('C-MUT: an unescaped payload fails C1', /<\/script/i.test(unescaped))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main()

export {}
