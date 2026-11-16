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
 * C) the answer reaches the browser as a SCRIPT, so it is in the store before any
 *    hydration, under the URL the widgets would have fetched, and the route stays
 *    the only path for everyone else;
 * D) the project it is built for is the one this browser is actually looking at.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildGscStatus } from '../status'
import { gscStatusUrl, gscMetricsUrl } from '../urls'
import { seedScript, takeSeed, HTML_SEED_GLOBAL } from '@/lib/client/html-seed'
import { activeProjectFromCookie, activeProjectCookieWrite, ACTIVE_PROJECT_COOKIE } from '@/lib/active-project/active-cookie'
import { gscStatusView } from '../widget-state'

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
    check('B3: the project is resolved from the caller\'s OWN list, never from a request value',
      /activeProjectFromCookie\(\s*cookieStore\.get\(ACTIVE_PROJECT_COOKIE\)\?\.value \?\? null,\s*projectList\?\.projects \?\? \[\],/.test(src)
      && /projectId=\{seedProjectId\}/.test(src))
    check('B4: the user is the one this layout already verified', /userId=\{user\.id\}/.test(src))
    check('B5: it sits in its own Suspense boundary, so the document never waits for it',
      /<Suspense fallback=\{null\}>\s*<GscStatusSlot/.test(src))
    check('B6: nothing is asked when the SERVER says Search Console is off',
      /isGscReadOnlyEnabled\(\) && seedProjectId &&/.test(src))
    check('B7: only a real answer is handed over', /if \(status !== 200\) return null/.test(src))
    check('B8: it is handed over under the URL the widgets would have fetched',
      /url=\{gscStatusUrl\(projectId\)\}/.test(src))
    // MUTATION CONTROL — awaiting it inline, which is what B5 exists to prevent.
    const inline = "const seed = await buildGscStatus(admin, projectId, userId)"
    check('B-MUT: awaiting the status in the layout body fails B5',
      !/<Suspense fallback=\{null\}>\s*<GscStatusSlot/.test(inline))
  }

  console.log('\nC) it arrives as a script, before anything can ask for it')
  {
    const seed = strip(read('components/gsc/GscStatusSeed.tsx'))
    check('C1: the seed renders a script that carries the answer',
      /<HtmlSeed url=\{url\} status=\{response\.status\} body=\{response\.body\} \/>/.test(seed)
      && /seedScript\(url, status, body\)/.test(strip(read('components/HtmlSeed.tsx'))))
    check('C2: it is not a client component priming from render or an effect',
      !/'use client'/.test(seed) && !/useEffect/.test(seed) && !/primeGscResponse/.test(seed))
    const data = strip(read('components/gsc/gsc-data.ts'))
    check('C3: the store is keyed by URL, so an answer for another project is never read',
      /shared\.set\(url,/.test(data) && /shared\.get\(url\)/.test(data))
    check('C4: both the shared read and the first-render peek adopt what the script left',
      /function request\(url: string, fresh: boolean\): Promise<GscResponse> \{\s*adoptSeed\(url\)/.test(data)
      && /function peek\(url: string \| null\)[^]*?adoptSeed\(url\)/.test(data))
    check('C5: a seeded answer is served to the FIRST render, not after it',
      /const primed = peek\(url\)[\s\S]{0,120}return url && primed/.test(data))
    check('C6: the fetching path still exists for every other caller',
      /fetch\(url, \{ cache: 'no-store' \}\)/.test(data) && /export function readGscResponse/.test(data))
    check('C7: the URL builders live in a module with no \'use client\' on it',
      !/'use client'/.test(read('lib/gsc/urls.ts')))
    check('C8: …and the client module re-exports those same ones',
      /export \{ gscStatusUrl, gscMetricsUrl, type GscMetricsView, type GscResponse \}/.test(data))
    check('C9: the seeded URL is the fetched URL, character for character',
      gscStatusUrl('p 1') === '/api/gsc/status?projectId=p%201', gscStatusUrl('p 1'))
    check('C10: and the metrics path is unchanged',
      gscMetricsUrl('p1', 'pages') === '/api/gsc/metrics?projectId=p1&window=28&view=pages', gscMetricsUrl('p1', 'pages'))

    // EXECUTED: run the script the server would send, then read it back.
    const url = gscStatusUrl('p1')
    const body = { ok: true, note: 'closes a tag? </script><img src=x>' }
    const script = seedScript(url, 200, body)
    check('C11: the script can never close its own tag', !/<\/script/i.test(script) && !script.includes('<img'))
    new Function(script)()
    const store = (globalThis as Record<string, unknown>)[HTML_SEED_GLOBAL] as Record<string, unknown>
    check('C12: running it puts the answer on globalThis, keyed by that URL', !!store && !!store[url])
    const taken = takeSeed(url)
    check('C13: …and it reads back as the very answer the server built',
      taken?.status === 200 && JSON.stringify(taken?.body) === JSON.stringify(body), JSON.stringify(taken))
    check('C14: it is served ONCE, so a later read asks the route', takeSeed(url) === null)
    // A tab left open for minutes must not be handed a page-load answer as current.
    store[url] = { at: Date.now() - 31_000, status: 200, body: { ok: true } }
    check('C15: a stale seed is refused, and dropped', takeSeed(url) === null && !store[url])
    check('C16: a URL that was never seeded reads as nothing', takeSeed(gscStatusUrl('other')) === null)
    // MUTATION CONTROL — a seed that primes from render fails C1 and C2.
    const renderSeed = "'use client'\nprimeGscResponse(url, response)\nreturn null"
    check('C-MUT: priming from render fails C1 and C2',
      !/<HtmlSeed /.test(renderSeed) && /primeGscResponse/.test(renderSeed))
  }

  console.log('\nD) built for the project this browser is looking at')
  {
    const projects = [
      { id: 'older', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'newer', updated_at: '2026-06-01T00:00:00Z' },
    ]
    check('D1: the cookie\'s project is used when the caller still owns it',
      activeProjectFromCookie('older', projects) === 'older')
    check('D2: a project the caller does NOT own is dropped, never read',
      activeProjectFromCookie('someone-elses', projects) === 'newer')
    check('D3: …so is a forged value', activeProjectFromCookie('../../etc/passwd', projects) === 'newer')
    check('D4: with nothing saved it falls back exactly as the client does (most recently updated)',
      activeProjectFromCookie(null, projects) === 'newer')
    check('D5: no projects, nothing to prepare', activeProjectFromCookie('older', []) === null)
    check('D6: the cookie is a path-wide, same-site hint with no script privileges',
      /path=\/; max-age=\d+; samesite=lax/.test(activeProjectCookieWrite('p1')) && !/httponly/i.test(activeProjectCookieWrite('p1')))
    check('D7: …and clearing it expires it', /max-age=0/.test(activeProjectCookieWrite(null)))
    check('D8: the value is escaped on the way out', activeProjectCookieWrite('a b').includes('a%20b'))
    const provider = strip(read('lib/active-project/ActiveProjectProvider.tsx'))
    check('D9: the provider writes it only once the list is resolved and loaded',
      /if \(!isResolved \|\| projectsError\) return\s*try \{ document\.cookie = activeProjectCookieWrite\(activeProjectId\)/.test(provider))
    check('D10: localStorage stays the client\'s own authority',
      /localStorage\.setItem\(storageKey, id\)/.test(provider))
    check('D11: the layout names the same cookie the provider writes',
      ACTIVE_PROJECT_COOKIE === 'gt-active-project' && strip(read('app/(dashboard)/layout.tsx')).includes('ACTIVE_PROJECT_COOKIE'))
    // MUTATION CONTROL — trusting the cookie without checking ownership.
    const trusting = (v: string | null) => v
    check('D-MUT: an unchecked cookie would hand over another user\'s project, and fails D2',
      trusting('someone-elses') !== activeProjectFromCookie('someone-elses', projects))
  }

  console.log('\nE) the one metrics view this screen shows starts with the screen, not with its widget')
  {
    const page = strip(read('app/(dashboard)/dashboard/page.tsx'))
    const data = strip(read('components/gsc/gsc-data.ts'))
    check('E1: the screen starts its Search Console reads on mount',
      /prefetchGscScreenReads\(project\.id, \['pages'\]\)/.test(page))
    check('E2: the decision lives beside the reader, never on the screen',
      !/gscStatusView/.test(page) && /export function prefetchGscScreenReads/.test(data))
    check('E3: …and the screen asks nothing when the SERVER says it is off',
      /if \(gscEnabled !== false\) prefetchGscScreenReads/.test(page))
    check('E4: it reads the status first and the views only off a ready one',
      /readGscResponse\(gscStatusUrl\(projectId\)\)[\s\S]{0,300}gscStatusView\(status\.status, status\.body\)\.state !== 'ready'\) return[\s\S]{0,200}readGscResponse\(gscMetricsUrl\(projectId, view\)\)/.test(data))
    check('E5: the screen asks for the one view it actually shows',
      (page.match(/\['(pages|keywords|trend)'\]/g) || []).length === 1)
    // EXECUTED: the condition in E4 really does refuse everything but a synced property.
    check('E6: a project with no connection is not "ready"',
      gscStatusView(200, { ok: true, connection: null, property: null }).state !== 'ready')
    check('E7: a failed status read is not "ready" either', gscStatusView(500, null).state !== 'ready')
    // MUTATION CONTROL — reading the metrics unconditionally fails E2.
    const unguarded = "export function prefetchGscScreenReads() { void readGscResponse(gscMetricsUrl(projectId, view)) }"
    check('E-MUT: an unconditional metrics read fails E4',
      !/gscStatusView\(status\.status, status\.body\)\.state !== 'ready'\) return/.test(unguarded))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
