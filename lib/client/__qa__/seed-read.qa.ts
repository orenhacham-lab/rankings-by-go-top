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
import { readFileSync } from 'node:fs'
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
    const FILES = [
      'components/dashboard/useDashboardData.ts',
      'components/settings/useSiteScan.ts',
      'components/ai-visibility/useSeedPageState.ts',
      'components/onboarding/useSeedRun.ts',
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
  }

  __setSeedReadTestHooks(null)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

void main()

export {}
