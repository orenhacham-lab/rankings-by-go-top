/**
 * Area A — weekly GSC auto-sync dispatcher.
 *
 * Behavioral: the pure selector (eligibility, 7-day filter, NULLS-FIRST ordering,
 * batch bound), the dispatcher (per-project isolation, benign-skip mapping, the
 * time-budget stop) and the REAL cron route's authorization (404 / 503 fail-closed /
 * 401). Source-contract: engine reuse + no token reads in the candidate loader.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { selectDueProjects, dispatchAutoSync, AUTO_SYNC_MIN_INTERVAL_DAYS, type AutoSyncCandidate } from '../auto-sync'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-07-25T00:00:00Z')
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const cand = (o: Partial<AutoSyncCandidate> & { projectId: string }): AutoSyncCandidate => ({
  connectionId: 'c1', siteUrl: 'https://x.co/', projectActive: true, connectionStatus: 'connected', lastSuccessAt: null, ...o,
})

async function main() {
  console.log('A) selectDueProjects — eligibility, 7-day filter, ordering, batch bound')

  // ── Eligibility: only active + connected + due.
  {
    const r = selectDueProjects([
      cand({ projectId: 'ok-never' }),
      cand({ projectId: 'inactive', projectActive: false }),
      cand({ projectId: 'reauth', connectionStatus: 'reauth_required' }),
      cand({ projectId: 'revoked', connectionStatus: 'revoked' }),
      cand({ projectId: 'errored', connectionStatus: 'error' }),
      cand({ projectId: 'recent', lastSuccessAt: ago(2) }),
    ], { nowMs: NOW, limit: 10 })
    check('only the eligible project is due', r.due.map((d) => d.projectId).join(',') === 'ok-never')
    const reasons = Object.fromEntries(r.skipped.map((s) => [s.projectId, s.reason]))
    check('inactive project skipped', reasons.inactive === 'project_inactive')
    check('reauth_required skipped with its own reason', reasons.reauth === 'connection_reauth_required')
    check('revoked skipped with its own reason', reasons.revoked === 'connection_revoked')
    check('other non-connected status skipped', reasons.errored === 'connection_not_connected')
    check('synced <7 days ago skipped', reasons.recent === 'synced_recently')
  }

  // ── The 7-day boundary.
  {
    const justUnder = selectDueProjects([cand({ projectId: 'p', lastSuccessAt: ago(AUTO_SYNC_MIN_INTERVAL_DAYS - 0.01) })], { nowMs: NOW, limit: 5 })
    const justOver = selectDueProjects([cand({ projectId: 'p', lastSuccessAt: ago(AUTO_SYNC_MIN_INTERVAL_DAYS + 0.01) })], { nowMs: NOW, limit: 5 })
    check('just under 7 days → not due', justUnder.due.length === 0)
    check('just over 7 days → due', justOver.due.length === 1)
    check('interval constant is 7 days', AUTO_SYNC_MIN_INTERVAL_DAYS === 7)
  }

  // ── Ordering: never-synced first, then oldest-first, deterministic tiebreak.
  {
    const r = selectDueProjects([
      cand({ projectId: 'b-old', lastSuccessAt: ago(30) }),
      cand({ projectId: 'a-never' }),
      cand({ projectId: 'c-older', lastSuccessAt: ago(60) }),
      cand({ projectId: 'b-never' }),
    ], { nowMs: NOW, limit: 10 })
    check('NULLS FIRST then oldest-first', r.due.map((d) => d.projectId).join(',') === 'a-never,b-never,c-older,b-old')
  }
  {
    const tie = selectDueProjects([
      cand({ projectId: 'zz', lastSuccessAt: ago(20) }),
      cand({ projectId: 'aa', lastSuccessAt: ago(20) }),
    ], { nowMs: NOW, limit: 10 })
    check('equal timestamps tie-break by projectId (deterministic)', tie.due.map((d) => d.projectId).join(',') === 'aa,zz')
  }

  // ── Batch bound + natural rotation (a just-synced project drops out next day).
  {
    const many = Array.from({ length: 25 }, (_, i) => cand({ projectId: `p${String(i).padStart(2, '0')}`, lastSuccessAt: ago(30 + i) }))
    const r = selectDueProjects(many, { nowMs: NOW, limit: 10 })
    check('batch is bounded by limit', r.due.length === 10)
    check('dueTotal reports the full backlog', r.dueTotal === 25)
    check('oldest 10 selected first', r.due[0].projectId === 'p24' && r.due[9].projectId === 'p15')
    // Rotation: the ones just synced now have a fresh timestamp → not due tomorrow.
    const after = many.map((c) => (r.due.some((d) => d.projectId === c.projectId) ? { ...c, lastSuccessAt: new Date(NOW).toISOString() } : c))
    const tomorrow = selectDueProjects(after, { nowMs: NOW + DAY, limit: 10 })
    check('just-synced projects rotate to the back (none repeat next day)',
      !tomorrow.due.some((d) => r.due.some((prev) => prev.projectId === d.projectId)))
  }

  console.log('B) dispatchAutoSync — isolation, benign skips, time budget')

  // ── One project failing must not stop the others.
  {
    const calls: string[] = []
    const r = await dispatchAutoSync({
      candidates: [cand({ projectId: 'a' }), cand({ projectId: 'b' }), cand({ projectId: 'c' })],
      nowMs: NOW, limit: 10, timeBudgetMs: 240_000, perProjectReserveMs: 45_000, elapsedMs: () => 0,
      syncOne: async (c) => {
        calls.push(c.projectId)
        if (c.projectId === 'b') throw Object.assign(new Error('boom'), { code: 'window_fetch_failed' })
        return { status: 'succeeded' as const }
      },
    })
    check('all three projects attempted despite the middle one throwing', calls.join(',') === 'a,b,c')
    check('summary counts 2 succeeded / 1 failed', r.succeeded === 2 && r.failed === 1)
    check('failure recorded with a sanitized code', r.results.find((x) => x.projectId === 'b')?.error === 'window_fetch_failed')
  }

  // ── Benign outcomes are skips, not failures.
  {
    const r = await dispatchAutoSync({
      candidates: [cand({ projectId: 'lock' }), cand({ projectId: 'reauth' }), cand({ projectId: 'real' })],
      nowMs: NOW, limit: 10, timeBudgetMs: 240_000, perProjectReserveMs: 45_000, elapsedMs: () => 0,
      syncOne: async (c) => {
        if (c.projectId === 'lock') throw Object.assign(new Error('x'), { code: 'sync_in_progress' })
        if (c.projectId === 'reauth') throw Object.assign(new Error('x'), { code: 'reauth_required' })
        throw Object.assign(new Error('x'), { code: 'token_decrypt_failed' })
      },
    })
    check('already-running counted as a skip, not a failure', r.results.find((x) => x.projectId === 'lock')?.status === 'skipped')
    check('reauth_required counted as a skip', r.results.find((x) => x.projectId === 'reauth')?.status === 'skipped')
    check('a genuine error is still a failure', r.results.find((x) => x.projectId === 'real')?.status === 'failed')
    check('summary separates skippedAtRun from failed', r.skippedAtRun === 2 && r.failed === 1)
  }

  // ── Time-budget guard: stop LAUNCHING when the remaining time can't fit a project.
  {
    let elapsed = 0
    const launched: string[] = []
    const r = await dispatchAutoSync({
      candidates: Array.from({ length: 5 }, (_, i) => cand({ projectId: `p${i}` })),
      nowMs: NOW, limit: 10, timeBudgetMs: 100_000, perProjectReserveMs: 40_000, elapsedMs: () => elapsed,
      syncOne: async (c) => { launched.push(c.projectId); elapsed += 30_000; return { status: 'succeeded' as const } },
    })
    // Launch at 0 and 30_000 (both ≤ 60_000); at 60_000 it is not > 60_000 → launches a 3rd; at 90_000 it stops.
    check('stopped before exhausting the budget', r.stoppedForTime === true)
    check('did not launch all 5 projects', launched.length < 5 && launched.length >= 2, `launched=${launched.length}`)
    check('unlaunched projects are simply left for the next run (no failures)', r.failed === 0)
  }

  // ── Nothing due → a clean no-op.
  {
    const r = await dispatchAutoSync({
      candidates: [cand({ projectId: 'recent', lastSuccessAt: ago(1) })],
      nowMs: NOW, limit: 10, timeBudgetMs: 240_000, perProjectReserveMs: 45_000, elapsedMs: () => 0,
      syncOne: async () => { throw new Error('must not run') },
    })
    check('nothing due → nothing launched', r.launched === 0 && r.dueTotal === 0 && !r.stoppedForTime)
  }

  console.log('C) cron route authorization (real handler)')
  {
    const prevFlag = process.env.GSC_READ_ONLY_ENABLED
    const prevSecret = process.env.CRON_SECRET
    const url = 'https://app.test/api/gsc/sync/cron'
    const mod = await import('../../../app/api/gsc/sync/cron/route')

    // Feature flag off → 404 (matches the other GSC routes).
    process.env.GSC_READ_ONLY_ENABLED = 'false'
    process.env.CRON_SECRET = 'top-secret'
    check('flag off → 404', (await mod.GET(new Request(url))).status === 404)

    // Flag on, secret NOT configured → FAIL CLOSED (never "no auth required").
    process.env.GSC_READ_ONLY_ENABLED = 'true'
    delete process.env.CRON_SECRET
    const unconfigured = await mod.GET(new Request(url))
    check('secret unset → fails closed (not 200)', unconfigured.status === 503)
    check('secret unset → does NOT run the dispatcher', (await unconfigured.json()).error === 'cron_not_configured')

    // Flag on, secret configured → missing / wrong / malformed bearer all 401.
    process.env.CRON_SECRET = 'top-secret'
    check('missing Authorization → 401', (await mod.GET(new Request(url))).status === 401)
    check('wrong secret → 401', (await mod.GET(new Request(url, { headers: { authorization: 'Bearer nope' } }))).status === 401)
    check('bare secret without Bearer → 401', (await mod.GET(new Request(url, { headers: { authorization: 'top-secret' } }))).status === 401)
    check('POST is protected the same way', (await mod.POST(new Request(url, { method: 'POST' }))).status === 401)

    // Correct secret → passes authorization (proceeds; DB is unreachable here, so it
    // returns a sanitized 500 rather than any auth rejection).
    const authed = await mod.GET(new Request(url, { headers: { authorization: 'Bearer top-secret' } }))
    check('correct secret passes auth (not 401/503/404)', ![401, 503, 404].includes(authed.status))
    const body = await authed.json().catch(() => ({}))
    check('failure response carries only a sanitized code (no raw message)',
      typeof body.error === 'string' && /^[a-z0-9_]+$/.test(body.error))

    if (prevFlag === undefined) delete process.env.GSC_READ_ONLY_ENABLED; else process.env.GSC_READ_ONLY_ENABLED = prevFlag
    if (prevSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prevSecret
  }

  console.log('D) source contract — engine reuse, no second sync engine, no token reads')
  {
    const route = strip(read('app/api/gsc/sync/cron/route.ts'))
    check('reuses the existing executeManualSync engine', /executeManualSync\(\{/.test(route))
    check('reuses the shared store/client adapters', /makeSyncStore\(admin\)/.test(route) && /makeSyncClient\(accessToken/.test(route))
    check('does NOT skip auth when the secret is absent', /if \(!cronSecret\)/.test(route) && !/if \(cronSecret\) \{/.test(route))
    check('never logs tokens', !/accessToken[^)]*console|console\.[a-z]+\([^)]*token/i.test(route))

    const store = strip(read('lib/gsc/auto-sync-store.ts'))
    check('candidate loader never selects token columns', !/encrypted_refresh_token|access_token/.test(store))
    check('candidate scan is bounded', /MAX_CANDIDATES/.test(store) && /\.limit\(MAX_CANDIDATES\)/.test(store))

    const vercel = read('vercel.json')
    check('cron registered in vercel.json on a daily schedule', /"\/api\/gsc\/sync\/cron"/.test(vercel) && /"schedule": "0 \d+ \* \* \*"/.test(vercel))

    const panel = strip(read('components/content/GscPanel.tsx'))
    check('UI wires the last-sync finishedAt', /w\?\.finishedAt/.test(panel) && /t\.lastSyncedAt/.test(panel))
    check('UI shows next eligibility as a lower bound + keeps manual sync',
      /AUTO_SYNC_MIN_INTERVAL_DAYS/.test(panel) && /nextAutoSyncFrom/.test(panel) && /nextAutoSyncHint/.test(panel) && /t\.syncNow/.test(panel))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
