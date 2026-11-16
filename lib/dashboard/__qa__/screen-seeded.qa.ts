/**
 * EVERY READ THE DASHBOARD'S FIRST PAINT NEEDS, ANSWERED IN-REGION.
 *
 * The screen asked the server for all of it from the browser, in two waves:
 * measured warm from Oren's browser against production on 16.11.2026, the
 * document arrived at ~2.1s and the last answer at 5.3s, while a route that
 * reads NOTHING costs 510-760ms from there. Each route is also its own
 * serverless function with its own cold start.
 *
 * A) the layout answers all seven together, each through the ROUTE'S OWN
 *    handler, and every failure is silent and costs only itself;
 * B) the six readers take the seeded answer and still fetch without one;
 * C) one spelling per path, shared by the server and the reader, EXECUTED —
 *    a seed under another URL is an answer nobody reads;
 * D) the seed's wiring for the scan read carries no write's graph.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { seedScript, takeSeed, HTML_SEED_GLOBAL } from '@/lib/client/html-seed'
import { competitorsUrl } from '@/lib/ai-visibility/urls'
import { gscMetricsUrl } from '@/lib/gsc/urls'
import { waitingUrl } from '@/lib/nudges/urls'
import { PROJECT_QUOTA_URL } from '@/lib/projects/urls'
import { monthlyReportsUrl } from '@/lib/reports/monthly/urls'
import { seedRunUrl } from '@/lib/seed-scan/urls'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (v: string) => v.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const LAYOUT = 'app/(dashboard)/dashboard/layout.tsx'

function main() {
  console.log('A) the layout answers all of them together, through the routes\' own handlers')
  {
    const layout = strip(read(LAYOUT))
    const helper = strip(read('lib/server/route-seed.ts'))

    check('A1: all the reads are issued TOGETHER, so the document waits for the slowest and not for their sum',
      /const answers = await Promise\.all\(\[/.test(layout))
    // Each read, named with the handler it goes through. A copy of a route's
    // reads instead of the route's own handler would fail its line here.
    const through: Array<[string, RegExp]> = [
      ['the overview', /handleDashboardGet\(projectId, liveDeps\(\)\)/],
      ['the scan run', /seedAnswer\(seedRunUrl\(projectId\), \(\) => handleSeedGet\(projectId, seedReadDeps\(\)\)\)/],
      ['what is waiting', /seedAnswer\(waitingUrl\(projectId\), \(req\) => waitingGet\(req, forProject\(projectId\)\)\)/],
      ['the monthly reports', /seedAnswer\(monthlyReportsUrl\(projectId\), \(req\) => handleMonthlyGet\(req, liveMonthlyDeps\(\)\)\)/],
      ['the competitors', /seedAnswer\(competitorsUrl\(projectId\), \(req\) => competitorsGet\(new NextRequest\(req\), forProject\(projectId\)\)\)/],
      ['the Search Console pages', /seedAnswer\(gscMetricsUrl\(projectId, 'pages'\), \(req\) => gscMetricsGet\(req\)\)/],
      ['the project quota', /seedAnswer\(PROJECT_QUOTA_URL, \(\) => quotaGet\(\)\)/],
    ]
    for (const [what, re] of through) {
      check(`A2: ${what} is answered by the route's own handler`, re.test(layout))
    }
    check('A3: four of them are literally the route modules\' own GET, so no check can be left out',
      /GET as competitorsGet/.test(layout) && /GET as quotaGet/.test(layout)
      && /GET as waitingGet/.test(layout) && /GET as gscMetricsGet/.test(layout))
    check('A4: they are AWAITED, never streamed behind a boundary that would arrive after the screen fetched',
      !/Suspense/.test(layout))
    check('A5: the project comes from the cookie the provider mirrors, never from a request value',
      /cookies\(\)\)\.get\(ACTIVE_PROJECT_COOKIE\)\?\.value/.test(layout) && !/searchParams/.test(layout))
    check('A6: the cookie is only shape-checked here; ownership stays each handler\'s own read',
      /UUID\.test\(projectId\) \? await seeds\(projectId\) : \[\]/.test(layout))
    check('A7: anything but a plain 200 seeds nothing', /if \(response\.status !== 200\) return null/.test(helper))
    check('A8: a throw seeds nothing either, so one broken read cannot cost the page',
      /catch \{\s*return null\s*\}/.test(helper))
    check('A9: and a read that seeded nothing is simply dropped, never rendered as an empty seed',
      /answers\.filter\(\(a\): a is SeedAnswer => a !== null\)/.test(layout))
    check('A10: nothing is fetched to answer them: the handler is called, over a host that never leaves the process',
      /const SEED_ORIGIN = 'http:\/\/seed\.internal'/.test(helper) && !/\bawait fetch\(/.test(helper))
    // MUTATION CONTROL — issuing the reads one after another, which A1 exists to prevent.
    const serial = 'const a = await overview(id); const b = await seedAnswer(...)'
    check('A-MUT: reads issued one after another fail A1', !/await Promise\.all\(\[/.test(serial))
  }

  console.log('\nB) the readers take it, and still fetch without it')
  {
    const readers: Array<[string, string, RegExp, RegExp]> = [
      ['the scan run', 'lib/client/seed-read.ts',
        /if \(!opts\?\.fresh\) adoptSeed\(projectId, entries, now\)/, /doFetch\(seedUrl\(projectId\)/],
      ['what is waiting', 'components/nudges/useWaiting.ts',
        /load\(projectId, !force\)/, /fetch\(waitingUrl\(projectId\), \{ cache: 'no-store'/],
      ['the monthly reports', 'components/reports/monthly/useMonthlyReports.ts',
        /if \(!fresh\) adoptSeed\(url\)/, /fetch\(url, \{ cache: 'no-store' \}\)/],
      ['the competitors', 'components/competitors/useCompetitorComparison.ts',
        /const seeded = takeSeed\(competitorsUrl\(projectId\)\)/, /fetch\(competitorsUrl\(projectId\), \{/],
      ['the project quota', 'components/layout/WorkspaceSwitcher.tsx',
        /const seeded = takeSeed\(PROJECT_QUOTA_URL\)/, /fetch\(PROJECT_QUOTA_URL\)/],
      ['the Search Console pages', 'components/gsc/gsc-data.ts',
        /const seed = takeSeed\(url\)/, /fetch\(url, \{ cache: 'no-store' \}\)/],
    ]
    for (const [what, file, adopts, fetches] of readers) {
      const src = strip(read(file))
      check(`B1: ${what} is read from the seed when one is waiting`, adopts.test(src), file)
      check(`B2: …and ${what} is still fetched when none is`, fetches.test(src), file)
    }
    check('B3: a caller that has just started something is never handed the state from page load',
      /if \(adopt\) \{/.test(strip(read('components/nudges/useWaiting.ts')))
      && /if \(!opts\?\.fresh\)/.test(strip(read('lib/client/seed-read.ts')))
      && /if \(!fresh\) adoptSeed/.test(strip(read('components/reports/monthly/useMonthlyReports.ts'))))
    check('B4: the competitors\' seeded body and fetched body go through ONE parser, so they cannot be understood differently',
      (strip(read('components/competitors/useCompetitorComparison.ts')).match(/listOutcomeFrom\(/g) || []).length >= 3)
    // MUTATION CONTROL — a reader that only ever fetches.
    const onlyFetch = "const res = await fetch(competitorsUrl(projectId))"
    check('B-MUT: a reader that never looks for a seed fails B1', !/takeSeed\(/.test(onlyFetch))
  }

  console.log('\nC) one spelling per path, shared and executed')
  {
    // Each url module must be callable from a server component, so none of them
    // may carry 'use client'.
    for (const file of ['lib/ai-visibility/urls.ts', 'lib/gsc/urls.ts', 'lib/nudges/urls.ts',
      'lib/projects/urls.ts', 'lib/reports/monthly/urls.ts', 'lib/seed-scan/urls.ts']) {
      // Stripped first: these modules EXPLAIN in a comment why they carry no
      // 'use client', and a guard that matched the explanation would be useless.
      check(`C1: ${file} has no 'use client', so the server can call it`, !/'use client'/.test(strip(read(file))))
    }
    // The readers must not keep a SECOND spelling of their own path.
    const reexports: Array<[string, RegExp]> = [
      ['lib/client/seed-read.ts', /export const seedUrl = sharedSeedRunUrl/],
      ['components/nudges/useWaiting.ts', /export const waitingUrl = sharedWaitingUrl/],
      ['components/reports/monthly/useMonthlyReports.ts', /export const monthlyUrl = sharedMonthlyUrl/],
    ]
    for (const [file, re] of reexports) {
      check(`C2: ${file} reads the shared spelling instead of writing its own`, re.test(strip(read(file))))
    }
    // EXECUTED: a seed written under the server's spelling is found under the
    // reader's. Any drift between the two modules fails here, not in review.
    const id = 'a1b2c3d4-0000-4000-8000-000000000001'
    const paths: Array<[string, string]> = [
      ['the scan run', seedRunUrl(id)],
      ['what is waiting', waitingUrl(id)],
      ['the monthly reports', monthlyReportsUrl(id)],
      ['the competitors', competitorsUrl(id)],
      ['the Search Console pages', gscMetricsUrl(id, 'pages')],
      ['the project quota', PROJECT_QUOTA_URL],
    ]
    for (const [what, url] of paths) {
      new Function(seedScript(url, 200, { ok: true, what }))()
      const taken = takeSeed(url)
      check(`C3: ${what} reads back under the very URL the server wrote`,
        !!taken && (taken.body as { what?: string }).what === what, url)
    }
    check('C4: every one of them was served, so nothing is left behind for a later reader',
      Object.keys(((globalThis as Record<string, unknown>)[HTML_SEED_GLOBAL] ?? {}) as object).length === 0)
    check('C5: the monthly path the layout can build is the one WITHOUT a month, which the screen asks for first',
      monthlyReportsUrl(id) === `/api/reports/monthly?projectId=${id}`
      && monthlyReportsUrl(id, '2026-11') === `/api/reports/monthly?projectId=${id}&month=2026-11`)
    check('C6: a project id is escaped on the way into a path',
      waitingUrl('a b') === '/api/projects/a%20b/waiting' && seedRunUrl('a b') === '/api/projects/a%20b/seed')
    // MUTATION CONTROL — a url module that became a client module, which C1 exists to catch.
    const clientified = "'use client'\nexport function waitingUrl(id: string) { return id }"
    check('C-MUT1: a url module carrying \'use client\' fails C1', /'use client'/.test(strip(clientified)))
    // MUTATION CONTROL — the server spelling drifting from the reader's.
    const drifted = '/api/projects/' + id + '/waiting?x=1'
    new Function(seedScript(drifted, 200, { ok: true }))()
    check('C-MUT: an answer written under a drifted URL is not found by the reader', takeSeed(waitingUrl(id)) === null)
    takeSeed(drifted)
  }

  console.log('\nD) the scan read\'s wiring carries no write\'s graph')
  {
    const deps = strip(read('lib/server/seed-read-deps.ts'))
    const route = strip(read('app/api/projects/[id]/seed/route.ts'))
    const http = strip(read('lib/seed-scan/http.ts'))
    check('D1: the read needs five things, and they are the five named apart from the write\'s',
      /export type SeedReadDeps = \{/.test(http) && /export type SeedRouteDeps = SeedReadDeps & \{/.test(http))
    check('D2: the read\'s handler asks only for those five', /handleSeedGet\(projectId: string, deps: SeedReadDeps\)/.test(http))
    check('D3: …and so does the gate they share, so the two paths cannot disagree about it',
      /function gate\(projectId: string, deps: SeedReadDeps\)/.test(http))
    check('D4: the route\'s own GET uses that wiring too', /handleSeedGet\(id, seedReadDeps\(\)\)/.test(route))
    check('D5: and its POST still gets the full wiring, built on top of the same five',
      /\.\.\.seedReadDeps\(\),/.test(route) && /handleSeedPost\(request, id, liveDeps\(\)\)/.test(route))
    // The point of the separate module: a page importing it must not pull in
    // the scan, the recommendation engine, `after()` or the keyword tracker.
    for (const forbidden of ['api/scan/route', 'automation/recommendations/route', 'seed-scan/runner', 'seed-scan/tracking', "from 'next/server'"]) {
      check(`D6: the read's wiring does not import ${forbidden}`, !deps.includes(forbidden))
    }
    check('D7: it imports only the five\'s own sources', (deps.match(/^import /gm) || []).length === 4, deps.match(/^import .*/gm)?.join(' | '))
    // MUTATION CONTROL — the heavy import the separation exists to keep out.
    const heavy = "import { POST as scanPost } from '@/app/api/scan/route'"
    check('D-MUT: a wiring that imports the scan route fails D6', heavy.includes('api/scan/route'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main()

export {}
