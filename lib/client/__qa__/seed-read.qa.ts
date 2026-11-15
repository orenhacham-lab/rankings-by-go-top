/**
 * ONE REQUEST FOR THE SEEDING SCAN, and the three things that must stay true
 * about sharing it.
 *
 * Measured on 2026-11-14 in production: a dashboard load fetched
 * GET /api/projects/[id]/seed twice, 590ms and 588ms, because four independent
 * hooks each read it with `cache: 'no-store'` and nothing joined them up.
 * lib/client/seed-read.ts joins them, and this suite holds it to the contract
 * the callers depend on:
 *
 *   A. overlapping and near-simultaneous reads share ONE request;
 *   B. a poller still sees changes — the window is far shorter than the
 *      intervals the callers use (3s, 8s), and `fresh` bypasses it;
 *   C. one caller giving up does not fail the others, and a failed request is
 *      reported, never thrown.
 *
 * Section D is the source guard: no component may go back to fetching that
 * route directly, which is what made the duplicate.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readSeed, seedUrl, SEED_COALESCE_MS, __setSeedReadTestHooks } from '../seed-read'

const ROOT = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Comments are not code — the repo convention for every source guard. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

/** A clock the test moves by hand, and a transport that counts and can be held open. */
function harness() {
  let now = 1_000_000
  const calls: string[] = []
  let pending: ((body: { status: number; json: unknown }) => void)[] = []
  const fetchImpl = ((url: string) => {
    calls.push(String(url))
    return new Promise((resolve) => {
      pending.push(({ status, json }) => resolve({
        status, ok: status >= 200 && status < 300, json: async () => json,
      } as unknown as Response))
    })
  }) as unknown as typeof fetch
  __setSeedReadTestHooks({ now: () => now, fetch: fetchImpl })
  return {
    calls,
    advance: (ms: number) => { now += ms },
    /** Answer every outstanding request. */
    settle: async (status = 200, json: unknown = { ok: true, run: null }) => {
      const waiting = pending
      pending = []
      waiting.forEach((r) => r({ status, json }))
      await new Promise((r) => setTimeout(r, 0))
    },
    outstanding: () => pending.length,
  }
}

async function main() {
  console.log('\nA) Reads that overlap share one request')
  {
    const h = harness()
    const a = readSeed('p1')
    const b = readSeed('p1')
    const c = readSeed('p1')
    check('A1: three concurrent reads make ONE request', h.calls.length === 1, `calls=${h.calls.length}`)
    await h.settle(200, { ok: true, run: { id: 'r1' } })
    const [ra, rb, rc] = await Promise.all([a, b, c])
    check('A2: and all three get the same answer',
      ra.status === 200 && rb.status === 200 && rc.status === 200
      && JSON.stringify(ra.body) === JSON.stringify(rc.body))
    check('A3: the request is the project\'s own seed route', h.calls[0] === seedUrl('p1'), h.calls[0])

    const other = readSeed('p2')
    check('A4: a DIFFERENT project is never served from another project\'s read', h.calls.length === 2)
    await h.settle()
    await other
  }

  console.log('\nB) A poller still sees changes')
  {
    const h = harness()
    const first = readSeed('p1')
    await h.settle(200, { ok: true, run: { id: 'r1' } })
    await first

    h.advance(SEED_COALESCE_MS - 1)
    const sameMoment = readSeed('p1')
    check('B1: a read in the same moment is served without a second request', h.calls.length === 1)
    await sameMoment

    h.advance(2)
    const later = readSeed('p1')
    check('B2: once the window has passed, a read makes its own request', h.calls.length === 2)
    await h.settle(200, { ok: true, run: { id: 'r2' } })
    check('B3: and it sees the NEW state', JSON.stringify((await later).body).includes('r2'))

    check('B4: the window is far shorter than the shortest poll interval (3s)', SEED_COALESCE_MS < 3_000,
      String(SEED_COALESCE_MS))

    h.advance(1)
    const fresh = readSeed('p1', { fresh: true })
    check('B5: `fresh` bypasses the window, for a read that follows a start', h.calls.length === 3)
    await h.settle()
    await fresh
  }

  console.log('\nC) Giving up, and failing, are each one caller\'s business')
  {
    const h = harness()
    const controller = new AbortController()
    const givingUp = readSeed('p1', { signal: controller.signal })
    const staying = readSeed('p1')
    controller.abort()
    const abandoned = await givingUp
    check('C1: the caller that aborted stops waiting, and says so',
      abandoned.aborted === true && abandoned.status === 0, JSON.stringify(abandoned))
    check('C2: the shared request is still outstanding, not cancelled', h.outstanding() === 1)
    await h.settle(200, { ok: true, run: { id: 'r9' } })
    const kept = await staying
    check('C3: and the caller that stayed gets the real answer', kept.status === 200)

    const already = new AbortController()
    already.abort()
    const immediate = await readSeed('p1', { signal: already.signal, fresh: true })
    check('C4: a signal already aborted is answered at once, without waiting', immediate.aborted === true)
    await h.settle()
  }

  console.log('\nD) No component reads that route directly any more')
  {
    /**
     * EVERY component that READS that route, not the four this suite first listed.
     * The first version of this guard named four files, and a production load on
     * 15.11.2026 still fetched the route TWICE: components/mapping/useMapping.ts
     * was the second caller and the guard could not see it, because it only
     * checked the files it already knew about. The list is now the answer to
     * "who reads this route", taken from a search of the whole components tree.
     *
     * components/keyword-research/useScanResearch.ts reads it too and is NOT
     * here: it belongs to the keyword-research screen, where it is the only
     * reader, and its own suite (keyword-research-screen.qa.ts) holds it to one
     * read. Add it here the day that screen shares a page with another reader.
     */
    const FILES = [
      'components/dashboard/useDashboardData.ts',
      'components/settings/useSiteScan.ts',
      'components/ai-visibility/useSeedPageState.ts',
      'components/onboarding/useSeedRun.ts',
      'components/mapping/useMapping.ts',
      'components/content-strategy/useStrategyData.ts',
    ]
    const direct = /fetch\(\s*`?\/api\/projects\/\$\{[^}]*\}\/seed`?\s*(,|\))/
    for (const f of FILES) {
      const src = strip(read(f))
      const get = direct.test(src) && !/method:\s*'POST'/.test(src.slice(Math.max(0, src.search(direct) - 40), src.search(direct) + 220))
      check(`D-${f.split('/').pop()}: reads the scan through the shared layer`,
        !get && /readSeed/.test(src))
    }
    check('D-MUT: the guard\'s pattern DOES match a direct read, so D is not vacuous',
      direct.test("const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/seed`, { cache: 'no-store' })"))

    /**
     * D2 closes the hole that let the duplicate survive: a file is only caught
     * above if someone remembered to list it, and a reader that builds the path
     * in its own helper (`mappingUrl`) was caught by neither. So this check asks
     * the whole tree instead — who even SPELLS that path — and holds the answer
     * to a list where every entry has a reason to.
     */
    const SPELLS_THE_PATH: Record<string, string> = {
      'lib/client/seed-read.ts': 'the shared layer itself: the one place the path is built',
      'components/settings/useSiteScan.ts': 'POST { action: start }: the settings\' own rescan',
      'components/onboarding/ResearchSummary.tsx': 'POST { action: continue }: stage B, from a click',
      'components/keyword-research/useScanResearch.ts': 'the keyword-research screen, where it is the only reader',
      'app/api/projects/[id]/onboarding/start/route.ts': 'server-side, not a browser read at all',
    }
    const LITERAL = /projects\/\$\{(?:encodeURIComponent\(projectId\)|projectId)\}\/seed/
    const walk = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true })
      .flatMap((e) => {
        const p = `${dir}/${e.name}`
        if (e.isDirectory()) return e.name === '__qa__' || e.name === 'node_modules' ? [] : walk(p)
        return /\.tsx?$/.test(e.name) ? [p] : []
      })
    const spelling = ['components', 'lib', 'app'].flatMap(walk).filter((f) => LITERAL.test(strip(read(f)))).sort()
    const unexpected = spelling.filter((f) => !(f in SPELLS_THE_PATH))
    check('D2: only the shared layer, the two POST senders and the single-reader screen spell that path',
      unexpected.length === 0, unexpected.join(', '))
    check('D2-MUT: the walk DOES find the files, so D2 is not vacuous',
      spelling.includes('lib/client/seed-read.ts') && spelling.length >= 4, String(spelling.length))
  }

  console.log('\nE) The registry is shared across module copies, not per instance')
  {
    // A client module imported from two route segments can be emitted twice.
    // Two instances means two maps, and the measured symptom is two requests
    // for the same project starting in the same millisecond. The registry is
    // therefore keyed off globalThis, so every copy coalesces into one map.
    const src = strip(read('lib/client/seed-read.ts'))
    check('E1: the map is read from globalThis, never a module-scope const',
      /globalThis/.test(src) && !/^const entries = new Map/m.test(src))
    check('E2: every use goes through the registry accessor',
      /function registry\(\)/.test(src) && /const entries = registry\(\)/.test(src))

    // Behavioural: a second module copy, simulated by reading the live map off
    // globalThis, sees what this instance put there.
    const h = harness()
    const shared = (globalThis as Record<string, unknown>)['__goTopSeedReadEntries__']
    check('E3: the registry exists on globalThis after a read', shared instanceof Map)
    const first = readSeed('pE')
    check('E4: the in-flight entry is visible to any other copy of the module',
      (shared as Map<string, unknown>).has('pE'))
    void readSeed('pE')
    check('E5: a second caller shares the one request', h.outstanding() === 1)
    await h.settle(200, { ok: true })
    await first
    check('E6-MUT: a per-instance map would fail E4 — a fresh Map has no entry',
      !new Map<string, unknown>().has('pE'))
  }

  __setSeedReadTestHooks(null)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
