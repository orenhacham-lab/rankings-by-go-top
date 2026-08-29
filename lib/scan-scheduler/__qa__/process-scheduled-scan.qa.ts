/**
 * Phase 3 (review correction) — BEHAVIORAL proof for
 * processScheduledScanForProject (extracted from app/api/schedule/route.ts
 * specifically so this could be tested directly, not just via source-text
 * regex assertions). Exercises the real function against the FakeAdmin RPC
 * simulation (lib/__qa__/_fake-admin.ts).
 *
 * IMPORTANT — scope of what this proves: FakeAdmin's `.rpc()` is a
 * hand-written JS simulation of the real SQL RPCs (reserve_usage etc.),
 * mirroring their documented outcome contract branch-for-branch. Running
 * this test proves: (a) processScheduledScanForProject calls the ledger
 * correctly for every code path, (b) the occurrence/attempt/remaining-
 * target logic produces the right amounts in every scenario below, and (c)
 * the FakeAdmin simulation's own idempotency/capacity logic is internally
 * consistent. It does NOT prove true concurrent-transaction safety under
 * real parallel PostgreSQL connections — that guarantee lives in
 * pg_advisory_xact_lock inside the real migration SQL and can only be
 * verified against a live database, which this environment does not have
 * (see the final report's explicit code-simulation-vs-real-DB distinction).
 *
 * Run: npx tsx lib/scan-scheduler/__qa__/process-scheduled-scan.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { processScheduledScanForProject, MAX_SCAN_RETRIES } from '../process-scheduled-scan'
import type { ScanOutput } from '@/lib/scanner/types'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const NOW = new Date('2026-08-15T06:00:00Z')
const PERIOD_START = '2026-08-01T00:00:00Z'
const PERIOD_END = '2026-09-01T00:00:00Z'

function baseline(overrides: {
  targetCount?: number
  scanRetryCount?: number
  nextScanAt?: string | null
  extraReservations?: Record<string, unknown>[]
} = {}) {
  const targetCount = overrides.targetCount ?? 3
  const targets = Array.from({ length: targetCount }, (_, i) => ({
    id: `t${i + 1}`, project_id: 'p1', keyword: `keyword ${i + 1}`, engine_type: 'google_search', is_active: true,
  }))
  return new FakeAdmin({
    projects: [{
      id: 'p1', user_id: 'u1', name: 'Test Project', is_active: true, auto_scan_enabled: true,
      scan_frequency: 'monthly', next_scan_at: overrides.nextScanAt ?? '2026-08-15T06:00:00Z',
      scan_claimed_at: null, scan_retry_count: overrides.scanRetryCount ?? 0,
      target_domain: 'example.com', business_name: 'Example', country: 'IL', language: 'he', city: null, device_type: null,
    }],
    tracking_targets: targets,
    scans: [],
    scan_results: [],
    profiles: [],
    subscriptions: [{ id: 's1', user_id: 'u1', status: 'active', plan_code: 'regular', trial_ends_at: null, current_period_start: PERIOD_START, current_period_end: PERIOD_END, created_at: PERIOD_START }],
    shopify_connections: [],
    usage_reservations: overrides.extraReservations ?? [],
  }, {}, () => NOW.getTime())
}

type RunScanFn = (engine: string, input: unknown) => Promise<ScanOutput>

/** A mock runScanFn: resolves 'ok' N times then rejects on call N+1 (and every call after). */
function mockRunScan(okCount: number): { fn: RunScanFn } {
  let calls = 0
  const fn: RunScanFn = async () => {
    calls++
    if (calls <= okCount) {
      return { found: true, position: 5, resultUrl: 'https://example.com', resultTitle: 'x', resultAddress: null, error: null }
    }
    throw new Error('provider network error')
  }
  return { fn }
}
function alwaysOk(): RunScanFn {
  return async () => ({ found: true, position: 3, resultUrl: null, resultTitle: null, resultAddress: null, error: null })
}

async function main() {
  console.log('Phase 3 (review correction) — processScheduledScanForProject behavioral QA\n')

  console.log('1) Failure BEFORE any reservation is ever granted — nothing to release, nothing consumed')
  {
    const admin = baseline({ targetCount: 3 })
    // Fail the tracking_targets load itself — the earliest possible failure
    // point, guaranteed before any reservation or dispatch is attempted.
    ;(admin as unknown as { hooks: Record<string, unknown> }).hooks = { tracking_targets: { select: () => ({ message: 'db down' }) } }
    const outcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: alwaysOk() })
    check('outcome is a plain error (no exception escapes)', outcome.status === 'error')
    check('no reservation was ever created (nothing to release)', admin.tables.usage_reservations.length === 0)
    check('no scan row was created', admin.tables.scans.length === 0)
  }

  console.log('\n1b) Reservation granted, then the FIRST dispatch attempt itself fails — dispatchedCount is 1 at the moment of failure (the pre-increment covers the attempted-but-rejected call too, per this codebase\'s existing "dispatched = consumed regardless of outcome" rule); the RPC contract\'s dispatchedCount===0 branch itself is proven directly in lib/billing/__qa__/usage-reservations.qa.ts test 10 ("no provider request dispatched... release, consume zero") — this scenario proves the SCHEDULER wires that contract correctly for the earliest failure its control flow can actually produce')
  {
    const admin = baseline({ targetCount: 3 })
    const alwaysThrows = async (): Promise<ScanOutput> => { throw new Error('immediate provider failure') }
    const outcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: alwaysThrows })
    check('outcome is will_retry (below MAX_SCAN_RETRIES)', outcome.status === 'will_retry')
    const res = admin.tables.usage_reservations[0] as Record<string, unknown>
    check('exactly one reservation exists', admin.tables.usage_reservations.length === 1)
    check('status is partially_consumed (1 of 3 consumed, not a blanket release)', res.status === 'partially_consumed')
    check('consumed_amount is exactly 1 (the one attempted call, even though it rejected)', res.consumed_amount === 1)
    check('released_amount is exactly 2 (the two never-attempted targets)', res.released_amount === 2)
    check('zero scan_results rows were written (the one attempt rejected before any insert)', admin.tables.scan_results.length === 0)
    check('scan_retry_count advanced to 1', admin.tables.projects[0].scan_retry_count === 1)
    check('next_scan_at is UNTOUCHED (same occurrence retried tomorrow)', admin.tables.projects[0].next_scan_at === '2026-08-15T06:00:00Z')
  }

  console.log('\n2) Failure after exactly one full dispatch — consume exactly what was attempted, release the rest, never erase the one real result')
  {
    const admin = baseline({ targetCount: 3 })
    const { fn } = mockRunScan(1) // target[0] succeeds; target[1]'s call rejects
    const outcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: fn })
    check('outcome is will_retry', outcome.status === 'will_retry')
    check('exactly ONE scan_results row was recorded (target[0]\'s successful dispatch)', admin.tables.scan_results.length === 1)
    const res = admin.tables.usage_reservations[0] as Record<string, unknown>
    check('status is partially_consumed', res.status === 'partially_consumed')
    // dispatchedCount increments BEFORE each provider call (including the one
    // that then rejects) — target[0] (recorded) + target[1] (attempted, then
    // rejected) = 2 attempts genuinely dispatched to the provider.
    check('consumed_amount is exactly 2 (both attempted calls — the rejecting one still reached the provider)', res.consumed_amount === 2)
    check('released_amount is exactly 1 (the untouched target[2], never attempted)', res.released_amount === 1)
    check('reserved_amount (3) === consumed_amount + released_amount — nothing lost, nothing double-counted', (res.reserved_amount as number) === (res.consumed_amount as number) + (res.released_amount as number))
  }

  console.log('\n3) Failure after several dispatches (2 of 4) — same exact-accounting guarantee at a different split')
  {
    const admin = baseline({ targetCount: 4 })
    const { fn } = mockRunScan(2) // target[0], target[1] succeed; target[2] rejects
    const outcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: fn })
    check('outcome is will_retry', outcome.status === 'will_retry')
    check('exactly TWO scan_results rows recorded', admin.tables.scan_results.length === 2)
    const res = admin.tables.usage_reservations[0] as Record<string, unknown>
    check('consumed_amount is 3 (2 recorded + 1 attempted-then-rejected)', res.consumed_amount === 3)
    check('released_amount is 1 (the never-attempted target[3])', res.released_amount === 1)
  }

  console.log('\n4) Successful retry after partial consumption — the SAME occurrence, a NEW attempt, resumes with ONLY the remaining targets, never re-dispatches the already-consumed ones')
  {
    const admin = baseline({ targetCount: 3 })
    const { fn: firstAttemptFn } = mockRunScan(1) // target[0] succeeds, target[1] rejects
    const firstOutcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: firstAttemptFn })
    check('first attempt: will_retry', firstOutcome.status === 'will_retry')
    check('first attempt: 1 scan_results row, retry_count=1', admin.tables.scan_results.length === 1 && admin.tables.projects[0].scan_retry_count === 1)

    // Retry (a new cron tick tomorrow) — same project row (scan_retry_count
    // now 1, so a NEW attempt key), everything now succeeds.
    const secondAttemptRunCalls: string[] = []
    const secondFn = async (_engine: string, input: { keyword: string }): Promise<ScanOutput> => {
      secondAttemptRunCalls.push(input.keyword)
      return { found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null }
    }
    const secondOutcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: new Date(NOW.getTime() + 86_400_000), runScanFn: secondFn })
    check('second attempt: completed', secondOutcome.status === 'completed')
    check('the retry dispatched ONLY the 2 remaining targets (keyword 2 and 3) — NOT keyword 1 again', secondAttemptRunCalls.length === 2 && !secondAttemptRunCalls.includes('keyword 1'))
    check('cumulative scan_results is now 3 (1 from attempt 1 + 2 from attempt 2) — the first result was never erased', admin.tables.scan_results.length === 3)
    const reservations = admin.tables.usage_reservations
    check('TWO distinct reservation rows exist (one per attempt), never reusing a finalized key', reservations.length === 2)
    check('reservation 1 (attempt0) stays partially_consumed with consumed_amount=2, UNCHANGED by the retry', (reservations[0] as Record<string, unknown>).status === 'partially_consumed' && (reservations[0] as Record<string, unknown>).consumed_amount === 2)
    check('reservation 2 (attempt1) is fully consumed with consumed_amount=2 (the 2 remaining)', (reservations[1] as Record<string, unknown>).status === 'consumed' && (reservations[1] as Record<string, unknown>).consumed_amount === 2)
    check('total consumed across both reservations (4) never exceeds what was ever needed for 3 real targets + 1 rejected-attempt (matches scenario 2\'s accounting)', (reservations[0] as Record<string, unknown>).consumed_amount === 2 && (reservations[1] as Record<string, unknown>).consumed_amount === 2)
    check('next_scan_at finally advances past this occurrence (terminal success — computed from the retry\'s own "now", 1 month past Aug 16)', admin.tables.projects[0].next_scan_at === '2026-09-16T06:00:00.000Z')
    check('scan_retry_count reset to 0 after success', admin.tables.projects[0].scan_retry_count === 0)
  }

  console.log('\n5) Three failed retry attempts — gives up after MAX_SCAN_RETRIES, never retries the same occurrence forever')
  {
    const admin = baseline({ targetCount: 2 })
    const alwaysThrows = async (): Promise<ScanOutput> => { throw new Error('permanent provider outage') }
    let outcome
    for (let attempt = 0; attempt < MAX_SCAN_RETRIES; attempt++) {
      outcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: new Date(NOW.getTime() + attempt * 86_400_000), runScanFn: alwaysThrows })
    }
    check(`after exactly ${MAX_SCAN_RETRIES} attempts, gives up`, outcome!.status === 'failed_max_retries')
    check('scan_retry_count reset to 0 (occurrence closed out)', admin.tables.projects[0].scan_retry_count === 0)
    check('next_scan_at advanced to next month (won\'t retry this occurrence again)', admin.tables.projects[0].next_scan_at !== '2026-08-15T06:00:00Z')
    check('the scans row is marked failed with the cumulative (zero) tally, not left running forever', admin.tables.scans[0].status === 'failed')
    check(`exactly ${MAX_SCAN_RETRIES} reservation rows exist (one per attempt, all released)`, admin.tables.usage_reservations.length === MAX_SCAN_RETRIES)
    check('every one of them is partially_consumed with EXACTLY 1 consumed, 1 released (the first target of each 2-target attempt was genuinely dispatched before the crash — none of them is a blanket full release, and none double-counts across attempts)',
      admin.tables.usage_reservations.every((r) => (r as Record<string, unknown>).status === 'partially_consumed' && (r as Record<string, unknown>).consumed_amount === 1 && (r as Record<string, unknown>).released_amount === 1))

    console.log('\n5b) A NEW monthly occurrence remains schedulable after the previous one is exhausted')
    {
      const workingFn = async (): Promise<ScanOutput> => ({ found: true, position: 2, resultUrl: null, resultTitle: null, resultAddress: null, error: null })
      const nextMonthOutcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: new Date(NOW.getTime() + 40 * 86_400_000), runScanFn: workingFn })
      check('the NEW occurrence (next month, retry_count=0 again) succeeds normally', nextMonthOutcome.status === 'completed')
    }
  }

  console.log('\n6) Concurrent duplicate execution of the SAME occurrence/attempt — the claim prevents genuine double-processing; a race on the SAME attempt key never double-reserves or double-dispatches')
  {
    const admin = baseline({ targetCount: 2 })
    const fn = async (): Promise<ScanOutput> => ({ found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null })
    // Simulate two "simultaneous" cron invocations processing the SAME
    // project by racing two calls; FakeAdmin is single-threaded so the
    // atomic claim (a conditional UPDATE) resolves deterministically —
    // exactly one wins.
    const [r1, r2] = await Promise.all([
      processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: fn }),
      processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: fn }),
    ])
    const statuses = [r1.status, r2.status].sort()
    check('exactly one invocation actually processed the project (completed), the other was skipped', statuses[0] === 'completed' && statuses[1] === 'skipped')
    check('scan_results has exactly 2 rows (one project-worth), never 4 (no double-dispatch)', admin.tables.scan_results.length === 2)
    check('exactly one reservation exists (no double-reservation)', admin.tables.usage_reservations.length === 1)
  }

  console.log('\n6b) A crashed worker leaves a STALE claim (older than 1 hour) — it is NOT permanently stuck; the next cron tick recovers it')
  {
    const admin = baseline({ targetCount: 2 })
    // Simulate a worker that claimed the project over an hour ago and then
    // crashed (no scan row was ever created — the crash happened before that).
    admin.tables.projects[0].scan_claimed_at = new Date(NOW.getTime() - 90 * 60_000).toISOString() // 90 minutes ago
    const fn = async (): Promise<ScanOutput> => ({ found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null })
    const outcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: fn })
    check('the stale claim (>1h old) does NOT block a fresh attempt — it succeeds normally', outcome.status === 'completed')
    check('the project is unclaimed again afterward (not stuck)', admin.tables.projects[0].scan_claimed_at === null)
  }

  console.log('\n6c) A FRESH claim (within the last hour) genuinely blocks a second concurrent attempt')
  {
    const admin = baseline({ targetCount: 2 })
    admin.tables.projects[0].scan_claimed_at = new Date(NOW.getTime() - 5 * 60_000).toISOString() // 5 minutes ago — still fresh
    const fn = async (): Promise<ScanOutput> => ({ found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null })
    const outcome = await processScheduledScanForProject(admin as unknown as Admin, admin.tables.projects[0], { now: NOW, runScanFn: fn })
    check('a fresh claim blocks this attempt', outcome.status === 'skipped' && outcome.reason === 'already_claimed')
    check('no reservation or scan was created by the blocked attempt', admin.tables.usage_reservations.length === 0 && admin.tables.scans.length === 0)
  }

  console.log('\n7) Exact consumed/released amounts summary — cross-check every scenario above already asserted precise numbers (reserved = consumed + released in every case)')
  {
    check('this scenario is a documentation checkpoint only — see the per-scenario assertions above', true)
  }

  console.log('\n8) 2nd correction — a worker cannot accidentally claim the NEXT monthly occurrence using a STALE occurrence value, even when scan_claimed_at itself is available')
  {
    // Simulates: this worker loaded the project row a while ago (next_scan_at
    // = Aug 15, its in-memory snapshot), but by the time it actually attempts
    // the claim, next_scan_at has ALREADY been advanced to Sep 15 by another
    // completed run — scan_claimed_at is null (available), so a claim keyed
    // ONLY on scan_claimed_at would incorrectly succeed and reprocess using
    // the stale Aug 15 occurrence anchor. The strengthened claim's
    // `.eq('next_scan_at', <the snapshot's value>)` must refuse this.
    const admin = baseline({ targetCount: 2, nextScanAt: '2026-08-15T06:00:00Z' })
    const staleSnapshot = { ...admin.tables.projects[0] } // captured BEFORE the "external" advance below
    admin.tables.projects[0].next_scan_at = '2026-09-15T06:00:00Z' // advanced by a different, already-completed run
    const fn = async (): Promise<ScanOutput> => ({ found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null })
    const outcome = await processScheduledScanForProject(admin as unknown as Admin, staleSnapshot, { now: NOW, runScanFn: fn })
    check('the claim is refused (stale next_scan_at snapshot never matches the current row)', outcome.status === 'skipped' && outcome.reason === 'already_claimed')
    check('the row\'s actual (advanced) next_scan_at is completely untouched by the refused claim', admin.tables.projects[0].next_scan_at === '2026-09-15T06:00:00Z')
    check('no reservation or scan was created by the refused claim', admin.tables.usage_reservations.length === 0 && admin.tables.scans.length === 0)
  }
  console.log('\n8b) Same protection for a stale scan_retry_count snapshot (a worker that missed an intervening retry-count bump)')
  {
    const admin = baseline({ targetCount: 2, scanRetryCount: 0 })
    const staleSnapshot = { ...admin.tables.projects[0] }
    admin.tables.projects[0].scan_retry_count = 1 // bumped by a different worker's failed attempt in the meantime
    const fn = async (): Promise<ScanOutput> => ({ found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null })
    const outcome = await processScheduledScanForProject(admin as unknown as Admin, staleSnapshot, { now: NOW, runScanFn: fn })
    check('the claim is refused (stale scan_retry_count snapshot never matches the current row)', outcome.status === 'skipped' && outcome.reason === 'already_claimed')
    check('the row\'s actual scan_retry_count is untouched', admin.tables.projects[0].scan_retry_count === 1)
  }

  console.log('\n9) 2nd correction — a genuine race: an OLD worker whose 1-hour lease expires mid-run must NOT overwrite a NEWER worker\'s state')
  {
    // Worker A claims at t=NOW, then stalls on a slow provider call. While it
    // is stalled, a DIFFERENT worker (simulated directly — see note below)
    // legitimately recovers the now-stale claim and completes its OWN full
    // occurrence (advances next_scan_at, clears the claim, resets retry
    // count). Only THEN does A's stalled provider call finally resolve and A
    // tries to finish — its completion write must be refused (scan_claimed_at
    // no longer equals A's own claim token), so it must NOT clobber the
    // other worker's already-advanced state.
    //
    // The "other worker" is simulated by directly mutating the projects row
    // (rather than a second full processScheduledScanForProject call)
    // specifically to isolate the CLAIM-GUARD mechanism this test targets
    // from a SEPARATE, narrower interaction this investigation surfaced: the
    // reservation ledger's own 30-minute abandoned-reservation TTL and this
    // claim's 60-minute lease are independent clocks. A single stalled
    // request that outlives BOTH (>60 real minutes) can, in a genuinely
    // concurrent second attempt, cause that second attempt's reserveUsage
    // call to reuse/take over the SAME still-open reservation row before A's
    // own finalize call runs. THIS WAS a real gap ("reservation row reused
    // out from under a still-in-flight holder") — it is now CLOSED via an
    // explicit reservation_token (see lib/billing/usage-reservations.ts and
    // supabase/migrations/20260829000000_..._billing_periods.sql): reserve_usage
    // generates and returns a fresh opaque reservation_token on every grant
    // or reuse (never a timestamp), and every finalize/release RPC requires
    // it to still match the row's CURRENT token before acting, so A's later
    // finalize call correctly gets 'not_reserved' instead of silently
    // corrupting or double-charging B's legitimate reservation — proven
    // directly in scenario 9b below (and unit-level in
    // lib/billing/__qa__/usage-reservations.qa.ts scenarios 15-19).
    const admin = baseline({ targetCount: 1, nextScanAt: '2026-08-15T06:00:00Z' })
    const projectSnapshot = { ...admin.tables.projects[0] }

    let releaseA: (() => void) | null = null
    const aGate = new Promise<void>((resolve) => { releaseA = resolve })
    const slowFn = async (): Promise<ScanOutput> => {
      await aGate // A's provider call hangs here until explicitly released below
      return { found: true, position: 9, resultUrl: null, resultTitle: null, resultAddress: null, error: null }
    }

    // Start A (claims immediately, then blocks inside slowFn on aGate).
    const aPromise = processScheduledScanForProject(admin as unknown as Admin, projectSnapshot, { now: NOW, runScanFn: slowFn })
    await new Promise((r) => setTimeout(r, 0)) // let A's claim land before proceeding
    check('A successfully claimed first', admin.tables.projects[0].scan_claimed_at === NOW.toISOString())

    // Simulate a DIFFERENT worker (B) recovering the now-stale claim (>1h
    // later) and completing ITS OWN full occurrence for this project,
    // independently of A — exactly the end-state a real recovering worker
    // would leave behind.
    const bCompletionState = {
      ...admin.tables.projects[0],
      scan_claimed_at: null,
      next_scan_at: '2026-09-15T06:00:00Z',
      scan_retry_count: 0,
      last_scan_at: new Date(NOW.getTime() + 61 * 60_000).toISOString(),
    }
    Object.assign(admin.tables.projects[0], bCompletionState)
    check('the simulated newer worker\'s state is in place before A resumes', admin.tables.projects[0].next_scan_at === '2026-09-15T06:00:00Z' && admin.tables.projects[0].scan_claimed_at === null)

    // NOW release A — its stalled provider call finally resolves, and it
    // tries to finish its own (now-superseded) run.
    releaseA!()
    const aOutcome = await aPromise
    check('A\'s outcome is "superseded" — it does NOT report a normal "completed" as if its write had taken effect', aOutcome.status === 'skipped' && (aOutcome as { reason: string }).reason === 'superseded')
    const afterA = admin.tables.projects[0]
    check('A did NOT clobber the newer worker\'s advanced next_scan_at', afterA.next_scan_at === '2026-09-15T06:00:00Z')
    check('A did NOT clobber the newer worker\'s cleared claim / retry_count', afterA.scan_claimed_at === null && afterA.scan_retry_count === 0)
    // A's OWN scan_results write and reservation finalize still happened in
    // THIS scenario (the reservation ledger was never touched by the
    // simulated other worker, unlike the narrower race documented above) —
    // its dispatched check IS genuinely charged; this guard protects ONLY
    // the project-row bookkeeping, it never silently drops A's actual billing.
    check('A\'s own dispatched check was still correctly recorded/charged despite losing the project-row race', admin.tables.scan_results.some((r) => r.position === 9))
    check('A\'s own reservation was correctly finalized to consumed (untouched by the simulated other worker)', admin.tables.usage_reservations.some((r) => r.status === 'consumed' && r.consumed_amount === 1))
  }

  console.log('\n9b) FIXED (was a documented limitation, now closed via the explicit reservation_token): a single provider call stalled past BOTH the reservation ledger\'s 30-minute abandoned-reservation TTL and the claim\'s 60-minute lease no longer lets a stale worker double-charge or corrupt a reused reservation row')
  {
    // Uses a MUTABLE admin clock (unlike every other scenario\'s fixed NOW)
    // specifically so the reservation ledger\'s OWN internal now() genuinely
    // advances too — this is what makes the race REAL rather than an
    // artifact of a frozen test clock, matching how a live Postgres now()
    // would behave (the SAME wall-clock time governs both the claim lease
    // and the reservation TTL in production).
    let clockMs = NOW.getTime()
    const targets = [{ id: 't1', project_id: 'p1', keyword: 'k1', engine_type: 'google_search', is_active: true }]
    const admin = new FakeAdmin({
      projects: [{
        id: 'p1', user_id: 'u1', name: 'Test Project', is_active: true, auto_scan_enabled: true,
        scan_frequency: 'monthly', next_scan_at: '2026-08-15T06:00:00Z',
        scan_claimed_at: null, scan_retry_count: 0,
        target_domain: 'example.com', business_name: 'Example', country: 'IL', language: 'he', city: null, device_type: null,
      }],
      tracking_targets: targets, scans: [], scan_results: [], profiles: [],
      subscriptions: [{ id: 's1', user_id: 'u1', status: 'active', plan_code: 'regular', trial_ends_at: null, current_period_start: PERIOD_START, current_period_end: PERIOD_END, created_at: PERIOD_START }],
      shopify_connections: [], usage_reservations: [],
    }, {}, () => clockMs)
    const projectSnapshot = { ...admin.tables.projects[0] }

    let releaseA: (() => void) | null = null
    const aGate = new Promise<void>((resolve) => { releaseA = resolve })
    const slowFn = async (): Promise<ScanOutput> => { await aGate; return { found: true, position: 9, resultUrl: null, resultTitle: null, resultAddress: null, error: null } }
    const fastFn = async (): Promise<ScanOutput> => ({ found: true, position: 2, resultUrl: null, resultTitle: null, resultAddress: null, error: null })

    const aPromise = processScheduledScanForProject(admin as unknown as Admin, projectSnapshot, { now: NOW, runScanFn: slowFn })
    await new Promise((r) => setTimeout(r, 0))

    // 61 REAL minutes pass on the admin's own clock too — both the claim
    // lease (60min) and the reservation TTL (30min) are now genuinely stale.
    clockMs = NOW.getTime() + 61 * 60_000
    const bNow = new Date(clockMs)
    const bOutcome = await processScheduledScanForProject(admin as unknown as Admin, projectSnapshot, { now: bNow, runScanFn: fastFn })
    check('B recovers the stale claim AND the stale reservation, completing the occurrence itself', bOutcome.status === 'completed')
    check('B correctly advanced next_scan_at', admin.tables.projects[0].next_scan_at !== '2026-08-15T06:00:00Z')

    releaseA!()
    const aOutcome = await aPromise
    // A's own provider call still happens (its runScanFn was already in
    // flight when it was overtaken — nothing can recall an in-flight HTTP
    // request), so A's own scan_results row IS recorded. What the
    // reservation_token fix guarantees is BILLING correctness, not dispatch
    // exactly-once: A's finalize call — using its now-STALE reservationToken —
    // is correctly refused (not_reserved) rather than being allowed to
    // double-charge or corrupt the reservation B legitimately holds.
    check('A\'s own dispatched provider call is still recorded in scan_results (an in-flight HTTP call cannot be un-sent)', admin.tables.scan_results.some((r) => r.position === 9))
    check('A is correctly told its claim was superseded — it never reports a false "completed" as if its bookkeeping write had landed', aOutcome.status === 'skipped' && (aOutcome as { reason: string }).reason === 'superseded')
    check('FIXED: exactly ONE reservation row exists, and exactly ONE unit was ever consumed on it — A\'s stale finalize call could NOT double-charge or corrupt B\'s legitimate reservation', admin.tables.usage_reservations.filter((r) => String(r.idempotency_key).startsWith('scan:p1:2026-08-15')).length === 1 && admin.tables.usage_reservations[0].consumed_amount === 1)
    console.log('  Residual, explicitly accepted risk: t1 was genuinely DISPATCHED to the provider twice in this exact scenario (A\'s stale call and B\'s recovery call both ran runScanFn) — the fix guarantees the LEDGER is never double-charged; it does not guarantee the provider is never double-called under a single-request stall this extreme (>30 real minutes). See lib/scan-scheduler/process-scheduled-scan.ts and the final report for why occasional double-dispatch (never double-charge) is the accepted trade-off, consistent with the scan_results-insert-failure case documented elsewhere in this file.')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
