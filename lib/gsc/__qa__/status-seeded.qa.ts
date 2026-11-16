/**
 * THE SEARCH CONSOLE STATUS, BUILT IN-REGION AND HANDED TO THE WIDGETS.
 *
 * Every Search Console widget asks for the status first, and the dashboard's
 * metrics are read only once that answer says "ready". On a measured dashboard
 * load that was two browser round trips at the end of the load: the status
 * started at 2147ms and the metrics at 3647ms. What a round trip costs here is
 * transport, not work — `/api/version`, which authenticates nothing and reads
 * nothing, took 510-650ms from Oren's browser against production on 16.11.2026
 * while `/api/gsc/status` took 648-740ms — so removing a WAVE is worth about half
 * a second and removing a request from a wave that already runs in parallel is
 * worth almost nothing.
 *
 * A) the answer is ONE function, and it is the same answer the route gives;
 * B) the layout builds it for the likely project and hands it over, in its own
 *    Suspense boundary so it never holds up the document;
 * C) the widgets' store is primed during RENDER, under the URL they would have
 *    fetched, and the route stays the only path for everyone else.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildGscStatus } from '../status'
import { gscStatusUrl, gscMetricsUrl } from '../urls'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  PASS ${name}`) }
  else { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (v: string) => v.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

type Row = Record<string, unknown>

/** A service-role-shaped fake: only the chain these reads use, and it counts them. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const reads: string[] = []
  const client = {
    from(table: string) {
      reads.push(table)
      const rows = [...(tables[table] ?? [])]
      const q: Record<string, unknown> = {}
      const self = () => q
      q.select = self; q.eq = self; q.in = self; q.not = self; q.order = self; q.gte = self; q.lte = self
      q.limit = self
      q.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null })
      q.single = () => Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116' } })
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res)
      return q
    },
  }
  return { client, reads }
}

async function main() {
  console.log('A) the answer is one function, with the route\'s own shape')
  {
    const empty = fakeAdmin({})
    const out = await buildGscStatus(empty.client as never, 'p1', 'u1')
    const body = out.body as Record<string, unknown>
    check('A1: a project with no connection and no property still answers ok',
      out.status === 200 && body.ok === true, `${out.status} ${JSON.stringify(body).slice(0, 80)}`)
    check('A2: …with no property, and no windows read for one that does not exist',
      body.property === null && JSON.stringify(body.windows) === '{}', JSON.stringify(body.windows))
    check('A3: the token is NEVER in the answer',
      !JSON.stringify(body).includes('access_token') && !JSON.stringify(body).includes('refresh_token'))

    const src = strip(read('app/api/gsc/status/route.ts'))
    check('A4: the route answers from that one function', /buildGscStatus\(auth\.admin, auth\.project\.id, auth\.user\.id\)/.test(src))
    check('A5: …and still checks ownership itself, and the server flag, first',
      /authContentProject\(projectId\)/.test(src) && /if \(!isGscReadOnlyEnabled\(\)\) return/.test(src))
    check('A6: the route no longer carries a second copy of the reads',
      !/loadUserConnection\(/.test(src) && !/summaryCard\(/.test(src))
    // MUTATION CONTROL — the route as it was must fail A4 and A6.
    const old = "const [connectionRead] = await Promise.allSettled([loadUserConnection(auth.admin, auth.user.id)])\nsummaryCard(run)"
    check('A-MUT: the route\'s own former copy of the reads fails A4 and A6',
      !/buildGscStatus\(/.test(old) && /loadUserConnection\(/.test(old))
  }

  console.log('\nB) the layout builds it for the likely project, off the critical path')
  {
    const src = strip(read('app/(dashboard)/layout.tsx'))
    check('B1: the layout has a slot that builds the status', /async function GscStatusSlot\(/.test(src))
    check('B2: it builds it with the service-role client, for one project and one user',
      /buildGscStatus\(admin, projectId, userId\)/.test(src))
    check('B3: the project is the first of the caller\'s OWN list, never a request value',
      /projectList\?\.projects\[0\]/.test(src) && /projectId=\{projectList\.projects\[0\]\.id\}/.test(src))
    check('B4: the user is the one this layout already verified', /userId=\{user\.id\}/.test(src))
    check('B5: it sits in its own Suspense boundary, so the document never waits for it',
      /<Suspense fallback=\{null\}>\s*<GscStatusSlot/.test(src))
    check('B6: nothing is asked when the SERVER says Search Console is off',
      /isGscReadOnlyEnabled\(\) && projectList\?\.projects\[0\] &&/.test(src))
    check('B7: only a real answer is handed over', /if \(status !== 200\) return null/.test(src))
    check('B8: it is handed over under the URL the widgets would have fetched',
      /url=\{gscStatusUrl\(projectId\)\}/.test(src))
    // MUTATION CONTROL — awaiting it inline, which is what B5 exists to prevent.
    const inline = "const seed = await buildGscStatus(admin, projectId, userId)"
    check('B-MUT: awaiting the status in the layout body fails B5',
      !/<Suspense fallback=\{null\}>\s*<GscStatusSlot/.test(inline))
  }

  console.log('\nC) the widgets read it without asking, and the route stays for everyone else')
  {
    const seed = strip(read('components/gsc/GscStatusSeed.tsx'))
    check('C1: the seed primes the widgets\' own shared store', /primeGscResponse\(url, response\)/.test(seed))
    check('C2: during RENDER, not in an effect, because a widget\'s first render reads it',
      !/useEffect/.test(seed) && /primeGscResponse\(url, response\)\s*return null/.test(seed))
    const data = strip(read('components/gsc/gsc-data.ts'))
    check('C3: the store is keyed by URL, so an answer for another project is never read',
      /shared\.set\(url,/.test(data) && /shared\.get\(url\)/.test(data))
    check('C4: a primed answer is served to the FIRST render, not after it',
      /const primed = peek\(url\)[\s\S]{0,120}return url && primed/.test(data))
    check('C5: the fetching path still exists for every other caller',
      /fetch\(url, \{ cache: 'no-store' \}\)/.test(data) && /export function readGscResponse/.test(data))
    // One spelling of the paths, and it is callable from the server.
    check('C6: the URL builders live in a module with no \'use client\' on it',
      !/'use client'/.test(read('lib/gsc/urls.ts')))
    check('C7: …and the client module re-exports those same ones',
      /export \{ gscStatusUrl, gscMetricsUrl, type GscMetricsView \}/.test(data))
    check('C8: the seeded URL is the fetched URL, character for character',
      gscStatusUrl('p 1') === '/api/gsc/status?projectId=p%201', gscStatusUrl('p 1'))
    check('C9: and the metrics path is unchanged',
      gscMetricsUrl('p1', 'pages') === '/api/gsc/metrics?projectId=p1&window=28&view=pages', gscMetricsUrl('p1', 'pages'))
    // MUTATION CONTROL — a seed that primes in an effect fails C2.
    const effectSeed = "useEffect(() => { primeGscResponse(url, response) }, [])\n  return null"
    check('C-MUT: priming in an effect fails C2', /useEffect/.test(effectSeed))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
