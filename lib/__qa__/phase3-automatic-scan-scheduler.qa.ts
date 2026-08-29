/**
 * Phase 3 (review correction) — automatic monthly scan scheduler
 * (lib/scan-scheduler/process-scheduled-scan.ts, called by
 * app/api/schedule/route.ts): source-contract proof of the
 * occurrence/attempt/retry/quota-gating design, complementing the REAL
 * behavioral proof in
 * lib/scan-scheduler/__qa__/process-scheduled-scan.qa.ts (which exercises
 * the actual function against the FakeAdmin RPC simulation — this file
 * alone is NOT sufficient proof of the charging contract, per review). Run:
 *   npx tsx lib/__qa__/phase3-automatic-scan-scheduler.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

async function main() {
  console.log('Phase 3 — automatic monthly scan scheduler source-contract QA\n')
  const src = strip(read('lib/scan-scheduler/process-scheduled-scan.ts'))

  console.log('1) Same server-side entitlement guard as manual scans')
  {
    check('imports getUserEntitlement (the same entitlement resolver /api/scan uses)', /import\s*\{\s*getUserEntitlement\s*\}\s*from\s*'@\/lib\/subscription'/.test(src))
    check('imports the SAME reserveUsage/finalizeUsageReservation used by manual scans', /reserveUsage, finalizeUsageReservation/.test(src))
    check('imports resolveCurrentUsagePeriod (the shared billing-period resolver)', /resolveCurrentUsagePeriod/.test(src))
  }

  console.log('\n2) Required checks are calculated and reserved BEFORE any provider call')
  {
    const reserveIdx = src.indexOf('await reserveUsage(')
    const runScanIdx = src.indexOf('await runScanFn(')
    check('reserveUsage(...) is called', reserveIdx !== -1)
    check('runScan(...) is called', runScanIdx !== -1)
    check('reserveUsage happens BEFORE runScan in source order', reserveIdx !== -1 && runScanIdx !== -1 && reserveIdx < runScanIdx)
  }

  console.log('\n3) Provider is NEVER called when the allowance is insufficient — a quota_exceeded outcome short-circuits before the scan loop')
  {
    const quotaExceededIdx = src.indexOf("reservation.outcome === 'quota_exceeded'")
    const runScanIdx = src.indexOf('await runScanFn(')
    check("reservation.outcome === 'quota_exceeded' branch exists", quotaExceededIdx !== -1)
    check('the quota_exceeded branch appears BEFORE the runScan call (i.e. it continues/exits first)', quotaExceededIdx !== -1 && quotaExceededIdx < runScanIdx)
    check('quota_exceeded writes an explicit scans row with status quota_exceeded (never a partial/incomplete result)', /status: 'quota_exceeded'/.test(src))
    check('no provider call happens on the quota_exceeded path — returns before the for(target of remainingTargets) loop', /quota_exceeded[\s\S]{0,400}return \{ status: 'quota_exceeded' \}/.test(src))
  }

  console.log('\n4) Only the checks actually dispatched are consumed — finalizeUsageReservation runs after the loop with the real dispatched count')
  {
    check('a dispatchedCount counter exists', /dispatchedCount/.test(src))
    check('dispatchedCount is incremented immediately before runScan (the actual dispatch point)', /dispatchedCount\+\+[\s\S]{0,80}await runScanFn\(/.test(src))
    check('finalizeUsageReservation is called with consumed: dispatchedCount on the success path', /consumed: dispatchedCount/.test(src))
  }

  console.log('\n5) Occurrence identity is stable; ATTEMPT identity is distinct per retry (review correction)')
  {
    check('an occurrenceAnchor is captured from next_scan_at BEFORE any mutation', /occurrenceAnchor = project\.next_scan_at/.test(src))
    check('an attemptNumber is derived from scan_retry_count (distinct per retry)', /attemptNumber = project\.scan_retry_count/.test(src))
    check('the idempotency key incorporates BOTH the stable occurrence anchor AND the distinct attempt number', /idempotencyKey = `scan:\$\{project\.id\}:\$\{occurrenceAnchor\}:attempt\$\{attemptNumber\}`/.test(src))
    check('an atomic claim (scan_claimed_at) guards against overlapping cron runs processing the same project simultaneously', /scan_claimed_at: claimToken/.test(src) && /scan_claimed_at\.is\.null,scan_claimed_at\.lt\./.test(src))
    check('2nd correction — the claim ALSO requires the EXPECTED scan_retry_count (never claims a stale attempt)', /\.eq\('scan_retry_count', attemptNumber\)/.test(src))
    check('2nd correction — the claim ALSO requires the EXPECTED next_scan_at (or IS NULL) — never claims the next occurrence using a stale value', /\.eq\('next_scan_at', project\.next_scan_at\)/.test(src) && /\.is\('next_scan_at', null\)/.test(src))
    check('2nd correction — processing continues only if exactly one row was returned (maybeSingle + truthy check)', /const \{ data: claimed \} = await claimQuery\.select\('id'\)\.maybeSingle\(\)/.test(src) && /if \(!claimed\) \{/.test(src))
    check('2nd correction — every subsequent project-row write is ALSO conditioned on THIS worker\'s own claimToken (stale worker after lease expiry cannot clobber a newer worker\'s state)', /guardedProjectUpdate = \(payload: Record<string, unknown>\) =>[\s\S]{0,120}\.eq\('scan_claimed_at', claimToken\)/.test(src))
    check('an already_reserved outcome (genuinely concurrent run) is handled as a safe skip, not an error', /already_reserved[\s\S]{0,400}in_progress_elsewhere/.test(src))
    check('the scans row is REUSED across attempts (never re-created) by looking up an existing running scan first', /eq\('status', 'running'\)/.test(src))
    check('only targets with NO scan_results row yet are treated as remaining (never re-dispatch an already-consumed check)', /remainingTargets = targets\.filter/.test(src))
    check('the reservation amount is the REMAINING count, not the original full batch size', /amount: remainingTargets\.length/.test(src))
  }

  console.log('\n6) A transient failure retries the SAME occurrence (bounded), a permanent quota/success outcome advances next_scan_at')
  {
    check('MAX_SCAN_RETRIES constant bounds the retry budget', /const MAX_SCAN_RETRIES = 3/.test(src))
    check('a retry increments scan_retry_count', /scan_retry_count: retryCount/.test(src))
    check('exhausting the retry budget advances next_scan_at (gives up on the occurrence rather than retrying forever)', /retryCount >= MAX_SCAN_RETRIES[\s\S]{0,1000}next_scan_at:/.test(src))
    {
      // The retry (below-cap) path is the code between the max-retries
      // `if` block's closing brace and the `return { status: 'will_retry' }`
      // statement — an early-return structure, not an else block.
      const giveUpBlockEnd = src.indexOf("return { status: 'failed_max_retries'")
      const willRetryIdx = src.indexOf("return { status: 'will_retry'")
      const retryBranch = src.slice(giveUpBlockEnd, willRetryIdx)
      check('a transient failure (below the retry cap) leaves next_scan_at UNTOUCHED (same occurrence retried tomorrow)',
        /scan_claimed_at: null, scan_retry_count: retryCount \}\)/.test(retryBranch) && !/next_scan_at:/.test(retryBranch))
    }
    check('success advances next_scan_at via calculateNextScanDate', /const nextScanAt = calculateNextScanDate\(project\.scan_frequency, now\)/.test(src))
  }

  console.log('\n7) Review correction — a transient/crash failure consumes exactly what THIS ATTEMPT dispatched (0 -> full release, >0 -> partial consume), NEVER a blanket release when checks were already dispatched')
  {
    const catchBlockIdx = src.indexOf('} catch (err) {')
    const finalizeInCatchIdx = src.indexOf('await finalizeUsageReservation(admin, {\n        reservationId, userId: project.user_id, reservationToken, consumed: dispatchedCount,', catchBlockIdx)
    check('the catch block calls finalizeUsageReservation with consumed: dispatchedCount (never a blanket releaseUsageReservation)', catchBlockIdx !== -1 && finalizeInCatchIdx > catchBlockIdx)
    check('the catch block never calls releaseUsageReservation unconditionally', !/await releaseUsageReservation\(admin, \{ reservationId, userId: project\.user_id, reason: `transient_error/.test(src))
    check('releaseUsageReservation is not even imported (finalizeUsageReservation subsumes the release case via consumed:0)', !/releaseUsageReservation/.test(src))
  }

  console.log('\n8) Distinct, auditable statuses for completed / failed / skipped / quota_exceeded runs')
  {
    check("'quota_exceeded' status recorded", /status: 'quota_exceeded'/.test(src))
    check("'failed_max_retries' status recorded", /'failed_max_retries'/.test(src))
    check("'will_retry' status recorded", /'will_retry'/.test(src))
    check("'already_claimed' / 'in_progress_elsewhere' / 'already_completed' skip statuses recorded", /'already_claimed'/.test(src) && /'in_progress_elsewhere'/.test(src) && /'already_completed'/.test(src))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
